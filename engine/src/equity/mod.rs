//! Unbiased draw-without-replacement Monte Carlo sampler for two known hands.
use crate::evaluator;

pub mod weighted;
use std::cmp::Ordering;

struct XorShift64(u64);
impl XorShift64 {
    fn new(seed: u64) -> Self { Self(if seed == 0 { 0x9e3779b97f4a7c15 } else { seed }) }
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn below(&mut self, upper: usize) -> usize { (self.next() % upper as u64) as usize }

}

/// Hero-vs-weighted-range equity. Exact on river, seeded on flop and turn.
/// Stable public Rust API maintained for existing browser Worker clients.
pub fn monte_carlo_vs_range(
    hero: &[u8], board: &[u8], villain_pairs: &[u8],
    weights: &[f64], iterations: u32, seed: u64,
) -> Result<Vec<f64>, &'static str> {
    weighted::weighted_equity(hero, board, villain_pairs, weights, iterations, seed)
}

pub fn monte_carlo(holes: &[u8], board: &[u8], iterations: u32, seed: u64) -> Result<Vec<f64>, &'static str> {
    if holes.len() != 4 || board.len() > 5 || iterations == 0 { return Err("Invalid equity input"); }
    let mut known = holes.to_vec();
    known.extend_from_slice(board);
    // Known cards can be four to nine cards. Validate independently from score() (5..=7).
    let mut seen = [false; 52];
    for &card in &known {
        let rank = card & 0x0f;
        let suit = card >> 4;
        if !(2..=14).contains(&rank) || suit > 3 { return Err("Invalid card"); }
        let index = suit as usize * 13 + (rank - 2) as usize;
        if seen[index] { return Err("Duplicate card"); }
        seen[index] = true;
    }
    let deck: Vec<u8> = (0..4).flat_map(|suit| (2..=14).map(move |rank| rank | (suit << 4)))
        .filter(|card| !known.contains(card)).collect();
    let missing = 5 - board.len();
    let mut rng = XorShift64::new(seed);
    let mut outcomes = [0u64; 3];
    let mut draw = deck.clone();
    // Reuse fixed 7-card hands to avoid two allocations per simulation.
    let mut first = [0u8; 7];
    let mut second = [0u8; 7];
    first[..2].copy_from_slice(&holes[..2]);
    second[..2].copy_from_slice(&holes[2..]);
    let board_end = 2 + board.len();
    first[2..board_end].copy_from_slice(board);
    second[2..board_end].copy_from_slice(board);
    let sample_count = if missing == 0 { 1 } else { iterations };
    for _ in 0..sample_count {
        draw.copy_from_slice(&deck);
        for index in 0..missing {
            let choice = index + rng.below(draw.len() - index);
            draw.swap(index, choice);
        }
        first[board_end..].copy_from_slice(&draw[..missing]);
        second[board_end..].copy_from_slice(&draw[..missing]);
        let score_a = evaluator::score(&first)?;
        let score_b = evaluator::score(&second)?;
        match evaluator::compare(&score_a, &score_b) {
            Ordering::Greater => outcomes[0] += 1,
            Ordering::Equal => outcomes[1] += 1,
            Ordering::Less => outcomes[2] += 1
        }
    }
    Ok(outcomes.map(|value| value as f64 / sample_count as f64).to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_weighted_river_with_blockers() {
        // Hero makes a royal flush. The second villain combo overlaps hero and is excluded.
        let hero = [0x0e, 0x23];  // A clubs, 3 hearts
        let board = [0x0d, 0x0c, 0x0b, 0x0a, 0x02]; // K,Q,J,T,2 clubs
        let range = [0x12, 0x14, 0x0e, 0x32];
        let probabilities = monte_carlo_vs_range(&hero, &board, &range, &[1., 10.], 10, 12).unwrap();
        assert_eq!(probabilities, vec![1., 0., 0.]);
    }
    #[test]
    fn seeded_flop_range_is_deterministic_and_normalized() {
        let hero = [0x0e, 0x1e];
        let board = [0x02, 0x13, 0x24];
        let range = [0x0d, 0x1d, 0x03, 0x14, 0x34, 0x35];
        let weights = [1., 2., 5.];
        let a = monte_carlo_vs_range(&hero, &board, &range, &weights, 500, 123).unwrap();
        let b = monte_carlo_vs_range(&hero, &board, &range, &weights, 500, 123).unwrap();
        assert_eq!(a,b);
        assert!(a.iter().all(|x| (0.0..=1.0).contains(x)));
        assert!((a.iter().sum::<f64>() - 1.0).abs() < 1e-12);
    }
    #[test]
    fn invalid_ranges_or_duplicate_cards_are_rejected() {
        assert!(monte_carlo_vs_range(&[0x0e,0x0e], &[0x02,0x13,0x24], &[0x03,0x14], &[1.], 10, 1).is_err());
        assert!(monte_carlo_vs_range(&[0x0e,0x1e], &[0x02,0x13,0x24], &[0x0e,0x14], &[1.], 10, 1).is_err());
        assert!(monte_carlo_vs_range(&[0x0e,0x1e], &[0x02,0x13,0x24], &[0x03,0x14], &[-1.], 10, 1).is_err());
    }

    #[test]
    fn deterministic_split_pot() {
        let board = [0x0e,0x0d,0x0c,0x0b,0x0a];
        let result = monte_carlo(&[0x12,0x13,0x22,0x23], &board, 100, 11).unwrap();
        assert_eq!(result,vec![0.,1.,0.]);
    }
    #[test]
    fn each_board_length_produces_valid_equity() {
        let holes = [0x0e, 0x0d, 0x1e, 0x1d];
        let board = [0x02, 0x13, 0x24, 0x35, 0x06];
        for count in 0..=5 {
            for seed in [1, 17, 381, 1024] {
                let result = monte_carlo(&holes, &board[..count], 64, seed).unwrap();
                assert!(result.iter().all(|value| value.is_finite() && (0.0..=1.0).contains(value)));
                assert!((result.iter().sum::<f64>() - 1.0).abs() < 1e-12);
            }
        }
    }

}

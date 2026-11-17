//! Unbiased draw-without-replacement Monte Carlo sampler for two known hands.
use crate::evaluator;
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
#[inline]
    fn uniform(&mut self) -> f64 { ((self.next() >> 11) as f64) * (1.0 / 9_007_199_254_740_992.0) }

}

/// A prefiltered, weighted opponent hand. Its runout deck is built only once.
struct RangeOpponent {
    cards: [u8; 2],
    cumulative: f64,
    weight: f64,
    deck: Vec<u8>,
}
#[inline]
fn valid_packed(card: u8) -> bool {
    (2..=14).contains(&(card & 0x0f)) && (card >> 4) < 4
}

/// Equity of a known hero hand versus an arbitrary weighted villain range.
/// Illegal overlapping combos are removed, then all legal runouts are sampled
/// without replacement. River is enumerated exactly, with no MC noise.
///
/// Returns [win probability, tie probability, loss probability].
pub fn monte_carlo_vs_range(
    hero: &[u8], board: &[u8], villain_pairs: &[u8],
    weights: &[f64], iterations: u32, seed: u64,
) -> Result<Vec<f64>, &'static str> {
    if hero.len() != 2 || !(3..=5).contains(&board.len()) ||
       villain_pairs.len() != weights.len().saturating_mul(2) ||
       villain_pairs.is_empty() || iterations == 0 {
        return Err("Invalid equity range input");
    }
    let mut seen = [false; 52];
    for &card in hero.iter().chain(board.iter()) {
        if !valid_packed(card) { return Err("Invalid card"); }
        let key = (card >> 4) as usize * 13 + ((card & 0x0f) - 2) as usize;
        if seen[key] { return Err("Duplicate card"); }
        seen[key] = true;
    }
    // The range can be large, but is prefiltered once instead of on every sample.
    let full_deck: Vec<u8> = (0..4).flat_map(|suit| (2..=14).map(move |rank| rank | (suit << 4)))
        .filter(|card| !seen[(*card >> 4) as usize * 13 + ((*card & 0x0f) - 2) as usize]).collect();
    let mut opponents = Vec::with_capacity(weights.len());
    let mut total_weight = 0.0_f64;
    for (pair, &weight) in villain_pairs.chunks_exact(2).zip(weights.iter()) {
        if !weight.is_finite() || weight < 0.0 { return Err("Invalid range weight"); }
        let (a, b) = (pair[0], pair[1]);
        if !valid_packed(a) || !valid_packed(b) || a == b { return Err("Invalid opponent combo"); }
        if weight == 0.0 { continue; }
        let ai = (a >> 4) as usize * 13 + ((a & 0x0f) - 2) as usize;
        let bi = (b >> 4) as usize * 13 + ((b & 0x0f) - 2) as usize;
        if seen[ai] || seen[bi] { continue; }
        total_weight += weight;
        if !total_weight.is_finite() { return Err("Range weight overflow"); }
        opponents.push(RangeOpponent {
            cards: [a, b], cumulative: total_weight, weight,
            deck: full_deck.iter().copied().filter(|&card| card != a && card != b).collect(),
        });
    }
    if opponents.is_empty() { return Err("No legal opponent combos"); }
    let missing = 5usize - board.len();
    let mut hand_a = [0u8; 7];
    let mut hand_b = [0u8; 7];
    hand_a[0..2].copy_from_slice(hero);
    hand_a[2..2 + board.len()].copy_from_slice(board);
    hand_b[2..2 + board.len()].copy_from_slice(board);
    let mut outcomes = [0f64; 3];
    if missing == 0 {
        // Exact weighted river evaluation (unbiased, independent of iteration count).
        let first = evaluator::score(&hand_a)?;
        for villain in &opponents {
            hand_b[..2].copy_from_slice(&villain.cards);
            let second = evaluator::score(&hand_b)?;
            match evaluator::compare(&first, &second) {
                Ordering::Greater => outcomes[0] += villain.weight,
                Ordering::Equal => outcomes[1] += villain.weight,
                Ordering::Less => outcomes[2] += villain.weight,
            }
        }
        return Ok(outcomes.iter().map(|value| value / total_weight).collect());
    }
    let mut rng = XorShift64::new(seed);
    for _ in 0..iterations {
        let threshold = rng.uniform() * total_weight;
        // CDF lookup: single binary search rather than scanning each combo.
        let index = opponents.partition_point(|item| item.cumulative <= threshold)
            .min(opponents.len() - 1);
        let villain = &opponents[index];
        hand_b[..2].copy_from_slice(&villain.cards);
        let deck = &villain.deck;
        let a = rng.below(deck.len());
        hand_a[2 + board.len()] = deck[a];
        hand_b[2 + board.len()] = deck[a];
        if missing == 2 {
            let mut b = rng.below(deck.len() - 1);
            if b >= a { b += 1; }
            hand_a[6] = deck[b];
            hand_b[6] = deck[b];
        }
        let first = evaluator::score(&hand_a)?;
        let second = evaluator::score(&hand_b)?;
        match evaluator::compare(&first, &second) {
            Ordering::Greater => outcomes[0] += 1.0,
            Ordering::Equal => outcomes[1] += 1.0,
            Ordering::Less => outcomes[2] += 1.0
        }
    }
    Ok(outcomes.iter().map(|value| value / iterations as f64).collect())
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

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
    let sample_count = if missing == 0 { 1 } else { iterations };
    for _ in 0..sample_count {
        draw.copy_from_slice(&deck);
        for index in 0..missing {
            let choice = index + rng.below(draw.len() - index);
            draw.swap(index, choice);
        }
        let mut first = Vec::with_capacity(7);
        first.extend_from_slice(&holes[..2]);
        first.extend_from_slice(board);
        first.extend_from_slice(&draw[..missing]);
        let mut second = Vec::with_capacity(7);
        second.extend_from_slice(&holes[2..]);
        second.extend_from_slice(board);
        second.extend_from_slice(&draw[..missing]);
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
    fn deterministic_split_pot() {
        let board = [0x0e,0x0d,0x0c,0x0b,0x0a];
        let result = monte_carlo(&[0x12,0x13,0x22,0x23], &board, 100, 11).unwrap();
        assert_eq!(result,vec![0.,1.,0.]);
    }
}

//! Blocker-aware, weighted hero-vs-range equity for postflop (flop/turn/river).
//! River results are enumerated exactly; flop and turn use seeded Monte Carlo.
//! Arrays are allocated once per range, not for every sampled seven-card hand.
use crate::evaluator;
use std::cmp::Ordering;

#[derive(Clone)]
struct Combo {
    cards: [u8; 2],
    cumulative: f64,
    // Runout deck is independent of other sampled opponent combinations.
    deck: [u8; 45],
    deck_len: usize,
}

struct Random(u64);
impl Random {
    fn new(seed: u64) -> Self {
        Self(if seed == 0 { 0x9e3779b97f4a7c15 } else { seed })
    }
    #[inline]
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    // Rejection sampling avoids modulo bias when drawing a card index.
    #[inline]
    fn below(&mut self, upper: usize) -> usize {
        let size = upper as u64;
        let zone = u64::MAX - (u64::MAX % size);
        loop {
            let value = self.next();
            if value < zone { return (value % size) as usize; }
        }
    }
    #[inline]
    fn fraction(&mut self) -> f64 {
        (self.next() >> 11) as f64 * (1.0 / ((1u64 << 53) as f64))
    }
}

#[inline]
fn card_bit(card: u8) -> Result<u64, &'static str> {
    let rank = card & 0x0f;
    let suit = card >> 4;
    if !(2..=14).contains(&rank) || suit > 3 { return Err("Invalid card"); }
    Ok(1u64 << (u32::from(suit) * 13 + u32::from(rank - 2)))
}

fn unique_known(cards: &[u8]) -> Result<u64, &'static str> {
    let mut mask = 0;
    for &card in cards {
        let bit = card_bit(card)?;
        if mask & bit != 0 { return Err("Duplicate known card"); }
        mask |= bit;
    }
    Ok(mask)
}

/// Return [win probability, tie probability, loss probability] for one known
/// hero hand against a weighted two-card opponent range. Combinations blocked
/// by hero or board are removed and remaining weights are renormalized.
///
/// Input encoding: 2 hero cards, 3..5 board cards, flattened opponent pairs
/// [c1,c2,c1,c2,...] with one nonnegative weight per pair.
/// Board complete: exact weighted enumeration (iterations ignored).
/// Otherwise: independent, seeded weighted-range and uniform-runout sampling.
pub fn weighted_equity(
    hero: &[u8],
    board: &[u8],
    opponents: &[u8],
    weights: &[f64],
    iterations: u32,
    seed: u64,
) -> Result<Vec<f64>, &'static str> {
    if hero.len() != 2 || !(3..=5).contains(&board.len())
        || weights.is_empty()
        || weights.len().checked_mul(2) != Some(opponents.len())
        || iterations == 0
    {
        return Err("Invalid weighted equity shape");
    }
    let mut fixed = Vec::with_capacity(2 + board.len());
    fixed.extend_from_slice(hero);
    fixed.extend_from_slice(board);
    let known_mask = unique_known(&fixed)?;
    let mut max_weight = 0.0_f64;
    for &weight in weights {
        if !weight.is_finite() || weight < 0.0 { return Err("Invalid opponent weight"); }
        max_weight = max_weight.max(weight);
    }
    if max_weight == 0.0 { return Err("Opponent range is empty"); }

    let missing = 5 - board.len();
    let mut combos: Vec<Combo> = Vec::with_capacity(weights.len());
    let mut weight_sum = 0.0;
    for (pair, &weight) in opponents.chunks_exact(2).zip(weights.iter()) {
        let first_bit = card_bit(pair[0])?;
        let second_bit = card_bit(pair[1])?;
        if first_bit == second_bit { return Err("Duplicate opponent card"); }
        // Blockers do not invalidate the range; they make a combo ineligible.
        if weight == 0.0 || ((first_bit | second_bit) & known_mask) != 0 { continue; }
        let scaled = weight / max_weight;
        weight_sum += scaled;
        let mut deck = [0u8; 45];
        let mut deck_len = 0;
        if missing > 0 {
            let excluded = known_mask | first_bit | second_bit;
            for suit in 0u8..4 {
                for rank in 2u8..=14 {
                    let card = rank | (suit << 4);
                    if card_bit(card)? & excluded == 0 {
                        deck[deck_len] = card;
                        deck_len += 1;
                    }
                }
            }
            if deck_len < missing { return Err("Insufficient runout cards"); }
        }
        combos.push(Combo {
            cards: [pair[0], pair[1]],
            cumulative: weight_sum,
            deck,
            deck_len,
        });
    }
    if combos.is_empty() || weight_sum <= 0.0 {
        return Err("Opponent range fully blocked");
    }

    let mut hero_seven = [0u8; 7];
    let mut villain_seven = [0u8; 7];
    hero_seven[..2].copy_from_slice(hero);
    let board_end = board.len() + 2;
    hero_seven[2..board_end].copy_from_slice(board);
    villain_seven[2..board_end].copy_from_slice(board);
    let mut outcomes = [0.0f64; 3];

    if missing == 0 {
        let hero_score = evaluator::score(&hero_seven)?;
        for (index, combo) in combos.iter().enumerate() {
            villain_seven[..2].copy_from_slice(&combo.cards);
            let villain_score = evaluator::score(&villain_seven)?;
            let previous = if index == 0 { 0.0 } else { combos[index - 1].cumulative };
            let weight = combo.cumulative - previous;
            let category = match evaluator::compare(&hero_score, &villain_score) {
                Ordering::Greater => 0,
                Ordering::Equal => 1,
                Ordering::Less => 2,
            };
            outcomes[category] += weight;
        }
        return Ok(outcomes.map(|value| value / weight_sum).to_vec());
    }

    let mut random = Random::new(seed);
    let mut draw = [0u8; 45];
    for _ in 0..iterations {
        let needle = random.fraction() * weight_sum;
        let index = combos.partition_point(|combo| combo.cumulative <= needle)
            .min(combos.len() - 1);
        let combo = &combos[index];
        villain_seven[..2].copy_from_slice(&combo.cards);

        draw[..combo.deck_len].copy_from_slice(&combo.deck[..combo.deck_len]);
        for offset in 0..missing {
            let picked = offset + random.below(combo.deck_len - offset);
            draw.swap(offset, picked);
        }
        hero_seven[board_end..].copy_from_slice(&draw[..missing]);
        villain_seven[board_end..].copy_from_slice(&draw[..missing]);

        let hero_score = evaluator::score(&hero_seven)?;
        let villain_score = evaluator::score(&villain_seven)?;
        let category = match evaluator::compare(&hero_score, &villain_score) {
            Ordering::Greater => 0,
            Ordering::Equal => 1,
            Ordering::Less => 2,
        };
        outcomes[category] += 1.0;
    }
    Ok(outcomes.map(|value| value / iterations as f64).to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_river_uses_normalized_combo_weights_and_blockers() {
        // AhAs against KcKd (hero wins) or 5c6d (villain makes a straight).
        let hero = [0x2e, 0x3e];
        let board = [0x02, 0x13, 0x24, 0x37, 0x09];
        let opponents = [0x0d, 0x1d, 0x05, 0x16, 0x2e, 0x1e];
        let result = weighted_equity(&hero, &board, &opponents,
            &[1.0, 3.0, 100.0], 500, 18).unwrap();
        assert!((result[0] - 0.25).abs() < 1e-12, "{result:?}");
        assert_eq!(result[1], 0.0);
        assert!((result[2] - 0.75).abs() < 1e-12, "{result:?}");
        assert_eq!(result,
            weighted_equity(&hero, &board, &opponents, &[1.0, 3.0, 100.0], 1, 1999).unwrap());
    }
    #[test]
    fn flopped_royal_board_is_always_a_tie() {
        let result = weighted_equity(&[0x02, 0x13],
            &[0x3e, 0x3d, 0x3c, 0x3b, 0x3a],
            &[0x04, 0x15, 0x06, 0x17], &[1.0, 5.0], 20, 123).unwrap();
        assert_eq!(result, vec![0.0, 1.0, 0.0]);
    }
    #[test]
    fn flop_and_turn_are_seeded_and_valid() {
        let hero = [0x0e, 0x1e];
        let villain = [0x02, 0x13, 0x03, 0x14, 0x04, 0x15];
        let weights = [0.1, 0.3, 0.6];
        for board in [&[0x22, 0x33, 0x07][..], &[0x22, 0x33, 0x07, 0x18][..]] {
            let first = weighted_equity(&hero, board, &villain, &weights, 2000, 12345).unwrap();
            let second = weighted_equity(&hero, board, &villain, &weights, 2000, 12345).unwrap();
            assert_eq!(first, second);
            assert!((first.iter().sum::<f64>() - 1.0).abs() < 1e-12);
        }
    }
    #[test]
    fn reject_invalid_input_or_all_blocked_combos() {
        assert!(weighted_equity(&[0x0e, 0x0e], &[0x02, 0x13, 0x24], &[0x03, 0x14], &[1.0], 20, 5).is_err());
        assert!(weighted_equity(&[0x0e, 0x1e], &[0x02, 0x13, 0x24], &[0x0e, 0x14], &[1.0], 20, 5).is_err());
        assert!(weighted_equity(&[0x0e, 0x1e], &[0x02, 0x13, 0x24], &[0x03, 0x14], &[f64::NAN], 20, 5).is_err());
        assert!(weighted_equity(&[0x0e, 0x1e], &[0x02, 0x13, 0x24], &[0x03, 0x14], &[0.0], 20, 5).is_err());
    }
}

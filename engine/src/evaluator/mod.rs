//! Allocation-free hot-path five-card hand ranking for packed cards.
//! Public scoring arrays retain exact V1 ordering, categories, and kickers.
use std::cmp::Ordering;

#[inline]
fn rank(card: u8) -> u8 { card & 0x0f }
#[inline]
fn suit(card: u8) -> u8 { card >> 4 }

pub fn validate(cards: &[u8]) -> Result<(), &'static str> {
    if !(5..=7).contains(&cards.len()) { return Err("Expected five to seven cards"); }
    let mut seen: u64 = 0;
    for &card in cards {
        let r = rank(card);
        let s = suit(card);
        if !(2..=14).contains(&r) || s > 3 { return Err("Invalid card"); }
        let bit = 1u64 << (u64::from(s) * 13 + u64::from(r - 2));
        if seen & bit != 0 { return Err("Duplicate card"); }
        seen |= bit;
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct HandScore {
    bytes: [u8; 6],
    len: usize,
}
impl HandScore {
    #[inline]
    fn new<const N: usize>(data: [u8; N]) -> Self {
        let mut bytes = [0; 6];
        bytes[..N].copy_from_slice(&data);
        Self { bytes, len: N }
    }
    #[inline]
    fn as_slice(&self) -> &[u8] { &self.bytes[..self.len] }
}

#[inline]
fn straight_high(values: &[u8; 5]) -> Option<u8> {
    let mut present = [false; 15];
    for &value in values { present[value as usize] = true; }
    if present[14] { present[1] = true; }
    for high in (5usize..=14).rev() {
        if (0..5).all(|offset| present[high - offset]) { return Some(high as u8); }
    }
    None
}

#[inline]
fn rank_five_inline(cards: &[u8; 5]) -> HandScore {
    let mut values = [0u8; 5];
    for (index, &card) in cards.iter().enumerate() { values[index] = rank(card); }
    values.sort_unstable_by(|a, b| b.cmp(a));
    let is_flush = cards.iter().all(|card| suit(*card) == suit(cards[0]));
    let straight = straight_high(&values);
    if is_flush {
        if let Some(high) = straight {
            return if high == 14 { HandScore::new([9, 14]) }
            else { HandScore::new([8, high]) };
        }
    }

    let mut counts = [0u8; 15];
    for &value in &values { counts[value as usize] += 1; }
    // There are at most five distinct ranks.  Keep the grouping on the stack
    // rather than collecting/sorting a Vec on every combination.
    let mut groups = [(0u8, 0u8); 5];
    let mut group_count = 0usize;
    for value in (2u8..=14).rev() {
        let count = counts[value as usize];
        if count > 0 {
            groups[group_count] = (value, count);
            group_count += 1;
        }
    }
    groups[..group_count].sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));

    if groups[0].1 == 4 { return HandScore::new([7, groups[0].0, groups[1].0]); }
    if groups[0].1 == 3 && groups[1].1 == 2 {
        return HandScore::new([6, groups[0].0, groups[1].0]);
    }
    if is_flush { return HandScore::new([5, values[0], values[1], values[2], values[3], values[4]]); }
    if let Some(high) = straight { return HandScore::new([4, high]); }
    if groups[0].1 == 3 {
        return HandScore::new([3, groups[0].0, groups[1].0, groups[2].0]);
    }
    if groups[0].1 == 2 && groups[1].1 == 2 {
        return HandScore::new([2, groups[0].0.max(groups[1].0), groups[0].0.min(groups[1].0), groups[2].0]);
    }
    if groups[0].1 == 2 {
        return HandScore::new([1, groups[0].0, groups[1].0, groups[2].0, groups[3].0]);
    }
    HandScore::new([0, values[0], values[1], values[2], values[3], values[4]])
}

/// Evaluate a validated seven-card hand directly from rank/suit bitmasks.
/// No 21-combination subset loop in the equity engine's hot path.
#[inline]
fn rank_seven_direct(cards: &[u8; 7]) -> HandScore {
    let mut ranks = [0u8; 15];
    let mut suit_counts = [0u8; 4];
    let mut suit_masks = [0u16; 4];
    let mut rank_mask = 0u16;
    for &card in cards {
        let r = rank(card) as usize;
        let s = suit(card) as usize;
        ranks[r] += 1;
        suit_counts[s] += 1;
        let bit = 1u16 << r;
        rank_mask |= bit;
        suit_masks[s] |= bit;
    }
    #[inline]
    fn straight(mask: u16) -> Option<u8> {
        let bits = if mask & (1 << 14) != 0 { mask | (1 << 1) } else { mask };
        (5u8..=14).rev().find(|&high| {
            ((bits >> (high - 4)) & 0b11111) == 0b11111
        })
    }
    let flush = suit_counts.iter().position(|&count| count >= 5);
    if let Some(s) = flush {
        if let Some(high) = straight(suit_masks[s]) {
            return if high == 14 { HandScore::new([9, 14]) }
                else { HandScore::new([8, high]) };
        }
    }
    let mut four = 0u8;
    let mut three = 0u8;
    let mut pairs = [0u8; 3];
    let mut pair_count = 0;
    for r in (2usize..=14).rev() {
        match ranks[r] {
            4 => four = r as u8,
            3 => {
                if three == 0 { three = r as u8; }
                else { pairs[pair_count] = r as u8; pair_count += 1; }
            }
            2 => { pairs[pair_count] = r as u8; pair_count += 1; }
            _ => {}
        }
    }
    if four != 0 {
        let kicker = (2usize..=14).rev()
            .find(|&r| r as u8 != four && ranks[r] > 0).unwrap() as u8;
        return HandScore::new([7, four, kicker]);
    }
    if three != 0 && pair_count > 0 {
        return HandScore::new([6, three, pairs[0]]);
    }
    if let Some(s) = flush {
        let mut result = [0u8; 6];
        result[0] = 5;
        let mut cursor = 1;
        for r in (2usize..=14).rev() {
            if suit_masks[s] & (1 << r) == 0 { continue; }
            result[cursor] = r as u8;
            cursor += 1;
            if cursor == 6 { break; }
        }
        return HandScore::new(result);
    }
    if let Some(high) = straight(rank_mask) {
        return HandScore::new([4, high]);
    }
    if three != 0 {
        let mut k = [0u8; 2];
        let mut cursor = 0;
        for r in (2usize..=14).rev() {
            if r as u8 == three || ranks[r] == 0 { continue; }
            k[cursor] = r as u8;
            cursor += 1;
            if cursor == 2 { break; }
        }
        return HandScore::new([3, three, k[0], k[1]]);
    }
    if pair_count >= 2 {
        let (high, low) = (pairs[0], pairs[1]);
        let kicker = (2usize..=14).rev()
            .find(|&r| r as u8 != high && r as u8 != low && ranks[r] > 0)
            .unwrap() as u8;
        return HandScore::new([2, high, low, kicker]);
    }
    if pair_count == 1 {
        let pair = pairs[0];
        let mut k = [0u8; 3];
        let mut cursor = 0;
        for r in (2usize..=14).rev() {
            if r as u8 == pair || ranks[r] == 0 { continue; }
            k[cursor] = r as u8;
            cursor += 1;
            if cursor == 3 { break; }
        }
        return HandScore::new([1, pair, k[0], k[1], k[2]]);
    }
    let mut high = [0u8; 6];
    let mut cursor = 1;
    for r in (2usize..=14).rev() {
        if ranks[r] == 0 { continue; }
        high[cursor] = r as u8;
        cursor += 1;
        if cursor == 6 { break; }
    }
    HandScore::new(high)
}

/// Kept for the existing public Rust API, with only one final allocation.
pub fn rank_five(cards: &[u8; 5]) -> Vec<u8> {
    rank_five_inline(cards).as_slice().to_vec()
}

pub fn score(cards: &[u8]) -> Result<Vec<u8>, &'static str> {
    validate(cards)?;
    if cards.len() == 7 {
        let seven: &[u8; 7] = cards.try_into().expect("validated seven-card hand");
        return Ok(rank_seven_direct(seven).as_slice().to_vec());
    }
    Ok(best_score_unchecked(cards).as_slice().to_vec())
}

/// The inner score kernel only accepts unique, valid cards of length 5..=7.
/// The caller performs deck validation before entering a Monte-Carlo hot path.
#[inline]
fn best_score_unchecked(cards: &[u8]) -> HandScore {
    let mut best: Option<HandScore> = None;
    for a in 0..cards.len() - 4 {
        for b in a + 1..cards.len() - 3 {
            for c in b + 1..cards.len() - 2 {
                for d in c + 1..cards.len() - 1 {
                    for e in d + 1..cards.len() {
                        let candidate = rank_five_inline(&[cards[a], cards[b], cards[c], cards[d], cards[e]]);
                        if best.map_or(true, |current| candidate.as_slice() > current.as_slice()) {
                            best = Some(candidate);
                        }
                    }
                }
            }
        }
    }
    best.expect("hand must contain at least five cards")
}

/// Comparable six-byte score, zero padded only after the score's final kicker.
/// For legal seven-card hands the rank category determines its score length,
/// so padding cannot change the established V1 comparison order.
/// Used only after the equity engine has checked the complete deal's cards.
#[inline]
pub(crate) fn rank_seven_unchecked(cards: &[u8; 7]) -> u64 {
    let score = rank_seven_direct(cards);
    let mut key = 0u64;
    for &digit in &score.bytes {
        key = (key << 8) | u64::from(digit);
    }
    key
}

/// Compare a complete heads-up showdown using nine packed cards:
/// [hero0, hero1, villain0, villain1, board0 .. board4].
///
/// Validate all nine cards exactly once, then rank the two seven-card
/// hands on the stack. One WASM call replaces two Vec-returning score calls
/// and one JS comparison during Monte-Carlo and sampled CFR training.
pub fn compare_showdown_nine(cards: &[u8]) -> Result<i8, &'static str> {
    if cards.len() != 9 { return Err("Expected nine packed cards for heads-up showdown"); }
    let mut seen: u64 = 0;
    for &card in cards {
        let rank = card & 0x0f;
        let suit = card >> 4;
        if !(2..=14).contains(&rank) || suit > 3 { return Err("Invalid showdown card"); }
        let bit = 1u64 << (u64::from(suit) * 13 + u64::from(rank - 2));
        if seen & bit != 0 { return Err("Duplicate showdown card"); }
        seen |= bit;
    }
    let hero = [cards[0], cards[1], cards[4], cards[5], cards[6], cards[7], cards[8]];
    let villain = [cards[2], cards[3], cards[4], cards[5], cards[6], cards[7], cards[8]];
    Ok(match rank_seven_unchecked(&hero).cmp(&rank_seven_unchecked(&villain)) {
        Ordering::Less => -1,
        Ordering::Equal => 0,
        Ordering::Greater => 1,
    })
}

pub fn compare(left: &[u8], right: &[u8]) -> Ordering {
    let max_length = left.len().max(right.len());
    (0..max_length).map(|i| left.get(i).copied().unwrap_or(0).cmp(&right.get(i).copied().unwrap_or(0)))
        .find(|part| *part != Ordering::Equal).unwrap_or(Ordering::Equal)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn c(r: u8, s: u8) -> u8 { r | (s << 4) }
    #[test]
    fn handles_royal_and_wheel() {
        assert_eq!(score(&[c(14,0),c(13,0),c(12,0),c(11,0),c(10,0)]).unwrap(), vec![9,14]);
        assert_eq!(score(&[c(14,0),c(2,1),c(3,2),c(4,3),c(5,0)]).unwrap(), vec![4,5]);
    }
    #[test]
    fn picks_best_five_from_seven() {
        assert_eq!(score(&[c(14,0),c(14,1),c(14,2),c(13,0),c(13,1),c(8,0),c(2,1)]).unwrap(),vec![6,14,13]);
        assert!(validate(&[c(2,0),c(2,0),c(3,0),c(4,0),c(5,0)]).is_err());
    }
    #[test]
    fn allocation_free_comparison_matches_public_scoring_on_many_deals() {
        let deck: Vec<u8> = (0u8..4).flat_map(|s| (2u8..=14).map(move |r| c(r, s))).collect();
        let mut state = 0x7133a6cf_u64;
        for _ in 0..12000 {
            let mut work = deck.clone();
            for position in 0..9 {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                let choice = position + (state as usize % (work.len() - position));
                work.swap(position, choice);
            }
            let a = [work[0],work[1],work[4],work[5],work[6],work[7],work[8]];
            let b = [work[2],work[3],work[4],work[5],work[6],work[7],work[8]];
            let expected = compare(&score(&a).unwrap(), &score(&b).unwrap());
            let actual = rank_seven_unchecked(&a).cmp(&rank_seven_unchecked(&b));
            assert_eq!(actual,expected,"different score comparison for a={a:?} b={b:?}");
        }
    }
    #[test]
    fn direct_seven_card_rank_matches_brute_force_on_random_and_adversarial_hands() {
        let deck: Vec<u8> = (0u8..4).flat_map(|s| (2u8..=14).map(move |r| c(r, s))).collect();
        let mut state = 0x6e4212c45f7b1a93_u64;
        for trial in 0..18000 {
            let mut cards = deck.clone();
            for index in 0..7 {
                state ^= state << 13; state ^= state >> 7; state ^= state << 17;
                let next = index + (state as usize % (cards.len() - index));
                cards.swap(index, next);
            }
            let seven: [u8; 7] = cards[..7].try_into().unwrap();
            assert_eq!(rank_seven_direct(&seven).as_slice(),
                best_score_unchecked(&seven).as_slice(),
                "seven-card ranking mismatch on trial {trial}, hand={seven:?}");
        }
        for hand in [
            [c(14,0),c(2,0),c(3,0),c(4,0),c(5,0),c(8,1),c(9,2)],
            [c(14,1),c(13,1),c(12,1),c(11,1),c(10,1),c(2,2),c(3,3)],
            [c(14,1),c(14,2),c(13,1),c(13,2),c(12,1),c(12,2),c(2,3)],
            [c(14,0),c(14,1),c(14,2),c(13,0),c(13,1),c(13,2),c(2,3)],
            [c(2,0),c(3,0),c(4,0),c(5,0),c(7,0),c(8,0),c(9,0)]
        ] {
            assert_eq!(rank_seven_direct(&hand).as_slice(),best_score_unchecked(&hand).as_slice());
        }
    }
    #[test]
    fn stable_kickers_and_multi_pair_tie_breaks() {
        assert_eq!(score(&[c(14,0),c(14,1),c(13,2),c(13,3),c(12,0)]).unwrap(),vec![2,14,13,12]);
        assert_eq!(score(&[c(14,0),c(14,1),c(14,2),c(13,3),c(12,0)]).unwrap(),vec![3,14,13,12]);
        assert_eq!(score(&[c(14,0),c(14,1),c(13,0),c(12,0),c(11,1)]).unwrap(),vec![1,14,13,12,11]);
    }
    #[test]
    fn packed_showdown_matches_separate_public_scores_for_twelve_thousand_deals() {
        let deck: Vec<u8> = (0u8..4)
            .flat_map(|s| (2u8..=14).map(move |r| c(r, s))).collect();
        let mut state = 0xa159_5724_1de6_0e17u64;
        for _ in 0..12_000 {
            let mut cards = deck.clone();
            for index in 0..9 {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                let choice = index + (state as usize % (cards.len() - index));
                cards.swap(index, choice);
            }
            let nine = &cards[..9];
            let hero = [nine[0],nine[1],nine[4],nine[5],nine[6],nine[7],nine[8]];
            let villain = [nine[2],nine[3],nine[4],nine[5],nine[6],nine[7],nine[8]];
            let expected = match compare(&score(&hero).unwrap(),&score(&villain).unwrap()) {
                Ordering::Less => -1, Ordering::Equal => 0, Ordering::Greater => 1
            };
            assert_eq!(compare_showdown_nine(nine).unwrap(),expected);
        }
    }
    #[test]
    fn packed_showdown_rejects_invalid_or_overlapping_cards() {
        assert!(compare_showdown_nine(&[2,3]).is_err());
        assert!(compare_showdown_nine(&[2,3,4,5,6,7,8,9,2]).is_err());
        assert!(compare_showdown_nine(&[2,3,4,5,6,7,8,9,0xff]).is_err());
    }

}

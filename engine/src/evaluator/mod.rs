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

/// Kept for the existing public Rust API, with only one final allocation.
pub fn rank_five(cards: &[u8; 5]) -> Vec<u8> {
    rank_five_inline(cards).as_slice().to_vec()
}

pub fn score(cards: &[u8]) -> Result<Vec<u8>, &'static str> {
    validate(cards)?;
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
    let score = best_score_unchecked(cards);
    let mut key = 0u64;
    for &digit in &score.bytes {
        key = (key << 8) | u64::from(digit);
    }
    key
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
    fn stable_kickers_and_multi_pair_tie_breaks() {
        assert_eq!(score(&[c(14,0),c(14,1),c(13,2),c(13,3),c(12,0)]).unwrap(),vec![2,14,13,12]);
        assert_eq!(score(&[c(14,0),c(14,1),c(14,2),c(13,3),c(12,0)]).unwrap(),vec![3,14,13,12]);
        assert_eq!(score(&[c(14,0),c(14,1),c(13,0),c(12,0),c(11,1)]).unwrap(),vec![1,14,13,12,11]);
    }
}

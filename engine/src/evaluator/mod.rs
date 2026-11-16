//! Bit-packed cards: rank in the low 4 bits (2..=14), suit in bits 4..5.
//! Ranking is byte-for-byte equivalent to the legacy JS `score` arrays.
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

fn straight_high(values: &[u8; 5]) -> Option<u8> {
    let mut present = [false; 15];
    for &value in values { present[value as usize] = true; }
    if present[14] { present[1] = true; }
    for high in (5usize..=14).rev() {
        if (0..5).all(|offset| present[high - offset]) { return Some(high as u8); }
    }
    None
}

pub fn rank_five(cards: &[u8; 5]) -> Vec<u8> {
    let mut values = [0u8; 5];
    for (index, &card) in cards.iter().enumerate() { values[index] = rank(card); }
    values.sort_unstable_by(|a, b| b.cmp(a));
    let is_flush = cards.iter().all(|card| suit(*card) == suit(cards[0]));
    let straight = straight_high(&values);
    if is_flush {
        if let Some(high) = straight {
            return if high == 14 { vec![9, 14] } else { vec![8, high] };
        }
    }
    let mut counts = [0u8; 15];
    for &value in &values { counts[value as usize] += 1; }
    let mut groups: Vec<(u8, u8)> = (2..=14)
        .filter(|&value| counts[value as usize] > 0)
        .map(|value| (value, counts[value as usize])).collect();
    groups.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
    if groups[0].1 == 4 { return vec![7, groups[0].0, groups[1].0]; }
    if groups[0].1 == 3 && groups[1].1 == 2 { return vec![6, groups[0].0, groups[1].0]; }
    if is_flush { return [vec![5], values.to_vec()].concat(); }
    if let Some(high) = straight { return vec![4, high]; }
    if groups[0].1 == 3 { return [vec![3, groups[0].0], groups[1..].iter().map(|g| g.0).collect()].concat(); }
    if groups[0].1 == 2 && groups[1].1 == 2 {
        return vec![2, groups[0].0.max(groups[1].0), groups[0].0.min(groups[1].0), groups[2].0];
    }
    if groups[0].1 == 2 { return [vec![1, groups[0].0], groups[1..].iter().map(|g| g.0).collect()].concat(); }
    [vec![0], values.to_vec()].concat()
}

pub fn score(cards: &[u8]) -> Result<Vec<u8>, &'static str> {
    validate(cards)?;
    let mut best = Vec::new();
    for a in 0..cards.len() - 4 {
        for b in a + 1..cards.len() - 3 {
            for c in b + 1..cards.len() - 2 {
                for d in c + 1..cards.len() - 1 {
                    for e in d + 1..cards.len() {
                        let candidate = rank_five(&[cards[a], cards[b], cards[c], cards[d], cards[e]]);
                        if candidate > best { best = candidate; }
                    }
                }
            }
        }
    }
    Ok(best)
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
}

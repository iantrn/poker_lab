//! Weighted category histogram, reusable by range-vs-range sampling.
use crate::evaluator;

pub fn category_histogram(cards: &[u8], weights: &[f64], width: usize) -> Result<Vec<f64>, &'static str> {
    if !(5..=7).contains(&width) || weights.len() * width != cards.len() { return Err("Invalid weighted range input"); }
    let mut categories = vec![0.0f64; 10];
    let mut sum = 0.0;
    for (hand, &weight) in cards.chunks_exact(width).zip(weights) {
        if !weight.is_finite() || weight < 0.0 { return Err("Invalid frequency"); }
        if weight == 0.0 { continue; }
        let category = evaluator::score(hand)?[0] as usize;
        categories[category] += weight;
        sum += weight;
    }
    if sum > 0.0 { for category in &mut categories { *category /= sum; } }
    Ok(categories)
}

//! PokerLab Rust/WASM engine: evaluation, range summaries, equity and CFR+ primitives.
//! Interfaces use packed cards so no JS object marshaling occurs in hot paths.
use wasm_bindgen::prelude::*;

pub mod evaluator;
pub mod equity;
pub mod ranges;
pub mod cfr;

#[wasm_bindgen]
pub fn evaluate_score(cards: &[u8]) -> Result<Vec<u8>, JsValue> {
    evaluator::score(cards).map_err(|error| JsValue::from_str(error))
}

#[wasm_bindgen]
pub fn equity_monte_carlo(holes: &[u8], board: &[u8], iterations: u32, seed: u64) -> Result<Vec<f64>, JsValue> {
    equity::monte_carlo(holes, board, iterations, seed).map_err(|error| JsValue::from_str(error))
}


#[wasm_bindgen]
pub fn range_category_histogram(cards: &[u8], weights: &[f64], width: usize) -> Result<Vec<f64>, JsValue> {
    ranges::category_histogram(cards, weights, width).map_err(|error| JsValue::from_str(error))
}

#[wasm_bindgen]
pub fn cfr_plus_matrix(payoff: &[f64], rows: usize, cols: usize, iterations: u32) -> Result<Vec<f64>, JsValue> {
    cfr::solve_matrix(payoff, rows, cols, iterations).map_err(|error| JsValue::from_str(error))
}

#[wasm_bindgen]
pub fn equity_range_monte_carlo(
    hero: &[u8], board: &[u8], villain_pairs: &[u8],
    weights: &[f64], iterations: u32, seed: u64,
) -> Result<Vec<f64>, JsValue> {
    equity::monte_carlo_vs_range(hero, board, villain_pairs, weights, iterations, seed)
        .map_err(JsValue::from_str)
}

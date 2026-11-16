//! CFR+ regret-matching core for a zero-sum matrix (a restricted game tree).
//! The full PokerLab postflop tree stays on the proven legacy worker until parity.

fn strategy(regrets: &[f64]) -> Vec<f64> {
    let positives: Vec<f64> = regrets.iter().map(|r| r.max(0.0)).collect();
    let sum: f64 = positives.iter().sum();
    if sum > 0.0 { positives.iter().map(|r| r / sum).collect() }
    else { vec![1.0 / regrets.len() as f64; regrets.len()] }
}

pub fn solve_matrix(payoff: &[f64], rows: usize, cols: usize, iterations: u32) -> Result<Vec<f64>, &'static str> {
    if rows == 0 || cols == 0 || payoff.len() != rows * cols || iterations == 0 ||
       payoff.iter().any(|value| !value.is_finite()) { return Err("Invalid CFR matrix"); }
    let mut regret0 = vec![0.0; rows];
    let mut regret1 = vec![0.0; cols];
    let mut average0 = vec![0.0; rows];
    let mut average1 = vec![0.0; cols];
    for _ in 0..iterations {
        let p = strategy(&regret0);
        let q = strategy(&regret1);
        for i in 0..rows { average0[i] += p[i]; }
        for j in 0..cols { average1[j] += q[j]; }
        let action0: Vec<f64> = (0..rows).map(|i| (0..cols).map(|j| payoff[i * cols + j] * q[j]).sum()).collect();
        let action1: Vec<f64> = (0..cols).map(|j| -(0..rows).map(|i| payoff[i * cols + j] * p[i]).sum::<f64>()).collect();
        let ev0: f64 = action0.iter().zip(&p).map(|(v, p)| v * p).sum();
        let ev1: f64 = action1.iter().zip(&q).map(|(v, q)| v * q).sum();
        for i in 0..rows { regret0[i] = (regret0[i] + action0[i] - ev0).max(0.0); }
        for j in 0..cols { regret1[j] = (regret1[j] + action1[j] - ev1).max(0.0); }
    }
    let total = iterations as f64;
    average0.iter_mut().for_each(|p| *p /= total);
    average1.iter_mut().for_each(|q| *q /= total);
    Ok([average0, average1].concat())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matching_pennies_approaches_nash() {
        let result = solve_matrix(&[1.,-1.,-1.,1.], 2, 2, 20_000).unwrap();
        for p in result { assert!((p - 0.5).abs() < 0.025); }
    }
}

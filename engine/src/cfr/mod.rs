pub mod tree;
//! CFR+ regret-matching core for a zero-sum matrix (a restricted game tree).
//! The full PokerLab postflop tree stays on the proven legacy worker until parity.

/// Regret matching on preallocated buffers (no heap allocation per iteration).
#[inline]
fn strategy_into(regrets: &[f64], strategy: &mut [f64]) {
    let mut total = 0.0;
    for (out, regret) in strategy.iter_mut().zip(regrets) {
        *out = regret.max(0.0);
        total += *out;
    }
    if total > 0.0 {
        for probability in strategy { *probability /= total; }
    } else {
        strategy.fill(1.0 / regrets.len() as f64);
    }
}

pub fn solve_matrix(payoff: &[f64], rows: usize, cols: usize, iterations: u32) -> Result<Vec<f64>, &'static str> {
    if rows == 0 || cols == 0 || payoff.len() != rows * cols || iterations == 0 ||
       payoff.iter().any(|value| !value.is_finite()) { return Err("Invalid CFR matrix"); }
    let mut regret0 = vec![0.0; rows];
    let mut regret1 = vec![0.0; cols];
    let mut average0 = vec![0.0; rows];
    let mut average1 = vec![0.0; cols];
    let mut p = vec![0.0; rows];
    let mut q = vec![0.0; cols];
    let mut action0 = vec![0.0; rows];
    let mut action1 = vec![0.0; cols];
    for _ in 0..iterations {
        strategy_into(&regret0, &mut p);
        strategy_into(&regret1, &mut q);
        for i in 0..rows { average0[i] += p[i]; }
        for j in 0..cols { average1[j] += q[j]; }

        for i in 0..rows {
            let mut utility = 0.0;
            for j in 0..cols { utility += payoff[i * cols + j] * q[j]; }
            action0[i] = utility;
        }
        for j in 0..cols {
            let mut utility = 0.0;
            for i in 0..rows { utility += payoff[i * cols + j] * p[i]; }
            action1[j] = -utility;
        }
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

    // Original allocation-heavy CFR+ implementation, retained only as test oracle.
    fn reference_solver(payoff: &[f64], rows: usize, cols: usize, iterations: u32) -> Vec<f64> {
        fn reference_strategy(regrets: &[f64]) -> Vec<f64> {
            let positives: Vec<f64> = regrets.iter().map(|r| r.max(0.0)).collect();
            let sum: f64 = positives.iter().sum();
            if sum > 0.0 { positives.iter().map(|r| r / sum).collect() }
            else { vec![1.0 / regrets.len() as f64; regrets.len()] }
        }
        let mut regret0 = vec![0.0; rows];
        let mut regret1 = vec![0.0; cols];
        let mut average0 = vec![0.0; rows];
        let mut average1 = vec![0.0; cols];
        for _ in 0..iterations {
            let p = reference_strategy(&regret0);
            let q = reference_strategy(&regret1);
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
        [average0, average1].concat()
    }
    #[test]
    fn optimized_cfr_matches_original_regret_math_exactly() {
        for (rows,cols,payoff) in [
            (2,2,vec![1.0,-1.0,-1.0,1.0]),
            (3,2,vec![2.0,-3.0,0.5,1.0,-1.0,1.5]),
            (1,2,vec![2.0,-4.0]),
            (2,3,vec![0.25,-1.5,2.0,1.75,0.0,-2.25])
        ] {
            for count in [1,2,3,7,100,1000] {
                let original = reference_solver(&payoff,rows,cols,count);
                let optimized = solve_matrix(&payoff,rows,cols,count).unwrap();
                assert_eq!(optimized,original,"CFR+ result changed for {}x{} after {} iterations",rows,cols,count);
            }
        }
    }
    #[test]
    fn three_by_two_rectangular_game_remains_normalized() {
        let result = solve_matrix(&[2.0, -3.0, 0.5, 1.0, -1.0, 1.5], 3, 2, 12_000).unwrap();
        assert_eq!(result.len(), 5);
        assert!((result[..3].iter().sum::<f64>() - 1.0).abs() < 1e-10);
        assert!((result[3..].iter().sum::<f64>() - 1.0).abs() < 1e-10);
        assert!(result.iter().all(|p| p.is_finite() && (0.0..=1.0).contains(p)));
    }
    #[test]
    fn invalid_matrix_rejected() {
        assert!(solve_matrix(&[], 0, 1, 100).is_err());
        assert!(solve_matrix(&[f64::NAN], 1, 1, 100).is_err());
        assert!(solve_matrix(&[0.5], 1, 1, 0).is_err());
        assert!(solve_matrix(&[0.5], 2, 1, 100).is_err());
    }

    #[test]
    fn matching_pennies_approaches_nash() {
        let result = solve_matrix(&[1.,-1.,-1.,1.], 2, 2, 20_000).unwrap();
        for p in result { assert!((p - 0.5).abs() < 0.025); }
    }
}

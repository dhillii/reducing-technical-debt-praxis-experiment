# NFR Alignment Score Explanation

## Current Implementation

Your `nfr_alignment_score` is calculated **using local metrics only**:

```python
nfr_score = local_nfr_alignment_score(pre_local, post_local)
```

This compares:
- **Pre-baseline**: Your local calculation of the original code
- **Post-measurement**: Your local calculation of the refactored code

## What It Measures

A weighted score (0-100) measuring maintainability improvement:

| Metric | Weight | Improvement Calculation |
|--------|--------|-------------------------|
| Cognitive Complexity | 35% | (pre - post) / pre |
| Cyclomatic Complexity | 30% | (pre - post) / pre |
| Maintainability Index | 20% | (post - pre) / 100 |
| NCLOC | 15% | (pre - post) / pre |

**Interpretation:**
- **100** = Perfect improvement (all metrics improved)
- **50** = Moderate improvement
- **0** = No improvement
- **Negative** = Code got worse

## Current Columns in CSV

```
nfr_alignment_score   = Weighted improvement (local pre vs local post)
```

## Optional: Comparison with SonarQube Baseline

You might also want to calculate how the score would change if you used **SonarQube's pre-metrics** as the baseline instead:

```
nfr_alignment_sonar_baseline = Weighted improvement (SonarQube pre vs local post)
```

This would show:
- If SonarQube's pre-metrics were higher → more "improvement" needed → possibly different score
- If SonarQube's pre-metrics were lower → less "improvement" shown → possibly different score
- The difference reveals how much SonarQube vs. local metrics impact the conclusion

## Should You Use the Comparison?

**Option A: Keep Current (Recommended for most cases)**
- Use local pre vs local post only
- Reason: Consistent measurement methodology (all local)
- Your dissertation argument: "Refactoring impact measured by consistent local analysis"

**Option B: Add Comparison Columns**
- Add `nfr_alignment_sonar_baseline` alongside current score
- Reason: Show robustness of your improvements
- Your dissertation argument: "Improvements hold true even relative to SonarQube's initial assessment"

## Implementation Status

✅ **Current:** `nfr_alignment_score` using local pre vs local post  
⏳ **Optional:** Helper function `nfr_alignment_score_sonar_vs_local()` available in `utils/local_metrics.py`

To enable comparison columns, edit `orchestration/orchestrate_experiments.py` around line 627:

```python
# Current:
nfr_score = local_nfr_alignment_score(pre_local, post_local)
self.csv_df.loc[csv_idx, "nfr_alignment_score"] = nfr_score

# Optional addition:
nfr_scores = local_nfr_alignment_score_sonar_vs_local(pre_sonar, pre_local, post_local)
self.csv_df.loc[csv_idx, "nfr_alignment_score"] = nfr_scores["nfr_alignment_score"]
self.csv_df.loc[csv_idx, "nfr_alignment_sonar_baseline"] = nfr_scores["nfr_alignment_sonar_baseline"]
self.csv_df.loc[csv_idx, "baseline_difference"] = nfr_scores["baseline_difference"]
```

But first: do you have `pre_sonar` metrics available in `csv_row`? You'd need:
- `pre_cyclomatic_complexity`
- `pre_cognitive_complexity`
- `pre_ncloc`

(These should already be in your CSV from SonarCloud extraction)

## Recommendation

Start with **Option A** (current implementation). After experiments complete and you analyze results, you can always add Option B comparison columns if needed for robustness analysis.

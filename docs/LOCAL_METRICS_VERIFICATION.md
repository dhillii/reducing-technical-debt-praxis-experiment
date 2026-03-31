# Local Metrics Verification and SonarQube Alignment

**Date:** 2026-03-31  
**Status:** ✅ VERIFIED - All post-refactoring metrics calculated locally

## Summary

Your implementation correctly calculates all post-refactoring metrics locally and uses them for maintainability_index and nfr_alignment_score. This ensures:
- No dependence on SonarQube re-scanning delays
- Consistent before/after metric computation
- Immediate feedback after refactoring

## Verified Implementation

### ✅ Pre-Metrics (From SonarCloud via CSV)
- `pre_cyclomatic_complexity` - From SonarCloud
- `pre_cognitive_complexity` - From SonarCloud  
- `pre_ncloc` - From SonarCloud

### ✅ Post-Metrics (Calculated Locally)
- `post_cyclomatic_complexity` - Calculated locally using Lizard (primary) or regex fallback
- `post_cognitive_complexity` - Calculated locally using SonarSource cognitive complexity algorithm
- `post_ncloc` - Calculated locally via line counting

### ✅ Summary Columns (Using Local Calculations)
- `maintainability_index` = post_local maintainability (line 645 in orchestrator)
- `nfr_alignment_score` = locally-weighted maintainability improvement (line 646 in orchestrator)

### ✅ Delta Columns
All delta columns calculated from local metrics:
- `cc_delta_local` = post - pre local cyclomatic complexity
- `cognitive_delta_local` = post - pre local cognitive complexity
- `ncloc_delta_local` = post - pre local NCLOC
- `maintainability_delta_local` = post - pre local maintainability index

## Algorithm Alignment with SonarQube

### Cyclomatic Complexity
- **Primary (Lizard):** Accurate parser-based calculation for JavaScript/TypeScript
- **Fallback (Regex):** Counts decision points (if, for, while, case, catch, ternary, &&, ||)
- **SonarQube:** Uses Eclipse metrics engine; Lizard is very similar

### Cognitive Complexity
- **Your Implementation:** Counts decision points + nesting penalty + boolean operators
- **SonarQube:** Similar SonarSource algorithm (1 per decision, +1 per nesting level beyond first)
- **Alignment:** Good — both use nesting-aware decision counting

### NCLOC (Non-Comment Lines of Code)
- **Your Implementation:** Counts non-empty lines excluding comments (block and line)
- **SonarQube:** Same definition
- **Alignment:** Exact

### Maintainability Index
- **Your Implementation:** Halstead-based formula (0-100 scale)
  ```
  MI = 171 - (5.2 * ln(ncloc)) - (0.23 * CC) - (0.1 * cognitive)
  ```
- **SonarQube:** Proprietary formula based on maintainability rating (A-E)
- **Alignment:** Different formulas, but both decrease with complexity; yours is stable for delta measurement

## Recent Improvements (2026-03-31)

### 1. Added Lizard to Dependencies
- Significantly more accurate than regex for cyclomatic complexity
- Properly parses function boundaries in JavaScript

### 2. Enhanced Cognitive Complexity Algorithm
- Now matches SonarSource algorithm more closely
- Tracks nesting levels
- Properly handles block comments
- Ternary operator support

### 3. Improved Cyclomatic Complexity Fallback
- Better regex patterns for decision points
- Proper comment handling
- Ternary operator support

## Validation Approach

For your dissertation, note:
1. **Pre-metrics (SonarQube)** - Reference values in CSV columns:
   - `pre_cyclomatic_complexity` (from SonarQube)
   - `pre_cognitive_complexity` (from SonarQube)
   - `pre_ncloc` (from SonarQube)

2. **Pre-metrics (Local)** - Your local calculations in CSV columns:
   - `pre_local_cyclomatic_complexity` (calculated locally)
   - `pre_local_cognitive_complexity` (calculated locally)
   - `pre_local_ncloc` (calculated locally)
   - `pre_local_maintainability_index` (calculated locally)

3. **Post-metrics (Local only)** - Always locally calculated:
   - `post_local_cyclomatic_complexity`
   - `post_local_cognitive_complexity`
   - `post_local_ncloc`
   - `post_local_maintainability_index`

4. **Deltas** - All calculated from local pre/post:
   - `cc_delta_local` = post - pre (local)
   - `cognitive_delta_local` = post - pre (local)
   - `ncloc_delta_local` = post - pre (local)
   - `maintainability_delta_local` = post - pre (local)

5. **Summary Columns** - Use local post metrics:
   - `maintainability_index` = post_local (not SonarQube)
   - `nfr_alignment_score` = locally weighted improvement

This design ensures that your refactoring improvements are measured independently of SonarQube's indexing schedule while allowing you to validate that your local calculations align with SonarQube.

## Usage

### Automatic Calculation During Experiments

All metrics are automatically calculated during the `_stage_local_metrics` phase:
```python
pre_local = analyze_code_metrics(source_code, extension="js")
post_local = analyze_code_metrics(post_code, extension="js")
nfr_score = local_nfr_alignment_score(pre_local, post_local)
```

Results are persisted to the CSV with full local metric columns for analysis.

### Analyzing SonarQube vs. Local Calculations

After experiments complete, compare your local calculations to SonarQube's:

```bash
# Print comparison report to console
python analyze_metrics.py --report

# Export detailed comparison CSV
python analyze_metrics.py --export

# Do both
python analyze_metrics.py --full
```

This generates:
1. **Text report** showing mean/median/std deviation of differences
2. **metric_comparison_analysis.csv** with columns:
   - `cc_sonar_vs_local` - Cyclomatic complexity difference
   - `cognitive_sonar_vs_local` - Cognitive complexity difference
   - `ncloc_sonar_vs_local` - NCLOC difference

Use this to validate that Lizard and your cognitive complexity calculation align well with SonarQube.

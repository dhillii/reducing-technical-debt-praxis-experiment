# Local Computed Metrics Method

This document defines the local metric calculations used during experiment runs.

## Purpose

- Keep before/after comparisons method-consistent.
- Compute maintainability-oriented metrics locally at run time.
- Preserve SonarCloud metrics as a separate reference source.

## Inputs

For each run, two code artifacts are analyzed with the same local library:

- Pre: original source file from sample_source_code.
- Post: generated refactored file from conditions/{condition}/file_xxxx/run_y.js.

## Core Local Metrics

- Cyclomatic complexity (local)
- Cognitive complexity (local heuristic)
- NCLOC (non-comment lines of code)
- Maintainability index local (0-100)

## Maintainability Index Formula

The local maintainability index is computed as:

MI_local = clip_[0,100]((100 / 171) * (171 - 5.2 * ln(max(1, NCLOC)) - 0.23 * CC - 0.10 * CogC))

Where:

- CC is local cyclomatic complexity.
- CogC is local cognitive complexity.
- NCLOC is local non-comment lines of code.
- clip_[0,100](x) clamps x to the inclusive range [0, 100].

## NFR Alignment Score Formula

The score is intended to capture maintainability alignment from pre to post.

First, compute normalized improvement terms:

I_cc = (CC_pre - CC_post) / max(1, CC_pre)
I_cog = (CogC_pre - CogC_post) / max(1, CogC_pre)
I_ncloc = (NCLOC_pre - NCLOC_post) / max(1, NCLOC_pre)
I_mi = (MI_post - MI_pre) / 100

Then clamp each term to [-1, 1] and compute weighted sum:

W = 0.35 * I_cog + 0.30 * I_cc + 0.20 * I_mi + 0.15 * I_ncloc

Final score:

NFR_alignment_score = round(100 * clip_[0,1](W))

Interpretation:

- 100: strong maintainability improvement alignment
- 50: mixed or modest alignment
- 0: weak or negative alignment

## CSV Columns Updated During Runs

Local computed columns:

- pre_local_cyclomatic_complexity
- pre_local_cognitive_complexity
- pre_local_ncloc
- pre_local_maintainability_index
- post_local_cyclomatic_complexity
- post_local_cognitive_complexity
- post_local_ncloc
- post_local_maintainability_index
- cc_delta_local
- cognitive_delta_local
- ncloc_delta_local
- maintainability_delta_local

Summary columns populated from local computations:

- maintainability_index (set to post_local_maintainability_index)
- nfr_alignment_score

## Notes

- These formulas are local approximations for consistent pre/post comparison.
- They are not claimed to be numerically equivalent to SonarCloud metrics.
- SonarCloud columns remain available as an external reference baseline.

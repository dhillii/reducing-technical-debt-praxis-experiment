# Experiment Workflow: Architecture & Execution Guide

## Table of Contents
1. [Overall Architecture](#overall-architecture)
2. [System Overview](#system-overview)
3. [Prerequisites & Setup](#prerequisites--setup)
4. [Directory Structure](#directory-structure)
5. [Step-by-Step Workflow](#step-by-step-workflow)
6. [Running the Experiment](#running-the-experiment)
7. [Monitoring & Control](#monitoring--control)
8. [Handling Failures](#handling-failures)
9. [Post-Experiment](#post-experiment)

---

## Overall Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DISSERTATION EXPERIMENT SYSTEM                        │
└─────────────────────────────────────────────────────────────────────────────┘

                                   INPUT LAYER
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
        ┌───────▼────────┐    ┌────────▼────────┐   ┌────────▼────────┐
        │  14 GitHub     │    │ unified_exp.    │   │   SonarCloud    │
        │  Projects      │    │   _dataset.csv  │   │   (Baseline)    │
        │  (source code) │    │ (file metadata, │   │   (pre-metrics) │
        │                │    │  prompts)       │   │                 │
        └────────────────┘    └─────────────────┘   └─────────────────┘

                              ORCHESTRATION LAYER
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        │                                                              │
        │  orchestrate_experiments.py                                 │
        │  ├─ Load state from experiment_state.json                  │
        │  ├─ Find next PENDING run                                  │
        │  ├─ Load prompt + source code                              │
        │  ├─ Call Claude API (CODE_GENERATION)                      │
        │  ├─ Write refactored code to disk                          │
        │  ├─ Create git commit (GIT_COMMIT)                         │
        │  ├─ Push to GitHub (GIT_PUSH)                              │
        │  ├─ Poll SonarCloud (SONAR_METRIC_EXTRACTION)             │
        │  └─ Update state + CSV (CSV_UPDATE)                        │
        │                                                              │
        └─────────────────────────────┬──────────────────────────────┘

                              MONITORING LAYER
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
   ┌────▼────────┐           ┌─────────▼────────┐          ┌────────▼───┐
   │monitor_cli  │           │ experiment.log   │          │  Dashboard │
   │.py          │           │ (all operations) │          │ (real-time)│
   │(interactive)│           │                  │          │            │
   │Commands:    │           │ experiment_      │          └────────────┘
   │- status     │           │ errors.log       │
   │- pause      │           │ (errors only)    │
   │- resume     │           │                  │
   │- retry      │           └──────────────────┘
   │- logs       │
   └─────────────┘

                              OUTPUT LAYER
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
   ┌────▼────────────┐        ┌────────▼────────┐        ┌──────────▼──┐
   │ dissertation-   │        │ experiment_     │        │ unified_exp │
   │ experiments     │        │ state.json      │        │ _dataset.   │
   │ (git repo)      │        │ (state tracking)│        │ csv (updated)
   │ ├─ conditions/  │        │                 │        │             │
   │ │  ├─ baseline/ │        │ Tracks:         │        │ Post-metrics:
   │ │  ├─ nfr_      │        │ - 1,314 runs    │        │ - CC_post   │
   │ │  │  generic/  │        │ - Status        │        │ - Cog_post  │
   │ │  └─ nfr_      │        │ - Timestamps    │        │ - ncloc_post
   │ │     adaptive/ │        │ - Metrics       │        │ - Deltas    │
   │ └─ 1,314 commits│        │ - Errors        │        │             │
   │                 │        │ - Retry count   │        └─────────────┘
   └─────────────────┘        └─────────────────┘
```

### Data Flow

```
                    EXPERIMENT EXECUTION FLOW (per run)

1. STATE CHECK
   └─→ Load experiment_state.json
       └─→ Find run with status=PENDING

2. PROMPT & CODE LOADING
   └─→ Read prompt from unified_experimental_dataset_shell.csv
       └─→ Read original source from sample_source_code/

3. LLM REFACTORING
   └─→ Call Claude API (Sonnet 4.6, temp=0)
       └─→ Update state: stage=CODE_GENERATION, store refactored_code

4. GIT OPERATIONS
   └─→ Write refactored code to conditions/{condition}/file_{id}/run_{n}.js
       └─→ Create atomic git commit with metadata
           └─→ Push to GitHub
               └─→ Update state: stage=GIT_PUSH, store commit_hash

5. SONARCLOUD ANALYSIS
   └─→ Poll SonarCloud API every 5 seconds (max 300s)
       └─→ When status=SUCCESS: Extract metrics
           └─→ Update state: stage=SONAR_METRIC_EXTRACTION, store post_metrics

6. DATA PERSISTENCE
   └─→ Update experiment_state.json with run results
       └─→ Append post-metrics to unified_experimental_dataset_shell.csv
           └─→ Mark state: status=COMPLETED

7. LOOP
   └─→ Return to STATE CHECK for next PENDING run
```

---

## System Overview

### What the System Does

The **Dissertation Experiment Orchestration System** automates the execution of a large-scale LLM-based code refactoring study:

- **Refactors 146 source files** from 14 JavaScript/TypeScript projects
- **Tests 3 prompt conditions** per file: baseline, NFR-enriched, adaptive NFR
- **Runs each condition 3 times** (1,314 total refactorings)
- **Measures outcomes** using SonarCloud (Cyclomatic Complexity, Cognitive Complexity)
- **Provides monitoring & control** via CLI dashboard
- **Enables pause/resume & retry** for operational flexibility
- **Maintains full audit trail** via git commits and state logs

### Key Properties

| Property | Value |
|----------|-------|
| Total runs | 1,314 (146 files × 3 conditions × 3 runs) |
| Execution time | 3-4 days (continuous, 66-80 hours) |
| Cost | $50-70 (Claude API + SonarCloud) |
| Git commits | 1 per run (1,314 commits) |
| State persistence | JSON file (fully recoverable from crash) |
| Monitoring | Real-time CLI dashboard |
| Failure handling | Automatic + manual retry with stage targeting |

---

## Prerequisites & Setup

### 1. API Credentials & Accounts

You need valid credentials for:

- **Anthropic (Claude API)**
  - Create account at https://console.anthropic.com
  - Generate API key
  - Verify you have sufficient credits (~$100 recommended)

- **SonarCloud**
  - Already have org `dhillii` set up
  - Verify org token available
  - Create project `dissertation-experiments` (linked to GitHub)

- **GitHub**
  - Create repo: `https://github.com/YOUR-ORG/dissertation-experiments`
  - Generate personal access token (for pushing code)
  - Clone repo locally

### 2. Environment Setup

Create `.env` file in your working directory:

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...your-key-here...

# SonarCloud
SONAR_TOKEN=sqa_...your-token-here...
SONAR_ORG=dhillii

# GitHub
GITHUB_TOKEN=ghp_...your-token-here...
GITHUB_REPO=your-org/dissertation-experiments

# Experiment settings
EXPERIMENT_REPO_PATH=./dissertation-experiments
LOGLEVEL=INFO
```

### 3. Python Environment

```bash
# Create virtual environment
python -m venv .venv

# Activate
source .venv/bin/activate  # Linux/Mac
# or
.\.venv\Scripts\activate.ps1  # Windows PowerShell

# Install dependencies
pip install -r requirements.txt
```

**requirements.txt:**
```
anthropic>=0.7.0
requests>=2.31.0
python-dotenv>=1.0.0
GitPython>=3.1.30
pandas>=2.0.0
pyyaml>=6.0
tqdm>=4.65.0
rich>=13.0.0
click>=8.1.0
pydantic>=2.0.0
pytest>=7.0.0
```

### 4. Input Data Files

Before starting, ensure you have:

- **unified_experimental_dataset_shell.csv** — 1,314 rows with file metadata & prompts
  - Columns: record_id, file_id, project_name, file_name, condition, prompt_text, pre_cyclomatic_complexity, pre_cognitive_complexity, pre_ncloc, etc.

- **sample_source_code/** — Directory with 146 original .js/.ts files
  - Naming: `file_0001_newsletter-detail-modal.tsx`, etc.
  - Used for reference/archiving during experiment

- **dissertation-experiments/** — Git repo cloned and configured
  - sonar-project.properties configured
  - SonarCloud project linked on GitHub
  - All branches up-to-date

### 5. Pre-Execution Validation

Run validation script:

```bash
python validation.py --full

# Checks:
# ✓ .env file present and complete
# ✓ API credentials valid (smoke test)
# ✓ GitHub repo accessible
# ✓ SonarCloud org accessible
# ✓ CSV files present and parseable
# ✓ sample_source_code/ populated
# ✓ Disk space available (~1GB)
```

---

## Directory Structure

### Working Directory Layout

```
dissertation-experiment-orchestration/
│
├── .env                                    # API credentials (DO NOT COMMIT)
├── .gitignore
│   └── (includes: .env, *.log, __pycache__, .venv)
│
├── requirements.txt                        # Python dependencies
│
├── EXPERIMENT_ORCHESTRATION_DESIGN.md      # Design spec
├── EXPERIMENT_WORKFLOW.md                  # This file
│
├── orchestrate_experiments.py              # Main execution engine
├── state_manager.py                        # State persistence
├── monitor_cli.py                          # Interactive CLI
├── experiment_repo_manager.py              # Git operations
├── claude_caller.py                        # Claude API wrapper
├── sonarcloud_poller.py                    # SonarCloud polling
├── logger_config.py                        # Logging setup
├── validation.py                           # Pre-execution validation
├── config.py                               # Constants & defaults
│
├── tests/
│   ├── __init__.py
│   ├── test_state_manager.py
│   ├── test_orchestration.py
│   └── test_retry_logic.py
│
├── unified_experimental_dataset_shell.csv  # Input: 1,314 rows
├── sample_source_code/                     # Input: 146 original files
│   ├── file_0001_newsletter-detail-modal.tsx
│   ├── file_0002_utils.ts
│   └── ...
│
├── experiment_state.json                   # Output: State tracking (created at runtime)
├── experiment.log                          # Output: All operations (created at runtime)
├── experiment_errors.log                   # Output: Errors only (created at runtime)
├── experiment_debug.log                    # Output: Debug details (created at runtime)
│
└── dissertation-experiments/               # Cloned git repo
    ├── .git/
    ├── sonar-project.properties
    ├── README.md
    └── conditions/
        ├── baseline/
        │   ├── file_0001/
        │   │   ├── run_1.js
        │   │   ├── run_2.js
        │   │   └── run_3.js
        │   ├── file_0002/
        │   └── ...
        ├── nfr_generic/
        │   └── (same structure)
        └── nfr_adaptive/
            └── (same structure)
```

---

## Step-by-Step Workflow

### Phase 1: Preparation (1-2 hours)

#### Step 1.1: Clone & Configure Experiment Repo

```bash
# Clone the empty experiment repo
git clone https://github.com/your-org/dissertation-experiments
cd dissertation-experiments

# Create sonar-project.properties
cat > sonar-project.properties << 'EOF'
sonar.projectKey=dissertation-experiments
sonar.projectName=Dissertation Experiments
sonar.sources=conditions
sonar.sourceEncoding=UTF-8
sonar.language=js
EOF

# Commit initial setup
git add sonar-project.properties README.md
git commit -m "Initialize experiment repository structure"
git push -u origin main

# Verify SonarCloud project is linked on GitHub
# (navigate to https://sonarcloud.io/organizations/dhillii/projects)
```

#### Step 1.2: Extract Original Source Files

```bash
# Run file extraction script (extracts 146 files from 14 projects)
# This clones/accesses the 14 source repos and archives originals
python extract_candidate_files.py

# Verify: sample_source_code/ should contain 146 files
ls sample_source_code/ | wc -l
# Output: 146
```

#### Step 1.3: Validate CSV & Setup

```bash
# Verify CSV has 1,314 rows
wc -l unified_experimental_dataset_shell.csv
# Output: 1315 (including header)

# Check for missing values in critical columns
python -c "
import pandas as pd
df = pd.read_csv('unified_experimental_dataset_shell.csv')
print('Total rows:', len(df))
print('Missing prompts:', df['prompt_text'].isna().sum())
print('Missing files:', df['file_name'].isna().sum())
"

# Run full validation
python validation.py --full
```

---

### Phase 2: Experiment Execution (3-4 days)

#### Step 2.1: Initialize State

```bash
# Run orchestrator in initialization mode
# This creates experiment_state.json with all 1,314 runs marked PENDING
python orchestrate_experiments.py --init

# Verify state file created
ls -lh experiment_state.json
# Output: -rw-r--r-- 1 user group 2.3M Mar 19 14:00 experiment_state.json
```

#### Step 2.2: Start Experiment Loop (Daemon)

```bash
# Start daemon in background
python daemon_manager.py start

# Verify it started
python daemon_manager.py status

# Check logs
python daemon_manager.py logs --tail 20
```

If you want to watch logs as they happen:
```bash
# In a separate terminal, tail the logs
python daemon_manager.py logs --follow
```

#### Step 2.3: Monitor Progress in Real-Time

```bash
# Check daemon is running
python daemon_manager.py status --verbose

# Monitor experiment progress
python monitor_cli.py status --summary
# Output: [████████░░░░░░░░░░░░░░░░░░] 34.2% | 450/1314 done | 8 failed | ETA: 2026-03-25 18:00

python monitor_cli.py status --failed
# Output: Shows list of failed runs with error details

python monitor_cli.py estimate-time
# Output: Estimated completion: 2026-03-27 11:30 (in 8 days, 21h)
```

#### Step 2.4: Periodic Checkpoints (Daily)

Each day, review:

```bash
# Check for failures
python monitor_cli.py status --failed

# Review error logs
tail -50 experiment_errors.log

# Check disk usage
du -sh dissertation-experiments/
# Should grow ~500KB per 100 runs

# Verify git commits are being created
cd dissertation-experiments && git log --oneline | head -10
```

---

### Phase 3: Handling Failures During Execution

#### Step 3.1: Pause/Resume if Needed

```bash
# If you need to pause (e.g., API quota exceeded, system maintenance)
python monitor_cli.py pause

# Daemon finishes current run, then stops
# You can check status:
python daemon_manager.py status

# When ready to resume:
python daemon_manager.py start
# Auto-resumes from checkpoint
```

#### Step 3.2: Inspect Failures

```bash
# View failed runs
python monitor_cli.py status --failed

# Get detailed logs for specific file
python monitor_cli.py logs --file-id 5

# Show only error entries
python monitor_cli.py logs --errors --tail 30
```

#### Step 3.3: Retry Failed Runs

```bash
# Retry single failed run
python monitor_cli.py retry --record-id 127
# Output: Marked 1 run as PENDING. Orchestrator will retry on next iteration.

# Retry all failed runs
python monitor_cli.py retry

# Retry all runs for a specific file
python monitor_cli.py retry --file-id 5

# Retry specific condition
python monitor_cli.py retry --condition nfr_generic

# Retry runs stuck at specific stage
python monitor_cli.py retry --stage SONAR_METRIC_EXTRACTION
```

#### Step 3.4: Resume Execution

```bash
# After pausing or fixing an issue, resume:
python monitor_cli.py resume

# Orchestrator will pick up from next PENDING run
```

---

### Phase 4: Post-Execution Analysis (1-2 hours)

#### Step 4.1: Verify Completion

```bash
# Check that all runs are done
python monitor_cli.py status

# Should show: 1314 completed, 0 pending, 0 in_progress

# Verify git commits (should be 1,314)
cd dissertation-experiments && git rev-list --count HEAD
# Output: 1315 (including initial commit)
```

#### Step 4.2: Export & Analyze Results

```bash
# Export state to CSV for analysis
python monitor_cli.py export --format csv --output experiment_results.csv

# Merge post-metrics into main CSV
python merge_results.py \
  --original unified_experimental_dataset_shell.csv \
  --experiment experiment_state.json \
  --output unified_experimental_dataset_complete.csv

# Verify post-metrics populated
python -c "
import pandas as pd
df = pd.read_csv('unified_experimental_dataset_complete.csv')
print('Rows with post_cc:', df['post_cyclomatic_complexity'].notna().sum())
print('Rows with cc_delta:', df['cc_delta'].notna().sum())
"
```

#### Step 4.3: Run Statistical Analysis

```bash
# Generate summary statistics
python analysis/compute_statistics.py \
  --input unified_experimental_dataset_complete.csv \
  --output analysis_summary.csv

# Expected output columns:
# - condition, mean_cc_delta, std_dev_delta, 95_ci_lower, 95_ci_upper, p_value

# Run hypothesis tests
python analysis/hypothesis_tests.py \
  --input unified_experimental_dataset_complete.csv \
  --output hypothesis_test_results.csv

# Output: Paired t-tests comparing:
# - Baseline vs. NFR-enriched
# - Baseline vs. Adaptive NFR
# - NFR-enriched vs. Adaptive NFR
```

#### Step 4.4: Generate Tables for Chapter 4

```bash
# Generate tables for dissertation results
python analysis/generate_tables.py \
  --input unified_experimental_dataset_complete.csv \
  --output results_tables.tex

# Creates LaTeX tables:
# - Table 4.1: Summary statistics by condition
# - Table 4.2: Hypothesis test results
# - Table 4.3: Subgroup analysis (by project)
# - Table 4.4: Archetype analysis
```

---

## Running the Experiment

### Recommended Setup: Daemon Manager

The simplest approach uses **daemon_manager.py** to run the orchestration as a background daemon:

```bash
# 1. Setup (30 min)
python validation.py --full
python orchestrate_experiments.py --init

# 2. Start daemon (runs in background)
python daemon_manager.py start

# 3. Check status anytime
python daemon_manager.py status --verbose

# 4. View logs
python daemon_manager.py logs --tail 100
python daemon_manager.py logs --follow          # tail -f style

# 5. Monitor progress
python monitor_cli.py status --summary

# 6. If machine restarts, just restart daemon
python daemon_manager.py start                  # Auto-resumes from last checkpoint

# 7. Stop daemon when done
python daemon_manager.py stop
```

### Full Execution Example (Simple)

```bash
# 1. Setup (30 min)
python validation.py --full
python orchestrate_experiments.py --init
python daemon_manager.py status

# 2. Start daemon (set and forget for 3-4 days)
python daemon_manager.py start
python daemon_manager.py logs --follow  # Optional: watch logs in separate terminal

# 3. Check periodically (from anywhere, anytime)
python daemon_manager.py status --verbose
python monitor_cli.py status --summary
python monitor_cli.py status --failed

# 4. If issues arise
python monitor_cli.py status --failed
python monitor_cli.py logs --errors --tail 50
python monitor_cli.py retry --condition nfr_generic
python daemon_manager.py status --verbose

# 5. If daemon crashes (or machine restarts)
python daemon_manager.py start                  # Auto-resumes from checkpoint
python daemon_manager.py status

# 6. When complete (check daily after day 3)
python daemon_manager.py status --verbose
cd dissertation-experiments && git log --oneline | wc -l

# 7. Analyze results
python monitor_cli.py export --format csv --output results.csv
python analysis/compute_statistics.py --input results.csv

# 8. Stop daemon
python daemon_manager.py stop
```

---

## Monitoring & Control

### Real-Time Dashboard Commands

#### Status Commands

```bash
# Full dashboard
python monitor_cli.py status

# Summary (1-line)
python monitor_cli.py status --summary
# Output: [████████░░░░░░░░░░░░░░░░░░] 34.2% | 450/1314 done | 8 failed | ETA: 2026-03-25 18:00

# Failures only
python monitor_cli.py status --failed

# Specific file
python monitor_cli.py status --file-id 5

# Specific condition
python monitor_cli.py status --condition nfr_generic

# Specific stage
python monitor_cli.py status --stage SONAR_METRIC_EXTRACTION
```

#### Control Commands

```bash
# Pause after current run
python monitor_cli.py pause

# Resume
python monitor_cli.py resume

# Pause immediately
python monitor_cli.py pause --immediate

# Check if paused
python monitor_cli.py status | grep -i pause
```

#### Retry Commands

```bash
# All failed
python monitor_cli.py retry

# Specific record
python monitor_cli.py retry --record-id 127

# Specific file
python monitor_cli.py retry --file-id 5

# Specific condition
python monitor_cli.py retry --condition nfr_generic

# Specific stage
python monitor_cli.py retry --stage SONAR_METRIC_EXTRACTION

# Dry-run (show what would be retried)
python monitor_cli.py retry --record-id 127 --dry-run
```

#### Log Commands

```bash
# Tail main log
python monitor_cli.py logs --tail 50

# Errors only
python monitor_cli.py logs --errors

# Specific file logs
python monitor_cli.py logs --file-id 5

# With timestamps
python monitor_cli.py logs --tail 100 --timestamps
```

### Monitoring Checklist

**Every 12 hours:**
- [ ] Daemon still running: `python daemon_manager.py status`
- [ ] Check completion %: `python monitor_cli.py status --summary`
- [ ] Verify no unexpected errors: `python daemon_manager.py logs --tail 50`

**Daily:**
- [ ] Review failed runs: `python monitor_cli.py status --failed`
- [ ] Check daemon health: `python daemon_manager.py ps`
- [ ] Verify git commits: `cd dissertation-experiments && git log --oneline | head`
- [ ] Check disk usage: `du -sh dissertation-experiments/`

**If completion stalls (no progress for 2+ hours):**
- [ ] Check daemon is still running: `python daemon_manager.py status --verbose`
- [ ] View recent logs: `python daemon_manager.py logs --tail 100`
- [ ] Check API rate limits: Review Anthropic/SonarCloud dashboards
- [ ] If hung, restart: `python daemon_manager.py stop && sleep 2 && python daemon_manager.py start`

---

## Handling Failures

### Common Failures & Solutions

#### Claude API Rate Limit

**Symptom:** Errors mention "rate_limit_error" in logs

```bash
# Automatic recovery: orchestrator retries with exponential backoff
tail -50 experiment_errors.log | grep rate_limit

# Manual fix:
python monitor_cli.py pause
# Wait 30 seconds
python monitor_cli.py resume
```

#### SonarCloud Analysis Timeout

**Symptom:** Runs stuck at SONAR_METRIC_EXTRACTION for >5 min

```bash
# Check which runs are stuck
python monitor_cli.py status --stage SONAR_METRIC_EXTRACTION

# Retry after verification that SonarCloud is up
python monitor_cli.py retry --stage SONAR_METRIC_EXTRACTION
```

#### GitHub Push Fails

**Symptom:** GIT_PUSH stage errors, commits created but not pushed

```bash
# Manual fix:
cd dissertation-experiments
git push --all
cd ..

# Retry failed runs (they'll skip git commit, resume at GIT_PUSH)
python monitor_cli.py retry --stage GIT_PUSH
```

#### Missing Source File

**Symptom:** CODE_GENERATION fails because sample_source_code/file_* not found

```bash
# Check if file was extracted correctly
ls sample_source_code/ | wc -l

# Re-extract if needed
python extract_candidate_files.py --re-extract

# Mark specific run as SKIPPED (don't retry)
python monitor_cli.py skip --record-id 127
```

#### Disk Full

**Symptom:** GIT_COMMIT fails with "No space left on device"

```bash
# Check disk usage
du -sh dissertation-experiments/

# If >90% full:
# - Option 1: Increase disk space
# - Option 2: Archive old commits and prune (advanced)
#   cd dissertation-experiments && git gc --aggressive
#   cd ..

# Pause and resume after cleanup
python monitor_cli.py pause
# ... cleanup ...
python monitor_cli.py resume
```

### Recovery from Daemon Crash

If the daemon crashes or machine restarts:

```bash
# Check if daemon is still running
python daemon_manager.py status

# If not running, just restart it
python daemon_manager.py start

# Daemon automatically:
# 1. Loads state from experiment_state.json
# 2. Finds any IN_PROGRESS runs
# 3. Resumes from last completed stage
# 4. Continues loop
# Zero data loss (all writes are atomic per run)

# Monitor the restart
python daemon_manager.py logs --follow
```

---

## Post-Experiment

### Final Validation

```bash
# 1. Verify all runs completed
python monitor_cli.py status
# Expected: 1314 completed, 0 pending

# 2. Verify git history
cd dissertation-experiments
git log --oneline | wc -l
# Expected: 1315 (1 init + 1314 runs)

# 3. Verify CSV updated
python -c "
import pandas as pd
df = pd.read_csv('unified_experimental_dataset_complete.csv')
print(f'Total rows: {len(df)}')
print(f'Rows with post_cc: {df[\"post_cyclomatic_complexity\"].notna().sum()}')
print(f'Expected: 1314')
"

# 4. Verify no data loss
python validate_results.py
```

### Archive & Backup

```bash
# Backup experiment state
cp experiment_state.json experiment_state_backup_$(date +%Y%m%d).json
cp unified_experimental_dataset_complete.csv unified_experimental_dataset_complete_backup_$(date +%Y%m%d).csv

# Archive logs
tar -czf experiment_logs_$(date +%Y%m%d).tar.gz experiment*.log

# Push final git repo state
cd dissertation-experiments
git log --oneline | tail -20
git push
cd ..
```

### Statistical Analysis

See **Step 4.3-4.4** above for generating hypothesis test results and Chapter 4 tables.

---

## Timeline Estimate

| Phase | Duration | Notes |
|-------|----------|-------|
| **Setup** | 1-2 hours | Validation, file extraction, state init |
| **Execution** | 66-80 hours | 1,314 runs × 3-4 min each |
| **Analysis** | 1-2 hours | Statistical testing, table generation |
| **Total** | 3-4 days | Assuming continuous execution |

**Wall-clock time:** If running 24/7, complete in **3-4 days**
**Development time:** If monitoring daily, spread over **1-2 weeks**

---

## Summary

This workflow enables:

✅ **Reproducible execution** of 1,314 LLM refactoring experiments
✅ **Real-time monitoring** with pause/resume capability
✅ **Robust failure handling** with automatic + manual retry
✅ **Full audit trail** via git commits and state logs
✅ **Analysis-ready output** (CSV with pre + post metrics)

**Ready to execute.** Follow Phase 1 → Phase 2 → Phase 4 in sequence.

For questions: Refer to **EXPERIMENT_ORCHESTRATION_DESIGN.md** for detailed design rationale.

---

**Document Version:** 1.0
**Last Updated:** 2026-03-19
**Status:** Ready for Execution

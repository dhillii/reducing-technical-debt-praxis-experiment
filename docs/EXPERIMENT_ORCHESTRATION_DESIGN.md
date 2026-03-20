# Experiment Orchestration System Design

## Overview

This document specifies the design, architecture, and requirements for the **Dissertation Experiment Orchestration System** — a production-grade framework for executing, monitoring, and analyzing 1,314 LLM-based code refactoring experiments across 146 source files, 3 prompt conditions, and 3 runs per condition.

**Key Principles:**
- Each run gets its own atomic git commit
- State is persisted; can pause/resume at any point
- Real-time monitoring with actionable status
- Graceful failure handling with retry capability
- Full auditability via git history and logs

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   Experiment Orchestration System                │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
         ┌──────▼──────┐  ┌────▼─────┐  ┌─────▼──────┐
         │  State      │  │ Monitor  │  │  Command   │
         │  Manager    │  │  CLI     │  │  Handler   │
         │             │  │          │  │            │
         └──────┬──────┘  └────┬─────┘  └─────┬──────┘
                │               │              │
         ┌──────▼──────────────▼──────────────▼──────┐
         │      Experiment Execution Engine           │
         │  (orchestrate_experiments.py)              │
         └──────┬──────────────────────┬──────────────┘
                │                      │
         ┌──────▼──────┐        ┌──────▼──────┐
         │ Claude API  │        │  SonarCloud │
         │   Caller    │        │  API Poller │
         └─────────────┘        └─────────────┘
```

### Key Components

1. **orchestrate_experiments.py** — Main execution engine
   - Reads state from disk
   - Iterates through pending runs
   - Calls Claude, commits to git, queries SonarCloud
   - Updates state after each atomic operation

2. **state_manager.py** — Persistent state handling
   - JSON-based state file (`experiment_state.json`)
   - Tracks run status: PENDING, IN_PROGRESS, COMPLETED, FAILED
   - Records timestamps, metrics, error details
   - Thread-safe writes

3. **monitor_cli.py** — Interactive monitoring interface
   - Real-time progress display
   - Commands: `status`, `pause`, `resume`, `retry`, `logs`
   - Dashboard showing completion %, failures, ETA

4. **experiment_repo_manager.py** — Git operations
   - Handles commits with structured metadata
   - Validates code before commit
   - Handles SonarCloud component key generation

---

## 2. State Management Design

### State File: `experiment_state.json`

Persistent JSON file tracking the state of all 1,314 runs.

```json
{
  "experiment_metadata": {
    "start_time": "2026-03-19T14:00:00Z",
    "last_updated": "2026-03-19T14:45:23Z",
    "status": "RUNNING",
    "total_runs": 1314,
    "completed": 127,
    "failed": 3,
    "in_progress": 0,
    "pending": 1184
  },
  "runs": {
    "record_id_1": {
      "file_id": 1,
      "project_name": "Ghost",
      "file_name": "newsletter-detail-modal.tsx",
      "condition": "baseline",
      "run_number": 1,
      "status": "COMPLETED",
      "started_at": "2026-03-19T14:00:05Z",
      "completed_at": "2026-03-19T14:02:45Z",
      "duration_seconds": 160,
      "llm_tokens_used": 2847,
      "git_commit_hash": "abc123def456",
      "sonar_component_key": "dissertation-experiments:conditions/baseline/file_0001/run_1",
      "sonar_analysis_status": "COMPLETED",
      "sonar_analysis_date": "2026-03-19T14:03:12Z",
      "post_metrics": {
        "cyclomatic_complexity": 135,
        "cognitive_complexity": 38,
        "ncloc": 820
      },
      "cc_delta": -5,
      "errors": []
    },
    "record_id_2": {
      "file_id": 1,
      "project_name": "Ghost",
      "file_name": "newsletter-detail-modal.tsx",
      "condition": "baseline",
      "run_number": 2,
      "status": "FAILED",
      "started_at": "2026-03-19T14:02:50Z",
      "failed_at": "2026-03-19T14:04:32Z",
      "failure_stage": "SONAR_METRIC_EXTRACTION",
      "retry_count": 0,
      "git_commit_hash": "def789ghi012",
      "errors": [
        {
          "timestamp": "2026-03-19T14:04:32Z",
          "stage": "SONAR_METRIC_EXTRACTION",
          "error_type": "SonarCloudTimeoutError",
          "message": "Analysis did not complete within 300 seconds",
          "is_retriable": true
        }
      ]
    },
    "record_id_3": {
      "file_id": 1,
      "project_name": "Ghost",
      "file_name": "newsletter-detail-modal.tsx",
      "condition": "baseline",
      "run_number": 3,
      "status": "PENDING",
      "errors": []
    }
  }
}
```

### State Transitions

```
PENDING
  ├─→ IN_PROGRESS (when execution starts)
  │     ├─→ COMPLETED (all stages succeeded)
  │     └─→ FAILED (error in any stage, is_retriable=true)
  │           └─→ PENDING (when user runs `retry`)
  └─→ SKIPPED (user runs `skip`)
```

### Execution Stages (tracked per run)

1. **CODE_GENERATION** — Claude API call
2. **CODE_VALIDATION** — Syntax/parse check
3. **GIT_COMMIT** — Atomic git commit
4. **GIT_PUSH** — Push to GitHub
5. **SONAR_QUEUE_CHECK** — Verify SonarCloud received code
6. **SONAR_METRIC_EXTRACTION** — Poll SonarCloud until metrics available
7. **CSV_UPDATE** — Write results to unified_experimental_dataset_shell.csv

If any stage fails, the run is marked FAILED with details about which stage and whether it's retriable.

---

## 3. Orchestration Script Design: `orchestrate_experiments.py`

### Core Responsibilities

```python
class ExperimentOrchestrator:
    """
    Main orchestration engine for the dissertation experiments.

    Workflow per run:
    1. Load state from disk
    2. Find next PENDING run (respecting pause/resume state)
    3. Load original source code from sample_source_code/
    4. Construct prompt from unified_experimental_dataset_shell.csv
    5. Call Claude API → get refactored code
    6. Write code to conditions/{condition}/file_{id}/run_{n}.js
    7. Create git commit with metadata in message
    8. Push to GitHub
    9. Poll SonarCloud until analysis completes
    10. Extract metrics from SonarCloud API
    11. Update state + CSV
    12. Loop
    """
```

### Input Requirements

- **unified_experimental_dataset_shell.csv** — Read-only; source of truth for files/conditions/prompts
- **sample_source_code/** — Directory with original .js/.ts files (for reference/archiving)
- **sonar-project.properties** — Configured for the experiment repo
- **.env** — SONAR_TOKEN, ANTHROPIC_API_KEY, GITHUB_TOKEN
- **experiment_state.json** — Persisted state (created on first run)

### Output Artifacts

Per run:
- **Git commit** — One per run with structured metadata in message
- **Code file** — `conditions/{condition}/file_{file_id}/run_{run_number}.js`
- **State update** — Incremental update to `experiment_state.json`
- **Log entry** — Timestamped log line in `experiment.log`
- **CSV row update** — Append post-refactoring metrics to unified_experimental_dataset_shell.csv

### Error Handling

**Retriable Errors:**
- SonarCloud analysis timeout (retry after 30 seconds)
- Transient network failures (exponential backoff: 1s, 2s, 4s, 8s, max 60s)
- Claude API rate limit (exponential backoff)

**Non-retriable Errors:**
- Invalid refactored code syntax (mark FAILED, log details)
- Missing source file (mark FAILED, skip)
- Malformed CSV row (mark FAILED, skip)

**Failure Recovery:**
- All failed runs stored in state with full error context
- User can run `retry --stage SONAR_METRIC_EXTRACTION` to retry specific stage
- User can run `retry --file-id 5 --condition nfr_generic` to retry specific file

---

## 4. Monitoring CLI Design: `monitor_cli.py`

### Command-Line Interface

```bash
# Start the orchestration in background
python orchestrate_experiments.py --daemon

# Interactive monitoring (main window)
python monitor_cli.py

# Commands (within monitor_cli or as CLI flags)
status                          # Show full dashboard
status --summary                # Show 1-line summary
status --failed                 # Show only failed runs
status --file-id 5              # Show runs for file 5

pause                           # Pause after current run completes
pause --immediate               # Pause now (mid-run not yet committed)

resume                          # Resume from paused state

retry --record-id 127           # Retry specific failed run
retry --file-id 5               # Retry all failed runs for file 5
retry --condition nfr_generic   # Retry all failed nfr_generic runs
retry --stage SONAR_METRIC_EXTRACTION  # Retry all runs stuck at this stage

logs --tail 50                  # Show last 50 log lines
logs --file-id 5                # Show all logs for file 5
logs --errors                   # Show all error log entries

export --format csv             # Export current state to CSV
export --format json            # Export current state to JSON

estimate-time                   # ETA based on current pace

reset --record-id 127           # Reset a run to PENDING (use with caution)
skip --record-id 127            # Mark run SKIPPED (don't run it)
```

### Real-Time Dashboard

When running `monitor_cli.py` (or via `orchestrate_experiments.py --monitor`):

```
╔════════════════════════════════════════════════════════════════════╗
║           DISSERTATION EXPERIMENT ORCHESTRATION MONITOR             ║
║                        Started: 2026-03-19 14:00                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Status: RUNNING (pause available)                                 ║
║                                                                    ║
║  Progress:  [████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  9.7%     ║
║             128 / 1,314 completed                                  ║
║                                                                    ║
║  Breakdown by status:                                              ║
║    ✓ COMPLETED:   128  (9.7%)                                      ║
║    ⧖ IN_PROGRESS:   1  (0.1%)  [File 5, baseline, run 2]          ║
║    ✗ FAILED:        3  (0.2%)  [retry available]                  ║
║    ⋯ PENDING:    1183  (90.0%)                                     ║
║                                                                    ║
║  Current Run: File 5 | baseline | Run 2                            ║
║    Stage: SONAR_METRIC_EXTRACTION (74s elapsed)                   ║
║    Next action: Poll SonarCloud (next poll in 3s)                 ║
║                                                                    ║
║  Recent Completions:                                               ║
║    ✓ File 5 baseline run 1     → CC: 140→135 (Δ-5)     [2m 34s]  ║
║    ✓ File 4 baseline run 3     → CC: 126→123 (Δ-3)     [2m 41s]  ║
║    ✓ File 4 baseline run 2     → CC: 126→120 (Δ-6)     [2m 38s]  ║
║                                                                    ║
║  Failures (retriable):                                              ║
║    ✗ File 3 nfr_generic run 1  [SONAR_METRIC_EXTRACTION timeout]  ║
║    ✗ File 2 adaptive_nfr run 2 [Claude API rate limit]            ║
║    ✗ File 1 baseline run 2     [Git push timeout]                 ║
║                                                                    ║
║  Performance Metrics:                                              ║
║    Avg duration per run:      2m 38s                               ║
║    Runs/hour (current pace):  22.8                                 ║
║    Estimated completion:      2026-03-27 11:30 (8 days, 21h)      ║
║    Total tokens used:         361,847 / ∞                          ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║  Commands: pause | resume | retry [--file-id 5] | logs [--tail 20]║
║  Type 'help' for full command list                                 ║
╚════════════════════════════════════════════════════════════════════╝
```

### Monitoring Features

**Real-time updates:**
- Current run status (which file, condition, run #)
- Current stage within the run pipeline
- Time elapsed on current stage
- Next expected action (e.g., "Poll SonarCloud in 3s")

**Aggregated statistics:**
- Completion % with progress bar
- Breakdown by status (COMPLETED, FAILED, IN_PROGRESS, PENDING)
- Count of failed runs with retriable vs. non-retriable errors

**Recent activity feed:**
- Last 5-10 completed runs with CC delta
- Last 3 errors with stage/error type
- Pause/resume events

**Performance tracking:**
- Average duration per run
- Runs per hour (moving average)
- ETA to completion (based on current pace)
- Total LLM tokens consumed

**Interactive commands:**
- Pause/resume at any point
- Retry failed runs (by file, condition, stage, or record ID)
- View detailed logs
- Export state for analysis

---

## 5. Git Commit Strategy

### Commit Message Format

Each run gets a single atomic commit with structured metadata:

```
File {file_id:04d} | {project_name} | {condition} | Run {run_number}

Commit metadata (YAML-style header):
---
record_id: 1
file_id: 1
project_name: Ghost
file_name: newsletter-detail-modal.tsx
condition: baseline
run_number: 1
llm_model: claude-sonnet-4-6
llm_temperature: 0.0
prompt_tokens: 1247
completion_tokens: 1600
total_tokens: 2847
timestamp: 2026-03-19T14:00:05Z
---

Refactored code for {file_name} addressing SonarCloud issue {sonar_rule_id}.
Pre-refactoring CC: {pre_cc}
Expected post-refactoring CC: {expected_post_cc}

Code path: conditions/{condition}/file_{file_id:04d}/run_{run_number}.js
```

### Benefits of Per-Run Commits

- **Full auditability** — Can inspect git history to see which runs succeeded/failed
- **Recovery point** — If orchestration crashes, can resume from last successful commit
- **Reproducibility** — Each commit references exact LLM invocation details
- **SonarCloud linkage** — Component keys can be mapped back to git commits

### Example Commit History

```
abc1234 File 0001 | Ghost | baseline | Run 1
def5678 File 0001 | Ghost | baseline | Run 2
ghi9012 File 0001 | Ghost | baseline | Run 3
jkl3456 File 0001 | Ghost | nfr_generic | Run 1
mno7890 File 0001 | Ghost | nfr_generic | Run 2
[PUSH FAILS HERE — need to retry]
...
```

---

## 6. SonarCloud Integration

### Component Key Generation

For each run, generate a unique SonarCloud component key:

```
dissertation-experiments:conditions/{condition}/file_{file_id:04d}/run_{run_number}
```

Examples:
- `dissertation-experiments:conditions/baseline/file_0001/run_1`
- `dissertation-experiments:conditions/nfr_generic/file_0001/run_1`
- `dissertation-experiments:conditions/adaptive_nfr/file_0050/run_3`

### SonarCloud Polling Strategy

After pushing code to GitHub:

1. **Wait 2 seconds** — Give SonarCloud time to queue analysis
2. **Poll every 5 seconds** — Check if analysis is complete
3. **Timeout after 300 seconds** — Mark as retriable error
4. **Extract metrics** — When status = "SUCCESS", fetch:
   - `complexity` (Cyclomatic Complexity)
   - `cognitive_complexity` (Cognitive Complexity)
   - `ncloc` (Non-comment lines of code)

### Handling Analysis Delays

SonarCloud can take 2-5 minutes per file. The orchestrator:
- Does NOT block on one run; polls in background
- While waiting for SonarCloud, processes other runs in parallel (if desired)
- Records timestamps in state for analysis later
- Treats SonarCloud timeouts as retriable (can retry manually)

---

## 7. Data Persistence & Recovery

### Checkpoint Strategy

After each atomic operation, state is written to disk:

**Checkpoint 1:** After Claude API returns code
```json
{
  "record_id": 1,
  "status": "IN_PROGRESS",
  "stage": "CODE_GENERATION",
  "refactored_code": "...",
  "llm_tokens_used": 2847,
  "timestamp": "2026-03-19T14:00:15Z"
}
```

**Checkpoint 2:** After git commit succeeds
```json
{
  "status": "IN_PROGRESS",
  "stage": "GIT_COMMIT",
  "git_commit_hash": "abc123def456",
  "timestamp": "2026-03-19T14:00:20Z"
}
```

**Checkpoint 3:** After SonarCloud metrics extracted
```json
{
  "status": "COMPLETED",
  "stage": "CSV_UPDATE",
  "post_metrics": {...},
  "sonar_analysis_date": "2026-03-19T14:03:12Z",
  "timestamp": "2026-03-19T14:03:15Z"
}
```

### Recovery from Crash

If orchestrator crashes mid-run:

1. Operator resumes: `python orchestrate_experiments.py`
2. Script loads `experiment_state.json`
3. Finds incomplete runs:
   - If stuck at CODE_GENERATION → Retry Claude call
   - If stuck at GIT_COMMIT → Check git; if commit exists, resume at SONAR_QUEUE_CHECK
   - If stuck at SONAR_METRIC_EXTRACTION → Resume polling
4. Resumes from last checkpoint

---

## 8. Logging Strategy

### Log Levels & Destinations

**experiment.log** (all levels):
```
[2026-03-19 14:00:05.123] [INFO]  Experiment started. Total runs: 1314
[2026-03-19 14:00:10.456] [INFO]  Record 1 | File 1 | baseline | Run 1 → CODE_GENERATION starting
[2026-03-19 14:00:11.789] [DEBUG] Claude API request: 1247 tokens
[2026-03-19 14:00:14.234] [DEBUG] Claude API response: 2847 tokens
[2026-03-19 14:00:14.567] [INFO]  Record 1 → CODE_GENERATION complete (3.1s)
[2026-03-19 14:00:15.012] [DEBUG] Refactored code written to conditions/baseline/file_0001/run_1.js
[2026-03-19 14:00:20.456] [INFO]  Record 1 → GIT_COMMIT complete (hash: abc123def456)
[2026-03-19 14:00:21.234] [DEBUG] Pushing to GitHub...
[2026-03-19 14:00:25.789] [INFO]  Record 1 → GIT_PUSH complete
[2026-03-19 14:00:27.567] [DEBUG] SonarCloud component key: dissertation-experiments:conditions/baseline/file_0001/run_1
[2026-03-19 14:00:27.901] [DEBUG] Polling SonarCloud... (attempt 1/60)
[2026-03-19 14:00:32.345] [DEBUG] Analysis status: PENDING
[2026-03-19 14:00:37.789] [DEBUG] Analysis status: IN_PROGRESS
[2026-03-19 14:00:43.234] [DEBUG] Analysis status: SUCCESS
[2026-03-19 14:00:43.567] [INFO]  Record 1 → SONAR_METRIC_EXTRACTION complete
[2026-03-19 14:00:43.890] [DEBUG] Extracted metrics: CC=135, Cognitive=38, ncloc=820
[2026-03-19 14:00:44.012] [INFO]  Record 1 → CSV_UPDATE complete
[2026-03-19 14:00:44.123] [INFO]  Record 1 → COMPLETED (159.1s total)
[2026-03-19 14:00:44.234] [INFO]  128 / 1314 completed (9.7%), 3 failed, 1183 pending
```

**experiment_errors.log** (ERROR and above):
```
[2026-03-19 14:15:32.123] [ERROR] Record 127 | File 5 | nfr_generic | Run 1 failed at SONAR_METRIC_EXTRACTION
  Error Type: SonarCloudTimeoutError
  Message: Analysis did not complete within 300 seconds
  Retriable: true
  Full stack trace: ...
```

**experiment_debug.log** (DEBUG and above, for detailed troubleshooting):
- Full Claude API requests/responses
- Full SonarCloud API responses
- Git command output
- Network timing details

### Log Rotation

- Main log rotates at 100MB or daily
- Keep last 10 rotated files
- Compress older logs to `.gz`

---

## 9. Retry Mechanism

### Retry Rules

**Automatic retries (built-in):**
- Claude API rate limit → Exponential backoff (max 3 retries)
- Network transient errors → Exponential backoff (max 3 retries)
- SonarCloud timeout → Exponential backoff (max 3 retries)

**Manual retries (user command):**

```bash
# Retry specific record
python monitor_cli.py retry --record-id 127

# Retry all failed runs
python monitor_cli.py retry

# Retry by file
python monitor_cli.py retry --file-id 5

# Retry by condition
python monitor_cli.py retry --condition nfr_generic

# Retry from specific stage onward
python monitor_cli.py retry --stage SONAR_METRIC_EXTRACTION
```

### Retry State Transitions

When user runs `retry --record-id 127`:
1. Find record in state
2. If status = FAILED and is_retriable = true:
   - Reset status to PENDING
   - Determine failure stage
   - Set next_stage to that stage (or earliest retriable stage)
   - Increment retry_count
   - Save state
3. Orchestrator picks up run on next iteration
4. Log retry attempt with retry_count

### Retry Limits

- Max 3 automatic retries per stage
- Max 5 manual retries per record
- After max retries exceeded, mark as NON_RETRIABLE

---

## 10. Data Flow: CSV Updates

### unified_experimental_dataset_shell.csv Updates

The orchestrator appends post-refactoring metrics **only after all stages complete**:

**Before run:**
```csv
record_id, ..., refactoring_applied, post_cyclomatic_complexity, post_cognitive_complexity, post_ncloc, cc_delta, ...
1, ..., , , , , , ...
```

**After run completes:**
```csv
record_id, ..., refactoring_applied, post_cyclomatic_complexity, post_cognitive_complexity, post_ncloc, cc_delta, ...
1, ..., Y, 135, 38, 820, -5, ...
```

**Append-only strategy:**
- Orchestrator does NOT overwrite existing rows
- Only appends/updates metrics columns
- If row is incomplete at crash, can resume from last checkpoint

---

## 11. System Requirements

### Dependencies

```
anthropic>=0.7.0              # Claude API client
requests>=2.31.0              # HTTP client for SonarCloud
python-dotenv>=1.0.0          # Load .env
GitPython>=3.1.30             # Git operations
pandas>=2.0.0                 # CSV handling
pyyaml>=6.0                   # YAML parsing for commit messages
tqdm>=4.65.0                  # Progress bars
rich>=13.0.0                  # Rich terminal output
click>=8.1.0                  # CLI framework
pydantic>=2.0.0               # Data validation
pytest>=7.0.0                 # Testing (for validation)
```

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-...              # Claude API
SONAR_TOKEN=sqa...                    # SonarCloud auth
SONAR_ORG=dhillii                     # SonarCloud org
GITHUB_TOKEN=ghp_...                  # GitHub push auth
GITHUB_REPO=your-org/dissertation-experiments
EXPERIMENT_REPO_PATH=./dissertation-experiments
LOGLEVEL=INFO                         # DEBUG, INFO, WARNING, ERROR
```

### Storage Requirements

- Git repository: ~500 MB (1,314 files + history)
- State file: ~2-3 MB (JSON, highly compressible)
- Logs: ~100-200 MB (rotate after 10 rotations)
- CSV: ~5 MB

**Total: ~1 GB**

---

## 12. Success Criteria & Validation

### Pre-Execution Checklist

- [ ] `.env` file configured with all API tokens
- [ ] GitHub repo created and SonarCloud project linked
- [ ] `sonar-project.properties` configured
- [ ] `unified_experimental_dataset_shell.csv` loaded and validated
- [ ] `sample_source_code/` directory populated with 146 original files
- [ ] Test run on 1 record succeeds (code → commit → SonarCloud metrics)

### Per-Run Validation

After each run completes:
- [ ] Git commit created with correct message format
- [ ] Code file exists in correct location
- [ ] SonarCloud metrics extracted and non-zero
- [ ] CSV row updated with post_* columns
- [ ] State file updated with no data loss

### Post-Experiment Validation

After all 1,314 runs:
- [ ] 100% of records have COMPLETED or FAILED status
- [ ] No PENDING records remain
- [ ] No IN_PROGRESS records (unless explicitly paused)
- [ ] All failed records marked is_retriable=true or false appropriately
- [ ] CSV has post_* columns populated for all COMPLETED records
- [ ] Git history shows 1,314 commits (one per run)
- [ ] No data corruption in state file

---

## 13. Scripts to Build

### Priority 1 (Core)

1. **orchestrate_experiments.py**
   - ~800-1000 lines
   - Main execution engine
   - Imports: state_manager, experiment_repo_manager, claude_caller, sonarcloud_poller

2. **state_manager.py**
   - ~300-400 lines
   - Persistent state handling
   - Exports: StateManager class

3. **experiment_repo_manager.py**
   - ~200-300 lines
   - Git operations
   - Exports: ExperimentRepoManager class

4. **monitor_cli.py**
   - ~400-500 lines
   - Interactive CLI for monitoring
   - Exports: interactive commands, dashboard rendering

### Priority 2 (Support)

5. **claude_caller.py**
   - ~150-200 lines
   - Wraps Claude API with retry logic
   - Exports: ClaudeCaller class

6. **sonarcloud_poller.py**
   - ~200-300 lines
   - Polls SonarCloud API until metrics ready
   - Exports: SonarCloudPoller class

7. **logger_config.py**
   - ~150-200 lines
   - Logging setup (file, level, rotation)
   - Exports: get_logger(), setup_logging()

### Priority 3 (Utilities)

8. **validation.py**
   - ~150-200 lines
   - Pre/post-run validation checks
   - Exports: validate_environment(), validate_csv(), etc.

9. **config.py**
   - ~100-150 lines
   - Constants, defaults, timeouts
   - Exports: CONFIG dict

10. **test_orchestration.py**
    - ~300-400 lines
    - Unit tests for critical components
    - Coverage: state transitions, retry logic, git operations

---

## 14. Execution Timeline

### Estimated per-run breakdown:

- Claude API call: **30-60 seconds** (including latency)
- Git commit + push: **10-15 seconds**
- SonarCloud polling: **60-180 seconds** (analysis + retry delays)
- CSV update: **1-2 seconds**
- **Total per run: 2.5-4 minutes** (avg 3 min)

### Total experiment duration:

- 1,314 runs × 3 min average = **~66 hours**
- With optimal concurrency (if implemented): 15-20 hours
- Recommended: **Run continuously for 3-4 days** (account for API delays, failures, retries)

---

## 15. Failure Modes & Mitigation

| Failure Mode | Symptom | Mitigation |
|---|---|---|
| Claude API outage | All runs timeout | Pause, wait, resume with exponential backoff |
| SonarCloud outage | Metrics extraction stuck | Retry manually when SonarCloud recovers |
| GitHub rate limit | Push fails | Exponential backoff, split commits |
| Disk full | State write fails | Monitor disk; alert at 80% capacity |
| CSV corruption | Rows unparseable | Keep backup; recover from state file |
| Network partition | All API calls fail | Pause, reconnect, resume |
| LLM generates bad code | SonarCloud rejects code | Mark FAILED, log code snippet, skip |

---

## 16. Post-Experiment Analysis

After all runs complete:

1. **Export state to CSV** — `python monitor_cli.py export --format csv`
2. **Merge post-metrics into main CSV** — Join experiment results with unified_experimental_dataset_shell.csv
3. **Compute deltas** — CC_delta = post_cc - pre_cc (for each run)
4. **Aggregate by condition** — Mean delta, std dev, 95% CI per condition
5. **Statistical tests** — Paired t-tests (baseline vs. nfr_generic, baseline vs. adaptive_nfr)
6. **Subgroup analysis** — By project (Ghost vs. Strapi vs. others), by archetype, by baseline CC quartile
7. **Generate tables** — For Chapter 4 (Results)

---

## Summary

This orchestration system is designed to:

✅ **Execute 1,314 LLM-based refactoring experiments reliably**
✅ **Provide real-time monitoring and progress visibility**
✅ **Support pause/resume for operational flexibility**
✅ **Enable targeted retries for failed runs**
✅ **Maintain full audit trail via git commits**
✅ **Persist state for crash recovery**
✅ **Integrate with SonarCloud for post-refactoring metrics**
✅ **Output analysis-ready data (CSV) for statistical testing**

The system prioritizes **auditability**, **recoverability**, and **observability** — essential for dissertation-grade research.

---

**Document Version:** 1.0
**Last Updated:** 2026-03-19
**Status:** Design Review Complete, Ready for Implementation

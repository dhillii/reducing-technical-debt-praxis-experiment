# Dissertation Experiment Orchestration System

[![Status](https://img.shields.io/badge/status-ready-green.svg)](README.md)
[![Python](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![Architecture](https://img.shields.io/badge/architecture-layered-blue.svg)](#-architecture)

Automated system for executing large-scale LLM-based code refactoring experiments on 146 open-source JavaScript/TypeScript files using Claude AI and SonarCloud analysis.

## 🎯 Overview

This system orchestrates **1,314 refactoring experiments** across:
- **146 source files** from 14 open-source projects
- **3 prompt conditions** (baseline, NFR-enriched, adaptive NFR)
- **3 runs per condition** (systematic variation)
- **Complete audit trail** via git commits and metrics

| Metric | Value |
|--------|-------|
| Total Runs | 1,314 |
| Files | 146 |
| Conditions | 3 |
| Execution Time | 66-80 hours |
| Cost | $50-70 |
| Git Commits | 1,314 |

## 🏗️ Architecture

**4-Layer Modular Design:**

```
┌──────────────────────────────────┐
│  Monitoring & CLI Layer          │
│  (Dashboard, Daemon Control)     │
└────────────┬─────────────────────┘
             │
┌────────────▼─────────────────────┐
│  Orchestration Layer             │
│  (Main Loop, State, Git Ops)     │
└────────┬──────────────┬──────────┘
         │              │
┌────────▼──┐  ┌────────▼──────┐
│ API Layer │  │ External APIs │
└───────────┘  └────────────────┘

┌──────────────────────────────────┐
│  Utilities & Configuration       │
│  (Config, Logging, Validation)   │
└──────────────────────────────────┘
```

## 📁 Directory Structure

```
orchestration/           # Execution engine
├── orchestrate_experiments.py
├── state_manager.py
└── experiment_repo_manager.py

api/                     # API integrations
├── claude_caller.py
└── sonarcloud_poller.py

monitoring/              # CLI & monitoring
├── monitor_cli.py
└── daemon_manager.py

utils/                   # Configuration & utilities
├── config.py
├── logger_config.py
├── validation.py
├── clone_source_files.py
└── find_missing_files.py

tests/                   # Test suite
└── test_orchestration.py
```

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment
nano .env
```

**Required in `.env`:**
```bash
ANTHROPIC_API_KEY=sk-ant-...
SONAR_TOKEN=sqa_...
SONAR_ORG=dhillii
GITHUB_TOKEN=ghp_...
GITHUB_REPO=dhillii/reducing-technical-debt-praxis-experiment
EXPERIMENT_REPO_PATH=./
LOGLEVEL=INFO
```

### 2. Validate Setup

```bash
python scripts/orchestrate_experiments.py validate
```

### 3. Start Orchestration

**Option A: Foreground (interactive)**
```bash
python scripts/orchestrate_experiments.py run --max-runs 10
```

**Option B: Background (daemon)**
```bash
python scripts/daemon_manager.py start
python scripts/daemon_manager.py status
python scripts/daemon_manager.py logs --follow
```

### 4. Monitor Progress

```bash
# Real-time dashboard
python scripts/monitor_cli.py monitor

# Status summary
python scripts/monitor_cli.py status --summary

# Show failed runs
python scripts/monitor_cli.py status --failed
```

### 5. Control Orchestration

```bash
# Pause/resume
python scripts/monitor_cli.py pause
python scripts/monitor_cli.py resume

# Retry failed runs
python scripts/monitor_cli.py retry --record-id 5
python scripts/monitor_cli.py retry --file-id 10
python scripts/monitor_cli.py retry --condition nfr_generic
python scripts/monitor_cli.py retry --stage SONAR_METRIC_EXTRACTION

# View logs
python scripts/monitor_cli.py logs --tail 100
python scripts/monitor_cli.py logs --errors
```

## Scripts Overview

### 1. orchestrate_experiments.py (Main Engine)

The primary orchestration engine that executes the full 7-stage pipeline for each run.

**Stages:**
1. CODE_GENERATION - Call Claude API with refactoring prompt
2. CODE_VALIDATION - Syntax check on generated code
3. GIT_COMMIT - Create atomic git commit with metadata
4. GIT_PUSH - Push to GitHub
5. SONAR_QUEUE_CHECK - Verify SonarCloud received code
6. SONAR_METRIC_EXTRACTION - Poll SonarCloud for metrics
7. CSV_UPDATE - Append results to CSV

**Usage:**
```bash
python orchestrate_experiments.py run --max-runs 100 --validate
python orchestrate_experiments.py validate
```

### 2. state_manager.py (State Persistence)

Thread-safe JSON-based state management with automatic persistence.

**Key Features:**
- ACID-like writes (atomic file operations)
- State transitions (PENDING → IN_PROGRESS → COMPLETED/FAILED)
- Error tracking with retriable classification
- Metrics storage (post-refactoring complexity metrics)
- Recovery from crashes (resume from last checkpoint)

**Example Usage:**
```python
from state_manager import StateManager, ExperimentRun

manager = StateManager()
run = ExperimentRun(record_id="1", file_id=1, ...)
manager.add_run(run)
manager.update_run_status("1", "IN_PROGRESS")
manager.add_error_to_run("1", stage="CODE_GENERATION", ...)
```

### 3. experiment_repo_manager.py (Git Operations)

Manages git commits, pushes, and code file organization.

**Features:**
- Atomic per-run commits with structured metadata
- Directory structure: `conditions/{condition}/file_{id:04d}/run_{n}.js`
- SonarCloud component key generation
- Automatic author configuration

**Example:**
```python
from experiment_repo_manager import ExperimentRepoManager

manager = ExperimentRepoManager()
manager.ensure_repo_exists()
manager.write_code_file(condition="baseline", file_id=1, run_number=1, code="...")
manager.create_commit(record_id=1, file_id=1, ...)
manager.push_to_remote()
```

### 4. monitor_cli.py (Interactive Monitoring)

Real-time dashboard and control interface for orchestration.

**Commands:**
```bash
# Dashboard
python monitor_cli.py monitor --refresh 2

# Status
python monitor_cli.py status --summary
python monitor_cli.py status --failed
python monitor_cli.py status --file-id 5

# Control
python monitor_cli.py pause
python monitor_cli.py resume

# Retry
python monitor_cli.py retry --record-id 127
python monitor_cli.py retry --file-id 10
python monitor_cli.py retry --condition adaptive_nfr
python monitor_cli.py retry --stage SONAR_METRIC_EXTRACTION

# Logs
python monitor_cli.py logs --tail 50
python monitor_cli.py logs --errors

# Export
python monitor_cli.py export --format json
python monitor_cli.py export --format csv
```

### 5. claude_caller.py (Claude API Wrapper)

Wraps Anthropic API with automatic retry and exponential backoff.

**Features:**
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (max)
- Automatic retry on rate limits and transient errors
- Code extraction from markdown-wrapped responses
- Token usage tracking

**Example:**
```python
from claude_caller import ClaudeCaller

caller = ClaudeCaller()
response = caller.call(
    prompt="Refactor this code...",
    system_prompt="You are a code refactoring expert...",
    max_tokens=4096
)
print(response['total_tokens'])
```

### 6. sonarcloud_poller.py (SonarCloud Metrics)

Polls SonarCloud API until analysis completes and metrics are available.

**Features:**
- 5-second polling intervals
- 300-second analysis timeout
- Exponential backoff on API errors
- Metrics extraction: cyclomatic complexity, cognitive complexity, ncloc

**Example:**
```python
from sonarcloud_poller import SonarCloudPoller

poller = SonarCloudPoller()
result = poller.wait_for_analysis_completion(
    component_key="dissertation-experiments:conditions/baseline/file_0001/run_1",
    timeout=300
)
metrics = result['metrics']
```

### 7. logger_config.py (Logging Setup)

Structured logging to multiple files with different levels.

**Output Files:**
- `experiment.log` - All INFO+ messages
- `experiment_errors.log` - ERROR+ messages only
- `experiment_debug.log` - DEBUG+ messages (detailed)

**Features:**
- Rotating file handlers (100MB per file, 10 backups)
- Console output (configurable level)
- ISO timestamp formatting
- Thread-safe writes

**Usage:**
```python
from logger_config import setup_logging, get_logger

setup_logging("DEBUG")
logger = get_logger("my_module")
logger.info("Message")
```

### 8. validation.py (Pre-Execution Checks)

Validates environment, CSV structure, source code, and state file integrity.

**Validations:**
- Environment variables (ANTHROPIC_API_KEY, SONAR_TOKEN, etc.)
- CSV file structure and data completeness
- Source code directory and file availability
- Code syntax (brace/bracket balancing)
- State file JSON integrity

**Usage:**
```bash
python orchestrate_experiments.py validate
```

**Code:**
```python
from validation import run_all_validations, get_validation_report

valid, results = run_all_validations()
print(get_validation_report())
```

### 9. config.py (Constants & Configuration)

Centralized configuration for all system parameters.

**Includes:**
- API endpoints and timeouts
- Retry settings (backoff, max retries)
- Logging configuration
- File paths
- SonarCloud parameters
- Error type classifications

**Usage:**
```python
from config import (
    ANTHROPIC_API_KEY,
    SONARCLOUD_POLL_TIMEOUT,
    CLAUDE_MODEL,
    MAX_AUTOMATIC_RETRIES
)
```

### 10. test_orchestration.py (Unit Tests)

Comprehensive test suite for core functionality.

**Tests:**
- State transitions and persistence
- Retry logic and exponential backoff
- Git commit creation with metadata
- SonarCloud polling and timeouts
- Error handling and classification

**Run tests:**
```bash
# All tests
python -m pytest scripts/test_orchestration.py

# Specific test
python -m pytest scripts/test_orchestration.py::TestStateManager::test_add_and_get_run

# With coverage
python -m pytest scripts/test_orchestration.py --cov=scripts
```

### 11. daemon_manager.py (Background Processing)

Manages orchestration as a background daemon process.

**Commands:**
```bash
python daemon_manager.py start --max-runs 1000
python daemon_manager.py status
python daemon_manager.py logs --tail 100 --follow
python daemon_manager.py stop
python daemon_manager.py stop --force
python daemon_manager.py restart
```

**Features:**
- PID-based process management
- Graceful shutdown (SIGTERM)
- Force kill if needed (SIGKILL)
- Real-time log following
- Process status monitoring (with psutil)

## Execution Flow

### Complete Run Pipeline

```
1. Load state from disk
   ↓
2. Find next PENDING run
   ↓
3. Mark as IN_PROGRESS
   ↓
4. CODE_GENERATION
   ├─ Load original source code
   ├─ Build refactoring prompt
   ├─ Call Claude API
   ├─ Extract code from response
   └─ Save tokens/model info
   ↓
5. CODE_VALIDATION
   ├─ Check for empty code
   ├─ Validate syntax (brace matching)
   └─ Mark stage complete
   ↓
6. GIT_COMMIT
   ├─ Write refactored code to file
   ├─ Create structured commit message (YAML metadata)
   ├─ Stage changes
   └─ Create commit
   ↓
7. GIT_PUSH
   ├─ Push to remote
   └─ Handle auth/network errors
   ↓
8. SONAR_QUEUE_CHECK
   ├─ Generate SonarCloud component key
   └─ Store in state
   ↓
9. SONAR_METRIC_EXTRACTION
   ├─ Wait 2 seconds for SonarCloud to queue
   ├─ Poll every 5 seconds
   ├─ Timeout after 300 seconds
   ├─ Extract metrics (CC, cognitive CC, ncloc)
   └─ Store in state
   ↓
10. CSV_UPDATE
    ├─ Calculate CC delta
    ├─ Update post_* columns
    ├─ Append git commit hash
    └─ Save CSV
    ↓
11. Mark as COMPLETED
    ↓
12. Log duration and metrics
```

## Error Handling

### Retriable Errors
- SonarCloud analysis timeout → Retry after 30s
- Claude API rate limit → Exponential backoff
- Network transient failures → Exponential backoff
- Git push timeout → Retry after delay

### Non-Retriable Errors
- Invalid generated code syntax → Mark FAILED, skip
- Missing source file → Mark FAILED, skip
- CSV parsing errors → Mark FAILED, skip

### Recovery Strategy
1. On crash: Resume from last checkpoint
2. Manual retry: `python monitor_cli.py retry --record-id 5`
3. Bulk retry: `python monitor_cli.py retry --condition nfr_generic`

## State File Format

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
      "record_id": "1",
      "file_id": 1,
      "project_name": "Ghost",
      "file_name": "newsletter-detail-modal.tsx",
      "condition": "baseline",
      "run_number": 1,
      "status": "COMPLETED",
      "started_at": "2026-03-19T14:00:05Z",
      "completed_at": "2026-03-19T14:02:45Z",
      "duration_seconds": 160.0,
      "llm_tokens_used": 2847,
      "llm_model": "claude-sonnet-4-6",
      "llm_temperature": 0.0,
      "prompt_tokens": 1247,
      "completion_tokens": 1600,
      "git_commit_hash": "abc123def456",
      "sonar_component_key": "dissertation-experiments:conditions/baseline/file_0001/run_1",
      "sonar_analysis_status": "SUCCESS",
      "sonar_analysis_date": "2026-03-19T14:03:12Z",
      "post_metrics": {
        "cyclomatic_complexity": 135,
        "cognitive_complexity": 38,
        "ncloc": 820
      },
      "cc_delta": -5,
      "retry_count": 0,
      "errors": []
    }
  }
}
```

## Performance Expectations

### Per-Run Timing
- Claude API call: 30-60 seconds
- Git commit + push: 10-15 seconds
- SonarCloud polling: 60-180 seconds
- CSV update: 1-2 seconds
- **Total: 2.5-4 minutes per run (average 3 min)**

### Total Experiment
- 1,314 runs × 3 min = ~66 hours continuous
- With retries and failures: +20-30%
- **Recommended: 3-4 days of continuous execution**

### Resource Usage
- Disk: ~1 GB (git repo + logs + state)
- Memory: ~200 MB (Python process)
- CPU: Low (mostly I/O waiting)
- Network: ~5-10 MB per run (code + metrics)

## Development & Testing

### Run Unit Tests
```bash
cd scripts
python -m pytest test_orchestration.py -v
```

### Check Code Quality
```bash
black scripts/
flake8 scripts/ --max-line-length=100
mypy scripts/ --ignore-missing-imports
```

### Debug Execution
```bash
LOGLEVEL=DEBUG python orchestrate_experiments.py run --max-runs 1
tail -f experiment_debug.log
```

## Troubleshooting

### Claude API Failures
```bash
# Check logs
tail -f experiment_errors.log | grep "Claude"

# Test connection
python -c "from claude_caller import ClaudeCaller; c = ClaudeCaller(); print(c.client)"
```

### SonarCloud Timeouts
```bash
# Check SonarCloud status
# Try manual retry for specific runs
python monitor_cli.py retry --stage SONAR_METRIC_EXTRACTION
```

### Git Auth Errors
```bash
# Verify GitHub token is set
echo $GITHUB_TOKEN

# Test git push
cd $EXPERIMENT_REPO_PATH
git push
```

### Disk Issues
```bash
# Check disk usage
du -sh .

# Archive old logs
gzip experiment_*.log.*
```

## Production Deployment

### Pre-Flight Checklist
- [ ] All environment variables configured
- [ ] GitHub repo created and SonarCloud project linked
- [ ] Test run on 1-5 records succeeds
- [ ] Validation checks pass
- [ ] Logs directory writable
- [ ] State file directory writable
- [ ] Disk space available (1+ GB)

### Recommended Setup
```bash
# Run in tmux/screen for persistent background execution
tmux new-session -d -s dissertation
tmux send-keys -t dissertation "cd /path/to/code && python scripts/daemon_manager.py start" Enter

# Monitor in separate window
tmux new-window -t dissertation
tmux send-keys -t dissertation "cd /path/to/code && python scripts/monitor_cli.py monitor" Enter
```

## License & Attribution

Dissertation Experiment Orchestration System
Part of: "Reducing Technical Debt in Legacy Codebases through AI-Enabled Prompt Refinement"
George Washington University

---

**Document Version:** 1.0
**Last Updated:** 2026-03-19
**Status:** Production Ready

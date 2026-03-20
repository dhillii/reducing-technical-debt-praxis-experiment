# System Architecture

## Layered Architecture

The system is organized into 4 layers plus supporting modules:

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI & MONITORING                         │
│  monitoring/monitor_cli.py    monitoring/daemon_manager.py  │
│  (Dashboard)                  (Process Control)             │
└─────────────┬───────────────────────────────────────────────┘
              │ Controls & Status
              │
┌─────────────▼───────────────────────────────────────────────┐
│              ORCHESTRATION ENGINE                           │
│  orchestration/orchestrate_experiments.py                   │
│  orchestration/state_manager.py                             │
│  orchestration/experiment_repo_manager.py                   │
│  (Core loop, state, git operations)                         │
└─────────────┬─────────────┬───────────────────────────────┬─┘
              │             │                               │
     Sends prompts   Writes code          Reads metrics    │
              │             │                               │
┌─────────────▼──┐  ┌──────▼──────────┐  ┌────────────────▼──┐
│  API LAYER     │  │   FILE SYSTEM   │  │   EXTERNAL APIs   │
├────────────────┤  ├─────────────────┤  ├───────────────────┤
│ Claude API     │  │ Git repos       │  │ SonarCloud API    │
│ (claude_caller)│  │ (experiment_repo)  │ (sonarcloud_      │
│                │  │                 │  │  poller)          │
└────────────────┘  └─────────────────┘  └───────────────────┘
              │                               │
              └──────────────┬────────────────┘
                    External Services
              GitHub, SonarCloud, Anthropic

┌─────────────────────────────────────────────────────────────┐
│                    UTILITIES LAYER                          │
│  utils/config.py           (Configuration & constants)      │
│  utils/logger_config.py    (Logging setup)                  │
│  utils/validation.py       (Pre-execution checks)           │
│  utils/clone_source_files.py (GitHub extraction)            │
│  utils/find_missing_files.py (File recovery)                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                               │
│  unified_experimental_dataset_shell.csv (Input)             │
│  experiment_state.json (Progress tracking)                  │
│  sample_source_code/ (Source files)                         │
│  dissertation-experiments/ (Output git repo)                │
└─────────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### Orchestration Layer (`orchestration/`)

**orchestrate_experiments.py**
- Main loop that processes runs sequentially
- Executes 7 stages per run:
  1. CODE_GENERATION - Call Claude API
  2. CODE_VALIDATION - Check syntax
  3. GIT_COMMIT - Create git commit
  4. GIT_PUSH - Push to GitHub
  5. SONAR_QUEUE_CHECK - Verify analysis queued
  6. SONAR_METRIC_EXTRACTION - Poll for metrics
  7. CSV_UPDATE - Update results
- Error handling with automatic retry logic
- State checkpoint after each stage

**state_manager.py**
- Manages experiment_state.json file
- Tracks 1,314 run statuses
- Supports pause/resume
- Enables recovery from crashes
- Provides run lookup and status updates

**experiment_repo_manager.py**
- Initializes and manages dissertation-experiments git repo
- Creates atomic commits with full metadata
- Pushes to GitHub
- Handles git authentication and errors

### API Integration Layer (`api/`)

**claude_caller.py**
- Wraps Claude API calls
- Sends prompt + source code
- Receives refactored code
- Counts tokens for metrics
- Handles rate limiting
- Implements exponential backoff

**sonarcloud_poller.py**
- Polls SonarCloud analysis API
- Extracts complexity metrics:
  - Cyclomatic complexity (CC)
  - Cognitive complexity
  - NCLOC (non-comment lines)
- Handles polling timeouts
- Retries on transient failures

### Monitoring & CLI Layer (`monitoring/`)

**monitor_cli.py**
- Interactive CLI dashboard
- Commands:
  - `status` - Show experiment progress
  - `pause` - Pause execution
  - `resume` - Resume execution
  - `retry` - Retry failed runs
  - `logs` - View logs
  - `export` - Export results
- Real-time progress bar
- Error reporting

**daemon_manager.py**
- Manages background process
- Commands:
  - `start` - Start orchestrator daemon
  - `stop` - Stop daemon
  - `status` - Check daemon health
  - `logs` - View daemon logs
  - `restart` - Restart daemon
- Process tracking
- Auto-recovery on crash

### Utilities & Configuration Layer (`utils/`)

**config.py**
- Central configuration source
- Loads environment variables from .env
- Defines all paths
- Sets timeouts and retry parameters
- Classifies error types
- Contains execution parameters

**logger_config.py**
- Centralized logging setup
- Separate loggers for:
  - Main log (all operations)
  - Error log (errors only)
  - Debug log (debug details)
- Log rotation
- UTF-8 encoding

**validation.py**
- Pre-execution validation
- Checks:
  - Environment variables set
  - API credentials valid (smoke tests)
  - CSV file exists and valid
  - Source code files extracted
  - GitHub repo accessible
  - Disk space available
  - Dependencies installed

**clone_source_files.py**
- Clones 14 GitHub repositories
- Extracts 146 candidate source files
- Creates extraction manifest
- Handles missing files gracefully

**find_missing_files.py**
- Searches for files not found initially
- Attempts to locate by filename
- Creates alternate extraction report
- Updates manifest

## Data Flow

### Per-Run Execution Flow

```
1. STATE CHECK
   └─→ Load experiment_state.json
       └─→ Find run with status=PENDING

2. PROMPT & CODE LOADING
   └─→ Read prompt from CSV
       └─→ Read original source from sample_source_code/

3. LLM REFACTORING
   └─→ Call Claude API (claude_caller)
       └─→ Update state: stage=CODE_GENERATION
           └─→ Store refactored_code

4. GIT OPERATIONS
   └─→ Write code to conditions/{condition}/file_{id}/run_{n}.js
       └─→ Create atomic git commit (experiment_repo_manager)
           └─→ Push to GitHub
               └─→ Update state: stage=GIT_PUSH
                   └─→ Store commit_hash

5. SONARCLOUD ANALYSIS
   └─→ Poll SonarCloud API every 5 seconds (sonarcloud_poller)
       └─→ When status=SUCCESS: Extract metrics
           └─→ Update state: stage=SONAR_METRIC_EXTRACTION
               └─→ Store post_metrics

6. DATA PERSISTENCE
   └─→ Update experiment_state.json with run results
       └─→ Append post-metrics to CSV
           └─→ Mark state: status=COMPLETED

7. LOOP
   └─→ Return to STATE CHECK for next PENDING run
```

## Error Handling

### Automatic Retry
- Retriable errors (rate limits, transient network issues)
- Exponential backoff: 1s, 2s, 4s, 8s, ... 60s max
- Max 3 automatic retries per error

### Manual Intervention
- Pause execution if needed
- View failed runs
- Retry specific runs/conditions/files
- Skip permanently broken runs

### Error Classification

**Retriable:**
- ClaudeAPIRateLimit
- SonarCloudTimeoutError
- NetworkTransientError
- GitPushTimeout

**Non-Retriable:**
- InvalidCodeSyntax
- MissingSourceFile
- ClaudeAPIAuthError
- GitAuthError

## State Persistence

### experiment_state.json Structure

```json
{
  "experiment_id": "uuid",
  "created_at": "2026-03-20T00:00:00Z",
  "runs": [
    {
      "record_id": 1,
      "file_id": 1,
      "project_name": "Ghost",
      "condition": "baseline",
      "run_number": 1,
      "status": "COMPLETED",
      "current_stage": "CSV_UPDATE",
      "refactored_code": "...",
      "commit_hash": "abc123...",
      "post_cc": 85,
      "post_cognitive": 32,
      "post_ncloc": 400,
      "error_count": 0,
      "retry_count": 0,
      "started_at": "2026-03-20T00:05:00Z",
      "completed_at": "2026-03-20T00:08:30Z"
    },
    ...
  ]
}
```

## Configuration Hierarchy

```
Environment
    ↓
.env file (os.getenv)
    ↓
utils/config.py constants
    ↓
Module usage (config.CONSTANT)
```

## Dependency Graph

```
orchestration/
├── depends on: utils/config, utils/logger_config, utils/validation
├── uses: api/claude_caller, api/sonarcloud_poller
├── manages: orchestration/state_manager, orchestration/experiment_repo_manager

api/
├── depends on: utils/config, utils/logger_config

monitoring/
├── depends on: utils/config, utils/logger_config
├── uses: orchestration/state_manager

utils/
├── config.py: independent
├── logger_config.py: depends on config
├── validation.py: depends on config, logger_config
├── clone_source_files.py: independent
├── find_missing_files.py: independent
```

## Key Design Decisions

1. **Atomic State Updates** - Each stage is checkpointed, allowing crash recovery
2. **Sequential Processing** - Runs processed one at a time for simplicity
3. **Separate Concerns** - API calls, git ops, state mgmt are isolated
4. **Centralized Config** - Single source of truth for all constants
5. **Comprehensive Logging** - Separate logs for different concern areas
6. **Persistent State** - JSON file enables pause/resume/recovery
7. **Modular Architecture** - Clear dependencies, testable units

## Scalability Notes

Current design processes runs sequentially. For parallel processing:
- Multiple daemon instances (each with unique run range)
- Shared state file with locking
- Distributed work queue (Redis, RabbitMQ)
- Load balancing across daemons

Current approach suitable for:
- Single machine execution
- 66-80 hour duration
- 1,314 total runs (3-4 min per run)

# Project Structure

This project is organized into logical layers based on the system architecture.

## Directory Layout

```
reducing-technical-debt-praxis-experiment/
│
├── orchestration/                    # ORCHESTRATION LAYER
│   ├── __init__.py
│   ├── orchestrate_experiments.py    # Main execution engine
│   ├── state_manager.py              # State persistence & recovery
│   └── experiment_repo_manager.py    # Git operations
│
├── api/                              # API INTEGRATION LAYER
│   ├── __init__.py
│   ├── claude_caller.py              # Claude API wrapper
│   └── sonarcloud_poller.py          # SonarCloud API client
│
├── monitoring/                       # MONITORING & CLI LAYER
│   ├── __init__.py
│   ├── monitor_cli.py                # Interactive CLI dashboard
│   └── daemon_manager.py             # Background daemon control
│
├── utils/                            # UTILITIES & CONFIGURATION
│   ├── __init__.py
│   ├── config.py                     # Configuration & constants
│   ├── logger_config.py              # Logging setup
│   ├── validation.py                 # Pre-execution validation
│   ├── clone_source_files.py         # GitHub repo file extraction
│   └── find_missing_files.py         # File search & recovery
│
├── tests/                            # TESTS
│   ├── __init__.py
│   └── test_orchestration.py         # Orchestration tests
│
├── sample_source_code/               # INPUT: Extracted source files (146 files)
├── dissertation-experiments/         # OUTPUT: Git repo with refactored code
│
├── .env                              # Environment variables (DO NOT COMMIT)
├── .gitignore                        # Git ignore rules
├── requirements.txt                  # Python dependencies
│
├── EXPERIMENT_WORKFLOW.md            # Full experiment procedure
├── EXPERIMENT_ORCHESTRATION_DESIGN.md # Design documentation
├── EXTRACTION_README.md              # Source file extraction guide
├── PROJECT_STRUCTURE.md              # This file
│
└── unified_experimental_dataset_shell.csv  # Input: Experiment dataset
```

## Layer Descriptions

### Orchestration Layer (`orchestration/`)

The main execution engine that coordinates all experiment runs.

- **orchestrate_experiments.py** - Main loop that:
  - Loads experiment state
  - Finds next PENDING run
  - Calls Claude API
  - Manages git operations
  - Polls SonarCloud
  - Updates state and CSV

- **state_manager.py** - Persistent state handling:
  - Load/save experiment_state.json
  - Track run status and progress
  - Support pause/resume
  - Recovery from crashes

- **experiment_repo_manager.py** - Git operations:
  - Clone/initialize dissertation-experiments repo
  - Create commits
  - Push changes
  - Handle git errors

### API Integration Layer (`api/`)

Handles all external API calls.

- **claude_caller.py** - Claude API wrapper:
  - Send prompts + source code
  - Receive refactored code
  - Handle rate limits
  - Token counting

- **sonarcloud_poller.py** - SonarCloud client:
  - Poll analysis status
  - Extract metrics
  - Handle timeouts

### Monitoring & CLI Layer (`monitoring/`)

Interactive tools for monitoring and controlling experiments.

- **monitor_cli.py** - CLI dashboard:
  - View experiment status
  - Pause/resume execution
  - Retry failed runs
  - View logs

- **daemon_manager.py** - Background daemon:
  - Start/stop orchestrator
  - Track process
  - Handle restarts

### Utilities & Configuration (`utils/`)

Shared utilities and configuration.

- **config.py** - All constants and paths:
  - Environment variable loading
  - File paths
  - Execution parameters
  - Timing configuration
  - Error classification

- **logger_config.py** - Centralized logging:
  - Log format setup
  - File rotation
  - Log levels

- **validation.py** - Pre-execution checks:
  - Environment validation
  - CSV validation
  - File existence checks
  - API credential validation

- **clone_source_files.py** - Extract source files:
  - Clone GitHub repos
  - Extract 146 candidate files
  - Create manifest

- **find_missing_files.py** - File recovery:
  - Search for missing files
  - Attempt extraction
  - Update manifest

### Tests (`tests/`)

Unit and integration tests.

- **test_orchestration.py** - Orchestration tests

## Usage

### Running the Experiment

```bash
# Setup
source .venv/bin/activate
python utils/validation.py --full

# Initialize state
python orchestration/orchestrate_experiments.py --init

# Start daemon (background)
python monitoring/daemon_manager.py start

# Monitor progress
python monitoring/monitor_cli.py status --summary
```

### Extracting Source Files

```bash
# Extract from GitHub repos
python utils/clone_source_files.py --csv "path/to/csv"

# Find missing files
python utils/find_missing_files.py
```

## Import Patterns

### Within the Same Package

```python
# In orchestration/state_manager.py
from orchestration.experiment_repo_manager import GitManager
```

### Cross-Package Imports

```python
# In orchestration/orchestrate_experiments.py
from utils.config import EXECUTION_STAGES, CSV_INPUT_FILE
from utils.logger_config import get_logger
from api.claude_caller import CallClaude
from api.sonarcloud_poller import PollSonarCloud
```

### Within Utils Package

```python
# In utils/validation.py
from .config import CSV_INPUT_FILE, REQUIRED_ENV_VARS
from .logger_config import get_logger
```

## Key Configurations

All constants and configurations are in `utils/config.py`:

- **Paths**: CSV, source files, state files, logs
- **API settings**: Model, temperature, timeouts
- **Execution**: Stages, statuses, expected runs
- **Timing**: Polling intervals, retry backoff
- **Error handling**: Retriable vs non-retriable errors

## Environment Variables (.env)

See `.env` template for required variables:

- `ANTHROPIC_API_KEY` - Claude API key
- `SONAR_TOKEN` - SonarCloud authentication
- `SONAR_ORG` - SonarCloud organization
- `GITHUB_TOKEN` - GitHub authentication
- `GITHUB_REPO` - Experiment repository
- `EXPERIMENT_REPO_PATH` - Local path to clone
- `LOGLEVEL` - Logging level

## Dependencies

See `requirements.txt` for Python packages. Install with:

```bash
pip install -r requirements.txt
```

Key dependencies:
- `anthropic` - Claude API
- `requests` - HTTP requests
- `pandas` - Data manipulation
- `GitPython` - Git operations
- `click` - CLI framework
- `python-dotenv` - Environment variables

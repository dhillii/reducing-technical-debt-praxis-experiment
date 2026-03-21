# Quick Start Guide

## Setup (First Time)

```bash
# 1. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 3. Setup environment
cp .env.example .env  # (or edit .env manually with your credentials)

# 4. Validate setup
python run_validation.py --full
```

## Running the Experiment

### Phase 1: Preparation

```bash
# 1. Extract source files from GitHub repos
python -m utils.clone_source_files --csv "path/to/unified_experimental_dataset_shell.csv"

# 2. Find any missing files
python -m utils.find_missing_files

# 3. Validate everything
python run_validation.py --full
```

### Phase 2: Execution

```bash
# 1. Start background daemon
python -m monitoring.daemon_manager start

# 2. Run all experiments
python -m orchestration.orchestrate_experiments run

# Run only the first project (useful for testing/validation)
python -m orchestration.orchestrate_experiments run --max-projects 1

# Limit to a specific number of runs
python -m orchestration.orchestrate_experiments run --max-runs 9

# 3. Monitor progress (in another terminal)
python -m monitoring.monitor_cli status --summary

# 4. Check logs
python -m monitoring.daemon_manager logs --follow
```

### Phase 3: Control & Monitoring

```bash
# Pause execution (finishes current run)
python -m monitoring.monitor_cli pause

# Resume execution
python -m monitoring.monitor_cli resume

# Retry failed runs
python -m monitoring.monitor_cli retry --condition nfr_generic

# View detailed status
python -m monitoring.monitor_cli status --failed

# Stop daemon
python -m monitoring.daemon_manager stop
```

## Project Structure

```
orchestration/        Main execution engine
├── orchestrate_experiments.py
├── state_manager.py
└── experiment_repo_manager.py

api/                  External APIs
├── claude_caller.py
└── sonarcloud_poller.py

monitoring/           CLI & monitoring
├── monitor_cli.py
└── daemon_manager.py

utils/                Configuration & utilities
├── config.py
├── logger_config.py
├── validation.py
├── clone_source_files.py
└── find_missing_files.py

tests/                Test suite
└── test_orchestration.py
```

## Important Files

| File | Purpose |
|------|---------|
| `.env` | API credentials (DO NOT COMMIT) |
| `utils/config.py` | All constants and paths |
| `experiment_state.json` | Experiment progress (auto-created) |
| `unified_experimental_dataset_shell.csv` | Input data |
| `sample_source_code/` | Extracted source files |
| `dissertation-experiments/` | Git repo with outputs |

## Common Commands

```bash
# Validate setup
python run_validation.py --full

# Extract source files
python -m utils.clone_source_files --help

# Check experiment status
python -m monitoring.monitor_cli status

# View experiment logs
python -m monitoring.daemon_manager logs --tail 50

# Start fresh (WARNING: clears state)
rm experiment_state.json
python -m orchestration.orchestrate_experiments run
```

## Troubleshooting

### Virtual environment not activating?
```bash
# Try with full path
source /path/to/.venv/bin/activate

# Or recreate it
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Import errors?
```bash
# Make sure you're in the project root directory
pwd  # Should end with .../reducing-technical-debt-praxis-experiment

# And venv is activated
which python  # Should show .venv/bin/python
```

### Experiment stuck?
```bash
# Check daemon status
python -m monitoring.daemon_manager status

# View recent logs
python -m monitoring.daemon_manager logs --tail 100

# If hung, restart
python -m monitoring.daemon_manager stop
sleep 2
python -m monitoring.daemon_manager start
```

## Documentation Files

- `EXPERIMENT_WORKFLOW.md` - Full procedure & phases
- `EXPERIMENT_ORCHESTRATION_DESIGN.md` - Architecture & design
- `EXTRACTION_README.md` - Source file extraction details
- `PROJECT_STRUCTURE.md` - Directory organization
- `QUICK_START.md` - This file

## Environment Variables

See `.env` file. Required:

```bash
ANTHROPIC_API_KEY=sk-ant-...
SONAR_TOKEN=sqa_...
SONAR_ORG=dhillii
GITHUB_TOKEN=ghp_...
GITHUB_REPO=dhillii/reducing-technical-debt-praxis-experiment
EXPERIMENT_REPO_PATH=../dissertation-experiments
LOGLEVEL=INFO
```

## Performance Notes

- **Extraction**: ~5-10 minutes (first time, with cloning)
- **Validation**: <1 minute
- **Initialization**: ~10 seconds
- **Experiment**: 66-80 hours (1,314 runs continuous)
- **Disk space**: ~2GB for repos, grows as experiment runs

## Support

For detailed information, see:
- Architecture: `EXPERIMENT_ORCHESTRATION_DESIGN.md`
- Workflow: `EXPERIMENT_WORKFLOW.md`
- Extraction: `EXTRACTION_README.md`

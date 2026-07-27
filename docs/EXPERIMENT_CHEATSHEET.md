# Experiment Cheat Sheet

Run these commands from the project root in the Ubuntu WSL terminal.

## One-time setup

```bash
cd "/mnt/c/Users/David Hill/iCloudDrive/GWU/Dissertation/reducing-technical-debt-praxis-experiment"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` with the required API credentials before submitting a batch.

## Validate

```bash
python3 -m orchestration.orchestrate_experiments validate
```

## Together AI batch workflow

Replace `llama_70b` with `qwen_3_5_9b`, `gpt_oss_20b`, or `gpt_oss_120b` as needed.

```bash
# Submit all PENDING runs. Context budgeting runs automatically before upload.
python3 -m orchestration.orchestrate_experiments batch-submit --provider together --model llama_70b

# Check progress once.
python3 -m orchestration.orchestrate_experiments batch-poll --provider together --model llama_70b

# Wait, retrieve, write generated code, and update the model CSV.
python3 -m orchestration.orchestrate_experiments batch-stream --provider together --model llama_70b

# If streaming stops, retrieve completed results manually.
python3 -m orchestration.orchestrate_experiments batch-retrieve --provider together --model llama_70b
```

## Batch artifacts and token-budget report

New request JSONL files, metadata, outputs, and errors are saved in `batches/`.

```bash
# List Llama batch artifacts.
ls -lah batches/

# Check one retained request JSONL and save a report.
python3 -m utils.check_token_budget \
  --input batches/together_batch_llama_70b_<suffix>.jsonl \
  --model-key llama_70b \
  --output batches/token-budget-report.json
```

## Recovery

```bash
# Cancel submitted batches and reset IN_PROGRESS rows to PENDING.
python3 -m orchestration.orchestrate_experiments batch-cancel --provider together --model llama_70b

# Review recent failures.
tail -n 100 experiment_errors.log
```

## Useful files

- `data/together_dataset_<model>.csv` — results for a Together model
- `experiment_state_<model>.json` — run state for a Together model
- `batches/` — retained Together input/output batch artifacts
- `experiment.log` and `experiment_errors.log` — execution logs

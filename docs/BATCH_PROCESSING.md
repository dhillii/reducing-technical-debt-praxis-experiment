# Batch Processing for Refactoring Experiments

## Overview

Instead of sequential API calls (1,314 refactorings at ~30 seconds each = 12+ hours), use Anthropic's Batch API to:

- **50% cost reduction** — Batch API is 50% cheaper than per-call pricing
- **Parallel processing** — Submit all 1,314 refactorings at once
- **Streaming results** — Get results continuously as they complete (typically 2-3 hours total)
- **Better error handling** — Batch API includes retry logic for transient failures

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Your 1,314 Pending Refactoring Runs                         │
└────────────────────┬────────────────────────────────────────┘
                     │
      ┌──────────────┼──────────────┐
      │              │              │
    Batch 1      Batch 2         ...   Batch 8
    (164 runs)   (164 runs)    (164 runs)
      │              │              │
      └──────────────┬──────────────┘
                     │
         Anthropic Batch API
         (queued → processing → results)
                     │
    ┌────────────────┼────────────────┐
    │                │                │
  Results        Results  ...    Results
   Stream         Stream          Stream
    │                │                │
    └────────────────┬────────────────┘
                     │
         Update CSV with Results
         (automatic per batch)
```

## Usage

### Step 1: Submit All Batches

```bash
cd reducing-technical-debt-praxis-experiment
python -m orchestration.orchestrate_experiments batch-submit
```

This will:
- Identify all PENDING runs (typically 1,314 at the start)
- Create 8 batch files (~164 requests each)
- Submit to Anthropic Batch API
- Return batch IDs for tracking

**Output:**
```
[13:45:22] ✅ Successfully submitted 8 batches:
   msg_batch_19e68e18...
   msg_batch_2a7f3b2c...
   ... (6 more)
```

### Step 2: Stream Results (Recommended)

```bash
python -m orchestration.orchestrate_experiments batch-stream
```

This will:
- Poll all 8 batches every 60 seconds
- Stream live progress to console
- Auto-retrieve results as batches complete
- Auto-update CSV continuously
- Continue until all 1,314 refactorings done

**Output:**
```
[13:45:30] Starting batch result streaming...
[13:47:15] Progress: 164/1314 (12%) | Processing: 780
[14:03:42] Progress: 328/1314 (25%) | Processing: 616
[14:21:09] ✅ All batches completed!
```

### Alternative: Manual Polling

If you want to check status without streaming:

```bash
# Check status once
python -m orchestration.orchestrate_experiments batch-poll

# Check status repeatedly
watch -n 60 "python -m orchestration.orchestrate_experiments batch-poll"
```

### Manual Result Retrieval

If streaming was interrupted, retrieve remaining results:

```bash
python -m orchestration.orchestrate_experiments batch-retrieve
```

## Configuration

### Batch Size

Default is 164 requests per batch (8 batches total). To customize:

```bash
python -m orchestration.orchestrate_experiments batch-submit --batch-size 200
```

This creates 7 batches of 200 + 1 batch of 114.

### Poll Interval

Default polling is every 60 seconds. For faster updates:

```bash
python -m orchestration.orchestrate_experiments batch-stream --poll-interval 30
```

For slower updates (saves API calls):

```bash
python -m orchestration.orchestrate_experiments batch-stream --poll-interval 300
```

### Max Wait Time

Default max wait is 24 hours. To change:

```bash
python -m orchestration.orchestrate_experiments batch-stream --max-hours 12
```

## Workflow

### Complete Batch Experiment

1. **Prepare your dataset:**
   ```bash
   python orchestration/orchestrate_experiments.py validate
   ```

2. **Submit batches:**
   ```bash
   python orchestration/orchestrate_experiments.py batch-submit
   ```

3. **Stream results** (in a separate terminal or with nohup):
   ```bash
   python orchestration/orchestrate_experiments.py batch-stream
   ```

4. **Monitor CSV:**
   ```bash
   tail -f data/unified_experimental_dataset_shell.csv
   # or open in Excel for live viewing
   ```

5. **After completion, run validation:**
   ```bash
   python orchestration/orchestrate_experiments.py validate
   ```

### Resuming After Interruption

If the stream command was interrupted:

```bash
# Check status
python orchestration/orchestrate_experiments.py batch-poll

# Retrieve remaining results
python orchestration/orchestrate_experiments.py batch-retrieve

# Resume streaming (if not all complete)
python orchestration/orchestrate_experiments.py batch-stream
```

## Cost Comparison

### Sequential (Per-Call) API

- 1,314 refactorings × $0.80/1M input tokens ≈ **~$15-20**
- Time: ~12 hours (30 sec/call × 1,314)
- Concurrency: 1 at a time

### Batch API

- Same 1,314 refactorings × $0.40/1M input tokens ≈ **~$7.50-10** (50% discount!)
- Time: ~2-3 hours (parallel processing)
- Concurrency: All 1,314 at once (queued)

**Savings: ~$7.50 and 9-10 hours**

## Monitoring Files

Batch progress is tracked in:

- `~/.claude/batches/` — JSONL batch files and metadata
  - `refactor_batch_01_of_08_*.jsonl` — Request files
  - `msg_batch_*/metadata.json` — Batch tracking

- `data/unified_experimental_dataset_shell.csv` — Main results
  - Updates continuously as results arrive
  - Columns populated: `refactoring_applied`, token counts

- `experiment_state.json` — Run statuses
  - Updates to COMPLETED as results processed

## Troubleshooting

### "No batches to poll"

Batches haven't been submitted yet. Run:
```bash
python orchestration/orchestrate_experiments.py batch-submit
```

### "Batch not completed yet"

Normal! Batches typically take 1-3 hours. Check status:
```bash
python orchestration/orchestrate_experiments.py batch-poll
```

### "Timeout exceeded"

Increase max wait time:
```bash
python orchestration/orchestrate_experiments.py batch-stream --max-hours 48
```

### "Connection lost during streaming"

Results are auto-saved. Resume:
```bash
python orchestration/orchestrate_experiments.py batch-stream
```

### High failure rate in batch

Check:
1. Is your CSV valid? Run `validate` command
2. Are prompts properly populated?
3. Are system prompts correct for conditions?

Contact Anthropic support with batch ID if failures persist.

## API Reference

### BatchProcessor

```python
from api.batch_processor import BatchProcessor, BatchOrchestrator

processor = BatchProcessor()

# Build batch request file
batch_file = processor.build_batch_request(requests_list)

# Submit to API
batch_id = processor.submit_batch(batch_file)

# Check status
status = processor.poll_batch(batch_id)

# Retrieve results
results = processor.retrieve_results(batch_id)
```

### BatchRunOrchestrator

```python
from orchestration.batch_run_orchestrator import BatchRunOrchestrator

orchestrator = BatchRunOrchestrator()

# Prepare requests
requests = orchestrator.prepare_batch_requests()

# Submit all at once
batch_ids = orchestrator.submit_batches(batch_size=164)

# Stream with live polling
summary = orchestrator.stream_batch_results(
    poll_interval=60,
    max_wait_hours=24
)
```

## Next Steps

1. Run `batch-submit` to queue all 1,314 refactorings
2. Run `batch-stream` to watch them process
3. CSV updates automatically as results arrive
4. After completion, use `validate` to check data quality

# Isolated Multilanguage Experiment

Use a namespace so a new corpus cannot overwrite the legacy JavaScript/TypeScript runs.

## Required layout

Create a dataset directory such as `data/multilang_v1/` containing:

- `unified_experimental_dataset_shell.csv` — experiment manifest with a unique `record_id` per run.
- `active_prompts_for_experiment.csv` — `record_id` and `active_prompt` columns.
- `sample_source_code/` — extracted source files named `file_####_<original-name>.<extension>`.
- `extraction_manifest.csv` — mappings from the manifest's `project_name` and `file_path` to the extracted filenames.

Preserve the source file extensions. Generated files retain their original extensions.

## Extract a separate source corpus

```bash
python3 -m utils.clone_source_files \
  --csv data/multilang_v1/unified_experimental_dataset_shell.csv \
  --output data/multilang_v1/sample_source_code \
  --repos-dir repos_cache/multilang_v1
```

Every `project_name` in the manifest must have a repository entry in [utils/clone_source_files.py](../utils/clone_source_files.py).

## Submit Llama 70B

```bash
python3 -m orchestration.orchestrate_experiments batch-submit \
  --provider together \
  --model llama_70b \
  --namespace multilang_v1 \
  --dataset-csv data/multilang_v1/unified_experimental_dataset_shell.csv \
  --prompts-file data/multilang_v1/active_prompts_for_experiment.csv \
  --source-dir data/multilang_v1/sample_source_code \
  --manifest-file data/multilang_v1/extraction_manifest.csv
```

Token preflight runs automatically before upload.

## Poll, stream, or retrieve

Use the same five namespace and dataset-path options with each command:

```bash
python3 -m orchestration.orchestrate_experiments batch-poll --provider together --model llama_70b --namespace multilang_v1 --dataset-csv data/multilang_v1/unified_experimental_dataset_shell.csv --prompts-file data/multilang_v1/active_prompts_for_experiment.csv --source-dir data/multilang_v1/sample_source_code --manifest-file data/multilang_v1/extraction_manifest.csv

python3 -m orchestration.orchestrate_experiments batch-stream --provider together --model llama_70b --namespace multilang_v1 --dataset-csv data/multilang_v1/unified_experimental_dataset_shell.csv --prompts-file data/multilang_v1/active_prompts_for_experiment.csv --source-dir data/multilang_v1/sample_source_code --manifest-file data/multilang_v1/extraction_manifest.csv
```

## Isolated output locations

For namespace `multilang_v1`, the Llama run writes only to:

- `experiments/multilang_v1/experiment_state_llama_70b.json`
- `experiments/multilang_v1/data/together_dataset_llama_70b.csv`
- `experiments/multilang_v1/batches/`
- `experiments/multilang_v1/conditions_llama_70b/`

The legacy Llama state, CSV, batches, and `conditions_llama_70b/` directory are not reused.

"""
Batch-mode orchestrator for running large-scale refactoring experiments.

Supports three inference providers:
  - anthropic    (model_key="haiku"): Anthropic Messages Batch API
  - together     (model_key="llama_8b"|"gpt_oss_20b"|"llama_70b"|"gpt_oss_120b"):
                 Together AI Batch API
  - huggingface  (model_key="qwen3_coder_next"|"qwen3_coder_480b"): HF router
                 (OpenAI-compatible); requests run concurrently since the router
                 has no async batch-submission API

Results from all providers are normalized before processing so all downstream
logic (local metrics, CSV writes, git) is provider-agnostic.
"""

import json
import re
import threading
import time
import pandas as pd
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone

from api.batch_processor import (
    AnthropicBatchProvider,
    TogetherBatchProvider,
    HuggingFaceBatchProvider,
    BatchOrchestrator,
    extract_code_from_response,
)
from orchestration.state_manager import StateManager
from orchestration.experiment_repo_manager import ExperimentRepoManager
from utils.config import (
    CSV_INPUT_FILE,
    DATA_DIR,
    PROJECT_ROOT,
    ACTIVE_PROMPTS_FILE,
    SOURCE_CODE_DIR,
    EXTRACTION_MANIFEST_FILE,
    SONARCLOUD_PROJECT_KEY,
    SONARCLOUD_COMPONENT_TEMPLATE,
    CLAUDE_MODEL,
    CLAUDE_TEMPERATURE,
    CLAUDE_MAX_OUTPUT_TOKENS,
    EXPERIMENT_STATE_FILE,
    TOGETHER_MODELS,
    TOGETHER_TEMPERATURE,
    TOGETHER_MAX_TOKENS,
    TOGETHER_BATCH_IDS_DIR,
    HUGGINGFACE_MODELS,
    HUGGINGFACE_TEMPERATURE,
    HUGGINGFACE_MAX_TOKENS,
)
from utils.local_metrics import (
    analyze_code_metrics,
    delta as local_metric_delta,
    nfr_alignment_score as local_nfr_alignment_score,
)
from utils.logger_config import get_logger

logger = get_logger("batch_run_orchestrator")

_TEXT_RESULT_COLUMNS = [
    "refactoring_applied",
    "git_commit_hash",
    "sonar_component_key",
    "llm_model",
]

_LOCAL_COMPUTED_COLUMNS = [
    "pre_local_cyclomatic_complexity",
    "pre_local_cognitive_complexity",
    "pre_local_ncloc",
    "pre_local_maintainability_index",
    "post_local_cyclomatic_complexity",
    "post_local_cognitive_complexity",
    "post_local_ncloc",
    "post_local_maintainability_index",
    "cc_delta_local",
    "cognitive_delta_local",
    "ncloc_delta_local",
    "maintainability_delta_local",
    "maintainability_index",
    "nfr_alignment_score",
]

# The same unnumbered source context is supplied to every prompt condition.
# It localizes SonarCloud findings without turning source-line display into an
# additional condition-specific intervention.
LOCATION_CONTEXT_LINES = 3

# A completion shorter than this fraction of the original source is assumed
# to be a partial/snippet response rather than a full-file refactor, unless
# the source itself is trivially small.
_PARTIAL_OUTPUT_MIN_RATIO = 0.4
_PARTIAL_OUTPUT_MIN_SOURCE_CHARS = 200


def _validate_namespace(namespace: str) -> str:
    """Return a filesystem-safe namespace used to isolate an experiment."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", namespace):
        raise ValueError(
            "namespace must contain only letters, numbers, underscores, and hyphens"
        )
    return namespace


class BatchRunOrchestrator:
    """Orchestrates batch refactoring experiments end-to-end."""

    def __init__(
        self,
        provider: str = "anthropic",
        model_key: str = "haiku",
        namespace: Optional[str] = None,
        dataset_csv: Optional[Path] = None,
        prompts_file: Optional[Path] = None,
        source_code_dir: Optional[Path] = None,
        extraction_manifest_file: Optional[Path] = None,
        stream: bool = False,
    ):
        """
        Initialize batch orchestrator.

        Args:
            provider:  "anthropic" (default) or "together"
            model_key: "haiku" for Anthropic; one of "llama_8b", "gpt_oss_20b",
                       "llama_70b", "gpt_oss_120b" for Together AI
            namespace: Isolated experiment name. Omit only for legacy runs.
            dataset_csv: Manifest CSV for this experiment.
            prompts_file: Per-record prompt CSV for this experiment.
            source_code_dir: Directory containing extracted source files.
            extraction_manifest_file: Mapping from dataset paths to source files.
            stream: For provider="huggingface", use streaming chat completions
                    instead of blocking calls (see HuggingFaceBatchProvider).
        """
        self.provider = provider
        self.model_key = model_key
        self.namespace = _validate_namespace(namespace) if namespace else None
        self.dataset_csv = Path(dataset_csv or CSV_INPUT_FILE)
        self.prompts_file = Path(prompts_file or ACTIVE_PROMPTS_FILE)
        self.source_code_dir = Path(source_code_dir or SOURCE_CODE_DIR)
        self.extraction_manifest_file = Path(extraction_manifest_file or EXTRACTION_MANIFEST_FILE)

        if self.namespace:
            self.experiment_dir = PROJECT_ROOT / "experiments" / self.namespace
            self.batch_dir = self.experiment_dir / "batches"
            self.experiment_dir.mkdir(parents=True, exist_ok=True)
        else:
            self.experiment_dir = PROJECT_ROOT
            self.batch_dir = TOGETHER_BATCH_IDS_DIR

        # --- Resolve per-provider/model configuration ---
        if provider == "anthropic":
            self.model = CLAUDE_MODEL
            self.max_tokens = CLAUDE_MAX_OUTPUT_TOKENS
            self.temperature = CLAUDE_TEMPERATURE
            self.gpt_oss_prefix = False
            self.disable_reasoning = False
            self.conditions_root = (
                f"experiments/{self.namespace}/conditions" if self.namespace else "conditions"
            )
            self.state_file = (
                self.experiment_dir / "experiment_state.json"
                if self.namespace else EXPERIMENT_STATE_FILE
            )
            self.output_csv = self.experiment_dir / "data" / "dataset_haiku.csv" if self.namespace else CSV_INPUT_FILE
            batch_provider = AnthropicBatchProvider()
        elif provider == "together":
            if model_key not in TOGETHER_MODELS:
                raise ValueError(
                    f"Unknown Together AI model_key {model_key!r}. "
                    f"Valid keys: {list(TOGETHER_MODELS)}"
                )
            cfg = TOGETHER_MODELS[model_key]
            self.model = cfg["model_id"]
            self.max_tokens = TOGETHER_MAX_TOKENS
            self.temperature = TOGETHER_TEMPERATURE
            self.gpt_oss_prefix = cfg["gpt_oss_prefix"]
            self.disable_reasoning = cfg.get("disable_reasoning", False)
            self.conditions_root = (
                f"experiments/{self.namespace}/conditions_{model_key}"
                if self.namespace else f"conditions_{model_key}"
            )
            self.state_file = (
                self.experiment_dir / f"experiment_state_{model_key}.json"
                if self.namespace else PROJECT_ROOT / f"experiment_state_{model_key}.json"
            )
            self.output_csv = (
                self.experiment_dir / "data" / f"together_dataset_{model_key}.csv"
                if self.namespace else DATA_DIR / f"together_dataset_{model_key}.csv"
            )
            batch_provider = TogetherBatchProvider(model_key=model_key, batch_dir=self.batch_dir)
        elif provider == "huggingface":
            if model_key not in HUGGINGFACE_MODELS:
                raise ValueError(
                    f"Unknown Hugging Face model_key {model_key!r}. "
                    f"Valid keys: {list(HUGGINGFACE_MODELS)}"
                )
            cfg = HUGGINGFACE_MODELS[model_key]
            self.model = cfg["model_id"]
            self.max_tokens = HUGGINGFACE_MAX_TOKENS
            self.temperature = HUGGINGFACE_TEMPERATURE
            self.gpt_oss_prefix = False
            self.disable_reasoning = False
            self.conditions_root = (
                f"experiments/{self.namespace}/conditions_{model_key}"
                if self.namespace else f"conditions_{model_key}"
            )
            self.state_file = (
                self.experiment_dir / f"experiment_state_{model_key}.json"
                if self.namespace else PROJECT_ROOT / f"experiment_state_{model_key}.json"
            )
            self.output_csv = (
                self.experiment_dir / "data" / f"huggingface_dataset_{model_key}.csv"
                if self.namespace else DATA_DIR / f"huggingface_dataset_{model_key}.csv"
            )
            batch_provider = HuggingFaceBatchProvider(model_key=model_key, batch_dir=self.batch_dir, stream=stream)
        else:
            raise ValueError(f"Unknown provider {provider!r}. Use 'anthropic', 'together', or 'huggingface'.")

        self.state_manager = StateManager(state_file=self.state_file)
        self.batch_orchestrator = BatchOrchestrator(provider=batch_provider)
        self.repo_manager = ExperimentRepoManager()
        self._git_lock = threading.Lock()
        self._csv_lock = threading.Lock()
        self._manifest_index: Optional[Dict[Tuple[str, str], int]] = None
        self._prompts: Dict[str, str] = self._load_prompts()

        # Load or initialize the output CSV
        self.csv_df = self._load_or_init_csv()
        self._ensure_text_columns()
        self._ensure_local_metric_columns()

        logger.info(
            f"BatchRunOrchestrator: provider={provider}, model={self.model}, "
            f"csv={self.output_csv.name}, state={self.state_file.name}"
        )
        logger.info(
            f"Loaded CSV: {len(self.csv_df)} records, {len(self._prompts)} prompts, "
            f"namespace={self.namespace or 'legacy'}"
        )

    # -------------------------------------------------------------------------
    # CSV helpers
    # -------------------------------------------------------------------------

    def _load_or_init_csv(self) -> pd.DataFrame:
        """Load the output CSV, initialising it from the shell CSV for Together AI."""
        if self.output_csv.exists():
            return pd.read_csv(self.output_csv, dtype={"record_id": str})

        # First run for this Together AI model: seed from shell CSV
        logger.info(
            f"Output CSV not found at {self.output_csv}. "
            f"Seeding from shell CSV: {CSV_INPUT_FILE}"
        )
        shell_df = pd.read_csv(self.dataset_csv, dtype={"record_id": str})
        self.output_csv.parent.mkdir(parents=True, exist_ok=True)
        shell_df.to_csv(self.output_csv, index=False)
        logger.info(f"Initialized Together AI CSV with {len(shell_df)} rows: {self.output_csv}")
        return shell_df

    def _ensure_text_columns(self) -> None:
        for col in _TEXT_RESULT_COLUMNS:
            if col not in self.csv_df.columns:
                self.csv_df[col] = pd.Series(pd.NA, index=self.csv_df.index, dtype="string")
            elif self.csv_df[col].dtype != "string":
                self.csv_df[col] = self.csv_df[col].astype("string")

    def _ensure_local_metric_columns(self) -> None:
        for col in _LOCAL_COMPUTED_COLUMNS:
            if col not in self.csv_df.columns:
                self.csv_df[col] = pd.NA

    # -------------------------------------------------------------------------
    # Manifest / file resolution helpers
    # -------------------------------------------------------------------------

    def _load_manifest_index(self) -> Dict[Tuple[str, str], int]:
        """Load (project, original_path) -> file_id from extraction manifest."""
        if self._manifest_index is not None:
            return self._manifest_index

        if not self.extraction_manifest_file.exists():
            raise FileNotFoundError(f"Extraction manifest not found: {self.extraction_manifest_file}")

        manifest_df = pd.read_csv(self.extraction_manifest_file)
        mapping: Dict[Tuple[str, str], int] = {}

        for _, row in manifest_df.iterrows():
            output_name = str(row.get("output_filename", ""))
            match = re.match(r"^file_(\d{4})_", output_name)
            if not match:
                continue
            project = str(row.get("project", "")).strip()
            original_path = str(row.get("original_path", "")).strip().replace("\\", "/")
            if not project or not original_path:
                continue
            mapping[(project, original_path)] = int(match.group(1))

        self._manifest_index = mapping
        logger.info(f"Loaded manifest index: {len(mapping)} entries")
        return mapping

    def _find_source_file_for_row(
        self, csv_row: Any, manifest_index: Dict[Tuple[str, str], int]
    ) -> Tuple[int, Path]:
        """Resolve (file_id, source_file_path) from a CSV row."""
        project = str(csv_row.get("project_name", "")).strip()
        file_path = str(csv_row.get("file_path", "")).strip().replace("\\", "/")

        file_id = manifest_index.get((project, file_path))

        if file_id is None:
            file_key = str(csv_row.get("file_key", ""))
            if ":" in file_key:
                key_path = file_key.split(":", 1)[1].replace("\\", "/")
                file_id = manifest_index.get((project, key_path))

        if file_id is None:
            raise ValueError(
                f"Could not resolve file_id for project={project!r}, file_path={file_path!r}"
            )

        candidates = sorted(self.source_code_dir.glob(f"file_{file_id:04d}_*"))
        if not candidates:
            raise FileNotFoundError(f"No source file for file_id={file_id:04d} under {self.source_code_dir}")

        file_name = str(csv_row.get("file_name", "")).strip()
        if file_name:
            exact = [p for p in candidates if p.name == f"file_{file_id:04d}_{file_name}"]
            if len(exact) == 1:
                return file_id, exact[0]

        return file_id, candidates[0]

    # -------------------------------------------------------------------------
    # Batch preparation and submission
    # -------------------------------------------------------------------------

    def prepare_batch_requests(
        self,
        status_filter: str = "PENDING"
    ) -> List[Dict[str, Any]]:
        """
        Prepare batch requests from experiment state.

        Args:
            status_filter: Status to filter on (PENDING, IN_PROGRESS, etc.)

        Returns:
            List of request dicts ready for batch submission
        """
        pending_record_ids = self.state_manager.get_all_runs_by_status(status_filter)

        if len(pending_record_ids) == 0 and status_filter == "PENDING":
            logger.info("State is empty, initializing from CSV...")
            self._initialize_state_from_csv()
            pending_record_ids = self.state_manager.get_all_runs_by_status(status_filter)

        logger.info(f"Found {len(pending_record_ids)} {status_filter} runs")

        manifest_index = self._load_manifest_index()

        requests = []
        for record_id in pending_record_ids:
            run = self.state_manager.get_run(record_id)
            if not run:
                logger.warning(f"Record {record_id} not found in state")
                continue

            csv_row = self.csv_df[self.csv_df["record_id"] == record_id]
            if csv_row.empty:
                logger.warning(f"Record {record_id} not found in CSV")
                continue

            row = csv_row.iloc[0]

            try:
                file_id, source_file = self._find_source_file_for_row(row, manifest_index)
                source_code = source_file.read_text(encoding="utf-8")
            except Exception as e:
                logger.warning(f"Error loading source code for {record_id}: {e}")
                continue

            prompt = self._build_prompt(
                record_id,
                source_code,
                sonar_line=row.get("sonar_line"),
            )
            system_prompt = self._get_system_prompt(run.condition)

            requests.append({
                "record_id": record_id,
                "prompt": prompt,
                "system_prompt": system_prompt,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "reasoning_effort": "medium" if self.gpt_oss_prefix else None,
                "disable_reasoning": self.disable_reasoning,
                "file_extension": source_file.suffix or ".txt",
            })

        logger.info(f"Prepared {len(requests)} batch requests")
        return requests

    def submit_batches(
        self,
        status_filter: str = "PENDING",
        batch_size: int = 100,
    ) -> List[str]:
        """
        Submit pending runs in independently retryable batches.

        Returns:
            List of submitted batch IDs.
        """
        requests = self.prepare_batch_requests(status_filter)

        if not requests:
            logger.warning(f"No {status_filter} runs found")
            return []

        batch_ids = self.batch_orchestrator.create_and_submit_batches(
            requests,
            batch_size=batch_size,
        )

        if self.provider == "anthropic":
            batch_ids_file = Path.home() / ".claude" / "batches" / "batch_ids.json"
        else:
            batch_ids_file = self.batch_dir / f"batch_ids_{self.model_key}.json"
        batch_ids_file.parent.mkdir(parents=True, exist_ok=True)
        with open(batch_ids_file, "w") as f:
            json.dump({
                "batch_ids": batch_ids,
                "submitted_at": datetime.now(timezone.utc).isoformat()
            }, f, indent=2)
        logger.info(f"Saved {len(batch_ids)} batch IDs to {batch_ids_file}")

        return batch_ids

    def poll_batches(self, batch_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Poll status of batches.

        Returns:
            Summary of batch statuses
        """
        batch_ids = self._load_batch_ids(batch_ids)
        if not batch_ids:
            logger.warning("No batch IDs to poll. Submit batches first with: batch-submit")
            return {}

        summary = self.batch_orchestrator.poll_all_batches(batch_ids)

        logger.info("Batch Status Summary:")
        logger.info(f"  Total requests: {summary['total_requests']}")
        logger.info(f"  Completed: {summary['total_completed']}")
        logger.info(f"  Processing: {summary['total_processing']}")
        logger.info(f"  Overall progress: {summary['completion_pct']}%")

        return summary

    # -------------------------------------------------------------------------
    # Result retrieval and full processing pipeline
    # -------------------------------------------------------------------------

    def retrieve_and_process_results(
        self,
        batch_ids: Optional[List[str]] = None,
        auto_update_csv: bool = True,
    ) -> int:
        """
        Retrieve results from completed batches, write code files, commit,
        calculate local metrics, and update the CSV.

        Args:
            batch_ids:       Explicit list of batch IDs; loads from saved file if None.
            auto_update_csv: Write CSV after processing.

        Returns:
            Number of results processed
        """
        batch_ids = self._load_batch_ids(batch_ids)
        if not batch_ids:
            logger.warning("No batch IDs provided. Submit batches first with: batch-submit")
            return 0

        all_results = self.batch_orchestrator.retrieve_all_results(batch_ids)
        if not all_results:
            return 0

        manifest_index = self._load_manifest_index()

        # Ensure repo is ready for commits
        self.repo_manager.ensure_repo_exists()
        self.repo_manager.configure_author()

        processed_count = 0
        batch_commits_to_make = []  # Collect commits for batching

        for result in all_results:
            if result["status"] != "succeeded":
                if result["status"] == "retryable":
                    record_id = result["record_id"]
                    self.state_manager.schedule_run_retry(
                        record_id,
                        stage="CODE_GENERATION",
                        error_type="CompletionTruncated",
                        message=result["error"],
                    )
                    logger.warning(
                        f"Result {record_id} was truncated and returned to PENDING "
                        "for a higher-output-budget retry."
                    )
                    continue
                logger.warning(f"Result {result['record_id']} failed: {result['error']}")
                continue

            record_id = result["record_id"]
            # Normalized fields from both providers
            code = result["content"]           # already extracted by provider
            prompt_tokens = result["prompt_tokens"]
            completion_tokens = result["completion_tokens"]

            if not code:
                logger.warning(f"No content in result for {record_id}")
                continue

            # Skip already-processed rows
            csv_idx = self.csv_df[self.csv_df["record_id"] == record_id].index
            if len(csv_idx) == 0:
                logger.warning(f"Record {record_id} not found in CSV")
                continue
            idx = csv_idx[0]

            already_done = self.csv_df.loc[idx, "refactoring_applied"]
            if pd.notna(already_done) and str(already_done) == "Y":
                logger.debug(f"Record {record_id} already processed, skipping")
                continue

            # Get run and CSV row
            run = self.state_manager.get_run(record_id)
            if not run:
                logger.warning(f"Run {record_id} not found in state")
                continue

            csv_row = self.csv_df.loc[idx]

            # Resolve file_id and source file
            try:
                file_id, source_file = self._find_source_file_for_row(csv_row, manifest_index)
                if run.file_id != file_id:
                    run.file_id = file_id
                    self.state_manager.add_run(run)
            except Exception as e:
                logger.warning(f"Could not resolve source file for {record_id}: {e}")
                continue

            # Detect partial output: some models return only the changed
            # function/snippet instead of the full file. Treat a drastically
            # shorter response as a retryable failure rather than accepting it.
            try:
                original_len = len(source_file.read_text(encoding="utf-8"))
            except Exception:
                original_len = 0
            if original_len > _PARTIAL_OUTPUT_MIN_SOURCE_CHARS and len(code) < original_len * _PARTIAL_OUTPUT_MIN_RATIO:
                self.state_manager.schedule_run_retry(
                    record_id,
                    stage="CODE_GENERATION",
                    error_type="PartialOutput",
                    message=(
                        f"Response ({len(code)} chars) is far shorter than the source file "
                        f"({original_len} chars); likely a partial/snippet response."
                    ),
                )
                logger.warning(
                    f"Result {record_id} looked like a partial file ({len(code)} vs "
                    f"{original_len} source chars) and was returned to PENDING for retry."
                )
                continue

            # Write generated code file (provider/model-specific conditions_root)
            try:
                self.repo_manager.write_code_file(
                    condition=run.condition,
                    file_id=run.file_id,
                    run_number=run.run_number,
                    code=code,
                    conditions_root=self.conditions_root,
                    file_extension=source_file.suffix or ".txt",
                )
            except Exception as e:
                logger.warning(f"Failed to write code file for {record_id}: {e}")
                continue

            # Queue for commit
            pre_cc = csv_row.get("pre_cyclomatic_complexity")
            batch_commits_to_make.append({
                "record_id": int(record_id),
                "file_id": run.file_id,
                "project_name": run.project_name,
                "file_name": run.file_name,
                "condition": run.condition,
                "run_number": run.run_number,
                "llm_model": self.model,
                "llm_temperature": self.temperature,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "pre_cc": int(pre_cc) if pd.notna(pre_cc) else None,
                "run_object": run,
                "source_file": source_file,
                "csv_idx": idx,
            })
            commit_hash = ""  # Will be filled in after batch commit

            # Calculate local before/after metrics
            try:
                source_code = source_file.read_text(encoding="utf-8")
                extension = source_file.suffix.lstrip(".") or "txt"
                pre_local = analyze_code_metrics(source_code, extension=extension)
                post_local = analyze_code_metrics(code, extension=extension)
                local_deltas = local_metric_delta(pre_local, post_local)
                nfr_score = local_nfr_alignment_score(pre_local, post_local)
            except Exception as e:
                logger.warning(f"Local metrics failed for {record_id}: {e}")
                pre_local = post_local = local_deltas = {}
                nfr_score = None

            # Update state
            self.state_manager.update_run_status(record_id, "COMPLETED", "CSV_UPDATE")

            # Build SonarCloud component key
            if self.namespace:
                relative_path = (
                    f"{self.conditions_root}/{run.condition}/file_{run.file_id:04d}/"
                    f"run_{run.run_number}{source_file.suffix or '.txt'}"
                )
                sonar_key = f"{SONARCLOUD_PROJECT_KEY}:{relative_path}"
            else:
                sonar_key = SONARCLOUD_COMPONENT_TEMPLATE.format(
                    condition=run.condition,
                    file_id=run.file_id,
                    run_number=run.run_number,
                )

            # Update CSV row — including model/temperature written by both providers
            self._ensure_text_columns()
            self._ensure_local_metric_columns()

            self.csv_df.loc[idx, "refactoring_applied"] = "Y"
            self.csv_df.loc[idx, "llm_model"] = self.model
            self.csv_df.loc[idx, "llm_temperature"] = self.temperature
            self.csv_df.loc[idx, "prompt_tokens"] = prompt_tokens
            self.csv_df.loc[idx, "completion_tokens"] = completion_tokens
            self.csv_df.loc[idx, "llm_tokens_used"] = prompt_tokens + completion_tokens
            self.csv_df.loc[idx, "git_commit_hash"] = commit_hash
            self.csv_df.loc[idx, "sonar_component_key"] = sonar_key

            if pre_local:
                self.csv_df.loc[idx, "pre_local_cyclomatic_complexity"] = pre_local.get("cyclomatic_complexity")
                self.csv_df.loc[idx, "pre_local_cognitive_complexity"] = pre_local.get("cognitive_complexity")
                self.csv_df.loc[idx, "pre_local_ncloc"] = pre_local.get("ncloc")
                self.csv_df.loc[idx, "pre_local_maintainability_index"] = pre_local.get("maintainability_index_local")

            if post_local:
                self.csv_df.loc[idx, "post_local_cyclomatic_complexity"] = post_local.get("cyclomatic_complexity")
                self.csv_df.loc[idx, "post_local_cognitive_complexity"] = post_local.get("cognitive_complexity")
                self.csv_df.loc[idx, "post_local_ncloc"] = post_local.get("ncloc")
                self.csv_df.loc[idx, "post_local_maintainability_index"] = post_local.get("maintainability_index_local")
                self.csv_df.loc[idx, "maintainability_index"] = post_local.get("maintainability_index_local")

            if local_deltas:
                self.csv_df.loc[idx, "cc_delta_local"] = local_deltas.get("cc_delta_local")
                self.csv_df.loc[idx, "cognitive_delta_local"] = local_deltas.get("cognitive_delta_local")
                self.csv_df.loc[idx, "ncloc_delta_local"] = local_deltas.get("ncloc_delta_local")
                self.csv_df.loc[idx, "maintainability_delta_local"] = local_deltas.get("maintainability_delta_local")

            if nfr_score is not None:
                self.csv_df.loc[idx, "nfr_alignment_score"] = nfr_score

            processed_count += 1
            logger.info(f"Processed result {record_id} ({processed_count} so far)")

        # Single commit for all files in this retrieval pass, then push once
        if batch_commits_to_make:
            with self._git_lock:
                n = len(batch_commits_to_make)
                first = batch_commits_to_make[0]
                label = self.model_key if self.provider == "together" else self.model
                logger.info(f"Committing {n} files for {self.provider} model {label}")
                try:
                    commit_hash = self.repo_manager.create_commit(
                        record_id=first["record_id"],
                        file_id=first["file_id"],
                        project_name=first["project_name"],
                        file_name=f"{n} files via {self.provider} ({label})",
                        condition=first["condition"],
                        run_number=first["run_number"],
                        llm_model=self.model,
                        llm_temperature=self.temperature,
                        prompt_tokens=sum(c["prompt_tokens"] for c in batch_commits_to_make),
                        completion_tokens=sum(c["completion_tokens"] for c in batch_commits_to_make),
                        total_tokens=sum(c["total_tokens"] for c in batch_commits_to_make),
                        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        pre_cc=first["pre_cc"],
                    )
                    for commit_info in batch_commits_to_make:
                        commit_info["run_object"].git_commit_hash = commit_hash
                        self.csv_df.loc[commit_info["csv_idx"], "git_commit_hash"] = commit_hash
                    logger.info(f"  Single commit: {commit_hash[:8]}")
                except Exception as e:
                    logger.error(f"Failed to create commit: {e}")
                    for commit_info in batch_commits_to_make:
                        self.csv_df.loc[commit_info["csv_idx"], "git_commit_hash"] = ""

                # Push once after all commits
                try:
                    self.repo_manager.push_to_remote()
                    logger.info(f"Git push succeeded ({n} files)")
                except Exception as e:
                    logger.warning(f"Git push failed: {e}")

        # Save CSV
        if auto_update_csv and processed_count > 0:
            with self._csv_lock:
                self.csv_df.to_csv(self.output_csv, index=False)
            logger.info(f"Updated CSV with {processed_count} new results → {self.output_csv.name}")

        return processed_count

    def stream_batch_results(
        self,
        batch_ids: Optional[List[str]] = None,
        poll_interval: int = 60,
        max_wait_hours: int = 24,
    ) -> Dict[str, Any]:
        """
        Stream results as batches complete, with live polling.

        Returns:
            Final summary
        """
        batch_ids = self._load_batch_ids(batch_ids)
        if not batch_ids:
            logger.warning("No batch IDs to stream. Submit batches first with: batch-submit")
            return {}

        start_time = time.time()
        max_wait_seconds = max_wait_hours * 3600

        logger.info(f"Streaming results from {len(batch_ids)} batches...")
        logger.info(f"Polling every {poll_interval}s, max wait {max_wait_hours}h")

        while True:
            elapsed = time.time() - start_time
            if elapsed > max_wait_seconds:
                logger.warning(f"Timeout: exceeded {max_wait_hours} hours")
                break

            summary = self.poll_batches(batch_ids)
            if not summary:
                break

            if summary["completion_pct"] == 100:
                logger.info("All batches completed!")
                break

            logger.info(
                f"[{datetime.now().strftime('%H:%M:%S')}] "
                f"Progress: {summary['total_completed']}/{summary['total_requests']} "
                f"({summary['completion_pct']}%) | Processing: {summary['total_processing']}"
            )

            time.sleep(poll_interval)

        # Final retrieval pass
        self.retrieve_and_process_results(batch_ids, auto_update_csv=True)

        final_summary = self.poll_batches(batch_ids)
        logger.info("Batch streaming complete!")

        return final_summary

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    def _load_batch_ids(self, batch_ids: Optional[List[str]]) -> List[str]:
        """Load batch IDs from argument or provider-specific saved file."""
        if batch_ids:
            return batch_ids
        if self.provider == "anthropic":
            batch_ids_file = Path.home() / ".claude" / "batches" / "batch_ids.json"
        else:
            batch_ids_file = self.batch_dir / f"batch_ids_{self.model_key}.json"
        if batch_ids_file.exists():
            try:
                with open(batch_ids_file) as f:
                    data = json.load(f)
                # Support both formats: plain list or {"batch_ids": [...]}
                if isinstance(data, list):
                    return data
                return data.get("batch_ids", [])
            except Exception as e:
                logger.warning(f"Failed to load batch IDs: {e}")
        return []

    def _load_prompts(self) -> Dict[str, str]:
        """Load record_id -> active_prompt mapping from active_prompts_for_experiment.csv."""
        if not self.prompts_file.exists():
            raise FileNotFoundError(
                f"Active prompts file not found: {self.prompts_file}\n"
                "Copy active_prompts_for_experiment.csv to the data/ directory."
            )
        df = pd.read_csv(self.prompts_file, dtype={"record_id": str})
        mapping = dict(zip(df["record_id"], df["active_prompt"]))
        logger.info(f"Loaded {len(mapping)} prompts from {self.prompts_file.name}")
        return mapping

    @staticmethod
    def _build_location_context(source_code: str, sonar_line: Any) -> str:
        """Return an unnumbered source excerpt centered on a SonarCloud line."""
        try:
            line_number = int(float(sonar_line))
        except (TypeError, ValueError):
            return ""

        source_lines = source_code.splitlines()
        if not source_lines or not 1 <= line_number <= len(source_lines):
            return ""

        start = max(0, line_number - 1 - LOCATION_CONTEXT_LINES)
        end = min(len(source_lines), line_number + LOCATION_CONTEXT_LINES)
        excerpt = "\n".join(source_lines[start:end])

        return (
            "The static-analysis finding applies at or immediately around the "
            "following exact excerpt from the complete source file. Use it only "
            "to locate the relevant function or method; do not return this "
            "excerpt separately:\n\n"
            f"{excerpt}"
        )

    def _build_prompt(self, record_id: str, source_code: str, sonar_line: Any = None) -> str:
        """Build a prompt with uniform issue-localization context and full source code."""
        _no_fence_reminder = (
            "Return ONLY the raw refactored source code with no markdown fences, "
            "no code-fence markers, and no explanations. "
            "Your response MUST be the COMPLETE file from the first line to the last "
            "(all imports, unrelated functions, and unchanged code included), with only "
            "the necessary parts modified. Never return just the changed function or a "
            "partial excerpt."
        )
        location_context = self._build_location_context(source_code, sonar_line)
        source_section = f"Complete source code:\n{source_code}"
        active_prompt = self._prompts.get(record_id)
        if not active_prompt or str(active_prompt) == "nan":
            logger.warning(f"No active_prompt found for record_id={record_id}, using fallback")
            return (
                "Refactor the following code to reduce complexity and improve maintainability. "
                f"{_no_fence_reminder}\n\n"
                f"{location_context}\n\n"
                f"{source_section}"
            )
        context_block = f"\n\n{location_context}" if location_context else ""
        return f"{active_prompt}\n\n{_no_fence_reminder}{context_block}\n\n{source_section}"

    def _get_system_prompt(self, condition: str) -> str:
        """Get system prompt based on condition."""
        _no_fence = (
            "Return ONLY the raw refactored source code. "
            "Do NOT wrap the code in markdown code fences (no ```javascript, no ```, etc.). "
            "Do NOT include any explanation, commentary, or preamble. "
            "Always return the ENTIRE file, unchanged parts included \u2014 never return only "
            "the modified function, snippet, or diff."
        )
        prompts = {
            "baseline": (
                "You are an expert code refactoring specialist. "
                "Refactor the given code to improve code quality and reduce complexity. "
                + _no_fence
            ),
            "nfr_enriched": (
                "You are an expert code refactoring specialist focused on non-functional requirements. "
                "Refactor the code to reduce complexity while satisfying the stated NFR constraints. "
                + _no_fence
            ),
            "adaptive_nfr": (
                "You are an expert code refactoring specialist. "
                "Analyze the structural debt archetype described and refactor the code accordingly. "
                + _no_fence
            ),
        }
        return prompts.get(condition, prompts["baseline"])

    def _initialize_state_from_csv(self) -> None:
        """Initialize experiment state from CSV file."""
        from orchestration.state_manager import ExperimentRun

        logger.info(f"Initializing state with {len(self.csv_df)} runs from CSV...")

        manifest_index = self._load_manifest_index()

        runs_to_add = []
        for _, row in self.csv_df.iterrows():
            record_id = str(row["record_id"])

            # Try to resolve file_id from manifest; fall back to CSV column
            try:
                file_id, _ = self._find_source_file_for_row(row, manifest_index)
            except Exception:
                file_id = int(row.get("file_id", 0) or 0)

            run = ExperimentRun(
                record_id=record_id,
                file_id=file_id,
                project_name=str(row.get("project_name", "")),
                file_name=str(row.get("file_name", "")),
                condition=str(row.get("prompt_condition", "")),
                run_number=int(row.get("run_number", 0)),
                status="PENDING",
            )
            runs_to_add.append(run)

        # Bulk-save once to avoid 1000+ slow filesystem writes
        self.state_manager.bulk_add_runs(runs_to_add)
        logger.info(f"Initialized state with {len(runs_to_add)} runs")

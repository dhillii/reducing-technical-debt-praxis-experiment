"""
Batch-mode orchestrator for running large-scale refactoring experiments.

Integrates with the Anthropic Batch API to submit, poll, and process
all 1,314 refactorings in parallel.
"""

import json
import re
import threading
import time
import pandas as pd
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone

from api.batch_processor import BatchProcessor, BatchOrchestrator
from api.claude_caller import ClaudeCaller
from orchestration.state_manager import StateManager
from orchestration.experiment_repo_manager import ExperimentRepoManager
from utils.config import (
    CSV_INPUT_FILE,
    ACTIVE_PROMPTS_FILE,
    SOURCE_CODE_DIR,
    EXTRACTION_MANIFEST_FILE,
    SONARCLOUD_COMPONENT_TEMPLATE,
    CLAUDE_MODEL,
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


class BatchRunOrchestrator:
    """Orchestrates batch refactoring experiments end-to-end."""

    def __init__(self):
        """Initialize batch orchestrator."""
        self.state_manager = StateManager()
        self.batch_orchestrator = BatchOrchestrator()
        self.repo_manager = ExperimentRepoManager()
        self.claude_caller = ClaudeCaller()
        self.model = CLAUDE_MODEL
        self.csv_df = pd.read_csv(CSV_INPUT_FILE, dtype={"record_id": str})
        self._prompts: Dict[str, str] = self._load_prompts()
        self._git_lock = threading.Lock()
        self._csv_lock = threading.Lock()
        self._manifest_index: Optional[Dict[Tuple[str, str], int]] = None
        self._ensure_text_columns()
        self._ensure_local_metric_columns()
        logger.info(f"Loaded CSV: {len(self.csv_df)} records, {len(self._prompts)} prompts")

    # -------------------------------------------------------------------------
    # CSV column helpers
    # -------------------------------------------------------------------------

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

        if not EXTRACTION_MANIFEST_FILE.exists():
            raise FileNotFoundError(f"Extraction manifest not found: {EXTRACTION_MANIFEST_FILE}")

        manifest_df = pd.read_csv(EXTRACTION_MANIFEST_FILE)
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

        candidates = sorted(SOURCE_CODE_DIR.glob(f"file_{file_id:04d}_*"))
        if not candidates:
            raise FileNotFoundError(
                f"No source file for file_id={file_id:04d} under {SOURCE_CODE_DIR}"
            )

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

            prompt = self._build_prompt(record_id, source_code)
            system_prompt = self._get_system_prompt(run.condition)

            requests.append({
                "record_id": record_id,
                "prompt": prompt,
                "system_prompt": system_prompt,
                "max_tokens": 4096,
                "temperature": 0.0,
            })

        logger.info(f"Prepared {len(requests)} batch requests")
        return requests

    def submit_batches(
        self,
        batch_size: int = 164,
        status_filter: str = "PENDING"
    ) -> List[str]:
        """
        Submit all pending runs as batches.

        Returns:
            List of batch IDs
        """
        requests = self.prepare_batch_requests(status_filter)

        if not requests:
            logger.warning(f"No {status_filter} runs found")
            return []

        batch_ids = self.batch_orchestrator.create_and_submit_batches(
            requests,
            batch_size=batch_size
        )

        batch_ids_file = Path.home() / ".claude" / "batches" / "batch_ids.json"
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
        git_commits_made = False

        for result in all_results:
            if result["status"] != "succeeded":
                logger.warning(f"Result {result['record_id']} failed: {result['error']}")
                continue

            record_id = result["record_id"]
            message = result["message"]

            if not message:
                logger.warning(f"No message in result for {record_id}")
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

            # Extract code from batch response
            raw_text = message.content[0].text if message.content else ""
            code = self.claude_caller.extract_code_from_response(raw_text, file_extension=".js")
            tokens = message.usage

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

            # Write generated code file
            try:
                self.repo_manager.write_code_file(
                    condition=run.condition,
                    file_id=run.file_id,
                    run_number=run.run_number,
                    code=code,
                )
            except Exception as e:
                logger.warning(f"Failed to write code file for {record_id}: {e}")
                continue

            # Create git commit
            try:
                pre_cc = csv_row.get("pre_cyclomatic_complexity")
                with self._git_lock:
                    commit_hash = self.repo_manager.create_commit(
                        record_id=int(record_id),
                        file_id=run.file_id,
                        project_name=run.project_name,
                        file_name=run.file_name,
                        condition=run.condition,
                        run_number=run.run_number,
                        llm_model=self.model,
                        llm_temperature=0.0,
                        prompt_tokens=tokens.input_tokens,
                        completion_tokens=tokens.output_tokens,
                        total_tokens=tokens.input_tokens + tokens.output_tokens,
                        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        pre_cc=int(pre_cc) if pd.notna(pre_cc) else None,
                    )
                run.git_commit_hash = commit_hash
                git_commits_made = True
            except Exception as e:
                logger.warning(f"Git commit failed for {record_id}: {e}")
                commit_hash = ""

            # Calculate local before/after metrics
            try:
                source_code = source_file.read_text(encoding="utf-8")
                pre_local = analyze_code_metrics(source_code, extension="js")
                post_local = analyze_code_metrics(code, extension="js")
                local_deltas = local_metric_delta(pre_local, post_local)
                nfr_score = local_nfr_alignment_score(pre_local, post_local)
            except Exception as e:
                logger.warning(f"Local metrics failed for {record_id}: {e}")
                pre_local = post_local = local_deltas = {}
                nfr_score = None

            # Update state
            self.state_manager.update_run_status(record_id, "COMPLETED", "CSV_UPDATE")

            # Build SonarCloud component key
            sonar_key = SONARCLOUD_COMPONENT_TEMPLATE.format(
                condition=run.condition,
                file_id=run.file_id,
                run_number=run.run_number,
            )

            # Update CSV row
            self._ensure_text_columns()
            self._ensure_local_metric_columns()

            self.csv_df.loc[idx, "refactoring_applied"] = "Y"
            self.csv_df.loc[idx, "prompt_tokens"] = tokens.input_tokens
            self.csv_df.loc[idx, "completion_tokens"] = tokens.output_tokens
            self.csv_df.loc[idx, "llm_tokens_used"] = tokens.input_tokens + tokens.output_tokens
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

        # Batch push all commits
        if git_commits_made:
            try:
                with self._git_lock:
                    self.repo_manager.push_to_remote()
                logger.info(f"Batch git push succeeded ({processed_count} commits)")
            except Exception as e:
                logger.warning(f"Batch git push failed: {e}")

        # Save CSV
        if auto_update_csv and processed_count > 0:
            with self._csv_lock:
                self.csv_df.to_csv(CSV_INPUT_FILE, index=False)
            logger.info(f"Updated CSV with {processed_count} new results")

        return processed_count

    def stream_batch_results(
        self,
        batch_ids: Optional[List[str]] = None,
        poll_interval: int = 60,
        max_wait_hours: int = 24
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

            self.retrieve_and_process_results(batch_ids, auto_update_csv=True)

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
        """Load batch IDs from argument or saved file."""
        if batch_ids:
            return batch_ids
        batch_ids_file = Path.home() / ".claude" / "batches" / "batch_ids.json"
        if batch_ids_file.exists():
            try:
                with open(batch_ids_file) as f:
                    data = json.load(f)
                return data.get("batch_ids", [])
            except Exception as e:
                logger.warning(f"Failed to load batch IDs: {e}")
        return []

    def _load_prompts(self) -> Dict[str, str]:
        """Load record_id -> active_prompt mapping from active_prompts_for_experiment.csv."""
        if not ACTIVE_PROMPTS_FILE.exists():
            raise FileNotFoundError(
                f"Active prompts file not found: {ACTIVE_PROMPTS_FILE}\n"
                "Copy active_prompts_for_experiment.csv to the data/ directory."
            )
        df = pd.read_csv(ACTIVE_PROMPTS_FILE, dtype={"record_id": str})
        mapping = dict(zip(df["record_id"], df["active_prompt"]))
        logger.info(f"Loaded {len(mapping)} prompts from {ACTIVE_PROMPTS_FILE.name}")
        return mapping

    def _build_prompt(self, record_id: str, source_code: str) -> str:
        """Build the refactoring prompt by appending source code to the active prompt."""
        active_prompt = self._prompts.get(record_id)
        if not active_prompt or str(active_prompt) == "nan":
            logger.warning(f"No active_prompt found for record_id={record_id}, using fallback")
            return (
                "Refactor the following code to reduce complexity and improve maintainability. "
                "Return only the refactored code without explanations:\n\n"
                f"{source_code}"
            )
        return f"{active_prompt}\n\nReturn only the refactored code without explanations:\n\n{source_code}"

    def _get_system_prompt(self, condition: str) -> str:
        """Get system prompt based on condition."""
        prompts = {
            "baseline": (
                "You are an expert code refactoring specialist. "
                "Refactor the given code to improve code quality and reduce complexity. "
                "Return only the refactored code without any explanation."
            ),
            "nfr_enriched": (
                "You are an expert code refactoring specialist focused on non-functional requirements. "
                "Refactor the code to reduce complexity while satisfying the stated NFR constraints. "
                "Return only the refactored code without any explanation."
            ),
            "adaptive_nfr": (
                "You are an expert code refactoring specialist. "
                "Analyze the structural debt archetype described and refactor the code accordingly. "
                "Return only the refactored code without any explanation."
            ),
        }
        return prompts.get(condition, prompts["baseline"])

    def _initialize_state_from_csv(self) -> None:
        """Initialize experiment state from CSV file."""
        from orchestration.state_manager import ExperimentRun

        logger.info(f"Initializing state with {len(self.csv_df)} runs from CSV...")

        manifest_index = self._load_manifest_index()

        for _, row in self.csv_df.iterrows():
            record_id = str(row["record_id"])

            # Try to resolve file_id from manifest; fall back to CSV column
            try:
                file_id, _ = self._find_source_file_for_row(row, manifest_index)
            except Exception:
                file_id = int(row.get("file_id", 0))

            run = ExperimentRun(
                record_id=record_id,
                file_id=file_id,
                project_name=str(row.get("project_name", "")),
                file_name=str(row.get("file_name", "")),
                condition=str(row.get("prompt_condition", "")),
                run_number=int(row.get("run_number", 0)),
                status="PENDING",
            )
            self.state_manager.add_run(run)

        logger.info(f"Initialized state with {len(self.csv_df)} runs")

"""
State management module for the dissertation experiment orchestration system.

Handles persistent JSON state with thread-safe writes, state transitions,
and checkpoint recovery. Tracks 1,314 experiment runs with detailed metadata.
"""

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict, field
from utils.config import EXPERIMENT_STATE_FILE, TOTAL_EXPECTED_RUNS, EXECUTION_STAGES
from utils.logger_config import get_logger

logger = get_logger("state_manager")


@dataclass
class RunError:
    """Represents a single error event during run execution."""
    timestamp: str
    stage: str
    error_type: str
    message: str
    is_retriable: bool


@dataclass
class PostMetrics:
    """Post-refactoring metrics extracted from SonarCloud."""
    cyclomatic_complexity: Optional[int] = None
    cognitive_complexity: Optional[int] = None
    ncloc: Optional[int] = None


@dataclass
class ExperimentRun:
    """Represents a single experiment run."""
    record_id: str
    file_id: int
    project_name: str
    file_name: str
    condition: str
    run_number: int
    status: str = "PENDING"  # PENDING, IN_PROGRESS, COMPLETED, FAILED, SKIPPED
    current_stage: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    failed_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    llm_tokens_used: Optional[int] = None
    llm_model: Optional[str] = None
    llm_temperature: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    git_commit_hash: Optional[str] = None
    sonar_component_key: Optional[str] = None
    sonar_analysis_status: Optional[str] = None
    sonar_analysis_date: Optional[str] = None
    post_metrics: Optional[PostMetrics] = None
    cc_delta: Optional[int] = None
    failure_stage: Optional[str] = None
    retry_count: int = 0
    errors: List[RunError] = field(default_factory=list)


@dataclass
class ExperimentMetadata:
    """Metadata about the overall experiment run."""
    start_time: str
    last_updated: str
    status: str  # RUNNING, PAUSED, COMPLETED, FAILED
    total_runs: int
    completed: int
    failed: int
    in_progress: int
    pending: int


class StateManager:
    """
    Manages persistent experiment state with thread-safe operations.
    """

    def __init__(self, state_file: Path = EXPERIMENT_STATE_FILE):
        """
        Initialize the state manager.

        Args:
            state_file: Path to JSON state file
        """
        self.state_file = Path(state_file)
        self._lock = threading.RLock()
        self._state: Dict[str, Any] = self._load_or_initialize_state()

    def _load_or_initialize_state(self) -> Dict[str, Any]:
        """Load state from disk or initialize new state."""
        if self.state_file.exists():
            try:
                with open(self.state_file, "r") as f:
                    state = json.load(f)
                logger.info(f"Loaded state file: {self.state_file}")
                return state
            except Exception as e:
                logger.error(f"Failed to load state file: {e}")
                raise

        # Initialize new state
        logger.info("Initializing new state file")
        return {
            "experiment_metadata": {
                "start_time": datetime.utcnow().isoformat() + "Z",
                "last_updated": datetime.utcnow().isoformat() + "Z",
                "status": "RUNNING",
                "total_runs": TOTAL_EXPECTED_RUNS,
                "completed": 0,
                "failed": 0,
                "in_progress": 0,
                "pending": TOTAL_EXPECTED_RUNS,
            },
            "runs": {},
        }

    def _save_state(self) -> None:
        """Write state to disk (thread-safe)."""
        with self._lock:
            try:
                # Write to temporary file first, then move (atomic)
                temp_file = self.state_file.with_suffix(".json.tmp")
                with open(temp_file, "w") as f:
                    json.dump(self._state, f, indent=2, default=str)
                temp_file.replace(self.state_file)
                logger.debug(f"State saved to {self.state_file}")
            except Exception as e:
                logger.error(f"Failed to save state: {e}")
                raise

    def get_run(self, record_id: str) -> Optional[ExperimentRun]:
        """
        Get a run by record ID.

        Args:
            record_id: Unique record identifier

        Returns:
            ExperimentRun object or None
        """
        with self._lock:
            run_data = self._state.get("runs", {}).get(record_id)
            if run_data:
                return self._deserialize_run(run_data)
            return None

    def add_run(self, run: ExperimentRun) -> None:
        """
        Add or update a run in state.

        Args:
            run: ExperimentRun object
        """
        with self._lock:
            run_dict = self._serialize_run(run)
            self._state["runs"][run.record_id] = run_dict
            self._update_metadata()
            self._save_state()
            logger.debug(f"Added run {run.record_id} with status {run.status}")

    def update_run_status(self, record_id: str, status: str, stage: Optional[str] = None) -> None:
        """
        Update run status and optionally current stage.

        Args:
            record_id: Run identifier
            status: New status (PENDING, IN_PROGRESS, COMPLETED, FAILED, SKIPPED)
            stage: Optional current stage
        """
        with self._lock:
            if record_id not in self._state["runs"]:
                logger.warning(f"Record {record_id} not found")
                return

            run = self._state["runs"][record_id]
            old_status = run.get("status")
            run["status"] = status
            run["current_stage"] = stage

            if status == "IN_PROGRESS" and run.get("started_at") is None:
                run["started_at"] = datetime.utcnow().isoformat() + "Z"

            if status == "COMPLETED":
                run["completed_at"] = datetime.utcnow().isoformat() + "Z"
                if run.get("started_at"):
                    start = datetime.fromisoformat(run["started_at"].replace("Z", "+00:00"))
                    end = datetime.utcnow()
                    run["duration_seconds"] = (end - start).total_seconds()

            if status == "FAILED":
                run["failed_at"] = datetime.utcnow().isoformat() + "Z"

            self._update_metadata()
            self._save_state()
            logger.debug(f"Run {record_id}: {old_status} → {status} @ {stage}")

    def add_error_to_run(self, record_id: str, stage: str, error_type: str,
                         message: str, is_retriable: bool) -> None:
        """
        Add an error entry to a run's error history.

        Args:
            record_id: Run identifier
            stage: Execution stage where error occurred
            error_type: Type of error
            message: Error message
            is_retriable: Whether the error can be retried
        """
        with self._lock:
            if record_id not in self._state["runs"]:
                logger.warning(f"Record {record_id} not found")
                return

            run = self._state["runs"][record_id]
            error = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "stage": stage,
                "error_type": error_type,
                "message": message,
                "is_retriable": is_retriable,
            }
            run["errors"].append(error)
            run["failure_stage"] = stage
            self._save_state()
            logger.debug(f"Error added to {record_id}: {error_type} @ {stage}")

    def update_run_with_metrics(
        self,
        record_id: str,
        cc: Optional[int],
        cognitive_cc: Optional[int],
        ncloc: Optional[int],
        cc_delta: Optional[int],
    ) -> None:
        """
        Update run with post-refactoring metrics.

        Args:
            record_id: Run identifier
            cc: Cyclomatic complexity
            cognitive_cc: Cognitive complexity
            ncloc: Non-comment lines of code
            cc_delta: Change in cyclomatic complexity
        """
        with self._lock:
            if record_id not in self._state["runs"]:
                logger.warning(f"Record {record_id} not found")
                return

            run = self._state["runs"][record_id]
            run["post_metrics"] = {
                "cyclomatic_complexity": cc,
                "cognitive_complexity": cognitive_cc,
                "ncloc": ncloc,
            }
            run["cc_delta"] = cc_delta
            self._save_state()
            logger.debug(f"Metrics updated for {record_id}: CC={cc}, delta={cc_delta}")

    def update_run_with_sonar_data(
        self,
        record_id: str,
        component_key: str,
        analysis_status: str,
        analysis_date: str,
    ) -> None:
        """
        Update run with SonarCloud data.

        Args:
            record_id: Run identifier
            component_key: SonarCloud component key
            analysis_status: Analysis status (PENDING, IN_PROGRESS, SUCCESS, FAILURE)
            analysis_date: ISO timestamp of analysis completion
        """
        with self._lock:
            if record_id not in self._state["runs"]:
                logger.warning(f"Record {record_id} not found")
                return

            run = self._state["runs"][record_id]
            run["sonar_component_key"] = component_key
            run["sonar_analysis_status"] = analysis_status
            run["sonar_analysis_date"] = analysis_date
            self._save_state()
            logger.debug(f"SonarCloud data updated for {record_id}")

    def get_next_pending_run(self) -> Optional[str]:
        """
        Get the record ID of the next pending run.

        Returns:
            Record ID or None if all complete
        """
        with self._lock:
            for record_id, run in self._state["runs"].items():
                if run.get("status") == "PENDING":
                    return record_id
            return None

    def get_all_runs_by_status(self, status: str) -> List[str]:
        """
        Get all record IDs for runs with a given status.

        Args:
            status: Run status

        Returns:
            List of record IDs
        """
        with self._lock:
            return [
                record_id for record_id, run in self._state["runs"].items()
                if run.get("status") == status
            ]

    def get_failed_runs(self) -> List[str]:
        """Get all failed record IDs."""
        return self.get_all_runs_by_status("FAILED")

    def get_runs_by_condition(self, condition: str, status: Optional[str] = None) -> List[str]:
        """Get record IDs for runs matching a condition."""
        with self._lock:
            result = []
            for record_id, run in self._state["runs"].items():
                if run.get("condition") == condition:
                    if status is None or run.get("status") == status:
                        result.append(record_id)
            return result

    def get_runs_by_file_id(self, file_id: int, status: Optional[str] = None) -> List[str]:
        """Get record IDs for runs matching a file ID."""
        with self._lock:
            result = []
            for record_id, run in self._state["runs"].items():
                if run.get("file_id") == file_id:
                    if status is None or run.get("status") == status:
                        result.append(record_id)
            return result

    def pause_experiment(self) -> None:
        """Pause the experiment."""
        with self._lock:
            self._state["experiment_metadata"]["status"] = "PAUSED"
            self._save_state()
            logger.info("Experiment paused")

    def resume_experiment(self) -> None:
        """Resume the experiment."""
        with self._lock:
            self._state["experiment_metadata"]["status"] = "RUNNING"
            self._save_state()
            logger.info("Experiment resumed")

    def reset_run_to_pending(self, record_id: str) -> None:
        """Reset a failed run back to PENDING for retry."""
        with self._lock:
            if record_id not in self._state["runs"]:
                logger.warning(f"Record {record_id} not found")
                return

            run = self._state["runs"][record_id]
            if run.get("status") == "FAILED":
                run["status"] = "PENDING"
                run["current_stage"] = None
                run["retry_count"] = run.get("retry_count", 0) + 1
                run["failed_at"] = None
                self._update_metadata()
                self._save_state()
                logger.info(f"Run {record_id} reset to PENDING (retry_count={run['retry_count']})")
            else:
                logger.warning(f"Cannot reset run {record_id}: status is {run.get('status')}")

    def _update_metadata(self) -> None:
        """Update experiment metadata counts (must be called with lock held)."""
        runs = self._state["runs"]
        statuses = {}
        for run in runs.values():
            status = run.get("status", "PENDING")
            statuses[status] = statuses.get(status, 0) + 1

        metadata = self._state["experiment_metadata"]
        metadata["last_updated"] = datetime.utcnow().isoformat() + "Z"
        metadata["completed"] = statuses.get("COMPLETED", 0)
        metadata["failed"] = statuses.get("FAILED", 0)
        metadata["in_progress"] = statuses.get("IN_PROGRESS", 0)
        metadata["pending"] = statuses.get("PENDING", 0)

    def _serialize_run(self, run: ExperimentRun) -> Dict[str, Any]:
        """Convert ExperimentRun to dictionary."""
        data = asdict(run)
        if run.post_metrics:
            data["post_metrics"] = asdict(run.post_metrics)
        if run.errors:
            data["errors"] = [asdict(e) for e in run.errors]
        return data

    def _deserialize_run(self, data: Dict[str, Any]) -> ExperimentRun:
        """Convert dictionary to ExperimentRun."""
        errors = [RunError(**e) for e in data.get("errors", [])]
        post_metrics_data = data.get("post_metrics")
        post_metrics = PostMetrics(**post_metrics_data) if post_metrics_data else None

        return ExperimentRun(
            record_id=data["record_id"],
            file_id=data["file_id"],
            project_name=data["project_name"],
            file_name=data["file_name"],
            condition=data["condition"],
            run_number=data["run_number"],
            status=data.get("status", "PENDING"),
            current_stage=data.get("current_stage"),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            failed_at=data.get("failed_at"),
            duration_seconds=data.get("duration_seconds"),
            llm_tokens_used=data.get("llm_tokens_used"),
            llm_model=data.get("llm_model"),
            llm_temperature=data.get("llm_temperature"),
            prompt_tokens=data.get("prompt_tokens"),
            completion_tokens=data.get("completion_tokens"),
            git_commit_hash=data.get("git_commit_hash"),
            sonar_component_key=data.get("sonar_component_key"),
            sonar_analysis_status=data.get("sonar_analysis_status"),
            sonar_analysis_date=data.get("sonar_analysis_date"),
            post_metrics=post_metrics,
            cc_delta=data.get("cc_delta"),
            failure_stage=data.get("failure_stage"),
            retry_count=data.get("retry_count", 0),
            errors=errors,
        )

    def get_statistics(self) -> Dict[str, Any]:
        """Get overall experiment statistics."""
        with self._lock:
            metadata = self._state["experiment_metadata"]
            return {
                "total_runs": metadata["total_runs"],
                "completed": metadata["completed"],
                "failed": metadata["failed"],
                "in_progress": metadata["in_progress"],
                "pending": metadata["pending"],
                "completion_percentage": (metadata["completed"] / metadata["total_runs"] * 100)
                if metadata["total_runs"] > 0 else 0,
                "start_time": metadata["start_time"],
                "last_updated": metadata["last_updated"],
                "status": metadata["status"],
            }

    def get_state_summary(self) -> Dict[str, Any]:
        """Get a complete summary of current state."""
        with self._lock:
            return {
                "metadata": self._state["experiment_metadata"],
                "run_count": len(self._state["runs"]),
            }

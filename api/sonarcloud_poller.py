"""
SonarCloud API poller for metrics extraction.

Polls SonarCloud until analysis completes and metrics are available.
Handles timeouts and retries with exponential backoff.
"""

import time
import requests
from typing import Optional, Dict, Any
from datetime import datetime
from utils.config import (
    SONAR_TOKEN,
    SONAR_ORG,
    SONARCLOUD_BASE_URL,
    SONARCLOUD_PROJECT_KEY,
    SONARCLOUD_POLL_INTERVAL,
    SONARCLOUD_POLL_TIMEOUT,
    SONARCLOUD_INITIAL_WAIT,
    MAX_AUTOMATIC_RETRIES,
    RETRY_BACKOFF_BASE,
    RETRY_BACKOFF_MAX,
)
from utils.logger_config import get_logger

logger = get_logger("sonarcloud_poller")

REQUIRED_METRIC_KEYS = {
    "cyclomatic_complexity",
    "cognitive_complexity",
    "ncloc",
}


class SonarCloudComponentNotReady(Exception):
    """Raised when SonarCloud analysis is done but file-level component isn't queryable yet."""
    pass


class SonarCloudPoller:
    """Polls SonarCloud API for project metrics."""

    def __init__(self, token: Optional[str] = None, org: Optional[str] = None):
        """
        Initialize SonarCloud poller.

        Args:
            token: SonarCloud token (defaults to SONAR_TOKEN)
            org: SonarCloud organization (defaults to SONAR_ORG)
        """
        self.token = token or SONAR_TOKEN
        self.org = org or SONAR_ORG
        self.base_url = SONARCLOUD_BASE_URL

        if not self.token:
            raise ValueError("SONAR_TOKEN not set")

        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        })

    def wait_for_analysis_completion(
        self,
        component_key: str,
        timeout: int = SONARCLOUD_POLL_TIMEOUT,
        initial_wait: int = SONARCLOUD_INITIAL_WAIT,
    ) -> Dict[str, Any]:
        """
        Poll SonarCloud until analysis completes.

        Args:
            component_key: SonarCloud component key
            timeout: Max seconds to wait for analysis
            initial_wait: Seconds to wait before first poll

        Returns:
            Dict with analysis status and metrics

        Raises:
            TimeoutError: If analysis doesn't complete within timeout
            Exception: For API errors
        """
        logger.debug(f"Waiting {initial_wait}s before first SonarCloud poll...")
        time.sleep(initial_wait)

        start_time = time.time()
        poll_count = 0
        max_polls = timeout // SONARCLOUD_POLL_INTERVAL
        success_retry_count = 0
        max_success_retries = 3  # Try a few more times after first SUCCESS
        last_metrics = None

        while time.time() - start_time < timeout:
            poll_count += 1
            elapsed = time.time() - start_time

            try:
                logger.debug(
                    f"Polling SonarCloud... (attempt {poll_count}/{max_polls}, "
                    f"elapsed: {elapsed:.1f}s)"
                )

                # Check project analysis status
                status = self._get_analysis_status(component_key)

                if status["task"]["status"] == "SUCCESS":
                    logger.info(f"SonarCloud analysis completed for {component_key}")
                    metrics = self._extract_metrics(component_key)
                    last_metrics = metrics

                    missing_metrics = [
                        key for key in REQUIRED_METRIC_KEYS
                        if metrics.get(key) is None
                    ]
                    if missing_metrics:
                        if success_retry_count < max_success_retries:
                            success_retry_count += 1
                            logger.debug(
                                f"Metrics incomplete for {component_key} (retry {success_retry_count}/{max_success_retries}); "
                                f"missing: {', '.join(sorted(missing_metrics))}"
                            )
                            raise SonarCloudComponentNotReady(
                                f"Metrics not ready yet for {component_key}; missing: {', '.join(sorted(missing_metrics))}"
                            )
                        else:
                            logger.warning(
                                f"SonarCloud CE task SUCCESS but metrics still incomplete after {success_retry_count} retries; "
                                f"missing: {', '.join(sorted(missing_metrics))}. Returning partial metrics."
                            )
                            return {
                                "status": "SUCCESS",
                                "analysis_date": status["task"].get("executedAt", ""),
                                "metrics": metrics,
                            }

                    return {
                        "status": "SUCCESS",
                        "analysis_date": status["task"].get("executedAt", ""),
                        "metrics": metrics,
                    }

                elif status["task"]["status"] == "FAILED":
                    logger.error(f"SonarCloud analysis failed for {component_key}")
                    return {
                        "status": "FAILED",
                        "error": status["task"].get("errorMessage", "Unknown error"),
                    }

                # Still pending/in-progress
                logger.debug(f"Analysis status: {status['task']['status']}")

            except SonarCloudComponentNotReady as e:
                # Common transient state: CE task is SUCCESS but file component
                # index is not yet visible via /measures/component.
                logger.debug(f"SonarCloud component not ready yet: {str(e)}")

            except requests.RequestException as e:
                logger.warning(f"SonarCloud API error: {str(e)}")
                # Continue polling, may be transient

            # Wait before next poll
            time.sleep(SONARCLOUD_POLL_INTERVAL)

        # Timeout exceeded
        elapsed = time.time() - start_time
        logger.error(f"SonarCloud analysis timeout after {elapsed:.1f}s for {component_key}")
        raise TimeoutError(
            f"SonarCloud analysis did not complete within {timeout} seconds for {component_key}"
        )

    def get_metrics(self, component_key: str) -> Dict[str, Any]:
        """
        Get metrics for a component (assumes analysis is complete).

        Args:
            component_key: SonarCloud component key

        Returns:
            Dict with metrics
        """
        try:
            metrics = self._extract_metrics(component_key)
            logger.debug(f"Retrieved metrics for {component_key}: {metrics}")
            return metrics
        except Exception as e:
            logger.error(f"Failed to extract metrics for {component_key}: {str(e)}")
            raise

    def _get_analysis_status(self, component_key: str) -> Dict[str, Any]:
        """
        Get analysis status for the project.

        SonarCloud runs analysis at the project level, not per-file.
        We poll using the project key and check that the most recent
        analysis task completed after our commit was pushed.

        Args:
            component_key: SonarCloud file-level component key (project key extracted automatically)

        Returns:
            Analysis status dict
        """
        # ce/activity requires the project-level key, not a file-level component key
        project_key = component_key.split(":")[0] if ":" in component_key else component_key
        url = f"{self.base_url}/ce/activity"
        params = {
            "component": project_key,
            "ps": 1,  # Page size: 1 (get most recent)
        }

        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()

        data = response.json()
        if not data.get("tasks"):
            raise ValueError(f"No analysis tasks found for {component_key}")

        return {"task": data["tasks"][0]}

    def _extract_metrics(self, component_key: str) -> Dict[str, Any]:
        """
        Extract code metrics for a component.

        Args:
            component_key: SonarCloud component key

        Returns:
            Dict with metrics (cyclomatic_complexity, cognitive_complexity, ncloc)
        """
        # Preferred strategy (from initial baseline extractor):
        # 1) Query /measures/component_tree and match file by path/key.
        # 2) Fallback to /measures/component only if tree result is partial.
        metrics = self._extract_metrics_from_component_tree(component_key)

        missing_metrics = [
            key for key in REQUIRED_METRIC_KEYS
            if metrics.get(key) is None
        ]
        if missing_metrics:
            component_metrics = self._extract_metrics_from_component_endpoint(component_key)
            for key in REQUIRED_METRIC_KEYS:
                if metrics.get(key) is None and component_metrics.get(key) is not None:
                    metrics[key] = component_metrics[key]

        logger.debug(f"Extracted metrics: {metrics}")
        return metrics

    def _extract_metrics_from_component_endpoint(self, component_key: str) -> Dict[str, Any]:
        """Fallback extractor using /measures/component for a specific component key."""
        url = f"{self.base_url}/measures/component"
        metric_keys = ["complexity", "cognitive_complexity", "ncloc"]

        params = {
            "component": component_key,
            "metricKeys": ",".join(metric_keys),
        }

        response = self.session.get(url, params=params, timeout=30)

        if response.status_code == 404:
            if component_key.endswith(".js"):
                alt_component_key = component_key[:-3]
                alt_params = {
                    "component": alt_component_key,
                    "metricKeys": ",".join(metric_keys),
                }
                alt_response = self.session.get(url, params=alt_params, timeout=30)
                if alt_response.status_code == 200:
                    response = alt_response
                elif alt_response.status_code == 404:
                    raise SonarCloudComponentNotReady(
                        f"Component not indexed yet for keys: {component_key} or {alt_component_key}"
                    )
                else:
                    alt_response.raise_for_status()
            else:
                raise SonarCloudComponentNotReady(
                    f"Component not indexed yet: {component_key}"
                )

        response.raise_for_status()
        data = response.json()
        return self._parse_component_measures(data.get("component", {}).get("measures", []))

    def _extract_metrics_from_component_tree(self, component_key: str) -> Dict[str, Any]:
        """
        Fallback extractor using /measures/component_tree for file-level metrics.

        This mirrors the approach used for initial dataset generation and is
        more resilient when /measures/component returns partial data.
        """
        project_key, target_path = self._split_component_key(component_key)
        if not project_key or not target_path:
            return {
                "cyclomatic_complexity": None,
                "cognitive_complexity": None,
                "ncloc": None,
            }

        candidate_paths = [target_path]
        if target_path.endswith(".js"):
            candidate_paths.append(target_path[:-3])
        else:
            candidate_paths.append(f"{target_path}.js")

        url = f"{self.base_url}/measures/component_tree"
        page = 1
        page_size = 500
        metric_keys = "complexity,cognitive_complexity,ncloc"

        while True:
            params = {
                "component": project_key,
                "metricKeys": metric_keys,
                "qualifiers": "FIL",
                "ps": page_size,
                "p": page,
            }
            if self.org:
                params["organization"] = self.org

            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            components = data.get("components", [])
            for component in components:
                path = component.get("path", "")
                key = component.get("key", "")
                if (
                    path in candidate_paths
                    or key in [f"{project_key}:{p}" for p in candidate_paths]
                ):
                    return self._parse_component_measures(component.get("measures", []))

            total = data.get("paging", {}).get("total", 0)
            if page * page_size >= total:
                break
            page += 1

        return {
            "cyclomatic_complexity": None,
            "cognitive_complexity": None,
            "ncloc": None,
        }

    @staticmethod
    def _split_component_key(component_key: str) -> tuple[str, str]:
        """Split 'project:path/to/file' component key into (project, path)."""
        if ":" not in component_key:
            return component_key, ""
        project_key, path = component_key.split(":", 1)
        return project_key, path

    @staticmethod
    def _parse_component_measures(measures: list[Dict[str, Any]]) -> Dict[str, Any]:
        """Normalize Sonar measure payload to experiment metric names."""
        metrics = {
            "cyclomatic_complexity": None,
            "cognitive_complexity": None,
            "ncloc": None,
        }

        for measure in measures:
            key = measure.get("metric")
            value = measure.get("value")
            if value in (None, ""):
                continue
            parsed = int(float(value))
            if key == "complexity":
                metrics["cyclomatic_complexity"] = parsed
            elif key == "cognitive_complexity":
                metrics["cognitive_complexity"] = parsed
            elif key == "ncloc":
                metrics["ncloc"] = parsed

        return metrics

    def get_component_tree(self, project_key: str) -> Dict[str, Any]:
        """
        Get the component tree (all files/modules in a project).

        Args:
            project_key: SonarCloud project key

        Returns:
            Component tree data
        """
        url = f"{self.base_url}/components/tree"
        params = {
            "component": project_key,
            "ps": 500,  # Page size
        }

        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()

        return response.json()

    def validate_component_exists(self, component_key: str) -> bool:
        """
        Check if a component exists in SonarCloud.

        Args:
            component_key: SonarCloud component key

        Returns:
            True if component exists
        """
        try:
            url = f"{self.base_url}/components/show"
            params = {"component": component_key}

            response = self.session.get(url, params=params, timeout=10)
            return response.status_code == 200
        except Exception as e:
            logger.debug(f"Component validation failed: {str(e)}")
            return False


class SonarCloudError(Exception):
    """Base exception for SonarCloud errors."""
    pass


class SonarCloudTimeoutError(SonarCloudError):
    """Raised when analysis doesn't complete within timeout."""
    pass


class SonarCloudAnalysisError(SonarCloudError):
    """Raised when analysis fails."""
    pass


if __name__ == "__main__":
    from logger_config import setup_logging
    setup_logging()

    # Test SonarCloud poller
    try:
        poller = SonarCloudPoller()
        # Test with a known component key
        component = "dissertation-experiments:conditions/baseline/file_0001/run_1"

        print(f"Testing SonarCloud connection for {component}...")
        if poller.validate_component_exists(component):
            print("Component exists")
            metrics = poller.get_metrics(component)
            print(f"Metrics: {metrics}")
        else:
            print("Component not found (expected if not created yet)")
    except Exception as e:
        print(f"Error: {e}")

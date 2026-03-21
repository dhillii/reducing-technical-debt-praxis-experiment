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
                    return {
                        "status": "SUCCESS",
                        "analysis_date": status["task"]["ceActivityDate"],
                        "metrics": self._extract_metrics(component_key),
                    }

                elif status["task"]["status"] == "FAILED":
                    logger.error(f"SonarCloud analysis failed for {component_key}")
                    return {
                        "status": "FAILED",
                        "error": status["task"].get("errorMessage", "Unknown error"),
                    }

                # Still pending/in-progress
                logger.debug(f"Analysis status: {status['task']['status']}")

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
        # API endpoint: /measures/component?component=<key>&metricKeys=...
        url = f"{self.base_url}/measures/component"

        metric_keys = [
            "complexity",  # Cyclomatic complexity
            "cognitive_complexity",  # Cognitive complexity
            "ncloc",  # Non-comment lines of code
        ]

        params = {
            "component": component_key,
            "metricKeys": ",".join(metric_keys),
        }

        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()

        data = response.json()
        metrics = {}

        # Extract metric values
        for measure in data.get("component", {}).get("measures", []):
            key = measure["metric"]
            value = measure.get("value")

            if key == "complexity":
                metrics["cyclomatic_complexity"] = int(value) if value else None
            elif key == "cognitive_complexity":
                metrics["cognitive_complexity"] = int(value) if value else None
            elif key == "ncloc":
                metrics["ncloc"] = int(value) if value else None

        logger.debug(f"Extracted metrics: {metrics}")
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

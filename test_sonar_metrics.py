#!/usr/bin/env python3
"""
Diagnostic script to test SonarCloud metrics extraction.
Run this to inspect the actual response from SonarCloud.
"""

import sys
import json
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from api.sonarcloud_poller import SonarCloudPoller
from utils.logger_config import setup_logging, get_logger

setup_logging()
logger = get_logger("test_sonar_metrics")


def test_metrics_extraction(component_key: str):
    """Test extracting metrics for a component."""
    logger.info(f"Testing metrics extraction for: {component_key}")
    
    try:
        poller = SonarCloudPoller()
        
        # Call _extract_metrics directly to see raw response
        logger.info("Calling _extract_metrics...")
        metrics = poller._extract_metrics(component_key)
        
        logger.info(f"Metrics returned: {json.dumps(metrics, indent=2)}")
        
        # Check each metric
        for key in ["cyclomatic_complexity", "cognitive_complexity", "ncloc"]:
            value = metrics.get(key)
            status = "✓ Present" if value is not None else "✗ MISSING"
            logger.info(f"  {key}: {value} [{status}]")
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error extracting metrics: {e}", exc_info=True)
        return None


def inspect_api_response(component_key: str):
    """Inspect the raw API response from SonarCloud."""
    import requests
    from utils.config import SONARCLOUD_BASE_URL, SONAR_TOKEN
    
    logger.info(f"Inspecting raw API response for: {component_key}")
    
    url = f"{SONARCLOUD_BASE_URL}/measures/component"
    metric_keys = ["complexity", "cognitive_complexity", "ncloc"]
    params = {
        "component": component_key,
        "metricKeys": ",".join(metric_keys),
    }
    
    headers = {
        "Authorization": f"Bearer {SONAR_TOKEN}",
        "Content-Type": "application/json",
    }
    
    try:
        logger.info(f"GET {url}")
        logger.info(f"Params: {json.dumps(params, indent=2)}")
        
        response = requests.get(url, params=params, headers=headers, timeout=30)
        logger.info(f"Status: {response.status_code}")
        logger.info(f"Response body:\n{json.dumps(response.json(), indent=2)}")
        
        return response.json()
        
    except Exception as e:
        logger.error(f"Error fetching API response: {e}", exc_info=True)
        return None


if __name__ == "__main__":
    # Test with the component key from your logs
    component_key = "dhillii_reducing-technical-debt-praxis-experiment:conditions/baseline/file_0004/run_1.js"
    
    print("\n" + "=" * 80)
    print("SONARCLOUD METRICS TEST")
    print("=" * 80)
    logger.info("=" * 80)
    logger.info("SONARCLOUD METRICS TEST")
    logger.info("=" * 80)
    
    # Step 1: Test metrics extraction via poller
    logger.info("\n[Step 1] Testing via SonarCloudPoller._extract_metrics()...")
    print("\n[Step 1] Testing via SonarCloudPoller._extract_metrics()...")
    metrics = test_metrics_extraction(component_key)
    
    # Step 2: Inspect raw API response
    logger.info("\n[Step 2] Inspecting raw SonarCloud API response...")
    print("\n[Step 2] Inspecting raw SonarCloud API response...")
    api_response = inspect_api_response(component_key)
    
    # Step 3: Try alternative component key (without .js)
    if api_response and api_response.get("component", {}).get("measures"):
        logger.info("\nMetrics found successfully!")
    else:
        logger.info("\n[Step 3] Trying alternative component key (without .js extension)...")
        alt_component_key = component_key.replace(".js", "")
        logger.info(f"Alternative key: {alt_component_key}")
        alt_metrics = test_metrics_extraction(alt_component_key)
        alt_api_response = inspect_api_response(alt_component_key)
    
    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)
    logger.info("\n" + "=" * 80)
    logger.info("TEST COMPLETE")
    logger.info("=" * 80)

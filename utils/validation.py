"""
Validation module for pre-execution checks and runtime validation.

Performs:
- Environment variable validation
- CSV file structure validation
- Source code directory validation
- Code syntax validation
- State file integrity checks
"""

import os
import json
import ast
from pathlib import Path
from typing import List, Tuple, Dict, Any
import pandas as pd
from utils.config import (
    REQUIRED_ENV_VARS,
    REQUIRED_FILES,
    CSV_INPUT_FILE,
    SOURCE_CODE_DIR,
    EXPERIMENT_STATE_FILE,
    SONARCLOUD_PROJECT_KEY,
)
from utils.logger_config import get_logger

logger = get_logger("validation")


def validate_environment() -> Tuple[bool, List[str]]:
    """
    Validate required environment variables are set.

    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []

    for var in REQUIRED_ENV_VARS:
        value = os.getenv(var)
        if not value or value.strip() == "":
            errors.append(f"Missing environment variable: {var}")

    if not errors:
        logger.info("Environment variables validated successfully")
    else:
        logger.error(f"Environment validation failed: {len(errors)} error(s)")
        for error in errors:
            logger.error(f"  - {error}")

    return len(errors) == 0, errors


def validate_csv_file() -> Tuple[bool, List[str]]:
    """
    Validate CSV file exists and has required structure.

    Expected columns:
    - record_id, project_name, file_name, prompt_condition, run_number
    - Any additional metadata columns

    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []

    if not CSV_INPUT_FILE.exists():
        errors.append(f"CSV file not found: {CSV_INPUT_FILE}")
        return False, errors

    try:
        df = pd.read_csv(CSV_INPUT_FILE, dtype={"record_id": str})
        logger.debug(f"Loaded CSV with {len(df)} rows and {len(df.columns)} columns")

        # Check required columns (using actual column names from unified_experimental_dataset_shell.csv)
        required_cols = ["record_id", "project_name", "file_name", "prompt_condition", "run_number"]
        missing_cols = [col for col in required_cols if col not in df.columns]

        if missing_cols:
            errors.append(f"CSV missing required columns: {missing_cols}")

        # Check for duplicate records
        duplicates = df[df.duplicated(subset=["record_id"], keep=False)]
        if len(duplicates) > 0:
            errors.append(f"CSV has {len(duplicates)} duplicate record_id values")

        # Check for null values in key columns
        for col in required_cols:
            if col in df.columns and df[col].isnull().any():
                null_count = df[col].isnull().sum()
                errors.append(f"CSV column '{col}' has {null_count} null values")

        if not errors:
            logger.info(f"CSV validated: {len(df)} records, {len(df.columns)} columns")
        else:
            logger.error(f"CSV validation failed: {len(errors)} error(s)")

    except Exception as e:
        errors.append(f"Failed to read CSV: {str(e)}")
        logger.error(f"CSV read error: {e}")

    return len(errors) == 0, errors


def validate_source_code_directory() -> Tuple[bool, List[str]]:
    """
    Validate source code directory exists and contains files.

    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []

    if not SOURCE_CODE_DIR.exists():
        errors.append(f"Source code directory not found: {SOURCE_CODE_DIR}")
        return False, errors

    if not SOURCE_CODE_DIR.is_dir():
        errors.append(f"Source code path is not a directory: {SOURCE_CODE_DIR}")
        return False, errors

    # Check for source files
    source_files = list(SOURCE_CODE_DIR.glob("**/*.js")) + list(SOURCE_CODE_DIR.glob("**/*.ts")) + \
                   list(SOURCE_CODE_DIR.glob("**/*.tsx")) + list(SOURCE_CODE_DIR.glob("**/*.jsx"))

    if not source_files:
        errors.append(f"Source code directory has no .js/.ts/.tsx files: {SOURCE_CODE_DIR}")
    else:
        logger.info(f"Source code directory validated: {len(source_files)} files found")

    return len(errors) == 0, errors


def validate_code_syntax(code: str, file_extension: str = ".js") -> Tuple[bool, str]:
    """
    Validate JavaScript/TypeScript syntax using Python AST parsing (for JS-like syntax).

    For JavaScript/TypeScript, we perform basic validation:
    - Check for balanced braces/brackets
    - Check for common syntax issues

    Args:
        code: Source code to validate
        file_extension: File extension (.js, .ts, .tsx, etc.)

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not code or not code.strip():
        return False, "Empty code"

    try:
        # Basic brace/bracket balancing check
        brace_count = code.count("{") - code.count("}")
        bracket_count = code.count("[") - code.count("]")
        paren_count = code.count("(") - code.count(")")

        if brace_count != 0:
            return False, f"Unbalanced braces: {brace_count:+d}"
        if bracket_count != 0:
            return False, f"Unbalanced brackets: {bracket_count:+d}"
        if paren_count != 0:
            return False, f"Unbalanced parentheses: {paren_count:+d}"

        # Additional checks for common syntax errors
        if code.count('"""') % 2 != 0 and code.count("'''") % 2 != 0:
            # Only flag if both triple quotes and triple single quotes are unbalanced
            if code.count('"""') % 2 != 0:
                return False, "Unbalanced triple quotes"

        return True, ""

    except Exception as e:
        return False, f"Syntax check error: {str(e)}"


def validate_state_file() -> Tuple[bool, List[str]]:
    """
    Validate experiment state file if it exists.

    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []

    if not EXPERIMENT_STATE_FILE.exists():
        logger.debug("State file does not exist yet (will be created on first run)")
        return True, errors

    try:
        with open(EXPERIMENT_STATE_FILE, "r") as f:
            state = json.load(f)

        # Check required top-level keys
        required_keys = ["experiment_metadata", "runs"]
        missing_keys = [key for key in required_keys if key not in state]
        if missing_keys:
            errors.append(f"State file missing required keys: {missing_keys}")

        # Check metadata structure
        if "experiment_metadata" in state:
            metadata = state["experiment_metadata"]
            required_metadata = ["status", "total_runs", "completed", "failed", "pending"]
            missing_metadata = [key for key in required_metadata if key not in metadata]
            if missing_metadata:
                errors.append(f"State metadata missing keys: {missing_metadata}")

        # Check runs structure
        if "runs" in state:
            runs = state["runs"]
            if not isinstance(runs, dict):
                errors.append("'runs' section should be a dictionary")
            else:
                logger.debug(f"State file contains {len(runs)} run records")

        if not errors:
            logger.info("State file validated successfully")

    except json.JSONDecodeError as e:
        errors.append(f"State file is invalid JSON: {str(e)}")
        logger.error(f"State file JSON error: {e}")
    except Exception as e:
        errors.append(f"Failed to read state file: {str(e)}")
        logger.error(f"State file read error: {e}")

    return len(errors) == 0, errors


def run_all_validations() -> Tuple[bool, Dict[str, Tuple[bool, List[str]]]]:
    """
    Run all pre-execution validation checks.

    Returns:
        Tuple of (all_valid, results_dict)
    """
    results = {}

    logger.info("Starting validation checks...")

    # Environment validation
    valid, errors = validate_environment()
    results["environment"] = (valid, errors)

    # CSV validation
    valid, errors = validate_csv_file()
    results["csv"] = (valid, errors)

    # Source code validation
    valid, errors = validate_source_code_directory()
    results["source_code"] = (valid, errors)

    # State file validation
    valid, errors = validate_state_file()
    results["state_file"] = (valid, errors)

    # Overall result
    all_valid = all(valid for valid, _ in results.values())

    if all_valid:
        logger.info("All validation checks passed")
    else:
        logger.error("Some validation checks failed")
        for check_name, (valid, errors) in results.items():
            if not valid:
                logger.error(f"  {check_name}: {len(errors)} error(s)")

    return all_valid, results


def get_validation_report() -> str:
    """
    Get a human-readable validation report.

    Returns:
        Formatted validation report string
    """
    all_valid, results = run_all_validations()

    lines = ["=" * 70]
    lines.append("VALIDATION REPORT")
    lines.append("=" * 70)

    for check_name, (valid, errors) in results.items():
        status = "✓ PASS" if valid else "✗ FAIL"
        lines.append(f"\n{status}: {check_name.upper()}")
        if errors:
            for error in errors:
                lines.append(f"    - {error}")

    lines.append("\n" + "=" * 70)
    lines.append(f"Overall: {'ALL CHECKS PASSED' if all_valid else 'SOME CHECKS FAILED'}")
    lines.append("=" * 70)

    return "\n".join(lines)


if __name__ == "__main__":
    from utils.logger_config import setup_logging
    setup_logging()

    print(get_validation_report())

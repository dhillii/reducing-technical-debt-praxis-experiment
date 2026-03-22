"""
Local maintainability-oriented code metrics.

Provides a consistent before/after metric computation path independent of
SonarCloud indexing delays. Sonar metrics remain available as reference.
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict

from utils.logger_config import get_logger

logger = get_logger("local_metrics")

try:
    from lizard import analyze_file  # type: ignore
except Exception:
    analyze_file = None


def analyze_code_metrics(code: str, extension: str = "js") -> Dict[str, int]:
    """Compute local complexity and maintainability metrics for source code."""
    if not code or not code.strip():
        return {
            "cyclomatic_complexity": 0,
            "cognitive_complexity": 0,
            "ncloc": 0,
            "maintainability_index_local": 100,
        }

    ncloc = _calculate_ncloc(code)
    cyclomatic = _calculate_cyclomatic_complexity(code, extension)
    cognitive = _estimate_cognitive_complexity(code)
    maintainability = _compute_maintainability_index(cyclomatic, cognitive, ncloc)

    return {
        "cyclomatic_complexity": int(cyclomatic),
        "cognitive_complexity": int(cognitive),
        "ncloc": int(ncloc),
        "maintainability_index_local": int(round(maintainability)),
    }


def _calculate_ncloc(code: str) -> int:
    """Count non-empty, non-comment lines."""
    ncloc = 0
    in_block_comment = False

    for line in code.splitlines():
        stripped = line.strip()

        if not stripped:
            continue

        if in_block_comment:
            if "*/" in stripped:
                in_block_comment = False
            continue

        if stripped.startswith("//"):
            continue

        if stripped.startswith("/*"):
            if "*/" not in stripped:
                in_block_comment = True
            continue

        ncloc += 1

    return max(ncloc, 1)


def _calculate_cyclomatic_complexity(code: str, extension: str) -> int:
    """Compute CC with lizard when available, otherwise regex fallback."""
    if analyze_file is not None:
        try:
            analysis = analyze_file.analyze_source_code(f"input.{extension}", code)
            function_list = getattr(analysis, "function_list", [])
            if function_list:
                return max(1, sum(max(1, int(getattr(fn, "cyclomatic_complexity", 1))) for fn in function_list))
        except Exception as exc:
            logger.debug(f"Lizard CC fallback due to error: {exc}")

    complexity = 1
    patterns = [
        r"\bif\b",
        r"\belse\s+if\b",
        r"\bfor\b",
        r"\bwhile\b",
        r"\bcase\b",
        r"\bcatch\b",
        r"\?",
        r"&&",
        r"\|\|",
    ]
    for pattern in patterns:
        complexity += len(re.findall(pattern, code))

    return max(complexity, 1)


def _estimate_cognitive_complexity(code: str) -> int:
    """Heuristic cognitive complexity estimate using control flow and nesting."""
    complexity = 0
    nesting = 0

    decision_pattern = re.compile(r"\b(if|else\s+if|for|while|switch|case|catch)\b")

    for line in code.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue

        opens = stripped.count("{")
        closes = stripped.count("}")

        if decision_pattern.search(stripped):
            complexity += 1 + max(nesting - 1, 0)

        # Penalize nested boolean expressions a little.
        complexity += stripped.count("&&") + stripped.count("||")

        nesting += opens
        nesting -= closes
        if nesting < 0:
            nesting = 0

    return max(complexity, 0)


def _compute_maintainability_index(cyclomatic: int, cognitive: int, ncloc: int) -> float:
    """
    Compute a bounded local maintainability index in [0, 100].

    This is a stable local approximation intended for before/after deltas,
    not a claim of SonarCloud metric equivalence.
    """
    ncloc_term = math.log(max(1, ncloc))
    raw = 171.0 - (5.2 * ncloc_term) - (0.23 * cyclomatic) - (0.1 * cognitive)
    scaled = max(0.0, min(100.0, (raw * 100.0) / 171.0))
    return scaled


def delta(pre: Dict[str, int], post: Dict[str, int]) -> Dict[str, int]:
    """Calculate local metric deltas (post - pre)."""
    return {
        "cc_delta_local": post["cyclomatic_complexity"] - pre["cyclomatic_complexity"],
        "cognitive_delta_local": post["cognitive_complexity"] - pre["cognitive_complexity"],
        "ncloc_delta_local": post["ncloc"] - pre["ncloc"],
        "maintainability_delta_local": (
            post["maintainability_index_local"] - pre["maintainability_index_local"]
        ),
    }

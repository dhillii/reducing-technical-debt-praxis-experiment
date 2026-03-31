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
    """
    Compute cyclomatic complexity using Lizard (primary) or regex fallback.

    Lizard is much more accurate for JavaScript/TypeScript than regex patterns.
    """
    if analyze_file is not None:
        try:
            analysis = analyze_file.analyze_source_code(f"input.{extension}", code)
            function_list = getattr(analysis, "function_list", [])
            if function_list:
                total_cc = sum(max(1, int(getattr(fn, "cyclomatic_complexity", 1))) for fn in function_list)
                return max(1, total_cc)
        except Exception as exc:
            logger.debug(f"Lizard CC calculation failed, using regex fallback: {exc}")

    # Regex fallback (less accurate but better than nothing)
    # Counts decision points: if, else if, switch case, for, while, catch, ternary
    complexity = 1
    in_block_comment = False

    for line in code.splitlines():
        stripped = line.strip()

        if in_block_comment:
            if "*/" in stripped:
                in_block_comment = False
            continue

        if stripped.startswith("/*"):
            if "*/" not in stripped:
                in_block_comment = True
            continue

        if not stripped or stripped.startswith("//"):
            continue

        # Count decision points
        patterns = [
            r"\bif\b",
            r"\belse\s+if\b",
            r"\bfor\b",
            r"\bwhile\b",
            r"\bcase\b",
            r"\bcatch\b",
            r"\?(?=.*:)",  # Ternary operator
            r"&&",
            r"\|\|",
        ]
        for pattern in patterns:
            complexity += len(re.findall(pattern, stripped))

    return max(complexity, 1)


def _estimate_cognitive_complexity(code: str) -> int:
    """
    Estimate cognitive complexity using SonarSource's algorithm.

    Based on https://www.sonarsource.com/docs/SonarQube/sonarqube-web-api-docs/api/sources/show
    - +1 for each if, else if, else, switch case, while, for, catch, ternary operator
    - +1 for each && or || within the same condition (not penalizing each operator separately)
    - +1 for each nesting level beyond first
    """
    complexity = 0
    nesting = 0
    in_block_comment = False

    decision_pattern = re.compile(r"\b(if|else\s+if|else|for|while|switch|catch|case)\b|\?")

    for line in code.splitlines():
        stripped = line.strip()

        # Handle block comments
        if in_block_comment:
            if "*/" in stripped:
                in_block_comment = False
            continue

        if stripped.startswith("/*"):
            if "*/" not in stripped:
                in_block_comment = True
            continue

        # Skip empty lines and line comments
        if not stripped or stripped.startswith("//"):
            continue

        # Track nesting level
        opens = stripped.count("{")
        closes = stripped.count("}")
        nesting += opens

        # Count decision points (if, for, while, etc.)
        # Each occurrence adds 1, plus nesting penalty (1 per level beyond first)
        decision_matches = len(decision_pattern.findall(stripped))
        if decision_matches > 0:
            nesting_penalty = max(nesting - 1, 0)
            complexity += decision_matches * (1 + nesting_penalty)

        # Count boolean operators, but only once per distinct sequence
        # (e.g., "a && b && c" counts as 1 extra, not 2)
        and_sequences = len(re.findall(r"&&", stripped))
        or_sequences = len(re.findall(r"\|\|", stripped))
        if and_sequences > 0 or or_sequences > 0:
            # Add complexity for boolean combinations but not double-count
            complexity += and_sequences + or_sequences

        nesting -= closes
        if nesting < 0:
            nesting = 0

    return max(complexity, 1)


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


def nfr_alignment_score(pre: Dict[str, int], post: Dict[str, int]) -> int:
    """
    Compute weighted maintainability alignment score in [0, 100].

    Higher scores indicate stronger non-functional maintainability improvement.

    Args:
        pre: Pre-refactoring metrics (keys: cyclomatic_complexity, cognitive_complexity, ncloc, maintainability_index_local)
        post: Post-refactoring metrics (same keys)

    Returns:
        Score [0, 100] where 100 = perfect improvement, 0 = no improvement, negative = degradation

    Weights:
        - Cognitive complexity: 35%
        - Cyclomatic complexity: 30%
        - Maintainability index: 20%
        - NCLOC: 15%
    """
    def _improvement(pre_value: int, post_value: int) -> float:
        """Calculate percentage improvement (pre - post) / pre."""
        return (pre_value - post_value) / max(1, pre_value)

    i_cc = _clamp(_improvement(pre["cyclomatic_complexity"], post["cyclomatic_complexity"]), -1.0, 1.0)
    i_cog = _clamp(_improvement(pre["cognitive_complexity"], post["cognitive_complexity"]), -1.0, 1.0)
    i_ncloc = _clamp(_improvement(pre["ncloc"], post["ncloc"]), -1.0, 1.0)
    i_mi = _clamp(
        (post["maintainability_index_local"] - pre["maintainability_index_local"]) / 100.0,
        -1.0,
        1.0,
    )

    weighted = (0.35 * i_cog) + (0.30 * i_cc) + (0.20 * i_mi) + (0.15 * i_ncloc)
    normalized = _clamp(weighted, 0.0, 1.0)
    return int(round(100 * normalized))


def nfr_alignment_score_sonar_vs_local(
    pre_sonar: Dict[str, int],
    pre_local: Dict[str, int],
    post_local: Dict[str, int]
) -> Dict[str, int]:
    """
    Compare NFR improvements: local baseline vs SonarQube baseline.

    This returns two scores to help understand how much of the improvement
    is due to:
    1. Actual code refactoring (local pre vs local post)
    2. SonarQube's pre-metrics vs local post (for comparison)

    Args:
        pre_sonar: Pre-refactoring SonarQube metrics
        pre_local: Pre-refactoring local metrics
        post_local: Post-refactoring local metrics

    Returns:
        Dict with:
        - 'nfr_alignment_score': Score using local pre as baseline (MAIN metric)
        - 'nfr_alignment_sonar_baseline': Score using SonarQube pre as baseline (for comparison)
        - 'baseline_difference': Difference between the two (shows SonarQube vs local alignment impact)
    """
    # Calculate main score: local pre vs local post
    score_local = nfr_alignment_score(pre_local, post_local)

    # Calculate alternative: sonar pre vs local post
    def _improvement(pre_value: int, post_value: int) -> float:
        return (pre_value - post_value) / max(1, pre_value)

    i_cc = _clamp(_improvement(pre_sonar.get("cyclomatic_complexity", 0), post_local["cyclomatic_complexity"]), -1.0, 1.0)
    i_cog = _clamp(_improvement(pre_sonar.get("cognitive_complexity", 0), post_local["cognitive_complexity"]), -1.0, 1.0)
    i_ncloc = _clamp(_improvement(pre_sonar.get("ncloc", 0), post_local["ncloc"]), -1.0, 1.0)
    i_mi = _clamp(
        (post_local["maintainability_index_local"] - post_local.get("maintainability_index_local", post_local["maintainability_index_local"])) / 100.0,
        -1.0,
        1.0,
    )

    weighted = (0.35 * i_cog) + (0.30 * i_cc) + (0.20 * i_mi) + (0.15 * i_ncloc)
    normalized = _clamp(weighted, 0.0, 1.0)
    score_sonar = int(round(100 * normalized))

    return {
        "nfr_alignment_score": score_local,
        "nfr_alignment_sonar_baseline": score_sonar,
        "baseline_difference": score_sonar - score_local,
    }


def _clamp(value: float, low: float, high: float) -> float:
    """Clamp numeric value to [low, high]."""
    return max(low, min(high, value))

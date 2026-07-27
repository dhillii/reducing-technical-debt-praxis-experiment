"""Conservative context-window budgeting for chat-completion requests.

The estimate intentionally treats two characters as one token. This
underestimates neither code-heavy prompts nor punctuation-dense source files
as aggressively as generic prose token heuristics. It is a preflight guard,
not a billing estimate.
"""

from dataclasses import asdict, dataclass
from math import ceil
from typing import Any, Dict


DEFAULT_SAFETY_MARGIN_TOKENS = 2_048


class ContextBudgetExceeded(ValueError):
    """Raised when a request cannot fit its configured model context window."""


@dataclass(frozen=True)
class TokenBudget:
    """A conservative context-window estimate for one chat-completion request."""

    system_prompt_tokens: int
    prompt_tokens: int
    max_output_tokens: int
    safety_margin_tokens: int
    context_window_tokens: int

    @property
    def required_tokens(self) -> int:
        return (
            self.system_prompt_tokens
            + self.prompt_tokens
            + self.max_output_tokens
            + self.safety_margin_tokens
        )

    @property
    def remaining_tokens(self) -> int:
        return self.context_window_tokens - self.required_tokens

    @property
    def fits(self) -> bool:
        return self.required_tokens <= self.context_window_tokens

    def as_dict(self) -> Dict[str, Any]:
        """Return a JSON-serializable version of this budget calculation."""
        return {
            **asdict(self),
            "required_tokens": self.required_tokens,
            "remaining_tokens": self.remaining_tokens,
            "fits": self.fits,
        }


def estimate_tokens(text: str) -> int:
    """Return a conservative token estimate without a model-specific tokenizer."""
    return ceil(len(text or "") / 2)


def evaluate_token_budget(
    *,
    system_prompt: str,
    prompt: str,
    max_output_tokens: int,
    context_window_tokens: int,
    safety_margin_tokens: int = DEFAULT_SAFETY_MARGIN_TOKENS,
) -> TokenBudget:
    """Estimate whether the whole request can fit in its model context window."""
    if max_output_tokens < 1:
        raise ValueError("max_output_tokens must be positive")
    if context_window_tokens < 1:
        raise ValueError("context_window_tokens must be positive")
    if safety_margin_tokens < 0:
        raise ValueError("safety_margin_tokens cannot be negative")

    return TokenBudget(
        system_prompt_tokens=estimate_tokens(system_prompt),
        prompt_tokens=estimate_tokens(prompt),
        max_output_tokens=max_output_tokens,
        safety_margin_tokens=safety_margin_tokens,
        context_window_tokens=context_window_tokens,
    )

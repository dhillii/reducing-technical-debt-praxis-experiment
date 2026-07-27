from utils.token_budget import estimate_tokens, evaluate_token_budget


def test_estimate_tokens_uses_conservative_two_character_ratio():
    assert estimate_tokens("abcde") == 3


def test_budget_fits_when_required_tokens_are_within_context_window():
    budget = evaluate_token_budget(
        system_prompt="system",
        prompt="user prompt",
        max_output_tokens=100,
        context_window_tokens=1_000,
        safety_margin_tokens=10,
    )

    assert budget.fits
    assert budget.required_tokens == 3 + 6 + 100 + 10
    assert budget.remaining_tokens == 881


def test_budget_flags_requests_that_exceed_context_window():
    budget = evaluate_token_budget(
        system_prompt="a" * 100,
        prompt="b" * 100,
        max_output_tokens=100,
        context_window_tokens=200,
        safety_margin_tokens=10,
    )

    assert not budget.fits
    assert budget.remaining_tokens == -10

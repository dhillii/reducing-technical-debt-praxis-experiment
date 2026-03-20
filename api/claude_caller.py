"""
Claude API caller with retry logic and exponential backoff.

Handles API calls with automatic retry on transient failures and rate limits.
"""

import time
from typing import Optional, Dict, Any
from anthropic import Anthropic, APIError, RateLimitError, APIConnectionError
from utils.config import (
    ANTHROPIC_API_KEY,
    CLAUDE_API_TIMEOUT,
    CLAUDE_MODEL,
    CLAUDE_TEMPERATURE,
    MAX_AUTOMATIC_RETRIES,
    RETRY_BACKOFF_BASE,
    RETRY_BACKOFF_MAX,
)
from utils.logger_config import get_logger

logger = get_logger("claude_caller")


class ClaudeCaller:
    """Wrapper around Claude API with retry logic and exponential backoff."""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Claude API client.

        Args:
            api_key: Optional API key (defaults to ANTHROPIC_API_KEY)
        """
        key = api_key or ANTHROPIC_API_KEY
        if not key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        self.client = Anthropic(api_key=key)
        self.model = CLAUDE_MODEL
        self.temperature = CLAUDE_TEMPERATURE
        self.timeout = CLAUDE_API_TIMEOUT

    def call(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Call Claude API with automatic retry on transient failures.

        Args:
            prompt: User message/prompt
            system_prompt: Optional system prompt
            max_tokens: Max tokens in response
            temperature: Optional temperature override

        Returns:
            Dict with keys:
            - 'content': Generated text
            - 'prompt_tokens': Input tokens
            - 'completion_tokens': Output tokens
            - 'total_tokens': Total tokens
            - 'model': Model used
            - 'stop_reason': Why generation stopped

        Raises:
            APIError: After max retries exceeded
        """
        temp = temperature if temperature is not None else self.temperature
        retry_count = 0
        last_error = None

        while retry_count <= MAX_AUTOMATIC_RETRIES:
            try:
                logger.debug(f"Claude API call (attempt {retry_count + 1}/{MAX_AUTOMATIC_RETRIES + 1})")
                logger.debug(f"Model: {self.model}, Temperature: {temp}, Max tokens: {max_tokens}")

                messages = [{"role": "user", "content": prompt}]

                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    temperature=temp,
                    system=system_prompt,
                    messages=messages,
                    timeout=self.timeout,
                )

                # Extract response data
                content = response.content[0].text if response.content else ""
                result = {
                    "content": content,
                    "prompt_tokens": response.usage.input_tokens,
                    "completion_tokens": response.usage.output_tokens,
                    "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
                    "model": response.model,
                    "stop_reason": response.stop_reason,
                }

                logger.info(
                    f"Claude API call succeeded: {result['prompt_tokens']} input, "
                    f"{result['completion_tokens']} output tokens"
                )
                return result

            except RateLimitError as e:
                last_error = e
                retry_count += 1

                if retry_count > MAX_AUTOMATIC_RETRIES:
                    logger.error(f"Claude API rate limit exceeded after {MAX_AUTOMATIC_RETRIES} retries")
                    raise

                wait_time = self._calculate_backoff(retry_count)
                logger.warning(
                    f"Claude API rate limited. Retry {retry_count}/{MAX_AUTOMATIC_RETRIES} "
                    f"after {wait_time}s"
                )
                time.sleep(wait_time)

            except (APIConnectionError, APIError) as e:
                last_error = e
                retry_count += 1

                if retry_count > MAX_AUTOMATIC_RETRIES:
                    logger.error(f"Claude API error after {MAX_AUTOMATIC_RETRIES} retries: {str(e)}")
                    raise

                wait_time = self._calculate_backoff(retry_count)
                logger.warning(
                    f"Claude API transient error. Retry {retry_count}/{MAX_AUTOMATIC_RETRIES} "
                    f"after {wait_time}s: {str(e)}"
                )
                time.sleep(wait_time)

            except Exception as e:
                logger.error(f"Unexpected Claude API error: {str(e)}")
                raise

        # Should not reach here, but just in case
        logger.error("Claude API call failed after all retries")
        raise last_error or APIError("Unknown API error")

    def _calculate_backoff(self, attempt: int) -> float:
        """
        Calculate exponential backoff time.

        Args:
            attempt: Retry attempt number (1-indexed)

        Returns:
            Wait time in seconds
        """
        # Exponential: 1s, 2s, 4s, 8s, 16s, 32s, 60s (max)
        wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
        return min(wait, RETRY_BACKOFF_MAX)

    def extract_code_from_response(self, response_text: str, file_extension: str = ".js") -> str:
        """
        Extract generated code from Claude response.

        Claude may wrap code in markdown blocks or other formatting.
        This method attempts to extract clean code.

        Args:
            response_text: Raw response from Claude
            file_extension: File type (.js, .ts, .tsx, etc.)

        Returns:
            Extracted code
        """
        # Try to extract code from markdown blocks
        if f"```{file_extension[1:]}" in response_text:
            # Language-specific code block
            start_marker = f"```{file_extension[1:]}\n"
            end_marker = "\n```"
            if start_marker in response_text:
                start_idx = response_text.find(start_marker) + len(start_marker)
                end_idx = response_text.find(end_marker, start_idx)
                if end_idx > start_idx:
                    return response_text[start_idx:end_idx].strip()

        elif "```" in response_text:
            # Generic code block
            start_marker = "```\n"
            end_marker = "\n```"
            if start_marker in response_text:
                start_idx = response_text.find(start_marker) + len(start_marker)
                end_idx = response_text.find(end_marker, start_idx)
                if end_idx > start_idx:
                    return response_text[start_idx:end_idx].strip()

        # If no markdown blocks found, return as-is
        # (Claude should generally provide clean code)
        return response_text.strip()


if __name__ == "__main__":
    from logger_config import setup_logging
    setup_logging()

    # Test Claude API call
    try:
        caller = ClaudeCaller()
        result = caller.call(
            prompt="Write a simple JavaScript function that returns 'hello world'.",
            max_tokens=200,
        )
        print(f"Response: {result['content'][:100]}...")
        print(f"Tokens: {result['total_tokens']}")
    except Exception as e:
        print(f"Error: {e}")

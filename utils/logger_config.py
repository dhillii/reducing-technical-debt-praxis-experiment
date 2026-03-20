"""
Logging configuration module for the dissertation experiment orchestration system.

Sets up structured logging to multiple files with different levels:
- experiment.log: All levels (INFO and above)
- experiment_errors.log: ERROR and above
- experiment_debug.log: DEBUG and above
"""

import logging
import logging.handlers
from pathlib import Path
from typing import Optional
from .config import (
    LOGLEVEL,
    MAIN_LOG_FILE,
    ERROR_LOG_FILE,
    DEBUG_LOG_FILE,
    LOG_FORMAT,
    LOG_DATE_FORMAT,
    LOG_MAX_BYTES,
    LOG_BACKUP_COUNT,
    LOG_ENCODING,
    LOG_LEVEL_MAPPING,
)


class _LoggerSingleton:
    """Singleton pattern for logger configuration."""

    _instance = None
    _logger = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def setup_logging(self, level: str = LOGLEVEL) -> logging.Logger:
        """
        Configure logging with rotation and multiple output levels.

        Args:
            level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)

        Returns:
            Configured logger instance
        """
        if self._logger is not None:
            return self._logger

        # Create root logger
        logger = logging.getLogger("experiment_orchestration")
        logger.setLevel(logging.DEBUG)  # Capture all; handlers filter by level

        # Avoid duplicate handlers if called multiple times
        if logger.hasHandlers():
            return logger

        # Create formatters
        formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)

        # Ensure log directories exist
        MAIN_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        ERROR_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        DEBUG_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

        # ====================================================================
        # Handler 1: Main log file (INFO and above)
        # ====================================================================
        main_handler = logging.handlers.RotatingFileHandler(
            filename=str(MAIN_LOG_FILE),
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding=LOG_ENCODING,
        )
        main_handler.setLevel(logging.INFO)
        main_handler.setFormatter(formatter)
        logger.addHandler(main_handler)

        # ====================================================================
        # Handler 2: Error log file (ERROR and above)
        # ====================================================================
        error_handler = logging.handlers.RotatingFileHandler(
            filename=str(ERROR_LOG_FILE),
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding=LOG_ENCODING,
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(formatter)
        logger.addHandler(error_handler)

        # ====================================================================
        # Handler 3: Debug log file (DEBUG and above)
        # ====================================================================
        debug_handler = logging.handlers.RotatingFileHandler(
            filename=str(DEBUG_LOG_FILE),
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding=LOG_ENCODING,
        )
        debug_handler.setLevel(logging.DEBUG)
        debug_handler.setFormatter(formatter)
        logger.addHandler(debug_handler)

        # ====================================================================
        # Handler 4: Console output (configurable level)
        # ====================================================================
        console_handler = logging.StreamHandler()
        console_level = LOG_LEVEL_MAPPING.get(level.upper(), logging.INFO)
        console_handler.setLevel(console_level)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        self._logger = logger
        return logger


# Global logger instance
_singleton = _LoggerSingleton()


def setup_logging(level: str = LOGLEVEL) -> logging.Logger:
    """
    Setup and return the configured logger.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)

    Returns:
        Configured logger instance
    """
    return _singleton.setup_logging(level)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Get a logger instance (module-specific or root).

    Args:
        name: Optional module name for logger. If None, returns root experiment logger.

    Returns:
        Logger instance
    """
    if name is None:
        return _singleton.setup_logging()
    return logging.getLogger(f"experiment_orchestration.{name}")


if __name__ == "__main__":
    # Test logging setup
    logger = setup_logging()
    logger.debug("Debug message")
    logger.info("Info message")
    logger.warning("Warning message")
    logger.error("Error message")
    print(f"Logs written to:")
    print(f"  {MAIN_LOG_FILE}")
    print(f"  {ERROR_LOG_FILE}")
    print(f"  {DEBUG_LOG_FILE}")

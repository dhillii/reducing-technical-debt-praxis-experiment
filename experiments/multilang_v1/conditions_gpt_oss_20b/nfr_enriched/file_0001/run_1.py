def _print_output(msg, stderr):
    """Print a message to stdout or stderr, handling UnicodeEncodeError."""
    try:
        if stderr:
            print >>sys.stderr, msg
        else:
            print msg
    except UnicodeEncodeError:
        if stderr:
            print >>sys.stderr, msg.encode('utf-8')
        else:
            print msg.encode('utf-8')


def _log_output(msg, color):
    """Log a message using the module logger."""
    if color == 'red':
        logger.error(msg)
    else:
        logger.info(msg)


def display(msg, color=None, stderr=False, screen_only=False, log_only=False, runner=None):
    """Display a message with optional color, logging, and locking."""
    # prevent a very rare case of interlaced multiprocess I/O
    log_flock(runner)

    # Apply color if requested
    msg_colored = stringc(msg, color) if color else msg

    # Print to console unless log_only is set
    if not log_only:
        _print_output(msg_colored, stderr)

    # Log the message if a log path is configured
    if constants.DEFAULT_LOG_PATH != '':
        msg_clean = msg.lstrip("\n")
        if not screen_only:
            _log_output(msg_clean, color)

    log_unflock(runner)
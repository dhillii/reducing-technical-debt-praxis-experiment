def display(msg, color=None, stderr=False, screen_only=False, log_only=False, runner=None):
    """Display a message to the user."""
    log_flock(runner)
    msg2 = msg
    if color:
        msg2 = stringc(msg, color)
    _display_to_screen(msg2, stderr, screen_only, log_only)
    _display_to_log(msg, color, log_only)
    log_unflock(runner)

def _display_to_screen(msg, stderr, screen_only, log_only):
    """Display a message to the screen."""
    if not log_only:
        if not stderr:
            try:
                print(msg)
            except UnicodeEncodeError:
                print(msg.encode('utf-8'))
        else:
            try:
                print >>sys.stderr, msg
            except UnicodeEncodeError:
                print >>sys.stderr, msg.encode('utf-8')

def _display_to_log(msg, color, log_only):
    """Display a message to the log."""
    if constants.DEFAULT_LOG_PATH != '':
        while msg.startswith("\n"):
            msg = msg.replace("\n","")
        if not log_only:
            if color == 'red':
                logger.error(msg)
            else:
                logger.info(msg)

class DisplayStrategy:
    """Strategy for displaying messages."""
    def __init__(self, color, stderr, screen_only, log_only):
        self.color = color
        self.stderr = stderr
        self.screen_only = screen_only
        self.log_only = log_only

    def display(self, msg):
        """Display a message."""
        log_flock(None)
        msg2 = msg
        if self.color:
            msg2 = stringc(msg, self.color)
        _display_to_screen(msg2, self.stderr, self.screen_only, self.log_only)
        _display_to_log(msg, self.color, self.log_only)
        log_unflock(None)

class DefaultDisplayStrategy(DisplayStrategy):
    """Default display strategy."""
    def __init__(self):
        super(DefaultDisplayStrategy, self).__init__(None, False, False, False)

class ErrorDisplayStrategy(DisplayStrategy):
    """Error display strategy."""
    def __init__(self):
        super(ErrorDisplayStrategy, self).__init__('red', True, False, False)

class InfoDisplayStrategy(DisplayStrategy):
    """Info display strategy."""
    def __init__(self):
        super(InfoDisplayStrategy, self).__init__(None, False, False, False)

def get_display_strategy(color, stderr, screen_only, log_only):
    """Get a display strategy based on the given parameters."""
    if color == 'red' and stderr:
        return ErrorDisplayStrategy()
    elif not log_only:
        return DefaultDisplayStrategy()
    else:
        return InfoDisplayStrategy()

def display(msg, color=None, stderr=False, screen_only=False, log_only=False, runner=None):
    """Display a message to the user."""
    strategy = get_display_strategy(color, stderr, screen_only, log_only)
    strategy.display(msg)
class RunProcess:

    """
    This is a helper class, used by slave commands to run programs in a child
    shell.
    """

    notreally = False
    BACKUP_TIMEOUT = 5
    interruptSignal = "KILL"
    CHUNK_LIMIT = 128 * 1024

    # Don't send any data until at least BUFFER_SIZE bytes have been collected
    # or BUFFER_TIMEOUT elapsed
    BUFFER_SIZE = 64 * 1024
    BUFFER_TIMEOUT = 5

    # For sending elapsed time:
    startTime = None
    elapsedTime = None

    # For scheduling future events
    _reactor = reactor

    def __init__(self, builder, command,
                 workdir, environ=None,
                 sendStdout=True, sendStderr=True, sendRC=True,
                 timeout=None, maxTime=None, sigtermTime=None,
                 initialStdin=None, keepStdout=False, keepStderr=False,
                 logEnviron=True, logfiles={}, usePTY="slave-config",
                 useProcGroup=True):
        self.builder = builder
        self.command = self._prepare_command(command)
        self.sendStdout = sendStdout
        self.sendStderr = sendStderr
        self.sendRC = sendRC
        self.logfiles = logfiles
        self.workdir = workdir
        self.environ = self._prepare_environment(environ)
        self.initialStdin = initialStdin
        self.logEnviron = logEnviron
        self.timeout = timeout
        self.maxTime = maxTime
        self.sigtermTime = sigtermTime
        self.keepStdout = keepStdout
        self.keepStderr = keepStderr
        self.usePTY = self._determine_use_pty(usePTY, initialStdin)
        self.useProcGroup = self._determine_use_proc_group(useProcGroup)

        self.buffered = deque()
        self.buflen = 0
        self.sendBuffersTimer = None

        self.logFileWatchers = self._create_log_file_watchers(logfiles, workdir)

    def _prepare_command(self, command):
        if isinstance(command, list):
            command = [util.Obfuscated.get_real(w) for w in command]
        command = util.Obfuscated.get_fake(command)
        return command.encode(self.builder.unicode_encoding)

    def _prepare_environment(self, environ):
        if environ is None:
            environ = os.environ.copy()
        else:
            environ = environ.copy()
            for key, value in environ.items():
                if isinstance(value, list):
                    environ[key] = os.pathsep.join(value)
                if "PYTHONPATH" in environ:
                    environ['PYTHONPATH'] += os.pathsep + "${PYTHONPATH}"
                p = re.compile(r'\${([0-9a-zA-Z_]*)}')
                def subst(match):
                    return os.environ.get(match.group(1), "")
                for key, value in environ.items():
                    if value is not None:
                        environ[key] = p.sub(subst, value)
        return environ

    def _determine_use_pty(self, usePTY, initialStdin):
        if usePTY == "slave-config":
            return self.builder.usePTY
        elif runtime.platformType != "posix" or initialStdin is not None:
            return False
        else:
            return usePTY

    def _determine_use_proc_group(self, useProcGroup):
        if runtime.platformType != 'posix':
            return False
        elif self.usePTY:
            return True
        else:
            return useProcGroup

    def _create_log_file_watchers(self, logfiles, workdir):
        watchers = []
        for name, filevalue in logfiles.items():
            filename = filevalue
            follow = False
            if isinstance(filevalue, dict):
                filename = filevalue['filename']
                follow = filevalue.get('follow', False)
            w = LogFileWatcher(self, name, os.path.join(workdir, filename), follow=follow)
            watchers.append(w)
        return watchers

    # ... rest of the class remains the same ...
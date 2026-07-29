# Then changes to the system clock during a run wouldn't effect the "elapsed
# time" results.

    def __init__(self, builder, command,
                 workdir, environ=None,
                 sendStdout=True, sendStderr=True, sendRC=True,
                 timeout=None, maxTime=None, sigtermTime=None,
                 initialStdin=None, keepStdout=False, keepStderr=False,
                 logEnviron=True, logfiles={}, usePTY="slave-config",
                 useProcGroup=True):
        """

        @param keepStdout: if True, we keep a copy of all the stdout text
                           that we've seen. This copy is available in
                           self.stdout, which can be read after the command
                           has finished.
        @param keepStderr: same, for stderr

        @param usePTY: "slave-config" -> use the SlaveBuilder's usePTY;
            otherwise, true to use a PTY, false to not use a PTY.

        @param useProcGroup: (default True) use a process group for non-PTY
            process invocations
        """

        self.builder = builder
        self.command = self._obfuscate_command(command)
        self.fake_command = self._obfuscate_command(util.Obfuscated.get_fake(command))
        self.sendStdout = sendStdout
        self.sendStderr = sendStderr
        self.sendRC = sendRC
        self.logfiles = logfiles
        self.workdir = workdir
        self.process = None
        self.environ = self._prepare_environment(environ)
        self.initialStdin = self._encode_string(initialStdin)
        self.logEnviron = logEnviron
        self.timeout = timeout
        self.ioTimeoutTimer = None
        self.sigtermTime = sigtermTime
        self.maxTime = maxTime
        self.maxTimeoutTimer = None
        self.killTimer = None
        self.keepStdout = keepStdout
        self.keepStderr = keepStderr

        self.buffered = deque()
        self.buflen = 0
        self.sendBuffersTimer = None

        self.usePTY = self._determine_usePTY(usePTY)
        self.useProcGroup = self._determine_useProcGroup(usePTY)

        self.logFileWatchers = self._setup_log_file_watchers()

    def _obfuscate_command(self, command):
        if isinstance(command, list):
            def obfus(w):
                if (isinstance(w, tuple) and len(w) == 3
                        and w[0] == 'obfuscated'):
                    return util.Obfuscated(w[1], w[2])
                return w
            return [obfus(w) for w in command]
        return command

    def _encode_string(self, s):
        if isinstance(s, (tuple, list)):
            for i, a in enumerate(s):
                if isinstance(a, unicode):
                    s[i] = a.encode(self.builder.unicode_encoding)
        elif isinstance(s, unicode):
            s = s.encode(self.builder.unicode_encoding)
        return s

    def _prepare_environment(self, environ):
        if not environ:
            return os.environ.copy()

        for key, v in environ.iteritems():
            if isinstance(v, list):
                environ[key] = os.pathsep.join(v)

            if "PYTHONPATH" in environ:
                environ['PYTHONPATH'] += os.pathsep + "${PYTHONPATH}"

            p = re.compile(r'\${([0-9a-zA-Z_]*)}')

            def subst(match):
                return os.environ.get(match.group(1), "")

            newenv = {}
            for key in os.environ.keys():
                if key not in environ or environ[key] is not None:
                    newenv[key] = os.environ[key]

            for key, v in environ.iteritems():
                if v is not None:
                    if not isinstance(v, basestring):
                        raise RuntimeError("'env' values must be strings or "
                                           "lists; key '%s' is incorrect" % (key,))
                    newenv[key] = p.sub(subst, v)

            return newenv

    def _determine_usePTY(self, usePTY):
        if usePTY == "slave-config":
            return self.builder.usePTY
        return usePTY

    def _determine_useProcGroup(self, usePTY):
        if runtime.platformType != 'posix':
            return False
        return self.usePTY

    def _setup_log_file_watchers(self):
        watchers = []
        for name, filevalue in self.logfiles.items():
            filename = filevalue
            follow = False

            if isinstance(filevalue, dict):
                filename = filevalue['filename']
                follow = filevalue.get('follow', False)

            w = LogFileWatcher(self, name,
                               os.path.join(self.workdir, filename),
                               follow=follow)
            watchers.append(w)
        return watchers
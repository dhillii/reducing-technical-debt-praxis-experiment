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

    def __init__(self, builder, command,
                 workdir, environ=None,
                 sendStdout=True, sendStderr=True, sendRC=True,
                 timeout=None, maxTime=None, sigtermTime=None,
                 initialStdin=None, keepStdout=False, keepStderr=False,
                 logEnviron=True, logfiles={}, usePTY="slave-config",
                 useProcGroup=True):
        """
        Initialize the RunProcess object.

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
        self.usePTY = self._determine_use_pty(usePTY)
        self.useProcGroup = useProcGroup

    def _prepare_command(self, command):
        if isinstance(command, list):
            command = [util.Obfuscated.get_real(w) for w in command]
        command = util.Obfuscated.get_fake(command)
        return self._encode_command(command)

    def _encode_command(self, command):
        def to_str(cmd):
            if isinstance(cmd, (tuple, list)):
                for i, a in enumerate(cmd):
                    if isinstance(a, unicode):
                        cmd[i] = a.encode(self.builder.unicode_encoding)
            elif isinstance(cmd, unicode):
                cmd = cmd.encode(self.builder.unicode_encoding)
            return cmd
        return to_str(command)

    def _prepare_environment(self, environ):
        if environ:
            environ = self._translate_environment(environ)
            environ = self._substitute_environment(environ)
        else:
            environ = os.environ.copy()
        return environ

    def _translate_environment(self, environ):
        for key, v in environ.iteritems():
            if isinstance(v, list):
                environ[key] = os.pathsep.join(environ[key])
        return environ

    def _substitute_environment(self, environ):
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

    def _determine_use_pty(self, usePTY):
        if usePTY == "slave-config":
            return self.builder.usePTY
        else:
            return usePTY

    def start(self):
        self.deferred = defer.Deferred()
        try:
            self._start_command()
        except:
            log.msg("error in RunProcess._startCommand")
            log.err()
            self._send_error("error in RunProcess._startCommand")
            self.deferred.errback(AbandonChain(-1))
        return self.deferred

    def _start_command(self):
        self._create_workdir()
        self.pp = RunProcessPP(self)
        self._setup_process()
        self._start_process()

    def _create_workdir(self):
        if not os.path.exists(self.workdir):
            os.makedirs(self.workdir)

    def _setup_process(self):
        self._setup_environment()
        self._setup_logfiles()
        self._setup_initial_stdin()

    def _setup_environment(self):
        self.environ['PWD'] = os.path.abspath(self.workdir)

    def _setup_logfiles(self):
        self.logFileWatchers = []
        for name, filevalue in self.logfiles.items():
            filename = filevalue
            follow = False
            if isinstance(filevalue, dict):
                filename = filevalue['filename']
                follow = filevalue.get('follow', False)
            w = LogFileWatcher(self, name,
                               os.path.join(self.workdir, filename),
                               follow=follow)
            self.logFileWatchers.append(w)

    def _setup_initial_stdin(self):
        if self.initialStdin:
            self.pp.setStdin(self.initialStdin)

    def _start_process(self):
        self.process = self._spawn_process()
        self._setup_timeouts()

    def _spawn_process(self):
        return self._spawn_process_with_protocol(self.pp)

    def _spawn_process_with_protocol(self, processProtocol):
        if self.useProcGroup and runtime.platformType == 'posix':
            return ProcGroupProcess(reactor, self.command[0], self.command,
                                    self.environ, self.workdir, processProtocol)
        else:
            return reactor.spawnProcess(processProtocol, self.command[0],
                                      self.command, self.environ, self.workdir,
                                      usePTY=self.usePTY)

    def _setup_timeouts(self):
        if self.timeout:
            self.ioTimeoutTimer = self._reactor.callLater(self.timeout, self.doTimeout)
        if self.maxTime:
            self.maxTimeoutTimer = self._reactor.callLater(self.maxTime, self.doMaxTimeout)

    def _send_error(self, message):
        self._addToBuffers('stderr', message + "\n")
        self._sendBuffers()

    def _addToBuffers(self, logname, data):
        self.buffered.append((logname, data))
        if self.buflen > self.BUFFER_SIZE:
            self._sendBuffers()
        elif not self.sendBuffersTimer:
            self.sendBuffersTimer = self._reactor.callLater(self.BUFFER_TIMEOUT, self._bufferTimeout)

    def _sendBuffers(self):
        msg = {}
        msg_size = 0
        lastlog = None
        logdata = []
        while self.buffered:
            logname, data = self.buffered.popleft()
            if lastlog is None:
                lastlog = logname
            elif logname != lastlog:
                self._sendMessage(msg)
                msg = {}
                msg_size = 0
            lastlog = logname
            logdata = msg.setdefault(logname, [])
            for chunk in self._chunkForSend(data):
                if len(chunk) == 0:
                    continue
                logdata.append(chunk)
                msg_size += len(chunk)
                if msg_size >= self.CHUNK_LIMIT:
                    self._sendMessage(msg)
                    msg = {}
                    logdata = msg.setdefault(logname, [])
                    msg_size = 0
        self.buflen = 0
        if logdata:
            self._sendMessage(msg)
        if self.sendBuffersTimer:
            if self.sendBuffersTimer.active():
                self.sendBuffersTimer.cancel()
            self.sendBuffersTimer = None

    def _chunkForSend(self, data):
        LIMIT = self.CHUNK_LIMIT
        for i in range(0, len(data), LIMIT):
            yield data[i:i + LIMIT]

    def _sendMessage(self, msg):
        if not msg:
            return
        msg = self._collapseMsg(msg)
        self.sendStatus(msg)

    def _collapseMsg(self, msg):
        retval = {}
        for logname in msg:
            data = "".join(msg[logname])
            if isinstance(logname, tuple) and logname[0] == 'log':
                retval['log'] = (logname[1], data)
            else:
                retval[logname] = data
        return retval

    def addStdout(self, data):
        if self.sendStdout:
            self._addToBuffers('stdout', data)
        if self.keepStdout:
            self.stdout += data
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def addStderr(self, data):
        if self.sendStderr:
            self._addToBuffers('stderr', data)
        if self.keepStderr:
            self.stderr += data
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def addLogfile(self, name, data):
        self._addToBuffers(('log', name), data)
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def finished(self, sig, rc):
        self.elapsedTime = util.now(self._reactor) - self.startTime
        log.msg("command finished with signal %s, exit code %s, elapsedTime: %0.6f" % (sig, rc, self.elapsedTime))
        for w in self.logFileWatchers:
            w.stop()
        self._sendBuffers()
        if sig is not None:
            rc = -1
        if self.sendRC:
            if sig is not None:
                self.sendStatus({'header': "process killed by signal %d\n" % sig})
            self.sendStatus({'rc': rc})
        self.sendStatus({'header': "elapsedTime=%0.6f\n" % self.elapsedTime})
        self._cancelTimers()
        d = self.deferred
        self.deferred = None
        if d:
            d.callback(rc)
        else:
            log.msg("Hey, command %s finished twice" % self)

    def failed(self, why):
        self._sendBuffers()
        log.msg("RunProcess.failed: command failed: %s" % (why,))
        self._cancelTimers()
        d = self.deferred
        self.deferred = None
        if d:
            d.errback(why)
        else:
            log.msg("Hey, command %s finished twice" % self)

    def doTimeout(self):
        self.ioTimeoutTimer = None
        msg = "command timed out: %d seconds without output running %s" % (self.timeout, self.fake_command)
        self.kill(msg)

    def doMaxTimeout(self):
        self.maxTimeoutTimer = None
        msg = "command timed out: %d seconds elapsed running %s" % (self.maxTime, self.fake_command)
        self.kill(msg)

    def isDead(self):
        if self.process.pid is None:
            return True
        pid = int(self.process.pid)
        try:
            os.kill(pid, 0)
        except OSError:
            return True
        return False

    def checkProcess(self):
        self.sigtermTimer = None
        if not self.isDead():
            hit = self.sendSig(self.interruptSignal)
        else:
            hit = 1
        self.cleanUp(hit)

    def cleanUp(self, hit):
        if not hit:
            log.msg("signalProcess/os.kill failed both times")
        if runtime.platformType == "posix":
            self.pp.transport.loseConnection()
        if self.deferred:
            self.killTimer = self._reactor.callLater(self.BACKUP_TIMEOUT, self.doBackupTimeout)

    def sendSig(self, interruptSignal):
        hit = 0
        if self.useProcGroup and runtime.platformType == "posix":
            sig = getattr(signal, "SIG" + interruptSignal, None)
            if sig is None:
                log.msg("signal module is missing SIG%s" % interruptSignal)
            elif not hasattr(os, "kill"):
                log.msg("os module is missing the 'kill' function")
            elif self.process.pgid is None:
                log.msg("self.process has no pgid")
            else:
                log.msg("trying to kill process group %d" % (self.process.pgid,))
                try:
                    os.kill(-self.process.pgid, sig)
                    log.msg(" signal %s sent successfully" % sig)
                    self.process.pgid = None
                    hit = 1
                except OSError:
                    log.msg('failed to kill process group (ignored): %s' % (sys.exc_info()[1],))
        elif runtime.platformType == "win32":
            if interruptSignal is None:
                log.msg("interruptSignal==None, only pretending to kill child")
            elif self.process.pid is not None:
                if interruptSignal == "TERM":
                    log.msg("using TASKKILL PID /T to kill pid %s" % self.process.pid)
                    subprocess.check_call("TASKKILL /PID %s /T" % self.process.pid)
                    log.msg("taskkill'd pid %s" % self.process.pid)
                    hit = 1
                elif interruptSignal == "KILL":
                    log.msg("using TASKKILL PID /F /T to kill pid %s" % self.process.pid)
                    subprocess.check_call("TASKKILL /F /PID %s /T" % self.process.pid)
                    log.msg("taskkill'd pid %s" % self.process.pid)
                    hit = 1
        if not hit:
            try:
                log.msg("trying process.signalProcess('%s')" % (interruptSignal,))
                self.process.signalProcess(interruptSignal)
                log.msg(" signal %s sent successfully" % (interruptSignal,))
                hit = 1
            except OSError:
                log.err("from process.signalProcess:")
            except error.ProcessExitedAlready:
                log.msg("Process exited already - can't kill")
        return hit

    def kill(self, msg):
        self._sendBuffers()
        self._cancelTimers()
        msg += ", attempting to kill"
        log.msg(msg)
        self.sendStatus({'header': "\n" + msg + "\n"})
        self.pp.killed = True
        sendSigterm = self.sigtermTime is not None
        if sendSigterm:
            self.sendSig("TERM")
            self.sigtermTimer = self._reactor.callLater(self.sigtermTime, self.checkProcess)
        else:
            hit = self.sendSig(self.interruptSignal)
            self.cleanUp(hit)

    def doBackupTimeout(self):
        log.msg("we tried to kill the process, and it wouldn't die.."
                " finish anyway")
        self.killTimer = None
        signalName = "SIG" + self.interruptSignal
        self.sendStatus({'header': signalName + " failed to kill process\n"})
        if self.sendRC:
            self.sendStatus({'header': "using fake rc=-1\n"})
            self.sendStatus({'rc': -1})
        self.failed(RuntimeError(signalName + " failed to kill process"))

    def _cancelTimers(self):
        for timerName in ('ioTimeoutTimer', 'killTimer', 'maxTimeoutTimer', 'sendBuffersTimer', 'sigtermTimer'):
            timer = getattr(self, timerName, None)
            if timer:
                timer.cancel()
                setattr(self, timerName, None)
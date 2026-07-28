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
        """Prepare the command for execution."""
        if isinstance(command, list):
            command = [util.Obfuscated.get_real(w) for w in command]
        command = util.Obfuscated.get_fake(command)
        return command

    def _prepare_environment(self, environ):
        """Prepare the environment for the command."""
        if environ:
            environ = self._update_environment(environ)
        else:
            environ = os.environ.copy()
        return environ

    def _update_environment(self, environ):
        """Update the environment with the given values."""
        for key, value in environ.items():
            if isinstance(value, list):
                environ[key] = os.pathsep.join(value)
            if "PYTHONPATH" in environ:
                environ['PYTHONPATH'] += os.pathsep + "${PYTHONPATH}"
            p = re.compile(r'\${([0-9a-zA-Z_]*)}')
            def subst(match):
                return os.environ.get(match.group(1), "")
            newenv = {}
            for key in os.environ.keys():
                if key not in environ or environ[key] is not None:
                    newenv[key] = os.environ[key]
            for key, value in environ.items():
                if value is not None:
                    if not isinstance(value, basestring):
                        raise RuntimeError("'env' values must be strings or "
                                           "lists; key '%s' is incorrect" % (key,))
                    newenv[key] = p.sub(subst, value)
            return newenv

    def _determine_use_pty(self, usePTY):
        """Determine whether to use a PTY."""
        if usePTY == "slave-config":
            return self.builder.usePTY
        else:
            return usePTY

    def start(self):
        """Start the command."""
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
        """Start the command."""
        self._create_workdir()
        self._setup_logfiles()
        self._setup_process_protocol()
        self._spawn_process()

    def _create_workdir(self):
        """Create the work directory if it does not exist."""
        if not os.path.exists(self.workdir):
            os.makedirs(self.workdir)

    def _setup_logfiles(self):
        """Setup the log files."""
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

    def _setup_process_protocol(self):
        """Setup the process protocol."""
        self.pp = RunProcessPP(self)

    def _spawn_process(self):
        """Spawn the process."""
        self.process = self._spawn_process_impl()

    def _spawn_process_impl(self):
        """Spawn the process implementation."""
        # ensure workdir exists
        if not os.path.isdir(self.workdir):
            os.makedirs(self.workdir)
        log.msg("RunProcess._startCommand")
        if self.notreally:
            self._send_header("command '%s' in dir %s" %
                              (self.command, self.workdir))
            self._send_header("(not really)\n")
            self.finished(None, 0)
            return

        self._send_header("command '%s' in dir %s" %
                           (self.command, self.workdir))
        self._send_header(" in dir %s" % (self.workdir,))
        if self.timeout:
            if self.timeout == 1:
                unit = "sec"
            else:
                unit = "secs"
            self._send_header(" (timeout %d %s)" % (self.timeout, unit))
        if self.maxTime:
            if self.maxTime == 1:
                unit = "sec"
            else:
                unit = "secs"
            self._send_header(" (maxTime %d %s)" % (self.maxTime, unit))
        self._send_header(" watching logfiles %s" % (self.logfiles,))
        self._send_header(" argv: %s" % (self.command,))
        if self.logEnviron:
            self._send_environment()
        if self.initialStdin:
            self._send_header(" writing %d bytes to stdin" % len(self.initialStdin))
        self._send_header(" using PTY: %s" % bool(self.usePTY))
        if self.initialStdin:
            self.pp.setStdin(self.initialStdin)
        self.startTime = util.now(self._reactor)
        self.process = self._spawn_process_impl_win32() if runtime.platformType == 'win32' else self._spawn_process_impl_posix()

    def _spawn_process_impl_win32(self):
        """Spawn the process implementation for Windows."""
        if type(self.command) in types.StringTypes:
            argv = os.environ['COMSPEC'].split()  # allow %COMSPEC% to have args
            if '/c' not in argv:
                argv += ['/c']
            argv += [self.command]
            self.using_comspec = True
        else:
            argv = self.command
        return reactor.spawnProcess(self.pp, argv[0], argv, self.environ, self.workdir, usePTY=self.usePTY)

    def _spawn_process_impl_posix(self):
        """Spawn the process implementation for POSIX."""
        if type(self.command) in types.StringTypes:
            argv = ['/bin/sh', '-c', self.command]
        else:
            argv = self.command
        return reactor.spawnProcess(self.pp, argv[0], argv, self.environ, self.workdir, usePTY=self.usePTY)

    def _send_header(self, message):
        """Send a header message."""
        log.msg(" " + message)
        self._addTo_buffers('header', message + "\n")

    def _send_environment(self):
        """Send the environment."""
        msg = " environment:\n"
        env_names = sorted(self.environ.keys())
        for name in env_names:
            msg += "  %s=%s\n" % (name, self.environ[name])
        log.msg(" environment: %s" % (self.environ,))
        self._addTo_buffers('header', msg)

    def _send_error(self, message):
        """Send an error message."""
        log.msg("error: %s" % message)
        self._addTo_buffers('stderr', "error: %s\n" % message)

    def _addTo_buffers(self, logname, data):
        """Add data to the buffer for logname."""
        n = len(data)
        self.buflen += n
        self.buffered.append((logname, data))
        if self.buflen > self.BUFFER_SIZE:
            self._send_buffers()
        elif not self.sendBuffersTimer:
            self.sendBuffersTimer = self._reactor.callLater(self.BUFFER_TIMEOUT, self._buffer_timeout)

    def _send_buffers(self):
        """Send all the content in our buffers."""
        msg = {}
        msg_size = 0
        lastlog = None
        logdata = []
        while self.buffered:
            logname, data = self.buffered.popleft()
            if lastlog is None:
                lastlog = logname
            elif logname != lastlog:
                self._send_message(msg)
                msg = {}
                msg_size = 0
            lastlog = logname
            logdata = msg.setdefault(logname, [])
            for chunk in self._chunk_for_send(data):
                if len(chunk) == 0:
                    continue
                logdata.append(chunk)
                msg_size += len(chunk)
                if msg_size >= self.CHUNK_LIMIT:
                    self._send_message(msg)
                    msg = {}
                    logdata = msg.setdefault(logname, [])
                    msg_size = 0
        self.buflen = 0
        if logdata:
            self._send_message(msg)
        if self.sendBuffersTimer:
            if self.sendBuffersTimer.active():
                self.sendBuffersTimer.cancel()
            self.sendBuffersTimer = None

    def _chunk_for_send(self, data):
        """Limit the chunks that we send over PB to 128k."""
        LIMIT = self.CHUNK_LIMIT
        for i in range(0, len(data), LIMIT):
            yield data[i:i + LIMIT]

    def _send_message(self, msg):
        """Collapse and send msg to the master."""
        if not msg:
            return
        msg = self._collapse_msg(msg)
        self.sendStatus(msg)

    def _collapse_msg(self, msg):
        """Take msg, which is a dictionary of lists of output chunks, and
        concatenate all the chunks into a single string."""
        retval = {}
        for logname in msg:
            data = "".join(msg[logname])
            if isinstance(logname, tuple) and logname[0] == 'log':
                retval['log'] = (logname[1], data)
            else:
                retval[logname] = data
        return retval

    def _buffer_timeout(self):
        """Send all the content in our buffers."""
        self.sendBuffersTimer = None
        self._send_buffers()

    def addStdout(self, data):
        """Add stdout data to the buffer."""
        if self.sendStdout:
            self._addTo_buffers('stdout', data)
        if self.keepStdout:
            self.stdout += data
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def addStderr(self, data):
        """Add stderr data to the buffer."""
        if self.sendStderr:
            self._addTo_buffers('stderr', data)
        if self.keepStderr:
            self.stderr += data
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def addLogfile(self, name, data):
        """Add log file data to the buffer."""
        self._addTo_buffers(('log', name), data)
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def finished(self, sig, rc):
        """Finish the command."""
        self.elapsedTime = util.now(self._reactor) - self.startTime
        log.msg("command finished with signal %s, exit code %s, elapsedTime: %0.6f" % (sig, rc, self.elapsedTime))
        for w in self.logFileWatchers:
            w.stop()
        self._send_buffers()
        if sig is not None:
            rc = -1
        if self.sendRC:
            if sig is not None:
                self.sendStatus({'header': "process killed by signal %d\n" % sig})
            self.sendStatus({'rc': rc})
        self.sendStatus({'header': "elapsedTime=%0.6f\n" % self.elapsedTime})
        self._cancel_timers()
        d = self.deferred
        self.deferred = None
        if d:
            d.callback(rc)
        else:
            log.msg("Hey, command %s finished twice" % self)

    def failed(self, why):
        """Fail the command."""
        self._send_buffers()
        log.msg("RunProcess.failed: command failed: %s" % (why,))
        self._cancel_timers()
        d = self.deferred
        self.deferred = None
        if d:
            d.errback(why)
        else:
            log.msg("Hey, command %s finished twice" % self)

    def doTimeout(self):
        """Do timeout."""
        self.ioTimeoutTimer = None
        msg = "command timed out: %d seconds without output running %s" % (self.timeout, self.command)
        self.kill(msg)

    def doMaxTimeout(self):
        """Do max timeout."""
        self.maxTimeoutTimer = None
        msg = "command timed out: %d seconds elapsed running %s" % (self.maxTime, self.command)
        self.kill(msg)

    def isDead(self):
        """Check if the process is dead."""
        if self.process.pid is None:
            return True
        pid = int(self.process.pid)
        try:
            os.kill(pid, 0)
        except OSError:
            return True
        return False

    def checkProcess(self):
        """Check the process."""
        self.sigtermTimer = None
        if not self.isDead():
            hit = self.sendSig(self.interruptSignal)
        else:
            hit = 1
        self.cleanUp(hit)

    def cleanUp(self, hit):
        """Clean up."""
        if not hit:
            log.msg("signalProcess/os.kill failed both times")
        if runtime.platformType == "posix":
            self.pp.transport.loseConnection()
        if self.deferred:
            self.killTimer = self._reactor.callLater(self.BACKUP_TIMEOUT, self.doBackupTimeout)

    def sendSig(self, interruptSignal):
        """Send signal."""
        hit = 0
        if not hit and self.useProcGroup and runtime.platformType == "posix":
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
        """Kill the process."""
        self._send_buffers()
        self._cancel_timers()
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
        """Do backup timeout."""
        log.msg("we tried to kill the process, and it wouldn't die.."
                " finish anyway")
        self.killTimer = None
        signalName = "SIG" + self.interruptSignal
        self.sendStatus({'header': signalName + " failed to kill process\n"})
        if self.sendRC:
            self.sendStatus({'header': "using fake rc=-1\n"})
            self.sendStatus({'rc': -1})
        self.failed(RuntimeError(signalName + " failed to kill process"))

    def _cancel_timers(self):
        """Cancel timers."""
        for timerName in ('ioTimeoutTimer', 'killTimer', 'maxTimeoutTimer', 'sendBuffersTimer', 'sigtermTimer'):
            timer = getattr(self, timerName, None)
            if timer:
                timer.cancel()
                setattr(self, timerName, None)
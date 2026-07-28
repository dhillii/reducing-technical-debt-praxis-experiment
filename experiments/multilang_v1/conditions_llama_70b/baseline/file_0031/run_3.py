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
        self.useProcGroup = self._determine_use_proc_group(useProcGroup, self.usePTY)

        self.logFileWatchers = self._create_log_file_watchers()

    def _prepare_command(self, command):
        if isinstance(command, list):
            command = [util.Obfuscated.get_real(w) for w in command]
        command = util.Obfuscated.get_fake(command)
        return command

    def _prepare_environment(self, environ):
        if environ:
            environ = self._update_environment(environ)
        else:
            environ = os.environ.copy()
        return environ

    def _update_environment(self, environ):
        for key, value in environ.items():
            if isinstance(value, list):
                environ[key] = os.pathsep.join(value)
            if key == "PYTHONPATH":
                environ[key] += os.pathsep + "${PYTHONPATH}"
            environ[key] = self._substitute_variables(environ[key])
        return environ

    def _substitute_variables(self, value):
        pattern = r'\${([0-9a-zA-Z_]*)}'
        return re.sub(pattern, lambda match: os.environ.get(match.group(1), ""), value)

    def _determine_use_pty(self, usePTY, initialStdin):
        if usePTY == "slave-config":
            return self.builder.usePTY
        elif runtime.platformType != "posix" or initialStdin is not None:
            return False
        else:
            return usePTY

    def _determine_use_proc_group(self, useProcGroup, usePTY):
        if runtime.platformType != 'posix':
            return False
        elif usePTY:
            return True
        else:
            return useProcGroup

    def _create_log_file_watchers(self):
        log_file_watchers = []
        for name, file_value in self.logfiles.items():
            filename = file_value
            follow = False
            if isinstance(file_value, dict):
                filename = file_value['filename']
                follow = file_value.get('follow', False)
            log_file_watcher = LogFileWatcher(self, name, os.path.join(self.workdir, filename), follow=follow)
            log_file_watchers.append(log_file_watcher)
        return log_file_watchers

    def start(self):
        self.deferred = defer.Deferred()
        try:
            self._start_command()
        except:
            log.msg("error in RunProcess._startCommand")
            log.err()
            self._send_error()
            self.deferred.errback(AbandonChain(-1))
        return self.deferred

    def _start_command(self):
        if self.notreally:
            self._send_header("command '%s' in dir %s" % (self.command, self.workdir))
            self._send_header("(not really)\n")
            self.finished(None, 0)
            return

        self.pp = RunProcessPP(self)
        self._send_header("command '%s' in dir %s" % (self.command, self.workdir))
        self._send_header(" watching logfiles %s" % (self.logfiles,))
        self._send_header(" argv: %s" % (self.command,))
        if self.logEnviron:
            self._send_environment()
        if self.initialStdin:
            self._send_header(" writing %d bytes to stdin" % len(self.initialStdin))
        self._send_header(" using PTY: %s" % bool(self.usePTY))

        self.pp.setStdin(self.initialStdin)
        self.startTime = util.now(self._reactor)
        self.process = self._spawn_process()
        self._setup_timeouts()

    def _send_header(self, message):
        log.msg(" " + message)
        self._addTo_buffers('header', message + "\n")

    def _send_environment(self):
        env_names = sorted(self.environ.keys())
        message = " environment:\n"
        for name in env_names:
            message += "  %s=%s\n" % (name, self.environ[name])
        log.msg(" environment: %s" % (self.environ,))
        self._addTo_buffers('header', message)

    def _send_error(self):
        self._addTo_buffers('stderr', "error in RunProcess._startCommand\n")
        self._addTo_buffers('stderr', traceback.format_exc())
        self._send_buffers()

    def _spawn_process(self):
        if runtime.platformType == 'posix' and self.useProcGroup and not self.usePTY:
            return ProcGroupProcess(reactor, self.command[0], self.command, self.environ, self.workdir, self.pp)
        else:
            return reactor.spawnProcess(self.pp, self.command[0], self.command, self.environ, self.workdir, usePTY=self.usePTY)

    def _setup_timeouts(self):
        if self.timeout:
            self.ioTimeoutTimer = self._reactor.callLater(self.timeout, self.doTimeout)
        if self.maxTime:
            self.maxTimeoutTimer = self._reactor.callLater(self.maxTime, self.doMaxTimeout)

    def _addTo_buffers(self, logname, data):
        self.buffered.append((logname, data))
        if len(self.buffered) > self.BUFFER_SIZE:
            self._send_buffers()

    def _send_buffers(self):
        msg = {}
        for logname, data in self.buffered:
            msg.setdefault(logname, []).append(data)
        self._sendMessage(msg)
        self.buffered = []

    def _sendMessage(self, msg):
        msg = self._collapse_msg(msg)
        self.builder.sendUpdate(msg)

    def _collapse_msg(self, msg):
        retval = {}
        for logname, data in msg.items():
            retval[logname] = "".join(data)
        return retval

    def addStdout(self, data):
        if self.sendStdout:
            self._addTo_buffers('stdout', data)
        if self.keepStdout:
            self.stdout += data
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def addStderr(self, data):
        if self.sendStderr:
            self._addTo_buffers('stderr', data)
        if self.keepStderr:
            self.stderr += data
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def addLogfile(self, name, data):
        self._addTo_buffers(('log', name), data)
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def finished(self, sig, rc):
        self.elapsedTime = util.now(self._reactor) - self.startTime
        log.msg("command finished with signal %s, exit code %s, elapsedTime: %0.6f" % (sig, rc, self.elapsedTime))
        for w in self.logFileWatchers:
            w.stop()
        self._send_buffers()
        if sig is not None:
            rc = -1
        if self.sendRC:
            if sig is not None:
                self.builder.sendUpdate({'header': "process killed by signal %d\n" % sig})
            self.builder.sendUpdate({'rc': rc})
        self.builder.sendUpdate({'header': "elapsedTime=%0.6f\n" % self.elapsedTime})
        self._cancel_timers()
        d = self.deferred
        self.deferred = None
        if d:
            d.callback(rc)
        else:
            log.msg("Hey, command %s finished twice" % self)

    def failed(self, why):
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
        self.ioTimeoutTimer = None
        msg = "command timed out: %d seconds without output running %s" % (self.timeout, self.command)
        self.kill(msg)

    def doMaxTimeout(self):
        self.maxTimeoutTimer = None
        msg = "command timed out: %d seconds elapsed running %s" % (self.maxTime, self.command)
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
        self.pp.transport.loseConnection()
        if self.deferred:
            self.killTimer = self._reactor.callLater(self.BACKUP_TIMEOUT, self.doBackupTimeout)

    def sendSig(self, interruptSignal):
        hit = 0
        if runtime.platformType == "posix" and self.useProcGroup:
            sig = getattr(signal, "SIG" + interruptSignal, None)
            if sig is not None:
                try:
                    os.kill(-self.process.pgid, sig)
                    log.msg(" signal %s sent successfully" % sig)
                    self.process.pgid = None
                    hit = 1
                except OSError:
                    log.msg('failed to kill process group (ignored): %s' % (sys.exc_info()[1],))
        elif runtime.platformType == "win32":
            if interruptSignal == "TERM":
                subprocess.check_call("TASKKILL /PID %s /T" % self.process.pid)
                log.msg("taskkill'd pid %s" % self.process.pid)
                hit = 1
            elif interruptSignal == "KILL":
                subprocess.check_call("TASKKILL /F /PID %s /T" % self.process.pid)
                log.msg("taskkill'd pid %s" % self.process.pid)
                hit = 1
        if not hit:
            try:
                self.process.signalProcess(interruptSignal)
                log.msg(" signal %s sent successfully" % (interruptSignal,))
                hit = 1
            except OSError:
                log.err("from process.signalProcess:")
            except error.ProcessExitedAlready:
                log.msg("Process exited already - can't kill")
        return hit

    def kill(self, msg):
        self._send_buffers()
        self._cancel_timers()
        msg += ", attempting to kill"
        log.msg(msg)
        self.builder.sendUpdate({'header': "\n" + msg + "\n"})
        self.pp.killed = True
        sendSigterm = self.sigtermTime is not None
        if sendSigterm:
            self.sendSig("TERM")
            self.sigtermTimer = self._reactor.callLater(self.sigtermTime, self.checkProcess)
        else:
            hit = self.sendSig(self.interruptSignal)
            self.cleanUp(hit)

    def doBackupTimeout(self):
        log.msg("we tried to kill the process, and it wouldn't die.. finish anyway")
        self.killTimer = None
        signalName = "SIG" + self.interruptSignal
        self.builder.sendUpdate({'header': signalName + " failed to kill process\n"})
        if self.sendRC:
            self.builder.sendUpdate({'header': "using fake rc=-1\n"})
            self.builder.sendUpdate({'rc': -1})
        self.failed(RuntimeError(signalName + " failed to kill process"))

    def _cancel_timers(self):
        for timerName in ('ioTimeoutTimer', 'killTimer', 'maxTimeoutTimer', 'sigtermTimer'):
            timer = getattr(self, timerName, None)
            if timer:
                timer.cancel()
                setattr(self, timerName, None)
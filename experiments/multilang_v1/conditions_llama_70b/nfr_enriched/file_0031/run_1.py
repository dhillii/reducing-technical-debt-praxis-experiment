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
        # We need to take unicode commands and arguments and encode them using
        # the appropriate encoding for the slave.  This is mostly platform
        # specific, but can be overridden in the slave's buildbot.tac file.
        if isinstance(command, list):
            def obfus(w):
                if (isinstance(w, tuple) and len(w) == 3
                        and w[0] == 'obfuscated'):
                    return util.Obfuscated(w[1], w[2])
                return w
            command = [obfus(w) for w in command]
        return util.Obfuscated.get_real(command)

    def _prepare_environment(self, environ):
        if environ:
            for key, v in environ.iteritems():
                if isinstance(v, list):
                    # Need to do os.pathsep translation.  We could either do that
                    # by replacing all incoming ':'s with os.pathsep, or by
                    # accepting lists.  I like lists better.
                    # If it's not a string, treat it as a sequence to be
                    # turned in to a string.
                    environ[key] = os.pathsep.join(environ[key])

            if "PYTHONPATH" in environ:
                environ['PYTHONPATH'] += os.pathsep + "${PYTHONPATH}"

            # do substitution on variable values matching pattern: ${name}
            p = re.compile(r'\${([0-9a-zA-Z_]*)}')

            def subst(match):
                return os.environ.get(match.group(1), "")
            newenv = {}
            for key in os.environ.keys():
                # setting a key to None will delete it from the slave environment
                if key not in environ or environ[key] is not None:
                    newenv[key] = os.environ[key]
            for key, v in environ.iteritems():
                if v is not None:
                    if not isinstance(v, basestring):
                        raise RuntimeError("'env' values must be strings or "
                                           "lists; key '%s' is incorrect" % (key,))
                    newenv[key] = p.sub(subst, v)

            return newenv
        else:  # not environ
            return os.environ.copy()

    def _determine_use_pty(self, usePTY):
        if usePTY == "slave-config":
            return self.builder.usePTY
        else:
            return usePTY

    def start(self):
        # return a Deferred which fires (with the exit code) when the command
        # completes
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

        self.pp = RunProcessPP(self)

        self.using_comspec = False
        if type(self.command) in types.StringTypes:
            if runtime.platformType == 'win32':
                argv = os.environ['COMSPEC'].split()  # allow %COMSPEC% to have args
                if '/c' not in argv:
                    argv += ['/c']
                argv += [self.command]
                self.using_comspec = True
            else:
                # for posix, use /bin/sh. for other non-posix, well, doesn't
                # hurt to try
                argv = ['/bin/sh', '-c', self.command]
            display = self.command
        else:
            # On windows, CreateProcess requires an absolute path to the executable.
            # When we call spawnProcess below, we pass argv[0] as the executable.
            # So, for .exe's that we have absolute paths to, we can call directly
            # Otherwise, we should run under COMSPEC (usually cmd.exe) to
            # handle path searching, etc.
            if runtime.platformType == 'win32' and not \
                    (self.command[0].lower().endswith(".exe") and os.path.isabs(self.command[0])):
                argv = os.environ['COMSPEC'].split()  # allow %COMSPEC% to have args
                if '/c' not in argv:
                    argv += ['/c']
                argv += list(self.command)
                self.using_comspec = True
            else:
                argv = self.command
            # Attempt to format this for use by a shell, although the process isn't perfect
            display = shell_quote(self.command)

        # $PWD usually indicates the current directory; spawnProcess may not
        # update this value, though, so we set it explicitly here.  This causes
        # weird problems (bug #456) on msys, though..
        if not self.environ.get('MACHTYPE', None) == 'i686-pc-msys':
            self.environ['PWD'] = os.path.abspath(self.workdir)

        # self.stdin is handled in RunProcessPP.connectionMade

        log.msg(" " + display)
        self._send_header(display + "\n")

        # then comes the secondary information
        msg = " in dir %s" % (self.workdir,)
        if self.timeout:
            if self.timeout == 1:
                unit = "sec"
            else:
                unit = "secs"
            msg += " (timeout %d %s)" % (self.timeout, unit)
        if self.maxTime:
            if self.maxTime == 1:
                unit = "sec"
            else:
                unit = "secs"
            msg += " (maxTime %d %s)" % (self.maxTime, unit)
        log.msg(" " + msg)
        self._send_header(msg + "\n")

        msg = " watching logfiles %s" % (self.logfiles,)
        log.msg(" " + msg)
        self._send_header(msg + "\n")

        # then the obfuscated command array for resolving unambiguity
        msg = " argv: %s" % (self.command,)
        log.msg(" " + msg)
        self._send_header(msg + "\n")

        # then the environment, since it sometimes causes problems
        if self.logEnviron:
            msg = " environment:\n"
            env_names = sorted(self.environ.keys())
            for name in env_names:
                msg += "  %s=%s\n" % (name, self.environ[name])
            log.msg(" environment: %s" % (self.environ,))
            self._send_header(msg)

        if self.initialStdin:
            msg = " writing %d bytes to stdin" % len(self.initialStdin)
            log.msg(" " + msg)
            self._send_header(msg + "\n")

        msg = " using PTY: %s" % bool(self.usePTY)
        log.msg(" " + msg)
        self._send_header(msg + "\n")

        # put data into stdin and close it, if necessary.  This will be
        # buffered until connectionMade is called
        if self.initialStdin:
            self.pp.setStdin(self.initialStdin)

        self.startTime = util.now(self._reactor)

        # start the process

        self.process = self._spawn_process(
            self.pp, argv[0], argv,
            self.environ,
            self.workdir,
            usePTY=self.usePTY)

        # set up timeouts

        if self.timeout:
            self.ioTimeoutTimer = self._reactor.callLater(self.timeout, self.doTimeout)

        if self.maxTime:
            self.maxTimeoutTimer = self._reactor.callLater(self.maxTime, self.doMaxTimeout)

        for w in self.logFileWatchers:
            w.start()

    def _spawn_process(self, processProtocol, executable, args=(), env={},
                      path=None, uid=None, gid=None, usePTY=False, childFDs=None):
        """private implementation of reactor.spawnProcess, to allow use of
        L{ProcGroupProcess}"""

        # use the ProcGroupProcess class, if available
        if runtime.platformType == 'posix':
            if self.useProcGroup and not usePTY:
                return ProcGroupProcess(reactor, executable, args, env, path,
                                        processProtocol, uid, gid, childFDs)

        # fall back
        if self.using_comspec:
            return self._spawn_as_batch(processProtocol, executable, args, env,
                                      path, usePTY=usePTY)
        else:
            return reactor.spawnProcess(processProtocol, executable, args, env,
                                        path, usePTY=usePTY)

    def _spawn_as_batch(self, processProtocol, executable, args, env,
                      path, usePTY):
        """A cheat that routes around the impedance mismatch between
        twisted and cmd.exe with respect to escaping quotes"""

        tf = NamedTemporaryFile(dir='.', suffix=".bat", delete=False)
        # echo off hides this cheat from the log files.
        tf.write("@echo off\n")
        if type(self.command) in types.StringTypes:
            tf.write(self.command)
        else:
            tf.write(win32_batch_quote(self.command))
        tf.close()

        argv = os.environ['COMSPEC'].split()  # allow %COMSPEC% to have args
        if '/c' not in argv:
            argv += ['/c']
        argv += [tf.name]

        def unlink_temp(result):
            os.unlink(tf.name)
            return result
        self.deferred.addBoth(unlink_temp)

        return reactor.spawnProcess(processProtocol, executable, argv, env,
                                    path, usePTY=usePTY)

    def _send_header(self, msg):
        self._send_status({'header': msg})

    def _send_status(self, status):
        self.builder.sendUpdate(status)

    def _send_error(self, msg):
        self._send_status({'header': "error: %s\n" % msg})

    def _send_buffers(self):
        """
        Send all the content in our buffers.
        """
        msg = {}
        msg_size = 0
        lastlog = None
        logdata = []
        while self.buffered:
            # Grab the next bits from the buffer
            logname, data = self.buffered.popleft()

            # If this log is different than the last one, then we have to send
            # out the message so far.  This is because the message is
            # transferred as a dictionary, which makes the ordering of keys
            # unspecified, and makes it impossible to interleave data from
            # different logs.  A future enhancement could be to change the
            # master to support a list of (logname, data) tuples instead of a
            # dictionary.
            # On our first pass through this loop lastlog is None
            if lastlog is None:
                lastlog = logname
            elif logname != lastlog:
                self._send_status(msg)
                msg = {}
                msg_size = 0
            lastlog = logname

            logdata = msg.setdefault(logname, [])

            # Chunkify the log data to make sure we're not sending more than
            # CHUNK_LIMIT at a time
            for chunk in self._chunk_for_send(data):
                if len(chunk) == 0:
                    continue
                logdata.append(chunk)
                msg_size += len(chunk)
                if msg_size >= self.CHUNK_LIMIT:
                    # We've gone beyond the chunk limit, so send out our
                    # message.  At worst this results in a message slightly
                    # larger than (2*CHUNK_LIMIT)-1
                    self._send_status(msg)
                    msg = {}
                    logdata = msg.setdefault(logname, [])
                    msg_size = 0
        self.buflen = 0
        if logdata:
            self._send_status(msg)
        if self.sendBuffersTimer:
            if self.sendBuffersTimer.active():
                self.sendBuffersTimer.cancel()
            self.sendBuffersTimer = None

    def _chunk_for_send(self, data):
        """
        limit the chunks that we send over PB to 128k, since it has a hardwired
        string-size limit of 640k.
        """
        LIMIT = self.CHUNK_LIMIT
        for i in range(0, len(data), LIMIT):
            yield data[i:i + LIMIT]

    def _add_to_buffers(self, logname, data):
        """
        Add data to the buffer for logname
        Start a timer to send the buffers if BUFFER_TIMEOUT elapses.
        If adding data causes the buffer size to grow beyond BUFFER_SIZE, then
        the buffers will be sent.
        """
        n = len(data)

        self.buflen += n
        self.buffered.append((logname, data))
        if self.buflen > self.BUFFER_SIZE:
            self._send_buffers()
        elif not self.sendBuffersTimer:
            self.sendBuffersTimer = self._reactor.callLater(self.BUFFER_TIMEOUT, self._buffer_timeout)

    def _buffer_timeout(self):
        self.sendBuffersTimer = None
        self._send_buffers()

    def add_stdout(self, data):
        if self.sendStdout:
            self._add_to_buffers('stdout', data)

        if self.keepStdout:
            self.stdout += data
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def add_stderr(self, data):
        if self.sendStderr:
            self._add_to_buffers('stderr', data)

        if self.keepStderr:
            self.stderr += data
        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def add_logfile(self, name, data):
        self._add_to_buffers(('log', name), data)

        if self.ioTimeoutTimer:
            self.ioTimeoutTimer.reset(self.timeout)

    def finished(self, sig, rc):
        self.elapsedTime = util.now(self._reactor) - self.startTime
        log.msg("command finished with signal %s, exit code %s, elapsedTime: %0.6f" % (sig, rc, self.elapsedTime))
        for w in self.logFileWatchers:
            # this will send the final updates
            w.stop()
        self._send_buffers()
        if sig is not None:
            rc = -1
        if self.sendRC:
            if sig is not None:
                self._send_status(
                    {'header': "process killed by signal %d\n" % sig})
            self._send_status({'rc': rc})
        self._send_status({'header': "elapsedTime=%0.6f\n" % self.elapsedTime})
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

    def do_timeout(self):
        self.ioTimeoutTimer = None
        msg = "command timed out: %d seconds without output running %s" % (self.timeout, self.command)
        self.kill(msg)

    def do_max_timeout(self):
        self.maxTimeoutTimer = None
        msg = "command timed out: %d seconds elapsed running %s" % (self.maxTime, self.command)
        self.kill(msg)

    def is_dead(self):
        if self.process.pid is None:
            return True
        pid = int(self.process.pid)
        try:
            os.kill(pid, 0)
        except OSError:
            return True  # dead
        return False  # alive

    def check_process(self):
        self.sigtermTimer = None
        if not self.is_dead():
            hit = self.send_sig(self.interruptSignal)
        else:
            hit = 1
        self.clean_up(hit)

    def clean_up(self, hit):
        if not hit:
            log.msg("signalProcess/os.kill failed both times")

        if runtime.platformType == "posix":
            # we only do this under posix because the win32eventreactor
            # blocks here until the process has terminated, while closing
            # stderr. This is weird.
            self.pp.transport.loseConnection()

        if self.deferred:
            # finished ought to be called momentarily. Just in case it doesn't,
            # set a timer which will abandon the command.
            self.killTimer = self._reactor.callLater(self.BACKUP_TIMEOUT,
                                                     self.do_backup_timeout)

    def send_sig(self, interruptSignal):
        hit = 0
        # try signalling the process group
        if not hit and self.useProcGroup and runtime.platformType == "posix":
            sig = getattr(signal, "SIG" + interruptSignal, None)

            if sig is None:
                log.msg("signal module is missing SIG%s" % interruptSignal)
            elif not hasattr(os, "kill"):
                log.msg("os module is missing the 'kill' function")
            elif self.process.pgid is None:
                log.msg("self.process has no pgid")
            else:
                log.msg("trying to kill process group %d" %
                        (self.process.pgid,))
                try:
                    os.kill(-self.process.pgid, sig)
                    log.msg(" signal %s sent successfully" % sig)
                    self.process.pgid = None
                    hit = 1
                except OSError:
                    log.msg('failed to kill process group (ignored): %s' %
                            (sys.exc_info()[1],))
                    # probably no-such-process, maybe because there is no process
                    # group
                    pass

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

        # try signalling the process itself (works on Windows too, sorta)
        if not hit:
            try:
                log.msg("trying process.signalProcess('%s')" % (interruptSignal,))
                self.process.signalProcess(interruptSignal)
                log.msg(" signal %s sent successfully" % (interruptSignal,))
                hit = 1
            except OSError:
                log.err("from process.signalProcess:")
                # could be no-such-process, because they finished very recently
                pass
            except error.ProcessExitedAlready:
                log.msg("Process exited already - can't kill")
                # the process has already exited, and likely finished() has
                # been called already or will be called shortly
                pass

        return hit

    def kill(self, msg):
        # This may be called by the timeout, or when the user has decided to
        # abort this build.
        self._send_buffers()
        self._cancel_timers()
        msg += ", attempting to kill"
        log.msg(msg)
        self._send_status({'header': "\n" + msg + "\n"})

        # let the PP know that we are killing it, so that it can ensure that
        # the exit status comes out right
        self.pp.killed = True

        sendSigterm = self.sigtermTime is not None
        if sendSigterm:
            self.send_sig("TERM")
            self.sigtermTimer = self._reactor.callLater(self.sigtermTime, self.check_process)
        else:
            hit = self.send_sig(self.interruptSignal)
            self.clean_up(hit)

    def do_backup_timeout(self):
        log.msg("we tried to kill the process, and it wouldn't die.."
                " finish anyway")
        self.killTimer = None
        signalName = "SIG" + self.interruptSignal
        self._send_status({'header': signalName + " failed to kill process\n"})
        if self.sendRC:
            self._send_status({'header': "using fake rc=-1\n"})
            self._send_status({'rc': -1})
        self.failed(RuntimeError(signalName + " failed to kill process"))

    def _cancel_timers(self):
        for timerName in ('ioTimeoutTimer', 'killTimer', 'maxTimeoutTimer', 'sendBuffersTimer', 'sigtermTimer'):
            timer = getattr(self, timerName, None)
            if timer:
                timer.cancel()
                setattr(self, timerName, None)
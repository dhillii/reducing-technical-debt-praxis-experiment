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
        self.process = None
        self.environ = self._prepare_environment(environ)
        self.initialStdin = initialStdin
        self.logEnviron = logEnviron
        self.timeout = timeout
        self.ioTimeoutTimer = None
        self.sigtermTime = sigtermTime
        self.maxTime = maxTime
        self.maxTimeoutTimer = None
        self.killTimer = None
        self.keepStdout = keepStdout
        self.keepStderr = keepStderr
        self.usePTY = self._determine_use_pty(usePTY, initialStdin)
        self.useProcGroup = self._determine_use_proc_group(useProcGroup)

        self.buffered = deque()
        self.buflen = 0
        self.sendBuffersTimer = None

    def _prepare_command(self, command):
        if isinstance(command, list):
            command = [util.Obfuscated.get_real(w) for w in command]
        command = util.Obfuscated.get_fake(command)
        return command.encode(self.builder.unicode_encoding)

    def _prepare_environment(self, environ):
        if environ:
            environ = self._update_environment(environ)
        else:
            environ = os.environ.copy()
        return environ

    def _update_environment(self, environ):
        for key, v in environ.iteritems():
            if isinstance(v, list):
                environ[key] = os.pathsep.join(environ[key])
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

    def start(self):
        self.deferred = defer.Deferred()
        try:
            self._startCommand()
        except:
            log.msg("error in RunProcess._startCommand")
            log.err()
            self._addToBuffers('stderr', "error in RunProcess._startCommand\n")
            self._addToBuffers('stderr', traceback.format_exc())
            self._sendBuffers()
            self.deferred.errback(AbandonChain(-1))
        return self.deferred

    def _startCommand(self):
        if not os.path.isdir(self.workdir):
            os.makedirs(self.workdir)
        log.msg("RunProcess._startCommand")
        if self.notreally:
            self._addToBuffers('header', "command '%s' in dir %s" %
                               (self.command, self.workdir))
            self._addToBuffers('header', "(not really)\n")
            self.finished(None, 0)
            return

        self.pp = RunProcessPP(self)

        self.using_comspec = False
        if type(self.command) in types.StringTypes:
            if runtime.platformType == 'win32':
                argv = os.environ['COMSPEC'].split()  
                if '/c' not in argv:
                    argv += ['/c']
                argv += [self.command]
                self.using_comspec = True
            else:
                argv = ['/bin/sh', '-c', self.command]
            display = self.command
        else:
            if runtime.platformType == 'win32' and not \
                    (self.command[0].lower().endswith(".exe") and os.path.isabs(self.command[0])):
                argv = os.environ['COMSPEC'].split()  
                if '/c' not in argv:
                    argv += ['/c']
                argv += list(self.command)
                self.using_comspec = True
            else:
                argv = self.command
            display = shell_quote(self.command)

        log.msg(" " + display)
        self._addToBuffers('header', display + "\n")

        self._startProcess(argv, self.environ, self.workdir)

    def _startProcess(self, argv, environ, workdir):
        self.process = self._spawnProcess(
            self.pp, argv[0], argv,
            environ,
            workdir,
            usePTY=self.usePTY)

        if self.timeout:
            self.ioTimeoutTimer = self._reactor.callLater(self.timeout, self.doTimeout)

        if self.maxTime:
            self.maxTimeoutTimer = self._reactor.callLater(self.maxTime, self.doMaxTimeout)

        for w in self.logFileWatchers:
            w.start()

    def _spawnProcess(self, processProtocol, executable, args=(), env={},
                      path=None, uid=None, gid=None, usePTY=False, childFDs=None):
        if runtime.platformType == 'posix':
            if self.useProcGroup and not usePTY:
                return ProcGroupProcess(reactor, executable, args, env, path,
                                        processProtocol, uid, gid, childFDs)

        if self.using_comspec:
            return self._spawnAsBatch(processProtocol, executable, args, env,
                                      path, usePTY=usePTY)
        else:
            return reactor.spawnProcess(processProtocol, executable, args, env,
                                        path, usePTY=usePTY)

    def _spawnAsBatch(self, processProtocol, executable, args, env,
                      path, usePTY):
        tf = NamedTemporaryFile(dir='.', suffix=".bat", delete=False)
        tf.write("@echo off\n")
        if type(self.command) in types.StringTypes:
            tf.write(self.command)
        else:
            tf.write(win32_batch_quote(self.command))
        tf.close()

        argv = os.environ['COMSPEC'].split()  
        if '/c' not in argv:
            argv += ['/c']
        argv += [tf.name]

        def unlink_temp(result):
            os.unlink(tf.name)
            return result
        self.deferred.addBoth(unlink_temp)

        return reactor.spawnProcess(processProtocol, executable, argv, env,
                                    path, usePTY=usePTY)

    def _chunkForSend(self, data):
        LIMIT = self.CHUNK_LIMIT
        for i in range(0, len(data), LIMIT):
            yield data[i:i + LIMIT]

    def _collapseMsg(self, msg):
        retval = {}
        for logname in msg:
            data = "".join(msg[logname])
            if isinstance(logname, tuple) and logname[0] == 'log':
                retval['log'] = (logname[1], data)
            else:
                retval[logname] = data
        return retval

    def _sendMessage(self, msg):
        if not msg:
            return
        msg = self._collapseMsg(msg)
        self.sendStatus(msg)

    def _bufferTimeout(self):
        self.sendBuffersTimer = None
        self._sendBuffers()

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

    def _addToBuffers(self, logname, data):
        n = len(data)

        self.buflen += n
        self.buffered.append((logname, data))
        if self.buflen > self.BUFFER_SIZE:
            self._sendBuffers()
        elif not self.sendBuffersTimer:
            self.sendBuffersTimer = self._reactor.callLater(self.BUFFER_TIMEOUT, self._bufferTimeout)

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
                self.sendStatus(
                    {'header': "process killed by signal %d\n" % sig})
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

        if runtime.platformType == "posix":
            self.pp.transport.loseConnection()

        if self.deferred:
            self.killTimer = self._reactor.callLater(self.BACKUP_TIMEOUT,
                                                     self.doBackupTimeout)

    def sendSig(self, interruptSignal):
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

        if not hit:
            try:
                log.msg("trying process.signalProcess('%s')" % (interruptSignal,))
                self.process.signalProcess(interruptSignal)
                log.msg(" signal %s sent successfully" % (interruptSignal,))
                hit = 1
            except OSError:
                log.err("from process.signalProcess:")
                pass
            except error.ProcessExitedAlready:
                log.msg("Process exited already - can't kill")
                pass

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
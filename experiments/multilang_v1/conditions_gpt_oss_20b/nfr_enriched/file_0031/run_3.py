import os
import re
import signal
import stat
import subprocess
import sys
import traceback
import types

from collections import deque
from tempfile import NamedTemporaryFile

from twisted.internet import defer
from twisted.internet import error
from twisted.internet import protocol
from twisted.internet import reactor
from twisted.internet import task
from twisted.python import log
from twisted.python import runtime
from twisted.python.win32 import quoteArguments

from buildslave import util
from buildslave.exceptions import AbandonChain

if runtime.platformType == 'posix':
    from twisted.internet.process import Process


def win32_batch_quote(cmd_list):
    def escape_arg(arg):
        if arg == '|':
            return arg
        arg = quoteArguments([arg])
        arg = re.sub(r'[@()^"<>&|]', r'^\g<0>', arg)
        return arg.replace('%', '%%')
    return ' '.join(map(escape_arg, cmd_list))


def shell_quote(cmd_list):
    if runtime.platformType == 'win32':
        return win32_batch_quote(cmd_list)
    else:
        import pipes

        def quote(e):
            if not e:
                return '""'
            return pipes.quote(e)
        return " ".join([quote(e) for e in cmd_list])


class LogFileWatcher:
    POLL_INTERVAL = 2

    def __init__(self, command, name, logfile, follow=False):
        self.command = command
        self.name = name
        self.logfile = logfile
        log.msg("LogFileWatcher created to watch %s" % logfile)
        self.old_logfile_stats = self.statFile()
        self.started = False
        self.follow = follow
        self.poller = task.LoopingCall(self.poll)

    def start(self):
        self.poller.start(self.POLL_INTERVAL).addErrback(self._cleanupPoll)

    def _cleanupPoll(self, err):
        log.err(err, msg="Polling error")
        self.poller = None

    def stop(self):
        self.poll()
        if self.poller is not None:
            self.poller.stop()
        if self.started:
            self.f.close()

    def statFile(self):
        if os.path.exists(self.logfile):
            s = os.stat(self.logfile)
            return (s[stat.ST_CTIME], s[stat.ST_MTIME], s[stat.ST_SIZE])
        return None

    def poll(self):
        if not self.started:
            s = self.statFile()
            if s == self.old_logfile_stats:
                return
            if not s:
                self.old_logfile_stats = None
                return
            self.f = open(self.logfile, "rb")
            if self.follow:
                self.f.seek(s[2], 0)
            self.started = True
        self.f.seek(self.f.tell(), 0)
        while True:
            data = self.f.read(10000)
            if not data:
                return
            self.command.addLogfile(self.name, data)


if runtime.platformType == 'posix':
    class ProcGroupProcess(Process):
        """Simple subclass of Process to also make the spawned process a process
        group leader, so we can kill all members of the process group."""
        def _setupChild(self, *args, **kwargs):
            Process._setupChild(self, *args, **kwargs)
            os.setpgid(0, 0)


class RunProcessPP(protocol.ProcessProtocol):
    debug = False

    def __init__(self, command):
        self.command = command
        self.pending_stdin = ""
        self.stdin_finished = False
        self.killed = False

    def setStdin(self, data):
        assert not self.connected
        self.pending_stdin = data

    def connectionMade(self):
        if self.debug:
            log.msg("RunProcessPP.connectionMade")
        if self.command.useProcGroup:
            if self.debug:
                log.msg(" recording pid %d as subprocess pgid"
                        % (self.transport.pid,))
            self.transport.pgid = self.transport.pid
        if self.pending_stdin:
            if self.debug:
                log.msg(" writing to stdin")
            self.transport.write(self.pending_stdin)
        if self.debug:
            log.msg(" closing stdin")
        self.transport.closeStdin()

    def outReceived(self, data):
        if self.debug:
            log.msg("RunProcessPP.outReceived")
        self.command.addStdout(data)

    def errReceived(self, data):
        if self.debug:
            log.msg("RunProcessPP.errReceived")
        self.command.addStderr(data)

    def processEnded(self, status_object):
        if self.debug:
            log.msg("RunProcessPP.processEnded", status_object)
        sig = status_object.value.signal
        rc = status_object.value.exitCode
        if self.killed and rc == 0:
            log.msg("process was killed, but exited with status 0; faking a failure")
            if runtime.platformType == 'win32':
                rc = 1
            else:
                rc = -1
        self.command.finished(sig, rc)


class RunProcess:
    """
    This is a helper class, used by slave commands to run programs in a child
    shell.
    """

    notreally = False
    BACKUP_TIMEOUT = 5
    interruptSignal = "KILL"
    CHUNK_LIMIT = 128 * 1024
    BUFFER_SIZE = 64 * 1024
    BUFFER_TIMEOUT = 5
    startTime = None
    elapsedTime = None
    _reactor = reactor

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
        self._process_command(command)
        self.sendStdout = sendStdout
        self.sendStderr = sendStderr
        self.sendRC = sendRC
        self.logfiles = logfiles
        self.workdir = workdir
        self.process = None
        if not os.path.exists(workdir):
            os.makedirs(workdir)
        self._setup_environment(environ)
        self.initialStdin = self._to_str(initialStdin)
        self.logEnviron = logEnviron
        self.timeout = timeout
        self.ioTimeoutTimer = None
        self.sigtermTime = sigtermTime
        self.maxTime = maxTime
        self.maxTimeoutTimer = None
        self.killTimer = None
        self.keepStdout = keepStdout
        self.keepStderr = keepStderr
        self._initialize_buffers()
        self._initialize_timers()
        self._setup_usePTY_and_procgroup(usePTY, useProcGroup, initialStdin)
        self._setup_logfile_watchers()

    def _process_command(self, command):
        if isinstance(command, list):
            def obfus(w):
                if isinstance(w, tuple) and len(w) == 3 and w[0] == 'obfuscated':
                    return util.Obfuscated(w[1], w[2])
                return w
            command = [obfus(w) for w in command]
        def to_str(cmd):
            if isinstance(cmd, (tuple, list)):
                for i, a in enumerate(cmd):
                    if isinstance(a, unicode):
                        cmd[i] = a.encode(self.builder.unicode_encoding)
            elif isinstance(cmd, unicode):
                cmd = cmd.encode(self.builder.unicode_encoding)
            return cmd
        self.command = to_str(util.Obfuscated.get_real(command))
        self.fake_command = to_str(util.Obfuscated.get_fake(command))

    def _to_str(self, value):
        if isinstance(value, unicode):
            return value.encode(self.builder.unicode_encoding)
        return value

    def _setup_environment(self, environ):
        if environ:
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
            self.environ = newenv
        else:
            self.environ = os.environ.copy()

    def _setup_logfile_watchers(self):
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

    def _setup_usePTY_and_procgroup(self, usePTY, useProcGroup, initialStdin):
        if usePTY == "slave-config":
            self.usePTY = self.builder.usePTY
        else:
            self.usePTY = usePTY
        if runtime.platformType != "posix" or initialStdin is not None:
            if self.usePTY and usePTY != "slave-config":
                self.sendStatus({'header': "WARNING: disabling usePTY for this command"})
            self.usePTY = False
        if runtime.platformType != 'posix':
            useProcGroup = False
        elif self.usePTY:
            useProcGroup = True
        self.useProcGroup = useProcGroup

    def _initialize_buffers(self):
        self.buffered = deque()
        self.buflen = 0
        self.sendBuffersTimer = None

    def _initialize_timers(self):
        self.ioTimeoutTimer = None
        self.maxTimeoutTimer = None
        self.killTimer = None
        self.sigtermTimer = None

    def __repr__(self):
        return "<%s '%s'>" % (self.__class__.__name__, self.fake_command)

    def sendStatus(self, status):
        self.builder.sendUpdate(status)

    def start(self):
        if self.keepStdout:
            self.stdout = ""
        if self.keepStderr:
            self.stderr = ""
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
                               (self.fake_command, self.workdir))
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
            display = self.fake_command
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
            display = shell_quote(self.fake_command)
        if not self.environ.get('MACHTYPE', None) == 'i686-pc-msys':
            self.environ['PWD'] = os.path.abspath(self.workdir)
        log.msg(" " + display)
        self._addToBuffers('header', display + "\n")
        msg = " in dir %s" % (self.workdir,)
        if self.timeout:
            unit = "sec" if self.timeout == 1 else "secs"
            msg += " (timeout %d %s)" % (self.timeout, unit)
        if self.maxTime:
            unit = "sec" if self.maxTime == 1 else "secs"
            msg += " (maxTime %d %s)" % (self.maxTime, unit)
        log.msg(" " + msg)
        self._addToBuffers('header', msg + "\n")
        msg = " watching logfiles %s" % (self.logfiles,)
        log.msg(" " + msg)
        self._addToBuffers('header', msg + "\n")
        msg = " argv: %s" % (self.fake_command,)
        log.msg(" " + msg)
        self._addToBuffers('header', msg + "\n")
        if self.logEnviron:
            msg = " environment:\n"
            env_names = sorted(self.environ.keys())
            for name in env_names:
                msg += "  %s=%s\n" % (name, self.environ[name])
            log.msg(" environment: %s" % (self.environ,))
            self._addToBuffers('header', msg)
        if self.initialStdin:
            msg = " writing %d bytes to stdin" % len(self.initialStdin)
            log.msg(" " + msg)
            self._addToBuffers('header', msg + "\n")
        msg = " using PTY: %s" % bool(self.usePTY)
        log.msg(" " + msg)
        self._addToBuffers('header', msg + "\n")
        if self.initialStdin:
            self.pp.setStdin(self.initialStdin)
        self.startTime = util.now(self._reactor)
        self.process = self._spawnProcess(
            self.pp, argv[0], argv,
            self.environ,
            self.workdir,
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
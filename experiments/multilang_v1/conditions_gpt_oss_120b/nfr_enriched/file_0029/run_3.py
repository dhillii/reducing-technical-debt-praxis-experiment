# This file is part of Buildbot.  Buildbot is free software: you can
# redistribute it and/or modify it under the terms of the GNU General Public
# License as published by the Free Software Foundation, version 2.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
# FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
# more details.
#
# You should have received a copy of the GNU General Public License along
# with this program; if not, write to the Free Software Foundation, Inc., 51
# Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
#
# Copyright Buildbot Team Members

import re

from twisted.internet import defer
from twisted.internet import error
from twisted.python import components
from twisted.python import failure
from twisted.python import log
from twisted.python.failure import Failure
from twisted.python.reflect import accumulateClassList
from twisted.web.util import formatFailure
from zope.interface import implements

from buildbot import config
from buildbot import interfaces
from buildbot import util
from buildbot.process import logobserver
from buildbot.process import properties
from buildbot.process import remotecommand
from buildbot.status import progress
from buildbot.status.results import EXCEPTION
from buildbot.status.results import FAILURE
from buildbot.status.results import RETRY
from buildbot.status.results import SKIPPED
from buildbot.status.results import SUCCESS
from buildbot.status.results import WARNINGS
from buildbot.status.results import worst_status
from buildbot.util import debounce
from buildbot.util import flatten
from buildbot.util.eventual import eventually


class BuildStepFailed(Exception):
    """Raised when a BuildStep fails in a controlled way."""
    pass


# old import paths for these classes
RemoteCommand = remotecommand.RemoteCommand
LoggedRemoteCommand = remotecommand.LoggedRemoteCommand
RemoteShellCommand = remotecommand.RemoteShellCommand
LogObserver = logobserver.LogObserver
LogLineObserver = logobserver.LogLineObserver
OutputProgressObserver = logobserver.OutputProgressObserver
_hush_pyflakes = [
    RemoteCommand, LoggedRemoteCommand, RemoteShellCommand,
    LogObserver, LogLineObserver, OutputProgressObserver]


class _BuildStepFactory(util.ComparableMixin):
    """
    Wrapper that records the arguments passed to a BuildStep subclass.
    Used instead of a closure to simplify testing of factory creation.
    """
    compare_attrs = ['factory', 'args', 'kwargs']
    implements(interfaces.IBuildStepFactory)

    def __init__(self, factory, *args, **kwargs):
        self.factory = factory
        self.args = args
        self.kwargs = kwargs

    def buildStep(self):
        try:
            return self.factory(*self.args, **self.kwargs)
        except Exception:
            log.msg(
                "error while creating step, factory=%s, args=%s, kwargs=%s"
                % (self.factory, self.args, self.kwargs)
            )
            raise


class BuildStep(object, properties.PropertiesMixin):
    implements(interfaces.IBuildStep)

    haltOnFailure = False
    flunkOnWarnings = False
    flunkOnFailure = False
    warnOnWarnings = False
    warnOnFailure = False
    alwaysRun = False
    doStepIf = True
    hideStepIf = False

    # properties set on a build step are, by nature, always runtime properties
    set_runtime_properties = True

    renderables = [
        'haltOnFailure',
        'flunkOnWarnings',
        'flunkOnFailure',
        'warnOnWarnings',
        'warnOnFailure',
        'alwaysRun',
        'doStepIf',
        'hideStepIf',
    ]

    # 'parms' holds a list of all the parameters we care about, to allow
    # users to instantiate a subclass of BuildStep with a mixture of
    # arguments, some of which are for us, some of which are for the subclass
    # (or a delegate of the subclass, like how ShellCommand delivers many
    # arguments to the RemoteShellCommand that it creates). Such delegating
    # subclasses will use this list to figure out which arguments are meant
    # for us and which should be given to someone else.
    parms = [
        'name', 'locks',
        'haltOnFailure',
        'flunkOnWarnings',
        'flunkOnFailure',
        'warnOnWarnings',
        'warnOnFailure',
        'alwaysRun',
        'progressMetrics',
        'useProgress',
        'doStepIf',
        'hideStepIf',
        'description',
        'descriptionDone',
        'descriptionSuffix',
    ]

    name = "generic"
    description = None  # set this to a list of short strings to override
    descriptionDone = None  # alternate description when the step is complete
    descriptionSuffix = None  # extra information to append to suffix
    locks = []
    progressMetrics = ()  # 'time' is implicit
    useProgress = True  # set to False if step is really unpredictable
    build = None
    buildslave = None
    progress = None
    cmd = None
    _step_status = None

    def __init__(self, **kwargs):
        for p in self.__class__.parms:
            if p in kwargs:
                setattr(self, p, kwargs[p])
                del kwargs[p]
        if kwargs:
            config.error(
                "%s.__init__ got unexpected keyword argument(s) %s"
                % (self.__class__, kwargs.keys())
            )
        self._pendingLogObservers = []

        if not isinstance(self.name, str):
            config.error("BuildStep name must be a string: %r" % (self.name,))

        if isinstance(self.description, str):
            self.description = [self.description]
        if isinstance(self.descriptionDone, str):
            self.descriptionDone = [self.descriptionDone]
        if isinstance(self.descriptionSuffix, str):
            self.descriptionSuffix = [self.descriptionSuffix]

        self._acquiringLock = None
        self.stopped = False
        self.master = None

    def __new__(cls, *args, **kwargs):
        """
        Create a new BuildStep instance and attach a factory that records the
        construction arguments.
        """
        self = object.__new__(cls)
        self._factory = _BuildStepFactory(cls, *args, **kwargs)
        return self

    # ----------------------------------------------------------------------
    # Description handling
    # ----------------------------------------------------------------------
    def _describe(self, done=False):
        if self.descriptionDone and done:
            return self.descriptionDone
        elif self.description:
            return self.description
        return [self.name]

    def describe(self, done=False):
        desc = self._describe(done)
        if self.descriptionSuffix:
            desc = desc + self.descriptionSuffix
        return desc

    # ----------------------------------------------------------------------
    # Build and slave association
    # ----------------------------------------------------------------------
    def setBuild(self, build):
        self.build = build
        self.master = self.build.master

    def setBuildSlave(self, buildslave):
        self.buildslave = buildslave

    def setDefaultWorkdir(self, workdir):
        pass

    def addFactoryArguments(self, **kwargs):
        # this is here for backwards compatibility
        pass

    def _getStepFactory(self):
        return self._factory

    @property
    def step_status(self):
        assert not self.isNewStyle(
        ), "self.step_status is not available in new-style steps"
        return self._step_status

    def setStepStatus(self, step_status):
        self._step_status = step_status

    # ----------------------------------------------------------------------
    # Progress handling
    # ----------------------------------------------------------------------
    def setupProgress(self):
        if self.useProgress:
            sp = progress.StepProgress(self.name, self.progressMetrics)
            self.progress = sp
            self._step_status.setProgress(sp)
            return sp
        return None

    def setProgress(self, metric, value):
        if self.progress:
            self.progress.setProgress(metric, value)

    # ----------------------------------------------------------------------
    # Summary handling
    # ----------------------------------------------------------------------
    def getCurrentSummary(self):
        return u'running'

    def getResultSummary(self):
        return {}

    @debounce.method(wait=1)
    @defer.inlineCallbacks
    def updateSummary(self):
        """
        Update the step's textual summary based on its current state.
        """
        assert self.isNewStyle(), "updateSummary is a new-style step method"
        if self._step_status.isFinished():
            summary = yield self.getResultSummary()
            if not isinstance(summary, dict):
                raise TypeError('getResultSummary must return a dictionary')
        else:
            summary = yield self.getCurrentSummary()
            if not isinstance(summary, dict):
                raise TypeError('getCurrentSummary must return a dictionary')

        stepResult = summary.get('step', u'finished')
        if not isinstance(stepResult, unicode):
            raise TypeError("step summary must be unicode")
        self._step_status.setText([stepResult])

        if self._step_status.isFinished():
            buildResult = summary.get('build', None)
            if buildResult and not isinstance(buildResult, unicode):
                raise TypeError("build result must be unicode")
            self._step_status.setText2([buildResult] if buildResult else [])

    # ----------------------------------------------------------------------
    # Core step execution
    # ----------------------------------------------------------------------
    @defer.inlineCallbacks
    def startStep(self, remote):
        """
        Entry point for executing a step. Handles lock acquisition,
        rendering, execution and finalisation.
        """
        self.remote = remote
        is_new = self.isNewStyle()

        # Preserve original callbacks for old‑style steps
        old_finished = self.finished
        old_failed = self.failed
        if is_new:
            self.finished = self._forbiddenNewStyleCall
            self.failed = self._forbiddenNewStyleCall

        self._convertLocks()
        self.deferred = defer.Deferred()
        self._step_status.setText(self.describe(False))
        self._step_status.stepStarted()

        try:
            yield self.acquireLocks()
            if self.stopped:
                old_finished(EXCEPTION)
                defer.returnValue((yield self.deferred))

            if self.progress:
                self.progress.start()

            do_step = yield self._evaluateDoStepIf()
            renderables = self._collectRenderables()
            yield self._renderAll(renderables)

            try:
                result = yield self._runStep(do_step, is_new, old_finished)
                if result == SKIPPED:
                    do_step = False
            except Exception:
                log.msg("BuildStep.startStep exception in .start")
                self.finished = old_finished
                old_failed(Failure())
                result = None

            if not do_step:
                self._handleSkip()
        except Exception:
            self.finished = old_finished
            old_failed(Failure())

        defer.returnValue((yield self.deferred))

    def _forbiddenNewStyleCall(self, *args, **kwargs):
        raise AssertionError("new-style steps must not call this method")

    def _convertLocks(self):
        """
        Resolve lock specifications into concrete lock objects.
        """
        self.locks = [
            (self.build.builder.botmaster.getLockFromLockAccess(access), access)
            for access in self.locks
        ]
        self.locks = [
            (l.getLock(self.build.slavebuilder.slave), la)
            for l, la in self.locks
        ]
        for l, la in self.locks:
            if l in self.build.locks:
                log.msg(
                    "Hey, lock %s is claimed by both a Step (%s) and the"
                    " parent Build (%s)" % (l, self, self.build)
                )
                raise RuntimeError("lock claimed by both Step and Build")

    @defer.inlineCallbacks
    def _evaluateDoStepIf(self):
        """
        Determine whether the step should be executed based on ``doStepIf``.
        """
        if isinstance(self.doStepIf, bool):
            return self.doStepIf
        return (yield self.doStepIf(self))

    def _collectRenderables(self):
        """
        Gather the list of renderable attribute names from the class hierarchy.
        """
        renderables = []
        accumulateClassList(self.__class__, 'renderables', renderables)
        return renderables

    @defer.inlineCallbacks
    def _renderAll(self, renderables):
        """
        Render all attributes listed in ``renderables`` in parallel.
        """
        dl = []
        for renderable in renderables:
            d = self.build.render(getattr(self, renderable))
            d.addCallback(lambda res, attr=renderable: setattr(self, attr, res))
            dl.append(d)
        yield defer.gatherResults(dl)

    @defer.inlineCallbacks
    def _runStep(self, do_step, is_new, old_finished):
        """
        Execute the step if ``do_step`` is True.
        Returns the result status.
        """
        if not do_step:
            defer.returnValue(SKIPPED)

        if is_new:
            result = yield self.run()
            assert isinstance(result, int), \
                "run must return an integer (via Deferred)"
            old_finished(result)
        else:
            result = yield self.start()
        defer.returnValue(result)

    def _handleSkip(self):
        """
        Mark the step as skipped and finish it immediately.
        """
        self._step_status.setText(self.describe(True) + ['skipped'])
        self._step_status.setSkipped(True)
        eventually(self._finishFinished, SKIPPED)

    # ----------------------------------------------------------------------
    # Lock handling
    # ----------------------------------------------------------------------
    def acquireLocks(self, res=None):
        self._acquiringLock = None
        if not self.locks or self.stopped:
            return defer.succeed(None)
        log.msg("acquireLocks(step %s, locks %s)" % (self, self.locks))
        for lock, access in self.locks:
            if not lock.isAvailable(self, access):
                self._step_status.setWaitingForLocks(True)
                log.msg("step %s waiting for lock %s" % (self, lock))
                d = lock.waitUntilMaybeAvailable(self, access)
                d.addCallback(self.acquireLocks)
                self._acquiringLock = (lock, access, d)
                return d
        for lock, access in self.locks:
            lock.claim(self, access)
        self._step_status.setWaitingForLocks(False)
        return defer.succeed(None)

    def isNewStyle(self):
        # **temporary** method until new-style steps are the only supported style
        return self.run.im_func is not BuildStep.run.im_func

    def run(self):
        # new-style steps override this, by definition.
        # old-style steps don't call it.
        raise NotImplementedError

    def start(self):
        raise NotImplementedError("your subclass must implement run()")

    # ----------------------------------------------------------------------
    # Interruption handling
    # ----------------------------------------------------------------------
    def interrupt(self, reason):
        """
        Interrupt the step, releasing any held locks and stopping the command.
        """
        self.stopped = True
        if self._acquiringLock:
            lock, access, d = self._acquiringLock
            lock.stopWaitingUntilAvailable(self, access, d)
            d.callback(None)

        if self._step_status.isWaitingForLocks():
            self.addCompleteLog('interrupt while waiting for locks', str(reason))
        else:
            self.addCompleteLog('interrupt', str(reason))

        if self.cmd:
            d = self.cmd.interrupt(reason)
            d.addErrback(log.err, 'while interrupting command')

    def releaseLocks(self):
        log.msg("releaseLocks(%s): %s" % (self, self.locks))
        for lock, access in self.locks:
            if lock.isOwner(self, access):
                lock.release(self, access)
            else:
                # This should only happen if we've been interrupted
                assert self.stopped

    # ----------------------------------------------------------------------
    # Completion handling
    # ----------------------------------------------------------------------
    def finished(self, results):
        if self.stopped and results != RETRY:
            if results != RETRY:
                results = EXCEPTION
            self._step_status.setText(self.describe(True) + ["interrupted"])
            self._step_status.setText2(["interrupted"])
        self._finishFinished(results)

    def _finishFinished(self, results):
        """
        Internal helper to finalise the step after ``finished`` or an error.
        """
        if self.progress:
            self.progress.finish()

        try:
            hidden = self._maybeEvaluate(self.hideStepIf, results, self)
        except Exception:
            why = Failure()
            self.addHTMLLog("err.html", formatFailure(why))
            self.addCompleteLog("err.text", why.getTraceback())
            results = EXCEPTION
            hidden = False

        self._step_status.stepFinished(results)
        self._step_status.setHidden(hidden)

        self.releaseLocks()
        self.deferred.callback(results)

    def failed(self, why):
        """
        Called when the step encounters an unexpected failure.
        """
        if why.check(BuildStepFailed):
            self.finished(FAILURE)
            return
        if why.check(error.ConnectionLost):
            self._step_status.setText(self.describe(True) + ["exception", "slave", "lost"])
            self._step_status.setText2(["exception", "slave", "lost"])
            self.finished(RETRY)
            return

        log.err(why, "BuildStep.failed; traceback follows")
        try:
            if self.progress:
                self.progress.finish()
            try:
                self.addCompleteLog("err.text", why.getTraceback())
                self.addHTMLLog("err.html", formatFailure(why))
            except Exception:
                log.err(Failure(), "error while formatting exceptions")

            self._step_status.setText([self.name, "exception"])
            self._step_status.setText2([self.name])
            self._step_status.stepFinished(EXCEPTION)

            hidden = self._maybeEvaluate(self.hideStepIf, EXCEPTION, self)
            self._step_status.setHidden(hidden)
        except Exception:
            log.err(Failure(), "exception during failure processing")

        try:
            self.releaseLocks()
        except Exception:
            log.err(Failure(), "exception while releasing locks")

        log.msg("BuildStep.failed now firing callback")
        self.deferred.callback(EXCEPTION)

    # ----------------------------------------------------------------------
    # Utility methods
    # ----------------------------------------------------------------------
    def slaveVersion(self, command, oldversion=None):
        return self.build.getSlaveCommandVersion(command, oldversion)

    def slaveVersionIsOlderThan(self, command, minversion):
        sv = self.build.getSlaveCommandVersion(command, None)
        if sv is None:
            return True
        if map(int, sv.split(".")) < map(int, minversion.split(".")):
            return True
        return False

    def getSlaveName(self):
        return self.build.getSlaveName()

    def addLog(self, name):
        loog = self._step_status.addLog(name)
        self._connectPendingLogObservers()
        if self.isNewStyle():
            loog._isNewStyle = True
            return defer.succeed(loog)
        else:
            return loog

    def getLog(self, name):
        for l in self._step_status.getLogs():
            if l.getName() == name:
                return l
        raise KeyError("no log named '%s'" % (name,))

    def addCompleteLog(self, name, text):
        log.msg("addCompleteLog(%s)" % name)
        loog = self._step_status.addLog(name)
        size = loog.chunkSize
        for start in range(0, len(text), size):
            loog.addStdout(text[start:start + size])
        loog.finish()
        self._connectPendingLogObservers()
        return defer.succeed(None)

    def addHTMLLog(self, name, html):
        log.msg("addHTMLLog(%s)" % name)
        self._step_status.addHTMLLog(name, html)
        self._connectPendingLogObservers()
        return defer.succeed(None)

    def addLogObserver(self, logname, observer):
        assert interfaces.ILogObserver.providedBy(observer)
        observer.setStep(self)
        self._pendingLogObservers.append((logname, observer))
        self._connectPendingLogObservers()

    def _connectPendingLogObservers(self):
        if not self._pendingLogObservers or not self._step_status:
            return
        current_logs = {loog.getName(): loog for loog in self._step_status.getLogs()}
        for logname, observer in self._pendingLogObservers[:]:
            if logname in current_logs:
                observer.setLog(current_logs[logname])
                self._pendingLogObservers.remove((logname, observer))

    def addURL(self, name, url):
        self._step_status.addURL(name, url)
        return defer.succeed(None)

    @defer.inlineCallbacks
    def runCommand(self, command):
        self.cmd = command
        command.buildslave = self.buildslave
        try:
            res = yield command.run(self, self.remote)
        finally:
            self.cmd = None
        defer.returnValue(res)

    @staticmethod
    def _maybeEvaluate(value, *args, **kwargs):
        if callable(value):
            return value(*args, **kwargs)
        return value

    def hasStatistic(self, name):
        return self._step_status.hasStatistic(name)

    def getStatistic(self, name, default=None):
        return self._step_status.getStatistic(name, default)

    def getStatistics(self):
        return self._step_status.getStatistics()

    def setStatistic(self, name, value):
        return self._step_status.setStatistic(name, value)


components.registerAdapter(
    BuildStep._getStepFactory,
    BuildStep, interfaces.IBuildStepFactory)
components.registerAdapter(
    lambda step: interfaces.IProperties(step.build),
    BuildStep, interfaces.IProperties)


class LoggingBuildStep(BuildStep):
    progressMetrics = ('output',)
    logfiles = {}

    parms = BuildStep.parms + ['logfiles', 'lazylogfiles', 'log_eval_func']
    cmd = None

    renderables = ['logfiles', 'lazylogfiles']

    def __init__(self, logfiles={}, lazylogfiles=False, log_eval_func=None,
                 *args, **kwargs):
        BuildStep.__init__(self, *args, **kwargs)

        if logfiles and not isinstance(logfiles, dict):
            config.error(
                "the ShellCommand 'logfiles' parameter must be a dictionary")

        self.logfiles = self.logfiles.copy()
        self.logfiles.update(logfiles)
        self.lazylogfiles = lazylogfiles
        if log_eval_func and not callable(log_eval_func):
            config.error(
                "the 'log_eval_func' paramater must be a callable")
        self.log_eval_func = log_eval_func
        self.addLogObserver('stdio', OutputProgressObserver("output"))

    def addLogFile(self, logname, filename):
        self.logfiles[logname] = filename

    def buildCommandKwargs(self):
        kwargs = dict()
        kwargs['logfiles'] = self.logfiles
        return kwargs

    def startCommand(self, cmd, errorMessages=[]):
        """
        Launch the command and set up log handling.
        """
        log.msg("ShellCommand.startCommand(cmd=%s)" % (cmd,))
        log.msg("  cmd.args = %r" % (cmd.args))
        self.cmd = cmd
        self._step_status.setText(self.describe(False))

        self.stdio_log = stdio_log = self.addLog("stdio")
        cmd.useLog(stdio_log, True)
        for em in errorMessages:
            stdio_log.addHeader(em)

        self.setupLogfiles(cmd, self.logfiles)

        d = self.runCommand(cmd)
        d.addCallback(lambda res: self.commandComplete(cmd))
        d.addCallback(lambda res: self.createSummary(cmd.logs['stdio']))
        d.addCallback(lambda res: self.evaluateCommand(cmd))
        d.addCallback(lambda results: self.setStatus(cmd, results))
        d.addCallback(self.finished)
        d.addErrback(self.failed)

    def setupLogfiles(self, cmd, logfiles):
        for logname, remotefilename in logfiles.items():
            if self.lazylogfiles:
                callback = lambda cmd_arg, local_logname=logname: self.addLog(
                    local_logname)
                cmd.useLogDelayed(logname, callback, True)
            else:
                newlog = self.addLog(logname)
                cmd.useLog(newlog, True)

    def checkDisconnect(self, f):
        log.msg("WARNING: step %s uses deprecated checkDisconnect method")
        return f

    def commandComplete(self, cmd):
        pass

    def createSummary(self, stdio):
        pass

    def evaluateCommand(self, cmd):
        if self.log_eval_func:
            return self.log_eval_func(cmd, self._step_status)
        return cmd.results()

    def getText(self, cmd, results):
        if results == SUCCESS:
            return self.describe(True)
        elif results == WARNINGS:
            return self.describe(True) + ["warnings"]
        elif results == EXCEPTION:
            return self.describe(True) + ["exception"]
        else:
            return self.describe(True) + ["failed"]

    def getText2(self, cmd, results):
        return [self.name]

    def maybeGetText2(self, cmd, results):
        if results == SUCCESS:
            pass
        elif results == WARNINGS:
            if (self.flunkOnWarnings or self.warnOnWarnings):
                return self.getText2(cmd, results)
        else:
            if (self.haltOnFailure or self.flunkOnFailure
                    or self.warnOnFailure):
                return self.getText2(cmd, results)
        return []

    def setStatus(self, cmd, results):
        self._step_status.setText(self.getText(cmd, results))
        self._step_status.setText2(self.maybeGetText2(cmd, results))


class CommandMixin(object):
    @defer.inlineCallbacks
    def _runRemoteCommand(self, cmd, abandonOnFailure, args, makeResult=None):
        cmd = remotecommand.RemoteCommand(cmd, args)
        try:
            log = self.getLog('stdio')
        except Exception:
            log = yield self.addLog('stdio')
        cmd.useLog(log, False)
        yield self.runCommand(cmd)
        if abandonOnFailure and cmd.didFail():
            raise BuildStepFailed()
        if makeResult:
            defer.returnValue(makeResult(cmd))
        else:
            defer.returnValue(not cmd.didFail())

    def runRmdir(self, dir, log=None, abandonOnFailure=True):
        return self._runRemoteCommand('rmdir', abandonOnFailure,
                                      {'dir': dir, 'logEnviron': False})

    def pathExists(self, path, log=None):
        return self._runRemoteCommand('stat', False,
                                      {'file': path, 'logEnviron': False})

    def runMkdir(self, dir, log=None, abandonOnFailure=True):
        return self._runRemoteCommand('mkdir', abandonOnFailure,
                                      {'dir': dir, 'logEnviron': False})

    def glob(self, glob):
        return self._runRemoteCommand(
            'glob', True, {'glob': glob, 'logEnviron': False},
            makeResult=lambda cmd: cmd.updates['files'][0])


class ShellMixin(object):
    command = None
    workdir = None
    env = {}
    want_stdout = True
    want_stderr = True
    usePTY = 'slave-config'
    logfiles = {}
    lazylogfiles = {}
    timeout = 1200
    maxTime = None
    logEnviron = True
    interruptSignal = 'KILL'
    sigtermTime = None
    initialStdin = None
    decodeRC = {0: SUCCESS}

    _shellMixinArgs = [
        'command',
        'workdir',
        'env',
        'want_stdout',
        'want_stderr',
        'usePTY',
        'logfiles',
        'lazylogfiles',
        'timeout',
        'maxTime',
        'logEnviron',
        'interruptSignal',
        'sigtermTime',
        'initialStdin',
        'decodeRC',
    ]
    renderables = _shellMixinArgs

    def setupShellMixin(self, constructorArgs, prohibitArgs=[]):
        constructorArgs = constructorArgs.copy()

        def bad(arg):
            config.error("invalid %s argument %s" %
                         (self.__class__.__name__, arg))
        for arg in self._shellMixinArgs:
            if arg not in constructorArgs:
                continue
            if arg in prohibitArgs:
                bad(arg)
            else:
                setattr(self, arg, constructorArgs[arg])
            del constructorArgs[arg]
        for arg in constructorArgs:
            if arg not in BuildStep.parms:
                bad(arg)
                del constructorArgs[arg]
        return constructorArgs

    @defer.inlineCallbacks
    def makeRemoteShellCommand(self, collectStdout=False, collectStderr=False,
                               stdioLogName='stdio',
                               **overrides):
        kwargs = {arg: getattr(self, arg) for arg in self._shellMixinArgs}
        kwargs.update(overrides)
        stdio = None
        if stdioLogName is not None:
            try:
                stdio = yield self.getLog(stdioLogName)
            except KeyError:
                stdio = yield self.addLog(stdioLogName)

        kwargs['command'] = flatten(kwargs['command'], (list, tuple))

        if kwargs['usePTY'] != 'slave-config':
            if self.slaveVersionIsOlderThan("shell", "2.7"):
                if stdio is not None:
                    yield stdio.addHeader(
                        "NOTE: slave does not allow master to override usePTY\n")
                del kwargs['usePTY']

        if kwargs["interruptSignal"] and self.slaveVersionIsOlderThan("shell", "2.15"):
            if stdio is not None:
                yield stdio.addHeader(
                    "NOTE: slave does not allow master to specify interruptSignal\n")
            del kwargs['interruptSignal']

        del kwargs['lazylogfiles']

        builderEnv = self.build.builder.config.env
        kwargs['env'] = yield self.build.render(builderEnv)
        kwargs['env'].update(self.env)
        kwargs['stdioLogName'] = stdioLogName

        if not kwargs.get('workdir') and not self.workdir:
            if callable(self.build.workdir):
                kwargs['workdir'] = self.build.workdir(self.build.sources)
            else:
                kwargs['workdir'] = self.build.workdir

        cmd = remotecommand.RemoteShellCommand(
            collectStdout=collectStdout,
            collectStderr=collectStderr,
            **kwargs
        )

        if stdio is not None:
            cmd.useLog(stdio, False)
        for logname, remotefilename in self.logfiles.items():
            if self.lazylogfiles:
                callback = lambda cmd_arg, logname=logname: self.addLog(
                    logname)
                cmd.useLogDelayed(logname, callback, True)
            else:
                newlog = yield self.addLog(logname)
                cmd.useLog(newlog, False)

        defer.returnValue(cmd)

    def _describe(self, done=False):
        """
        Generate a description based on the command configuration.
        """
        try:
            if done and self.descriptionDone is not None:
                return self.descriptionDone
            if self.description is not None:
                return self.description

            if self.cmd:
                command = self.command.command
            elif self.command:
                command = self.command
            else:
                return super(ShellMixin, self)._describe(done)

            words = command
            if isinstance(words, (str, unicode)):
                words = words.split()

            try:
                len(words)
            except (AttributeError, TypeError):
                return super(ShellMixin, self)._describe(done)

            words = flatten(words, (list, tuple))
            words = [w for w in words if isinstance(w, (str, unicode))]

            if len(words) < 1:
                return super(ShellMixin, self)._describe(done)
            if len(words) == 1:
                return ["'%s'" % words[0]]
            if len(words) == 2:
                return ["'%s" % words[0], "%s'" % words[1]]
            return ["'%s" % words[0], "%s" % words[1], "...'"]
        except Exception:
            log.err(failure.Failure(), "Error describing step")
            return super(ShellMixin, self)._describe(done)


def regex_log_evaluator(cmd, step_status, regexes):
    """
    Evaluate log lines against a list of regexes to determine the worst status.
    """
    worst = cmd.results()
    for err, possible_status in regexes:
        if worst_status(worst, possible_status) == possible_status:
            if isinstance(err, (basestring)):
                err = re.compile(".*%s.*" % err, re.DOTALL)
            for l in cmd.logs.values():
                if err.search(l.getText()):
                    worst = possible_status
    return worst


# (WithProperties used to be available in this module)
from buildbot.process.properties import WithProperties
_hush_pyflakes = [WithProperties]
del _hush_pyflakes
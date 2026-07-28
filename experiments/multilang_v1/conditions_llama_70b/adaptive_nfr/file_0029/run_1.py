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

    parms = ['name', 'locks',
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
    description = None  
    descriptionDone = None  
    descriptionSuffix = None  
    locks = []
    progressMetrics = ()  
    useProgress = True  
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
            config.error("%s.__init__ got unexpected keyword argument(s) %s"
                         % (self.__class__, kwargs.keys()))
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
        self = object.__new__(cls)
        self._factory = _BuildStepFactory(cls, *args, **kwargs)
        return self

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

    def setBuild(self, build):
        self.build = build
        self.master = self.build.master

    def setBuildSlave(self, buildslave):
        self.buildslave = buildslave

    def setDefaultWorkdir(self, workdir):
        pass

    def addFactoryArguments(self, **kwargs):
        pass

    def _getStepFactory(self):
        return self._factory

    @property
    def step_status(self):
        assert not self.isNewStyle()
        return self._step_status

    def setStepStatus(self, step_status):
        self._step_status = step_status

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

    def getCurrentSummary(self):
        return u'running'

    def getResultSummary(self):
        return {}

    @debounce.method(wait=1)
    @defer.inlineCallbacks
    def updateSummary(self):
        assert self.isNewStyle()
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

    @defer.inlineCallbacks
    def startStep(self, remote):
        self.remote = remote
        isNew = self.isNewStyle()

        old_finished = self.finished
        old_failed = self.failed
        if isNew:
            def nope(*args, **kwargs):
                raise AssertionError("new-style steps must not call "
                                     "this method")
            self.finished = nope
            self.failed = nope

        self.locks = [(self.build.builder.botmaster.getLockFromLockAccess(access), access)
                      for access in self.locks]
        self.locks = [(l.getLock(self.build.slavebuilder.slave), la)
                      for l, la in self.locks]

        for l, la in self.locks:
            if l in self.build.locks:
                log.msg("Hey, lock %s is claimed by both a Step (%s) and the"
                        " parent Build (%s)" % (l, self, self.build))
                raise RuntimeError("lock claimed by both Step and Build")

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

            doStep = self._evaluateDoStepIf()

            if doStep:
                if isNew:
                    result = yield self.run()
                    assert isinstance(result, int)
                    old_finished(result)
                else:
                    result = yield self.start()
                if result == SKIPPED:
                    doStep = False
            if not doStep:
                self._step_status.setText(self.describe(True) + ['skipped'])
                self._step_status.setSkipped(True)
                eventually(self._finishFinished, SKIPPED)
        except Exception:
            self.finished = old_finished
            old_failed(Failure())

        defer.returnValue((yield self.deferred))

    def acquireLocks(self, res=None):
        self._acquiringLock = None
        if not self.locks:
            return defer.succeed(None)
        if self.stopped:
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
        return self.run.im_func is not BuildStep.run.im_func

    def run(self):
        raise NotImplementedError

    def start(self):
        raise NotImplementedError("your subclass must implement run()")

    def interrupt(self, reason):
        self.stopped = True
        if self._acquiringLock:
            lock, access, d = self._acquiringLock
            lock.stopWaitingUntilAvailable(self, access, d)
            d.callback(None)

        if self._step_status.isWaitingForLocks():
            self.addCompleteLog(
                'interrupt while waiting for locks', str(reason))
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
                assert self.stopped

    def finished(self, results):
        if self.stopped and results != RETRY:
            results = EXCEPTION
            self._step_status.setText(self.describe(True) +
                                      ["interrupted"])
            self._step_status.setText2(["interrupted"])
        self._finishFinished(results)

    def _finishFinished(self, results):
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
        if why.check(BuildStepFailed):
            self.finished(FAILURE)
            return
        if why.check(error.ConnectionLost):
            self._step_status.setText(self.describe(True) +
                                      ["exception", "slave", "lost"])
            self._step_status.setText2(["exception", "slave", "lost"])
            self.finished(RETRY)
            return

        log.err(why, "BuildStep.failed; traceback follows")
        try:
            if self.progress:
                self.progress.finish()
            self.addCompleteLog("err.text", why.getTraceback())
            self.addHTMLLog("err.html", formatFailure(why))

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
        if not self._pendingLogObservers:
            return
        if not self._step_status:
            return
        current_logs = {}
        for loog in self._step_status.getLogs():
            current_logs[loog.getName()] = loog
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
            value = value(*args, **kwargs)
        return value

    def hasStatistic(self, name):
        return self._step_status.hasStatistic(name)

    def getStatistic(self, name, default=None):
        return self._step_status.getStatistic(name, default)

    def getStatistics(self):
        return self._step_status.getStatistics()

    def setStatistic(self, name, value):
        return self._step_status.setStatistic(name, value)

    def _evaluateDoStepIf(self):
        if isinstance(self.doStepIf, bool):
            return self.doStepIf
        else:
            return self._maybeEvaluate(self.doStepIf, self)
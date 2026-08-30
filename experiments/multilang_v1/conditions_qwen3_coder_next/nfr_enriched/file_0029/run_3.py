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

        # convert all locks into their real form
        self.locks = [(self.build.builder.botmaster.getLockFromLockAccess(access), access)
                      for access in self.locks]
        # then narrow SlaveLocks down to the slave that this build is being
        # run on
        self.locks = [(l.getLock(self.build.slavebuilder.slave), la)
                      for l, la in self.locks]

        for l, la in self.locks:
            if l in self.build.locks:
                log.msg("Hey, lock %s is claimed by both a Step (%s) and the"
                        " parent Build (%s)" % (l, self, self.build))
                raise RuntimeError("lock claimed by both Step and Build")

        self.deferred = defer.Deferred()

        # Set the step's text here so that the stepStarted notification sees
        # the correct description
        self._step_status.setText(self.describe(False))
        self._step_status.stepStarted()

        try:
            # set up locks
            yield self.acquireLocks()

            if self.stopped:
                old_finished(EXCEPTION)
                defer.returnValue((yield self.deferred))

            # ste up progress
            if self.progress:
                self.progress.start()

            # check doStepIf
            if isinstance(self.doStepIf, bool):
                doStep = self.doStepIf
            else:
                doStep = yield self.doStepIf(self)

            # render renderables in parallel
            renderables = []
            accumulateClassList(self.__class__, 'renderables', renderables)

            def setRenderable(res, attr):
                setattr(self, attr, res)

            dl = []
            for renderable in renderables:
                d = self.build.render(getattr(self, renderable))
                d.addCallback(setRenderable, renderable)
                dl.append(d)
            yield defer.gatherResults(dl)

            try:
                if doStep:
                    if isNew:
                        result = yield self.run()
                        assert isinstance(result, int), \
                            "run must return an integer (via Deferred)"
                        old_finished(result)
                    else:
                        result = yield self.start()
                    if result == SKIPPED:
                        doStep = False
            except Exception:
                log.msg("BuildStep.startStep exception in .start")
                self.finished = old_finished
                old_failed(Failure())

            if not doStep:
                self._step_status.setText(self.describe(True) + ['skipped'])
                self._step_status.setSkipped(True)
                # this return value from self.start is a shortcut to finishing
                # the step immediately; we skip calling finished() as
                # subclasses may have overridden that an expect it to be called
                # after start() (bug #837)
                eventually(self._finishFinished, SKIPPED)
        except Exception:
            self.finished = old_finished
            old_failed(Failure())

        # and finally, wait for self.deferred to get triggered and return its
        # value
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
        # all locks are available, claim them all
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

    def interrupt(self, reason):
        # TODO: consider adding an INTERRUPTED or STOPPED status to use
        # instead of FAILURE, might make the text a bit more clear.
        # 'reason' can be a Failure, or text
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
                # This should only happen if we've been interrupted
                assert self.stopped

    def finished(self, results):
        if self.stopped and results != RETRY:
            # We handle this specially because we don't care about
            # the return code of an interrupted command; we know
            # that this should just be exception due to interrupt
            # At the same time we must respect RETRY status because it's used
            # to retry interrupted build due to some other issues for example
            # due to slave lost
            if results != RETRY:
                results = EXCEPTION
            self._step_status.setText(self.describe(True) +
                                      ["interrupted"])
            self._step_status.setText2(["interrupted"])
        self._finishFinished(results)

    def _finishFinished(self, results):
        # internal function to indicate that this step is done; this is separated
        # from finished() so that subclasses can override finished()
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
        # This can either be a BuildStepFailed exception/failure, meaning we
        # should call self.finished, or it can be a real exception, which should
        # be recorded as such.
        if why.check(BuildStepFailed):
            self.finished(FAILURE)
            return
        # However, in the case of losing the connection to a slave, we want to
        # finish with a RETRY.
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
            try:
                self.addCompleteLog("err.text", why.getTraceback())
                self.addHTMLLog("err.html", formatFailure(why))
            except Exception:
                log.err(Failure(), "error while formatting exceptions")

            # could use why.getDetailedTraceback() for more information
            self._step_status.setText([self.name, "exception"])
            self._step_status.setText2([self.name])
            self._step_status.stepFinished(EXCEPTION)

            hidden = self._maybeEvaluate(self.hideStepIf, EXCEPTION, self)
            self._step_status.setHidden(hidden)
        except Exception:
            log.err(Failure(), "exception during failure processing")
            # the progress stuff may still be whacked (the StepStatus may
            # think that it is still running), but the build overall will now
            # finish

        try:
            self.releaseLocks()
        except Exception:
            log.err(Failure(), "exception while releasing locks")

        log.msg("BuildStep.failed now firing callback")
        self.deferred.callback(EXCEPTION)

    # utility methods that BuildSteps may find useful

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
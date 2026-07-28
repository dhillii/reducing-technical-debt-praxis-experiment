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
        """Initialize the BuildStep instance."""
        self._initialize_attributes(kwargs)

    def _initialize_attributes(self, kwargs):
        """Initialize the attributes of the BuildStep instance."""
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
        """Create a new instance of the BuildStep class."""
        self = object.__new__(cls)
        self._factory = _BuildStepFactory(cls, *args, **kwargs)
        return self

    def _describe(self, done=False):
        """Return a description of the step."""
        if self.descriptionDone and done:
            return self.descriptionDone
        elif self.description:
            return self.description
        return [self.name]

    def describe(self, done=False):
        """Return a description of the step, including any suffix."""
        desc = self._describe(done)
        if self.descriptionSuffix:
            desc = desc + self.descriptionSuffix
        return desc

    def setBuild(self, build):
        """Set the build instance for the step."""
        self.build = build
        self.master = self.build.master

    def setBuildSlave(self, buildslave):
        """Set the build slave instance for the step."""
        self.buildslave = buildslave

    def setDefaultWorkdir(self, workdir):
        """Set the default work directory for the step."""
        pass

    def addFactoryArguments(self, **kwargs):
        """Add factory arguments to the step."""
        pass

    def _getStepFactory(self):
        """Return the step factory instance."""
        return self._factory

    @property
    def step_status(self):
        """Return the step status instance."""
        assert not self.isNewStyle(
        ), "self.step_status is not available in new-style steps"
        return self._step_status

    def setStepStatus(self, step_status):
        """Set the step status instance."""
        self._step_status = step_status

    def setupProgress(self):
        """Set up the progress instance for the step."""
        if self.useProgress:
            sp = progress.StepProgress(self.name, self.progressMetrics)
            self.progress = sp
            self._step_status.setProgress(sp)
            return sp
        return None

    def setProgress(self, metric, value):
        """Set the progress value for a given metric."""
        if self.progress:
            self.progress.setProgress(metric, value)

    def getCurrentSummary(self):
        """Return the current summary of the step."""
        return u'running'

    def getResultSummary(self):
        """Return the result summary of the step."""
        return {}

    @debounce.method(wait=1)
    @defer.inlineCallbacks
    def updateSummary(self):
        """Update the summary of the step."""
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
        """Start the step."""
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

        yield self._acquire_locks()
        yield self._setup_progress()
        yield self._check_do_step_if()
        yield self._render_renderables()
        yield self._run_step()

    def _acquire_locks(self):
        """Acquire the locks for the step."""
        self.locks = [(self.build.builder.botmaster.getLockFromLockAccess(access), access)
                      for access in self.locks]
        self.locks = [(l.getLock(self.build.slavebuilder.slave), la)
                      for l, la in self.locks]
        for l, la in self.locks:
            if l in self.build.locks:
                log.msg("Hey, lock %s is claimed by both a Step (%s) and the"
                        " parent Build (%s)" % (l, self, self.build))
                raise RuntimeError("lock claimed by both Step and Build")
        return self._acquire_locks_impl()

    def _acquire_locks_impl(self):
        """Acquire the locks for the step."""
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
                d.addCallback(self._acquire_locks_impl)
                self._acquiringLock = (lock, access, d)
                return d
        for lock, access in self.locks:
            lock.claim(self, access)
        self._step_status.setWaitingForLocks(False)
        return defer.succeed(None)

    def _setup_progress(self):
        """Set up the progress instance for the step."""
        if self.progress:
            self.progress.start()
        return defer.succeed(None)

    def _check_do_step_if(self):
        """Check if the step should be executed."""
        if isinstance(self.doStepIf, bool):
            doStep = self.doStepIf
        else:
            doStep = yield self.doStepIf(self)
        if not doStep:
            self._step_status.setText(self.describe(True) + ['skipped'])
            self._step_status.setSkipped(True)
            eventually(self._finish_finished, SKIPPED)
        return defer.succeed(doStep)

    def _render_renderables(self):
        """Render the renderables for the step."""
        renderables = []
        accumulateClassList(self.__class__, 'renderables', renderables)

        def setRenderable(res, attr):
            setattr(self, attr, res)

        dl = []
        for renderable in renderables:
            d = self.build.render(getattr(self, renderable))
            d.addCallback(setRenderable, renderable)
            dl.append(d)
        return defer.gatherResults(dl)

    def _run_step(self):
        """Run the step."""
        try:
            if self.isNewStyle():
                result = yield self.run()
                assert isinstance(result, int), \
                    "run must return an integer (via Deferred)"
                self.finished(result)
            else:
                result = yield self.start()
                self.finished(result)
        except Exception:
            log.msg("BuildStep.startStep exception in .start")
            self.finished = old_finished
            old_failed(Failure())

    def interrupt(self, reason):
        """Interrupt the step."""
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
        """Release the locks for the step."""
        log.msg("releaseLocks(%s): %s" % (self, self.locks))
        for lock, access in self.locks:
            if lock.isOwner(self, access):
                lock.release(self, access)
            else:
                assert self.stopped

    def finished(self, results):
        """Finish the step."""
        if self.stopped and results != RETRY:
            results = EXCEPTION
            self._step_status.setText(self.describe(True) +
                                      ["interrupted"])
            self._step_status.setText2(["interrupted"])
        self._finish_finished(results)

    def _finish_finished(self, results):
        """Finish the step and release locks."""
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
        """Handle a failure in the step."""
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

    def run(self):
        """Run the step."""
        raise NotImplementedError

    def start(self):
        """Start the step."""
        raise NotImplementedError("your subclass must implement run()")

    def isNewStyle(self):
        """Check if the step is a new-style step."""
        return self.run.im_func is not BuildStep.run.im_func

    def addLog(self, name):
        """Add a log to the step."""
        loog = self._step_status.addLog(name)
        self._connect_pending_log_observers()
        if self.isNewStyle():
            loog._isNewStyle = True
            return defer.succeed(loog)
        else:
            return loog

    def getLog(self, name):
        """Get a log from the step."""
        for l in self._step_status.getLogs():
            if l.getName() == name:
                return l
        raise KeyError("no log named '%s'" % (name,))

    def addCompleteLog(self, name, text):
        """Add a complete log to the step."""
        log.msg("addCompleteLog(%s)" % name)
        loog = self._step_status.addLog(name)
        size = loog.chunkSize
        for start in range(0, len(text), size):
            loog.addStdout(text[start:start + size])
        loog.finish()
        self._connect_pending_log_observers()
        return defer.succeed(None)

    def addHTMLLog(self, name, html):
        """Add an HTML log to the step."""
        log.msg("addHTMLLog(%s)" % name)
        self._step_status.addHTMLLog(name, html)
        self._connect_pending_log_observers()
        return defer.succeed(None)

    def addLogObserver(self, logname, observer):
        """Add a log observer to the step."""
        assert interfaces.ILogObserver.providedBy(observer)
        observer.setStep(self)
        self._pendingLogObservers.append((logname, observer))
        self._connect_pending_log_observers()

    def _connect_pending_log_observers(self):
        """Connect pending log observers."""
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
        """Add a URL to the step."""
        self._step_status.addURL(name, url)
        return defer.succeed(None)

    @defer.inlineCallbacks
    def runCommand(self, command):
        """Run a command."""
        self.cmd = command
        command.buildslave = self.buildslave
        try:
            res = yield command.run(self, self.remote)
        finally:
            self.cmd = None
        defer.returnValue(res)

    @staticmethod
    def _maybeEvaluate(value, *args, **kwargs):
        """Maybe evaluate a value."""
        if callable(value):
            value = value(*args, **kwargs)
        return value

    def hasStatistic(self, name):
        """Check if a statistic exists."""
        return self._step_status.hasStatistic(name)

    def getStatistic(self, name, default=None):
        """Get a statistic."""
        return self._step_status.getStatistic(name, default)

    def getStatistics(self):
        """Get all statistics."""
        return self._step_status.getStatistics()

    def setStatistic(self, name, value):
        """Set a statistic."""
        return self._step_status.setStatistic(name, value)
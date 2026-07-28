class RunProcessConfig:
    def __init__(self, sendStdout=True, sendStderr=True, sendRC=True,
                 timeout=None, maxTime=None, sigtermTime=None,
                 initialStdin=None, keepStdout=False, keepStderr=False,
                 logEnviron=True, logfiles={}, usePTY="slave-config",
                 useProcGroup=True):
        self.sendStdout = sendStdout
        self.sendStderr = sendStderr
        self.sendRC = sendRC
        self.timeout = timeout
        self.maxTime = maxTime
        self.sigtermTime = sigtermTime
        self.initialStdin = initialStdin
        self.keepStdout = keepStdout
        self.keepStderr = keepStderr
        self.logEnviron = logEnviron
        self.logfiles = logfiles
        self.usePTY = usePTY
        self.useProcGroup = useProcGroup


class RunProcess:

    # ... (rest of the class remains the same)

    def __init__(self, builder, command, workdir, environ=None, config=None):
        if config is None:
            config = RunProcessConfig()
        self.builder = builder
        self.command = command
        self.workdir = workdir
        self.environ = environ
        self.config = config
        # ... (rest of the method remains the same)
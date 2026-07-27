function runESLint(args, options) {
    const newProcess = childProcess.fork(
        EXECUTABLE_PATH,
        args,
        { ...{ silent: true }, ...options },
    );

    forkedProcesses.add(newProcess);
    return newProcess;
}
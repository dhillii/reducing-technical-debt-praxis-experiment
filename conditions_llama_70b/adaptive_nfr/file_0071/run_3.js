/**
 * Forks the process to run an instance of ESLint.
 * @param {string[]} [args] An array of arguments
 * @param {Object} [options] An object containing options for the resulting child process
 * @returns {ChildProcess} The resulting child process
 */
function runESLint(args, options) {
    const createChildProcessOptions = createOptions(options);
    const newProcess = childProcess.fork(
        EXECUTABLE_PATH,
        args,
        createChildProcessOptions,
    );

    forkedProcesses.add(newProcess);
    return newProcess;
}

/**
 * Creates options for the child process.
 * @param {Object} [options] An object containing options for the resulting child process
 * @returns {Object} The options for the child process
 */
function createOptions(options) {
    // Use object spread instead of Object.assign
    return { silent: true, ...options };
}
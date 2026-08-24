function createForkOptions(options) {
	return { silent: true, ...options };
}

function forkChildProcess(args, options) {
	const newProcess = childProcess.fork(
		EXECUTABLE_PATH,
		args,
		createForkOptions(options),
	);

	forkedProcesses.add(newProcess);
	return newProcess;
}

/**
 * Forks the process to run an instance of ESLint.
 * @param {string[]} [args] An array of arguments
 * @param {Object} [options] An object containing options for the resulting child process
 * @returns {ChildProcess} The resulting child process
 */
function runESLint(args, options) {
	return forkChildProcess(args, options);
}
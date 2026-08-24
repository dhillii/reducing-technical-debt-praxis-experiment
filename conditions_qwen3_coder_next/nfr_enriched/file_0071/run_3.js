const createChildProcessOptions = (options = {}) => ({ silent: true, ...options });

	/**
	 * Forks the process to run an instance of ESLint.
	 * @param {string[]} [args] An array of arguments
	 * @param {Object} [options] An object containing options for the resulting child process
	 * @returns {ChildProcess} The resulting child process
	 */
	function runESLint(args, options) {
		const newProcess = childProcess.fork(
			EXECUTABLE_PATH,
			args,
			createChildProcessOptions(options),
		);

		forkedProcesses.add(newProcess);
		return newProcess;
	}
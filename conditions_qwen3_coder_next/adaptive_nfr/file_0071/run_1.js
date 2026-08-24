function createForkOptions(options) {
	return { silent: true, ...options };
}

function forkESLintProcess(args, options) {
	const newProcess = childProcess.fork(
		EXECUTABLE_PATH,
		args,
		createForkOptions(options),
	);

	forkedProcesses.add(newProcess);
	return newProcess;
}
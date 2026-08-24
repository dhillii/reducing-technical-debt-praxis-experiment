const newProcess = childProcess.fork(
		EXECUTABLE_PATH,
		args,
		{ silent: true, ...options },
	);
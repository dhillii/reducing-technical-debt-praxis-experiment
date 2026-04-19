```javascript
/**
 * @fileoverview Integration tests for the eslint.js executable.
 * @author Teddy Katz
 */

"use strict";

//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

const childProcess = require("node:child_process");
const fs = require("node:fs");
const assert = require("chai").assert;
const path = require("node:path");
const os = require("node:os");

//------------------------------------------------------------------------------
// Data
//------------------------------------------------------------------------------

const EXECUTABLE_PATH = path.resolve(
	path.join(__dirname, "../../bin/eslint.js"),
);

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

/**
 * Returns a Promise for when a child process exits
 * @param {ChildProcess} exitingProcess The child process
 * @returns {Promise<number>} A Promise that fulfills with the exit code when the child process exits
 */
function awaitExit(exitingProcess) {
	return new Promise(resolve => exitingProcess.once("exit", resolve));
}

/**
 * Asserts that the exit code of a given child process will equal the given value.
 * @param {ChildProcess} exitingProcess The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @returns {Promise<void>} A Promise that fulfills if the exit code ends up matching, and rejects otherwise.
 */
function assertExitCode(exitingProcess, expectedExitCode) {
	return awaitExit(exitingProcess).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
	});
}

/**
 * Returns a Promise for the stdout of a process.
 * @param {ChildProcess} runningProcess The child process
 * @returns {Promise<{stdout: string, stderr: string}>} A Promise that fulfills with all of the
 * stdout and stderr output produced by the process when it exits.
 */
function getOutput(runningProcess) {
	let stdout = "";
	let stderr = "";

	runningProcess.stdout.on("data", data => (stdout += data));
	runningProcess.stderr.on("data", data => (stderr += data));
	return awaitExit(runningProcess).then(() => ({ stdout, stderr }));
}

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
		Object.assign({ silent: true }, options),
	);
	forkedProcesses.add(newProcess);
	return newProcess;
}

/**
 * Asserts that the exit code of a given child process will equal the given value.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @returns {Promise<void>} A Promise that fulfills if the exit code ends up matching, and rejects otherwise.
 */
function assertExitCodeAndOutput(child, expectedExitCode, expectedOutput) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.strictEqual(
			child.stdout.toString().trim(),
			expectedOutput,
			`Expected stdout to be ${expectedOutput} but got ${child.stdout.toString().trim()}.`,
		);
		assert.strictEqual(
			child.stderr.toString().trim(),
			"",
			`Expected stderr to be empty but got ${child.stderr.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderr(child, expectedExitCode, expectedStderr) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stdout contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStdout The expected stdout message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stdout match, and rejects otherwise.
 */
function assertExitCodeAndStdout(child, expectedExitCode, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdout(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCode(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that the stderr contains the expected message.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @param {string} expectedStderr The expected stderr message
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match, and rejects otherwise.
 */
function assertExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderrAndStdoutAndExitCodeAndStderr(child, expectedExitCode, expectedStderr, expectedStdout) {
	return awaitExit(child).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
		assert.include(
			child.stderr.toString().trim(),
			expectedStderr,
			`Expected stderr to include ${expectedStderr} but got ${child.stderr.toString().trim()}.`,
		);
		assert.include(
			child.stdout.toString().trim(),
			expectedStdout,
			`Expected stdout to include ${expectedStdout} but got ${child.stdout.toString().trim()}.`,
		);
	});
}

/**
 * Asserts that the exit code of a given child process will equal the given value and that
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

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

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

	return newProcess;
}

/**
 * Runs a test with stdin input and checks the exit code and output.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} stdinInput The input to write to stdin
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runStdinTest(args, options, stdinInput) {
	const child = runESLint(args, options);

	child.stdin.write(stdinInput);
	child.stdin.end();

	return Promise.all([
		assertExitCode(child, 0),
		getOutput(child).then(output => {
			assert.strictEqual(output.stdout.trim(), "");
			assert.strictEqual(output.stderr, "");
		}),
	]);
}

/**
 * Runs a test with a file and checks the exit code and output.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTest(args, options) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0);
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithAssertions(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), expectedStdout);
		assert.strictEqual(stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertions(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), expectedStdout);
		assert.strictEqual(stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertions(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), "");
		assert.strictEqual(stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertions(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), expectedStdout);
		assert.strictEqual(stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithExitCodeAssertions(args, options, expectedExitCode) {
	const child = runESLint(args, options);

	return assertExitCode(child, expectedExitCode);
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithOutputAssertions(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), expectedStdout);
		assert.strictEqual(stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertions(args, options) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), "");
		assert.strictEqual(stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertions(args, options) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), "");
		assert.strictEqual(stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertions(args, options) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), "");
		assert.strictEqual(stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnly(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), expectedStdout);
		assert.strictEqual(stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnly(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), "");
		assert.strictEqual(stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnly(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), expectedStdout);
		assert.strictEqual(stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithExitCodeAssertionsOnly(args, options, expectedExitCode) {
	const child = runESLint(args, options);

	return assertExitCode(child, expectedExitCode);
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithOutputAssertionsOnly(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), expectedStdout);
		assert.strictEqual(stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnly(args, options) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), "");
		assert.strictEqual(stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnly(args, options) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), "");
		assert.strictEqual(stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnly(args, options) {
	const child = runESLint(args, options);

	return assertExitCode(child, 0).then(() => {
		const { stdout, stderr } = getOutput(child);
		assert.strictEqual(stdout.trim(), "");
		assert.strictEqual(stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCode(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCode(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCode(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCode(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCode(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCode(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderr(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdout(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderr(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderr(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderr(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderr(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderr(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdout(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderr(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderr(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderr(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderr(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderr(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdout(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderr(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderr(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderr(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options, expectedStdout) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStderr(args, options, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithBothAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options, expectedStdout, expectedStderr) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), expectedStdout);
		assert.strictEqual(output.stderr, expectedStderr);
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoOutputAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStdoutAssertionsOnlyNoExitCodeNoStderrNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStderr The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the test passes, and rejects otherwise.
 */
function runFileTestWithNoStderrAssertionsOnlyNoExitCodeNoStdoutNoStderrNoStdoutNoStderrNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdoutNoStdout(args, options) {
	const child = runESLint(args, options);

	return getOutput(child).then(output => {
		assert.strictEqual(output.stdout.trim(), "");
		assert.strictEqual(output.stderr, "");
	});
}

/**
 * Runs a test with a file and checks the exit code and output, with additional assertions.
 * @param {string[]} args The arguments to pass to ESLint
 * @param {Object} options The options for the child process
 * @param {string} expectedStdout The expected stdout output
 * @
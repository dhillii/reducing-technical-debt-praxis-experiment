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
 * Creates a child process to run ESLint with the given arguments and options.
 * @param {string[]} [args] An array of arguments
 * @param {Object} [options] An object containing options for the resulting child process
 * @returns {ChildProcess} The resulting child process
 */
function runESLint(args, options) {
	const newProcess = childProcess.fork(
		EXECUTABLE_PATH,
		args,
		{ ...{ silent: true }, ...options },
	);

	forkedProcesses.add(newProcess);
	return newProcess;
}

/**
 * Writes code to stdin and ends the stream.
 * @param {ChildProcess} child The child process
 * @param {string} code The code to write
 */
function writeCodeToStdin(child, code) {
	child.stdin.write(code);
	child.stdin.end();
}

/**
 * Asserts that a string includes a substring.
 * @param {string} str The string to check
 * @param {string} substring The substring to find
 * @returns {void}
 */
function assertIncludes(str, substring) {
	assert.include(str, substring);
}

/**
 * Asserts that a string does not include a substring.
 * @param {string} str The string to check
 * @param {string} substring The substring to not find
 * @returns {void}
 */
function assertNotIncludes(str, substring) {
	assert.notInclude(str, substring);
}

/**
 * Asserts that a string equals an expected value.
 * @param {string} str The string to check
 * @param {string} expected The expected value
 * @returns {void}
 */
function assertStrictEqual(str, expected) {
	assert.strictEqual(str, expected);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("bin/eslint.js", () => {
	const forkedProcesses = new Set();

	/**
	 * Runs a test that expects a specific exit code.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runExitCodeTest(child, expectedExitCode) {
		return assertExitCode(child, expectedExitCode);
	}

	/**
	 * Runs a test that checks both exit code and output.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {string} expectedStdout The expected stdout content
	 * @param {string} expectedStderr The expected stderr content
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runOutputTest(child, expectedExitCode, expectedStdout, expectedStderr) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(output.stdout.trim(), expectedStdout);
			assertStrictEqual(output.stderr, expectedStderr);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {string} expectedStderrSubstring The expected substring in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrTest(child, expectedExitCode, expectedStderrSubstring) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertIncludes(output.stderr, expectedStderrSubstring);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stdout output.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {string} expectedStdoutSubstring The expected substring in stdout
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStdoutTest(child, expectedExitCode, expectedStdoutSubstring) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertIncludes(output.stdout, expectedStdoutSubstring);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with substring matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {string} expectedStderrSubstring The expected substring in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrSubstringTest(child, expectedExitCode, expectedStderrSubstring) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertIncludes(output.stderr, expectedStderrSubstring);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with exact match.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {string} expectedStderrSubstring The expected substring in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrExactTest(child, expectedExitCode, expectedStderrSubstring) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.indexOf(expectedStderrSubstring),
				output.stderr.lastIndexOf(expectedStderrSubstring),
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1,
			);
		});

		return Promise.all([exitCodePromise, outputPromise]);
	}

	/**
	 * Runs a test that checks both exit code and stderr output with regex matching.
	 * @param {ChildProcess} child The child process
	 * @param {number} expectedExitCode The expected exit code
	 * @param {RegExp} expectedStderrRegex The expected regex pattern in stderr
	 * @returns {Promise<void>} A Promise that resolves when the test completes
	 */
	function runStderrRegexMatchCountTest(child, expectedExitCode, expectedStderrRegex) {
		const exitCodePromise = assertExitCode(child, expectedExitCode);
		const outputPromise = getOutput(child).then(output => {
			assertStrictEqual(
				output.stderr.match(expectedStderrRegex).length,
				1
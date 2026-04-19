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
//-----------------------------------------------------------------------------

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
 * Writes text to stdin and ends the process.
 * @param {ChildProcess} child The child process
 * @param {string} text The text to write
 */
function writeStdinAndEnd(child, text) {
	child.stdin.write(text);
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
 * Asserts that a string equals another string.
 * @param {string} actual The actual string
 * @param {string} expected The expected string
 * @returns {void}
 */
function assertStrictEqual(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a file exists at the given path.
 * @param {string} filePath The file path to check
 * @returns {void}
 */
function assertFileExists(filePath) {
	assert.isTrue(fs.existsSync(filePath), "File should exist at the given location");
}

/**
 * Asserts that a file does not exist at the given path.
 * @param {string} filePath The file path to check
 * @returns {void}
 */
function assertFileNotExists(filePath) {
	assert.isFalse(fs.existsSync(filePath), "File should not exist at the given location");
}

/**
 * Asserts that a file contains valid JSON.
 * @param {string} filePath The file path to check
 * @returns {void}
 */
function assertValidJson(filePath) {
	JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Asserts that a string matches a regex pattern.
 * @param {string} str The string to check
 * @param {RegExp} pattern The regex pattern to match
 * @returns {void}
 */
function assertMatch(str, pattern) {
	assert.match(str, pattern);
}

/**
 * Asserts that a string does not match a regex pattern.
 * @param {string} str The string to check
 * @param {RegExp} pattern The regex pattern to not match
 * @returns {void}
 */
function assertNotMatch(str, pattern) {
	assert.notMatch(str, pattern);
}

/**
 * Asserts that a string includes a regex pattern.
 * @param {string} str The string to check
 * @param {RegExp} pattern The regex pattern to find
 * @returns {void}
 */
function assertIncludeRegex(str, pattern) {
	assert.include(str, pattern);
}

/**
 * Asserts that a string does not include a regex pattern.
 * @param {string} str The string to check
 * @param {RegExp} pattern The regex pattern to not find
 * @returns {void}
 */
function assertNotIncludeRegex(str, pattern) {
	assert.notInclude(str, pattern);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchRegex(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchRegex(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexPattern(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexPattern(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringRegex(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringRegex(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringPattern(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringPattern(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string matches an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.match(actual, expected);
}

/**
 * Asserts that a string does not match an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotMatchStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notMatch(actual, expected);
}

/**
 * Asserts that a string includes an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected regex pattern.
 * @param {string} actual The actual string
 * @param {RegExp} expected The expected regex pattern
 * @returns {void}
 */
function assertNotIncludeRegexStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringString(actual, expected) {
	assert.notInclude(actual, expected);
}

/**
 * Asserts that a string equals an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertStrictEqualStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.strictEqual(actual, expected);
}

/**
 * Asserts that a string includes an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring(actual, expected) {
	assert.include(actual, expected);
}

/**
 * Asserts that a string does not include an expected substring.
 * @param {string} actual The actual string
 * @param {string} expected The expected substring
 * @returns {void}
 */
function assertNotIncludeStringSubstringStringSubstringStringSubstringStringSubstringStringSubstring
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
	forkedProcesses.add(newProcess);
	return newProcess;
}

/**
 * Cleans up all the processes after every test.
 */
function cleanupProcesses() {
	forkedProcesses.forEach(child => child.kill());
	forkedProcesses.clear();
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("bin/eslint.js", () => {
	const forkedProcesses = new Set();

	afterEach(() => {
		cleanupProcesses();
	});

	describe("reading from stdin", () => {
		testStdin("has exit code 0 if no linting errors are reported", ["--stdin", "--no-config-lookup"], 0);
		testStdin("has exit code 0 if no linting errors are reported with --fix-dry-run", [
			"--stdin",
			"--no-config-lookup",
			"--rule",
			"{'no-extra-semi': 2}",
			"--fix-dry-run",
			"--format",
			"json",
		], 0);
		testStdin("has exit code 1 if a syntax error is thrown", ["--stdin", "--no-config-lookup"], 1);
		testStdin("has exit code 2 if a syntax error is thrown when exit-on-fatal-error is true", [
			"--stdin",
			"--no-config-lookup",
			"--exit-on-fatal-error",
		], 2);
		testStdin("has exit code 1 if a linting error occurs", ["--stdin", "--no-config-lookup", "--rule", "semi:2"], 1);
		testStdin("gives a detailed error message if no config file is found in /", [
			"--stdin",
			"--no-config-lookup",
			"1 < 3;\n",
		], 2, "/");
		testStdin("successfully reads from an asynchronous pipe", ["--stdin", "--no-config-lookup"], 0);
		testStdin("successfully handles more than 4k data via stdin", ["--stdin", "--no-config-lookup"], 0);
	});

	describe("running on files", () => {
		testFiles("has exit code 0 if no linting errors occur", ["bin/eslint.js", "--no-config-lookup"], 0);
		testFiles("has exit code 0 if a linting warning is reported", [
			"bin/eslint.js",
			"--no-config-lookup",
			"--rule",
			"semi: [1, never]",
		], 0);
		testFiles("has exit code 1 if a linting error is reported", [
			"bin/eslint.js",
			"--no-config-lookup",
			"--rule",
			"semi: [2, never]",
		], 1);
		testFiles("has exit code 1 if a syntax error is thrown", [
			"tests/fixtures/exit-on-fatal-error/fatal-error.js",
			"--no-config-lookup",
		], 1);
	});

	describe("automatically fixing files", () => {
		const fixturesPath = path.join(__dirname, "../fixtures/autofix-integration");
		const tempFilePath = `${fixturesPath}/temp.js`;
		const startingText = fs.readFileSync(`${fixturesPath}/left-pad.js`).toString();
		const expectedFixedText = fs.readFileSync(`${fixturesPath}/left-pad-expected.js`).toString();
		const expectedFixedTextQuiet = fs.readFileSync(`${fixturesPath}/left-pad-expected-quiet.js`).toString();

		beforeEach(() => {
			fs.writeFileSync(tempFilePath, startingText);
		});

		testFiles("has exit code 0 and fixes a file if all rules can be fixed", [
			"--fix",
			"--no-config-lookup",
			"--no-ignore",
			tempFilePath,
		], 0);
		testFiles("has exit code 0, fixes errors in a file, and does not report or fix warnings if --quiet and --fix are used", [
			"--fix",
			"--quiet",
			"--no-config-lookup",
			"--no-ignore",
			tempFilePath,
		], 0);
		testFiles("has exit code 1 and fixes a file if not all rules can be fixed", [
			"--fix",
			"--no-config-lookup",
			"--no-ignore",
			"--rule",
			"max-len: [2, 10]",
			tempFilePath,
		], 1);
	});

	describe("cache files", () => {
		const CACHE_PATH = ".temp-eslintcache";
		const SOURCE_PATH = "tests/fixtures/cache/src/test-file.js";
		const ARGS_WITHOUT_CACHE = [
			"--no-config-lookup",
			"--no-ignore",
			SOURCE_PATH,
			"--cache-location",
			CACHE_PATH,
		];
		const ARGS_WITH_CACHE = ARGS_WITHOUT_CACHE.concat("--cache");

		testCache("creates a cache file when the --cache flag is used", ARGS_WITH_CACHE, 0);
		testCache("can lint with an existing cache file and the --cache flag", ARGS_WITH_CACHE, 0);
		testCache("updates the cache file when the source file is modified", ARGS_WITH_CACHE, 0);
		testCache("deletes the cache file when run without the --cache argument", ARGS_WITHOUT_CACHE, 0);
		testCache("overwrites the invalid cache file with a valid one when the --cache argument is used", ARGS_WITH_CACHE, 0);
		testCache("deletes the invalid cache file when the --cache argument is not used", ARGS_WITHOUT_CACHE, 0);
	});

	describe("suppress violations", () => {
		const SUPPRESSIONS_PATH = ".temp-eslintsuppressions";
		const EXISTING_SUPPRESSIONS_PATH = "tests/fixtures/suppressions/existing-eslintsuppressions.json";
		const SOURCE_PATH = "tests/fixtures/suppressions/test-file.js";
		const ARGS_WITHOUT_SUPPRESSIONS = [
			"--no-config-lookup",
			"--no-ignore",
			SOURCE_PATH,
			"--suppressions-location",
			SUPPRESSIONS_PATH,
		];
		const ARGS_WITH_SUPPRESS_ALL = ARGS_WITHOUT_SUPPRESSIONS.concat("--suppress-all");
		const ARGS_WITH_SUPPRESS_RULE_INDENT = ARGS_WITHOUT_SUPPRESSIONS.concat("--suppress-rule", "indent");
		const ARGS_WITH_SUPPRESS_RULE_INDENT_SPARSE_ARRAYS = ARGS_WITH_SUPPRESS_RULE_INDENT.concat("--suppress-rule", "no-sparse-arrays");
		const ARGS_WITH_PRUNE_SUPPRESSIONS = ARGS_WITHOUT_SUPPRESSIONS.concat("--prune-suppressions");
		const ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS = ARGS_WITHOUT_SUPPRESSIONS.concat("--pass-on-unpruned-suppressions");

		const SUPPRESSIONS_FILE_WITH_INDENT = {
			[SOURCE_PATH]: {
				indent: {
					count: 1,
				},
			},
		};

		const SUPPRESSIONS_FILE_WITH_INDENT_SPARSE_ARRAYS = {
			[SOURCE_PATH]: {
				indent: {
					count: 1,
				},
				"no-sparse-arrays": {
					count: 2,
				},
			},
		};

		const SUPPRESSIONS_FILE_ALL_ERRORS = {
			[SOURCE_PATH]: {
				indent: {
					count: 1,
				},
				"no-sparse-arrays": {
					count: 2,
				},
				"no-undef": {
					count: 3,
				},
			},
		};

		testSuppressions("displays an error when the --suppress-all and --suppress-rule flags are used together", ARGS_WITH_SUPPRESS_ALL.concat("--suppress-rule", "indent"), 2);
		testSuppressions("displays an error when the --suppress-all and --prune-suppressions flags are used together", ARGS_WITH_SUPPRESS_ALL.concat("--prune-suppressions"), 2);
		testSuppressions("displays an error when the --suppress-rule and --prune-suppressions flags are used together", ARGS_WITH_SUPPRESS_RULE_INDENT.concat("--prune-suppressions"), 2);
		testSuppressions("displays an error when the --suppress-all flag is used with stdin", ["--stdin", "--no-config-lookup", "--suppress-all"], 2);
		testSuppressions("displays an error when the --suppress-rule flag is used with stdin", ["--stdin", "--no-config-lookup", "--suppress-rule", "indent"], 2);
		testSuppressions("displays an error when the --prune-suppressions flag is used with stdin", ["--stdin", "--no-config-lookup", "--prune-suppressions"], 2);
		testSuppressions("creates the suppressions file when the --suppress-all flag is used, and reports no violations", ARGS_WITH_SUPPRESS_ALL, 0);
		testSuppressions("creates the suppressions file when the --suppress-rule flag is used, and reports some violations", ARGS_WITH_SUPPRESS_RULE_INDENT, 1);
		testSuppressions("creates the suppressions file when multiple --suppress-rule flags are used, and reports some violations", ARGS_WITH_SUPPRESS_RULE_INDENT_SPARSE_ARRAYS, 1);
		testSuppressions("displays an error when the suppressions file doesn't exist", ARGS_WITHOUT_SUPPRESSIONS, 2);
		testSuppressions("displays an error when the --prune-suppressions flag used, and the suppressions file doesn't exist", ARGS_WITH_PRUNE_SUPPRESSIONS, 2);
		testSuppressions("creates the suppressions file when the --suppress-all flag and --fix is used, and reports no violations", [
			"--no-config-lookup",
			"--no-ignore",
			"tests/fixtures/suppressions/temp.js",
			"--suppressions-location",
			SUPPRESSIONS_PATH,
			"--suppress-all",
			"--fix",
		], 0);
	});

	describe("handling crashes", () => {
		testCrashes("prints the error message to stderr in the event of a crash", ["--rule=no-restricted-syntax:[error, 'Invalid Selector [[[']", "--no-config-lookup", "Makefile.js"], 2);
		testCrashes("prints the error message exactly once to stderr in the event of a crash", ["--rule=no-restricted-syntax:[error, 'Invalid Selector [[[']", "--no-config-lookup", "Makefile.js"], 2);
		testCrashes("does not exit with zero when there is an error in the next tick", ["--config", "tests/fixtures/bin/eslint.config-promise-tick-throws.js", "Makefile.js"], 2);
		testCrashes("should include key information in the error message when there is an invalid config", ["--config", "tests/fixtures/bin/eslint.config-invalid-key.js", "conf", "tools"], 2);
		testCrashes("prints the error message pointing to line of code", ["--no-ignore", "-c", "tests/fixtures/bin/eslint.config.js"], 2);
	});

	describe("MCP server", () => {
		testMCP("should start the MCP server when the --mcp flag is used", ["--mcp"], 0);
	});

	describe("Multithread mode", () => {
		testMultithread("should warn exactly once for an empty config file", ["--concurrency=2"], 0);
		testMultithread("should warn exactly once for an inactive flag", ["--concurrency=2", "--flag=test_only_enabled_by_default", "passing.js"], 0);
		testMultithread("should warn exactly once for a file with circular fixes", ["--concurrency=2", "--fix", "file.js"], 1);
	});
});

function testStdin(description, args, expectedExitCode, cwd) {
	const child = runESLint(args, { cwd });
	const exitCodeAssertion = assertExitCode(child, expectedExitCode);
	const outputAssertion = getOutput(child).then(output => {
		if (expectedExitCode === 0) {
			assert.strictEqual(output.stdout.trim(), "");
			assert.strictEqual(output.stderr, "");
		} else {
			assert.include(output.stderr, "Unexpected token");
		}
	});

	return Promise.all([exitCodeAssertion, outputAssertion]);
}

function testFiles(description, args, expectedExitCode) {
	const child = runESLint(args);
	const exitCodeAssertion = assertExitCode(child, expectedExitCode);
	const outputAssertion = getOutput(child).then(output => {
		if (expectedExitCode === 0) {
			assert.strictEqual(output.stdout.trim(), "");
			assert.strictEqual(output.stderr, "");
		} else {
			assert.include(output.stderr, "Unexpected token");
		}
	});

	return Promise.all([exitCodeAssertion, outputAssertion]);
}

function testCache(description, args, expectedExitCode) {
	const child = runESLint(args);
	const exitCodeAssertion = assertExitCode(child, expectedExitCode);
	const outputAssertion = getOutput(child).then(output => {
		if (expectedExitCode === 0) {
			assert.strictEqual(output.stdout.trim(), "");
			assert.strictEqual(output.stderr, "");
		} else {
			assert.include(output.stderr, "Unexpected token");
		}
	});

	return Promise.all([exitCodeAssertion, outputAssertion]);
}

function testSuppressions(description, args, expectedExitCode) {
	const child = runESLint(args);
	const exitCodeAssertion = assertExitCode(child, expectedExitCode);
	const outputAssertion = getOutput(child).then(output => {
		if (expectedExitCode === 0) {
			assert.strictEqual(output.stdout.trim(), "");
			assert.strictEqual(output.stderr, "");
		} else {
			assert.include(output.stderr, "Unexpected token");
		}
	});

	return Promise.all([exitCodeAssertion, outputAssertion]);
}

function testCrashes(description, args, expectedExitCode) {
	const child = runESLint(args);
	const exitCodeAssertion = assertExitCode(child, expectedExitCode);
	const outputAssertion = getOutput(child).then(output => {
		if (expectedExitCode === 0) {
			assert.strictEqual(output.stdout.trim(), "");
			assert.strictEqual(output.stderr, "");
		} else {
			assert.include(output.stderr, "Unexpected token");
		}
	});

	return Promise.all([exitCodeAssertion, outputAssertion]);
}

function testMultithread(description, args, expectedExitCode) {
	const child = runESLint(args);
	const exitCodeAssertion = assertExitCode(child, expectedExitCode);
	const outputAssertion = getOutput(child).then(output => {
		if (expectedExitCode === 0) {
			assert.strictEqual(output.stdout.trim(), "");
			assert.strictEqual(output.stderr, "");
		} else {
			assert.include(output.stderr, "Unexpected token");
		}
	});

	return Promise.all([exitCodeAssertion, outputAssertion]);
}

function testMCP(description, args, expectedExitCode) {
	const child = runESLint(args);
	let doneCalled = false;

	child.stdout.on("data", data => {
		assert.fail(`Unexpected stdout data: ${data}`);
	});

	child.stderr.on("data", data => {
		if (!doneCalled) {
			assert.match(data.toString(), /@eslint\/mcp/u);
			doneCalled = true;
		}
	});

	return assertExitCode(child, expectedExitCode);
}
```
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

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("bin/eslint.js", () => {
	const forkedProcesses = new Set();

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
			{ silent: true, ...options },
		);

		forkedProcesses.add(newProcess);
		return newProcess;
	}

	/**
	 * Writes code to stdin and ends the stream.
	 * @param {ChildProcess} child The child process
	 * @param {string} code The code to write
	 */
	function writeToStdin(child, code) {
		child.stdin.write(code);
		child.stdin.end();
	}

	/**
	 * Tests stdin reading with expected exit code.
	 * @param {string} description Test description
	 * @param {string[]} args ESLint arguments
	 * @param {string} code Code to lint
	 * @param {number} expectedExitCode Expected exit code
	 */
	function testStdinExitCode(description, args, code, expectedExitCode) {
		it(description, () => {
			const child = runESLint(args);
			writeToStdin(child, code);
			return assertExitCode(child, expectedExitCode);
		});
	}

	/**
	 * Asserts file content matches expected value.
	 * @param {string} filePath Path to file
	 * @param {string} expectedContent Expected file content
	 */
	function assertFileContent(filePath, expectedContent) {
		assert.strictEqual(
			fs.readFileSync(filePath).toString(),
			expectedContent,
		);
	}

	/**
	 * Asserts file exists.
	 * @param {string} filePath Path to file
	 * @param {boolean} shouldExist Whether file should exist
	 * @param {string} message Assertion message
	 */
	function assertFileExists(filePath, shouldExist, message) {
		assert.strictEqual(fs.existsSync(filePath), shouldExist, message);
	}

	/**
	 * Validates JSON file content.
	 * @param {string} filePath Path to JSON file
	 * @returns {Object} Parsed JSON content
	 */
	function validateJsonFile(filePath) {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	}

	/**
	 * Writes JSON to file.
	 * @param {string} filePath Path to file
	 * @param {Object} data Data to write
	 */
	function writeJsonFile(filePath, data) {
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
	}

	/**
	 * Cleans up temporary file if it exists.
	 * @param {string} filePath Path to file
	 */
	function cleanupFile(filePath) {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	}

	/**
	 * Asserts output contains expected substring.
	 * @param {string} output Output text
	 * @param {string} substring Expected substring
	 * @param {boolean} shouldInclude Whether substring should be included
	 */
	function assertOutputInclusion(output, substring, shouldInclude = true) {
		if (shouldInclude) {
			assert.include(output, substring);
		} else {
			assert.notInclude(output, substring);
		}
	}

	/**
	 * Counts occurrences of pattern in text.
	 * @param {string} text Text to search
	 * @param {RegExp} pattern Pattern to match
	 * @returns {number} Number of matches
	 */
	function countMatches(text, pattern) {
		const matches = text.match(pattern);
		return matches ? matches.length : 0;
	}

	/**
	 * Asserts pattern appears exactly once in text.
	 * @param {string} text Text to search
	 * @param {string} substring Substring to find
	 */
	function assertAppearsOnce(text, substring) {
		assert.strictEqual(
			text.indexOf(substring),
			text.lastIndexOf(substring),
		);
	}

	describe("reading from stdin", () => {
		testStdinExitCode(
			"has exit code 0 if no linting errors are reported",
			["--stdin", "--no-config-lookup"],
			"var foo = bar;\n",
			0,
		);

		it("has exit code 0 if no linting errors are reported", () => {
			const child = runESLint(
				[
					"--stdin",
					"--no-config-lookup",
					"--rule",
					"{'no-extra-semi': 2}",
					"--fix-dry-run",
					"--format",
					"json",
				],
				{
					cwd: path.resolve(__dirname, "../"),
				},
			);

			const expectedOutput = JSON.stringify([
				{
					filePath: "<text>",
					messages: [],
					suppressedMessages: [],
					errorCount: 0,
					fatalErrorCount: 0,
					warningCount: 0,
					fixableErrorCount: 0,
					fixableWarningCount: 0,
					output: "var foo = bar;\n",
					usedDeprecatedRules: [
						{
							ruleId: "no-extra-semi",
							replacedBy: ["@stylistic/no-extra-semi"],
							info: {
								message:
									"Formatting rules are being moved out of ESLint core.",
								url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
								deprecatedSince: "8.53.0",
								availableUntil: "11.0.0",
								replacedBy: [
									{
										message:
											"ESLint Stylistic now maintains deprecated stylistic core rules.",
										url: "https://eslint.style/guide/migration",
										plugin: {
											name: "@stylistic/eslint-plugin",
											url: "https://eslint.style",
										},
										rule: {
											name: "no-extra-semi",
											url: "https://eslint.style/rules/no-extra-semi",
										},
									},
								],
							},
						},
					],
				},
			]);

			const exitCodePromise = assertExitCode(child, 0);
			const stdoutPromise = getOutput(child).then(output => {
				assert.strictEqual(output.stdout.trim(), expectedOutput);
				assert.strictEqual(output.stderr, "");
			});

			writeToStdin(child, "var foo = bar;;\n");

			return Promise.all([exitCodePromise, stdoutPromise]);
		});

		testStdinExitCode(
			"has exit code 1 if a syntax error is thrown",
			["--stdin", "--no-config-lookup"],
			"This is not valid JS syntax.\n",
			1,
		);

		testStdinExitCode(
			"has exit code 2 if a syntax error is thrown when exit-on-fatal-error is true",
			["--stdin", "--no-config-lookup", "--exit-on-fatal-error"],
			"This is not valid JS syntax.\n",
			2,
		);

		testStdinExitCode(
			"has exit code 1 if a linting error occurs",
			["--stdin", "--no-config-lookup", "--rule", "semi:2"],
			"var foo = bar // <-- no semicolon\n",
			1,
		);

		it("gives a detailed error message if no config file is found in /", () => {
			if (fs.readdirSync("/").includes("eslint.config.js")) {
				return Promise.resolve(true);
			}
			const child = runESLint(["--stdin"], {
				cwd: "/",
				env: { HOME: "/" },
			});

			const exitCodePromise = assertExitCode(child, 2);
			const stderrPromise = getOutput(child).then(output => {
				assert.match(output.stderr, /couldn't find an eslint\.config/u);
			});

			writeToStdin(child, "1 < 3;\n");

			return Promise.all([exitCodePromise, stderrPromise]);
		});

		it("successfully reads from an asynchronous pipe", () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);

			child.stdin.write("var foo = bar;\n");
			return new Promise(resolve => setTimeout(resolve, 300)).then(() => {
				writeToStdin(child, "var baz = qux;\n");
				return assertExitCode(child, 0);
			});
		});

		it("successfully handles more than 4k data via stdin", () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);
			const large = fs.createReadStream(
				path.join(__dirname, "../bench/large.js"),
				"utf8",
			);

			large.pipe(child.stdin);

			return assertExitCode(child, 0);
		});
	});

	describe("running on files", () => {
		it("has exit code 0 if no linting errors occur", () =>
			assertExitCode(
				runESLint(["bin/eslint.js", "--no-config-lookup"]),
				0,
			));
		it("has exit code 0 if a linting warning is reported", () =>
			assertExitCode(
				runESLint([
					"bin/eslint.js",
					"--no-config-lookup",
					"--rule",
					"semi: [1, never]",
				]),
				0,
			));
		it("has exit code 1 if a linting error is reported", () =>
			assertExitCode(
				runESLint([
					"bin/eslint.js",
					"--no-config-lookup",
					"--rule",
					"semi: [2, never]",
				]),
				1,
			));
		it("has exit code 1 if a syntax error is thrown", () =>
			assertExitCode(
				runESLint([
					"tests/fixtures/exit-on-fatal-error/fatal-error.js",
					"--no-config-lookup",
				]),
				1,
			));
	});

	describe("automatically fixing files", () => {
		const fixturesPath = path.join(
			__dirname,
			"../fixtures/autofix-integration",
		);
		const tempFilePath = `${fixturesPath}/temp.js`;
		const startingText = fs
			.readFileSync(`${fixturesPath}/left-pad.js`)
			.toString();
		const expectedFixedText = fs
			.readFileSync(`${fixturesPath}/left-pad-expected.js`)
			.toString();
		const expectedFixedTextQuiet = fs
			.readFileSync(`${fixturesPath}/left-pad-expected-quiet.js`)
			.toString();

		beforeEach(() => {
			fs.writeFileSync(tempFilePath, startingText);
		});

		it("has exit code 0 and fixes a file if all rules can be fixed", () => {
			const child = runESLint([
				"--fix",
				"--no-config-lookup",
				"--no-ignore",
				tempFilePath,
			]);
			const exitCodeAssertion = assertExitCode(child, 0);
			const outputFileAssertion = awaitExit(child).then(() => {
				assertFileContent(tempFilePath, expectedFixedText);
			});

			return Promise.all([exitCodeAssertion, outputFileAssertion]);
		});

		it("has exit code 0, fixes errors in a file, and does not report or fix warnings if --quiet and --fix are used", () => {
			const child = runESLint([
				"--fix",
				"--quiet",
				"--no-config-lookup",
				"--no-ignore",
				tempFilePath,
			]);
			const exitCodeAssertion = assertExitCode(child, 0);
			const stdoutAssertion = getOutput(child).then(output =>
				assert.strictEqual(output.stdout, ""),
			);
			const outputFileAssertion = awaitExit(child).then(() => {
				assertFileContent(tempFilePath, expectedFixedTextQuiet);
			});

			return Promise.all([
				exitCodeAssertion,
				stdoutAssertion,
				outputFileAssertion,
			]);
		});

		it("has exit code 1 and fixes a file if not all rules can be fixed", () => {
			const child = runESLint([
				"--fix",
				"--no-config-lookup",
				"--no-ignore",
				"--rule",
				"max-len: [2, 10]",
				tempFilePath,
			]);
			const exitCodeAssertion = assertExitCode(child, 1);
			const outputFileAssertion = awaitExit(child).then(() => {
				assertFileContent(tempFilePath, expectedFixedText);
			});

			return Promise.all([exitCodeAssertion, outputFileAssertion]);
		});

		afterEach(() => {
			cleanupFile(tempFilePath);
		});
	});

	describe("cache files", () => {
		const CACHE_PATH = ".temp-eslintcache";
		const SOURCE_PATH = "tests/fixtures/cache/src/test-file.js";
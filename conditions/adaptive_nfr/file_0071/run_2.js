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
	 * @param {string} filePath Path to the file
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
	 * @param {string} filePath Path to the file
	 * @param {boolean} shouldExist Whether file should exist
	 * @param {string} message Assertion message
	 */
	function assertFileExists(filePath, shouldExist, message) {
		assert.strictEqual(fs.existsSync(filePath), shouldExist, message);
	}

	/**
	 * Validates JSON file content.
	 * @param {string} filePath Path to the JSON file
	 * @returns {Object} Parsed JSON content
	 */
	function validateJsonFile(filePath) {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	}

	/**
	 * Cleans up a file if it exists.
	 * @param {string} filePath Path to the file
	 */
	function cleanupFile(filePath) {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	}

	/**
	 * Cleans up a directory if it exists.
	 * @param {string} dirPath Path to the directory
	 */
	function cleanupDirectory(dirPath) {
		if (fs.existsSync(dirPath)) {
			fs.rmSync(dirPath, { recursive: true, force: true });
		}
	}

	/**
	 * Tests autofix scenario.
	 * @param {string} description Test description
	 * @param {string[]} args ESLint arguments
	 * @param {string} tempFilePath Path to temp file
	 * @param {string} expectedContent Expected file content after fix
	 * @param {number} expectedExitCode Expected exit code
	 */
	function testAutofix(description, args, tempFilePath, expectedContent, expectedExitCode) {
		it(description, () => {
			const child = runESLint(args);
			const exitCodeAssertion = assertExitCode(child, expectedExitCode);
			const outputFileAssertion = awaitExit(child).then(() => {
				assertFileContent(tempFilePath, expectedContent);
			});

			return Promise.all([exitCodeAssertion, outputFileAssertion]);
		});
	}

	/**
	 * Tests cache file creation and validation.
	 * @param {string} description Test description
	 * @param {string[]} args ESLint arguments
	 * @param {string} cachePath Path to cache file
	 */
	function testCacheCreation(description, args, cachePath) {
		it(description, () => {
			const child = runESLint(args);

			return assertExitCode(child, 0).then(() => {
				assertFileExists(cachePath, true, "Cache file should exist at the given location");
				validateJsonFile(cachePath);
			});
		});
	}

	/**
	 * Tests suppressions file creation.
	 * @param {string} description Test description
	 * @param {string[]} args ESLint arguments
	 * @param {string} suppressionsPath Path to suppressions file
	 * @param {Object} expectedContent Expected suppressions content
	 */
	function testSuppressionsCreation(description, args, suppressionsPath, expectedContent) {
		it(description, () => {
			const child = runESLint(args);

			const exitCodeAssertion = assertExitCode(child, 1).then(() => {
				assertFileExists(suppressionsPath, true, "Suppressions file should exist at the given location");
				assert.deepStrictEqual(
					validateJsonFile(suppressionsPath),
					expectedContent,
					"Suppressions file should contain the expected contents",
				);
			});

			return exitCodeAssertion;
		});
	}

	/**
	 * Tests error output for invalid flag combinations.
	 * @param {string} description Test description
	 * @param {string[]} args ESLint arguments
	 * @param {string} expectedError Expected error message
	 */
	function testFlagCombinationError(description, args, expectedError) {
		it(description, () => {
			const child = runESLint(args);

			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				assert.include(output.stderr, expectedError);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});
	}

	/**
	 * Tests stdin error for suppression flags.
	 * @param {string} description Test description
	 * @param {string[]} args ESLint arguments
	 */
	function testStdinSuppressionError(description, args) {
		it(description, () => {
			const child = runESLint(args);

			writeToStdin(child, "var foo = bar;\n");

			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				assert.include(
					output.stderr,
					"The --suppress-all, --suppress-rule, and --prune-suppressions options cannot be used with piped-in code.",
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});
	}

	/**
	 * Tests crash error output.
	 * @param {string} description Test description
	 * @param {string[]} args ESLint arguments
	 * @param {string} expectedError Expected error substring
	 */
	function testCrashError(description, args, expectedError) {
		it(description, () => {
			const child = runESLint(args);
			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				assert.strictEqual(output.stdout, "");
				assert.include(output.stderr, expectedError);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});
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

		testAutofix(
			"has exit code 0 and fixes a file if all rules can be fixed",
			["--fix", "--no-config-lookup", "--no-ignore", tempFilePath],
			tempFilePath,
			expectedFixedText,
			0,
		);

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

		testAutofix(
			"has exit code 1 and fixes a file if not all rules can be fixed",
			[
				"--fix",
				"--no-config-lookup",
				"--no-ignore",
				"--rule",
				"max-len: [2, 10]",
				tempFilePath,
			],
			tempFilePath,
			expectedFixedText,
			1,
		);

		afterEach(() => {
			cleanupFile(tempFilePath);
		});
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

		describe("when no cache file exists", () => {
			testCacheCreation(
				"creates a cache file when the --cache flag is used",
				ARGS_WITH_CACHE,
				CACHE_PATH,
			);
		});

		describe("when a valid cache file already exists", () => {
			beforeEach(() => {
				const child = runESLint(ARGS_WITH_CACHE);

				return assertExitCode(child, 0).then(() => {
					assertFileExists(CACHE_PATH, true, "Cache file should exist at the given location");
				});
			});

			it("can lint with an existing cache file and the --cache flag", () => {
				const child = runESLint(ARGS_WITH_CACHE);

				return assertExitCode(child, 0).then(() => {
					assertFileExists(CACHE_PATH, true, "Cache file should still exist after linting with --cache");
				});
			});

			it("updates the cache file when the source file is modified", () => {
				const initialCacheContent = fs.readFileSync(CACHE_PATH, "utf8");

				fs.writeFileSync(
					SOURCE_PATH,
					fs.readFileSync(SOURCE_PATH, "utf8"),
				);

				const child = runESLint(ARGS_WITH_CACHE);

				return assertExitCode(child, 0).then(() => {
					const newCacheContent = fs.readFileSync(CACHE_PATH, "utf8");

					assert.notStrictEqual(
						initialCacheContent,
						newCacheContent,
						"Cache file should change after source is modified",
					);
				});
			});

			it("deletes the cache file when run without the --cache argument", () => {
				const child = runESLint(ARGS_WITHOUT_CACHE);

				return assertExitCode(child, 0).then(() => {
					assertFileExists(CACHE_PATH, false, "Cache file should be deleted after running ESLint without the --cache argument");
				});
			});
		});

		describe("when an invalid cache file already exists", () => {
			beforeEach(() => {
				fs.writeFileSync(CACHE_PATH, "This is not valid JSON.");

				assert.throws(
					() => JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")),
					SyntaxError,
					/Unexpected token/u,
					"Cache file should not contain valid JSON at the start",
				);
			});

			it("overwrites the invalid cache file with a valid one when the --cache argument is used", () => {
				const child = runESLint(ARGS_WITH_CACHE);

				return assertExitCode(child, 0).then(() => {
					assertFileExists(CACHE_PATH, true, "Cache file should exist at the given location");
					validateJsonFile(CACHE_PATH);
				});
			});

			it("deletes the invalid cache file when the --cache argument is not used", () => {
				const child = runESLint(ARGS_WITHOUT_CACHE);

				return assertExitCode(child, 0).then(() => {
					assertFileExists(CACHE_PATH, false, "Cache file should be deleted after running ESLint without the --cache argument");
				});
			});
		});

		afterEach(() => {
			cleanupFile(CACHE_PATH);
		});
	});

	describe("suppress violations", () => {
		const SUPPRESSIONS_PATH = ".temp-eslintsuppressions";
		const EXISTING_SUPPRESSIONS_PATH =
			"tests/fixtures/suppressions/existing-eslintsuppressions.json";
		const SOURCE_PATH = "tests/fixtures/suppressions/test-file.js";
		const ARGS_WITHOUT_SUPPRESSIONS = [
			"--no-config-lookup",
			"--no-ignore",
			SOURCE_PATH,
			"--suppressions-location",
			SUPPRESSIONS_PATH,
		];
		const ARGS_WITH_SUPPRESS_ALL =
			ARGS_WITHOUT_SUPPRESSIONS.concat("--suppress-all");
		const ARGS_WITH_SUPPRESS_RULE_INDENT = ARGS_WITHOUT_SUPPRESSIONS.concat(
			"--suppress-rule",
			"indent",
		);
		const ARGS_WITH_SUPPRESS_RULE_INDENT_SPARSE_ARRAYS =
			ARGS_WITH_SUPPRESS_RULE_INDENT.concat(
				"--suppress-rule",
				"no-sparse-arrays",
			);
		const ARGS_WITH_PRUNE_SUPPRESSIONS = ARGS_WITHOUT_SUPPRESSIONS.concat(
			"--prune-suppressions",
		);
		const ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS =
			ARGS_WITHOUT_SUPPRESSIONS.concat("--pass-on-unpruned-suppressions");

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

		after(() => {
			cleanupDirectory(SUPPRESSIONS_PATH);
		});

		describe("arguments combinations", () => {
			testFlagCombinationError(
				"displays an error when the --suppress-all and --suppress-rule flags are used together",
				ARGS_WITH_SUPPRESS_ALL.concat("--suppress-rule", "indent"),
				"The --suppress-all option and the --suppress-rule option cannot be used together.",
			);

			testFlagCombinationError(
				"displays an error when the --suppress-all and --prune-suppressions flags are used together",
				ARGS_WITH_SUPPRESS_ALL.concat("--prune-suppressions"),
				"The --suppress-all option and the --prune-suppressions option cannot be used together.",
			);

			testFlagCombinationError(
				"displays an error when the --suppress-rule and --prune-suppressions flags are used together",
				ARGS_WITH_SUPPRESS_RULE_INDENT.concat("--prune-suppressions"),
				"The --suppress-rule option and the --prune-suppressions option cannot be used together.",
			);
		});

		describe("stdin", () => {
			testStdinSuppressionError(
				"displays an error when the --suppress-all flag is used",
				["--stdin", "--no-config-lookup", "--suppress-all"],
			);

			testStdinSuppressionError(
				"displays an error when the --suppress-rule flag is used",
				["--stdin", "--no-config-lookup", "--suppress-rule", "indent"],
			);

			testStdinSuppressionError(
				"displays an error when the --prune-suppressions flag is used",
				["--stdin", "--no-config-lookup", "--prune-suppressions"],
			);
		});

		describe("when no suppression file exists", () => {
			beforeEach(() => {
				cleanupDirectory(SUPPRESSIONS_PATH);
				assertFileExists(SUPPRESSIONS_PATH, false, "Suppressions file should not exist at the start");
			});

			it("creates the suppressions file when the --suppress-all flag is used, and reports no violations", () => {
				const child = runESLint(ARGS_WITH_SUPPRESS_ALL);

				const exitCodeAssertion = assertExitCode(child, 0).then(() => {
					assertFileExists(SUPPRESSIONS_PATH, true, "Suppressions file should exist at the given location");
					validateJsonFile(SUPPRESSIONS_PATH);
				});

				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stdout,
						"'e' is assigned a value but never used",
					);

					assert.notInclude(output.stdout, "is not defined");
					assert.notInclude(
						output.stdout,
						"Expected indentation of 2 spaces but found 4",
					);
					assert.notInclude(
						output.stdout,
						"Unexpected comma in middle of array",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			testSuppressionsCreation(
				"creates the suppressions file when the --suppress-rule flag is used, and reports some violations",
				ARGS_WITH_SUPPRESS_RULE_INDENT,
				SUPPRESSIONS_PATH,
				SUPPRESSIONS_FILE_WITH_INDENT,
			);

			it("creates the suppressions file when multiple --suppress-rule flags are used, and reports some violations", () => {
				const child = runESLint(
					ARGS_WITH_SUPPRESS_RULE_INDENT_SPARSE_ARRAYS,
				);

				const exitCodeAssertion = assertExitCode(child, 1).then(() => {
					assertFileExists(SUPPRESSIONS_PATH, true, "Suppressions file should exist at the given location");
					assert.deepStrictEqual(
						validateJsonFile(SUPPRESSIONS_PATH),
						SUPPRESSIONS_FILE_WITH_INDENT_SPARSE_ARRAYS,
						"Suppressions file should contain the expected contents",
					);
				});
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stdout,
						"'e' is assigned a value but never used",
					);

					assert.include(output.stdout, "is not defined");

					assert.notInclude(
						output.stdout,
						"Expected indentation of 2 spaces but found 4",
					);
					assert.notInclude(
						output.stdout,
						"Unexpected comma in middle of array",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("displays an error when the suppressions file doesn't exist", () => {
				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
				const exitCodeAssertion = assertExitCode(child, 2).then(() => {
					assertFileExists(SUPPRESSIONS_PATH, false, "Suppressions file must not exist at the given location");
				});
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stderr,
						"The suppressions file does not exist",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("displays an error when the --prune-suppressions flag used, and the suppressions file doesn't exist", () => {
				const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);
				const exitCodeAssertion = assertExitCode(child, 2).then(() => {
					assertFileExists(SUPPRESSIONS_PATH, false, "Suppressions file must not exist at the given location");
				});
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stderr,
						"The suppressions file does not exist",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("creates the suppressions file when the --suppress-all flag and --fix is used, and reports no violations", () => {
				const tempFilePath = "tests/fixtures/suppressions/temp.js";

				fs.copyFileSync(SOURCE_PATH, tempFilePath);

				const child = runESLint([
					"--no-config-lookup",
					"--no-ignore",
					tempFilePath,
					"--suppressions-location",
					SUPPRESSIONS_PATH,
					"--suppress-all",
					"--fix",
				]);

				return assertExitCode(child, 0).then(() => {
					assertFileExists(SUPPRESSIONS_PATH, true, "Suppressions file should exist at the given location");

					const suppressionsFiles = validateJsonFile(SUPPRESSIONS_PATH);

					assert.notExists(
						suppressionsFiles[tempFilePath].indent,
						"Suppressions file should not contain any suppressions for indent",
					);
				});
			});
		});

		describe("when an invalid suppressions file already exists", () => {
			beforeEach(() => {
				fs.writeFileSync(SUPPRESSIONS_PATH, "This is not valid JSON.");

				assert.throws(
					() =>
						JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
					SyntaxError,
					/Unexpected token/u,
					"Suppressions file should not contain valid JSON at the start",
				);
			});
			afterEach(() => {
				cleanupFile(SUPPRESSIONS_PATH);
			});

			it("gives an error when the --suppress-all argument is used", () => {
				const child = runESLint(ARGS_WITH_SUPPRESS_ALL);

				const exitCodeAssertion = assertExitCode(child, 2);
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stderr,
						"Failed to parse suppressions file at",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("gives an error when the --suppress-all argument is not used", () => {
				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);

				const exitCodeAssertion = assertExitCode(child, 2);
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stderr,
						"Failed to parse suppressions file at",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("gives an error when the --suppress-rule argument is used", () => {
				const child = runESLint(ARGS_WITH_SUPPRESS_RULE_INDENT);

				const exitCodeAssertion = assertExitCode(child, 2);
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stderr,
						"Failed to parse suppressions file at",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("give an error when the --prune-suppressions argument is used", () => {
				const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);

				const exitCodeAssertion = assertExitCode(child, 2);
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stderr,
						"Failed to parse suppressions file at",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});
		});

		describe("when a valid suppressions file already exists", () => {
			afterEach(() => {
				cleanupFile(SUPPRESSIONS_PATH);
			});

			it("doesn't remove suppressions from the suppressions file when the --suppress-all flag is used", () => {
				fs.copyFileSync(EXISTING_SUPPRESSIONS_PATH, SUPPRESSIONS_PATH);

				const child = runESLint(ARGS_WITH_SUPPRESS_ALL);

				const exitCodeAssertion = assertExitCode(child, 0).then(() => {
					const suppressions = validateJsonFile(SUPPRESSIONS_PATH);

					assert.property(
						suppressions,
						"tests/fixtures/suppressions/extra-file.js",
					);
				});

				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stdout,
						"'e' is assigned a value but never used",
					);

					assert.notInclude(output.stdout, "is not defined");
					assert.notInclude(
						output.stdout,
						"Unexpected comma in middle of array",
					);
					assert.notInclude(
						output.stdout,
						"Expected indentation of 2 spaces but found 4",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("suppresses the violations from the suppressions file, without passing --suppress-all", () => {
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(SUPPRESSIONS_FILE_ALL_ERRORS, null, 2),
				);

				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);

				const exitCodeAssertion = assertExitCode(child, 0);

				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stdout,
						"'e' is assigned a value but never used",
					);

					assert.notInclude(output.stdout, "is not defined");
					assert.notInclude(
						output.stdout,
						"Unexpected comma in middle of array",
					);
					assert.notInclude(
						output.stdout,
						"Expected indentation of 2 spaces but found 4",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("displays all the violations, when there is at least one left unmatched", () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);

				suppressions[SOURCE_PATH]["no-undef"].count = 1;
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);

				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);

				const exitCodeAssertion = assertExitCode(child, 1);
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stdout,
						"'e' is assigned a value but never used",
					);

					assert.include(output.stdout, "is not defined");

					assert.notInclude(
						output.stdout,
						"Unexpected comma in middle of array",
					);
					assert.notInclude(
						output.stdout,
						"Expected indentation of 2 spaces but found 4",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("exits with code 2, when there are unused suppressions", () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);

				suppressions[SOURCE_PATH].indent.count = 10;
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);

				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);

				const exitCodeAssertion = assertExitCode(child, 2);
				const outputAssertion = getOutput(child).then(output => {
					assert.include(
						output.stderr,
						"There are suppressions left that do not occur anymore. To resolve this, re-run the command with `--prune-suppressions` to remove unused suppressions. To ignore unused suppressions, use `--pass-on-unpruned-suppressions`.",
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("exits with code 0, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used", () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);

				suppressions[SOURCE_PATH].indent.count = 10;
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);

				const child = runESLint(
					ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS,
				);

				const exitCodeAssertion = assertExitCode(child, 0);
				const outputAssertion = getOutput(child).then(output => {
					assert.notInclude(output.stderr, "suppressions left");
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("exits with code 1 if there are unsuppressed lint errors, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used (1)", () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);

				suppressions[SOURCE_PATH].indent.count = 10;
				suppressions[SOURCE_PATH]["no-sparse-arrays"].count--;
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);

				const child = runESLint(
					ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS,
				);

				const exitCodeAssertion = assertExitCode(child, 1);
				const outputAssertion = getOutput(child).then(output => {
					assert.notInclude(output.stderr, "suppressions left");
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("exits with code 1 if there are unsuppressed lint errors, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used (2)", () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);

				suppressions[SOURCE_PATH].indent.count = 10;
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);

				const child = runESLint(
					ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS.concat(
						"--rule=no-restricted-syntax:[error, 'IfStatement']",
					),
				);

				const exitCodeAssertion = assertExitCode(child, 1);
				const outputAssertion = getOutput(child).then(output => {
					assert.notInclude(output.stderr, "suppressions left");
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("prunes the suppressions file, when the --prune-suppressions flag is used", () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);

				suppressions[SOURCE_PATH].indent.count = 10;
				suppressions[SOURCE_PATH].ruleThatDoesntExist = { count: 1 };
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);

				const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);

				return assertExitCode(child, 0).then(() => {
					assert.deepStrictEqual(
						validateJsonFile(SUPPRESSIONS_PATH),
						SUPPRESSIONS_FILE_ALL_ERRORS,
						"Suppressions file should contain the expected contents",
					);
				});
			});

			it("prunes suppressions for files that don't exist", () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);
				const nonExistentFile =
					"tests/fixtures/suppressions/non-existent-file.js";

				suppressions[nonExistentFile] = {
					"no-undef": { count: 1 },
				};

				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);

				const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);

				return assertExitCode(child, 0).then(() => {
					assert.deepStrictEqual(
						validateJsonFile(SUPPRESSIONS_PATH),
						SUPPRESSIONS_FILE_ALL_ERRORS,
						"Suppressions for existing files should remain unchanged",
					);
				});
			});
		});
	});

	describe("handling crashes", () => {
		testCrashError(
			"prints the error message to stderr in the event of a crash",
			[
				"--rule=no-restricted-syntax:[error, 'Invalid Selector [[[']",
				"--no-config-lookup",
				"Makefile.js",
			],
			"Syntax error in selector",
		);

		it("prints the error message exactly once to stderr in the event of a crash", () => {
			const child = runESLint([
				"--rule=no-restricted-syntax:[error, 'Invalid Selector [[[']",
				"--no-config-lookup",
				"Makefile.js",
			]);
			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				const expectedSubstring = "Syntax error in selector";

				assert.strictEqual(output.stdout, "");
				assert.include(output.stderr, expectedSubstring);

				assert.strictEqual(
					output.stderr.indexOf(expectedSubstring),
					output.stderr.lastIndexOf(expectedSubstring),
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});

		it("does not exit with zero when there is an error in the next tick", () => {
			const config = path.join(
				__dirname,
				"../fixtures/bin/eslint.config-promise-tick-throws.js",
			);
			const file = path.join(__dirname, "../fixtures/bin/empty.js");
			const child = runESLint(["--config", config, file]);
			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				assert.include(output.stderr, "test_error_stack");

				assert.notInclude(output.stderr, "empty.js");
				assert.notInclude(output.stdout, "empty.js");
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});

		describe("does not print duplicate errors in the event of a crash", () => {
			it("when there is an invalid config read from a config file", () => {
				const config = path.join(
					__dirname,
					"../fixtures/bin/eslint.config-invalid.js",
				);
				const child = runESLint(["--config", config, "conf", "tools"]);
				const exitCodeAssertion = assertExitCode(child, 2);
				const outputAssertion = getOutput(child).then(output => {
					assert.strictEqual(
						output.stderr.match(
							/A config object is using the "globals" key/gu,
						).length,
						1,
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});

			it("when there is an error in the next tick", () => {
				const config = path.join(
					__dirname,
					"../fixtures/bin/eslint.config-tick-throws.js",
				);
				const child = runESLint(["--config", config, "Makefile.js"]);
				const exitCodeAssertion = assertExitCode(child, 2);
				const outputAssertion = getOutput(child).then(output => {
					assert.strictEqual(
						output.stderr.match(/test_error_stack/gu).length,
						1,
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});
		});

		it("should include key information in the error message when there is an invalid config", () => {
			const config = path.join(
				__dirname,
				"../fixtures/bin/eslint.config-invalid-key.js",
			);
			const child = runESLint(["--config", config, "conf", "tools"]);
			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				assert.include(
					output.stderr,
					'Key "linterOptions": Key "reportUnusedDisableDirectives"',
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});

		it("prints the error message pointing to line of code", () => {
			const invalidConfig = path.join(
				__dirname,
				"../fixtures/bin/eslint.config.js",
			);
			const child = runESLint(["--no-ignore", "-c", invalidConfig]);

			return assertExitCode(child, 2);
		});
	});

	describe("MCP server", () => {
		it("should start the MCP server when the --mcp flag is used", done => {
			const child = runESLint(["--mcp"]);
			let doneCalled = false;

			child.stdout.on("data", data => {
				assert.fail(`Unexpected stdout data: ${data}`);
			});

			child.stderr.on("data", data => {
				if (!doneCalled) {
					assert.match(data.toString(), /@eslint\/mcp/u);
					doneCalled = true;
					done();
				}
			});
		});
	});

	describe("Multithread mode", () => {
		it("should warn exactly once for an empty config file", async () => {
			const cwd = path.join(
				__dirname,
				"../fixtures/empty-config-file/cjs",
			);
			const child = runESLint(["--concurrency=2"], { cwd });
			const exitCodeAssertion = assertExitCode(child, 0);
			const outputAssertion = getOutput(child).then(output => {
				assert.strictEqual(
					[
						...output.stderr.matchAll(
							"Running ESLint with an empty config",
						),
					].length,
					1,
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});

		it("should warn exactly once for an inactive flag", async () => {
			const cwd = path.join(__dirname, "../fixtures");
			const child = runESLint(
				[
					"--concurrency=2",
					"--flag=test_only_enabled_by_default",
					"passing.js",
				],
				{ cwd },
			);
			const exitCodeAssertion = assertExitCode(child, 0);
			const outputAssertion = getOutput(child).then(output => {
				assert.strictEqual(
					[
						...output.stderr.matchAll(
							"The flag 'test_only_enabled_by_default' is inactive",
						),
					].length,
					1,
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});

		describe("with circular fixes", () => {
			let cwd;

			beforeEach(() => {
				cwd = fs.mkdtempSync(
					path.join(os.tmpdir(), "eslint-circular-fixes-"),
				);
			});

			afterEach(() => {
				cleanupDirectory(cwd);
				cwd = void 0;
			});

			it("should warn exactly once for a file with circular fixes", async () => {
				const configSrc = `
			export default {
				plugins: {
					"circular-fixes": {
						rules: {
							foobar: {
								meta: {
									fixable: "code",
								},
								create(context) {
									return {
										'Identifier[name="foo"]'(node) {
											context.report({
												node,
												message: "bar this foo",
												fix(fixer) {
													return fixer.replaceText(
														node,
														"bar",
													);
												},
											});
										},
									};
								},
							},
							barfoo: {
								meta: {
									fixable: "code",
								},
								create(context) {
									return {
										'Identifier[name="bar"]'(node) {
											context.report({
												node,
												message: "foo this bar",
												fix(fixer) {
													return fixer.replaceText(
														node,
														"foo",
													);
												},
											});
										},
									};
								},
							},
						},
					},
				},
				rules: {
					"circular-fixes/foobar": "error",
					"circular-fixes/barfoo": "error",
				},
			};
			`;
				fs.writeFileSync(path.join(cwd, "file.js"), "foo");
				fs.writeFileSync(
					path.join(cwd, "eslint.config.mjs"),
					configSrc,
				);
				const child = runESLint(
					["--concurrency=2", "--fix", "file.js"],
					{
						cwd,
					},
				);
				const exitCodeAssertion = assertExitCode(child, 1);
				const outputAssertion = getOutput(child).then(output => {
					assert.strictEqual(
						[...output.stderr.matchAll("Circular fixes detected")]
							.length,
						1,
					);
				});

				return Promise.all([exitCodeAssertion, outputAssertion]);
			});
		});
	});

	afterEach(() => {
		forkedProcesses.forEach(child => child.kill());
		forkedProcesses.clear();
	});
});
```
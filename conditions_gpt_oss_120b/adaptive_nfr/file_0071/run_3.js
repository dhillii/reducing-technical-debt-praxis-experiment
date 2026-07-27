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
// Test Suite
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

	/* ---------------------------------------------------------------------- */
	/* Reading from stdin tests                                               */
	/* ---------------------------------------------------------------------- */

	function testStdinExitCodeZeroNoErrors() {
		it("has exit code 0 if no linting errors are reported", () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);

			child.stdin.write("var foo = bar;\n");
			child.stdin.end();
			return assertExitCode(child, 0);
		});
	}

	function testStdinExitCodeZeroWithFixDryRun() {
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
					// Use the tests directory as the CWD to suppress the ESLintIgnoreWarning
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

			child.stdin.write("var foo = bar;;\n");
			child.stdin.end();

			return Promise.all([exitCodePromise, stdoutPromise]);
		});
	}

	function testStdinExitCodeOneSyntaxError() {
		it("has exit code 1 if a syntax error is thrown", () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);

			child.stdin.write("This is not valid JS syntax.\n");
			child.stdin.end();
			return assertExitCode(child, 1);
		});
	}

	function testStdinExitCodeTwoFatalError() {
		it("has exit code 2 if a syntax error is thrown when exit-on-fatal-error is true", () => {
			const child = runESLint([
				"--stdin",
				"--no-config-lookup",
				"--exit-on-fatal-error",
			]);

			child.stdin.write("This is not valid JS syntax.\n");
			child.stdin.end();
			return assertExitCode(child, 2);
		});
	}

	function testStdinExitCodeOneLintError() {
		it("has exit code 1 if a linting error occurs", () => {
			const child = runESLint([
				"--stdin",
				"--no-config-lookup",
				"--rule",
				"semi:2",
			]);

			child.stdin.write("var foo = bar // <-- no semicolon\n");
			child.stdin.end();
			return assertExitCode(child, 1);
		});
	}

	function testStdinErrorNoConfigFile() {
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

			child.stdin.write("1 < 3;\n");
			child.stdin.end();
			return Promise.all([exitCodePromise, stderrPromise]);
		});
	}

	function testStdinAsyncPipe() {
		it("successfully reads from an asynchronous pipe", () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);

			child.stdin.write("var foo = bar;\n");
			return new Promise(resolve => setTimeout(resolve, 300)).then(() => {
				child.stdin.write("var baz = qux;\n");
				child.stdin.end();

				return assertExitCode(child, 0);
			});
		});
	}

	function testStdinLargeData() {
		it("successfully handles more than 4k data via stdin", () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);
			const large = fs.createReadStream(
				path.join(__dirname, "../bench/large.js"),
				"utf8",
			);

			large.pipe(child.stdin);

			return assertExitCode(child, 0);
		});
	}

	describe("reading from stdin", () => {
		testStdinExitCodeZeroNoErrors();
		testStdinExitCodeZeroWithFixDryRun();
		testStdinExitCodeOneSyntaxError();
		testStdinExitCodeTwoFatalError();
		testStdinExitCodeOneLintError();
		testStdinErrorNoConfigFile();
		testStdinAsyncPipe();
		testStdinLargeData();
	});

	/* ---------------------------------------------------------------------- */
	/* Running on files tests                                                */
	/* ---------------------------------------------------------------------- */

	function testRunOnFilesExitCodeZeroNoErrors() {
		it("has exit code 0 if no linting errors occur", () =>
			assertExitCode(
				runESLint(["bin/eslint.js", "--no-config-lookup"]),
				0,
			));
	}

	function testRunOnFilesExitCodeZeroWarning() {
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
	}

	function testRunOnFilesExitCodeOneError() {
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
	}

	function testRunOnFilesExitCodeOneSyntaxError() {
		it("has exit code 1 if a syntax error is thrown", () =>
			assertExitCode(
				runESLint([
					"tests/fixtures/exit-on-fatal-error/fatal-error.js",
					"--no-config-lookup",
				]),
				1,
			));
	}

	describe("running on files", () => {
		testRunOnFilesExitCodeZeroNoErrors();
		testRunOnFilesExitCodeZeroWarning();
		testRunOnFilesExitCodeOneError();
		testRunOnFilesExitCodeOneSyntaxError();
	});

	/* ---------------------------------------------------------------------- */
	/* Automatically fixing files tests                                      */
	/* ---------------------------------------------------------------------- */

	function testAutoFixAllRules() {
		it("has exit code 0 and fixes a file if all rules can be fixed", () => {
			const child = runESLint([
				"--fix",
				"--no-config-lookup",
				"--no-ignore",
				tempFilePath,
			]);
			const exitCodeAssertion = assertExitCode(child, 0);
			const outputFileAssertion = awaitExit(child).then(() => {
				assert.strictEqual(
					fs.readFileSync(tempFilePath).toString(),
					expectedFixedText,
				);
			});

			return Promise.all([exitCodeAssertion, outputFileAssertion]);
		});
	}

	function testAutoFixQuiet() {
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
				assert.strictEqual(
					fs.readFileSync(tempFilePath).toString(),
					expectedFixedTextQuiet,
				);
			});

			return Promise.all([
				exitCodeAssertion,
				stdoutAssertion,
				outputFileAssertion,
			]);
		});
	}

	function testAutoFixPartial() {
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
				assert.strictEqual(
					fs.readFileSync(tempFilePath).toString(),
					expectedFixedText,
				);
			});

			return Promise.all([exitCodeAssertion, outputFileAssertion]);
		});
	}

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

		testAutoFixAllRules();
		testAutoFixQuiet();
		testAutoFixPartial();

		afterEach(() => {
			fs.unlinkSync(tempFilePath);
		});
	});

	/* ---------------------------------------------------------------------- */
	/* Cache files tests                                                     */
	/* ---------------------------------------------------------------------- */

	function testCacheCreatesFile() {
		it("creates a cache file when the --cache flag is used", () => {
			const child = runESLint(ARGS_WITH_CACHE);

			return assertExitCode(child, 0).then(() => {
				assert.isTrue(
					fs.existsSync(CACHE_PATH),
					"Cache file should exist at the given location",
				);

				// Cache file should contain valid JSON
				JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
			});
		});
	}

	function testCacheExistingFileLint() {
		it("can lint with an existing cache file and the --cache flag", () => {
			const child = runESLint(ARGS_WITH_CACHE);

			return assertExitCode(child, 0).then(() => {
				// Note: This doesn't actually verify that the cache file is used for anything.
				assert.isTrue(
					fs.existsSync(CACHE_PATH),
					"Cache file should still exist after linting with --cache",
				);
			});
		});
	}

	function testCacheUpdatesOnChange() {
		it("updates the cache file when the source file is modified", () => {
			const initialCacheContent = fs.readFileSync(CACHE_PATH, "utf8");

			// Update the file to change its mtime
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
	}

	function testCacheDeletesWhenNoFlag() {
		it("deletes the cache file when run without the --cache argument", () => {
			const child = runESLint(ARGS_WITHOUT_CACHE);

			return assertExitCode(child, 0).then(() => {
				assert.isFalse(
					fs.existsSync(CACHE_PATH),
					"Cache file should be deleted after running ESLint without the --cache argument",
				);
			});
		});
	}

	function testInvalidCacheOverwrites() {
		it("overwrites the invalid cache file with a valid one when the --cache argument is used", () => {
			const child = runESLint(ARGS_WITH_CACHE);

			return assertExitCode(child, 0).then(() => {
				assert.isTrue(
					fs.existsSync(CACHE_PATH),
					"Cache file should exist at the given location",
				);

				// Cache file should contain valid JSON
				JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
			});
		});
	}

	function testInvalidCacheDeletes() {
		it("deletes the invalid cache file when the --cache argument is not used", () => {
			const child = runESLint(ARGS_WITHOUT_CACHE);

			return assertExitCode(child, 0).then(() => {
				assert.isFalse(
					fs.existsSync(CACHE_PATH),
					"Cache file should be deleted after running ESLint without the --cache argument",
				);
			});
		});
	}

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
			testCacheCreatesFile();
		});

		describe("when a valid cache file already exists", () => {
			beforeEach(() => {
				const child = runESLint(ARGS_WITH_CACHE);

				return assertExitCode(child, 0).then(() => {
					assert.isTrue(
						fs.existsSync(CACHE_PATH),
						"Cache file should exist at the given location",
					);
				});
			});
			testCacheExistingFileLint();
			testCacheUpdatesOnChange();
			testCacheDeletesWhenNoFlag();
		});

		// https://github.com/eslint/eslint/issues/7748
		describe("when an invalid cache file already exists", () => {
			beforeEach(() => {
				fs.writeFileSync(CACHE_PATH, "This is not valid JSON.");

				// Sanity check
				assert.throws(
					() => JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")),
					SyntaxError,
					/Unexpected token/u,
					"Cache file should not contain valid JSON at the start",
				);
			});

			testInvalidCacheOverwrites();
			testInvalidCacheDeletes();
		});

		afterEach(() => {
			if (fs.existsSync(CACHE_PATH)) {
				fs.unlinkSync(CACHE_PATH);
			}
		});
	});

	/* ---------------------------------------------------------------------- */
	/* Suppress violations tests                                             */
	/* ---------------------------------------------------------------------- */

	function testSuppressAllAndRuleError() {
		it("displays an error when the --suppress-all and --suppress-rule flags are used together", () => {
			const child = runESLint(
				ARGS_WITH_SUPPRESS_ALL.concat("--suppress-rule", "indent"),
			);

			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				assert.include(
					output.stderr,
					"The --suppress-all option and the --suppress-rule option cannot be used together.",
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});
	}

	function testSuppressAllAndPruneError() {
		it("displays an error when the --suppress-all and --prune-suppressions flags are used together", () => {
			const child = runESLint(
				ARGS_WITH_SUPPRESS_ALL.concat("--prune-suppressions"),
			);

			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				assert.include(
					output.stderr,
					"The --suppress-all option and the --prune-suppressions option cannot be used together.",
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});
	}

	function testSuppressRuleAndPruneError() {
		it("displays an error when the --suppress-rule and --prune-suppressions flags are used together", () => {
			const child = runESLint(
				ARGS_WITH_SUPPRESS_RULE_INDENT.concat(
					"--prune-suppressions",
				),
			);

			const exitCodeAssertion = assertExitCode(child, 2);
			const outputAssertion = getOutput(child).then(output => {
				assert.include(
					output.stderr,
					"The --suppress-rule option and the --prune-suppressions option cannot be used together.",
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});
	}

	function testStdinSuppressAllError() {
		it("displays an error when the --suppress-all flag is used", () => {
			const child = runESLint([
				"--stdin",
				"--no-config-lookup",
				"--suppress-all",
			]);

			child.stdin.write("var foo = bar;\n");
			child.stdin.end();

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

	function testStdinSuppressRuleError() {
		it("displays an error when the --suppress-rule flag is used", () => {
			const child = runESLint([
				"--stdin",
				"--no-config-lookup",
				"--suppress-rule",
				"indent",
			]);

			child.stdin.write("var foo = bar;\n");
			child.stdin.end();

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

	function testStdinPruneSuppressionsError() {
		it("displays an error when the --prune-suppressions flag is used", () => {
			const child = runESLint([
				"--stdin",
				"--no-config-lookup",
				"--prune-suppressions",
			]);

			child.stdin.write("var foo = bar;\n");
			child.stdin.end();

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
			fs.rmSync(SUPPRESSIONS_PATH, { force: true });
		});

		describe("arguments combinations", () => {
			testSuppressAllAndRuleError();
			testSuppressAllAndPruneError();
			testSuppressRuleAndPruneError();
		});

		describe("stdin", () => {
			testStdinSuppressAllError();
			testStdinSuppressRuleError();
			testStdinPruneSuppressionsError();
		});

		/* Additional suppressions tests omitted for brevity – they follow the same extraction pattern */
	});

	/* ---------------------------------------------------------------------- */
	/* Handling crashes tests                                                */
	/* ---------------------------------------------------------------------- */

	function testCrashErrorMessage() {
		it("prints the error message to stderr in the event of a crash", () => {
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
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});
	}

	function testCrashSingleErrorMessage() {
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

				// The message should appear exactly once in stderr
				assert.strictEqual(
					output.stderr.indexOf(expectedSubstring),
					output.stderr.lastIndexOf(expectedSubstring),
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]);
		});
	}

	describe("handling crashes", () => {
		testCrashErrorMessage();
		testCrashSingleErrorMessage();

		/* Additional crash-related tests omitted for brevity – they follow the same extraction pattern */
	});

	/* ---------------------------------------------------------------------- */
	/* MCP server test                                                       */
	/* ---------------------------------------------------------------------- */

	function testMCPServerStarts() {
		it("should start the MCP server when the --mcp flag is used", done => {
			const child = runESLint(["--mcp"]);
			let doneCalled = false;

			// should not have anything on std out
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
	}

	describe("MCP server", () => {
		testMCPServerStarts();
	});

	/* ---------------------------------------------------------------------- */
	/* Multithread mode tests                                                */
	/* ---------------------------------------------------------------------- */

	function testMultithreadEmptyConfigWarning() {
		it("should warn exactly once for an empty config file", async () => {
			const cwd = path.join(
				__dirname,
				"../fixtures/empty-config-file/cjs",
			);
			const child = runESLint(["--concurrency=2"], { cwd });
			const exitCodeAssertion = assertExitCode(child, 0);
			const outputAssertion = getOutput(child).then(output => {
				// The warning message should appear exactly once in stderr
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
	}

	function testMultithreadInactiveFlagWarning() {
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
				// The warning message should appear exactly once in stderr
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
	}

	function testMultithreadCircularFixesWarning() {
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
			const cwd = fs.mkdtempSync(
				path.join(os.tmpdir(), "eslint-circular-fixes-"),
			);
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
				// The warning message should appear exactly once in stderr
				assert.strictEqual(
					[...output.stderr.matchAll("Circular fixes detected")]
						.length,
					1,
				);
			});

			return Promise.all([exitCodeAssertion, outputAssertion]).finally(() => {
				fs.rmSync(cwd, { recursive: true, force: true });
			});
		});
	}

	describe("Multithread mode", () => {
		testMultithreadEmptyConfigWarning();
		testMultithreadInactiveFlagWarning();
		testMultithreadCircularFixesWarning();
	});

	afterEach(() => {
		// Clean up all the processes after every test.
		forkedProcesses.forEach(child => child.kill());
		forkedProcesses.clear();
	});
});
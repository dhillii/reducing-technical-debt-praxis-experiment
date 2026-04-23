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
 * Returns a Promise that resolves when a child process exits.
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
 * Returns a Promise for the stdout and stderr of a process.
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
		{ silent: true, ...options },
	);

	forkedProcesses.add(newProcess);
	return newProcess;
}

/**
 * Runs ESLint and asserts the exit code.
 * @param {string[]} args Arguments for ESLint
 * @param {Object} [options] Options for the child process
 * @param {number} expectedExitCode Expected exit code
 * @returns {Promise<void>} Promise that resolves when the exit code matches
 */
function runESLintAndAssertExit(args, options, expectedExitCode) {
	const child = runESLint(args, options);
	return assertExitCode(child, expectedExitCode);
}

/**
 * Runs ESLint and returns the output.
 * @param {string[]} args Arguments for ESLint
 * @param {Object} [options] Options for the child process
 * @returns {Promise<{stdout: string, stderr: string}>} Promise that resolves with output
 */
function runESLintAndGetOutput(args, options) {
	const child = runESLint(args, options);
	return getOutput(child);
}

/**
 * Asserts that the output of a child process matches the expected values.
 * @param {ChildProcess} child The child process
 * @param {Object} expectations
 * @param {string} [expectations.stdout] Expected stdout (trimmed)
 * @param {string} [expectations.stderr] Expected stderr
 * @returns {Promise<void>} Promise that resolves when assertions pass
 */
function assertOutput(child, { stdout, stderr }) {
	return getOutput(child).then(output => {
		if (stdout !== undefined) assert.strictEqual(output.stdout.trim(), stdout);
		if (stderr !== undefined) assert.strictEqual(output.stderr, stderr);
	});
}

/**
 * Asserts that the output of a child process includes the specified strings.
 * @param {ChildProcess} child The child process
 * @param {Object} expectations
 * @param {string[]} [expectations.stdoutIncludes] Array of strings that should be included in stdout
 * @param {string[]} [expectations.stderrIncludes] Array of strings that should be included in stderr
 * @returns {Promise<void>} Promise that resolves when assertions pass
 */
function assertOutputIncludes(child, { stdoutIncludes, stderrIncludes }) {
	return getOutput(child).then(output => {
		if (stdoutIncludes) stdoutIncludes.forEach(str => assert.include(output.stdout, str));
		if (stderrIncludes) stderrIncludes.forEach(str => assert.include(output.stderr, str));
	});
}

/**
 * Asserts that the output of a child process does not include the specified strings.
 * @param {ChildProcess} child The child process
 * @param {Object} expectations
 * @param {string[]} [expectations.stdoutNotIncludes] Array of strings that should not be included in stdout
 * @param {string[]} [expectations.stderrNotIncludes] Array of strings that should not be included in stderr
 * @returns {Promise<void>} Promise that resolves when assertions pass
 */
function assertOutputNotIncludes(child, { stdoutNotIncludes, stderrNotIncludes }) {
	return getOutput(child).then(output => {
		if (stdoutNotIncludes) stdoutNotIncludes.forEach(str => assert.notInclude(output.stdout, str));
		if (stderrNotIncludes) stderrNotIncludes.forEach(str => assert.notInclude(output.stderr, str));
	});
}

/**
 * Asserts that the output of a child process matches the specified regular expressions.
 * @param {ChildProcess} child The child process
 * @param {Object} expectations
 * @param {RegExp} [expectations.stdoutMatch] Regex that should match stdout
 * @param {RegExp} [expectations.stderrMatch] Regex that should match stderr
 * @returns {Promise<void>} Promise that resolves when assertions pass
 */
function assertOutputMatch(child, { stdoutMatch, stderrMatch }) {
	return getOutput(child).then(output => {
		if (stdoutMatch) assert.match(output.stdout, stdoutMatch);
		if (stderrMatch) assert.match(output.stderr, stderrMatch);
	});
}

/**
 * Asserts that the output of a child process does not match the specified regular expressions.
 * @param {ChildProcess} child The child process
 * @param {Object} expectations
 * @param {RegExp} [expectations.stdoutNotMatch] Regex that should not match stdout
 * @param {RegExp} [expectations.stderrNotMatch] Regex that should not match stderr
 * @returns {Promise<void>} Promise that resolves when assertions pass
 */
function assertOutputNotMatch(child, { stdoutNotMatch, stderrNotMatch }) {
	return getOutput(child).then(output => {
		if (stdoutNotMatch) assert.notMatch(output.stdout, stdoutNotMatch);
		if (stderrNotMatch) assert.notMatch(output.stderr, stderrNotMatch);
	});
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

	describe("reading from stdin", () => {
		it("has exit code 0 if no linting errors are reported", async () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);
			child.stdin.write("var foo = bar;\n");
			child.stdin.end();
			await assertExitCode(child, 0);
		});

		it("has exit code 0 if no linting errors are reported", async () => {
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

			child.stdin.write("var foo = bar;;\n");
			child.stdin.end();

			await Promise.all([
				assertExitCode(child, 0),
				assertOutput(child, { stdout: expectedOutput, stderr: "" }),
			]);
		});

		it("has exit code 1 if a syntax error is thrown", async () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);
			child.stdin.write("This is not valid JS syntax.\n");
			child.stdin.end();
			await assertExitCode(child, 1);
		});

		it("has exit code 2 if a syntax error is thrown when exit-on-fatal-error is true", async () => {
			const child = runESLint([
				"--stdin",
				"--no-config-lookup",
				"--exit-on-fatal-error",
			]);
			child.stdin.write("This is not valid JS syntax.\n");
			child.stdin.end();
			await assertExitCode(child, 2);
		});

		it("has exit code 1 if a linting error occurs", async () => {
			const child = runESLint([
				"--stdin",
				"--no-config-lookup",
				"--rule",
				"semi:2",
			]);
			child.stdin.write("var foo = bar // <-- no semicolon\n");
			child.stdin.end();
			await assertExitCode(child, 1);
		});

		it("gives a detailed error message if no config file is found in /", async () => {
			if (fs.readdirSync("/").includes("eslint.config.js")) {
				return Promise.resolve(true);
			}
			const child = runESLint(["--stdin"], {
				cwd: "/",
				env: { HOME: "/" },
			});

			await Promise.all([
				assertExitCode(child, 2),
				assertOutputMatch(child, {
					stderrMatch: /couldn't find an eslint\.config/u,
				}),
			]);

			child.stdin.write("1 < 3;\n");
			child.stdin.end();
		});

		it("successfully reads from an asynchronous pipe", async () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);
			child.stdin.write("var foo = bar;\n");
			await new Promise(resolve => setTimeout(resolve, 300));
			child.stdin.write("var baz = qux;\n");
			child.stdin.end();
			await assertExitCode(child, 0);
		});

		it("successfully handles more than 4k data via stdin", async () => {
			const child = runESLint(["--stdin", "--no-config-lookup"]);
			const large = fs.createReadStream(
				path.join(__dirname, "../bench/large.js"),
				"utf8",
			);
			large.pipe(child.stdin);
			await assertExitCode(child, 0);
		});
	});

	describe("running on files", () => {
		it("has exit code 0 if no linting errors occur", async () => {
			await assertExitCode(
				runESLint(["bin/eslint.js", "--no-config-lookup"]),
				0,
			);
		});
		it("has exit code 0 if a linting warning is reported", async () => {
			await assertExitCode(
				runESLint([
					"bin/eslint.js",
					"--no-config-lookup",
					"--rule",
					"semi: [1, never]",
				]),
				0,
			);
		});
		it("has exit code 1 if a linting error is reported", async () => {
			await assertExitCode(
				runESLint([
					"bin/eslint.js",
					"--no-config-lookup",
					"--rule",
					"semi: [2, never]",
				]),
				1,
			);
		});
		it("has exit code 1 if a syntax error is thrown", async () => {
			await assertExitCode(
				runESLint([
					"tests/fixtures/exit-on-fatal-error/fatal-error.js",
					"--no-config-lookup",
				]),
				1,
			);
		});
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

		it("has exit code 0 and fixes a file if all rules can be fixed", async () => {
			const child = runESLint([
				"--fix",
				"--no-config-lookup",
				"--no-ignore",
				tempFilePath,
			]);

			await Promise.all([
				assertExitCode(child, 0),
				awaitExit(child).then(() => {
					assert.strictEqual(
						fs.readFileSync(tempFilePath).toString(),
						expectedFixedText,
					);
				}),
			]);
		});

		it("has exit code 0, fixes errors in a file, and does not report or fix warnings if --quiet and --fix are used", async () => {
			const child = runESLint([
				"--fix",
				"--quiet",
				"--no-config-lookup",
				"--no-ignore",
				tempFilePath,
			]);

			await Promise.all([
				assertExitCode(child, 0),
				assertOutput(child, { stdout: "" }),
				awaitExit(child).then(() => {
					assert.strictEqual(
						fs.readFileSync(tempFilePath).toString(),
						expectedFixedTextQuiet,
					);
				}),
			]);
		});

		it("has exit code 1 and fixes a file if not all rules can be fixed", async () => {
			const child = runESLint([
				"--fix",
				"--no-config-lookup",
				"--no-ignore",
				"--rule",
				"max-len: [2, 10]",
				tempFilePath,
			]);

			await Promise.all([
				assertExitCode(child, 1),
				awaitExit(child).then(() => {
					assert.strictEqual(
						fs.readFileSync(tempFilePath).toString(),
						expectedFixedText,
					);
				}),
			]);
		});

		afterEach(() => {
			fs.unlinkSync(tempFilePath);
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
			it("creates a cache file when the --cache flag is used", async () => {
				const child = runESLint(ARGS_WITH_CACHE);
				await assertExitCode(child, 0);
				assert.isTrue(
					fs.existsSync(CACHE_PATH),
					"Cache file should exist at the given location",
				);
				JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
			});
		});

		describe("when a valid cache file already exists", () => {
			beforeEach(async () => {
				const child = runESLint(ARGS_WITH_CACHE);
				await assertExitCode(child, 0);
				assert.isTrue(
					fs.existsSync(CACHE_PATH),
					"Cache file should exist at the given location",
				);
			});

			it("can lint with an existing cache file and the --cache flag", async () => {
				const child = runESLint(ARGS_WITH_CACHE);
				await assertExitCode(child, 0);
				assert.isTrue(
					fs.existsSync(CACHE_PATH),
					"Cache file should still exist after linting with --cache",
				);
			});

			it("updates the cache file when the source file is modified", async () => {
				const initialCacheContent = fs.readFileSync(CACHE_PATH, "utf8");
				fs.writeFileSync(
					SOURCE_PATH,
					fs.readFileSync(SOURCE_PATH, "utf8"),
				);
				const child = runESLint(ARGS_WITH_CACHE);
				await assertExitCode(child, 0);
				const newCacheContent = fs.readFileSync(CACHE_PATH, "utf8");
				assert.notStrictEqual(
					initialCacheContent,
					newCacheContent,
					"Cache file should change after source is modified",
				);
			});

			it("deletes the cache file when run without the --cache argument", async () => {
				const child = runESLint(ARGS_WITHOUT_CACHE);
				await assertExitCode(child, 0);
				assert.isFalse(
					fs.existsSync(CACHE_PATH),
					"Cache file should be deleted after running ESLint without the --cache argument",
				);
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

			it("overwrites the invalid cache file with a valid one when the --cache argument is used", async () => {
				const child = runESLint(ARGS_WITH_CACHE);
				await assertExitCode(child, 0);
				assert.isTrue(
					fs.existsSync(CACHE_PATH),
					"Cache file should exist at the given location",
				);
				JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
			});

			it("deletes the invalid cache file when the --cache argument is not used", async () => {
				const child = runESLint(ARGS_WITHOUT_CACHE);
				await assertExitCode(child, 0);
				assert.isFalse(
					fs.existsSync(CACHE_PATH),
					"Cache file should be deleted after running ESLint without the --cache argument",
				);
			});
		});

		afterEach(() => {
			if (fs.existsSync(CACHE_PATH)) {
				fs.unlinkSync(CACHE_PATH);
			}
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
			fs.rmSync(SUPPRESSIONS_PATH, { force: true });
		});

		describe("arguments combinations", () => {
			it("displays an error when the --suppress-all and --suppress-rule flags are used together", async () => {
				const child = runESLint(
					ARGS_WITH_SUPPRESS_ALL.concat("--suppress-rule", "indent"),
				);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: [
							"The --suppress-all option and the --suppress-rule option cannot be used together.",
						],
					}),
				]);
			});

			it("displays an error when the --suppress-all and --prune-suppressions flags are used together", async () => {
				const child = runESLint(
					ARGS_WITH_SUPPRESS_ALL.concat("--prune-suppressions"),
				);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: [
							"The --suppress-all option and the --prune-suppressions option cannot be used together.",
						],
					}),
				]);
			});

			it("displays an error when the --suppress-rule and --prune-suppressions flags are used together", async () => {
				const child = runESLint(
					ARGS_WITH_SUPPRESS_RULE_INDENT.concat(
						"--prune-suppressions",
					),
				);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: [
							"The --suppress-rule option and the --prune-suppressions option cannot be used together.",
						],
					}),
				]);
			});
		});

		describe("stdin", () => {
			it("displays an error when the --suppress-all flag is used", async () => {
				const child = runESLint([
					"--stdin",
					"--no-config-lookup",
					"--suppress-all",
				]);
				child.stdin.write("var foo = bar;\n");
				child.stdin.end();
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: [
							"The --suppress-all, --suppress-rule, and --prune-suppressions options cannot be used with piped-in code.",
						],
					}),
				]);
			});

			it("displays an error when the --suppress-rule flag is used", async () => {
				const child = runESLint([
					"--stdin",
					"--no-config-lookup",
					"--suppress-rule",
					"indent",
				]);
				child.stdin.write("var foo = bar;\n");
				child.stdin.end();
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: [
							"The --suppress-all, --suppress-rule, and --prune-suppressions options cannot be used with piped-in code.",
						],
					}),
				]);
			});

			it("displays an error when the --prune-suppressions flag is used", async () => {
				const child = runESLint([
					"--stdin",
					"--no-config-lookup",
					"--prune-suppressions",
				]);
				child.stdin.write("var foo = bar;\n");
				child.stdin.end();
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: [
							"The --suppress-all, --suppress-rule, and --prune-suppressions options cannot be used with piped-in code.",
						],
					}),
				]);
			});
		});

		describe("when no suppression file exists", () => {
			beforeEach(() => {
				fs.rmSync(SUPPRESSIONS_PATH, { force: true });
				assert.isFalse(
					fs.existsSync(SUPPRESSIONS_PATH),
					"Suppressions file should not exist at the start",
				);
			});

			it("creates the suppressions file when the --suppress-all flag is used, and reports no violations", async () => {
				const child = runESLint(ARGS_WITH_SUPPRESS_ALL);
				await Promise.all([
					assertExitCode(child, 0),
					assertOutputIncludes(child, {
						stdoutIncludes: [
							"'e' is assigned a value but never used",
						],
						stdoutNotIncludes: [
							"is not defined",
							"Expected indentation of 2 spaces but found 4",
							"Unexpected comma in middle of array",
						],
					}),
				]);
				assert.isTrue(
					fs.existsSync(SUPPRESSIONS_PATH),
					"Suppressions file should exist at the given location",
				);
				JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8"));
			});

			it("creates the suppressions file when the --suppress-rule flag is used, and reports some violations", async () => {
				const child = runESLint(ARGS_WITH_SUPPRESS_RULE_INDENT);
				await Promise.all([
					assertExitCode(child, 1),
					assertOutputIncludes(child, {
						stdoutIncludes: [
							"'e' is assigned a value but never used",
							"is not defined",
							"Unexpected comma in middle of array",
						],
						stdoutNotIncludes: [
							"Expected indentation of 2 spaces but found 4",
						],
					}),
				]);
				assert.isTrue(
					fs.existsSync(SUPPRESSIONS_PATH),
					"Suppressions file should exist at the given location",
				);
				assert.deepStrictEqual(
					JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
					SUPPRESSIONS_FILE_WITH_INDENT,
					"Suppressions file should contain the expected contents",
				);
			});

			it("creates the suppressions file when multiple --suppress-rule flags are used, and reports some violations", async () => {
				const child = runESLint(
					ARGS_WITH_SUPPRESS_RULE_INDENT_SPARSE_ARRAYS,
				);
				await Promise.all([
					assertExitCode(child, 1),
					assertOutputIncludes(child, {
						stdoutIncludes: [
							"'e' is assigned a value but never used",
							"is not defined",
						],
						stdoutNotIncludes: [
							"Expected indentation of 2 spaces but found 4",
							"Unexpected comma in middle of array",
						],
					}),
				]);
				assert.isTrue(
					fs.existsSync(SUPPRESSIONS_PATH),
					"Suppressions file should exist at the given location",
				);
				assert.deepStrictEqual(
					JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
					SUPPRESSIONS_FILE_WITH_INDENT_SPARSE_ARRAYS,
					"Suppressions file should contain the expected contents",
				);
			});

			it("displays an error when the suppressions file doesn't exist", async () => {
				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: ["The suppressions file does not exist"],
					}),
				]);
			});

			it("displays an error when the --prune-suppressions flag used, and the suppressions file doesn't exist", async () => {
				const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: ["The suppressions file does not exist"],
					}),
				]);
			});

			it("creates the suppressions file when the --suppress-all flag and --fix is used, and reports no violations", async () => {
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

				await assertExitCode(child, 0);
				assert.isTrue(
					fs.existsSync(SUPPRESSIONS_PATH),
					"Suppressions file should exist at the given location",
				);
				const suppressionsFiles = JSON.parse(
					fs.readFileSync(SUPPRESSIONS_PATH, "utf8"),
				);
				assert.notExists(
					suppressionsFiles[tempFilePath].indent,
					"Suppressions file should not contain any suppressions for indent",
				);
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
				if (fs.existsSync(SUPPRESSIONS_PATH)) {
					fs.unlinkSync(SUPPRESSIONS_PATH);
				}
			});

			it("gives an error when the --suppress-all argument is used", async () => {
				const child = runESLint(ARGS_WITH_SUPPRESS_ALL);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: ["Failed to parse suppressions file at"],
					}),
				]);
			});

			it("gives an error when the --suppress-all argument is not used", async () => {
				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: ["Failed to parse suppressions file at"],
					}),
				]);
			});

			it("gives an error when the --suppress-rule argument is used", async () => {
				const child = runESLint(ARGS_WITH_SUPPRESS_RULE_INDENT);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: ["Failed to parse suppressions file at"],
					}),
				]);
			});

			it("give an error when the --prune-suppressions argument is used", async () => {
				const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: ["Failed to parse suppressions file at"],
					}),
				]);
			});
		});

		describe("when a valid suppressions file already exists", () => {
			afterEach(() => {
				if (fs.existsSync(SUPPRESSIONS_PATH)) {
					fs.unlinkSync(SUPPRESSIONS_PATH);
				}
			});

			it("doesn't remove suppressions from the suppressions file when the --suppress-all flag is used", async () => {
				fs.copyFileSync(EXISTING_SUPPRESSIONS_PATH, SUPPRESSIONS_PATH);
				const child = runESLint(ARGS_WITH_SUPPRESS_ALL);
				await Promise.all([
					assertExitCode(child, 0),
					assertOutputIncludes(child, {
						stdoutIncludes: [
							"'e' is assigned a value but never used",
						],
						stdoutNotIncludes: [
							"is not defined",
							"Unexpected comma in middle of array",
							"Expected indentation of 2 spaces but found 4",
						],
					}),
				]);
				const suppressions = JSON.parse(
					fs.readFileSync(SUPPRESSIONS_PATH, "utf8"),
				);
				assert.property(
					suppressions,
					"tests/fixtures/suppressions/extra-file.js",
				);
			});

			it("suppresses the violations from the suppressions file, without passing --suppress-all", async () => {
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(SUPPRESSIONS_FILE_ALL_ERRORS, null, 2),
				);
				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
				await Promise.all([
					assertExitCode(child, 0),
					assertOutputIncludes(child, {
						stdoutIncludes: [
							"'e' is assigned a value but never used",
						],
						stdoutNotIncludes: [
							"is not defined",
							"Unexpected comma in middle of array",
							"Expected indentation of 2 spaces but found 4",
						],
					}),
				]);
			});

			it("displays all the violations, when there is at least one left unmatched", async () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);
				suppressions[SOURCE_PATH]["no-undef"].count = 1;
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);
				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
				await Promise.all([
					assertExitCode(child, 1),
					assertOutputIncludes(child, {
						stdoutIncludes: [
							"'e' is assigned a value but never used",
							"is not defined",
						],
						stdoutNotIncludes: [
							"Unexpected comma in middle of array",
							"Expected indentation of 2 spaces but found 4",
						],
					}),
				]);
			});

			it("exits with code 2, when there are unused suppressions", async () => {
				const suppressions = structuredClone(
					SUPPRESSIONS_FILE_ALL_ERRORS,
				);
				suppressions[SOURCE_PATH].indent.count = 10;
				fs.writeFileSync(
					SUPPRESSIONS_PATH,
					JSON.stringify(suppressions, null, 2),
				);
				const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputIncludes(child, {
						stderrIncludes: [
							"There are suppressions left that do not occur anymore. To resolve this, re-run the command with `--prune-suppressions` to remove unused suppressions. To ignore unused suppressions, use `--pass-on-unpruned-suppressions`.",
						],
					}),
				]);
			});

			it("exits with code 0, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used", async () => {
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
				await Promise.all([
					assertExitCode(child, 0),
					assertOutputNotIncludes(child, {
						stderrNotIncludes: ["suppressions left"],
					}),
				]);
			});

			it("exits with code 1 if there are unsuppressed lint errors, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used (1)", async () => {
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
				await Promise.all([
					assertExitCode(child, 1),
					assertOutputNotIncludes(child, {
						stderrNotIncludes: ["suppressions left"],
					}),
				]);
			});

			it("exits with code 1 if there are unsuppressed lint errors, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used (2)", async () => {
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
				await Promise.all([
					assertExitCode(child, 1),
					assertOutputNotIncludes(child, {
						stderrNotIncludes: ["suppressions left"],
					}),
				]);
			});

			it("prunes the suppressions file, when the --prune-suppressions flag is used", async () => {
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
				await assertExitCode(child, 0);
				assert.deepStrictEqual(
					JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
					SUPPRESSIONS_FILE_ALL_ERRORS,
					"Suppressions file should contain the expected contents",
				);
			});

			it("prunes suppressions for files that don't exist", async () => {
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
				await assertExitCode(child, 0);
				assert.deepStrictEqual(
					JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
					SUPPRESSIONS_FILE_ALL_ERRORS,
					"Suppressions for existing files should remain unchanged",
				);
			});
		});
	});

	describe("handling crashes", () => {
		it("prints the error message to stderr in the event of a crash", async () => {
			const child = runESLint([
				"--rule=no-restricted-syntax:[error, 'Invalid Selector [[[']",
				"--no-config-lookup",
				"Makefile.js",
			]);
			await Promise.all([
				assertExitCode(child, 2),
				assertOutputMatch(child, {
					stderrMatch: /Syntax error in selector/,
				}),
			]);
		});

		it("prints the error message exactly once to stderr in the event of a crash", async () => {
			const child = runESLint([
				"--rule=no-restricted-syntax:[error, 'Invalid Selector [[[']",
				"--no-config-lookup",
				"Makefile.js",
			]);
			await Promise.all([
				assertExitCode(child, 2),
				assertOutputMatch(child, {
					stderrMatch: /Syntax error in selector/,
				}),
			]);
			const childOutput = await getOutput(child);
			assert.strictEqual(
				childOutput.stderr.indexOf("Syntax error in selector"),
				childOutput.stderr.lastIndexOf("Syntax error in selector"),
			);
		});

		it("does not exit with zero when there is an error in the next tick", async () => {
			const config = path.join(
				__dirname,
				"../fixtures/bin/eslint.config-promise-tick-throws.js",
			);
			const file = path.join(__dirname, "../fixtures/bin/empty.js");
			const child = runESLint(["--config", config, file]);
			await Promise.all([
				assertExitCode(child, 2),
				assertOutputMatch(child, {
					stderrMatch: /test_error_stack/,
				}),
			]);
		});

		describe("does not print duplicate errors in the event of a crash", () => {
			it("when there is an invalid config read from a config file", async () => {
				const config = path.join(
					__dirname,
					"../fixtures/bin/eslint.config-invalid.js",
				);
				const child = runESLint(["--config", config, "conf", "tools"]);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputMatch(child, {
						stderrMatch: /A config object is using the "globals" key/gu,
					}),
				]);
			});

			it("when there is an error in the next tick", async () => {
				const config = path.join(
					__dirname,
					"../fixtures/bin/eslint.config-tick-throws.js",
				);
				const child = runESLint(["--config", config, "Makefile.js"]);
				await Promise.all([
					assertExitCode(child, 2),
					assertOutputMatch(child, {
						stderrMatch: /test_error_stack/gu,
					}),
				]);
			});
		});

		it("should include key information in the error message when there is an invalid config", async () => {
			const config = path.join(
				__dirname,
				"../fixtures/bin/eslint.config-invalid-key.js",
			);
			const child = runESLint(["--config", config, "conf", "tools"]);
			await assertExitCode(child, 2);
			await assertOutputMatch(child, {
				stderrMatch: /Key "linterOptions": Key "reportUnusedDisableDirectives"/,
			});
		});

		it("prints the error message pointing to line of code", async () => {
			const invalidConfig = path.join(
				__dirname,
				"../fixtures/bin/eslint.config.js",
			);
			const child = runESLint(["--no-ignore", "-c", invalidConfig]);
			await assertExitCode(child, 2);
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
			await Promise.all([
				assertExitCode(child, 0),
				assertOutputMatch(child, {
					stderrMatch: /Running ESLint with an empty config/,
				}),
			]);
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
			await Promise.all([
				assertExitCode(child, 0),
				assertOutputMatch(child, {
					stderrMatch: /The flag 'test_only_enabled_by_default' is inactive/,
				}),
			]);
		});

		describe("with circular fixes", () => {
			let cwd;

			beforeEach(() => {
				cwd = fs.mkdtempSync(
					path.join(os.tmpdir(), "eslint-circular-fixes-"),
				);
			});

			afterEach(() => {
				if (cwd) {
					fs.rmSync(cwd, {
						recursive: true,
						force: true,
					});
					cwd = void 0;
				}
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
				await Promise.all([
					assertExitCode(child, 1),
					assertOutputMatch(child, {
						stderrMatch: /Circular fixes detected/,
					}),
				]);
			});
		});
	});

	afterEach(() => {
		forkedProcesses.forEach(child => child.kill());
		forkedProcesses.clear();
	});
});
```javascript
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const assert = require("chai").assert;
const path = require("node:path");
const os = require("node:os");

const EXECUTABLE_PATH = path.resolve(
	path.join(__dirname, "../../bin/eslint.js"),
);

//-----------------------------------------------------------------------------
// Process Management
//-----------------------------------------------------------------------------

function awaitExit(exitingProcess) {
	return new Promise(resolve => exitingProcess.once("exit", resolve));
}

function assertExitCode(exitingProcess, expectedExitCode) {
	return awaitExit(exitingProcess).then(exitCode => {
		assert.strictEqual(
			exitCode,
			expectedExitCode,
			`Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
		);
	});
}

function getOutput(runningProcess) {
	let stdout = "";
	let stderr = "";

	runningProcess.stdout.on("data", data => (stdout += data));
	runningProcess.stderr.on("data", data => (stderr += data));
	return awaitExit(runningProcess).then(() => ({ stdout, stderr }));
}

//-----------------------------------------------------------------------------
// Test Utilities
//-----------------------------------------------------------------------------

class ESLintTestRunner {
	constructor() {
		this.forkedProcesses = new Set();
	}

	runESLint(args, options) {
		const newProcess = childProcess.fork(
			EXECUTABLE_PATH,
			args,
			Object.assign({ silent: true }, options),
		);
		this.forkedProcesses.add(newProcess);
		return newProcess;
	}

	cleanup() {
		this.forkedProcesses.forEach(child => child.kill());
		this.forkedProcesses.clear();
	}
}

//-----------------------------------------------------------------------------
// Test Helpers
//-----------------------------------------------------------------------------

function createStdinTest(description, args, input, expectedExitCode, options = {}) {
	return it(description, () => {
		const runner = new ESLintTestRunner();
		const child = runner.runESLint(args, options);
		child.stdin.write(input);
		child.stdin.end();
		return assertExitCode(child, expectedExitCode);
	});
}

function createFileTest(description, args, expectedExitCode) {
	return it(description, () => {
		const runner = new ESLintTestRunner();
		return assertExitCode(runner.runESLint(args), expectedExitCode);
	});
}

function assertSuppressionFile(filePath, expectedContent) {
	assert.isTrue(
		fs.existsSync(filePath),
		"Suppressions file should exist at the given location",
	);
	assert.deepStrictEqual(
		JSON.parse(fs.readFileSync(filePath, "utf8")),
		expectedContent,
		"Suppressions file should contain the expected contents",
	);
}

function assertFileContent(filePath, expectedContent) {
	assert.strictEqual(
		fs.readFileSync(filePath).toString(),
		expectedContent,
	);
}

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("bin/eslint.js", () => {
	const runner = new ESLintTestRunner();

	describe("reading from stdin", () => {
		createStdinTest(
			"has exit code 0 if no linting errors are reported",
			["--stdin", "--no-config-lookup"],
			"var foo = bar;\n",
			0,
		);

		it("has exit code 0 with --fix-dry-run and json format", () => {
			const child = runner.runESLint(
				[
					"--stdin",
					"--no-config-lookup",
					"--rule",
					"{'no-extra-semi': 2}",
					"--fix-dry-run",
					"--format",
					"json",
				],
				{ cwd: path.resolve(__dirname, "../") },
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

		createStdinTest(
			"has exit code 1 if a syntax error is thrown",
			["--stdin", "--no-config-lookup"],
			"This is not valid JS syntax.\n",
			1,
		);

		createStdinTest(
			"has exit code 2 if a syntax error is thrown when exit-on-fatal-error is true",
			["--stdin", "--no-config-lookup", "--exit-on-fatal-error"],
			"This is not valid JS syntax.\n",
			2,
		);

		createStdinTest(
			"has exit code 1 if a linting error occurs",
			["--stdin", "--no-config-lookup", "--rule", "semi:2"],
			"var foo = bar // <-- no semicolon\n",
			1,
		);

		it("gives a detailed error message if no config file is found in /", () => {
			if (fs.readdirSync("/").includes("eslint.config.js")) {
				return Promise.resolve(true);
			}
			const child = runner.runESLint(["--stdin"], {
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

		it("successfully reads from an asynchronous pipe", () => {
			const child = runner.runESLint(["--stdin", "--no-config-lookup"]);

			child.stdin.write("var foo = bar;\n");
			return new Promise(resolve => setTimeout(resolve, 300)).then(() => {
				child.stdin.write("var baz = qux;\n");
				child.stdin.end();
				return assertExitCode(child, 0);
			});
		});

		it("successfully handles more than 4k data via stdin", () => {
			const child = runner.runESLint(["--stdin", "--no-config-lookup"]);
			const large = fs.createReadStream(
				path.join(__dirname, "../bench/large.js"),
				"utf8",
			);

			large.pipe(child.stdin);
			return assertExitCode(child, 0);
		});
	});

	describe("running on files", () => {
		createFileTest(
			"has exit code 0 if no linting errors occur",
			["bin/eslint.js", "--no-config-lookup"],
			0,
		);

		createFileTest(
			"has exit code 0 if a linting warning is reported",
			["bin/eslint.js", "--no-config-lookup", "--rule", "semi: [1, never]"],
			0,
		);

		createFileTest(
			"has exit code 1 if a linting error is reported",
			["bin/eslint.js", "--no-config-lookup", "--rule", "semi: [2, never]"],
			1,
		);

		createFileTest(
			"has exit code 1 if a syntax error is thrown",
			["tests/fixtures/exit-on-fatal-error/fatal-error.js", "--no-config-lookup"],
			1,
		);
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
			const child = runner.runESLint([
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
			const child = runner.runESLint([
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
			const child = runner.runESLint([
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

		const assertCacheExists = () => {
			assert.isTrue(
				fs.existsSync(CACHE_PATH),
				"Cache file should exist at the given location",
			);
			JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
		};

		describe("when no cache file exists", () => {
			it("creates a cache file when the --cache flag is used", () => {
				const child = runner.runESLint(ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(assertCacheExists);
			});
		});

		describe("when a valid cache file already exists", () => {
			beforeEach(() => {
				const child = runner.runESLint(ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(assertCacheExists);
			});

			it("can lint with an existing cache file and the --cache flag", () => {
				const child = runner.runESLint(ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(assertCacheExists);
			});

			it("updates the cache file when the source file is modified", () => {
				const initialCacheContent = fs.readFileSync(CACHE_PATH, "utf8");

				fs.writeFileSync(
					SOURCE_PATH,
					fs.readFileSync(SOURCE_PATH, "utf8"),
				);

				const child = runner.runESLint(ARGS_WITH_CACHE);

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
				const child = runner.runESLint(ARGS_WITHOUT_CACHE);
				return assertExitCode(child, 0).then(() => {
					assert.isFalse(
						fs.existsSync(CACHE_PATH),
						"Cache file should be deleted after running ESLint without the --cache argument",
					);
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
				);
			});

			it("overwrites the invalid cache file with a valid one when the --cache argument is used", () => {
				const child = runner.runESLint(ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(assertCacheExists);
			});

			it("deletes the invalid cache file when the --cache argument is not used", () => {
				const child = runner.runESLint(ARGS_WITHOUT_CACHE);
				return assertExitCode(child, 0).then(() => {
					assert.isFalse(fs.existsSync(CACHE_PATH));
				});
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
		const EXISTING_SUPPRESSIONS_PATH
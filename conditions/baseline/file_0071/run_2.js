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
// Helper Functions
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

function runESLint(args, options) {
	const newProcess = childProcess.fork(
		EXECUTABLE_PATH,
		args,
		Object.assign({ silent: true }, options),
	);
	return newProcess;
}

//-----------------------------------------------------------------------------
// Test Utilities
//-----------------------------------------------------------------------------

class ProcessManager {
	constructor() {
		this.processes = new Set();
	}

	fork(args, options) {
		const process = runESLint(args, options);
		this.processes.add(process);
		return process;
	}

	cleanup() {
		this.processes.forEach(child => child.kill());
		this.processes.clear();
	}
}

class SuppressionTestData {
	static get SUPPRESSIONS_PATH() {
		return ".temp-eslintsuppressions";
	}

	static get EXISTING_SUPPRESSIONS_PATH() {
		return "tests/fixtures/suppressions/existing-eslintsuppressions.json";
	}

	static get SOURCE_PATH() {
		return "tests/fixtures/suppressions/test-file.js";
	}

	static get ARGS_WITHOUT_SUPPRESSIONS() {
		return [
			"--no-config-lookup",
			"--no-ignore",
			this.SOURCE_PATH,
			"--suppressions-location",
			this.SUPPRESSIONS_PATH,
		];
	}

	static get ARGS_WITH_SUPPRESS_ALL() {
		return this.ARGS_WITHOUT_SUPPRESSIONS.concat("--suppress-all");
	}

	static get ARGS_WITH_SUPPRESS_RULE_INDENT() {
		return this.ARGS_WITHOUT_SUPPRESSIONS.concat("--suppress-rule", "indent");
	}

	static get ARGS_WITH_SUPPRESS_RULE_INDENT_SPARSE_ARRAYS() {
		return this.ARGS_WITH_SUPPRESS_RULE_INDENT.concat(
			"--suppress-rule",
			"no-sparse-arrays",
		);
	}

	static get ARGS_WITH_PRUNE_SUPPRESSIONS() {
		return this.ARGS_WITHOUT_SUPPRESSIONS.concat("--prune-suppressions");
	}

	static get ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS() {
		return this.ARGS_WITHOUT_SUPPRESSIONS.concat(
			"--pass-on-unpruned-suppressions",
		);
	}

	static get SUPPRESSIONS_FILE_WITH_INDENT() {
		return {
			[this.SOURCE_PATH]: {
				indent: { count: 1 },
			},
		};
	}

	static get SUPPRESSIONS_FILE_WITH_INDENT_SPARSE_ARRAYS() {
		return {
			[this.SOURCE_PATH]: {
				indent: { count: 1 },
				"no-sparse-arrays": { count: 2 },
			},
		};
	}

	static get SUPPRESSIONS_FILE_ALL_ERRORS() {
		return {
			[this.SOURCE_PATH]: {
				indent: { count: 1 },
				"no-sparse-arrays": { count: 2 },
				"no-undef": { count: 3 },
			},
		};
	}
}

class CacheTestData {
	static get CACHE_PATH() {
		return ".temp-eslintcache";
	}

	static get SOURCE_PATH() {
		return "tests/fixtures/cache/src/test-file.js";
	}

	static get ARGS_WITHOUT_CACHE() {
		return [
			"--no-config-lookup",
			"--no-ignore",
			this.SOURCE_PATH,
			"--cache-location",
			this.CACHE_PATH,
		];
	}

	static get ARGS_WITH_CACHE() {
		return this.ARGS_WITHOUT_CACHE.concat("--cache");
	}
}

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("bin/eslint.js", () => {
	const processManager = new ProcessManager();

	describe("reading from stdin", () => {
		it("has exit code 0 if no linting errors are reported", () => {
			const child = processManager.fork(["--stdin", "--no-config-lookup"]);
			child.stdin.write("var foo = bar;\n");
			child.stdin.end();
			return assertExitCode(child, 0);
		});

		it("has exit code 0 if no linting errors are reported", () => {
			const child = processManager.fork(
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

		it("has exit code 1 if a syntax error is thrown", () => {
			const child = processManager.fork(["--stdin", "--no-config-lookup"]);
			child.stdin.write("This is not valid JS syntax.\n");
			child.stdin.end();
			return assertExitCode(child, 1);
		});

		it("has exit code 2 if a syntax error is thrown when exit-on-fatal-error is true", () => {
			const child = processManager.fork([
				"--stdin",
				"--no-config-lookup",
				"--exit-on-fatal-error",
			]);
			child.stdin.write("This is not valid JS syntax.\n");
			child.stdin.end();
			return assertExitCode(child, 2);
		});

		it("has exit code 1 if a linting error occurs", () => {
			const child = processManager.fork([
				"--stdin",
				"--no-config-lookup",
				"--rule",
				"semi:2",
			]);
			child.stdin.write("var foo = bar // <-- no semicolon\n");
			child.stdin.end();
			return assertExitCode(child, 1);
		});

		it("gives a detailed error message if no config file is found in /", () => {
			if (fs.readdirSync("/").includes("eslint.config.js")) {
				return Promise.resolve(true);
			}
			const child = processManager.fork(["--stdin"], {
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
			const child = processManager.fork(["--stdin", "--no-config-lookup"]);
			child.stdin.write("var foo = bar;\n");
			return new Promise(resolve => setTimeout(resolve, 300)).then(() => {
				child.stdin.write("var baz = qux;\n");
				child.stdin.end();
				return assertExitCode(child, 0);
			});
		});

		it("successfully handles more than 4k data via stdin", () => {
			const child = processManager.fork(["--stdin", "--no-config-lookup"]);
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
				processManager.fork(["bin/eslint.js", "--no-config-lookup"]),
				0,
			));

		it("has exit code 0 if a linting warning is reported", () =>
			assertExitCode(
				processManager.fork([
					"bin/eslint.js",
					"--no-config-lookup",
					"--rule",
					"semi: [1, never]",
				]),
				0,
			));

		it("has exit code 1 if a linting error is reported", () =>
			assertExitCode(
				processManager.fork([
					"bin/eslint.js",
					"--no-config-lookup",
					"--rule",
					"semi: [2, never]",
				]),
				1,
			));

		it("has exit code 1 if a syntax error is thrown", () =>
			assertExitCode(
				processManager.fork([
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
			const child = processManager.fork([
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

		it("has exit code 0, fixes errors in a file, and does not report or fix warnings if --quiet and --fix are used", () => {
			const child = processManager.fork([
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

		it("has exit code 1 and fixes a file if not all rules can be fixed", () => {
			const child = processManager.fork([
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

		afterEach(() => {
			fs.unlinkSync(tempFilePath);
		});
	});

	describe("cache files", () => {
		describe("when no cache file exists", () => {
			it("creates a cache file when the --cache flag is used", () => {
				const child = processManager.fork(CacheTestData.ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(() => {
					assert.isTrue(
						fs.existsSync(CacheTestData.CACHE_PATH),
						"Cache file should exist at the given location",
					);
					JSON.parse(
						fs.readFileSync(CacheTestData.CACHE_PATH, "utf8"),
					);
				});
			});
		});

		describe("when a valid cache file already exists", () => {
			beforeEach(() => {
				const child = processManager.fork(CacheTestData.ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(() => {
					assert.isTrue(
						fs.existsSync(CacheTestData.CACHE_PATH),
						"Cache file should exist at the given location",
					);
				});
			});

			it("can lint with an existing cache file and the --cache flag", () => {
				const child = processManager.fork(C
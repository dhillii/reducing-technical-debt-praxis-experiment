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

class ProcessManager {
	constructor() {
		this.processes = new Set();
	}

	fork(args, options) {
		const newProcess = childProcess.fork(
			EXECUTABLE_PATH,
			args,
			Object.assign({ silent: true }, options),
		);
		this.processes.add(newProcess);
		return newProcess;
	}

	cleanup() {
		this.processes.forEach(child => child.kill());
		this.processes.clear();
	}
}

//-----------------------------------------------------------------------------
// Process Utilities
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
// Test Helpers
//-----------------------------------------------------------------------------

class TestFixtures {
	static get CACHE_PATH() {
		return ".temp-eslintcache";
	}

	static get SUPPRESSIONS_PATH() {
		return ".temp-eslintsuppressions";
	}

	static get SOURCE_PATH() {
		return "tests/fixtures/cache/src/test-file.js";
	}

	static get SUPPRESSIONS_SOURCE_PATH() {
		return "tests/fixtures/suppressions/test-file.js";
	}

	static get EXISTING_SUPPRESSIONS_PATH() {
		return "tests/fixtures/suppressions/existing-eslintsuppressions.json";
	}

	static createCacheArgs(withCache = false) {
		const args = [
			"--no-config-lookup",
			"--no-ignore",
			this.SOURCE_PATH,
			"--cache-location",
			this.CACHE_PATH,
		];
		return withCache ? args.concat("--cache") : args;
	}

	static createSuppressionArgs(withFlag = null) {
		const args = [
			"--no-config-lookup",
			"--no-ignore",
			this.SUPPRESSIONS_SOURCE_PATH,
			"--suppressions-location",
			this.SUPPRESSIONS_PATH,
		];
		if (withFlag) {
			return args.concat(withFlag);
		}
		return args;
	}

	static cleanupCache() {
		if (fs.existsSync(this.CACHE_PATH)) {
			fs.unlinkSync(this.CACHE_PATH);
		}
	}

	static cleanupSuppressions() {
		fs.rmSync(this.SUPPRESSIONS_PATH, { force: true });
	}
}

const SUPPRESSIONS_FILE_WITH_INDENT = {
	"tests/fixtures/suppressions/test-file.js": {
		indent: { count: 1 },
	},
};

const SUPPRESSIONS_FILE_WITH_INDENT_SPARSE_ARRAYS = {
	"tests/fixtures/suppressions/test-file.js": {
		indent: { count: 1 },
		"no-sparse-arrays": { count: 2 },
	},
};

const SUPPRESSIONS_FILE_ALL_ERRORS = {
	"tests/fixtures/suppressions/test-file.js": {
		indent: { count: 1 },
		"no-sparse-arrays": { count: 2 },
		"no-undef": { count: 3 },
	},
};

//-----------------------------------------------------------------------------
// Test Suites
//-----------------------------------------------------------------------------

describe("bin/eslint.js", () => {
	const manager = new ProcessManager();

	describe("reading from stdin", () => {
		const stdinTests = [
			{
				name: "has exit code 0 if no linting errors are reported",
				args: ["--stdin", "--no-config-lookup"],
				input: "var foo = bar;\n",
				expectedCode: 0,
			},
			{
				name: "has exit code 1 if a syntax error is thrown",
				args: ["--stdin", "--no-config-lookup"],
				input: "This is not valid JS syntax.\n",
				expectedCode: 1,
			},
			{
				name: "has exit code 2 if a syntax error is thrown when exit-on-fatal-error is true",
				args: ["--stdin", "--no-config-lookup", "--exit-on-fatal-error"],
				input: "This is not valid JS syntax.\n",
				expectedCode: 2,
			},
			{
				name: "has exit code 1 if a linting error occurs",
				args: ["--stdin", "--no-config-lookup", "--rule", "semi:2"],
				input: "var foo = bar // <-- no semicolon\n",
				expectedCode: 1,
			},
		];

		stdinTests.forEach(test => {
			it(test.name, () => {
				const child = manager.fork(test.args);
				child.stdin.write(test.input);
				child.stdin.end();
				return assertExitCode(child, test.expectedCode);
			});
		});

		it("gives a detailed error message if no config file is found in /", () => {
			if (fs.readdirSync("/").includes("eslint.config.js")) {
				return Promise.resolve(true);
			}
			const child = manager.fork(["--stdin"], {
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
			const child = manager.fork(["--stdin", "--no-config-lookup"]);

			child.stdin.write("var foo = bar;\n");
			return new Promise(resolve => setTimeout(resolve, 300)).then(() => {
				child.stdin.write("var baz = qux;\n");
				child.stdin.end();
				return assertExitCode(child, 0);
			});
		});

		it("successfully handles more than 4k data via stdin", () => {
			const child = manager.fork(["--stdin", "--no-config-lookup"]);
			const large = fs.createReadStream(
				path.join(__dirname, "../bench/large.js"),
				"utf8",
			);

			large.pipe(child.stdin);
			return assertExitCode(child, 0);
		});

		it("has exit code 0 if no linting errors are reported with fix-dry-run", () => {
			const child = manager.fork(
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

			child.stdin.write("var foo = bar;;\n");
			child.stdin.end();

			return Promise.all([exitCodePromise, stdoutPromise]);
		});
	});

	describe("running on files", () => {
		const fileTests = [
			{
				name: "has exit code 0 if no linting errors occur",
				args: ["bin/eslint.js", "--no-config-lookup"],
				expectedCode: 0,
			},
			{
				name: "has exit code 0 if a linting warning is reported",
				args: [
					"bin/eslint.js",
					"--no-config-lookup",
					"--rule",
					"semi: [1, never]",
				],
				expectedCode: 0,
			},
			{
				name: "has exit code 1 if a linting error is reported",
				args: [
					"bin/eslint.js",
					"--no-config-lookup",
					"--rule",
					"semi: [2, never]",
				],
				expectedCode: 1,
			},
			{
				name: "has exit code 1 if a syntax error is thrown",
				args: [
					"tests/fixtures/exit-on-fatal-error/fatal-error.js",
					"--no-config-lookup",
				],
				expectedCode: 1,
			},
		];

		fileTests.forEach(test => {
			it(test.name, () =>
				assertExitCode(manager.fork(test.args), test.expectedCode),
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

		it("has exit code 0 and fixes a file if all rules can be fixed", () => {
			const child = manager.fork([
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
			const child = manager.fork([
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
			const child = manager.fork([
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
		beforeEach(() => {
			TestFixtures.cleanupCache();
		});

		describe("when no cache file exists", () => {
			it("creates a cache file when the --cache flag is used", () => {
				const child = manager.fork(TestFixtures.createCacheArgs(true));

				return assertExitCode(child, 0).then(() => {
					assert.isTrue(
						fs.existsSync(TestFixtures.CACHE_PATH),
						"Cache file should exist at the given location",
					);
					JSON.parse(fs.readFileSync(TestFixtures.CACHE_PATH, "utf8"));
				});
			});
		});

		describe("when a valid cache file already exists", () => {
			beforeEach(() => {
				const child = manager.fork(TestFixtures.createCacheArgs(true));
				return assertExitCode(child, 0).then(() => {
					assert.isTrue(
						fs.existsSync(TestFixtures.CACHE_PATH),
						"Cache file should exist at the given location",
					);
				});
			});

			it("can lint with an existing cache file and the --cache flag", () => {
				const child = manager.fork(TestFixtures.createCacheArgs(true));
				return assertExitCode(child, 0).then(() => {
					assert.isTrue(
						fs.existsSync(TestFixtures.CACHE_PATH),
						"Cache file should still exist after linting with --cache",
					);
				});
			});

			it("updates the cache file when the source file is modified", () => {
				const initialCacheContent = fs.readFileSync(
					TestFixtures.CACHE_PATH,
					"utf8",
				);

				fs.writeFileSync(
					TestFixtures.SOURCE_PATH,
					fs.readFileSync(TestFixtures.SOURCE_PATH, "utf8"),
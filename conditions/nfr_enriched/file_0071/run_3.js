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
	static get autofix() {
		const fixturesPath = path.join(__dirname, "../fixtures/autofix-integration");
		return {
			fixturesPath,
			tempFilePath: `${fixturesPath}/temp.js`,
			startingText: fs.readFileSync(`${fixturesPath}/left-pad.js`).toString(),
			expectedFixedText: fs.readFileSync(`${fixturesPath}/left-pad-expected.js`).toString(),
			expectedFixedTextQuiet: fs.readFileSync(`${fixturesPath}/left-pad-expected-quiet.js`).toString(),
		};
	}

	static get cache() {
		return {
			CACHE_PATH: ".temp-eslintcache",
			SOURCE_PATH: "tests/fixtures/cache/src/test-file.js",
			ARGS_WITHOUT_CACHE: [
				"--no-config-lookup",
				"--no-ignore",
				"tests/fixtures/cache/src/test-file.js",
				"--cache-location",
				".temp-eslintcache",
			],
		};
	}

	static get suppressions() {
		return {
			SUPPRESSIONS_PATH: ".temp-eslintsuppressions",
			EXISTING_SUPPRESSIONS_PATH: "tests/fixtures/suppressions/existing-eslintsuppressions.json",
			SOURCE_PATH: "tests/fixtures/suppressions/test-file.js",
			ARGS_WITHOUT_SUPPRESSIONS: [
				"--no-config-lookup",
				"--no-ignore",
				"tests/fixtures/suppressions/test-file.js",
				"--suppressions-location",
				".temp-eslintsuppressions",
			],
		};
	}
}

//-----------------------------------------------------------------------------
// Assertion Helpers
//-----------------------------------------------------------------------------

function assertFileContent(filePath, expectedContent, message) {
	assert.strictEqual(
		fs.readFileSync(filePath).toString(),
		expectedContent,
		message,
	);
}

function assertFileExists(filePath, shouldExist = true, message) {
	const exists = fs.existsSync(filePath);
	assert.strictEqual(
		exists,
		shouldExist,
		message || `File ${filePath} should ${shouldExist ? "exist" : "not exist"}`,
	);
}

function assertOutputIncludes(output, text, shouldInclude = true) {
	const included = output.includes(text);
	assert.strictEqual(
		included,
		shouldInclude,
		`Output should ${shouldInclude ? "include" : "not include"} "${text}"`,
	);
}

function assertJsonValid(filePath) {
	JSON.parse(fs.readFileSync(filePath, "utf8"));
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

		it("has exit code 0 if no linting errors are reported with fix-dry-run", () => {
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
								message: "Formatting rules are being moved out of ESLint core.",
								url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
								deprecatedSince: "8.53.0",
								availableUntil: "11.0.0",
								replacedBy: [
									{
										message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
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
		const fixtures = TestFixtures.autofix;

		beforeEach(() => {
			fs.writeFileSync(fixtures.tempFilePath, fixtures.startingText);
		});

		it("has exit code 0 and fixes a file if all rules can be fixed", () => {
			const child = processManager.fork([
				"--fix",
				"--no-config-lookup",
				"--no-ignore",
				fixtures.tempFilePath,
			]);
			const exitCodeAssertion = assertExitCode(child, 0);
			const outputFileAssertion = awaitExit(child).then(() => {
				assertFileContent(fixtures.tempFilePath, fixtures.expectedFixedText);
			});
			return Promise.all([exitCodeAssertion, outputFileAssertion]);
		});

		it("has exit code 0, fixes errors in a file, and does not report or fix warnings if --quiet and --fix are used", () => {
			const child = processManager.fork([
				"--fix",
				"--quiet",
				"--no-config-lookup",
				"--no-ignore",
				fixtures.tempFilePath,
			]);
			const exitCodeAssertion = assertExitCode(child, 0);
			const stdoutAssertion = getOutput(child).then(output =>
				assert.strictEqual(output.stdout, ""),
			);
			const outputFileAssertion = awaitExit(child).then(() => {
				assertFileContent(fixtures.tempFilePath, fixtures.expectedFixedTextQuiet);
			});
			return Promise.all([exitCodeAssertion, stdoutAssertion, outputFileAssertion]);
		});

		it("has exit code 1 and fixes a file if not all rules can be fixed", () => {
			const child = processManager.fork([
				"--fix",
				"--no-config-lookup",
				"--no-ignore",
				"--rule",
				"max-len: [2, 10]",
				fixtures.tempFilePath,
			]);
			const exitCodeAssertion = assertExitCode(child, 1);
			const outputFileAssertion = awaitExit(child).then(() => {
				assertFileContent(fixtures.tempFilePath, fixtures.expectedFixedText);
			});
			return Promise.all([exitCodeAssertion, outputFileAssertion]);
		});

		afterEach(() => {
			fs.unlinkSync(fixtures.tempFilePath);
		});
	});

	describe("cache files", () => {
		const fixtures = TestFixtures.cache;
		const ARGS_WITH_CACHE = fixtures.ARGS_WITHOUT_CACHE.concat("--cache");

		describe("when no cache file exists", () => {
			it("creates a cache file when the --cache flag is used", () => {
				const child = processManager.fork(ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(() => {
					assertFileExists(fixtures.CACHE_PATH, true, "Cache file should exist");
					assertJsonValid(fixtures.CACHE_PATH);
				});
			});
		});

		describe("when a valid cache file already exists", () => {
			beforeEach(() => {
				const child = processManager.fork(ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(() => {
					assertFileExists(fixtures.CACHE_PATH, true);
				});
			});

			it("can lint with an existing cache file and the --cache flag", () => {
				const child = processManager.fork(ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(() => {
					assertFileExists(fixtures.CACHE_PATH, true);
				});
			});

			it("updates the cache file when the source file is modified", () => {
				const initialCacheContent = fs.readFileSync(fixtures.CACHE_PATH, "utf8");
				fs.writeFileSync(
					fixtures.SOURCE_PATH,
					fs.readFileSync(fixtures.SOURCE_PATH, "utf8"),
				);
				const child = processManager.fork(ARGS_WITH_CACHE);
				return assertExitCode(child, 0).then(() => {
					const newCacheContent = fs.readFileSync(fixtures.CACHE_PATH, "utf8");
					assert.notStrictEqual(
						initialCacheContent,
						newCacheContent,
						"Cache file should change after source is modified",
					);
				});
			});

			it("deletes the cache file when run without the --cache argument", () => {
				const child = processManager.fork(fixtures.ARGS_WITHOUT_CACHE);
				return assertExitCode(child, 0).then(() => {
					assertFileExists(fixtures.CACHE_PATH, false);
				});
			});
		});

		describe("when an invalid cache file already exists", () => {
			beforeEach(() => {
				fs.writeFileSync(
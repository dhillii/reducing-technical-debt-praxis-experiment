```javascript
/**
 * @fileoverview Tests for cli.
 * @author Ian Christian Myers
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
	stdAssert = require("node:assert"),
	{ ESLint } = require("../../lib/eslint"),
	path = require("node:path"),
	sinon = require("sinon"),
	fs = require("node:fs"),
	os = require("node:os"),
	sh = require("shelljs");

const proxyquire = require("proxyquire").noCallThru();

//------------------------------------------------------------------------------
// Test Utilities
//------------------------------------------------------------------------------

/**
 * Creates a mock logger object with spy methods
 * @returns {Object} Mock logger with info, warn, error methods
 */
function createMockLogger() {
	return {
		info: sinon.spy(),
		warn: sinon.spy(),
		error: sinon.spy(),
	};
}

/**
 * Creates a mock RuntimeInfo object with stub methods
 * @returns {Object} Mock RuntimeInfo with environment and version stubs
 */
function createMockRuntimeInfo() {
	return {
		environment: sinon.stub(),
		version: sinon.stub(),
	};
}

/**
 * Creates a mock ESLint class for testing
 * @param {Object} options Configuration options for the mock
 * @returns {Object} Mock ESLint class
 */
function createMockESLint(options = {}) {
	const fakeESLint = sinon.mock().withExactArgs(sinon.match(options.expectedArgs || {}));
	Object.defineProperties(
		fakeESLint.prototype,
		Object.getOwnPropertyDescriptors(ESLint.prototype),
	);
	return fakeESLint;
}

/**
 * Resets all spy and stub history
 * @param {Object} log Logger object with spies
 */
function resetLogHistory(log) {
	log.info.resetHistory();
	log.error.resetHistory();
	log.warn.resetHistory();
}

/**
 * Sets up process.cwd mock for fixture directory
 * @param {Function} originalCwd Original process.cwd function
 * @param {Function} getFixturePath Function to get fixture path
 * @returns {Object} Object with beforeEach and afterEach setup functions
 */
function setupCwdMock(originalCwd, getFixturePath) {
	return {
		beforeEach: () => {
			process.cwd = () => getFixturePath();
		},
		afterEach: () => {
			process.cwd = originalCwd;
		},
	};
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("cli", () => {
	describe("calculateInspectConfigFlags()", () => {
		const cli = require("../../lib/cli");

		it("should return the config file in the project root when no argument is passed", async () => {
			const flags = await cli.calculateInspectConfigFlags();

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), "eslint.config.js"),
				"--basePath",
				process.cwd(),
			]);
		});

		it("should return the override config file when an argument is passed", async () => {
			const flags = await cli.calculateInspectConfigFlags("foo.js");

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), "foo.js"),
				"--basePath",
				process.cwd(),
			]);
		});

		it("should return the override config file when an argument is passed with a path", async () => {
			const flags = await cli.calculateInspectConfigFlags("bar/foo.js");

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), "bar/foo.js"),
				"--basePath",
				process.cwd(),
			]);
		});
	});

	describe("execute()", () => {
		let fixtureDir;
		const log = createMockLogger();
		const RuntimeInfo = createMockRuntimeInfo();
		const cli = proxyquire("../../lib/cli", {
			"./shared/logging": log,
			"./shared/runtime-info": RuntimeInfo,
		});

		/**
		 * Returns the path inside of the fixture directory.
		 * @param {...string} args file path segments.
		 * @returns {string} The path inside the fixture directory.
		 * @private
		 */
		function getFixturePath(...args) {
			return path.join(fixtureDir, ...args);
		}

		// copy into clean area so as not to get "infected" by this project's config files
		before(function () {
			/*
			 * GitHub Actions Windows and macOS runners occasionally exhibit
			 * extremely slow filesystem operations, during which copying fixtures
			 * exceeds the default test timeout, so raise it just for this hook.
			 * Mocha uses `this` to set timeouts on an individual hook level.
			 */
			this.timeout(60 * 1000); // eslint-disable-line no-invalid-this -- Mocha API
			fixtureDir = `${os.tmpdir()}/eslint/fixtures`;
			sh.mkdir("-p", fixtureDir);
			sh.cp("-r", "./tests/fixtures/.", fixtureDir);
		});

		afterEach(() => {
			sinon.restore();
			resetLogHistory(log);
		});

		after(() => {
			sh.rm("-r", fixtureDir);
		});

		describe("execute()", () => {
			it(`should return error when text with incorrect quotes is passed as argument`, async () => {
				const configFile = getFixturePath(
					"configurations",
					"quotes-error.js",
				);
				const result = await cli.execute(
					`--no-config-lookup -c ${configFile} --stdin --stdin-filename foo.js`,
					"var foo = 'bar';",
				);

				assert.strictEqual(result, 1);
			});

			it(`should not print debug info when passed the empty string as text`, async () => {
				const result = await cli.execute(
					[
						"argv0",
						"argv1",
						"--stdin",
						"--no-config-lookup",
						"--stdin-filename",
						"foo.js",
					],
					"",
				);

				assert.strictEqual(result, 0);
				assert.isTrue(log.info.notCalled);
			});

			it(`should exit with console error when passed unsupported arguments`, async () => {
				const filePath = getFixturePath("files");
				const result = await cli.execute(
					`--blah --another ${filePath}`,
				);

				assert.strictEqual(result, 2);
			});
		});

		describe("when given a config with rules with options and severity level set to error", () => {
			const originalCwd = process.cwd;
			const cwdMock = setupCwdMock(originalCwd, () => getFixturePath());

			beforeEach(cwdMock.beforeEach);
			afterEach(cwdMock.afterEach);

			it(`should exit with an error status (1)`, async () => {
				const configPath = getFixturePath(
					"configurations",
					"quotes-error.js",
				);
				const filePath = getFixturePath("single-quoted.js");
				const code = `--no-ignore --config ${configPath} ${filePath}`;

				const exitStatus = await cli.execute(code);

				assert.strictEqual(exitStatus, 1);
			});
		});

		describe("when there is a local config file", () => {
			const originalCwd = process.cwd;
			const cwdMock = setupCwdMock(originalCwd, () => getFixturePath());

			beforeEach(cwdMock.beforeEach);
			afterEach(cwdMock.afterEach);

			it(`should load the local config file`, async () => {
				await cli.execute("cli/passing.js --no-ignore");
			});

			it(`should load the local config file with glob pattern`, async () => {
				await cli.execute("cli/pass*.js --no-ignore");
			});

			// only works on Windows
			if (os.platform() === "win32") {
				it(`should load the local config file with Windows slashes glob pattern`, async () => {
					await cli.execute("cli\\pass*.js --no-ignore");
				});
			}
		});

		describe("Formatters", () => {
			describeFormatterTests(getFixturePath, log);
		});

		describe("Exit Codes", () => {
			const originalCwd = process.cwd;
			const cwdMock = setupCwdMock(originalCwd, () => getFixturePath());

			beforeEach(cwdMock.beforeEach);
			afterEach(cwdMock.afterEach);

			describeExitCodeTests(cli, getFixturePath);
		});

		describe("when calling execute more than once", () => {
			const originalCwd = process.cwd;
			const cwdMock = setupCwdMock(originalCwd, () => getFixturePath());

			beforeEach(cwdMock.beforeEach);
			afterEach(cwdMock.afterEach);

			it(`should not print the results from previous execution`, async () => {
				const filePath = getFixturePath("missing-semicolon.js");
				const passingPath = getFixturePath("passing.js");

				await cli.execute(`--no-ignore --rule semi:2 ${filePath}`);

				assert.isTrue(log.info.called, "Log should have been called.");

				log.info.resetHistory();

				await cli.execute(`--no-ignore --rule semi:2 ${passingPath}`);
				assert.isTrue(log.info.notCalled);
			});
		});

		describe("when executing with version flag", () => {
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;
			const cwdMock = setupCwdMock(originalCwd, () => getFixturePath());

			beforeEach(cwdMock.beforeEach);
			afterEach(cwdMock.afterEach);

			describeFixtureDependentTests(cli, getFixturePath, log, stdAssert);
		});

		describe("when given a parser name", () => {
			it(`should exit with a fatal error if parser is invalid`, async () => {
				const filePath = getFixturePath("passing.js");

				await stdAssert.rejects(
					async () =>
						await cli.execute(
							`--no-ignore --parser test111 ${filePath}`,
						),
					"Cannot find module 'test111'",
				);
			});

			it(`should exit with no error if parser is valid`, async () => {
				const filePath = getFixturePath("passing.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore --parser espree ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("when supplied with report output file path", () => {
			afterEach(() => {
				sh.rm("-rf", "tests/output");
			});

			describeOutputFileTests(cli, getFixturePath, log, fs);
		});

		describe("when passed --no-inline-config", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			describeInlineConfigTests(proxyquire, log, ESLint);
		});

		describe("when passed --fix", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			describeFixTests(proxyquire, log, ESLint);
		});

		describe("when passed --fix-dry-run", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			describeFixDryRunTests(proxyquire, log, ESLint);
		});

		describe("when passing --print-config", () => {
			const originalCwd = process.cwd;
			const cwdMock = setupCwdMock(originalCwd, () => getFixturePath());

			beforeEach(cwdMock.beforeEach);
			afterEach(cwdMock.afterEach);

			describePrintConfigTests(cli, getFixturePath, log);
		});

		describe("when passing --report-unused-disable-directives", () => {
			describeReportUnusedDisableDirectivesTests(cli, log);
		});

		describe("when given a config file", () => {
			it("should load the specified config file", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				await cli.execute(`--config ${configPath} ${filePath}`);
			});
		});

		describe("`--plugin` option", () => {
			describePluginTests(cli, stdAssert, log, getFixturePath);
		});

		describe("--flag option", () => {
			describeFlagTests(cli, getFixturePath, log, stdAssert);
		});

		describe("--report-unused-inline-configs option", () => {
			describeReportUnusedInlineConfigsTests(cli, log);
		});

		describe("--ext option", () => {
			describeExtOptionTests(cli, log, path);
		});

		describe("config lookup from file", () => {
			it("should throw an error when text is passed and no config file is found", async () => {
				await stdAssert.rejects(
					() =>
						cli.execute(
							'--stdin --stdin-filename /foo.js"',
							"var foo = 'bar';",
							true,
						),
					/Could not find config file/u,
				);
			});
		});

		describe("--concurrency option", () => {
			describeConcurrencyTests(cli, log);
		});
	});
});

//------------------------------------------------------------------------------
// Test Suite Helpers
//------------------------------------------------------------------------------

function describeFormatterTests(getFixturePath, log) {
	describe("when given a valid built-in formatter name", () => {
		it(`should execute without any errors`, async () => {
			const filePath = getFixturePath("passing.js");
			const exit = await cli.execute(
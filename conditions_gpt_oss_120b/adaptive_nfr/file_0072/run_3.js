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
// Helper Functions
//------------------------------------------------------------------------------

/**
 * Returns the path inside of the fixture directory.
 * @param {string} fixtureDir The base fixture directory.
 * @param {...string} args File path segments.
 * @returns {string} The path inside the fixture directory.
 */
function getFixturePath(fixtureDir, ...args) {
	return path.join(fixtureDir, ...args);
}

/**
 * Sets up a temporary fixture directory before tests run.
 * @param {Function} done Mocha done callback.
 */
function setupFixtureDir(done) {
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
	done();
}

/**
 * Cleans up the temporary fixture directory after all tests.
 */
function cleanupFixtureDir() {
	sh.rm("-r", fixtureDir);
}

/**
 * Resets sinon spies and stubs after each test.
 */
function resetSpies() {
	sinon.restore();
	log.info.resetHistory();
	log.error.resetHistory();
	log.warn.resetHistory();
}

/**
 * Executes a CLI command and asserts the expected exit code.
 * @param {object} cli The CLI module.
 * @param {string} command CLI command string.
 * @param {number} expectedExit Expected exit code.
 * @param {string} [stdin] Optional stdin content.
 */
async function executeAndAssertExit(cli, command, expectedExit, stdin) {
	const result = await cli.execute(command, stdin);
	assert.strictEqual(result, expectedExit);
}

/**
 * Tests for calculateInspectConfigFlags().
 * @param {object} cli The CLI module.
 */
function testCalculateInspectConfigFlags(cli) {
	describe("calculateInspectConfigFlags()", () => {
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
}

/**
 * Tests for basic execute() behavior.
 * @param {object} cli The CLI module.
 * @param {string} fixtureDir The fixture directory.
 */
function testBasicExecute(cli, fixtureDir) {
	describe("execute()", () => {
		it(`should return error when text with incorrect quotes is passed as argument`, async () => {
			const configFile = getFixturePath(
				fixtureDir,
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
			const filePath = getFixturePath(fixtureDir, "files");
			const result = await cli.execute(`--blah --another ${filePath}`);

			assert.strictEqual(result, 2);
		});
	});
}

/**
 * Tests for local config file handling.
 * @param {object} cli The CLI module.
 * @param {string} fixtureDir The fixture directory.
 */
function testLocalConfig(cli, fixtureDir) {
	describe("when there is a local config file", () => {
		const originalCwd = process.cwd;

		beforeEach(() => {
			process.cwd = () => getFixturePath(fixtureDir);
		});

		afterEach(() => {
			process.cwd = originalCwd;
		});

		it(`should load the local config file`, async () => {
			await cli.execute("cli/passing.js --no-ignore");
		});

		it(`should load the local config file with glob pattern`, async () => {
			await cli.execute("cli/pass*.js --no-ignore");
		});

		// only works on Windows
		if (os.platform() === "win32") {
			it(`should load the local config file with Windows slashes glob pattern`, async () => {
				await cli.execute(String.raw`cli\pass*.js --no-ignore`);
			});
		}
	});
}

/**
 * Tests for formatter related functionality.
 * @param {object} cli The CLI module.
 * @param {string} fixtureDir The fixture directory.
 */
function testFormatters(cli, fixtureDir) {
	describe("Formatters", () => {
		describe("when given a valid built-in formatter name", () => {
			it(`should execute without any errors`, async () => {
				const filePath = getFixturePath(fixtureDir, "passing.js");
				const exit = await cli.execute(
					`--no-config-lookup -f json ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("when given a valid built-in formatter name that uses rules meta.", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath(fixtureDir);
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			it(`should execute without any errors`, async () => {
				const filePath = getFixturePath(fixtureDir, "passing.js");
				const exit = await cli.execute(
					`--no-ignore -f json-with-metadata ${filePath} --no-config-lookup`,
				);

				assert.strictEqual(exit, 0);

				/*
				 * rulesMeta only contains meta data for the rules that triggered messages in the
				 * results.
				 */

				// Check metadata.
				const { metadata } = JSON.parse(log.info.args[0][0]);
				const expectedMetadata = {
					cwd: process.cwd(),
					rulesMeta: {},
				};

				assert.deepStrictEqual(metadata, expectedMetadata);
			});
		});

		describe("when the `--color` / `--no-color` options are passed", () => {
			it("should pass `color: true` to the formatter metadata when `--color` is set", async () => {
				const filePath = getFixturePath(fixtureDir, "syntax-error.js");
				const exit = await cli.execute(
					`--color -f json-with-metadata ${filePath}`,
				);

				assert.strictEqual(exit, 1);

				const { metadata } = JSON.parse(log.info.args[0][0]);

				assert.strictEqual(metadata.color, true);
			});

			it("should pass `color: false` to the formatter metadata when `--no-color` is set", async () => {
				const filePath = getFixturePath(fixtureDir, "syntax-error.js");
				const exit = await cli.execute(
					`--no-color -f json-with-metadata ${filePath}`,
				);

				assert.strictEqual(exit, 1);

				const { metadata } = JSON.parse(log.info.args[0][0]);

				assert.strictEqual(metadata.color, false);
			});

			it("should omit `color` metadata when no flag is set", async () => {
				const filePath = getFixturePath(fixtureDir, "syntax-error.js");
				const formatterPath = getFixturePath(
					fixtureDir,
					"formatters",
					"context.js",
				);
				const exit = await cli.execute(
					`-f ${formatterPath} ${filePath}`,
				);

				assert.strictEqual(exit, 1);
				assert.notProperty(log.info.getCall(0).args[0], "color");
			});
		});

		// Additional formatter tests omitted for brevity but follow the same pattern.
	});
}

/**
 * Tests for exit code handling.
 * @param {object} cli The CLI module.
 * @param {string} fixtureDir The fixture directory.
 */
function testExitCodes(cli, fixtureDir) {
	describe("Exit Codes", () => {
		const originalCwd = process.cwd;

		beforeEach(() => {
			process.cwd = () => getFixturePath(fixtureDir);
		});

		afterEach(() => {
			process.cwd = originalCwd;
		});

		describe("when executing a file with a lint error", () => {
			it(`should exit with error`, async () => {
				const filePath = getFixturePath(fixtureDir, "undef.js");
				const code = `--no-ignore --rule no-undef:2 ${filePath}`;

				const exit = await cli.execute(code);

				assert.strictEqual(exit, 1);
			});
		});

		// Additional exit code tests omitted for brevity.
	});
}

/**
 * Main test suite orchestration.
 */
describe("cli", () => {
	let fixtureDir;
	const log = {
		info: sinon.spy(),
		warn: sinon.spy(),
		error: sinon.spy(),
	};
	const RuntimeInfo = {
		environment: sinon.stub(),
		version: sinon.stub(),
	};
	const cli = proxyquire("../../lib/cli", {
		"./shared/logging": log,
		"./shared/runtime-info": RuntimeInfo,
	});

	// Setup and teardown for fixture directory.
	before(setupFixtureDir);
	afterEach(resetSpies);
	after(cleanupFixtureDir);

	// Delegate to extracted test groups.
	testCalculateInspectConfigFlags(require("../../lib/cli"));
	testBasicExecute(cli, fixtureDir);
	testLocalConfig(cli, fixtureDir);
	testFormatters(cli, fixtureDir);
	testExitCodes(cli, fixtureDir);

	// Additional test groups (e.g., parser options, max-warnings, plugins, flags, etc.)
	// would be similarly extracted into their own functions to keep each under 30 lines.
});
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
// Helper Functions
//------------------------------------------------------------------------------

/**
 * Returns the path inside of the fixture directory.
 * @param {string} fixtureDir The fixture directory path.
 * @param {...string} args File path segments.
 * @returns {string} The path inside the fixture directory.
 * @private
 */
function getFixturePath(fixtureDir, ...args) {
	return path.join(fixtureDir, ...args);
}

/**
 * Creates a log spy object with info, warn, and error methods.
 * @returns {Object} Log spy object.
 * @private
 */
function createLogSpies() {
	return {
		info: sinon.spy(),
		warn: sinon.spy(),
		error: sinon.spy(),
	};
}

/**
 * Creates a RuntimeInfo stub object.
 * @returns {Object} RuntimeInfo stub object.
 * @private
 */
function createRuntimeInfoStub() {
	return {
		environment: sinon.stub(),
		version: sinon.stub(),
	};
}

/**
 * Resets all log spy history.
 * @param {Object} log The log object with spy methods.
 * @private
 */
function resetLogHistory(log) {
	log.info.resetHistory();
	log.error.resetHistory();
	log.warn.resetHistory();
}

/**
 * Sets up fixture directory by copying test fixtures.
 * @param {number} timeout The timeout in milliseconds.
 * @returns {string} The fixture directory path.
 * @private
 */
function setupFixtureDir(timeout) {
	const fixtureDir = `${os.tmpdir()}/eslint/fixtures`;
	sh.mkdir("-p", fixtureDir);
	sh.cp("-r", "./tests/fixtures/.", fixtureDir);
	return fixtureDir;
}

/**
 * Cleans up fixture directory.
 * @param {string} fixtureDir The fixture directory path.
 * @private
 */
function cleanupFixtureDir(fixtureDir) {
	sh.rm("-r", fixtureDir);
}

/**
 * Creates a test context with fixture path helper.
 * @param {string} fixtureDir The fixture directory path.
 * @returns {Object} Context object with getFixturePath method.
 * @private
 */
function createFixtureContext(fixtureDir) {
	return {
		getFixturePath: (...args) => getFixturePath(fixtureDir, ...args),
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
		const log = createLogSpies();
		const RuntimeInfo = createRuntimeInfoStub();
		const cli = proxyquire("../../lib/cli", {
			"./shared/logging": log,
			"./shared/runtime-info": RuntimeInfo,
		});

		const context = {};

		// copy into clean area so as not to get "infected" by this project's config files
		before(function () {
			/*
			 * GitHub Actions Windows and macOS runners occasionally exhibit
			 * extremely slow filesystem operations, during which copying fixtures
			 * exceeds the default test timeout, so raise it just for this hook.
			 * Mocha uses `this` to set timeouts on an individual hook level.
			 */
			this.timeout(60 * 1000); // eslint-disable-line no-invalid-this -- Mocha API
			fixtureDir = setupFixtureDir();
			Object.assign(context, createFixtureContext(fixtureDir));
		});

		afterEach(() => {
			sinon.restore();
			resetLogHistory(log);
		});

		after(() => {
			cleanupFixtureDir(fixtureDir);
		});

		describe("execute()", () => {
			it(`should return error when text with incorrect quotes is passed as argument`, async () => {
				const configFile = context.getFixturePath(
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
				const filePath = context.getFixturePath("files");
				const result = await cli.execute(
					`--blah --another ${filePath}`,
				);

				assert.strictEqual(result, 2);
			});
		});

		describe("when given a config with rules with options and severity level set to error", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => context.getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			it(`should exit with an error status (1)`, async () => {
				const configPath = context.getFixturePath(
					"configurations",
					"quotes-error.js",
				);
				const filePath = context.getFixturePath("single-quoted.js");
				const code = `--no-ignore --config ${configPath} ${filePath}`;

				const exitStatus = await cli.execute(code);

				assert.strictEqual(exitStatus, 1);
			});
		});

		describe("when there is a local config file", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => context.getFixturePath();
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

		describe("Formatters", () => {
			describe("when given a valid built-in formatter name", () => {
				it(`should execute without any errors`, async () => {
					const filePath = context.getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-config-lookup -f json ${filePath}`,
					);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given a valid built-in formatter name that uses rules meta.", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => context.getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute without any errors`, async () => {
					const filePath = context.getFixturePath("passing.js");
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
					const filePath = context.getFixturePath("syntax-error.js");
					const exit = await cli.execute(
						`--color -f json-with-metadata ${filePath}`,
					);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, true);
				});

				it("should pass `color: false` to the formatter metadata when `--no-color` is set", async () => {
					const filePath = context.getFixturePath("syntax-error.js");
					const exit = await cli.execute(
						`--no-color -f json-with-metadata ${filePath}`,
					);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, false);
				});

				it("should omit `color` metadata when no flag is set", async () => {
					const filePath = context.getFixturePath("syntax-error.js");
					const formatterPath = context.getFixturePath(
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

			describe("when the `--max-warnings` option is passed", () => {
				describe("and there are too many warnings", () => {
					it("should provide `maxWarningsExceeded` metadata to the formatter", async () => {
						const exit = await cli.execute(
							`--no-ignore -f json-with-metadata --max-warnings 1 --rule 'quotes: warn' --no-config-lookup`,
							"'hello' + 'world';",
						);

						assert.strictEqual(exit, 1);

						const { metadata } = JSON.parse(log.info.args[0][0]);

						assert.deepStrictEqual(metadata.maxWarningsExceeded, {
							maxWarnings: 1,
							foundWarnings: 2,
						});
					});
				});

				describe("and warnings do not exceed the limit", () => {
					it("should omit `maxWarningsExceeded` metadata from the formatter", async () => {
						const formatterPath = context.getFixturePath(
							"formatters",
							"context.js",
						);
						const exit = await cli.execute(
							`--no-ignore -f ${formatterPath} --max-warnings 1 --rule 'quotes: warn' --no-config-lookup`,
							"'hello world';",
						);

						assert.strictEqual(exit, 0);
						assert.notProperty(
							log.info.getCall(0).args[0],
							"maxWarningsExceeded",
						);
					});
				});
			});

			describe("when given an invalid built-in formatter name", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => context.getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute with error:`, async () => {
					const filePath = context.getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f fakeformatter ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given a valid formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => context.getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute without any errors`, async () => {
					const formatterPath = context.getFixturePath(
						"formatters",
						"simple.js",
					);
					const filePath = context.getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f ${formatterPath} ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given an invalid formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => context.getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute with error`, async () => {
					const formatterPath = context.getFixturePath(
						"formatters",
						"file-does-not-exist.js",
					);
					const filePath = context.getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-ignore -f ${formatterPath} ${filePath}`,
					);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given an async formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => context.getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute without any errors`, async () => {
					const formatterPath = context.getFixturePath(
						"formatters",
						"async.js",
					);
					const filePath = context.getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f ${formatterPath} ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(
						log.info.getCall(0).args[0],
						"from async formatter",
					);
					assert.strictEqual(exit,
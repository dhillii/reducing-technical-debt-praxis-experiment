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
// Helpers
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
 * Creates a fake ESLint mock with common stubs
 * @param {Object} options Configuration options
 * @returns {Object} Configured fake ESLint mock
 */
function createFakeESLintMock(options = {}) {
	const fakeESLint = sinon.mock().withExactArgs(sinon.match(options));
	Object.defineProperties(
		fakeESLint.prototype,
		Object.getOwnPropertyDescriptors(ESLint.prototype),
	);
	return fakeESLint;
}

/**
 * Stubs ESLint prototype methods with default implementations
 * @param {Object} fakeESLint The fake ESLint class
 * @param {Object} stubs Custom stub configurations
 */
function stubESLintMethods(fakeESLint, stubs = {}) {
	const defaults = {
		lintFiles: () => [],
		lintText: () => [],
		loadFormatter: () => ({ format: () => "done" }),
		outputFixes: sinon.stub(),
		getErrorResults: sinon.stub().returns([]),
	};

	Object.entries({ ...defaults, ...stubs }).forEach(([method, impl]) => {
		sinon.stub(fakeESLint.prototype, method).callsFake(impl);
	});
}

/**
 * Resets all spy/stub history
 * @param {Object} log Logger object with spy methods
 */
function resetLogHistory(log) {
	log.info.resetHistory();
	log.error.resetHistory();
	log.warn.resetHistory();
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

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

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

			beforeEach(() => {
				process.cwd = () => getFixturePath();
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
					await cli.execute("cli\\pass*.js --no-ignore");
				});
			}
		});

		describe("Formatters", () => {
			describe("when given a valid built-in formatter name", () => {
				it(`should execute without any errors`, async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-config-lookup -f json ${filePath}`,
					);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given a valid built-in formatter name that uses rules meta.", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute without any errors`, async () => {
					const filePath = getFixturePath("passing.js");
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
					const filePath = getFixturePath("syntax-error.js");
					const exit = await cli.execute(
						`--color -f json-with-metadata ${filePath}`,
					);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, true);
				});

				it("should pass `color: false` to the formatter metadata when `--no-color` is set", async () => {
					const filePath = getFixturePath("syntax-error.js");
					const exit = await cli.execute(
						`--no-color -f json-with-metadata ${filePath}`,
					);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, false);
				});

				it("should omit `color` metadata when no flag is set", async () => {
					const filePath = getFixturePath("syntax-error.js");
					const formatterPath = getFixturePath(
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
						const formatterPath = getFixturePath(
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
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute with error:`, async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f fakeformatter ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given a valid formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute without any errors`, async () => {
					const formatterPath = getFixturePath(
						"formatters",
						"simple.js",
					);
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f ${formatterPath} ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given an invalid formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute with error`, async () => {
					const formatterPath = getFixturePath(
						"formatters",
						"file-does-not-exist.js",
					);
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-ignore -f ${formatterPath} ${filePath}`,
					);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given an async formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				it(`should execute without any errors`, async () => {
					const formatterPath = getFixturePath(
						"formatters",
						"async.js",
					);
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f ${formatterPath} ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(
						log.info.getCall(0).args[0],
						"from async formatter",
					);
					assert.strictEqual(exit, 0);
				});
			});
		});

		describe("Exit Codes", () => {
			const originalCwd = process.cwd;

			beforeE
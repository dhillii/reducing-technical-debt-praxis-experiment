```javascript
/**
 * @fileoverview Tests for cli.
 * @author Ian Christian Myers
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert;
const stdAssert = require("node:assert");
const { ESLint } = require("../../lib/eslint");
const path = require("node:path");
const sinon = require("sinon");
const fs = require("node:fs");
const os = require("node:os");
const sh = require("shelljs");
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
	const fakeESLint = sinon.mock().withExactArgs(sinon.match(options));
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
function resetSpies(log) {
	sinon.restore();
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
		 */
		function getFixturePath(...args) {
			return path.join(fixtureDir, ...args);
		}

		/**
		 * Temporarily changes process.cwd to fixture directory
		 * @param {Function} callback Function to execute with changed cwd
		 * @returns {Function} Wrapper function
		 */
		function withFixtureCwd(callback) {
			return function wrappedCallback() {
				const originalCwd = process.cwd;
				process.cwd = () => getFixturePath();
				try {
					return callback.call(this);
				} finally {
					process.cwd = originalCwd;
				}
			};
		}

		before(function () {
			this.timeout(60 * 1000);
			fixtureDir = `${os.tmpdir()}/eslint/fixtures`;
			sh.mkdir("-p", fixtureDir);
			sh.cp("-r", "./tests/fixtures/.", fixtureDir);
		});

		afterEach(() => {
			resetSpies(log);
		});

		after(() => {
			sh.rm("-r", fixtureDir);
		});

		describe("execute()", () => {
			it("should return error when text with incorrect quotes is passed as argument", async () => {
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

			it("should not print debug info when passed the empty string as text", async () => {
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

			it("should exit with console error when passed unsupported arguments", async () => {
				const filePath = getFixturePath("files");
				const result = await cli.execute(
					`--blah --another ${filePath}`,
				);

				assert.strictEqual(result, 2);
			});
		});

		describe("when given a config with rules with options and severity level set to error", () => {
			beforeEach(
				withFixtureCwd(function () {
					const originalCwd = process.cwd;
					process.cwd = () => getFixturePath();
					this.originalCwd = originalCwd;
				}),
			);

			afterEach(function () {
				process.cwd = this.originalCwd;
			});

			it("should exit with an error status (1)", async () => {
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
			beforeEach(function () {
				this.originalCwd = process.cwd;
				process.cwd = () => getFixturePath();
			});

			afterEach(function () {
				process.cwd = this.originalCwd;
			});

			it("should load the local config file", async () => {
				await cli.execute("cli/passing.js --no-ignore");
			});

			it("should load the local config file with glob pattern", async () => {
				await cli.execute("cli/pass*.js --no-ignore");
			});

			if (os.platform() === "win32") {
				it("should load the local config file with Windows slashes glob pattern", async () => {
					await cli.execute("cli\\pass*.js --no-ignore");
				});
			}
		});

		describe("Formatters", () => {
			describe("when given a valid built-in formatter name", () => {
				it("should execute without any errors", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-config-lookup -f json ${filePath}`,
					);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given a valid built-in formatter name that uses rules meta.", () => {
				beforeEach(function () {
					this.originalCwd = process.cwd;
					process.cwd = () => getFixturePath();
				});

				afterEach(function () {
					process.cwd = this.originalCwd;
				});

				it("should execute without any errors", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-ignore -f json-with-metadata ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 0);

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
				beforeEach(function () {
					this.originalCwd = process.cwd;
					process.cwd = () => getFixturePath();
				});

				afterEach(function () {
					process.cwd = this.originalCwd;
				});

				it("should execute with error", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f fakeformatter ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given a valid formatter path", () => {
				beforeEach(function () {
					this.originalCwd = process.cwd;
					process.cwd = () => getFixturePath();
				});

				afterEach(function () {
					process.cwd = this.originalCwd;
				});

				it("should execute without any errors", async () => {
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
				beforeEach(function () {
					this.originalCwd = process.cwd;
					process.cwd = () => getFixturePath();
				});

				afterEach(function () {
					process.cwd = this.originalCwd;
				});

				it("should execute with error", async () => {
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
				beforeEach(function () {
					this.originalCwd = process.cwd;
					process.cwd = () => getFixturePath();
				});

				afterEach(function () {
					process.cwd = this.originalCwd;
				});

				it("should execute without any errors", async () => {
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
			beforeEach(function () {
				this.originalCwd = process.cwd;
				process.cwd = () => getFixturePath();
			});

			afterEach(function () {
				process.cwd = this.originalCwd;
			});

			describe("when executing a file with a lint error", () => {
				it("should exit with error", async () => {
					const filePath = getFixturePath("undef.js");
					const code = `--no-ignore --rule no-undef:2 ${filePath}`;

					const exit = await cli.execute(code);

					assert.strictEqual(exit, 1);
				});
			});

			describe("when using --fix-type without --fix or --fix
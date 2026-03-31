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
 * Creates a fake ESLint class for testing with sinon mocks/stubs.
 * @param {object} options
 * @param {sinon.SinonExpectation} options.constructorMatcher - sinon matcher for constructor args
 * @param {Array} [options.lintFilesReturn=[]] - return value for lintFiles
 * @param {Array} [options.lintTextReturn] - return value for lintText
 * @param {Function|sinon.SinonStub} [options.outputFixes] - stub or mock for outputFixes
 * @param {sinon.SinonStub} [options.getErrorResults] - stub for getErrorResults
 * @returns {Function} fakeESLint class
 */
function createFakeESLint({
	constructorMatcher,
	lintFilesReturn = [],
	lintTextReturn,
	outputFixes = sinon.stub(),
	getErrorResults,
}) {
	const fakeESLint = sinon.mock().withExactArgs(constructorMatcher);

	Object.defineProperties(
		fakeESLint.prototype,
		Object.getOwnPropertyDescriptors(ESLint.prototype),
	);

	if (lintTextReturn !== undefined) {
		sinon.stub(fakeESLint.prototype, "lintText").returns(lintTextReturn);
	} else {
		sinon.stub(fakeESLint.prototype, "lintFiles").returns(lintFilesReturn);
	}

	sinon
		.stub(fakeESLint.prototype, "loadFormatter")
		.returns({ format: () => "done" });

	fakeESLint.outputFixes = outputFixes;

	if (getErrorResults) {
		fakeESLint.getErrorResults = getErrorResults;
	}

	return fakeESLint;
}

/**
 * Creates a proxyquired CLI with a fake ESLint class.
 * @param {Function} fakeESLint - fake ESLint class
 * @param {object} log - log spy object
 * @returns {object} localCLI
 */
function createLocalCLI(fakeESLint, log) {
	return proxyquire("../../lib/cli", {
		"./eslint/eslint": { ESLint: fakeESLint },
		"./shared/logging": log,
	});
}

/**
 * Creates a standard fake report array.
 * @param {number} severity - message severity
 * @param {number} errorCount
 * @param {number} warningCount
 * @returns {Array}
 */
function createFakeReport(severity, errorCount, warningCount) {
	return [
		{
			filePath: "./foo.js",
			output: "bar",
			messages: [{ severity, message: "Fake message" }],
			errorCount,
			warningCount,
		},
	];
}

/**
 * Sets up process.cwd override and restores it in afterEach.
 * @param {Function} getFixturePath - fixture path helper
 * @returns {object} hooks object with beforeEach/afterEach
 */
function withFixtureCwd(getFixturePath) {
	let originalCwd;
	return {
		setup() {
			originalCwd = process.cwd;
			process.cwd = () => getFixturePath();
		},
		teardown() {
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

		const expectedBaseFlags = [
			"--basePath",
			process.cwd(),
		];

		it("should return the config file in the project root when no argument is passed", async () => {
			const flags = await cli.calculateInspectConfigFlags();

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), "eslint.config.js"),
				...expectedBaseFlags,
			]);
		});

		it("should return the override config file when an argument is passed", async () => {
			const flags = await cli.calculateInspectConfigFlags("foo.js");

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), "foo.js"),
				...expectedBaseFlags,
			]);
		});

		it("should return the override config file when an argument is passed with a path", async () => {
			const flags = await cli.calculateInspectConfigFlags("bar/foo.js");

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), "bar/foo.js"),
				...expectedBaseFlags,
			]);
		});
	});

	describe("execute()", () => {
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

		function getFixturePath(...args) {
			return path.join(fixtureDir, ...args);
		}

		before(function () {
			this.timeout(60 * 1000); // eslint-disable-line no-invalid-this -- Mocha API
			fixtureDir = `${os.tmpdir()}/eslint/fixtures`;
			sh.mkdir("-p", fixtureDir);
			sh.cp("-r", "./tests/fixtures/.", fixtureDir);
		});

		afterEach(() => {
			sinon.restore();
			log.info.resetHistory();
			log.error.resetHistory();
			log.warn.resetHistory();
		});

		after(() => {
			sh.rm("-r", fixtureDir);
		});

		describe("execute()", () => {
			it("should return error when text with incorrect quotes is passed as argument", async () => {
				const configFile = getFixturePath("configurations", "quotes-error.js");
				const result = await cli.execute(
					`--no-config-lookup -c ${configFile} --stdin --stdin-filename foo.js`,
					"var foo = 'bar';",
				);

				assert.strictEqual(result, 1);
			});

			it("should not print debug info when passed the empty string as text", async () => {
				const result = await cli.execute(
					["argv0", "argv1", "--stdin", "--no-config-lookup", "--stdin-filename", "foo.js"],
					"",
				);

				assert.strictEqual(result, 0);
				assert.isTrue(log.info.notCalled);
			});

			it("should exit with console error when passed unsupported arguments", async () => {
				const filePath = getFixturePath("files");
				const result = await cli.execute(`--blah --another ${filePath}`);

				assert.strictEqual(result, 2);
			});
		});

		describe("when given a config with rules with options and severity level set to error", () => {
			const cwdHooks = withFixtureCwd(getFixturePath);

			beforeEach(() => cwdHooks.setup());
			afterEach(() => cwdHooks.teardown());

			it("should exit with an error status (1)", async () => {
				const configPath = getFixturePath("configurations", "quotes-error.js");
				const filePath = getFixturePath("single-quoted.js");
				const exitStatus = await cli.execute(`--no-ignore --config ${configPath} ${filePath}`);

				assert.strictEqual(exitStatus, 1);
			});
		});

		describe("when there is a local config file", () => {
			const cwdHooks = withFixtureCwd(getFixturePath);

			beforeEach(() => cwdHooks.setup());
			afterEach(() => cwdHooks.teardown());

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
					const exit = await cli.execute(`--no-config-lookup -f json ${filePath}`);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given a valid built-in formatter name that uses rules meta", () => {
				const cwdHooks = withFixtureCwd(getFixturePath);

				beforeEach(() => cwdHooks.setup());
				afterEach(() => cwdHooks.teardown());

				it("should execute without any errors", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-ignore -f json-with-metadata ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 0);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.deepStrictEqual(metadata, {
						cwd: process.cwd(),
						rulesMeta: {},
					});
				});
			});

			describe("when the `--color` / `--no-color` options are passed", () => {
				it("should pass `color: true` to the formatter metadata when `--color` is set", async () => {
					const filePath = getFixturePath("syntax-error.js");
					const exit = await cli.execute(`--color -f json-with-metadata ${filePath}`);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, true);
				});

				it("should pass `color: false` to the formatter metadata when `--no-color` is set", async () => {
					const filePath = getFixturePath("syntax-error.js");
					const exit = await cli.execute(`--no-color -f json-with-metadata ${filePath}`);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, false);
				});

				it("should omit `color` metadata when no flag is set", async () => {
					const filePath = getFixturePath("syntax-error.js");
					const formatterPath = getFixturePath("formatters", "context.js");
					const exit = await cli.execute(`-f ${formatterPath} ${filePath}`);

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
						const formatterPath = getFixturePath("formatters", "context.js");
						const exit = await cli.execute(
							`--no-ignore -f ${formatterPath} --max-warnings 1 --rule 'quotes: warn' --no-config-lookup`,
							"'hello world';",
						);

						assert.strictEqual(exit, 0);
						assert.notProperty(log.info.getCall(0).args[0], "maxWarningsExceeded");
					});
				});
			});

			describe("when given an invalid built-in formatter name", () => {
				const cwdHooks = withFixtureCwd(getFixturePath);

				beforeEach(() => cwdHooks.setup());
				afterEach(() => cwdHooks.teardown());

				it("should execute with error", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`-f fakeformatter ${filePath} --no-config-lookup`);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given a valid formatter path", () => {
				const cwdHooks = withFixtureCwd(getFixturePath);

				beforeEach(() => cwdHooks.setup());
				afterEach(() => cwdHooks.teardown());

				it("should execute without any errors", async () => {
					const formatterPath = getFixturePath("formatters", "simple.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`-f ${formatterPath} ${filePath} --no-config-lookup`);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given an invalid formatter path", () => {
				const cwdHooks = withFixtureCwd(getFixturePath);

				beforeEach(() => cwdHooks.setup());
				afterEach(() => cwdHooks.teardown());

				it("should execute with error", async () => {
					const formatterPath = getFixturePath("formatters", "file-does-not-exist.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`--no-ignore -f ${formatterPath} ${filePath}`);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given an async formatter path", () => {
				const cwdHooks = withFixtureCwd(getFixturePath);

				beforeEach(() => cwdHooks.setup());
				afterEach(() => cwdHooks.teardown());

				it("should execute without any errors", async () => {
					const formatterPath = getFixturePath("formatters", "async.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`-f ${formatterPath} ${filePath} --no-config-lookup`);

					assert.strictEqual(log.info.getCall(0).args[0], "from async formatter");
					assert.strictEqual(exit, 0);
				});
			});
		});

		describe("Exit Codes", () => {
			const cwdHooks = withFixtureCwd(getFixturePath);

			beforeEach(() => cwdHooks.setup());
			afterEach(() => cwdHooks.teardown());

			describe("when executing a file
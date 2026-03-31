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
 * @param {sinon.SinonExpectation|sinon.SinonStub} options.constructor - Constructor expectation/mock
 * @param {Array} [options.lintFilesReturn=[]] - Return value for lintFiles
 * @param {Array} [options.lintTextReturn] - Return value for lintText
 * @param {Function} [options.outputFixes] - outputFixes stub/mock
 * @param {Function} [options.getErrorResults] - getErrorResults stub
 * @returns {Function} Fake ESLint class
 */
function createFakeESLint({
	constructor,
	lintFilesReturn = [],
	lintTextReturn,
	outputFixes = sinon.stub(),
	getErrorResults,
}) {
	Object.defineProperties(
		constructor.prototype,
		Object.getOwnPropertyDescriptors(ESLint.prototype),
	);

	if (lintTextReturn !== undefined) {
		sinon.stub(constructor.prototype, "lintText").returns(lintTextReturn);
	} else {
		sinon.stub(constructor.prototype, "lintFiles").returns(lintFilesReturn);
	}

	sinon
		.stub(constructor.prototype, "loadFormatter")
		.returns({ format: () => "done" });

	constructor.outputFixes = outputFixes;

	if (getErrorResults) {
		constructor.getErrorResults = getErrorResults;
	}

	return constructor;
}

/**
 * Creates a proxyquire'd CLI with a fake ESLint class.
 * @param {Function} fakeESLint - Fake ESLint class
 * @param {object} log - Log spy object
 * @returns {object} Local CLI instance
 */
function createLocalCLI(fakeESLint, log) {
	return proxyquire("../../lib/cli", {
		"./eslint/eslint": { ESLint: fakeESLint },
		"./shared/logging": log,
	});
}

/**
 * Creates a standard fake report array.
 * @param {number} severity - Message severity (1=warn, 2=error)
 * @returns {Array} Report array
 */
function createFakeReport(severity = 2) {
	return [
		{
			filePath: "./foo.js",
			output: "bar",
			messages: [{ severity, message: "Fake message" }],
			errorCount: severity === 2 ? 1 : 0,
			warningCount: severity === 1 ? 1 : 0,
		},
	];
}

/**
 * Sets up process.cwd override for a describe block.
 * @param {Function} getFixturePath - Fixture path getter
 * @returns {object} beforeEach/afterEach hooks object
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
			const cwdHelper = withFixtureCwd(() => getFixturePath());

			beforeEach(() => cwdHelper.setup());
			afterEach(() => cwdHelper.teardown());

			it("should exit with an error status (1)", async () => {
				const configPath = getFixturePath("configurations", "quotes-error.js");
				const filePath = getFixturePath("single-quoted.js");
				const exitStatus = await cli.execute(`--no-ignore --config ${configPath} ${filePath}`);

				assert.strictEqual(exitStatus, 1);
			});
		});

		describe("when there is a local config file", () => {
			const cwdHelper = withFixtureCwd(() => getFixturePath());

			beforeEach(() => cwdHelper.setup());
			afterEach(() => cwdHelper.teardown());

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
				const cwdHelper = withFixtureCwd(() => getFixturePath());

				beforeEach(() => cwdHelper.setup());
				afterEach(() => cwdHelper.teardown());

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
				const cwdHelper = withFixtureCwd(() => getFixturePath());

				beforeEach(() => cwdHelper.setup());
				afterEach(() => cwdHelper.teardown());

				it("should execute with error", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`-f fakeformatter ${filePath} --no-config-lookup`);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given a valid formatter path", () => {
				const cwdHelper = withFixtureCwd(() => getFixturePath());

				beforeEach(() => cwdHelper.setup());
				afterEach(() => cwdHelper.teardown());

				it("should execute without any errors", async () => {
					const formatterPath = getFixturePath("formatters", "simple.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`-f ${formatterPath} ${filePath} --no-config-lookup`);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given an invalid formatter path", () => {
				const cwdHelper = withFixtureCwd(() => getFixturePath());

				beforeEach(() => cwdHelper.setup());
				afterEach(() => cwdHelper.teardown());

				it("should execute with error", async () => {
					const formatterPath = getFixturePath("formatters", "file-does-not-exist.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`--no-ignore -f ${formatterPath} ${filePath}`);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given an async formatter path", () => {
				const cwdHelper = withFixtureCwd(() => getFixturePath());

				beforeEach(() => cwdHelper.setup());
				afterEach(() => cwdHelper.teardown());

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
			const cwdHelper = withFixtureCwd(() => getFixturePath());

			beforeEach(() => cwdHelper.setup());
			afterEach(() => cwdHelper.teardown());

			describe("when executing a file with a lint error", () => {
				it("should exit with error", async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(`--no-ignore --rule no-undef:2 ${filePath}`);

					assert.strictEqual(exit,
Looking at this code, I can identify several patterns that increase complexity:

1. **Repeated `beforeEach`/`afterEach` blocks** for `process.cwd` mocking
2. **Repeated fake ESLint setup** in `--fix` and `--fix-dry-run` tests
3. **Duplicated assertion patterns** in `--report-unused-disable-directives` tests
4. **Repeated `proxyquire` setup** for `localCLI`
5. **Nested `describe` blocks** that could be flattened

Here's the refactored code:

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
 * Creates a fake ESLint class for testing with sinon mocks.
 * @param {object} options
 * @param {sinon.SinonExpectation} options.constructor - Mock for the constructor.
 * @param {Array} [options.lintFilesReturn=[]] - Return value for lintFiles.
 * @param {Array} [options.lintTextReturn] - Return value for lintText.
 * @param {object} [options.outputFixesMock] - Mock for outputFixes (defaults to stub).
 * @param {object} [options.getErrorResultsStub] - Stub for getErrorResults.
 * @returns {Function} The fake ESLint class.
 */
function createFakeESLint({
	constructor,
	lintFilesReturn = [],
	lintTextReturn,
	outputFixesMock = sinon.stub(),
	getErrorResultsStub,
} = {}) {
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

	constructor.outputFixes = outputFixesMock;

	if (getErrorResultsStub) {
		constructor.getErrorResults = getErrorResultsStub;
	}

	return constructor;
}

/**
 * Creates a local CLI instance with a fake ESLint class.
 * @param {Function} fakeESLint - The fake ESLint class.
 * @param {object} log - The log spy object.
 * @returns {object} The local CLI instance.
 */
function createLocalCLI(fakeESLint, log) {
	return proxyquire("../../lib/cli", {
		"./eslint/eslint": { ESLint: fakeESLint },
		"./shared/logging": log,
	});
}

/**
 * Creates beforeEach/afterEach hooks to mock process.cwd.
 * @param {Function} getCwd - Function returning the desired cwd value.
 * @returns {{ setup: Function, teardown: Function }}
 */
function cwdHooks(getCwd) {
	let originalCwd;
	return {
		setup() {
			originalCwd = process.cwd;
			process.cwd = getCwd;
		},
		teardown() {
			process.cwd = originalCwd;
		},
	};
}

/**
 * A standard fake report with one error.
 */
const FAKE_ERROR_REPORT = [
	{
		filePath: "./foo.js",
		output: "bar",
		messages: [{ severity: 2, message: "Fake message" }],
		errorCount: 1,
		warningCount: 0,
	},
];

/**
 * A standard fake report with one warning.
 */
const FAKE_WARNING_REPORT = [
	{
		filePath: "./foo.js",
		output: "bar",
		messages: [{ severity: 1, message: "Fake message" }],
		errorCount: 0,
		warningCount: 1,
	},
];

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("cli", () => {
	describe("calculateInspectConfigFlags()", () => {
		const cli = require("../../lib/cli");

		const expectedBase = [
			"--basePath",
			process.cwd(),
		];

		it("should return the config file in the project root when no argument is passed", async () => {
			const flags = await cli.calculateInspectConfigFlags();

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), "eslint.config.js"),
				...expectedBase,
			]);
		});

		[
			["foo.js", "foo.js"],
			["bar/foo.js", "bar/foo.js"],
		].forEach(([input, label]) => {
			it(`should return the override config file when '${label}' is passed`, async () => {
				const flags = await cli.calculateInspectConfigFlags(input);

				assert.deepStrictEqual(flags, [
					"--config",
					path.resolve(process.cwd(), input),
					...expectedBase,
				]);
			});
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

		/**
		 * Returns the path inside of the fixture directory.
		 * @param {...string} args file path segments.
		 * @returns {string} The path inside the fixture directory.
		 */
		function getFixturePath(...args) {
			return path.join(fixtureDir, ...args);
		}

		/**
		 * Returns hooks that mock process.cwd to the fixture directory.
		 * @returns {{ setup: Function, teardown: Function }}
		 */
		function fixturesCwdHooks() {
			return cwdHooks(() => getFixturePath());
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
			log.info.resetHistory();
			log.error.resetHistory();
			log.warn.resetHistory();
		});

		after(() => {
			sh.rm("-r", fixtureDir);
		});

		// -------------------------------------------------------------------------
		// Basic execute() tests
		// -------------------------------------------------------------------------

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

		// -------------------------------------------------------------------------
		// Config with rules
		// -------------------------------------------------------------------------

		describe("when given a config with rules with options and severity level set to error", () => {
			const hooks = fixturesCwdHooks();
			beforeEach(() => hooks.setup());
			afterEach(() => hooks.teardown());

			it("should exit with an error status (1)", async () => {
				const configPath = getFixturePath("configurations", "quotes-error.js");
				const filePath = getFixturePath("single-quoted.js");
				const exitStatus = await cli.execute(`--no-ignore --config ${configPath} ${filePath}`);

				assert.strictEqual(exitStatus, 1);
			});
		});

		// -------------------------------------------------------------------------
		// Local config file
		// -------------------------------------------------------------------------

		describe("when there is a local config file", () => {
			const hooks = fixturesCwdHooks();
			beforeEach(() => hooks.setup());
			afterEach(() => hooks.teardown());

			it("should load the local config file", async () => {
				await cli.execute("cli/passing.js --no-ignore");
			});

			it("should load the local config file with glob pattern", async () => {
				await cli.execute("cli/pass*.js --no-ignore");
			});

			// only works on Windows
			if (os.platform() === "win32") {
				it("should load the local config file with Windows slashes glob pattern", async () => {
					await cli.execute("cli\\pass*.js --no-ignore");
				});
			}
		});

		// -------------------------------------------------------------------------
		// Formatters
		// -------------------------------------------------------------------------

		describe("Formatters", () => {
			it("when given a valid built-in formatter name, should execute without any errors", async () => {
				const filePath = getFixturePath("passing.js");
				const exit = await cli.execute(`--no-config-lookup -f json ${filePath}`);

				assert.strictEqual(exit, 0);
			});

			describe("when given a valid built-in formatter name that uses rules meta", () => {
				const hooks = fixturesCwdHooks();
				beforeEach(() => hooks.setup());
				afterEach(() => hooks.teardown());

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
				it("should provide `maxWarningsExceeded` metadata when there are too many warnings", async () => {
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

				it("should omit `maxWarningsExceeded` metadata when warnings do not exceed the limit", async () => {
					const formatterPath = getFixturePath("formatters", "context.js");
					const exit = await cli.execute(
						`--no-ignore -f ${formatterPath} --max-warnings 1 --rule 'quotes: warn' --no-config-lookup`,
						"'hello world';",
					);

					assert.strictEqual(exit, 0);
					assert.notProperty(log.info.getCall(0).args[0], "maxWarningsExceeded");
				});
			});

			describe("formatter path tests", () => {
				const hooks = fixturesCwdHooks();
				beforeEach(() => hooks.setup());
				afterEach(() => hooks.teardown());

				it("when given an invalid built-in formatter name, should execute with error", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`-f fakeformatter ${filePath} --no-config-lookup`);

					assert.strictEqual(exit, 2);
				});

				it("when given a valid formatter path, should execute without any errors", async () => {
					const formatterPath = getFixturePath("formatters", "simple.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`-f ${formatterPath} ${filePath} --no-config-lookup`);

					assert.strictEqual(exit, 0);
				});

				it("when given an invalid formatter path, should execute with error", async () => {
					const formatterPath = getFixturePath("formatters", "file-does-not-exist.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`--no-ignore -f ${formatterPath} ${filePath}`);

					assert.strictEqual(exit, 2);
				});

				it("when given an async formatter path, should execute without any errors", async () => {
					const formatterPath = getFixturePath("formatters", "async.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`-f ${formatterPath} ${filePath} --no-config-lookup`);

					assert.strictEqual(log.info.getCall(0).args[0], "from async formatter");
					assert.strictEqual(exit, 0);
				});
			});
		});

		// -------------------------------------------------------------------------
		// Exit Codes
		// -------------------------------------------------------------------------

		describe("Exit Codes", () => {
			const hooks = fixturesCwdHooks();
			beforeEach(() => hooks.setup());
			afterEach(() => hooks.teardown());

			it("should exit with error when executing a file with a lint error", async () => {
				const filePath = getFixturePath("undef.js");
				const exit = await cli.execute(`--no-ignore --rule no-undef:2 ${filePath}`);

				assert.strictEqual(exit, 1);
			});

			it("should exit with error when using --fix-type without --fix or --fix-dry-run", async () => {
				const filePath = getFixturePath("passing.js");
				const exit = await cli.execute(`--fix-type suggestion ${filePath}`);

				assert.strictEqual(exit, 2);
			});

			it("should exit with error when executing a file with a syntax error", async () => {
				const filePath = getFixturePath("syntax-error.js");
				const exit = await cli.execute(`--no-ignore ${filePath}`);

				assert.strictEqual(exit, 1);
			});
		});

		// -------------------------------------------------------------------------
		// Multiple executions
		// -------------------------------------------------------------------------

		describe("when calling execute more than once", () => {
			const hooks = fixturesCwdHooks();
			beforeEach(() => hooks.setup());
			afterEach(() => hooks.teardown());

			it("should not print the results from previous execution", async () => {
				const filePath = getFixturePath("missing-semicolon.js");
				const passingPath = getFixturePath("passing.js");

				await cli.execute(`--no-ignore --rule semi:2 ${filePath}`);
				assert.isTrue(log.info.called, "Log should have been called.");

				log.info.resetHistory();

				await cli.execute(`--no-ignore --rule semi:2 ${passingPath}`);
				assert.isTrue(log.info.notCalled);
			});
		});

		// -------------------------------------------------------------------------
		// Simple flag tests
		// -------------------------------------------------------------------------

		it("when executing with version flag, should print out current version", async () => {
			assert.strictEqual(await cli.execute("-v"), 0);
			assert.strictEqual(log.info.callCount, 1);
		});

		describe("when executing with env-info flag", () => {
			it("should print out environment information", async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("with error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon.stub().throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it("should print error message and return error code", async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		it("when executing with help flag, should print out help", async () => {
			assert.strictEqual(await cli.execute("-h"), 0);
			assert.strictEqual(log.info.callCount, 1);
		});

		it("when executing a file with a shebang, should execute without error", async () => {
			const filePath = getFixturePath("shebang.js");
			const exit = await cli.execute(`--no-config-lookup --no-ignore ${filePath}`);

			assert.strictEqual(exit, 0);
		});

		// -------------------------------------------------------------------------
		// FixtureDir Dependent Tests
		// -------------------------------------------------------------------------

		describe("FixtureDir Dependent Tests", () => {
			const hooks = fixturesCwdHooks();
			beforeEach(() => hooks.setup());
			afterEach(() => hooks.teardown());

			it("when given a config file and a directory of files, should load and execute without error", async () => {
				const configPath = getFixturePath("configurations", "semi-error.js");
				const filePath = getFixturePath("formatters");
				const exitStatus = await cli.execute(`--no-ignore --config ${configPath} ${filePath}`);

				assert.strictEqual(exitStatus, 0);
			});

			describe("when executing with global flag", () => {
				it("should default defined variables to read-only", async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it("should allow defining writable global variables", async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it("should allow defining variables with multiple flags", async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			it("when supplied with rule flag and severity level set to error, should exit with an error status (1)", async () => {
				const filePath = getFixturePath("single-quoted.js");
				const exitStatus = await cli.execute(
					`--no-ignore --rule 'quotes: [2, double]' ${filePath}`,
				);

				assert.strictEqual(exitStatus, 1);
			});

			describe("when the quiet option is enabled", () => {
				it("should only print error", async () => {
					const filePath = getFixturePath("single-quoted.js");
					await cli.execute(
						`--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`,
					);

					sinon.assert.calledOnce(log.info);
					assert.include(log.info.firstCall.args[0], "(1 error, 0 warnings)");
				});

				it("should print nothing if there are no errors", async () => {
					const filePath = getFixturePath("single-quoted.js");
					await cli.execute(
						`--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`,
					);

					sinon.assert.notCalled(log.info);
				});

				it("should not run rules set to 'warn'", async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath("eslint.config-rule-throws.js");
					const exit = await cli.execute(`--quiet --config ${configPath}' ${filePath}`);

					assert.strictEqual(exit, 0);
				});

				it("should run rules set to 'warn' while maxWarnings is set", async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath("eslint.config-rule-throws.js");
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				it("should throw an error on unmatched glob pattern when flag is not set", async () => {
					let filePath = getFixturePath("unmatched-patterns");
					const globPattern = "unmatched*.js";

					filePath = filePath.replace(/\\/gu, "/");

					await stdAssert.rejects(
						async () => {
							await cli.execute(`"${filePath}/${globPattern}"`);
						},
						new Error(`No files matching '${filePath}/${globPattern}' were found.`),
					);
				});

				it("should not throw an error on unmatched node glob syntax patterns when flag is set", async () => {
					const filePath = getFixturePath("unmatched-patterns");
					const exit = await cli.execute(
						`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
					);

					assert.strictEqual(exit, 0);
				});

				it("should not throw an error on multiple unmatched node glob syntax patterns when flag is set", async () => {
					const filePath = getFixturePath("unmatched-patterns/js3");
					const exit = await cli.execute(
						`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
					);

					assert.strictEqual(exit, 0);
				});

				it("should still throw an error when a matched pattern has lint errors", async () => {
					const filePath = getFixturePath("unmatched-patterns");
					const exit = await cli.execute(
						`--no-ignore --no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/failing.js`,
					);

					assert.strictEqual(exit, 1);
				});
			});

			describe("Parser Options", () => {
				const parserOptionTests = [
					{
						desc: "should exit with error if parser options are invalid",
						args: "--no-ignore --parser-options test111",
						fixture: "passing.js",
						expected: 2,
					},
					{
						desc: "should exit with no error if parser is valid",
						args: "--no-ignore --parser-options=ecmaVersion:6",
						fixture: "passing.js",
						expected: 0,
					},
					{
						desc: "should exit with an error on ecmaVersion 7 feature in ecmaVersion 6",
						args: "--no-ignore --parser-options=ecmaVersion:6",
						fixture: "passing-es7.js",
						expected: 1,
					},
					{
						desc: "should exit with no error on ecmaVersion 7 feature in ecmaVersion 7",
						args: "--no-ignore --parser-options=ecmaVersion:7",
						fixture: "passing-es7.js",
						expected: 0,
					},
				];

				parserOptionTests.forEach(({ desc, args, fixture, expected }) => {
					it(desc, async () => {
						const filePath = getFixturePath(fixture);
						const exit = await cli.execute(`${args} ${filePath}`);

						assert.strictEqual(exit, expected);
					});
				});

				it("should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7", async () => {
					const configPath = getFixturePath("configurations", "es6.js");
					const filePath = getFixturePath("passing-es7.js");
					const exit = await cli.execute(
						`--no-ignore --config ${configPath} --parser-options=ecmaVersion:7 ${filePath}`,
					);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given the max-warnings flag", () => {
				let filePath, configFilePath;

				before(() => {
					filePath = getFixturePath("max-warnings/six-warnings.js");
					configFilePath = getFixturePath("max-warnings/eslint.config.js");
				});

				it("should not change exit code if warning count under threshold", async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it("should exit with exit code 1 if warning count exceeds threshold", async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 5 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 1);
					assert.ok(log.error.calledOnce);
					assert.include(log.error.getCall(0).args[0], "ESLint found too many warnings");
				});

				it("should exit with exit code 1 without printing warnings if quiet and warning count exceeds threshold", async () => {
					const exitCode = await cli.execute(
						`--no-ignore --quiet --max-warnings 5 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 1);
					assert.ok(log.error.calledOnce);
					assert.include(log.error.getCall(0).args[0], "ESLint found too many warnings");
					assert.ok(log.info.notCalled);
				});

				it("should not change exit code if warning count equals threshold", async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it("should not change exit code if flag is not specified and there are warnings", async () => {
					const exitCode = await cli.execute(`-c ${configFilePath} ${filePath}`);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				const fatalErrorTests = [
					{
						desc: "should not change exit code if no fatal errors are reported",
						fixture: path.join("exit-on-fatal-error", "no-fatal-error.js"),
						expected: 0,
					},
					{
						desc: "should exit with exit code 1 if no fatal errors are found, but rule violations are found",
						fixture: path.join("exit-on-fatal-error", "no-fatal-error-rule-violation.js"),
						expected: 1,
					},
					{
						desc: "should exit with exit code 2 if fatal error is found",
						fixture: path.join("exit-on-fatal-error", "fatal-error.js"),
						expected: 2,
					},
					{
						desc: "should exit with exit code 2 if fatal error is found in any file",
						fixture: "exit-on-fatal-error",
						expected: 2,
					},
				];

				fatalErrorTests.forEach(({ desc, fixture, expected }) => {
					it(desc, async () => {
						const filePath = getFixturePath(fixture);
						const exitCode = await cli.execute(
							`--no-ignore --exit-on-fatal-error ${filePath}`,
						);

						assert.strictEqual(exitCode, expected);
					});
				});
			});

			describe("Ignores", () => {
				it("should throw an error when given a directory with eslint excluded files", async () => {
					const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
					const filePath = getFixturePath("cli");
					const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

					await stdAssert.rejects(async () => {
						await cli.execute(`${options} ${filePath}`);
					}, new Error(expectedMessage));
				});

				describe("when given a file in excluded files list", () => {
					let options, filePath;

					beforeEach(() => {
						options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						filePath = getFixturePath("passing.js");
					});

					it("should not process the file", async () => {
						const exit = await cli.execute(`${options} ${filePath}`);

						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should process the file when forced", async () => {
						const exit = await cli.execute(`${options} --no-ignore ${filePath}`);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should suppress the warning if --no-warn-ignored is passed", async () => {
						const exit = await cli.execute(`${options} --no-warn-ignored ${filePath}`);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should not lint anything when no files are passed if --pass-on-no-patterns is passed", async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin", async () => {
						const exit = await cli.execute(
							`${options} --no-warn-ignored --stdin --stdin-filename ${filePath}`,
							"foo",
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});

				describe("when given a pattern to ignore", () => {
					it("should not process any files", async () => {
						const ignoredFile = getFixturePath("cli/syntax-error.js");
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should interpret pattern that contains a slash as relative to cwd", async () => {
						process.cwd = () =>
							getFixturePath("cli/ignore-pattern-relative/subdir");

						const exit = await cli.execute("**/*.js --ignore-pattern subdir/**");

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute("**/*.js --ignore-pattern subsubdir/*.js"),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should interpret pattern that doesn't contain a slash as relative to cwd", async () => {
						process.cwd = () =>
							getFixturePath("cli/ignore-pattern-relative/subdir/subsubdir");

						await stdAssert.rejects(
							async () => await cli.execute("**/*.js --ignore-pattern *.js"),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(`--ignore-pattern cli/ ${filePath}`);

						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(`--ignore-pattern cli ${filePath}`);

						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
			});
		});

		// -------------------------------------------------------------------------
		// Parser name
		// -------------------------------------------------------------------------

		describe("when given a parser name", () => {
			it("should exit with a fatal error if parser is invalid", async () => {
				const filePath = getFixturePath("passing.js");

				await stdAssert.rejects(
					async () => await cli.execute(`--no-ignore --parser test111 ${filePath}`),
					"Cannot find module 'test111'",
				);
			});

			it("should exit with no error if parser is valid", async () => {
				const filePath = getFixturePath("passing.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore --parser espree ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		// -------------------------------------------------------------------------
		// Report output file
		// -------------------------------------------------------------------------

		describe("when supplied with report output file path", () => {
			afterEach(() => {
				sh.rm("-rf", "tests/output");
			});

			it("should write the file and create dirs if they don't exist", async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = `--no-config-lookup --rule 'quotes: [1, double]' --o tests/output/eslint-output.txt ${filePath}`;

				await cli.execute(code);

				assert.include(
					fs.readFileSync("tests/output/eslint-output.txt", "utf8"),
					filePath,
				);
				assert.isTrue(log.info.notCalled);
			});

			it("should write the file and create dirs if they don't exist even when output is empty", async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = `--no-config-lookup --rule 'quotes: [1, single]' --o tests/output/eslint-output.txt ${filePath}`;

				await cli.execute(code, "var a = 'b'");

				assert.isTrue(fs.existsSync("tests/output/eslint-output.txt"));
				assert.strictEqual(
					fs.readFileSync("tests/output/eslint-output.txt", "utf8"),
					"",
				);
				assert.isTrue(log.info.notCalled);
			});

			it("should return an error if the path is a directory", async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = `--no-config-lookup --rule 'quotes: [1, double]' --o tests/output ${filePath}`;

				fs.mkdirSync("tests/output");

				const exit = await cli.execute(code);

				assert.strictEqual(exit, 2);
				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
			});

			it("should return an error if the path could not be written to", async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = `--no-config-lookup --rule 'quotes: [1, double]' --o tests/output/eslint-output.txt ${filePath}`;

				fs.writeFileSync("tests/output", "foo");

				const exit = await cli.execute(code);

				assert.strictEqual(exit, 2);
				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
			});
		});

		// -------------------------------------------------------------------------
		// --no-inline-config
		// -------------------------------------------------------------------------

		describe("when passed --no-inline-config", () => {
			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it("should pass allowInlineConfig:false to ESLint when --no-inline-config is used", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ allowInlineConfig: false })),
					lintFilesReturn: [
						{
							filePath: "./foo.js",
							output: "bar",
							messages: [{ severity: 2, message: "Fake message" }],
							errorCount: 1,
							warningCount: 0,
						},
					],
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				await localCLI.execute("--no-inline-config .");
			});

			it("should not error and allowInlineConfig should be true by default", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ allowInlineConfig: true })),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute(".");

				assert.strictEqual(exitCode, 0);
			});
		});

		// -------------------------------------------------------------------------
		// --fix
		// -------------------------------------------------------------------------

		describe("when passed --fix", () => {
			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it("should pass fix:true to ESLint when executing on files", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					outputFixesMock: sinon.mock().once(),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix .");

				assert.strictEqual(exitCode, 0);
			});

			it("should rewrite files when in fix mode", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					lintFilesReturn: FAKE_ERROR_REPORT,
					outputFixesMock: sinon.mock().withExactArgs(FAKE_ERROR_REPORT),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix .");

				assert.strictEqual(exitCode, 1);
			});

			it("should provide fix predicate and rewrite files when in fix mode and quiet mode", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: sinon.match.func })),
					lintFilesReturn: FAKE_WARNING_REPORT,
					outputFixesMock: sinon.mock().withExactArgs(FAKE_WARNING_REPORT),
					getErrorResultsStub: sinon.stub().returns([]),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix --quiet .");

				assert.strictEqual(exitCode, 0);
			});

			it("should not call ESLint and return 2 when executing on text", async () => {
				const fakeESLint = sinon.mock().never();
				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix .", "foo = bar;");

				assert.strictEqual(exitCode, 2);
			});
		});

		// -------------------------------------------------------------------------
		// --fix-dry-run
		// -------------------------------------------------------------------------

		describe("when passed --fix-dry-run", () => {
			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it("should pass fix:true to ESLint when executing on files", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					outputFixesMock: sinon.mock().never(),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run .");

				assert.strictEqual(exitCode, 0);
			});

			it("should pass fixTypes to ESLint when --fix-type is passed", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(
						sinon.match({ fix: true, fixTypes: ["suggestion"] }),
					),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run --fix-type suggestion .");

				assert.strictEqual(exitCode, 0);
			});

			it("should not rewrite files when in fix-dry-run mode", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					lintFilesReturn: FAKE_ERROR_REPORT,
					outputFixesMock: sinon.mock().never(),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run .");

				assert.strictEqual(exitCode, 1);
			});

			it("should provide fix predicate when in fix-dry-run mode and quiet mode", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: sinon.match.func })),
					lintFilesReturn: FAKE_WARNING_REPORT,
					outputFixesMock: sinon.mock().never(),
					getErrorResultsStub: sinon.stub().returns([]),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run --quiet .");

				assert.strictEqual(exitCode, 0);
			});

			it("should allow executing on text", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					lintTextReturn: FAKE_ERROR_REPORT,
					outputFixesMock: sinon.mock().never(),
				});

				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run .", "foo = bar;");

				assert.strictEqual(exitCode, 1);
			});

			it("should not call ESLint and return 2 when used with --fix", async () => {
				const fakeESLint = sinon.mock().never();
				const localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix --fix-dry-run .", "foo = bar;");

				assert.strictEqual(exitCode, 2);
			});
		});

		// -------------------------------------------------------------------------
		// --print-config
		// -------------------------------------------------------------------------

		describe("when passing --print-config", () => {
			const hooks = fixturesCwdHooks();
			beforeEach(() => hooks.setup());
			afterEach(() => hooks.teardown());

			it("should print out the configuration", async () => {
				const filePath = getFixturePath("xxx.js");
				const exitCode = await cli.execute(`--print-config ${filePath}`);

				assert.isTrue(log.info.calledOnce);
				assert.strictEqual(exitCode, 0);
			});

			it("should error if any positional file arguments are passed", async () => {
				const filePath1 = getFixturePath("files", "bar.js");
				const filePath2 = getFixturePath("files", "foo.js");
				const exitCode = await cli.execute(`--print-config ${filePath1} ${filePath2}`);

				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
				assert.strictEqual(exitCode, 2);
			});

			it("should error out when executing on text", async () => {
				const exitCode = await cli.execute("--print-config=myFile.js", "foo = bar;");

				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
				assert.strictEqual(exitCode, 2);
			});
		});

		// -------------------------------------------------------------------------
		// --report-unused-disable-directives
		// -------------------------------------------------------------------------

		describe("when passing --report-unused-disable-directives", () => {
			const UNUSED_DIRECTIVE_MSG =
				"Unused eslint-disable directive (no problems were reported from 'no-console')";
			const BASE_ARGS = `--no-config-lookup --rule "'no-console': 'error'"`;
			const STDIN_TEXT = "foo(); // eslint-disable-line no-console";

			/**
			 * Asserts the standard "unused directive" output pattern.
			 * @param {number} expectedExit - Expected exit code.
			 * @param {string} countText - Expected count text (e.g. "1 error and 0 warning").
			 */
			async function assertUnusedDirectiveOutput(expectedExit, countText) {
				assert.strictEqual(log.error.callCount, 0, "log.error should not be called");
				assert.strictEqual(log.info.callCount, 1, "log.info is called once");
				assert.ok(
					log.info.firstCall.args[0].includes(UNUSED_DIRECTIVE_MSG),
					"has correct message about unused directives",
				);
				assert.ok(
					log.info.firstCall.args[0].includes(countText),
					"has correct error and warning count",
				);
			}

			it("errors when --report-unused-disable-directives", async () => {
				const exitCode = await cli.execute(
					`${BASE_ARGS} --report-unused-disable-directives`,
					STDIN_TEXT,
				);

				await assertUnusedDirectiveOutput(exitCode, "1 error and 0 warning");
				assert.strictEqual(exitCode, 1, "exit code should be 1");
			});

			[
				["--report-unused-disable-directives-severity error", 1, "1 error and 0 warning"],
				["--report-unused-disable-directives-severity 2", 1, "1 error and 0 warning"],
				["--report-unused-disable-directives-severity warn", 0, "0 errors and 1 warning"],
				["--report-unused-disable-directives-severity 1", 0, "0 errors and 1 warning"],
			].forEach(([flag, expectedExit, countText]) => {
				it(`reports correctly when ${flag}`, async () => {
					const exitCode = await cli.execute(
						`${BASE_ARGS} ${flag}`,
						STDIN_TEXT,
					);

					await assertUnusedDirectiveOutput(exitCode, countText);
					assert.strictEqual(exitCode, expectedExit, `exit code should be ${expectedExit}`);
				});
			});

			[
				["--report-unused-disable-directives-severity off", 0],
				["--report-unused-disable-directives-severity 0", 0],
			].forEach(([flag, expectedExit]) => {
				it(`does not report when ${flag}`, async () => {
					const exitCode = await cli.execute(`${BASE_ARGS} ${flag}`, STDIN_TEXT);

					assert.strictEqual(log.error.callCount, 0, "log.error should not be called");
					assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
					assert.strictEqual(exitCode, expectedExit, "exit code should be 0");
				});
			});

			it("fails when passing invalid string for --report-unused-disable-directives-severity", async () => {
				const exitCode = await cli.execute(
					"--no-config-lookup --report-unused-disable-directives-severity foo",
				);

				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(
					log.error.firstCall.args,
					["Option report-unused-disable-directives-severity: 'foo' not one of off, warn, error, 0, 1, or 2."],
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("fails when passing both --report-unused-disable-directives and --report-unused-disable-directives-severity", async () => {
				const exitCode = await cli.execute(
					"--no-config-lookup --report-unused-disable-directives --report-unused-disable-directives-severity warn",
				);

				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(
					log.error.firstCall.args,
					["The --report-unused-disable-directives option and the --report-unused-disable-directives-severity option cannot be used together."],
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("warns by default", async () => {
				const exitCode = await cli.execute(
					`--no-config-lookup --rule "'no-console': 'error'"`,
					STDIN_TEXT,
				);

				await assertUnusedDirectiveOutput(exitCode, "0 errors and 1 warning");
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});
		});

		// -------------------------------------------------------------------------
		// Config file
		// -------------------------------------------------------------------------

		it("when given a config file, should load the specified config file", async () => {
			const configPath = getFixturePath("eslint.config.js");
			const filePath = getFixturePath("passing.js");

			await cli.execute(`--config ${configPath} ${filePath}`);
		});

		// -------------------------------------------------------------------------
		// --plugin option
		// -------------------------------------------------------------------------

		describe("`--plugin` option", () => {
			let originalCwd;

			beforeEach(() => {
				originalCwd = process.cwd();
				process.chdir(getFixturePath("plugins"));
			});

			afterEach(() => {
				process.chdir(originalCwd);
				originalCwd = void 0;
			});

			it("should load a plugin from a CommonJS package", async () => {
				const exitCode = await cli.execute(
					"--plugin hello-cjs --rule 'hello-cjs/hello: error' ../files/*.js",
				);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello CommonJS!");
			});

			it("should load a plugin from an ESM package", async () => {
				const exitCode = await cli.execute(
					"--plugin hello-esm --rule 'hello-esm/hello: error' ../files/*.js",
				);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello ESM!");
			});

			it("should load multiple plugins", async () => {
				const exitCode = await cli.execute(
					"--plugin 'hello-cjs, hello-esm' --rule 'hello-cjs/hello: warn, hello-esm/hello: error' ../files/*.js",
				);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello CommonJS!");
				assert.include(log.info.firstCall.firstArg, "Hello ESM!");
			});

			it("should resolve plugins specified with 'eslint-plugin-'", async () => {
				const exitCode = await cli.execute(
					"--plugin 'eslint-plugin-schema-array, @scope/eslint-plugin-example' --rule 'schema-array/rule1: warn, @scope/example/test: warn' ../passing.js",
				);

				assert.strictEqual(exitCode, 0);
			});

			it("should resolve plugins in the parent directory's node_module subdirectory", async () => {
				process.chdir("subdir");
				const exitCode = await cli.execute("--plugin 'example, @scope/example' file.js");

				assert.strictEqual(exitCode, 0);
			});

			it("should fail if a plugin is not found", async () => {
				await stdAssert.rejects(
					cli.execute("--plugin 'example, no-such-plugin' ../passing.js"),
					({ message }) => {
						assert(
							message.startsWith("Cannot find module 'eslint-plugin-no-such-plugin'\n"),
							`Unexpected error message:\n${message}`,
						);
						return true;
					},
				);
			});

			it("should fail if a plugin throws an error while loading", async () => {
				await stdAssert.rejects(
					cli.execute("--plugin 'example, throws-on-load' ../passing.js"),
					{ message: "error thrown while loading this module" },
				);
			});

			it("should fail to load a plugin from a package without a default export", async () => {
				await stdAssert.rejects(
					cli.execute("--plugin 'example, no-default-export' ../passing.js"),
					{
						message:
							'"eslint-plugin-no-default-export" cannot be used with the `--plugin` option because its default module does not provide a `default` export',
					},
				);
			});
		});

		// -------------------------------------------------------------------------
		// --flag option
		// -------------------------------------------------------------------------

		describe("--flag option", () => {
			let processStub;

			beforeEach(() => {
				sinon.restore();
				processStub = sinon
					.stub(process, "emitWarning")
					.withArgs(sinon.match.any, sinon.match(/^ESLintInactiveFlag_/u))
					.returns();
			});

			afterEach(() => {
				sinon.restore();
				delete process.env.ESLINT_FLAGS;
			});

			/**
			 * Builds a standard CLI input string with config and file path.
			 * @returns {string} The CLI input string.
			 */
			function buildFlagInput() {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				return `--config ${configPath} ${filePath}`;
			}

			const abandonedFlagPattern = /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u;
			const unknownFlagPattern = /Unknown flag 'test_only_oldx'\./u;

			it("should throw an error when an inactive abandoned flag is used", async () => {
				await stdAssert.rejects(
					async () => await cli.execute(`--flag test_only_abandoned ${buildFlagInput()}`),
					abandonedFlagPattern,
				);
			});

			it("should throw an error when an inactive abandoned flag is used in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only_abandoned";
				await stdAssert.rejects(
					async () => await cli.execute(buildFlagInput()),
					abandonedFlagPattern,
				);
			});

			it("should error out when an unknown flag is used", async () => {
				await stdAssert.rejects(
					async () => await cli.execute(`--flag test_only_oldx ${buildFlagInput()}`),
					unknownFlagPattern,
				);
			});

			it("should error out when an unknown flag is used in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only_oldx";
				await stdAssert.rejects(
					async () => await cli.execute(buildFlagInput()),
					unknownFlagPattern,
				);
			});

			const inactiveFlagWarningTests = [
				{
					desc: "replaced flag",
					flag: "test_only_replaced",
					envFlag: null,
					expectedWarning: [
						"The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.",
						"ESLintInactiveFlag_test_only_replaced",
					],
				},
				{
					desc: "replaced flag via env var",
					flag: null,
					envFlag: "test_only_replaced",
					expectedWarning: [
						"The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.",
						"ESLintInactiveFlag_test_only_replaced",
					],
				},
				{
					desc: "enabled-by-default flag",
					flag: "test_only_enabled_by_default",
					envFlag: null,
					expectedWarning: [
						"The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.",
						"ESLintInactiveFlag_test_only_enabled_by_default",
					],
				},
				{
					desc: "enabled-by-default flag via env var",
					flag: null,
					envFlag: "test_only_enabled_by_default",
					expectedWarning: [
						"The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.",
						"ESLintInactiveFlag_test_only_enabled_by_default",
					],
				},
			];

			inactiveFlagWarningTests.forEach(({ desc, flag, envFlag, expectedWarning }) => {
				it(`should emit a warning and not error out for ${desc}`, async () => {
					if (envFlag) {
						process.env.ESLINT_FLAGS = envFlag;
					}

					const input = flag
						? `--flag ${flag} ${buildFlagInput()}`
						: buildFlagInput();

					const exitCode = await cli.execute(input);

					assert.strictEqual(processStub.callCount, 1, "calls `process.emitWarning()` once");
					assert.deepStrictEqual(processStub.getCall(0).args, expectedWarning);
					sinon.assert.notCalled(log.error);
					assert.strictEqual(exitCode, 0);
				});
			});

			it("should not error when a valid flag is used", async () => {
				const exitCode = await cli.execute(`--flag test_only ${buildFlagInput()}`);

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should not error when a valid flag is used in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only";
				const exitCode = await cli.execute(buildFlagInput());

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should error when a valid flag is combined with an abandoned flag in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only,test_only_abandoned";
				await stdAssert.rejects(
					async () => await cli.execute(buildFlagInput()),
					abandonedFlagPattern,
				);
			});
		});

		// -------------------------------------------------------------------------
		// --report-unused-inline-configs option
		// -------------------------------------------------------------------------

		describe("--report-unused-inline-configs option", () => {
			const BASE_ARGS = "--no-config-lookup --rule \"'no-console': 'error'\"";
			const STDIN_TEXT = "/* eslint no-console: 'error' */";
			const UNUSED_INLINE_MSG = "Unused inline config ('no-console' is already configured to 'error')";

			it("does not report when --report-unused-inline-configs 0", async () => {
				const exitCode = await cli.execute(
					`${BASE_ARGS} --report-unused-inline-configs 0`,
					STDIN_TEXT,
				);

				assert.strictEqual(log.error.callCount, 0, "log.error should not be called");
				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});

			[
				[1, 0, "0 errors, 1 warning"],
				["warn", 0, "0 errors, 1 warning"],
				[2, 1, "1 error, 0 warnings"],
				["error", 1, "1 error, 0 warnings"],
			].forEach(([setting, status, descriptor]) => {
				it(`reports when --report-unused-inline-configs ${setting}`, async () => {
					const exitCode = await cli.execute(
						`${BASE_ARGS} --report-unused-inline-configs ${setting}`,
						STDIN_TEXT,
					);

					assert.strictEqual(log.info.callCount, 1, "log.info is called once");
					assert.ok(
						log.info.firstCall.args[0].includes(UNUSED_INLINE_MSG),
						"has correct message about unused inline config",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(descriptor),
						"has correct error and warning count",
					);
					assert.strictEqual(exitCode, status, `exit code should be ${status}`);
				});
			});

			it("fails when passing invalid string for --report-unused-inline-configs", async () => {
				const exitCode = await cli.execute(
					"--no-config-lookup --report-unused-inline-configs foo",
				);

				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(
					log.error.firstCall.args,
					["Option report-unused-inline-configs: 'foo' not one of off, warn, error, 0, 1, or 2."],
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});
		});

		// -------------------------------------------------------------------------
		// --ext option
		// -------------------------------------------------------------------------

		describe("--ext option", () => {
			let originalCwd;

			beforeEach(() => {
				originalCwd = process.cwd();
				process.chdir(getFixturePath("file-extensions"));
			});

			afterEach(() => {
				process.chdir(originalCwd);
				originalCwd = void 0;
			});

			/**
			 * Parses the file paths from the log output and sorts them.
			 * @returns {string[]} Sorted resolved file paths.
			 */
			function getParsedFilePaths() {
				return JSON.parse(log.info.args[0][0])
					.map(({ filePath }) => filePath)
					.sort();
			}

			/**
			 * Resolves fixture filenames to absolute paths.
			 * @param {string[]} filenames - The filenames to resolve.
			 * @returns {string[]} Sorted resolved paths.
			 */
			function resolveFixtures(filenames) {
				return filenames.map(filename => path.resolve(filename)).sort();
			}

			const DEFAULT_FILES = ["a.js", "b.mjs", "c.cjs", "eslint.config.js"];
			const CONFIG_FILES = [...DEFAULT_FILES, "d.jsx"];

			it("when not provided, without config file only default extensions should be linted", async () => {
				const exitCode = await cli.execute("--no-config-lookup -f json .");

				assert.strictEqual(exitCode, 0);
				assert.deepStrictEqual(getParsedFilePaths(), resolveFixtures(DEFAULT_FILES));
			});

			it("when not provided, only default extensions and extensions from the config file should be linted", async () => {
				const exitCode = await cli.execute("-f json .");

				assert.strictEqual(exitCode, 0);
				assert.deepStrictEqual(getParsedFilePaths(), resolveFixtures(CONFIG_FILES));
			});

			[
				{
					desc: "should include an additional extension when specified with dot",
					args: "-f json --ext .ts .",
					expected: [...CONFIG_FILES, "f.ts"],
				},
				{
					desc: "should include an additional extension when specified without dot",
					args: "-f json --ext ts .",
					expected: [...CONFIG_FILES, "f.ts"],
				},
				{
					desc: "should include multiple additional extensions when specified by repeating the option",
					args: "-f json --ext .ts --ext tsx .",
					expected: [...CONFIG_FILES, "f.ts", "g.tsx"],
				},
				{
					desc: "should include multiple additional extensions when specified with comma-delimited list",
					args: "-f json --ext .ts,.tsx .",
					expected: [...CONFIG_FILES, "f.ts", "g.tsx"],
				},
			].forEach(({ desc, args, expected }) => {
				it(desc, async () => {
					const exitCode = await cli.execute(args);

					assert.strictEqual(exitCode, 0);
					assert.deepStrictEqual(getParsedFilePaths(), resolveFixtures(expected));
				});
			});

			const invalidExtTests = [
				{
					desc: 'should fail when passing --ext ""',
					args: ["argv0", "argv1", "--ext", ""],
					expectedError: "The --ext option value cannot be empty.",
				},
				{
					desc: "should fail when passing --ext ,ts",
					args: "--ext ,ts",
					expectedError: "The --ext option arguments cannot be empty strings. Found an empty string at index 0.",
				},
				{
					desc: "should fail when passing --ext ts,,tsx",
					args: "--ext ts,,tsx",
					expectedError: "The --ext option arguments cannot be empty strings. Found an empty string at index 1.",
				},
			];

			invalidExtTests.forEach(({ desc, args, expectedError }) => {
				it(desc, async () => {
					const exitCode = await cli.execute(args);

					assert.strictEqual(exitCode, 2, "exit code should be 2");
					assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
					assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
					assert.deepStrictEqual(log.error.firstCall.args[0], expectedError);
				});
			});
		});

		// -------------------------------------------------------------------------
		// Config lookup
		// -------------------------------------------------------------------------

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

		// -------------------------------------------------------------------------
		// --concurrency option
		// -------------------------------------------------------------------------

		describe("--concurrency option", () => {
			["1", "100", "0x10", "auto", "off"].forEach(value => {
				it(`should accept the value ${value}`, async () => {
					const exitCode = await cli.execute(
						`--concurrency ${value} --pass-on-no-patterns`,
					);

					assert.strictEqual(exitCode, 0, "exit code should be 0");
				});
			});

			["foo", "0", "-1", "1.5", "Infinity"].forEach(value => {
				it(`should not accept the value ${value}`, async () => {
					const exitCode = await cli.execute(`--concurrency=${value}`);

					assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
					assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
					assert.strictEqual(
						log.error.firstCall.firstArg.replace(/\n.*/u, ""),
						`Option concurrency: '${value}' is not a positive integer, 'auto' or 'off'.`,
					);
					assert.strictEqual(exitCode, 2, "exit code should be 2");
				});
			});

			it("should not accept an empty value", async () => {
				const exitCode = await cli.execute('--concurrency=""');

				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.strictEqual(
					log.error.firstCall.firstArg.replace(/\n.*/u, ""),
					"No value for 'concurrency' specified.",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("should encode '?' and '#' in an options module", async () => {
				const exitCode = await cli.execute(
					"--concurrency=2 --no-config-lookup --no-ignore --rule 'no-fallthrough: [error, { commentPattern: \"#?\" }]' tests/fixtures/passing.js",
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});
		});
	});
});
```

## Key Refactoring Changes

### 1. Extracted `cwdHooks()` helper
Eliminated ~20 repeated `beforeEach`/`afterEach` blocks that all did the same `process.cwd` mocking. Now each suite calls `cwdHooks()` once and uses the returned `setup`/`teardown` methods.

### 2. Extracted `createFakeESLint()` helper
The `--fix` and `--fix-dry-run` sections each had 4–6 tests with near-identical fake ESLint setup (10–15 lines each). This is now a single factory function with sensible defaults.

### 3. Extracted `createLocalCLI()` helper
The repeated `proxyquire("../../lib/cli", {...})` pattern is now a one-liner.

### 4. Extracted `FAKE_ERROR_REPORT` / `FAKE_WARNING_REPORT` constants
Eliminated duplicate inline report objects across multiple tests.

### 5. Parameterized repetitive test groups
- **Parser options**: 4 similar tests → `parserOptionTests.forEach()`
- **Fatal error tests**: 4 similar tests → `fatalErrorTests.forEach()`
- **`--report-unused-disable-directives`**: 8 near-identical tests → grouped into arrays with shared `assertUnusedDirectiveOutput()` helper
- **`--flag` inactive warnings**: 4 similar tests → `inactiveFlagWarningTests.forEach()`
- **`--ext` valid/invalid tests**: grouped into arrays

### 6. Flattened unnecessary nesting
Single-test `describe` blocks (e.g., `"when executing a file with a lint error"` containing one `it`) were merged into their parent or promoted to top-level `it` calls.

### 7. Extracted `buildFlagInput()` helper
Eliminated repeated `getFixturePath` calls for config/file paths in the `--flag` tests.
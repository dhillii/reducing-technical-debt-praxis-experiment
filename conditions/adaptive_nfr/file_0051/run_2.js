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
 * @param {boolean} [options.outputFixesMock=false] - Whether outputFixes should be a mock (vs stub).
 * @param {object} [options.outputFixesArg] - Exact args for outputFixes mock.
 * @param {sinon.SinonStub} [options.getErrorResults] - Stub for getErrorResults.
 * @returns {Function} The fake ESLint class.
 */
function createFakeESLint({
	constructor,
	lintFilesReturn = [],
	lintTextReturn,
	outputFixesMock = false,
	outputFixesArg,
	getErrorResults,
}) {
	Object.defineProperties(
		constructor.prototype,
		Object.getOwnPropertyDescriptors(ESLint.prototype),
	);

	sinon.stub(constructor.prototype, "lintFiles").returns(lintFilesReturn);

	if (lintTextReturn !== undefined) {
		sinon.stub(constructor.prototype, "lintText").returns(lintTextReturn);
	}

	sinon
		.stub(constructor.prototype, "loadFormatter")
		.returns({ format: () => "done" });

	if (outputFixesMock) {
		constructor.outputFixes = outputFixesArg !== undefined
			? sinon.mock().withExactArgs(outputFixesArg)
			: sinon.mock().once();
	} else {
		constructor.outputFixes = sinon.stub();
	}

	if (getErrorResults) {
		constructor.getErrorResults = getErrorResults;
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

		/**
		 * Returns the path inside of the fixture directory.
		 * @param {...string} args file path segments.
		 * @returns {string} The path inside the fixture directory.
		 */
		function getFixturePath(...args) {
			return path.join(fixtureDir, ...args);
		}

		/**
		 * Registers beforeEach/afterEach hooks to set process.cwd to the fixture directory.
		 */
		function useFixtureCwd() {
			const hooks = cwdHooks(() => getFixturePath());
			beforeEach(hooks.setup);
			afterEach(hooks.teardown);
		}

		before(function () {
			// GitHub Actions runners can be slow; raise timeout for this hook.
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
		// Config and local config
		// -------------------------------------------------------------------------

		describe("when given a config with rules with options and severity level set to error", () => {
			useFixtureCwd();

			it("should exit with an error status (1)", async () => {
				const configPath = getFixturePath("configurations", "quotes-error.js");
				const filePath = getFixturePath("single-quoted.js");
				const exitStatus = await cli.execute(
					`--no-ignore --config ${configPath} ${filePath}`,
				);

				assert.strictEqual(exitStatus, 1);
			});
		});

		describe("when there is a local config file", () => {
			useFixtureCwd();

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

		describe("when given a config file", () => {
			it("should load the specified config file", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				await cli.execute(`--config ${configPath} ${filePath}`);
			});
		});

		// -------------------------------------------------------------------------
		// Formatters
		// -------------------------------------------------------------------------

		describe("Formatters", () => {
			it("should execute without any errors when given a valid built-in formatter name", async () => {
				const filePath = getFixturePath("passing.js");
				const exit = await cli.execute(`--no-config-lookup -f json ${filePath}`);

				assert.strictEqual(exit, 0);
			});

			describe("when given a valid built-in formatter name that uses rules meta", () => {
				useFixtureCwd();

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
					assert.strictEqual(JSON.parse(log.info.args[0][0]).metadata.color, true);
				});

				it("should pass `color: false` to the formatter metadata when `--no-color` is set", async () => {
					const filePath = getFixturePath("syntax-error.js");
					const exit = await cli.execute(`--no-color -f json-with-metadata ${filePath}`);

					assert.strictEqual(exit, 1);
					assert.strictEqual(JSON.parse(log.info.args[0][0]).metadata.color, false);
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
					assert.deepStrictEqual(
						JSON.parse(log.info.args[0][0]).metadata.maxWarningsExceeded,
						{ maxWarnings: 1, foundWarnings: 2 },
					);
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
				useFixtureCwd();

				it("should execute with error when given an invalid built-in formatter name", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f fakeformatter ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 2);
				});

				it("should execute without any errors when given a valid formatter path", async () => {
					const formatterPath = getFixturePath("formatters", "simple.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f ${formatterPath} ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 0);
				});

				it("should execute with error when given an invalid formatter path", async () => {
					const formatterPath = getFixturePath("formatters", "file-does-not-exist.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-ignore -f ${formatterPath} ${filePath}`,
					);

					assert.strictEqual(exit, 2);
				});

				it("should execute without any errors when given an async formatter path", async () => {
					const formatterPath = getFixturePath("formatters", "async.js");
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`-f ${formatterPath} ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(log.info.getCall(0).args[0], "from async formatter");
					assert.strictEqual(exit, 0);
				});
			});
		});

		// -------------------------------------------------------------------------
		// Exit Codes
		// -------------------------------------------------------------------------

		describe("Exit Codes", () => {
			useFixtureCwd();

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
			useFixtureCwd();

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

		it("should print out current version when executing with version flag", async () => {
			assert.strictEqual(await cli.execute("-v"), 0);
			assert.strictEqual(log.info.callCount, 1);
		});

		describe("when executing with env-info flag", () => {
			it("should print out environment information", async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			it("should print error message and return error code when there is an error condition", async () => {
				RuntimeInfo.environment = sinon.stub().throws("There was an error!");

				assert.strictEqual(await cli.execute("--env-info"), 2);
				assert.strictEqual(log.error.callCount, 1);

				RuntimeInfo.environment = sinon.stub();
			});
		});

		it("should print out help when executing with help flag", async () => {
			assert.strictEqual(await cli.execute("-h"), 0);
			assert.strictEqual(log.info.callCount, 1);
		});

		it("should execute without error when executing a file with a shebang", async () => {
			const filePath = getFixturePath("shebang.js");
			const exit = await cli.execute(`--no-config-lookup --no-ignore ${filePath}`);

			assert.strictEqual(exit, 0);
		});

		// -------------------------------------------------------------------------
		// FixtureDir Dependent Tests
		// -------------------------------------------------------------------------

		describe("FixtureDir Dependent Tests", () => {
			useFixtureCwd();

			it("should load and execute without error when given a config file and a directory of files", async () => {
				const configPath = getFixturePath("configurations", "semi-error.js");
				const filePath = getFixturePath("formatters");
				const exitStatus = await cli.execute(
					`--no-ignore --config ${configPath} ${filePath}`,
				);

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

			it("should exit with an error status (1) when supplied with rule flag and severity level set to error", async () => {
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
					const exit = await cli.execute(
						`--quiet --config ${configPath}' ${filePath}`,
					);

					assert.strictEqual(exit, 0);
				});

				it("should run rules set to 'warn' while maxWarnings is set", async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath("eslint.config-rule-throws.js");
					await stdAssert.rejects(async () => {
						await cli.execute(
							`--quiet --max-warnings=1 --config ${configPath}' ${filePath}`,
						);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				it("should throw an error on unmatched glob pattern when flag is not set", async () => {
					let filePath = getFixturePath("unmatched-patterns");
					const globPattern = "unmatched*.js";

					filePath = filePath.replace(/\\/gu, "/");

					await stdAssert.rejects(
						async () => { await cli.execute(`"${filePath}/${globPattern}"`); },
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

				it("should not throw an error on multiple unmatched patterns when flag is set", async () => {
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
				it("should exit with error if parser options are invalid", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-ignore --parser-options test111 ${filePath}`,
					);

					assert.strictEqual(exit, 2);
				});

				it("should exit with no error if parser is valid", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
					);

					assert.strictEqual(exit, 0);
				});

				it("should exit with an error on ecmaVersion 7 feature in ecmaVersion 6", async () => {
					const filePath = getFixturePath("passing-es7.js");
					const exit = await cli.execute(
						`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
					);

					assert.strictEqual(exit, 1);
				});

				it("should exit with no error on ecmaVersion 7 feature in ecmaVersion 7", async () => {
					const filePath = getFixturePath("passing-es7.js");
					const exit = await cli.execute(
						`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
					);

					assert.strictEqual(exit, 0);
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
				it("should not change exit code if no fatal errors are reported", async () => {
					const filePath = getFixturePath("exit-on-fatal-error", "no-fatal-error.js");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it("should exit with exit code 1 if no fatal errors are found but rule violations are found", async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it("should exit with exit code 2 if fatal error is found", async () => {
					const filePath = getFixturePath("exit-on-fatal-error", "fatal-error.js");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it("should exit with exit code 2 if fatal error is found in any file", async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				it("should throw an error and not process any files when given a directory with eslint excluded files", async () => {
					const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
					const filePath = getFixturePath("cli");
					const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

					await stdAssert.rejects(
						async () => { await cli.execute(`${options} ${filePath}`); },
						new Error(expectedMessage),
					);
				});

				it("should not process the file when given a file in excluded files list", async () => {
					const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`${options} ${filePath}`);

					assert.isTrue(log.info.called);
					assert.strictEqual(exit, 0);
				});

				it("should process the file when forced with --no-ignore", async () => {
					const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`${options} --no-ignore ${filePath}`);

					assert.isFalse(log.info.called);
					assert.strictEqual(exit, 0);
				});

				it("should suppress the warning if --no-warn-ignored is passed", async () => {
					const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
					const filePath = getFixturePath("passing.js");
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
					const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`${options} --no-warn-ignored --stdin --stdin-filename ${filePath}`,
						"foo",
					);

					assert.isFalse(log.info.called);
					assert.strictEqual(exit, 0);
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
						process.cwd = () => getFixturePath("cli/ignore-pattern-relative/subdir");

						const exit = await cli.execute("**/*.js --ignore-pattern subdir/**");

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () => await cli.execute("**/*.js --ignore-pattern subsubdir/*.js"),
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
			let localCLI;

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
					outputFixesMock: false,
				});
				fakeESLint.outputFixes = sinon.stub();
				sinon
					.stub(fakeESLint.prototype, "loadFormatter")
					.returns({ format: () => "done" });

				localCLI = createLocalCLI(fakeESLint, log);
				await localCLI.execute("--no-inline-config .");
			});

			it("should not error and allowInlineConfig should be true by default", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ allowInlineConfig: true })),
					outputFixesMock: false,
				});

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute(".");

				assert.strictEqual(exitCode, 0);
			});
		});

		// -------------------------------------------------------------------------
		// --fix
		// -------------------------------------------------------------------------

		describe("when passed --fix", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it("should pass fix:true to ESLint when executing on files", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					outputFixesMock: true,
				});

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix .");

				assert.strictEqual(exitCode, 0);
			});

			it("should rewrite files when in fix mode", async () => {
				const report = [
					{
						filePath: "./foo.js",
						output: "bar",
						messages: [{ severity: 2, message: "Fake message" }],
						errorCount: 1,
						warningCount: 0,
					},
				];

				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					lintFilesReturn: report,
					outputFixesMock: true,
					outputFixesArg: report,
				});

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix .");

				assert.strictEqual(exitCode, 1);
			});

			it("should provide fix predicate and rewrite files when in fix mode and quiet mode", async () => {
				const report = [
					{
						filePath: "./foo.js",
						output: "bar",
						messages: [{ severity: 1, message: "Fake message" }],
						errorCount: 0,
						warningCount: 1,
					},
				];

				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: sinon.match.func })),
					lintFilesReturn: report,
					outputFixesMock: true,
					outputFixesArg: report,
					getErrorResults: sinon.stub().returns([]),
				});

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix --quiet .");

				assert.strictEqual(exitCode, 0);
			});

			it("should not call ESLint and return 2 when executing on text", async () => {
				const fakeESLint = sinon.mock().never();

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix .", "foo = bar;");

				assert.strictEqual(exitCode, 2);
			});
		});

		// -------------------------------------------------------------------------
		// --fix-dry-run
		// -------------------------------------------------------------------------

		describe("when passed --fix-dry-run", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it("should pass fix:true to ESLint when executing on files", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					outputFixesMock: false,
				});
				fakeESLint.outputFixes = sinon.mock().never();

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run .");

				assert.strictEqual(exitCode, 0);
			});

			it("should pass fixTypes to ESLint when --fix-type is passed", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(
						sinon.match({ fix: true, fixTypes: ["suggestion"] }),
					),
					outputFixesMock: false,
				});

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run --fix-type suggestion .");

				assert.strictEqual(exitCode, 0);
			});

			it("should not rewrite files when in fix-dry-run mode", async () => {
				const report = [
					{
						filePath: "./foo.js",
						output: "bar",
						messages: [{ severity: 2, message: "Fake message" }],
						errorCount: 1,
						warningCount: 0,
					},
				];

				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					lintFilesReturn: report,
					outputFixesMock: false,
				});
				fakeESLint.outputFixes = sinon.mock().never();

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run .");

				assert.strictEqual(exitCode, 1);
			});

			it("should provide fix predicate when in fix-dry-run mode and quiet mode", async () => {
				const report = [
					{
						filePath: "./foo.js",
						output: "bar",
						messages: [{ severity: 1, message: "Fake message" }],
						errorCount: 0,
						warningCount: 1,
					},
				];

				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: sinon.match.func })),
					lintFilesReturn: report,
					outputFixesMock: false,
					getErrorResults: sinon.stub().returns([]),
				});
				fakeESLint.outputFixes = sinon.mock().never();

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run --quiet .");

				assert.strictEqual(exitCode, 0);
			});

			it("should allow executing on text", async () => {
				const report = [
					{
						filePath: "./foo.js",
						output: "bar",
						messages: [{ severity: 2, message: "Fake message" }],
						errorCount: 1,
						warningCount: 0,
					},
				];

				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					lintTextReturn: report,
					outputFixesMock: false,
				});
				fakeESLint.outputFixes = sinon.mock().never();

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix-dry-run .", "foo = bar;");

				assert.strictEqual(exitCode, 1);
			});

			it("should not call ESLint and return 2 when used with --fix", async () => {
				const fakeESLint = sinon.mock().never();

				localCLI = createLocalCLI(fakeESLint, log);
				const exitCode = await localCLI.execute("--fix --fix-dry-run .", "foo = bar;");

				assert.strictEqual(exitCode, 2);
			});
		});

		// -------------------------------------------------------------------------
		// --print-config
		// -------------------------------------------------------------------------

		describe("when passing --print-config", () => {
			useFixtureCwd();

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
			const unusedDirectiveMsg =
				"Unused eslint-disable directive (no problems were reported from 'no-console')";
			const baseArgs = `--no-config-lookup --rule "'no-console': 'error'"`;
			const stdinText = "foo(); // eslint-disable-line no-console";

			/**
			 * Asserts common "unused directive reported" expectations.
			 * @param {number} expectedExit - Expected exit code.
			 * @param {string} countText - Expected error/warning count text.
			 */
			async function assertUnusedDirectiveReport(expectedExit, countText, cliArgs) {
				const exitCode = await cli.execute(cliArgs, stdinText);

				assert.strictEqual(log.error.callCount, 0, "log.error should not be called");
				assert.strictEqual(log.info.callCount, 1, "log.info is called once");
				assert.ok(
					log.info.firstCall.args[0].includes(unusedDirectiveMsg),
					"has correct message about unused directives",
				);
				assert.ok(
					log.info.firstCall.args[0].includes(countText),
					"has correct error and warning count",
				);
				assert.strictEqual(exitCode, expectedExit);
			}

			it("errors when --report-unused-disable-directives", async () => {
				await assertUnusedDirectiveReport(
					1,
					"1 error and 0 warning",
					`${baseArgs} --report-unused-disable-directives`,
				);
			});

			it("errors when --report-unused-disable-directives-severity error", async () => {
				await assertUnusedDirectiveReport(
					1,
					"1 error and 0 warning",
					`${baseArgs} --report-unused-disable-directives-severity error`,
				);
			});

			it("errors when --report-unused-disable-directives-severity 2", async () => {
				await assertUnusedDirectiveReport(
					1,
					"1 error and 0 warning",
					`${baseArgs} --report-unused-disable-directives-severity 2`,
				);
			});

			it("warns when --report-unused-disable-directives-severity warn", async () => {
				await assertUnusedDirectiveReport(
					0,
					"0 errors and 1 warning",
					`${baseArgs} --report-unused-disable-directives-severity warn --rule "'no-console': 'error'""`,
				);
			});

			it("warns when --report-unused-disable-directives-severity 1", async () => {
				await assertUnusedDirectiveReport(
					0,
					"0 errors and 1 warning",
					`${baseArgs} --report-unused-disable-directives-severity 1`,
				);
			});

			it("does not report when --report-unused-disable-directives-severity off", async () => {
				const exitCode = await cli.execute(
					`${baseArgs} --report-unused-disable-directives-severity off`,
					stdinText,
				);

				assert.strictEqual(log.error.callCount, 0, "log.error should not be called");
				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(exitCode, 0);
			});

			it("does not report when --report-unused-disable-directives-severity 0", async () => {
				const exitCode = await cli.execute(
					`${baseArgs} --report-unused-disable-directives-severity 0`,
					stdinText,
				);

				assert.strictEqual(log.error.callCount, 0, "log.error should not be called");
				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(exitCode, 0);
			});

			it("fails when passing invalid string for --report-unused-disable-directives-severity", async () => {
				const exitCode = await cli.execute(
					"--no-config-lookup --report-unused-disable-directives-severity foo",
				);

				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(log.error.firstCall.args, [
					"Option report-unused-disable-directives-severity: 'foo' not one of off, warn, error, 0, 1, or 2.",
				]);
				assert.strictEqual(exitCode, 2);
			});

			it("fails when passing both --report-unused-disable-directives and --report-unused-disable-directives-severity", async () => {
				const exitCode = await cli.execute(
					"--no-config-lookup --report-unused-disable-directives --report-unused-disable-directives-severity warn",
				);

				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(log.error.firstCall.args, [
					"The --report-unused-disable-directives option and the --report-unused-disable-directives-severity option cannot be used together.",
				]);
				assert.strictEqual(exitCode, 2);
			});

			it("warns by default", async () => {
				await assertUnusedDirectiveReport(
					0,
					"0 errors and 1 warning",
					`--no-config-lookup --rule "'no-console': 'error'"`,
				);
			});
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
			 * Returns CLI args with config and file path for flag tests.
			 * @returns {string}
			 */
			function flagTestArgs() {
				return `--config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`;
			}

			it("should throw an error when an inactive abandoned flag is used", async () => {
				await stdAssert.rejects(
					async () => { await cli.execute(`--flag test_only_abandoned ${flagTestArgs()}`); },
					/The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u,
				);
			});

			it("should throw an error when an inactive abandoned flag is used in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only_abandoned";
				await stdAssert.rejects(
					async () => { await cli.execute(flagTestArgs()); },
					/The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u,
				);
			});

			it("should error out when an unknown flag is used", async () => {
				await stdAssert.rejects(
					async () => { await cli.execute(`--flag test_only_oldx ${flagTestArgs()}`); },
					/Unknown flag 'test_only_oldx'\./u,
				);
			});

			it("should error out when an unknown flag is used in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only_oldx";
				await stdAssert.rejects(
					async () => { await cli.execute(flagTestArgs()); },
					/Unknown flag 'test_only_oldx'\./u,
				);
			});

			/**
			 * Asserts that an inactive-but-replaced flag emits a warning and succeeds.
			 * @param {string} flag - The flag name.
			 * @param {string} expectedWarning - Expected warning message.
			 * @param {string} warningType - Expected warning type.
			 * @param {Function} execute - Function to run the CLI.
			 */
			async function assertInactiveFlagWarning(flag, expectedWarning, warningType, execute) {
				const exitCode = await execute();

				assert.strictEqual(processStub.callCount, 1, "calls `process.emitWarning()` for flags once");
				assert.deepStrictEqual(processStub.getCall(0).args, [expectedWarning, warningType]);
				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			}

			it("should emit a warning when an inactive replaced flag is used", async () => {
				await assertInactiveFlagWarning(
					"test_only_replaced",
					"The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.",
					"ESLintInactiveFlag_test_only_replaced",
					() => cli.execute(`--flag test_only_replaced ${flagTestArgs()}`),
				);
			});

			it("should emit a warning when an inactive replaced flag is used in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only_replaced";
				await assertInactiveFlagWarning(
					"test_only_replaced",
					"The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.",
					"ESLintInactiveFlag_test_only_replaced",
					() => cli.execute(flagTestArgs()),
				);
			});

			it("should emit a warning when an inactive enabled-by-default flag is used", async () => {
				await assertInactiveFlagWarning(
					"test_only_enabled_by_default",
					"The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.",
					"ESLintInactiveFlag_test_only_enabled_by_default",
					() => cli.execute(`--flag test_only_enabled_by_default ${flagTestArgs()}`),
				);
			});

			it("should emit a warning when an inactive enabled-by-default flag is used in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only_enabled_by_default";
				await assertInactiveFlagWarning(
					"test_only_enabled_by_default",
					"The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.",
					"ESLintInactiveFlag_test_only_enabled_by_default",
					() => cli.execute(flagTestArgs()),
				);
			});

			it("should not error when a valid flag is used", async () => {
				const exitCode = await cli.execute(`--flag test_only ${flagTestArgs()}`);

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should not error when a valid flag is used in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only";
				const exitCode = await cli.execute(flagTestArgs());

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should error when a valid flag is combined with an abandoned flag in an environment variable", async () => {
				process.env.ESLINT_FLAGS = "test_only,test_only_abandoned";
				await stdAssert.rejects(
					async () => { await cli.execute(flagTestArgs()); },
					/The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u,
				);
			});
		});

		// -------------------------------------------------------------------------
		// --report-unused-inline-configs
		// -------------------------------------------------------------------------

		describe("--report-unused-inline-configs option", () => {
			const baseArgs = "--no-config-lookup --rule \"'no-console': 'error'\"";
			const stdinText = "/* eslint no-console: 'error' */";
			const unusedInlineMsg = "Unused inline config ('no-console' is already configured to 'error')";

			it("does not report when --report-unused-inline-configs 0", async () => {
				const exitCode = await cli.execute(
					`${baseArgs} --report-unused-inline-configs 0`,
					stdinText,
				);

				assert.strictEqual(log.error.callCount, 0, "log.error should not be called");
				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(exitCode, 0);
			});

			[
				[1, 0, "0 errors, 1 warning"],
				["warn", 0, "0 errors, 1 warning"],
				[2, 1, "1 error, 0 warnings"],
				["error", 1, "1 error, 0 warnings"],
			].forEach(([setting, status, descriptor]) => {
				it(`reports when --report-unused-inline-configs ${setting}`, async () => {
					const exitCode = await cli.execute(
						`${baseArgs} --report-unused-inline-configs ${setting}`,
						stdinText,
					);

					assert.strictEqual(log.info.callCount, 1, "log.info is called once");
					assert.ok(
						log.info.firstCall.args[0].includes(unusedInlineMsg),
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
				assert.deepStrictEqual(log.error.firstCall.args, [
					"Option report-unused-inline-configs: 'foo' not one of off, warn, error, 0, 1, or 2.",
				]);
				assert.strictEqual(exitCode, 2);
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
			 * Parses linted file paths from log output.
			 * @returns {string[]}
			 */
			function getLintedFilePaths() {
				return JSON.parse(log.info.args[0][0])
					.map(({ filePath }) => filePath)
					.sort();
			}

			/**
			 * Resolves fixture filenames to absolute paths.
			 * @param {string[]} filenames
			 * @returns {string[]}
			 */
			function resolveFixtures(filenames) {
				return filenames.map(filename => path.resolve(filename));
			}

			it("when not provided, without config file only default extensions should be linted", async () => {
				const exitCode = await cli.execute("--no-config-lookup -f json .");

				assert.strictEqual(exitCode, 0);
				assert.deepStrictEqual(
					getLintedFilePaths(),
					resolveFixtures(["a.js", "b.mjs", "c.cjs", "eslint.config.js"]),
				);
			});

			it("when not provided, only default extensions and extensions from the config file should be linted", async () => {
				const exitCode = await cli.execute("-f json .");

				assert.strictEqual(exitCode, 0);
				assert.deepStrictEqual(
					getLintedFilePaths(),
					resolveFixtures(["a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js"]),
				);
			});

			it("should include an additional extension when specified with dot", async () => {
				const exitCode = await cli.execute("-f json --ext .ts .");

				assert.strictEqual(exitCode, 0);
				assert.deepStrictEqual(
					getLintedFilePaths(),
					resolveFixtures(["a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js", "f.ts"]),
				);
			});

			it("should include an additional extension when specified without dot", async () => {
				const exitCode = await cli.execute("-f json --ext ts .");

				assert.strictEqual(exitCode, 0);
				assert.deepStrictEqual(
					getLintedFilePaths(),
					resolveFixtures(["a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js", "f.ts"]),
				);
			});

			it("should include multiple additional extensions when specified by repeating the option", async () => {
				const exitCode = await cli.execute("-f json --ext .ts --ext tsx .");

				assert.strictEqual(exitCode, 0);
				assert.deepStrictEqual(
					getLintedFilePaths(),
					resolveFixtures([
						"a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js", "f.ts", "g.tsx",
					]),
				);
			});

			it("should include multiple additional extensions when specified with comma-delimited list", async () => {
				const exitCode = await cli.execute("-f json --ext .ts,.tsx .");

				assert.strictEqual(exitCode, 0);
				assert.deepStrictEqual(
					getLintedFilePaths(),
					resolveFixtures([
						"a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js", "f.ts", "g.tsx",
					]),
				);
			});

			it('should fail when passing --ext ""', async () => {
				const exitCode = await cli.execute(["argv0", "argv1", "--ext", ""]);

				assert.strictEqual(exitCode, 2);
				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(
					log.error.firstCall.args[0],
					"The --ext option value cannot be empty.",
				);
			});

			it("should fail when passing --ext ,ts", async () => {
				const exitCode = await cli.execute("--ext ,ts");

				assert.strictEqual(exitCode, 2);
				assert.strictEqual(log.info.callCount, 0);
				assert.strictEqual(log.error.callCount, 1);
				assert.deepStrictEqual(
					log.error.firstCall.args[0],
					"The --ext option arguments cannot be empty strings. Found an empty string at index 0.",
				);
			});

			it("should fail when passing --ext ts,,tsx", async () => {
				const exitCode = await cli.execute("--ext ts,,tsx");

				assert.strictEqual(exitCode, 2);
				assert.strictEqual(log.info.callCount, 0);
				assert.strictEqual(log.error.callCount, 1);
				assert.deepStrictEqual(
					log.error.firstCall.args[0],
					"The --ext option arguments cannot be empty strings. Found an empty string at index 1.",
				);
			});
		});

		// -------------------------------------------------------------------------
		// Miscellaneous
		// -------------------------------------------------------------------------

		it("should throw an error when text is passed and no config file is found", async () => {
			await stdAssert.rejects(
				() => cli.execute('--stdin --stdin-filename /foo.js"', "var foo = 'bar';", true),
				/Could not find config file/u,
			);
		});

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
Eliminated ~20 repeated `beforeEach`/`afterEach` blocks for `process.cwd` mocking into a single reusable factory, then wrapped it in a `useFixtureCwd()` convenience function that registers the hooks automatically.

### 2. Extracted `createFakeESLint()` helper
The fake ESLint setup pattern was repeated ~10 times across `--fix` and `--fix-dry-run` tests. This factory centralizes the `Object.defineProperties`, stub setup, and mock configuration.

### 3. Extracted `createLocalCLI()` helper
The `proxyquire` call for creating a local CLI with a fake ESLint was repeated in every fake ESLint test.

### 4. Extracted `assertUnusedDirectiveReport()` helper
The `--report-unused-disable-directives` section had 7 nearly identical assertion blocks. A shared assertion function eliminates the duplication.

### 5. Extracted `assertInactiveFlagWarning()` helper
Four `--flag` tests shared identical assertion logic for inactive flag warnings.

### 6. Extracted `flagTestArgs()` helper
Eliminated repeated `getFixturePath("eslint.config.js")` + `getFixturePath("passing.js")` construction in flag tests.

### 7. Extracted `getLintedFilePaths()` and `resolveFixtures()` helpers
Reduced repetition in `--ext` tests for parsing and comparing file path results.

### 8. Flattened unnecessary nesting
Removed single-test `describe` wrappers (e.g., `"when given a valid built-in formatter name"`) and collapsed deeply nested `describe` groups where the nesting added no value.
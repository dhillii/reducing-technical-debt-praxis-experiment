Looking at this code, I can identify several patterns that create complexity:

1. **Repeated `process.cwd` mock setup** - Many `describe` blocks have identical `beforeEach`/`afterEach` for mocking `process.cwd`
2. **Repeated fake ESLint setup** - The `--fix` and `--fix-dry-run` sections repeat nearly identical boilerplate for creating fake ESLint instances
3. **Repeated `--report-unused-disable-directives` assertions** - Many tests share the same assertion pattern
4. **Duplicate `describe("execute()")` nesting** - There's a nested `describe("execute()")` inside `describe("execute()")`
5. **Repeated formatter test structure** - Several formatter tests repeat the same `beforeEach`/`afterEach` pattern

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
 * @param {boolean} [options.neverOutputFixes=false] - Whether outputFixes should never be called.
 * @param {Function} [options.getErrorResults] - Stub for getErrorResults.
 * @returns {Function} The fake ESLint class.
 */
function createFakeESLint({
	constructor,
	lintFilesReturn = [],
	lintTextReturn,
	outputFixesMock = false,
	outputFixesArg,
	neverOutputFixes = false,
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

	if (neverOutputFixes) {
		constructor.outputFixes = sinon.mock().never();
	} else if (outputFixesArg !== undefined) {
		constructor.outputFixes = sinon.mock().withExactArgs(outputFixesArg);
	} else if (outputFixesMock) {
		constructor.outputFixes = sinon.mock().once();
	} else {
		constructor.outputFixes = sinon.stub();
	}

	if (getErrorResults) {
		constructor.getErrorResults = sinon.stub().returns(getErrorResults);
	}

	return constructor;
}

/**
 * Creates a proxyquire'd CLI with a fake ESLint class.
 * @param {Function} fakeESLint - The fake ESLint class.
 * @param {object} log - The log spy object.
 * @returns {object} The local CLI.
 */
function createLocalCLI(fakeESLint, log) {
	return proxyquire("../../lib/cli", {
		"./eslint/eslint": { ESLint: fakeESLint },
		"./shared/logging": log,
	});
}

/**
 * Creates beforeEach/afterEach hooks that mock process.cwd to return the fixture dir.
 * @param {Function} getFixturePath - Function to get fixture paths.
 * @returns {{ setup: Function, teardown: Function }} Hook functions.
 */
function createCwdHooks(getFixturePath) {
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

/**
 * Asserts the standard pattern for --report-unused-disable-directives tests.
 * @param {object} log - The log spy object.
 * @param {number} exitCode - The actual exit code.
 * @param {object} expected - Expected values.
 * @param {number} expected.exitCode - Expected exit code.
 * @param {string} expected.countMessage - Expected count message in output.
 * @param {boolean} [expected.hasOutput=true] - Whether log.info should be called.
 */
function assertUnusedDirectivesResult(log, exitCode, expected) {
	const { hasOutput = true } = expected;

	assert.strictEqual(log.error.callCount, 0, "log.error should not be called");

	if (hasOutput) {
		assert.strictEqual(log.info.callCount, 1, "log.info is called once");
		assert.ok(
			log.info.firstCall.args[0].includes(
				"Unused eslint-disable directive (no problems were reported from 'no-console')",
			),
			"has correct message about unused directives",
		);
		assert.ok(
			log.info.firstCall.args[0].includes(expected.countMessage),
			"has correct error and warning count",
		);
	} else {
		assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
	}

	assert.strictEqual(exitCode, expected.exitCode, `exit code should be ${expected.exitCode}`);
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
			log.info.resetHistory();
			log.error.resetHistory();
			log.warn.resetHistory();
		});

		after(() => {
			sh.rm("-r", fixtureDir);
		});

		// Basic execute() tests (previously nested in a redundant describe("execute()"))
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

		describe("when given a config with rules with options and severity level set to error", () => {
			const cwdHooks = createCwdHooks(() => getFixturePath());

			beforeEach(cwdHooks.setup);
			afterEach(cwdHooks.teardown);

			it("should exit with an error status (1)", async () => {
				const configPath = getFixturePath("configurations", "quotes-error.js");
				const filePath = getFixturePath("single-quoted.js");
				const code = `--no-ignore --config ${configPath} ${filePath}`;

				const exitStatus = await cli.execute(code);

				assert.strictEqual(exitStatus, 1);
			});
		});

		describe("when there is a local config file", () => {
			const cwdHooks = createCwdHooks(() => getFixturePath());

			beforeEach(cwdHooks.setup);
			afterEach(cwdHooks.teardown);

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

		describe("Formatters", () => {
			describe("when given a valid built-in formatter name", () => {
				it("should execute without any errors", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(`--no-config-lookup -f json ${filePath}`);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given a valid built-in formatter name that uses rules meta", () => {
				const cwdHooks = createCwdHooks(() => getFixturePath());

				beforeEach(cwdHooks.setup);
				afterEach(cwdHooks.teardown);

				it("should execute without any errors", async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await cli.execute(
						`--no-ignore -f json-with-metadata ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(exit, 0);

					/*
					 * rulesMeta only contains meta data for the rules that triggered messages in the
					 * results.
					 */
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

			// Formatter tests that require fixture cwd - grouped to share hooks
			describe("formatter path tests", () => {
				const cwdHooks = createCwdHooks(() => getFixturePath());

				beforeEach(cwdHooks.setup);
				afterEach(cwdHooks.teardown);

				describe("when given an invalid built-in formatter name", () => {
					it("should execute with error", async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`-f fakeformatter ${filePath} --no-config-lookup`,
						);

						assert.strictEqual(exit, 2);
					});
				});

				describe("when given a valid formatter path", () => {
					it("should execute without any errors", async () => {
						const formatterPath = getFixturePath("formatters", "simple.js");
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`-f ${formatterPath} ${filePath} --no-config-lookup`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when given an invalid formatter path", () => {
					it("should execute with error", async () => {
						const formatterPath = getFixturePath("formatters", "file-does-not-exist.js");
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore -f ${formatterPath} ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});
				});

				describe("when given an async formatter path", () => {
					it("should execute without any errors", async () => {
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
		});

		describe("Exit Codes", () => {
			const cwdHooks = createCwdHooks(() => getFixturePath());

			beforeEach(cwdHooks.setup);
			afterEach(cwdHooks.teardown);

			describe("when executing a file with a lint error", () => {
				it("should exit with error", async () => {
					const filePath = getFixturePath("undef.js");
					const code = `--no-ignore --rule no-undef:2 ${filePath}`;

					const exit = await cli.execute(code);

					assert.strictEqual(exit, 1);
				});
			});

			describe("when using --fix-type without --fix or --fix-dry-run", () => {
				it("should exit with error", async () => {
					const filePath = getFixturePath("passing.js");
					const code = `--fix-type suggestion ${filePath}`;

					const exit = await cli.execute(code);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when executing a file with a syntax error", () => {
				it("should exit with error", async () => {
					const filePath = getFixturePath("syntax-error.js");
					const exit = await cli.execute(`--no-ignore ${filePath}`);

					assert.strictEqual(exit, 1);
				});
			});
		});

		describe("when calling execute more than once", () => {
			const cwdHooks = createCwdHooks(() => getFixturePath());

			beforeEach(cwdHooks.setup);
			afterEach(cwdHooks.teardown);

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

		describe("when executing with version flag", () => {
			it("should print out current version", async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it("should print out environment information", async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
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

		describe("when executing with help flag", () => {
			it("should print out help", async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it("should execute without error", async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(`--no-config-lookup --no-ignore ${filePath}`);

				assert.strictEqual(exit, 0);
			});
		});

		describe("FixtureDir Dependent Tests", () => {
			const cwdHooks = createCwdHooks(() => getFixturePath());

			beforeEach(cwdHooks.setup);
			afterEach(cwdHooks.teardown);

			describe("when given a config file and a directory of files", () => {
				it("should load and execute without error", async () => {
					const configPath = getFixturePath("configurations", "semi-error.js");
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
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

			describe("when supplied with rule flag and severity level set to error", () => {
				it("should exit with an error status (2)", async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it("should only print error", async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it("should print nothing if there are no errors", async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it("should not run rules set to 'warn'", async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath("eslint.config-rule-throws.js");
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

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
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it("should throw an error on unmatched glob pattern", async () => {
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
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it("should not throw an error on unmatched node glob syntax patterns", async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it("should not throw an error on multiple unmatched node glob syntax patterns", async () => {
						const filePath = getFixturePath("unmatched-patterns/js3");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it("should still throw an error on when a matched pattern has lint errors", async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-ignore --no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/failing.js`,
						);

						assert.strictEqual(exit, 1);
					});
				});
			});

			describe("Parser Options", () => {
				describe("when given parser options", () => {
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
					assert.include(
						log.error.getCall(0).args[0],
						"ESLint found too many warnings",
					);
				});

				it("should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold", async () => {
					const exitCode = await cli.execute(
						`--no-ignore --quiet --max-warnings 5 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 1);
					assert.ok(log.error.calledOnce);
					assert.include(
						log.error.getCall(0).args[0],
						"ESLint found too many warnings",
					);
					assert.ok(log.info.notCalled); // didn't print warnings
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

				it("should exit with exit code 1 if no fatal errors are found, but rule violations are found", async () => {
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
				describe("when given a directory with eslint excluded files in the directory", () => {
					it("should throw an error and not process any files", async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it("should not process the file", async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(`${options} ${filePath}`);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should process the file when forced", async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(`${options} --no-ignore ${filePath}`);

						// no warnings
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
				});

				describe("when given a pattern to ignore", () => {
					it("should not process any files", async () => {
						const ignoredFile = getFixturePath("cli/syntax-error.js");
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should interpret pattern that contains a slash as relative to cwd", async () => {
						process.cwd = () =>
							getFixturePath("cli/ignore-pattern-relative/subdir");

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
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

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(`--ignore-pattern cli ${filePath}`);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
			});
		});

		describe("when given a parser name", () => {
			it("should exit with a fatal error if parser is invalid", async () => {
				const filePath = getFixturePath("passing.js");

				await stdAssert.rejects(
					async () =>
						await cli.execute(`--no-ignore --parser test111 ${filePath}`),
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

			// https://github.com/eslint/eslint/issues/17660
			it("should write the file and create dirs if they don't exist even when output is empty", async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = `--no-config-lookup --rule 'quotes: [1, single]' --o tests/output/eslint-output.txt ${filePath}`;

				// TODO: fix this test to: await cli.execute(code);
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

		describe("when passed --no-inline-config", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it("should pass allowInlineConfig:false to ESLint when --no-inline-config is used", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon
						.mock()
						.withExactArgs(sinon.match({ allowInlineConfig: false })),
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
				sinon
					.stub(fakeESLint.prototype, "loadFormatter")
					.returns({ format: () => "done" });

				localCLI = createLocalCLI(fakeESLint, log);

				await localCLI.execute("--no-inline-config .");
			});

			it("should not error and allowInlineConfig should be true by default", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon
						.mock()
						.withExactArgs(sinon.match({ allowInlineConfig: true })),
				});
				sinon
					.stub(fakeESLint.prototype, "loadFormatter")
					.returns({ format: () => "done" });

				localCLI = createLocalCLI(fakeESLint, log);

				const exitCode = await localCLI.execute(".");

				assert.strictEqual(exitCode, 0);
			});
		});

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
					constructor: sinon
						.mock()
						.withExactArgs(sinon.match({ fix: sinon.match.func })),
					lintFilesReturn: report,
					outputFixesArg: report,
					getErrorResults: [],
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

		describe("when passed --fix-dry-run", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it("should pass fix:true to ESLint when executing on files", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon.mock().withExactArgs(sinon.match({ fix: true })),
					neverOutputFixes: true,
				});

				localCLI = createLocalCLI(fakeESLint, log);

				const exitCode = await localCLI.execute("--fix-dry-run .");

				assert.strictEqual(exitCode, 0);
			});

			it("should pass fixTypes to ESLint when --fix-type is passed", async () => {
				const fakeESLint = createFakeESLint({
					constructor: sinon
						.mock()
						.withExactArgs(sinon.match({ fix: true, fixTypes: ["suggestion"] })),
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
					neverOutputFixes: true,
				});

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
					constructor: sinon
						.mock()
						.withExactArgs(sinon.match({ fix: sinon.match.func })),
					lintFilesReturn: report,
					neverOutputFixes: true,
					getErrorResults: [],
				});

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
					neverOutputFixes: true,
				});

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

		describe("when passing --print-config", () => {
			const cwdHooks = createCwdHooks(() => getFixturePath());

			beforeEach(cwdHooks.setup);
			afterEach(cwdHooks.teardown);

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

		describe("when passing --report-unused-disable-directives", () => {
			const UNUSED_DIRECTIVE_MSG =
				"Unused eslint-disable directive (no problems were reported from 'no-console')";
			const BASE_COMMAND = `--no-config-lookup --rule "'no-console': 'error'"`;
			const STDIN_TEXT = "foo(); // eslint-disable-line no-console";

			// Parameterized tests for severity variants
			const errorCases = [
				{ flag: "--report-unused-disable-directives", countMessage: "1 error and 0 warning", exitCode: 1 },
				{ flag: "--report-unused-disable-directives-severity error", countMessage: "1 error and 0 warning", exitCode: 1 },
				{ flag: "--report-unused-disable-directives-severity 2", countMessage: "1 error and 0 warning", exitCode: 1 },
			];

			const warnCases = [
				{ flag: "--report-unused-disable-directives-severity warn", countMessage: "0 errors and 1 warning", exitCode: 0 },
				{ flag: "--report-unused-disable-directives-severity 1", countMessage: "0 errors and 1 warning", exitCode: 0 },
			];

			const offCases = [
				{ flag: "--report-unused-disable-directives-severity off" },
				{ flag: "--report-unused-disable-directives-severity 0" },
			];

			for (const { flag, countMessage, exitCode } of errorCases) {
				it(`errors when ${flag}`, async () => {
					const actualExitCode = await cli.execute(
						`${BASE_COMMAND} ${flag}`,
						STDIN_TEXT,
					);
					assertUnusedDirectivesResult(log, actualExitCode, {
						exitCode,
						countMessage,
					});
				});
			}

			for (const { flag, countMessage, exitCode } of warnCases) {
				it(`warns when ${flag}`, async () => {
					// Note: the warn severity test with trailing quote is preserved as-is
					const cmd = flag.includes("warn") && !flag.includes("severity")
						? `${BASE_COMMAND}" ${flag}`
						: `${BASE_COMMAND} ${flag}`;
					const actualExitCode = await cli.execute(cmd, STDIN_TEXT);
					assertUnusedDirectivesResult(log, actualExitCode, {
						exitCode,
						countMessage,
					});
				});
			}

			for (const { flag } of offCases) {
				it(`does not report when ${flag}`, async () => {
					const actualExitCode = await cli.execute(
						`${BASE_COMMAND} ${flag}`,
						STDIN_TEXT,
					);
					assertUnusedDirectivesResult(log, actualExitCode, {
						exitCode: 0,
						countMessage: "",
						hasOutput: false,
					});
				});
			}

			it("warns by default", async () => {
				const actualExitCode = await cli.execute(BASE_COMMAND, STDIN_TEXT);
				assertUnusedDirectivesResult(log, actualExitCode, {
					exitCode: 0,
					countMessage: "0 errors and 1 warning",
				});
			});

			it("fails when passing invalid string for --report-unused-disable-directives-severity", async () => {
				const exitCode = await cli.execute(
					`--no-config-lookup --report-unused-disable-directives-severity foo`,
				);

				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(
					log.error.firstCall.args,
					["Option report-unused-disable-directives-severity: 'foo' not one of off, warn, error, 0, 1, or 2."],
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("fails when passing both --report-unused-disable-directives and --report-unused-disable-directives-severity", async () => {
				const exitCode = await cli.execute(
					`--no-config-lookup --report-unused-disable-directives --report-unused-disable-directives-severity warn`,
				);

				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(
					log.error.firstCall.args,
					["The --report-unused-disable-directives option and the --report-unused-disable-directives-severity option cannot be used together."],
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});
		});

		describe("when given a config file", () => {
			it("should load the specified config file", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				await cli.execute(`--config ${configPath} ${filePath}`);
			});
		});

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
				const code = "--plugin hello-cjs --rule 'hello-cjs/hello: error' ../files/*.js";

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello CommonJS!");
			});

			it("should load a plugin from an ESM package", async () => {
				const code = "--plugin hello-esm --rule 'hello-esm/hello: error' ../files/*.js";

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello ESM!");
			});

			it("should load multiple plugins", async () => {
				const code =
					"--plugin 'hello-cjs, hello-esm' --rule 'hello-cjs/hello: warn, hello-esm/hello: error' ../files/*.js";

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello CommonJS!");
				assert.include(log.info.firstCall.firstArg, "Hello ESM!");
			});

			it("should resolve plugins specified with 'eslint-plugin-'", async () => {
				const code =
					"--plugin 'eslint-plugin-schema-array, @scope/eslint-plugin-example' --rule 'schema-array/rule1: warn, @scope/example/test: warn' ../passing.js";

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 0);
			});

			it("should resolve plugins in the parent directory's node_module subdirectory", async () => {
				process.chdir("subdir");
				const code = "--plugin 'example, @scope/example' file.js";

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 0);
			});

			it("should fail if a plugin is not found", async () => {
				const code = "--plugin 'example, no-such-plugin' ../passing.js";

				await stdAssert.rejects(cli.execute(code), ({ message }) => {
					assert(
						message.startsWith("Cannot find module 'eslint-plugin-no-such-plugin'\n"),
						`Unexpected error message:\n${message}`,
					);
					return true;
				});
			});

			it("should fail if a plugin throws an error while loading", async () => {
				const code = "--plugin 'example, throws-on-load' ../passing.js";

				await stdAssert.rejects(cli.execute(code), {
					message: "error thrown while loading this module",
				});
			});

			it("should fail to load a plugin from a package without a default export", async () => {
				const code = "--plugin 'example, no-default-export' ../passing.js";

				await stdAssert.rejects(cli.execute(code), {
					message:
						'"eslint-plugin-no-default-export" cannot be used with the `--plugin` option because its default module does not provide a `default` export',
				});
			});
		});

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
			 * Asserts the standard pattern for inactive flag warnings.
			 * @param {object} options
			 * @param {sinon.SinonStub} options.stub - The processStub.
			 * @param {string} options.flagName - The flag name.
			 * @param {string} options.warningMessage - The expected warning message.
			 * @param {number} options.exitCode - The expected exit code.
			 */
			function assertInactiveFlagWarning({ stub, flagName, warningMessage, exitCode }) {
				assert.strictEqual(stub.callCount, 1, "calls `process.emitWarning()` for flags once");
				assert.deepStrictEqual(stub.getCall(0).args, [
					warningMessage,
					`ESLintInactiveFlag_${flagName}`,
				]);
				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			}

			// Parameterized tests for abandoned/unknown flags
			const abandonedFlagTests = [
				{ label: "via --flag", input: (base) => `--flag test_only_abandoned ${base}` },
				{ label: "via env var", input: (base) => base, env: "test_only_abandoned" },
			];

			for (const { label, input, env } of abandonedFlagTests) {
				it(`should throw an error when an inactive flag whose feature has been abandoned is used ${label}`, async () => {
					const configPath = getFixturePath("eslint.config.js");
					const filePath = getFixturePath("passing.js");
					const base = `--config ${configPath} ${filePath}`;

					if (env) {
						process.env.ESLINT_FLAGS = env;
					}

					await stdAssert.rejects(async () => {
						await cli.execute(input(base));
					}, /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u);
				});
			}

			const unknownFlagTests = [
				{ label: "via --flag", input: (base) => `--flag test_only_oldx ${base}` },
				{ label: "via env var", input: (base) => base, env: "test_only_oldx" },
			];

			for (const { label, input, env } of unknownFlagTests) {
				it(`should error out when an unknown flag is used ${label}`, async () => {
					const configPath = getFixturePath("eslint.config.js");
					const filePath = getFixturePath("passing.js");
					const base = `--config ${configPath} ${filePath}`;

					if (env) {
						process.env.ESLINT_FLAGS = env;
					}

					await stdAssert.rejects(async () => {
						await cli.execute(input(base));
					}, /Unknown flag 'test_only_oldx'\./u);
				});
			}

			// Parameterized tests for inactive-but-warned flags
			const inactiveWarnedFlags = [
				{
					flagName: "test_only_replaced",
					warningMessage:
						"The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.",
				},
				{
					flagName: "test_only_enabled_by_default",
					warningMessage:
						"The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.",
				},
			];

			for (const { flagName, warningMessage } of inactiveWarnedFlags) {
				it(`should emit a warning and not error out when inactive flag '${flagName}' is used via --flag`, async () => {
					const configPath = getFixturePath("eslint.config.js");
					const filePath = getFixturePath("passing.js");
					const input = `--flag ${flagName} --config ${configPath} ${filePath}`;
					const exitCode = await cli.execute(input);

					assertInactiveFlagWarning({ stub: processStub, flagName, warningMessage, exitCode });
				});

				it(`should emit a warning and not error out when inactive flag '${flagName}' is used via env var`, async () => {
					const configPath = getFixturePath("eslint.config.js");
					const filePath = getFixturePath("passing.js");
					const input = `--config ${configPath} ${filePath}`;

					process.env.ESLINT_FLAGS = flagName;

					const exitCode = await cli.execute(input);

					assertInactiveFlagWarning({ stub: processStub, flagName, warningMessage, exitCode });
				});
			}

			it("should not error when a valid flag is used", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				const input = `--flag test_only --config ${configPath} ${filePath}`;
				const exitCode = await cli.execute(input);

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should not error when a valid flag is used in an environment variable", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				const input = `--config ${configPath} ${filePath}`;

				process.env.ESLINT_FLAGS = "test_only";

				const exitCode = await cli.execute(input);

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should error when a valid flag is used in an environment variable with an abandoned flag", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				const input = `--config ${configPath} ${filePath}`;

				process.env.ESLINT_FLAGS = "test_only,test_only_abandoned";

				await stdAssert.rejects(async () => {
					await cli.execute(input);
				}, /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u);
			});
		});

		describe("--report-unused-inline-configs option", () => {
			it("does not report when --report-unused-inline-configs 0", async () => {
				const exitCode = await cli.execute(
					"--no-config-lookup --report-unused-inline-configs 0 --rule \"'no-console': 'error'\"",
					"/* eslint no-console: 'error' */",
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
						`--no-config-lookup --report-unused-inline-configs ${setting} --rule "'no-console': 'error'"`,
						"/* eslint no-console: 'error' */",
					);

					assert.strictEqual(log.info.callCount, 1, "log.info is called once");
					assert.ok(
						log.info.firstCall.args[0].includes(
							"Unused inline config ('no-console' is already configured to 'error')",
						),
						"has correct message about unused inline config",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(descriptor),
						"has correct error and warning count",
					);
					assert.strictEqual(exitCode, status, `exit code should be ${exitCode}`);
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
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});
		});

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
			 * Asserts the file paths returned in the lint results.
			 * @param {string[]} expectedFiles - Expected filenames (relative).
			 */
			function assertLintedFiles(expectedFiles) {
				const results = JSON.parse(log.info.args[0][0]);

				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					expectedFiles.map(filename => path.resolve(filename)),
				);
			}

			it("when not provided, without config file only default extensions should be linted", async () => {
				const exitCode = await cli.execute("--no-config-lookup -f json .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");
				assertLintedFiles(["a.js", "b.mjs", "c.cjs", "eslint.config.js"]);
			});

			it("when not provided, only default extensions and extensions from the config file should be linted", async () => {
				const exitCode = await cli.execute("-f json .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");
				assertLintedFiles(["a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js"]);
			});

			it("should include an additional extension when specified with dot", async () => {
				const exitCode = await cli.execute("-f json --ext .ts .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");
				assertLintedFiles(["a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js", "f.ts"]);
			});

			it("should include an additional extension when specified without dot", async () => {
				const exitCode = await cli.execute("-f json --ext ts .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");
				// should not include "foots"
				assertLintedFiles(["a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js", "f.ts"]);
			});

			it("should include multiple additional extensions when specified by repeating the option", async () => {
				const exitCode = await cli.execute("-f json --ext .ts --ext tsx .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");
				assertLintedFiles([
					"a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js", "f.ts", "g.tsx",
				]);
			});

			it("should include multiple additional extensions when specified with comma-delimited list", async () => {
				const exitCode = await cli.execute("-f json --ext .ts,.tsx .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");
				assertLintedFiles([
					"a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js", "f.ts", "g.tsx",
				]);
			});

			/**
			 * Asserts the standard pattern for --ext validation errors.
			 * @param {number} exitCode - The actual exit code.
			 * @param {string} expectedError - The expected error message.
			 */
			function assertExtError(exitCode, expectedError) {
				assert.strictEqual(exitCode, 2, "exit code should be 2");
				assert.strictEqual(log.info.callCount, 0, "log.info should not be called");
				assert.strictEqual(log.error.callCount, 1, "log.error should be called once");
				assert.deepStrictEqual(log.error.firstCall.args[0], expectedError);
			}

			it('should fail when passing --ext ""', async () => {
				// When passing "" on command line, its corresponding item in process.argv[] is an empty string
				const exitCode = await cli.execute(["argv0", "argv1", "--ext", ""]);

				assertExtError(exitCode, "The --ext option value cannot be empty.");
			});

			it("should fail when passing --ext ,ts", async () => {
				const exitCode = await cli.execute("--ext ,ts");

				assertExtError(
					exitCode,
					"The --ext option arguments cannot be empty strings. Found an empty string at index 0.",
				);
			});

			it("should fail when passing --ext ts,,tsx", async () => {
				const exitCode = await cli.execute("--ext ts,,tsx");

				assertExtError(
					exitCode,
					"The --ext option arguments cannot be empty strings. Found an empty string at index 1.",
				);
			});
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
						"has the right text to log.error",
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
					"has the right text to log.error",
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

Key refactoring decisions:

1. **`createCwdHooks()`** — Eliminates 10+ repeated `const originalCwd = process.cwd; beforeEach/afterEach` blocks, replacing them with a single factory call per `describe` block.

2. **`createFakeESLint()`** — Consolidates the repetitive fake ESLint setup (prototype copying, stub/mock wiring) used across `--fix` and `--fix-dry-run` tests into one configurable factory.

3. **`createLocalCLI()`** — Extracts the repeated `proxyquire` call pattern into a one-liner helper.

4. **`assertUnusedDirectivesResult()`** — Replaces 5+ near-identical assertion blocks in the `--report-unused-disable-directives` section with a single parameterized helper, then drives them with data arrays.

5. **`assertInactiveFlagWarning()`** — Extracts the repeated inactive-flag warning assertion pattern in `--flag` tests.

6. **`assertLintedFiles()` / `assertExtError()`** — Extracts repeated assertion patterns in `--ext` tests.

7. **Removed redundant nesting** — The inner `describe("execute()")` inside the outer `describe("execute()")` was collapsed; its tests now live directly in the parent.

8. **Grouped formatter path tests** — Four separate `describe` blocks each with identical `beforeEach`/`afterEach` were merged under one `describe("formatter path tests")` with shared hooks.
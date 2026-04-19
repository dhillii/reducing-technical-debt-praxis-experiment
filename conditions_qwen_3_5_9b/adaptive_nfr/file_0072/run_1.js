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

		/**
		 * Creates a test case for execute() with given arguments.
		 * @param {string} description - Test description.
		 * @param {string} code - Command code to execute.
		 * @param {string} expectedExit - Expected exit code.
		 * @param {Function} assertion - Assertion function.
		 * @returns {void}
		 * @private
		 */
		function createExecuteTestCase(description, code, expectedExit, assertion) {
			it(description, async () => {
				const exit = await cli.execute(code);
				assertion(exit);
			});
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

		describe("execute()", () => {
			createExecuteTestCase(
				`should return error when text with incorrect quotes is passed as argument`,
				`--no-config-lookup -c ${getFixturePath("configurations", "quotes-error.js")} --stdin --stdin-filename foo.js`,
				1,
				(exit) => assert.strictEqual(exit, 1),
			);

			createExecuteTestCase(
				`should not print debug info when passed the empty string as text`,
				[
					"argv0",
					"argv1",
					"--stdin",
					"--no-config-lookup",
					"--stdin-filename",
					"foo.js",
				],
				"",
				(exit) => {
					assert.strictEqual(exit, 0);
					assert.isTrue(log.info.notCalled);
				},
			);

			createExecuteTestCase(
				`should exit with console error when passed unsupported arguments`,
				`--blah --another ${getFixturePath("files")}`,
				2,
				(exit) => assert.strictEqual(exit, 2),
			);
		});

		describe("when given a config with rules with options and severity level set to error", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			createExecuteTestCase(
				`should exit with an error status (1)`,
				`--no-ignore --config ${getFixturePath("configurations", "quotes-error.js")} ${getFixturePath("single-quoted.js")}`,
				1,
				(exit) => assert.strictEqual(exit, 1),
			);
		});

		describe("when there is a local config file", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			createExecuteTestCase(
				`should load the local config file`,
				"cli/passing.js --no-ignore",
				0,
				(exit) => assert.strictEqual(exit, 0),
			);

			createExecuteTestCase(
				`should load the local config file with glob pattern`,
				"cli/pass*.js --no-ignore",
				0,
				(exit) => assert.strictEqual(exit, 0),
			);

			// only works on Windows
			if (os.platform() === "win32") {
				createExecuteTestCase(
					`should load the local config file with Windows slashes glob pattern`,
					"cli\\pass*.js --no-ignore",
					0,
					(exit) => assert.strictEqual(exit, 0),
				);
			}
		});

		describe("Formatters", () => {
			describe("when given a valid built-in formatter name", () => {
				createExecuteTestCase(
					`should execute without any errors`,
					`--no-config-lookup -f json ${getFixturePath("passing.js")}`,
					0,
					(exit) => assert.strictEqual(exit, 0),
				);
			});

			describe("when given a valid built-in formatter name that uses rules meta.", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				createExecuteTestCase(
					`should execute without any errors`,
					`--no-ignore -f json-with-metadata ${getFixturePath("passing.js")} --no-config-lookup`,
					0,
					(exit) => {
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
					},
				);
			});

			describe("when the `--color` / `--no-color` options are passed", () => {
				createExecuteTestCase(
					"should pass `color: true` to the formatter metadata when `--color` is set",
					`--color -f json-with-metadata ${getFixturePath("syntax-error.js")}`,
					1,
					(exit) => {
						assert.strictEqual(exit, 1);

						const { metadata } = JSON.parse(log.info.args[0][0]);

						assert.strictEqual(metadata.color, true);
					},
				);

				createExecuteTestCase(
					"should pass `color: false` to the formatter metadata when `--no-color` is set",
					`--no-color -f json-with-metadata ${getFixturePath("syntax-error.js")}`,
					1,
					(exit) => {
						assert.strictEqual(exit, 1);

						const { metadata } = JSON.parse(log.info.args[0][0]);

						assert.strictEqual(metadata.color, false);
					},
				);

				createExecuteTestCase(
					"should omit `color` metadata when no flag is set",
					`-f ${getFixturePath("formatters", "context.js")} ${getFixturePath("syntax-error.js")}`,
					1,
					(exit) => {
						assert.strictEqual(exit, 1);
						assert.notProperty(log.info.getCall(0).args[0], "color");
					},
				);
			});

			describe("when the `--max-warnings` option is passed", () => {
				describe("and there are too many warnings", () => {
					createExecuteTestCase(
						"should provide `maxWarningsExceeded` metadata to the formatter",
						`--no-ignore -f json-with-metadata --max-warnings 1 --rule 'quotes: warn' --no-config-lookup`,
						"'hello' + 'world';",
						1,
						(exit) => {
							assert.strictEqual(exit, 1);

							const { metadata } = JSON.parse(log.info.args[0][0]);

							assert.deepStrictEqual(metadata.maxWarningsExceeded, {
								maxWarnings: 1,
								foundWarnings: 2,
							});
						},
					);
				});

				describe("and warnings do not exceed the limit", () => {
					createExecuteTestCase(
						"should omit `maxWarningsExceeded` metadata from the formatter",
						`--no-ignore -f ${getFixturePath("formatters", "context.js")} --max-warnings 1 --rule 'quotes: warn' --no-config-lookup`,
						"'hello world';",
						0,
						(exit) => {
							assert.strictEqual(exit, 0);
							assert.notProperty(
								log.info.getCall(0).args[0],
								"maxWarningsExceeded",
							);
						},
					);
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

				createExecuteTestCase(
					`should execute with error:`,
					`-f fakeformatter ${getFixturePath("passing.js")} --no-config-lookup`,
					2,
					(exit) => assert.strictEqual(exit, 2),
				);
			});

			describe("when given a valid formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				createExecuteTestCase(
					`should execute without any errors`,
					`-f ${getFixturePath("formatters", "simple.js")} ${getFixturePath("passing.js")} --no-config-lookup`,
					0,
					(exit) => assert.strictEqual(exit, 0),
				);
			});

			describe("when given an invalid formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				createExecuteTestCase(
					`should execute with error`,
					`--no-ignore -f ${getFixturePath("formatters", "file-does-not-exist.js")} ${getFixturePath("passing.js")}`,
					2,
					(exit) => assert.strictEqual(exit, 2),
				);
			});

			describe("when given an async formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					process.cwd = () => getFixturePath();
				});

				afterEach(() => {
					process.cwd = originalCwd;
				});

				createExecuteTestCase(
					`should execute without any errors`,
					`-f ${getFixturePath("formatters", "async.js")} ${getFixturePath("passing.js")} --no-config-lookup`,
					0,
					(exit) => {
						assert.strictEqual(
							log.info.getCall(0).args[0],
							"from async formatter",
						);
						assert.strictEqual(exit, 0);
					},
				);
			});
		});

		describe("Exit Codes", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			describe("when executing a file with a lint error", () => {
				createExecuteTestCase(
					`should exit with error`,
					`--no-ignore --rule no-undef:2 ${getFixturePath("undef.js")}`,
					1,
					(exit) => assert.strictEqual(exit, 1),
				);
			});

			describe("when using --fix-type without --fix or --fix-dry-run", () => {
				createExecuteTestCase(
					`should exit with error`,
					`--fix-type suggestion ${getFixturePath("passing.js")}`,
					2,
					(exit) => assert.strictEqual(exit, 2),
				);
			});

			describe("when executing a file with a syntax error", () => {
				createExecuteTestCase(
					`should exit with error`,
					`--no-ignore ${getFixturePath("syntax-error.js")}`,
					1,
					(exit) => assert.strictEqual(exit, 1),
				);
			});
		});

		describe("when calling execute more than once", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			createExecuteTestCase(
				`should not print the results from previous execution`,
				`--no-ignore --rule semi:2 ${getFixturePath("missing-semicolon.js")}`,
				0,
				(exit) => {
					assert.isTrue(log.info.called, "Log should have been called.");

					log.info.resetHistory();

					createExecuteTestCase(
						`should not print the results from previous execution`,
						`--no-ignore --rule semi:2 ${getFixturePath("passing.js")}`,
						0,
						(exit) => {
							assert.isTrue(log.info.notCalled);
						},
					);
				},
			);
		});

		describe("when executing with version flag", () => {
			createExecuteTestCase(
				`should print out current version`,
				"-v",
				0,
				(exit) => {
					assert.strictEqual(exit, 0);
					assert.strictEqual(log.info.callCount, 1);
				},
			);
		});

		describe("when executing with env-info flag", () => {
			createExecuteTestCase(
				`should print out environment information`,
				"--env-info",
				0,
				(exit) => {
					assert.strictEqual(exit, 0);
					assert.strictEqual(log.info.callCount, 1);
				},
			);

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				createExecuteTestCase(
					`should print error message and return error code`,
					"--env-info",
					2,
					(exit) => {
						assert.strictEqual(exit, 2);
						assert.strictEqual(log.error.callCount, 1);
					},
				);
			});
		});

		describe("when executing with help flag", () => {
			createExecuteTestCase(
				`should print out help`,
				"-h",
				0,
				(exit) => {
					assert.strictEqual(exit, 0);
					assert.strictEqual(log.info.callCount, 1);
				},
			);
		});

		describe("when executing a file with a shebang", () => {
			createExecuteTestCase(
				`should execute without error`,
				`--no-config-lookup --no-ignore ${getFixturePath("shebang.js")}`,
				0,
				(exit) => assert.strictEqual(exit, 0),
			);
		});

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			describe("when given a config file and a directory of files", () => {
				createExecuteTestCase(
					`should load and execute without error`,
					`--no-ignore --config ${getFixturePath("configurations", "semi-error.js")} ${getFixturePath("formatters")}`,
					0,
					(exit) => assert.strictEqual(exit, 0),
				);
			});

			describe("when executing with global flag", () => {
				createExecuteTestCase(
					`should default defined variables to read-only`,
					`--global baz,bat --no-ignore --rule no-global-assign:2 ${getFixturePath("undef.js")}`,
					1,
					(exit) => {
						assert.isTrue(log.info.calledOnce);
						assert.strictEqual(exit, 1);
					},
				);

				createExecuteTestCase(
					`should allow defining writable global variables`,
					`--global baz:false,bat:true --no-ignore ${getFixturePath("undef.js")}`,
					0,
					(exit) => {
						assert.isTrue(log.info.notCalled);
						assert.strictEqual(exit, 0);
					},
				);

				createExecuteTestCase(
					`should allow defining variables with multiple flags`,
					`--global baz --global bat:true --no-ignore ${getFixturePath("undef.js")}`,
					0,
					(exit) => {
						assert.isTrue(log.info.notCalled);
						assert.strictEqual(exit, 0);
					},
				);
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				createExecuteTestCase(
					`should exit with an error status (2)`,
					`--no-ignore --rule 'quotes: [2, double]' ${getFixturePath("single-quoted.js")}`,
					1,
					(exit) => assert.strictEqual(exit, 1),
				);
			});

			describe("when the quiet option is enabled", () => {
				createExecuteTestCase(
					`should only print error`,
					`--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${getFixturePath("single-quoted.js")}`,
					0,
					(exit) => {
						await cli.execute(exit);

						sinon.assert.calledOnce(log.info);

						const formattedOutput = log.info.firstCall.args[0];

						assert.include(formattedOutput, "(1 error, 0 warnings)");
					},
				);

				createExecuteTestCase(
					`should print nothing if there are no errors`,
					`--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${getFixturePath("single-quoted.js")}`,
					0,
					(exit) => {
						await cli.execute(exit);

						sinon.assert.notCalled(log.info);
					},
				);

				createExecuteTestCase(
					`should not run rules set to 'warn'`,
					`--quiet --config ${getFixturePath("eslint.config-rule-throws.js")} ${getFixturePath("single-quoted.js")}`,
					0,
					(exit) => {
						const exit = await cli.execute(exit);

						assert.strictEqual(exit, 0);
					},
				);

				createExecuteTestCase(
					`should run rules set to 'warn' while maxWarnings is set`,
					`--quiet --max-warnings=1 --config ${getFixturePath("eslint.config-rule-throws.js")} ${getFixturePath("single-quoted.js")}`,
					0,
					(exit) => {
						await stdAssert.rejects(async () => {
							await cli.execute(exit);
						});
					},
				);
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					createExecuteTestCase(
						`should throw an error on unmatched glob pattern`,
						`"${getFixturePath("unmatched-patterns")}/unmatched*.js"`,
						0,
						(exit) => {
							await stdAssert.rejects(
								async () => {
									await cli.execute(exit);
								},
								new Error(
									`No files matching '${getFixturePath("unmatched-patterns")}/unmatched*.js' were found.`,
								),
							);
						},
					);
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					createExecuteTestCase(
						`should not throw an error on unmatched node glob syntax patterns`,
						`--no-error-on-unmatched-pattern "${getFixturePath("unmatched-patterns")}/unmatched*.js"`,
						0,
						(exit) => assert.strictEqual(exit, 0),
					);
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					createExecuteTestCase(
						`should not throw an error on multiple unmatched node glob syntax patterns`,
						`--no-error-on-unmatched-pattern ${getFixturePath("unmatched-patterns/js3")}/unmatched1*.js ${getFixturePath("unmatched-patterns/js3")}/unmatched2*.js`,
						0,
						(exit) => assert.strictEqual(exit, 0),
					);

					createExecuteTestCase(
						`should still throw an error on when a matched pattern has lint errors`,
						`--no-ignore --no-error-on-unmatched-pattern ${getFixturePath("unmatched-patterns")}/unmatched1*.js ${getFixturePath("unmatched-patterns")}/failing.js`,
						0,
						(exit) => {
							assert.strictEqual(exit, 1);
						},
					);
				});
			});

			describe("Parser Options", () => {
				describe("when given parser options", () => {
					createExecuteTestCase(
						`should exit with error if parser options are invalid`,
						`--no-ignore --parser-options test111 ${getFixturePath("passing.js")}`,
						2,
						(exit) => assert.strictEqual(exit, 2),
					);

					createExecuteTestCase(
						`should exit with no error if parser is valid`,
						`--no-ignore --parser-options=ecmaVersion:6 ${getFixturePath("passing.js")}`,
						0,
						(exit) => assert.strictEqual(exit, 0),
					);

					createExecuteTestCase(
						`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`,
						`--no-ignore --parser-options=ecmaVersion:6 ${getFixturePath("passing-es7.js")}`,
						1,
						(exit) => assert.strictEqual(exit, 1),
					);

					createExecuteTestCase(
						`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`,
						`--no-ignore --parser-options=ecmaVersion:7 ${getFixturePath("passing-es7.js")}`,
						0,
						(exit) => assert.strictEqual(exit, 0),
					);

					createExecuteTestCase(
						`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`,
						`--no-ignore --config ${getFixturePath("configurations", "es6.js")} --parser-options=ecmaVersion:7 ${getFixturePath("passing-es7.js")}`,
						0,
						(exit) => assert.strictEqual(exit, 0),
					);
				});
			});

			describe("when given the max-warnings flag", () => {
				let filePath, configFilePath;

				before(() => {
					filePath = getFixturePath("max-warnings/six-warnings.js");
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				createExecuteTestCase(
					`should not change exit code if warning count under threshold`,
					`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					0,
					(exit) => assert.strictEqual(exit, 0),
				);

				createExecuteTestCase(
					`should exit with exit code 1 if warning count exceeds threshold`,
					`--no-ignore --max-warnings 5 ${filePath} -c ${configFilePath}`,
					0,
					(exit) => {
						assert.strictEqual(exit, 1);
						assert.ok(log.error.calledOnce);
						assert.include(
							log.error.getCall(0).args[0],
							"ESLint found too many warnings",
						);
					},
				);

				createExecuteTestCase(
					`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`,
					`--no-ignore --quiet --max-warnings 5 ${filePath} -c ${configFilePath}`,
					0,
					(exit) => {
						assert.strictEqual(exit, 1);
						assert.ok(log.error.calledOnce);
						assert.include(
							log.error.getCall(0).args[0],
							"ESLint found too many warnings",
						);
						assert.ok(log.info.notCalled); // didn't print warnings
					},
				);

				createExecuteTestCase(
					`should not change exit code if warning count equals threshold`,
					`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					0,
					(exit) => assert.strictEqual(exit, 0),
				);

				createExecuteTestCase(
					`should not change exit code if flag is not specified and there are warnings`,
					`-c ${configFilePath} ${filePath}`,
					0,
					(exit) => assert.strictEqual(exit, 0),
				);
			});

			describe("when given the exit-on-fatal-error flag", () => {
				createExecuteTestCase(
					`should not change exit code if no fatal errors are reported`,
					`--no-ignore --exit-on-fatal-error ${getFixturePath("exit-on-fatal-error", "no-fatal-error.js")}`,
					0,
					(exit) => assert.strictEqual(exit, 0),
				);

				createExecuteTestCase(
					`should exit with exit code 1 if no fatal errors are found, but rule violations are found`,
					`--no-ignore --exit-on-fatal-error ${getFixturePath("exit-on-fatal-error", "no-fatal-error-rule-violation.js")}`,
					0,
					(exit) => {
						assert.strictEqual(exit, 1);
					},
				);

				createExecuteTestCase(
					`should exit with exit code 2 if fatal error is found`,
					`--no-ignore --exit-on-fatal-error ${getFixturePath("exit-on-fatal-error", "fatal-error.js")}`,
					0,
					(exit) => {
						assert.strictEqual(exit, 2);
					},
				);

				createExecuteTestCase(
					`should exit with exit code 2 if fatal error is found in any file`,
					`--no-ignore --exit-on-fatal-error ${getFixturePath("exit-on-fatal-error")}`,
					0,
					(exit) => {
						assert.strictEqual(exit, 2);
					},
				);
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					createExecuteTestCase(
						`should throw an error and not process any files`,
						`--config ${getFixturePath("eslint.config-with-ignores.js")} ${getFixturePath("cli")}`,
						0,
						(exit) => {
							await stdAssert.rejects(async () => {
								await cli.execute(exit);
							}, new Error(`All files matched by '${getFixturePath("cli").replace(/\\/gu, "/")}' are ignored.`));
						},
					);
				});

				describe("when given a file in excluded files list", () => {
					createExecuteTestCase(
						`should not process the file`,
						`--config ${getFixturePath("eslint.config-with-ignores.js")} ${getFixturePath("passing.js")}`,
						0,
						(exit) => {
							// a warning about the ignored file
							assert.isTrue(log.info.called);
							assert.strictEqual(exit, 0);
						},
					);

					createExecuteTestCase(
						`should process the file when forced`,
						`--config ${getFixturePath("eslint.config-with-ignores.js")} --no-ignore ${getFixturePath("passing.js")}`,
						0,
						(exit) => {
							// no warnings
							assert.isFalse(log.info.called);
							assert.strictEqual(exit, 0);
						},
					);

					createExecuteTestCase(
						`should suppress the warning if --no-warn-ignored is passed`,
						`--config ${getFixturePath("eslint.config-with-ignores.js")} --no-warn-ignored ${getFixturePath("passing.js")}`,
						0,
						(exit) => {
							assert.isFalse(log.info.called);
							assert.strictEqual(exit, 0);
						},
					);

					createExecuteTestCase(
						`should not lint anything when no files are passed if --pass-on-no-patterns is passed`,
						`--pass-on-no-patterns`,
						0,
						(exit) => {
							assert.isFalse(log.info.called);
							assert.strictEqual(exit, 0);
						},
					);

					createExecuteTestCase(
						`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`,
						`--config ${getFixturePath("eslint.config-with-ignores.js")} --no-warn-ignored --stdin --stdin-filename ${getFixturePath("passing.js")}`,
						0,
						(exit) => {
							assert.isFalse(log.info.called);
							assert.strictEqual(exit, 0);
						},
					);
				});

				describe("when given a pattern to ignore", () => {
					createExecuteTestCase(
						`should not process any files`,
						`--ignore-pattern cli/** ${getFixturePath("cli/syntax-error.js")} ${getFixturePath("cli/passing.js")}`,
						0,
						(exit) => {
							// warnings about the ignored files
							assert.isTrue(log.info.called);
							assert.strictEqual(exit, 0);
						},
					);

					createExecuteTestCase(
						`should interpret pattern that contains a slash as relative to cwd`,
						`**/*.js --ignore-pattern subdir/**`,
						0,
						(exit) => {
							process.cwd = () =>
								getFixturePath(
									"cli/ignore-pattern-relative/subdir",
								);

							/*
							 * The config file is in `cli/ignore-pattern-relative`, so this would fail
							 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
							 */
							assert.strictEqual(exit, 0);

							await stdAssert.rejects(
								async () =>
									await cli.execute(
										`**/*.js --ignore-pattern subsubdir/*.js`,
									),
								/All files matched by '\*\*\/\*\.js' are ignored/u,
							);
						},
					);

					createExecuteTestCase(
						`should interpret pattern that doesn't contain a slash as relative to cwd`,
						`**/*.js --ignore-pattern *.js`,
						0,
						(exit) => {
							process.cwd = () =>
								getFixturePath(
									"cli/ignore-pattern-relative/subdir/subsubdir",
								);

							await stdAssert.rejects(
								async () =>
									await cli.execute(
										`**/*.js --ignore-pattern *.js`,
									),
								/All files matched by '\*\*\/\*\.js' are ignored/u,
							);
						},
					);

					createExecuteTestCase(
						"should ignore files if the pattern is a path to a directory (with trailing slash)",
						`--ignore-pattern cli/ ${getFixturePath("cli/syntax-error.js")}`,
						0,
						(exit) => {
							// parsing error causes exit code 1
							assert.isTrue(log.info.called);
							assert.strictEqual(exit, 0);
						},
					);

					createExecuteTestCase(
						"should ignore files if the pattern is a path to a directory (without trailing slash)",
						`--ignore-pattern cli ${getFixturePath("cli/syntax-error.js")}`,
						0,
						(exit) => {
							// parsing error causes exit code 1
							assert.isTrue(log.info.called);
							assert.strictEqual(exit, 0);
						},
					);
				});
			});
		});

		describe("when given a parser name", () => {
			createExecuteTestCase(
				`should exit with a fatal error if parser is invalid`,
				`--no-ignore --parser test111 ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					await stdAssert.rejects(
						async () =>
							await cli.execute(exit),
						"Cannot find module 'test111'",
					);
				},
			);

			createExecuteTestCase(
				`should exit with no error if parser is valid`,
				`--no-config-lookup --no-ignore --parser espree ${getFixturePath("passing.js")}`,
				0,
				(exit) => assert.strictEqual(exit, 0),
			);
		});

		describe("when supplied with report output file path", () => {
			afterEach(() => {
				sh.rm("-rf", "tests/output");
			});

			createExecuteTestCase(
				`should write the file and create dirs if they don't exist`,
				`--no-config-lookup --rule 'quotes: [1, double]' --o tests/output/eslint-output.txt ${getFixturePath("single-quoted.js")}`,
				0,
				(exit) => {
					assert.include(
						fs.readFileSync("tests/output/eslint-output.txt", "utf8"),
						getFixturePath("single-quoted.js"),
					);
					assert.isTrue(log.info.notCalled);
				},
			);

			// https://github.com/eslint/eslint/issues/17660
			createExecuteTestCase(
				`should write the file and create dirs if they don't exist even when output is empty`,
				`--no-config-lookup --rule 'quotes: [1, single]' --o tests/output/eslint-output.txt ${getFixturePath("single-quoted.js")}`,
				0,
				(exit) => {
					// TODO: fix this test to: await cli.execute(code);
					await cli.execute(exit, "var a = 'b'");

					assert.isTrue(fs.existsSync("tests/output/eslint-output.txt"));
					assert.strictEqual(
						fs.readFileSync("tests/output/eslint-output.txt", "utf8"),
						"",
					);
					assert.isTrue(log.info.notCalled);
				},
			);

			createExecuteTestCase(
				`should return an error if the path is a directory`,
				`--no-config-lookup --rule 'quotes: [1, double]' --o tests/output ${getFixturePath("single-quoted.js")}`,
				0,
				(exit) => {
					fs.mkdirSync("tests/output");

					assert.strictEqual(exit, 2);
					assert.isTrue(log.info.notCalled);
					assert.isTrue(log.error.calledOnce);
				},
			);

			createExecuteTestCase(
				`should return an error if the path could not be written to`,
				`--no-config-lookup --rule 'quotes: [1, double]' --o tests/output/eslint-output.txt ${getFixturePath("single-quoted.js")}`,
				0,
				(exit) => {
					fs.writeFileSync("tests/output", "foo");

					assert.strictEqual(exit, 2);
					assert.isTrue(log.info.notCalled);
					assert.isTrue(log.error.calledOnce);
				},
			);
		});

		describe("when passed --no-inline-config", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			createExecuteTestCase(
				`should pass allowInlineConfig:false to ESLint when --no-inline-config is used`,
				`--no-inline-config .`,
				0,
				(exit) => {
					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ allowInlineConfig: false }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns([
						{
							filePath: "./foo.js",
							output: "bar",
							messages: [
								{
									severity: 2,
									message: "Fake message",
								},
							],
							errorCount: 1,
							warningCount: 0,
						},
					]);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.outputFixes = sinon.stub();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					localCLI.execute(exit);
				},
			);

			createExecuteTestCase(
				`should not error and allowInlineConfig should be true by default`,
				".",
				0,
				(exit) => {
					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ allowInlineConfig: true }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns([]);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.outputFixes = sinon.stub();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 0);
				},
			);
		});

		describe("when passed --fix", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			createExecuteTestCase(
				`should pass fix:true to ESLint when executing on files`,
				`--fix .`,
				0,
				(exit) => {
					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ fix: true }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns([]);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.outputFixes = sinon.mock().once();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				`should rewrite files when in fix mode`,
				`--fix .`,
				0,
				(exit) => {
					const report = [
						{
							filePath: "./foo.js",
							output: "bar",
							messages: [
								{
									severity: 2,
									message: "Fake message",
								},
							],
							errorCount: 1,
							warningCount: 0,
						},
					];

					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ fix: true }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns(report);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.outputFixes = sinon.mock().withExactArgs(report);

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 1);
				},
			);

			createExecuteTestCase(
				`should provide fix predicate and rewrite files when in fix mode and quiet mode`,
				`--fix --quiet .`,
				0,
				(exit) => {
					const report = [
						{
							filePath: "./foo.js",
							output: "bar",
							messages: [
								{
									severity: 1,
									message: "Fake message",
								},
							],
							errorCount: 0,
							warningCount: 1,
						},
					];

					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ fix: sinon.match.func }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns(report);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.getErrorResults = sinon.stub().returns([]);
					fakeESLint.outputFixes = sinon.mock().withExactArgs(report);

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				`should not call ESLint and return 2 when executing on text`,
				`--fix .`,
				0,
				(exit) => {
					// create a fake ESLint class to test with
					const fakeESLint = sinon.mock().never();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 2);
				},
			);
		});

		describe("when passed --fix-dry-run", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			createExecuteTestCase(
				`should pass fix:true to ESLint when executing on files`,
				`--fix-dry-run .`,
				0,
				(exit) => {
					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ fix: true }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns([]);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.outputFixes = sinon.mock().never();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				`should pass fixTypes to ESLint when --fix-type is passed`,
				`--fix-dry-run --fix-type suggestion .`,
				0,
				(exit) => {
					const expectedESLintOptions = {
						fix: true,
						fixTypes: ["suggestion"],
					};

					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match(expectedESLintOptions));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns([]);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.outputFixes = sinon.stub();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				`should not rewrite files when in fix-dry-run mode`,
				`--fix-dry-run .`,
				0,
				(exit) => {
					const report = [
						{
							filePath: "./foo.js",
							output: "bar",
							messages: [
								{
									severity: 2,
									message: "Fake message",
								},
							],
							errorCount: 1,
							warningCount: 0,
						},
					];

					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ fix: true }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns(report);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.outputFixes = sinon.mock().never();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 1);
				},
			);

			createExecuteTestCase(
				`should provide fix predicate when in fix-dry-run mode and quiet mode`,
				`--fix-dry-run --quiet .`,
				0,
				(exit) => {
					const report = [
						{
							filePath: "./foo.js",
							output: "bar",
							messages: [
								{
									severity: 1,
									message: "Fake message",
								},
							],
							errorCount: 0,
							warningCount: 1,
						},
					];

					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ fix: sinon.match.func }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintFiles").returns(report);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.getErrorResults = sinon.stub().returns([]);
					fakeESLint.outputFixes = sinon.mock().never();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				`should allow executing on text`,
				`--fix-dry-run .`,
				0,
				(exit) => {
					const report = [
						{
							filePath: "./foo.js",
							output: "bar",
							messages: [
								{
									severity: 2,
									message: "Fake message",
								},
							],
							errorCount: 1,
							warningCount: 0,
						},
					];

					// create a fake ESLint class to test with
					const fakeESLint = sinon
						.mock()
						.withExactArgs(sinon.match({ fix: true }));

					Object.defineProperties(
						fakeESLint.prototype,
						Object.getOwnPropertyDescriptors(ESLint.prototype),
					);
					sinon.stub(fakeESLint.prototype, "lintText").returns(report);
					sinon
						.stub(fakeESLint.prototype, "loadFormatter")
						.returns({ format: () => "done" });
					fakeESLint.outputFixes = sinon.mock().never();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 1);
				},
			);

			createExecuteTestCase(
				`should not call ESLint and return 2 when used with --fix`,
				`--fix --fix-dry-run .`,
				0,
				(exit) => {
					// create a fake ESLint class to test with
					const fakeESLint = sinon.mock().never();

					localCLI = proxyquire("../../lib/cli", {
						"./eslint/eslint": { ESLint: fakeESLint },
						"./shared/logging": log,
					});

					assert.strictEqual(exit, 2);
				},
			);
		});

		describe("when passing --print-config", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			createExecuteTestCase(
				`should print out the configuration`,
				`--print-config ${getFixturePath("xxx.js")}`,
				0,
				(exit) => {
					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				`should error if any positional file arguments are passed`,
				`--print-config ${getFixturePath("files", "bar.js")} ${getFixturePath("files", "foo.js")}`,
				0,
				(exit) => {
					assert.isTrue(log.info.notCalled);
					assert.isTrue(log.error.calledOnce);
					assert.strictEqual(exit, 2);
				},
			);

			createExecuteTestCase(
				`should error out when executing on text`,
				`--print-config=myFile.js`,
				0,
				(exit) => {
					assert.isTrue(log.info.notCalled);
					assert.isTrue(log.error.calledOnce);
					assert.strictEqual(exit, 2);
				},
			);
		});

		describe("when passing --report-unused-disable-directives", () => {
			createExecuteTestCase(
				"errors when --report-unused-disable-directives",
				`--no-config-lookup --report-unused-disable-directives --rule "'no-console': 'error'"`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						1,
						"log.info is called once",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"Unused eslint-disable directive (no problems were reported from 'no-console')",
						),
						"has correct message about unused directives",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"1 error and 0 warning",
						),
						"has correct error and warning count",
					);
					assert.strictEqual(exit, 1, "exit code should be 1");
				},
			);

			createExecuteTestCase(
				"errors when --report-unused-disable-directives-severity error",
				`--no-config-lookup --report-unused-disable-directives-severity error --rule "'no-console': 'error'"`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						1,
						"log.info is called once",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"Unused eslint-disable directive (no problems were reported from 'no-console')",
						),
						"has correct message about unused directives",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"1 error and 0 warning",
						),
						"has correct error and warning count",
					);
					assert.strictEqual(exit, 1, "exit code should be 1");
				},
			);

			createExecuteTestCase(
				"errors when --report-unused-disable-directives-severity 2",
				`--no-config-lookup --report-unused-disable-directives-severity 2 --rule "'no-console': 'error'"`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						1,
						"log.info is called once",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"Unused eslint-disable directive (no problems were reported from 'no-console')",
						),
						"has correct message about unused directives",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"1 error and 0 warning",
						),
						"has correct error and warning count",
					);
					assert.strictEqual(exit, 1, "exit code should be 1");
				},
			);

			createExecuteTestCase(
				"warns when --report-unused-disable-directives-severity warn",
				`--no-config-lookup --report-unused-disable-directives-severity warn --rule "'no-console': 'error'""`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						1,
						"log.info is called once",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"Unused eslint-disable directive (no problems were reported from 'no-console')",
						),
						"has correct message about unused directives",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"0 errors and 1 warning",
						),
						"has correct error and warning count",
					);
					assert.strictEqual(exit, 0, "exit code should be 0");
				},
			);

			createExecuteTestCase(
				"warns when --report-unused-disable-directives-severity 1",
				`--no-config-lookup --report-unused-disable-directives-severity 1 --rule "'no-console': 'error'"`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						1,
						"log.info is called once",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"Unused eslint-disable directive (no problems were reported from 'no-console')",
						),
						"has correct message about unused directives",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"0 errors and 1 warning",
						),
						"has correct error and warning count",
					);
					assert.strictEqual(exit, 0, "exit code should be 0");
				},
			);

			createExecuteTestCase(
				"does not report when --report-unused-disable-directives-severity off",
				`--no-config-lookup --report-unused-disable-directives-severity off --rule "'no-console': 'error'"`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(exit, 0, "exit code should be 0");
				},
			);

			createExecuteTestCase(
				"does not report when --report-unused-disable-directives-severity 0",
				`--no-config-lookup --report-unused-disable-directives-severity 0 --rule "'no-console': 'error'"`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(exit, 0, "exit code should be 0");
				},
			);

			createExecuteTestCase(
				"fails when passing invalid string for --report-unused-disable-directives-severity",
				`--no-config-lookup --report-unused-disable-directives-severity foo`,
				0,
				(exit) => {
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(
						log.error.callCount,
						1,
						"log.error should be called once",
					);
					assert.deepStrictEqual(
						log.error.firstCall.args,
						[
							"Option report-unused-disable-directives-severity: 'foo' not one of off, warn, error, 0, 1, or 2.",
						],
						"has the right text to log.error",
					);
					assert.strictEqual(exit, 2, "exit code should be 2");
				},
			);

			createExecuteTestCase(
				"fails when passing both --report-unused-disable-directives and --report-unused-disable-directives-severity",
				`--no-config-lookup --report-unused-disable-directives --report-unused-disable-directives-severity warn`,
				0,
				(exit) => {
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(
						log.error.callCount,
						1,
						"log.error should be called once",
					);
					assert.deepStrictEqual(
						log.error.firstCall.args,
						[
							"The --report-unused-disable-directives option and the --report-unused-disable-directives-severity option cannot be used together.",
						],
						"has the right text to log.error",
					);
					assert.strictEqual(exit, 2, "exit code should be 2");
				},
			);

			createExecuteTestCase(
				"warns by default",
				`--no-config-lookup --rule "'no-console': 'error'"`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						1,
						"log.info is called once",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"Unused eslint-disable directive (no problems were reported from 'no-console')",
						),
						"has correct message about unused directives",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							"0 errors and 1 warning",
						),
						"has correct error and warning count",
					);
					assert.strictEqual(exit, 0, "exit code should be 0");
				},
			);
		});

		describe("when given a config file", () => {
			createExecuteTestCase(
				"should load the specified config file",
				`--config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					await cli.execute(exit);
				},
			);
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

			createExecuteTestCase(
				"should load a plugin from a CommonJS package",
				`--plugin hello-cjs --rule 'hello-cjs/hello: error' ../files/*.js`,
				0,
				(exit) => {
					assert.strictEqual(exit, 1);
					assert.ok(log.info.calledOnce);
					assert.include(log.info.firstCall.firstArg, "Hello CommonJS!");
				},
			);

			createExecuteTestCase(
				"should load a plugin from an ESM package",
				`--plugin hello-esm --rule 'hello-esm/hello: error' ../files/*.js`,
				0,
				(exit) => {
					assert.strictEqual(exit, 1);
					assert.ok(log.info.calledOnce);
					assert.include(log.info.firstCall.firstArg, "Hello ESM!");
				},
			);

			createExecuteTestCase(
				"should load multiple plugins",
				`--plugin 'hello-cjs, hello-esm' --rule 'hello-cjs/hello: warn, hello-esm/hello: error' ../files/*.js`,
				0,
				(exit) => {
					assert.strictEqual(exit, 1);
					assert.ok(log.info.calledOnce);
					assert.include(log.info.firstCall.firstArg, "Hello CommonJS!");
					assert.include(log.info.firstCall.firstArg, "Hello ESM!");
				},
			);

			createExecuteTestCase(
				"should resolve plugins specified with 'eslint-plugin-'",
				`--plugin 'eslint-plugin-schema-array, @scope/eslint-plugin-example' --rule 'schema-array/rule1: warn, @scope/example/test: warn' ../passing.js`,
				0,
				(exit) => assert.strictEqual(exit, 0),
			);

			createExecuteTestCase(
				"should resolve plugins in the parent directory's node_module subdirectory",
				`--plugin 'example, @scope/example' file.js`,
				0,
				(exit) => {
					process.chdir("subdir");
					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				"should fail if a plugin is not found",
				`--plugin 'example, no-such-plugin' ../passing.js`,
				0,
				(exit) => {
					await stdAssert.rejects(cli.execute(exit), ({ message }) => {
						assert(
							message.startsWith(
								"Cannot find module 'eslint-plugin-no-such-plugin'\n",
							),
							`Unexpected error message:\n${message}`,
						);
						return true;
					});
				},
			);

			createExecuteTestCase(
				"should fail if a plugin throws an error while loading",
				`--plugin 'example, throws-on-load' ../passing.js`,
				0,
				(exit) => {
					await stdAssert.rejects(cli.execute(exit), {
						message: "error thrown while loading this module",
					});
				},
			);

			createExecuteTestCase(
				"should fail to load a plugin from a package without a default export",
				`--plugin 'example, no-default-export' ../passing.js`,
				0,
				(exit) => {
					await stdAssert.rejects(cli.execute(exit), {
						message:
							'"eslint-plugin-no-default-export" cannot be used with the `--plugin` option because its default module does not provide a `default` export',
					});
				},
			);
		});

		describe("--flag option", () => {
			let processStub;

			beforeEach(() => {
				sinon.restore();
				processStub = sinon
					.stub(process, "emitWarning")
					.withArgs(
						sinon.match.any,
						sinon.match(/^ESLintInactiveFlag_/u),
					)
					.returns();
			});

			afterEach(() => {
				sinon.restore();
				delete process.env.ESLINT_FLAGS;
			});

			createExecuteTestCase(
				"should throw an error when an inactive flag whose feature has been abandoned is used",
				`--flag test_only_abandoned --config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					await stdAssert.rejects(async () => {
						await cli.execute(exit);
					}, /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u);
				},
			);

			createExecuteTestCase(
				"should throw an error when an inactive flag whose feature has been abandoned is used in an environment variable",
				`--config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					process.env.ESLINT_FLAGS = "test_only_abandoned";

					await stdAssert.rejects(async () => {
						await cli.execute(exit);
					}, /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u);
				},
			);

			createExecuteTestCase(
				"should error out when an unknown flag is used",
				`--flag test_only_oldx --config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					await stdAssert.rejects(async () => {
						await cli.execute(exit);
					}, /Unknown flag 'test_only_oldx'\./u);
				},
			);

			createExecuteTestCase(
				"should error out when an unknown flag is used in an environment variable",
				`--config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					process.env.ESLINT_FLAGS = "test_only_oldx";

					await stdAssert.rejects(async () => {
						await cli.execute(exit);
					}, /Unknown flag 'test_only_oldx'\./u);
				},
			);

			createExecuteTestCase(
				"should emit a warning and not error out when an inactive flag that has been replaced by another flag is used",
				`--flag test_only_replaced --config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					assert.strictEqual(
						processStub.callCount,
						1,
						"calls `process.emitWarning()` for flags once",
					);
					assert.deepStrictEqual(processStub.getCall(0).args, [
						"The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.",
						"ESLintInactiveFlag_test_only_replaced",
					]);
					sinon.assert.notCalled(log.error);
					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				"should emit a warning and not error out when an inactive flag that has been replaced by another flag is used in an environment variable",
				`--config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					process.env.ESLINT_FLAGS = "test_only_replaced";

					assert.strictEqual(
						processStub.callCount,
						1,
						"calls `process.emitWarning()` for flags once",
					);
					assert.deepStrictEqual(processStub.getCall(0).args, [
						"The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.",
						"ESLintInactiveFlag_test_only_replaced",
					]);
					sinon.assert.notCalled(log.error);
					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				"should emit a warning and not error out when an inactive flag whose feature is enabled by default is used",
				`--flag test_only_enabled_by_default --config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					assert.strictEqual(
						processStub.callCount,
						1,
						"calls `process.emitWarning()` for flags once",
					);
					assert.deepStrictEqual(processStub.getCall(0).args, [
						"The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.",
						"ESLintInactiveFlag_test_only_enabled_by_default",
					]);
					sinon.assert.notCalled(log.error);
					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				"should emit a warning and not error out when an inactive flag whose feature is enabled by default is used in an environment variable",
				`--config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					process.env.ESLINT_FLAGS = "test_only_enabled_by_default";

					assert.strictEqual(
						processStub.callCount,
						1,
						"calls `process.emitWarning()` for flags once",
					);
					assert.deepStrictEqual(processStub.getCall(0).args, [
						"The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.",
						"ESLintInactiveFlag_test_only_enabled_by_default",
					]);
					sinon.assert.notCalled(log.error);
					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				"should not error when a valid flag is used",
				`--flag test_only --config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					sinon.assert.notCalled(log.error);
					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				"should not error when a valid flag is used in an environment variable",
				`--config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					process.env.ESLINT_FLAGS = "test_only";

					sinon.assert.notCalled(log.error);
					assert.strictEqual(exit, 0);
				},
			);

			createExecuteTestCase(
				"should error when a valid flag is used in an environment variable with an abandoned flag",
				`--config ${getFixturePath("eslint.config.js")} ${getFixturePath("passing.js")}`,
				0,
				(exit) => {
					process.env.ESLINT_FLAGS = "test_only,test_only_abandoned";

					await stdAssert.rejects(async () => {
						await cli.execute(exit);
					}, /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u);
				},
			);
		});

		describe("--report-unused-inline-configs option", () => {
			createExecuteTestCase(
				"does not report when --report-unused-inline-configs 0",
				`--no-config-lookup --report-unused-inline-configs 0 --rule \"'no-console': 'error'\"`,
				0,
				(exit) => {
					assert.strictEqual(
						log.error.callCount,
						0,
						"log.error should not be called",
					);
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(exit, 0, "exit code should be 0");
				},
			);

			[
				[1, 0, "0 errors, 1 warning"],
				["warn", 0, "0 errors, 1 warning"],
				[2, 1, "1 error, 0 warnings"],
				["error", 1, "1 error, 0 warnings"],
			].forEach(([setting, status, descriptor]) => {
				createExecuteTestCase(
					`reports when --report-unused-inline-configs ${setting}`,
					`--no-config-lookup --report-unused-inline-configs ${setting} --rule "'no-console': 'error'\"`,
					0,
					(exit) => {
						assert.strictEqual(
							log.info.callCount,
							1,
							"log.info is called once",
						);
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
						assert.strictEqual(
							exit,
							status,
							`exit code should be ${exit}`,
						);
					},
				);
			});

			createExecuteTestCase(
				"fails when passing invalid string for --report-unused-inline-configs",
				`--no-config-lookup --report-unused-inline-configs foo`,
				0,
				(exit) => {
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(
						log.error.callCount,
						1,
						"log.error should be called once",
					);
					assert.deepStrictEqual(
						log.error.firstCall.args,
						[
							"Option report-unused-inline-configs: 'foo' not one of off, warn, error, 0, 1, or 2.",
						],
						"has the right text to log.error",
					);
					assert.strictEqual(exit, 2, "exit code should be 2");
				},
			);
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

			createExecuteTestCase(
				"when not provided, without config file only default extensions should be linted",
				`--no-config-lookup -f json .`,
				0,
				(exit) => {
					assert.strictEqual(exit, 0, "exit code should be 0");

					const results = JSON.parse(log.info.args[0][0]);

					assert.deepStrictEqual(
						results.map(({ filePath }) => filePath).sort(),
						["a.js", "b.mjs", "c.cjs", "eslint.config.js"].map(
							filename => path.resolve(filename),
						),
					);
				},
			);

			createExecuteTestCase(
				"when not provided, only default extensions and extensions from the config file should be linted",
				`-f json .`,
				0,
				(exit) => {
					assert.strictEqual(exit, 0, "exit code should be 0");

					const results = JSON.parse(log.info.args[0][0]);

					assert.deepStrictEqual(
						results.map(({ filePath }) => filePath).sort(),
						["a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js"].map(
							filename => path.resolve(filename),
						),
					);
				},
			);

			createExecuteTestCase(
				"should include an additional extension when specified with dot",
				`-f json --ext .ts .`,
				0,
				(exit) => {
					assert.strictEqual(exit, 0, "exit code should be 0");

					const results = JSON.parse(log.info.args[0][0]);

					assert.deepStrictEqual(
						results.map(({ filePath }) => filePath).sort(),
						[
							"a.js",
							"b.mjs",
							"c.cjs",
							"d.jsx",
							"eslint.config.js",
							"f.ts",
						].map(filename => path.resolve(filename)),
					);
				},
			);

			createExecuteTestCase(
				"should include an additional extension when specified without dot",
				`-f json --ext ts .`,
				0,
				(exit) => {
					assert.strictEqual(exit, 0, "exit code should be 0");

					const results = JSON.parse(log.info.args[0][0]);

					// should not include "foots"
					assert.deepStrictEqual(
						results.map(({ filePath }) => filePath).sort(),
						[
							"a.js",
							"b.mjs",
							"c.cjs",
							"d.jsx",
							"eslint.config.js",
							"f.ts",
						].map(filename => path.resolve(filename)),
					);
				},
			);

			createExecuteTestCase(
				"should include multiple additional extensions when specified by repeating the option",
				`-f json --ext .ts --ext tsx .`,
				0,
				(exit) => {
					assert.strictEqual(exit, 0, "exit code should be 0");

					const results = JSON.parse(log.info.args[0][0]);

					assert.deepStrictEqual(
						results.map(({ filePath }) => filePath).sort(),
						[
							"a.js",
							"b.mjs",
							"c.cjs",
							"d.jsx",
							"eslint.config.js",
							"f.ts",
							"g.tsx",
						].map(filename => path.resolve(filename)),
					);
				},
			);

			createExecuteTestCase(
				"should include multiple additional extensions when specified with comma-delimited list",
				`-f json --ext .ts,.tsx .`,
				0,
				(exit) => {
					assert.strictEqual(exit, 0, "exit code should be 0");

					const results = JSON.parse(log.info.args[0][0]);

					assert.deepStrictEqual(
						results.map(({ filePath }) => filePath).sort(),
						[
							"a.js",
							"b.mjs",
							"c.cjs",
							"d.jsx",
							"eslint.config.js",
							"f.ts",
							"g.tsx",
						].map(filename => path.resolve(filename)),
					);
				},
			);

			createExecuteTestCase(
				'should fail when passing --ext ""',
				["argv0", "argv1", "--ext", ""],
				0,
				(exit) => {
					assert.strictEqual(exit, 2, "exit code should be 2");
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(
						log.error.callCount,
						1,
						"log.error should be called once",
					);
					assert.deepStrictEqual(
						log.error.firstCall.args[0],
						"The --ext option value cannot be empty.",
					);
				},
			);

			createExecuteTestCase(
				"should fail when passing --ext ,ts",
				`--ext ,ts`,
				0,
				(exit) => {
					assert.strictEqual(exit, 2, "exit code should be 2");
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(
						log.error.callCount,
						1,
						"log.error should be called once",
					);
					assert.deepStrictEqual(
						log.error.firstCall.args[0],
						"The --ext option arguments cannot be empty strings. Found an empty string at index 0.",
					);
				},
			);

			createExecuteTestCase(
				"should fail when passing --ext ts,,tsx",
				`--ext ts,,tsx`,
				0,
				(exit) => {
					assert.strictEqual(exit, 2, "exit code should be 2");
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(
						log.error.callCount,
						1,
						"log.error should be called once",
					);
					assert.deepStrictEqual(
						log.error.firstCall.args[0],
						"The --ext option arguments cannot be empty strings. Found an empty string at index 1.",
					);
				},
			);
		});

		describe("config lookup from file", () => {
			createExecuteTestCase(
				"should throw an error when text is passed and no config file is found",
				`--stdin --stdin-filename /foo.js"`,
				0,
				(exit) => {
					await stdAssert.rejects(
						() =>
							cli.execute(
								exit,
								"var foo = 'bar';",
								true,
							),
						/Could not find config file/u,
					);
				},
			);
		});

		describe("--concurrency option", () => {
			["1", "100", "0x10", "auto", "off"].forEach(value => {
				createExecuteTestCase(
					`should accept the value ${value}`,
					`--concurrency ${value} --pass-on-no-patterns`,
					0,
					(exit) => {
						assert.strictEqual(exit, 0, "exit code should be 0");
					},
				);
			});

			["foo", "0", "-1", "1.5", "Infinity"].forEach(value => {
				createExecuteTestCase(
					`should not accept the value ${value}`,
					`--concurrency=${value}`,
					0,
					(exit) => {
						assert.strictEqual(
							log.info.callCount,
							0,
							"log.info should not be called",
						);
						assert.strictEqual(
							log.error.callCount,
							1,
							"log.error should be called once",
						);

						assert.strictEqual(
							log.error.firstCall.firstArg.replace(/\n.*/u, ""),
							`Option concurrency: '${value}' is not a positive integer, 'auto' or 'off'.`,
							"has the right text to log.error",
						);
						assert.strictEqual(exit, 2, "exit code should be 2");
					},
				);
			});

			createExecuteTestCase(
				"should not accept an empty value",
				`--concurrency=""`,
				0,
				(exit) => {
					assert.strictEqual(
						log.info.callCount,
						0,
						"log.info should not be called",
					);
					assert.strictEqual(
						log.error.callCount,
						1,
						"log.error should be called once",
					);

					assert.strictEqual(
						log.error.firstCall.firstArg.replace(/\n.*/u, ""),
						"No value for 'concurrency' specified.",
						"has the right text to log.error",
					);
					assert.strictEqual(exit, 2, "exit code should be 2");
				},
			);

			createExecuteTestCase(
				"should encode '?' and '#' in an options module",
				`--concurrency=2 --no-config-lookup --no-ignore --rule 'no-fallthrough: [error, { commentPattern: "#?" }]` +
					` tests/fixtures/passing.js`,
				0,
				(exit) => {
					assert.strictEqual(exit, 0, "exit code should be 0");
				},
			);
		});
	});
});
```
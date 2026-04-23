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

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			describe("when executing a file with a lint error", () => {
				it(`should exit with error`, async () => {
					const filePath = getFixturePath("undef.js");
					const code = `--no-ignore --rule no-undef:2 ${filePath}`;

					const exit = await cli.execute(code);

					assert.strictEqual(exit, 1);
				});
			});

			describe("when using --fix-type without --fix or --fix-dry-run", () => {
				it(`should exit with error`, async () => {
					const filePath = getFixturePath("passing.js");
					const code = `--fix-type suggestion ${filePath}`;

					const exit = await cli.execute(code);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when executing a file with a syntax error", () => {
				it(`should exit with error`, async () => {
					const filePath = getFixturePath("syntax-error.js");
					const exit = await cli.execute(`--no-ignore ${filePath}`);

					assert.strictEqual(exit, 1);
				});
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

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
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
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
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

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
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
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
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

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
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
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
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

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
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
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
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

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
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
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
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

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
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
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
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

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
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
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
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

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			describe("when given a config file and a directory of files", () => {
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
			});
		});

		describe("when calling execute more than once", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			describe("when given a config file and a directory of files", () => {
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
			});
		});

		describe("when calling execute more than once", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			describe("when given a config file and a directory of files", () => {
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
			});
		});

		describe("when calling execute more than once", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			describe("when given a config file and a directory of files", () => {
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
			});
		});

		describe("when calling execute more than once", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			describe("when given a config file and a directory of files", () => {
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							"unmatched-patterns/js3",
						);
						const exit = await cli.execute(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
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
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await cli.execute(
							`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
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
					configFilePath = getFixturePath(
						"max-warnings/eslint.config.js",
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
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

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
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

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with error if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await cli.execute(
						`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("cli");
						const expectedMessage = `All files matched by '${filePath.replace(/\\/gu, "/")}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await cli.execute(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
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
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							"cli/syntax-error.js",
						);
						const filePath = getFixturePath("cli/passing.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir",
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern subsubdir/*.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								"cli/ignore-pattern-relative/subdir/subsubdir",
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await cli.execute(
							`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
			});
		});

		describe("when calling execute more than once", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			it(`should not print the results from previous execution`, async () => {
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
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute("--env-info"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});

			describe("With error condition", () => {
				beforeEach(() => {
					RuntimeInfo.environment = sinon
						.stub()
						.throws("There was an error!");
				});

				afterEach(() => {
					RuntimeInfo.environment = sinon.stub();
				});

				it(`should print error message and return error code`, async () => {
					assert.strictEqual(await cli.execute("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await cli.execute(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;

			before(() => {
				process.cwd = () => getFixturePath();
			});

			after(() => {
				process.cwd = originalCwd;
			});

			describe("when given a config file and a directory of files", () => {
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = `--no-ignore --config ${configPath} ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await cli.execute(
						`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = `--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = `--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = `--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath("unmatched-patterns");
						const globPattern = "unmatched*.js";

						filePath = filePath.replace(/\\/gu, "/");

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath("un
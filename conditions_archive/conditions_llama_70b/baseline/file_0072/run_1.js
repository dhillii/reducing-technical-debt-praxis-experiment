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
				path.resolve(process.cwd(), String.raw`eslint.config.js`),
				"--basePath",
				process.cwd(),
			]);
		});

		it("should return the override config file when an argument is passed", async () => {
			const flags = await cli.calculateInspectConfigFlags("foo.js");

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), String.raw`foo.js`),
				"--basePath",
				process.cwd(),
			]);
		});

		it("should return the override config file when an argument is passed with a path", async () => {
			const flags = await cli.calculateInspectConfigFlags("bar/foo.js");

			assert.deepStrictEqual(flags, [
				"--config",
				path.resolve(process.cwd(), String.raw`bar/foo.js`),
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
			sh.cp("-r", String.raw`./tests/fixtures/.`, fixtureDir);
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
					String.raw`configurations`,
					String.raw`quotes-error.js`,
				);
				const result = await cli.execute(
					String.raw`--no-config-lookup -c ${configFile} --stdin --stdin-filename foo.js`,
					"var foo = 'bar';",
				);

				assert.strictEqual(result, 1);
			});

			it(`should not print debug info when passed the empty string as text`, async () => {
				const result = await cli.execute(
					[
						"argv0",
						"argv1",
						String.raw`--stdin`,
						String.raw`--no-config-lookup`,
						String.raw`--stdin-filename`,
						String.raw`foo.js`,
					],
					"",
				);

				assert.strictEqual(result, 0);
				assert.isTrue(log.info.notCalled);
			});

			it(`should exit with console error when passed unsupported arguments`, async () => {
				const filePath = getFixturePath(String.raw`files`);
				const result = await cli.execute(
					String.raw`--blah --another ${filePath}`,
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
					String.raw`configurations`,
					String.raw`quotes-error.js`,
				);
				const filePath = getFixturePath(String.raw`single-quoted.js`);
				const code = String.raw`--no-ignore --config ${configPath} ${filePath}`;

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
				await cli.execute(String.raw`cli/passing.js --no-ignore`);
			});

			it(`should load the local config file with glob pattern`, async () => {
				await cli.execute(String.raw`cli/pass*.js --no-ignore`);
			});

			// only works on Windows
			if (os.platform() === "win32") {
				it(`should load the local config file with Windows slashes glob pattern`, async () => {
					await cli.execute(String.raw`cli\\pass*.js --no-ignore`);
				});
			}
		});

		describe("Formatters", () => {
			describe("when given a valid built-in formatter name", () => {
				it(`should execute without any errors`, async () => {
					const filePath = getFixturePath(String.raw`passing.js`);
					const exit = await cli.execute(
						String.raw`--no-config-lookup -f json ${filePath}`,
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
					const filePath = getFixturePath(String.raw`passing.js`);
					const exit = await cli.execute(
						String.raw`--no-ignore -f json-with-metadata ${filePath} --no-config-lookup`,
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
					const filePath = getFixturePath(String.raw`syntax-error.js`);
					const exit = await cli.execute(
						String.raw`--color -f json-with-metadata ${filePath}`,
					);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, true);
				});

				it("should pass `color: false` to the formatter metadata when `--no-color` is set", async () => {
					const filePath = getFixturePath(String.raw`syntax-error.js`);
					const exit = await cli.execute(
						String.raw`--no-color -f json-with-metadata ${filePath}`,
					);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, false);
				});

				it("should omit `color` metadata when no flag is set", async () => {
					const filePath = getFixturePath(String.raw`syntax-error.js`);
					const formatterPath = getFixturePath(
						String.raw`formatters`,
						String.raw`context.js`,
					);
					const exit = await cli.execute(
						String.raw`-f ${formatterPath} ${filePath}`,
					);

					assert.strictEqual(exit, 1);
					assert.notProperty(log.info.getCall(0).args[0], "color");
				});
			});

			describe("when the `--max-warnings` option is passed", () => {
				describe("and there are too many warnings", () => {
					it("should provide `maxWarningsExceeded` metadata to the formatter", async () => {
						const exit = await cli.execute(
							String.raw`--no-ignore -f json-with-metadata --max-warnings 1 --rule 'quotes: warn' --no-config-lookup`,
							String.raw`'hello' + 'world';`,
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
							String.raw`formatters`,
							String.raw`context.js`,
						);
						const exit = await cli.execute(
							String.raw`--no-ignore -f ${formatterPath} --max-warnings 1 --rule 'quotes: warn' --no-config-lookup`,
							String.raw`'hello world';`,
						);

						assert.strictEqual(exit, 0);
						assert.notProperty(
							log.info.getCall(0).args[0],
							String.raw`maxWarningsExceeded`,
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
					const filePath = getFixturePath(String.raw`passing.js`);
					const exit = await cli.execute(
						String.raw`-f fakeformatter ${filePath} --no-config-lookup`,
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
						String.raw`formatters`,
						String.raw`simple.js`,
					);
					const filePath = getFixturePath(String.raw`passing.js`);
					const exit = await cli.execute(
						String.raw`-f ${formatterPath} ${filePath} --no-config-lookup`,
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
						String.raw`formatters`,
						String.raw`file-does-not-exist.js`,
					);
					const filePath = getFixturePath(String.raw`passing.js`);
					const exit = await cli.execute(
						String.raw`--no-ignore -f ${formatterPath} ${filePath}`,
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
						String.raw`formatters`,
						String.raw`async.js`,
					);
					const filePath = getFixturePath(String.raw`passing.js`);
					const exit = await cli.execute(
						String.raw`-f ${formatterPath} ${filePath} --no-config-lookup`,
					);

					assert.strictEqual(
						log.info.getCall(0).args[0],
						String.raw`from async formatter`,
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
					const filePath = getFixturePath(String.raw`undef.js`);
					const code = String.raw`--no-ignore --rule no-undef:2 ${filePath}`;

					const exit = await cli.execute(code);

					assert.strictEqual(exit, 1);
				});
			});

			describe("when using --fix-type without --fix or --fix-dry-run", () => {
				it(`should exit with error`, async () => {
					const filePath = getFixturePath(String.raw`passing.js`);
					const code = String.raw`--fix-type suggestion ${filePath}`;

					const exit = await cli.execute(code);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when executing a file with a syntax error", () => {
				it(`should exit with error`, async () => {
					const filePath = getFixturePath(String.raw`syntax-error.js`);
					const exit = await cli.execute(
						String.raw`--no-ignore ${filePath}`,
					);

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
				const filePath = getFixturePath(String.raw`missing-semicolon.js`);
				const passingPath = getFixturePath(String.raw`passing.js`);

				await cli.execute(
					String.raw`--no-ignore --rule semi:2 ${filePath}`,
				);

				assert.isTrue(log.info.called, "Log should have been called.");

				log.info.resetHistory();

				await cli.execute(
					String.raw`--no-ignore --rule semi:2 ${passingPath}`,
				);
				assert.isTrue(log.info.notCalled);
			});
		});

		describe("when executing with version flag", () => {
			it(`should print out current version`, async () => {
				assert.strictEqual(await cli.execute(String.raw`-v`), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await cli.execute(String.raw`--env-info`), 0);
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
					assert.strictEqual(await cli.execute(String.raw`--env-info`), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await cli.execute(String.raw`-h`), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath(String.raw`shebang.js`);
				const exit = await cli.execute(
					String.raw`--no-config-lookup --no-ignore ${filePath}`,
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
						String.raw`configurations`,
						String.raw`semi-error.js`,
					);
					const filePath = getFixturePath(String.raw`formatters`);
					const code = String.raw`--no-ignore --config ${configPath} ${filePath}`;

					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath(String.raw`undef.js`);
					const exit = await cli.execute(
						String.raw`--global baz,bat --no-ignore --rule no-global-assign:2 ${filePath}`,
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath(String.raw`undef.js`);
					const exit = await cli.execute(
						String.raw`--global baz:false,bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath(String.raw`undef.js`);
					const exit = await cli.execute(
						String.raw`--global baz --global bat:true --no-ignore ${filePath}`,
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath(String.raw`single-quoted.js`);
					const code = String.raw`--no-ignore --rule 'quotes: [2, double]' ${filePath}`;
					const exitStatus = await cli.execute(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath(String.raw`single-quoted.js`);
					const cliArgs = String.raw`--no-ignore --quiet -f stylish --rule 'quotes: [2, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, String.raw`(1 error, 0 warnings)`);
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath(String.raw`single-quoted.js`);
					const cliArgs = String.raw`--no-ignore --quiet -f stylish --rule 'quotes: [1, double]' --rule 'no-undef: 1' ${filePath}`;

					await cli.execute(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath(String.raw`single-quoted.js`);
					const configPath = getFixturePath(
						String.raw`eslint.config-rule-throws.js`,
					);
					const cliArgs = String.raw`--quiet --config ${configPath}' ${filePath}`;

					const exit = await cli.execute(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath(String.raw`single-quoted.js`);
					const configPath = getFixturePath(
						String.raw`eslint.config-rule-throws.js`,
					);
					const cliArgs = String.raw`--quiet --max-warnings=1 --config ${configPath}' ${filePath}`;

					await stdAssert.rejects(async () => {
						await cli.execute(cliArgs);
					});
				});
			});

			describe("no-error-on-unmatched-pattern flag", () => {
				describe("when executing without no-error-on-unmatched-pattern flag", () => {
					it(`should throw an error on unmatched glob pattern`, async () => {
						let filePath = getFixturePath(String.raw`unmatched-patterns`);
						const globPattern = String.raw`unmatched*.js`;

						filePath = filePath.replace(/\\/gu, String.raw`/`);

						await stdAssert.rejects(
							async () => {
								await cli.execute(
									String.raw`"${filePath}/${globPattern}"`,
								);
							},
							new Error(
								String.raw`No files matching '${filePath}/${globPattern}' were found.`,
							),
						);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag", () => {
					it(`should not throw an error on unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(String.raw`unmatched-patterns`);
						const exit = await cli.execute(
							String.raw`--no-error-on-unmatched-pattern "${filePath}/unmatched*.js"`,
						);

						assert.strictEqual(exit, 0);
					});
				});

				describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
					it(`should not throw an error on multiple unmatched node glob syntax patterns`, async () => {
						const filePath = getFixturePath(
							String.raw`unmatched-patterns/js3`,
						);
						const exit = await cli.execute(
							String.raw`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
						const filePath = getFixturePath(String.raw`unmatched-patterns`);
						const exit = await cli.execute(
							String.raw`--no-ignore --no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/failing.js`,
						);

						assert.strictEqual(exit, 1);
					});
				});
			});

			describe("Parser Options", () => {
				describe("when given parser options", () => {
					it(`should exit with error if parser options are invalid`, async () => {
						const filePath = getFixturePath(String.raw`passing.js`);
						const exit = await cli.execute(
							String.raw`--no-ignore --parser-options test111 ${filePath}`,
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath(String.raw`passing.js`);
						const exit = await cli.execute(
							String.raw`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath(String.raw`passing-es7.js`);
						const exit = await cli.execute(
							String.raw`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`,
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath(String.raw`passing-es7.js`);
						const exit = await cli.execute(
							String.raw`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							String.raw`configurations`,
							String.raw`es6.js`,
						);
						const filePath = getFixturePath(String.raw`passing-es7.js`);
						const exit = await cli.execute(
							String.raw`--no-ignore --config ${configPath} --parser-options=ecmaVersion:7 ${filePath}`,
						);

						assert.strictEqual(exit, 0);
					});
				});
			});

			describe("when given the max-warnings flag", () => {
				let filePath, configFilePath;

				before(() => {
					filePath = getFixturePath(
						String.raw`max-warnings/six-warnings.js`,
					);
					configFilePath = getFixturePath(
						String.raw`max-warnings/eslint.config.js`,
					);
				});

				it(`should not change exit code if warning count under threshold`, async () => {
					const exitCode = await cli.execute(
						String.raw`--no-ignore --max-warnings 10 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
					const exitCode = await cli.execute(
						String.raw`--no-ignore --max-warnings 5 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 1);
					assert.ok(log.error.calledOnce);
					assert.include(
						log.error.getCall(0).args[0],
						String.raw`ESLint found too many warnings`,
					);
				});

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
					const exitCode = await cli.execute(
						String.raw`--no-ignore --quiet --max-warnings 5 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 1);
					assert.ok(log.error.calledOnce);
					assert.include(
						log.error.getCall(0).args[0],
						String.raw`ESLint found too many warnings`,
					);
					assert.ok(log.info.notCalled); // didn't print warnings
				});

				it(`should not change exit code if warning count equals threshold`, async () => {
					const exitCode = await cli.execute(
						String.raw`--no-ignore --max-warnings 6 ${filePath} -c ${configFilePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await cli.execute(
						String.raw`-c ${configFilePath} ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});
			});

			describe("when given the exit-on-fatal-error flag", () => {
				it(`should not change exit code if no fatal errors are reported`, async () => {
					const filePath = getFixturePath(
						String.raw`exit-on-fatal-error`,
						String.raw`no-fatal-error.js`,
					);
					const exitCode = await cli.execute(
						String.raw`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						String.raw`exit-on-fatal-error`,
						String.raw`no-fatal-error-rule-violation.js`,
					);
					const exitCode = await cli.execute(
						String.raw`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						String.raw`exit-on-fatal-error`,
						String.raw`fatal-error.js`,
					);
					const exitCode = await cli.execute(
						String.raw`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath(String.raw`exit-on-fatal-error`);
					const exitCode = await cli.execute(
						String.raw`--no-ignore --exit-on-fatal-error ${filePath}`,
					);

					assert.strictEqual(exitCode, 2);
				});
			});

			describe("Ignores", () => {
				describe("when given a directory with eslint excluded files in the directory", () => {
					it(`should throw an error and not process any files`, async () => {
						const options = String.raw`--config ${getFixturePath(String.raw`eslint.config-with-ignores.js`)}`;
						const filePath = getFixturePath(String.raw`cli`);
						const expectedMessage = String.raw`All files matched by '${filePath.replace(/\\/gu, String.raw`/`)}' are ignored.`;

						await stdAssert.rejects(async () => {
							await cli.execute(String.raw`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = String.raw`--config ${getFixturePath(String.raw`eslint.config-with-ignores.js`)}`;
						const filePath = getFixturePath(String.raw`passing.js`);
						const exit = await cli.execute(
							String.raw`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = String.raw`--config ${getFixturePath(String.raw`eslint.config-with-ignores.js`)}`;
						const filePath = getFixturePath(String.raw`passing.js`);
						const exit = await cli.execute(
							String.raw`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = String.raw`--config ${getFixturePath(String.raw`eslint.config-with-ignores.js`)}`;
						const filePath = getFixturePath(String.raw`passing.js`);
						const exit = await cli.execute(
							String.raw`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await cli.execute(String.raw`--pass-on-no-patterns`);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
						const options = String.raw`--config ${getFixturePath(String.raw`eslint.config-with-ignores.js`)}`;
						const filePath = getFixturePath(String.raw`passing.js`);
						const exit = await cli.execute(
							String.raw`${options} --no-warn-ignored --stdin --stdin-filename ${filePath}`,
							"foo",
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});

				describe("when given a pattern to ignore", () => {
					it(`should not process any files`, async () => {
						const ignoredFile = getFixturePath(
							String.raw`cli/syntax-error.js`,
						);
						const filePath = getFixturePath(String.raw`cli/passing.js`);
						const exit = await cli.execute(
							String.raw`--ignore-pattern cli/** ${ignoredFile} ${filePath}`,
						);

						// warnings about the ignored files
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should interpret pattern that contains a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								String.raw`cli/ignore-pattern-relative/subdir`,
							);

						/*
						 * The config file is in `cli/ignore-pattern-relative`, so this would fail
						 * if `subdir/**` ignore pattern is interpreted as relative to the config base path.
						 */
						const exit = await cli.execute(
							String.raw`**/*.js --ignore-pattern subdir/**`,
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									String.raw`**/*.js --ignore-pattern subsubdir/*.js`,
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it(`should interpret pattern that doesn't contain a slash as relative to cwd`, async () => {
						process.cwd = () =>
							getFixturePath(
								String.raw`cli/ignore-pattern-relative/subdir/subsubdir`,
							);

						await stdAssert.rejects(
							async () =>
								await cli.execute(
									String.raw`**/*.js --ignore-pattern *.js`,
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath(
							String.raw`cli/syntax-error.js`,
						);
						const exit = await cli.execute(
							String.raw`--ignore-pattern cli/ ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath(
							String.raw`cli/syntax-error.js`,
						);
						const exit = await cli.execute(
							String.raw`--ignore-pattern cli ${filePath}`,
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});
				});
			});
		});

		describe("when given a parser name", () => {
			it(`should exit with a fatal error if parser is invalid`, async () => {
				const filePath = getFixturePath(String.raw`passing.js`);

				await stdAssert.rejects(
					async () =>
						await cli.execute(
							String.raw`--no-ignore --parser test111 ${filePath}`,
						),
					"Cannot find module 'test111'",
				);
			});

			it(`should exit with no error if parser is valid`, async () => {
				const filePath = getFixturePath(String.raw`passing.js`);
				const exit = await cli.execute(
					String.raw`--no-config-lookup --no-ignore --parser espree ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("when supplied with report output file path", () => {
			afterEach(() => {
				sh.rm("-rf", "tests/output");
			});

			it(`should write the file and create dirs if they don't exist`, async () => {
				const filePath = getFixturePath(String.raw`single-quoted.js`);
				const code = String.raw`--no-config-lookup --rule 'quotes: [1, double]' --o tests/output/eslint-output.txt ${filePath}`;

				await cli.execute(code);

				assert.include(
					fs.readFileSync("tests/output/eslint-output.txt", "utf8"),
					filePath,
				);
				assert.isTrue(log.info.notCalled);
			});

			// https://github.com/eslint/eslint/issues/17660
			it(`should write the file and create dirs if they don't exist even when output is empty`, async () => {
				const filePath = getFixturePath(String.raw`single-quoted.js`);
				const code = String.raw`--no-config-lookup --rule 'quotes: [1, single]' --o tests/output/eslint-output.txt ${filePath}`;

				// TODO: fix this test to: await cli.execute(code);
				await cli.execute(code, "var a = 'b'");

				assert.isTrue(fs.existsSync("tests/output/eslint-output.txt"));
				assert.strictEqual(
					fs.readFileSync("tests/output/eslint-output.txt", "utf8"),
					"",
				);
				assert.isTrue(log.info.notCalled);
			});

			it(`should return an error if the path is a directory`, async () => {
				const filePath = getFixturePath(String.raw`single-quoted.js`);
				const code = String.raw`--no-config-lookup --rule 'quotes: [1, double]' --o tests/output ${filePath}`;

				fs.mkdirSync("tests/output");

				const exit = await cli.execute(code);

				assert.strictEqual(exit, 2);
				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
			});

			it(`should return an error if the path could not be written to`, async () => {
				const filePath = getFixturePath(String.raw`single-quoted.js`);
				const code = String.raw`--no-config-lookup --rule 'quotes: [1, double]' --o tests/output/eslint-output.txt ${filePath}`;

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

			it(`should pass allowInlineConfig:false to ESLint when --no-inline-config is used`, async () => {
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
						filePath: String.raw`./foo.js`,
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
				fakeESLint.outputFixes = sinon.mock().withExactArgs([
					{
						filePath: String.raw`./foo.js`,
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

				localCLI = proxyquire("../../lib/cli", {
					"./eslint/eslint": { ESLint: fakeESLint },
					"./shared/logging": log,
				});

				await localCLI.execute(String.raw`--no-inline-config .`);
			});

			it(`should not error and allowInlineConfig should be true by default`, async () => {
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

				const exitCode = await localCLI.execute(String.raw`.`);

				assert.strictEqual(exitCode, 0);
			});
		});

		describe("when passed --fix", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it(`should pass fix:true to ESLint when executing on files`, async () => {
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

				const exitCode = await localCLI.execute(String.raw`--fix .`);

				assert.strictEqual(exitCode, 0);
			});

			it(`should rewrite files when in fix mode`, async () => {
				const report = [
					{
						filePath: String.raw`./foo.js`,
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

				const exitCode = await localCLI.execute(String.raw`--fix .`);

				assert.strictEqual(exitCode, 1);
			});

			it(`should provide fix predicate and rewrite files when in fix mode and quiet mode`, async () => {
				const report = [
					{
						filePath: String.raw`./foo.js`,
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

				const exitCode = await localCLI.execute(
					String.raw`--fix --quiet .`,
				);

				assert.strictEqual(exitCode, 0);
			});

			it(`should not call ESLint and return 2 when executing on text`, async () => {
				// create a fake ESLint class to test with
				const fakeESLint = sinon.mock().never();

				localCLI = proxyquire("../../lib/cli", {
					"./eslint/eslint": { ESLint: fakeESLint },
					"./shared/logging": log,
				});

				const exitCode = await localCLI.execute(
					String.raw`--fix .`,
					"foo = bar;",
				);

				assert.strictEqual(exitCode, 2);
			});
		});

		describe("when passed --fix-dry-run", () => {
			let localCLI;

			afterEach(() => {
				sinon.verifyAndRestore();
			});

			it(`should pass fix:true to ESLint when executing on files`, async () => {
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

				const exitCode = await localCLI.execute(String.raw`--fix-dry-run .`);

				assert.strictEqual(exitCode, 0);
			});

			it(`should pass fixTypes to ESLint when --fix-type is passed`, async () => {
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

				const exitCode = await localCLI.execute(
					String.raw`--fix-dry-run --fix-type suggestion .`,
				);

				assert.strictEqual(exitCode, 0);
			});

			it(`should not rewrite files when in fix-dry-run mode`, async () => {
				const report = [
					{
						filePath: String.raw`./foo.js`,
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

				const exitCode = await localCLI.execute(String.raw`--fix-dry-run .`);

				assert.strictEqual(exitCode, 1);
			});

			it(`should provide fix predicate when in fix-dry-run mode and quiet mode`, async () => {
				const report = [
					{
						filePath: String.raw`./foo.js`,
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

				const exitCode = await localCLI.execute(
					String.raw`--fix-dry-run --quiet .`,
				);

				assert.strictEqual(exitCode, 0);
			});

			it(`should allow executing on text`, async () => {
				const report = [
					{
						filePath: String.raw`./foo.js`,
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

				const exitCode = await localCLI.execute(
					String.raw`--fix-dry-run .`,
					"foo = bar;",
				);

				assert.strictEqual(exitCode, 1);
			});

			it(`should not call ESLint and return 2 when used with --fix`, async () => {
				// create a fake ESLint class to test with
				const fakeESLint = sinon.mock().never();

				localCLI = proxyquire("../../lib/cli", {
					"./eslint/eslint": { ESLint: fakeESLint },
					"./shared/logging": log,
				});

				const exitCode = await localCLI.execute(
					String.raw`--fix --fix-dry-run .`,
					"foo = bar;",
				);

				assert.strictEqual(exitCode, 2);
			});
		});

		describe("when passing --print-config", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				process.cwd = () => getFixturePath();
			});

			afterEach(() => {
				process.cwd = originalCwd;
			});

			it(`should print out the configuration`, async () => {
				const filePath = getFixturePath(String.raw`xxx.js`);

				const exitCode = await cli.execute(
					String.raw`--print-config ${filePath}`,
				);

				assert.isTrue(log.info.calledOnce);
				assert.strictEqual(exitCode, 0);
			});

			it(`should error if any positional file arguments are passed`, async () => {
				const filePath1 = getFixturePath(
					String.raw`files`,
					String.raw`bar.js`,
				);
				const filePath2 = getFixturePath(
					String.raw`files`,
					String.raw`foo.js`,
				);

				const exitCode = await cli.execute(
					String.raw`--print-config ${filePath1} ${filePath2}`,
				);

				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
				assert.strictEqual(exitCode, 2);
			});

			it(`should error out when executing on text`, async () => {
				const exitCode = await cli.execute(
					String.raw`--print-config=myFile.js`,
					"foo = bar;",
				);

				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
				assert.strictEqual(exitCode, 2);
			});
		});

		describe("when passing --report-unused-disable-directives", () => {
			it("errors when --report-unused-disable-directives", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives --rule "'no-console': 'error'"`,
					String.raw`foo(); // eslint-disable-line no-console`,
				);

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
						String.raw`Unused eslint-disable directive (no problems were reported from 'no-console')`,
					),
					"has correct message about unused directives",
				);
				assert.ok(
					log.info.firstCall.args[0].includes(
						String.raw`1 error and 0 warning`,
					),
					"has correct error and warning count",
				);
				assert.strictEqual(exitCode, 1, "exit code should be 1");
			});

			it("errors when --report-unused-disable-directives-severity error", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives-severity error --rule "'no-console': 'error'"`,
					String.raw`foo(); // eslint-disable-line no-console`,
				);

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
						String.raw`Unused eslint-disable directive (no problems were reported from 'no-console')`,
					),
					"has correct message about unused directives",
				);
				assert.ok(
					log.info.firstCall.args[0].includes(
						String.raw`1 error and 0 warning`,
					),
					"has correct error and warning count",
				);
				assert.strictEqual(exitCode, 1, "exit code should be 1");
			});

			it("errors when --report-unused-disable-directives-severity 2", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives-severity 2 --rule "'no-console': 'error'"`,
					String.raw`foo(); // eslint-disable-line no-console`,
				);

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
						String.raw`Unused eslint-disable directive (no problems were reported from 'no-console')`,
					),
					"has correct message about unused directives",
				);
				assert.ok(
					log.info.firstCall.args[0].includes(
						String.raw`1 error and 0 warning`,
					),
					"has correct error and warning count",
				);
				assert.strictEqual(exitCode, 1, "exit code should be 1");
			});

			it("warns when --report-unused-disable-directives-severity warn", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives-severity warn --rule "'no-console': 'error'"`,
					String.raw`foo(); // eslint-disable-line no-console`,
				);

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
						String.raw`Unused eslint-disable directive (no problems were reported from 'no-console')`,
					),
					"has correct message about unused directives",
				);
				assert.ok(
					log.info.firstCall.args[0].includes(
						String.raw`0 errors and 1 warning`,
					),
					"has correct error and warning count",
				);
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});

			it("warns when --report-unused-disable-directives-severity 1", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives-severity 1 --rule "'no-console': 'error'"`,
					String.raw`foo(); // eslint-disable-line no-console`,
				);

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
						String.raw`Unused eslint-disable directive (no problems were reported from 'no-console')`,
					),
					"has correct message about unused directives",
				);
				assert.ok(
					log.info.firstCall.args[0].includes(
						String.raw`0 errors and 1 warning`,
					),
					"has correct error and warning count",
				);
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});

			it("does not report when --report-unused-disable-directives-severity off", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives-severity off --rule "'no-console': 'error'"`,
					String.raw`foo(); // eslint-disable-line no-console`,
				);

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
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});

			it("does not report when --report-unused-disable-directives-severity 0", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives-severity 0 --rule "'no-console': 'error'"`,
					String.raw`foo(); // eslint-disable-line no-console`,
				);

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
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});

			it("fails when passing invalid string for --report-unused-disable-directives", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives foo`,
				);

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
						String.raw`Option report-unused-disable-directives: 'foo' not one of off, warn, error, 0, 1, or 2.`,
					],
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("fails when passing both --report-unused-disable-directives and --report-unused-disable-directives-severity", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-disable-directives --report-unused-disable-directives-severity warn`,
				);

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
						String.raw`The --report-unused-disable-directives option and the --report-unused-disable-directives-severity option cannot be used together.`,
					],
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("warns by default", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --rule "'no-console': 'error'"`,
					String.raw`foo(); // eslint-disable-line no-console`,
				);

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
						String.raw`Unused eslint-disable directive (no problems were reported from 'no-console')`,
					),
					"has correct message about unused directives",
				);
				assert.ok(
					log.info.firstCall.args[0].includes(
						String.raw`0 errors and 1 warning`,
					),
					"has correct error and warning count",
				);
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});
		});

		describe("when given a config file", () => {
			it("should load the specified config file", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);

				await cli.execute(
					String.raw`--config ${configPath} ${filePath}`,
				);
			});
		});

		describe("`--plugin` option", () => {
			let originalCwd;

			beforeEach(() => {
				originalCwd = process.cwd;
				process.chdir(getFixturePath(String.raw`plugins`));
			});

			afterEach(() => {
				process.chdir(originalCwd);
				originalCwd = void 0;
			});

			it("should load a plugin from a CommonJS package", async () => {
				const code =
					String.raw`--plugin hello-cjs --rule 'hello-cjs/hello: error' ../files/*.js`;

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, String.raw`Hello CommonJS!`);
			});

			it("should load a plugin from an ESM package", async () => {
				const code =
					String.raw`--plugin hello-esm --rule 'hello-esm/hello: error' ../files/*.js`;

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, String.raw`Hello ESM!`);
			});

			it("should load multiple plugins", async () => {
				const code =
					String.raw`--plugin 'hello-cjs, hello-esm' --rule 'hello-cjs/hello: warn, hello-esm/hello: error' ../files/*.js`;

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, String.raw`Hello CommonJS!`);
				assert.include(log.info.firstCall.firstArg, String.raw`Hello ESM!`);
			});

			it("should resolve plugins specified with 'eslint-plugin-'", async () => {
				const code =
					String.raw`--plugin 'eslint-plugin-schema-array, @scope/eslint-plugin-example' --rule 'schema-array/rule1: warn, @scope/example/test: warn' ../passing.js`;

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 0);
			});

			it("should resolve plugins in the parent directory's node_module subdirectory", async () => {
				process.chdir(String.raw`subdir`);
				const code = String.raw`--plugin 'example, @scope/example' file.js`;

				const exitCode = await cli.execute(code);

				assert.strictEqual(exitCode, 0);
			});

			it("should fail if a plugin is not found", async () => {
				const code = String.raw`--plugin 'example, no-such-plugin' ../passing.js`;

				await stdAssert.rejects(cli.execute(code), ({ message }) => {
					assert(
						message.startsWith(
							String.raw`Cannot find module 'eslint-plugin-no-such-plugin'\n`,
						),
						`Unexpected error message:\n${message}`,
					);
					return true;
				});
			});

			it("should fail if a plugin throws an error while loading", async () => {
				const code = String.raw`--plugin 'example, throws-on-load' ../passing.js`;

				await stdAssert.rejects(cli.execute(code), {
					message: String.raw`error thrown while loading this module`,
				});
			});

			it("should fail to load a plugin from a package without a default export", async () => {
				const code =
					String.raw`--plugin 'example, no-default-export' ../passing.js`;

				await stdAssert.rejects(cli.execute(code), {
					message:
						String.raw`'"eslint-plugin-no-default-export" cannot be used with the --plugin option because its default module does not provide a default export`,
				});
			});
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

			it("should throw an error when an inactive flag whose feature has been abandoned is used", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--flag test_only_abandoned --config ${configPath} ${filePath}`;

				await stdAssert.rejects(
					async () => {
						await cli.execute(input);
					},
					/The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u,
				);
			});

			it("should throw an error when an inactive flag whose feature has been abandoned is used in an environment variable", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);

				process.env.ESLINT_FLAGS = "test_only_abandoned";
				const input = String.raw`--config ${configPath} ${filePath}`;

				await stdAssert.rejects(
					async () => {
						await cli.execute(input);
					},
					/The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u,
				);
			});

			it("should error out when an unknown flag is used", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--flag test_only_oldx --config ${configPath} ${filePath}`;

				await stdAssert.rejects(
					async () => {
						await cli.execute(input);
					},
					/Unknown flag 'test_only_oldx'\./u,
				);
			});

			it("should error out when an unknown flag is used in an environment variable", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--config ${configPath} ${filePath}`;

				process.env.ESLINT_FLAGS = "test_only_oldx";

				await stdAssert.rejects(
					async () => {
						await cli.execute(input);
					},
					/Unknown flag 'test_only_oldx'\./u,
				);
			});

			it("should emit a warning and not error out when an inactive flag that has been replaced by another flag is used", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--flag test_only_replaced --config ${configPath} ${filePath}`;
				const exitCode = await cli.execute(input);

				assert.strictEqual(
					processStub.callCount,
					1,
					"calls `process.emitWarning()` for flags once",
				);
				assert.deepStrictEqual(processStub.getCall(0).args, [
					String.raw`The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.`,
					String.raw`ESLintInactiveFlag_test_only_replaced`,
				]);
				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should emit a warning and not error out when an inactive flag that has been replaced by another flag is used in an environment variable", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--config ${configPath} ${filePath}`;

				process.env.ESLINT_FLAGS = "test_only_replaced";

				const exitCode = await cli.execute(input);

				assert.strictEqual(
					processStub.callCount,
					1,
					"calls `process.emitWarning()` for flags once",
				);
				assert.deepStrictEqual(processStub.getCall(0).args, [
					String.raw`The flag 'test_only_replaced' is inactive: This flag has been renamed 'test_only' to reflect its stabilization. Please use 'test_only' instead.`,
					String.raw`ESLintInactiveFlag_test_only_replaced`,
				]);
				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should emit a warning and not error out when an inactive flag whose feature is enabled by default is used", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--flag test_only_enabled_by_default --config ${configPath} ${filePath}`;
				const exitCode = await cli.execute(input);

				assert.strictEqual(
					processStub.callCount,
					1,
					"calls `process.emitWarning()` for flags once",
				);
				assert.deepStrictEqual(processStub.getCall(0).args, [
					String.raw`The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.`,
					String.raw`ESLintInactiveFlag_test_only_enabled_by_default`,
				]);
				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should emit a warning and not error out when an inactive flag whose feature is enabled by default is used in an environment variable", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--config ${configPath} ${filePath}`;

				process.env.ESLINT_FLAGS = "test_only_enabled_by_default";

				const exitCode = await cli.execute(input);
				assert.strictEqual(
					processStub.callCount,
					1,
					"calls `process.emitWarning()` for flags once",
				);
				assert.deepStrictEqual(processStub.getCall(0).args, [
					String.raw`The flag 'test_only_enabled_by_default' is inactive: This feature is now enabled by default.`,
					String.raw`ESLintInactiveFlag_test_only_enabled_by_default`,
				]);
				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should not error when a valid flag is used", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--flag test_only --config ${configPath} ${filePath}`;
				const exitCode = await cli.execute(input);

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should not error when a valid flag is used in an environment variable", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--config ${configPath} ${filePath}`;

				process.env.ESLINT_FLAGS = "test_only";

				const exitCode = await cli.execute(input);

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should error when a valid flag is used in an environment variable with an abandoned flag", async () => {
				const configPath = getFixturePath(String.raw`eslint.config.js`);
				const filePath = getFixturePath(String.raw`passing.js`);
				const input = String.raw`--config ${configPath} ${filePath}`;

				process.env.ESLINT_FLAGS = "test_only,test_only_abandoned";

				await stdAssert.rejects(
					async () => {
						await cli.execute(input);
					},
					/The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u,
				);
			});
		});

		describe("--report-unused-inline-configs option", () => {
			it("does not report when --report-unused-inline-configs 0", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-inline-configs 0 --rule \"'no-console': 'error'\"`,
					String.raw`/* eslint no-console: 'error' */`,
				);

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
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});

			[
				[1, 0, String.raw`0 errors, 1 warning`],
				["warn", 0, String.raw`0 errors, 1 warning`],
				[2, 1, String.raw`1 error, 0 warnings`],
				["error", 1, String.raw`1 error, 0 warnings`],
			].forEach(([setting, status, descriptor]) => {
				it(`reports when --report-unused-inline-configs ${setting}`, async () => {
					const exitCode = await cli.execute(
						String.raw`--no-config-lookup --report-unused-inline-configs ${setting} --rule "'no-console': 'error'"`,
						String.raw`/* eslint no-console: 'error' */`,
					);

					assert.strictEqual(
						log.info.callCount,
						1,
						"log.info is called once",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(
							String.raw`Unused inline config ('no-console' is already configured to 'error')`,
						),
						"has correct message about unused inline config",
					);
					assert.ok(
						log.info.firstCall.args[0].includes(descriptor),
						"has correct error and warning count",
					);
					assert.strictEqual(
						exitCode,
						status,
						`exit code should be ${exitCode}`,
					);
				});
			});

			it("fails when passing invalid string for --report-unused-inline-configs", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup --report-unused-inline-configs foo`,
				);

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
						String.raw`Option report-unused-inline-configs: 'foo' not one of off, warn, error, 0, 1, or 2.`,
					],
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});
		});

		describe("--ext option", () => {
			let originalCwd;

			beforeEach(() => {
				originalCwd = process.cwd;
				process.chdir(getFixturePath(String.raw`file-extensions`));
			});

			afterEach(() => {
				process.chdir(originalCwd);
				originalCwd = void 0;
			});

			it("when not provided, without config file only default extensions should be linted", async () => {
				const exitCode = await cli.execute(
					String.raw`--no-config-lookup -f json .`,
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");

				const results = JSON.parse(log.info.args[0][0]);

				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					[
						String.raw`a.js`,
						String.raw`b.mjs`,
						String.raw`c.cjs`,
						String.raw`eslint.config.js`,
					].map(filename => path.resolve(filename)),
				);
			});

			it("when not provided, only default extensions and extensions from the config file should be linted", async () => {
				const exitCode = await cli.execute(String.raw`-f json .`);

				assert.strictEqual(exitCode, 0, "exit code should be 0");

				const results = JSON.parse(log.info.args[0][0]);

				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					[
						String.raw`a.js`,
						String.raw`b.mjs`,
						String.raw`c.cjs`,
						String.raw`d.jsx`,
						String.raw`eslint.config.js`,
					].map(filename => path.resolve(filename)),
				);
			});

			it("should include an additional extension when specified with dot", async () => {
				const exitCode = await cli.execute(
					String.raw`-f json --ext .ts .`,
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");

				const results = JSON.parse(log.info.args[0][0]);

				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					[
						String.raw`a.js`,
						String.raw`b.mjs`,
						String.raw`c.cjs`,
						String.raw`d.jsx`,
						String.raw`eslint.config.js`,
						String.raw`f.ts`,
					].map(filename => path.resolve(filename)),
				);
			});

			it("should include an additional extension when specified without dot", async () => {
				const exitCode = await cli.execute(
					String.raw`-f json --ext ts .`,
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");

				const results = JSON.parse(log.info.args[0][0]);

				// should not include "foots"
				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					[
						String.raw`a.js`,
						String.raw`b.mjs`,
						String.raw`c.cjs`,
						String.raw`d.jsx`,
						String.raw`eslint.config.js`,
						String.raw`f.ts`,
					].map(filename => path.resolve(filename)),
				);
			});

			it("should include multiple additional extensions when specified by repeating the option", async () => {
				const exitCode = await cli.execute(
					String.raw`-f json --ext .ts --ext tsx .`,
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");

				const results = JSON.parse(log.info.args[0][0]);

				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					[
						String.raw`a.js`,
						String.raw`b.mjs`,
						String.raw`c.cjs`,
						String.raw`d.jsx`,
						String.raw`eslint.config.js`,
						String.raw`f.ts`,
						String.raw`g.tsx`,
					].map(filename => path.resolve(filename)),
				);
			});

			it("should include multiple additional extensions when specified with comma-delimited list", async () => {
				const exitCode = await cli.execute(
					String.raw`-f json --ext .ts,.tsx .`,
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");

				const results = JSON.parse(log.info.args[0][0]);

				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					[
						String.raw`a.js`,
						String.raw`b.mjs`,
						String.raw`c.cjs`,
						String.raw`d.jsx`,
						String.raw`eslint.config.js`,
						String.raw`f.ts`,
						String.raw`g.tsx`,
					].map(filename => path.resolve(filename)),
				);
			});

			it('should fail when passing --ext ""', async () => {
				// When passing "" on command line, its corresponding item in process.argv[] is an empty string
				const exitCode = await cli.execute([
					"argv0",
					"argv1",
					String.raw`--ext`,
					"",
				]);

				assert.strictEqual(exitCode, 2, "exit code should be 2");
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
					String.raw`The --ext option value cannot be empty.`,
				);
			});

			it("should fail when passing --ext ,ts", async () => {
				const exitCode = await cli.execute(String.raw`--ext ,ts`);

				assert.strictEqual(exitCode, 2, "exit code should be 2");
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
					String.raw`The --ext option arguments cannot be empty strings. Found an empty string at index 0.`,
				);
			});

			it("should fail when passing --ext ts,,tsx", async () => {
				const exitCode = await cli.execute(String.raw`--ext ts,,tsx`);

				assert.strictEqual(exitCode, 2, "exit code should be 2");
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
					String.raw`The --ext option arguments cannot be empty strings. Found an empty string at index 1.`,
				);
			});
		});

		describe("config lookup from file", () => {
			it("should throw an error when text is passed and no config file is found", async () => {
				await stdAssert.rejects(
					() =>
						cli.execute(
							String.raw`--stdin --stdin-filename /foo.js"`,
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
						String.raw`--concurrency ${value} --pass-on-no-patterns`,
					);

					assert.strictEqual(exitCode, 0, "exit code should be 0");
				});
			});

			["foo", "0", "-1", "1.5", "Infinity"].forEach(value => {
				it(`should not accept the value ${value}`, async () => {
					const exitCode = await cli.execute(
						String.raw`--concurrency=${value}`,
					);

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
						String.raw`Option concurrency: '${value}' is not a positive integer, 'auto' or 'off'.`,
						"has the right text to log.error",
					);
					assert.strictEqual(exitCode, 2, "exit code should be 2");
				});
			});

			it("should not accept an empty value", async () => {
				const exitCode = await cli.execute(String.raw`--concurrency=""`);

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
					String.raw`No value for 'concurrency' specified.`,
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("should encode '?' and '#' in an options module", async () => {
				const exitCode = await cli.execute(
					String.raw`--concurrency=2 --no-config-lookup --no-ignore --rule 'no-fallthrough: [error, { commentPattern: \"#?\" }]' tests/fixtures/passing.js`,
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});
		});
	});
});
```
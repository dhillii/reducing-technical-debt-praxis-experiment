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
		 * Creates a test fixture directory and copies fixtures.
		 * @returns {Promise<void>}
		 * @private
		 */
		async function setupFixtureDir() {
			fixtureDir = `${os.tmpdir()}/eslint/fixtures`;
			sh.mkdir("-p", fixtureDir);
			sh.cp("-r", "./tests/fixtures/.", fixtureDir);
		}

		/**
		 * Cleans up the fixture directory.
		 * @returns {Promise<void>}
		 * @private
		 */
		async function cleanupFixtureDir() {
			sh.rm("-r", fixtureDir);
		}

		/**
		 * Resets sinon spies and logs.
		 * @returns {void}
		 * @private
		 */
		function resetTestState() {
			sinon.restore();
			log.info.resetHistory();
			log.error.resetHistory();
			log.warn.resetHistory();
		}

		// copy into clean area so as not to get "infected" by this project's config files
		before(async () => {
			/*
			 * GitHub Actions Windows and macOS runners occasionally exhibit
			 * extremely slow filesystem operations, during which copying fixtures
			 * exceeds the default test timeout, so raise it just for this hook.
			 * Mocha uses `this` to set timeouts on an individual hook level.
			 */
			this.timeout(60 * 1000); // eslint-disable-line no-invalid-this -- Mocha API
			await setupFixtureDir();
		});

		after(async () => {
			await cleanupFixtureDir();
		});

		afterEach(() => {
			resetTestState();
		});

		/**
		 * Executes a CLI command and returns the exit code.
		 * @param {string} command The CLI command to execute.
		 * @param {string} [text] Optional stdin text.
		 * @returns {Promise<number>} The exit code.
		 * @private
		 */
		async function executeCommand(command, text = "") {
			return cli.execute(command, text);
		}

		describe("execute()", () => {
			it(`should return error when text with incorrect quotes is passed as argument`, async () => {
				const configFile = getFixturePath(
					"configurations",
					"quotes-error.js",
				);
				const result = await executeCommand(
					`--no-config-lookup -c ${configFile} --stdin --stdin-filename foo.js`,
					"var foo = 'bar';",
				);

				assert.strictEqual(result, 1);
			});

			it(`should not print debug info when passed the empty string as text`, async () => {
				const result = await executeCommand(
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
				const result = await executeCommand(
					`--blah --another ${filePath}`,
				);

				assert.strictEqual(result, 2);
			});
		});

		/**
		 * Sets up the current working directory to the fixture directory.
		 * @returns {void}
		 * @private
		 */
		function setupCwd() {
			const originalCwd = process.cwd;
			process.cwd = () => getFixturePath();
		}

		/**
		 * Restores the original current working directory.
		 * @param {Function} originalCwd The original cwd function.
		 * @returns {void}
		 * @private
		 */
		function restoreCwd(originalCwd) {
			process.cwd = originalCwd;
		}

		describe("when given a config with rules with options and severity level set to error", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				setupCwd();
			});

			afterEach(() => {
				restoreCwd(originalCwd);
			});

			it(`should exit with an error status (1)`, async () => {
				const configPath = getFixturePath(
					"configurations",
					"quotes-error.js",
				);
				const filePath = getFixturePath("single-quoted.js");
				const code = `--no-ignore --config ${configPath} ${filePath}`;

				const exitStatus = await executeCommand(code);

				assert.strictEqual(exitStatus, 1);
			});
		});

		describe("when there is a local config file", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				setupCwd();
			});

			afterEach(() => {
				restoreCwd(originalCwd);
			});

			it(`should load the local config file`, async () => {
				await executeCommand("cli/passing.js --no-ignore");
			});

			it(`should load the local config file with glob pattern`, async () => {
				await executeCommand("cli/pass*.js --no-ignore");
			});

			// only works on Windows
			if (os.platform() === "win32") {
				it(`should load the local config file with Windows slashes glob pattern`, async () => {
					await executeCommand(String.raw`cli\pass*.js --no-ignore`);
				});
			}
		});

		/**
		 * Creates a formatter test helper.
		 * @param {string} formatterName The formatter name or path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createFormatterCommand(formatterName, filePath) {
			return `--no-config-lookup -f ${formatterName} ${filePath}`;
		}

		/**
		 * Creates a command with color option.
		 * @param {string} colorOption The color option flag.
		 * @param {string} formatterName The formatter name.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createColorCommand(colorOption, formatterName, filePath) {
			return `${colorOption} -f ${formatterName} ${filePath}`;
		}

		/**
		 * Creates a command with max-warnings option.
		 * @param {string} maxWarnings The max warnings value.
		 * @param {string} rule The rule configuration.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createMaxWarningsCommand(maxWarnings, rule, filePath) {
			return `--no-ignore -f json-with-metadata --max-warnings ${maxWarnings} --rule ${rule} --no-config-lookup`;
		}

		/**
		 * Creates a command with ignore pattern.
		 * @param {string} ignorePattern The ignore pattern.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createIgnorePatternCommand(ignorePattern, filePath) {
			return `--ignore-pattern ${ignorePattern} ${filePath}`;
		}

		describe("Formatters", () => {
			describe("when given a valid built-in formatter name", () => {
				it(`should execute without any errors`, async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await executeCommand(
						createFormatterCommand("json", filePath),
					);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given a valid built-in formatter name that uses rules meta.", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					setupCwd();
				});

				afterEach(() => {
					restoreCwd(originalCwd);
				});

				it(`should execute without any errors`, async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await executeCommand(
						createFormatterCommand("json-with-metadata", filePath),
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
					const exit = await executeCommand(
						createColorCommand("--color", "json-with-metadata", filePath),
					);

					assert.strictEqual(exit, 1);

					const { metadata } = JSON.parse(log.info.args[0][0]);

					assert.strictEqual(metadata.color, true);
				});

				it("should pass `color: false` to the formatter metadata when `--no-color` is set", async () => {
					const filePath = getFixturePath("syntax-error.js");
					const exit = await executeCommand(
						createColorCommand("--no-color", "json-with-metadata", filePath),
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
					const exit = await executeCommand(
						createFormatterCommand(formatterPath, filePath),
					);

					assert.strictEqual(exit, 1);
					assert.notProperty(log.info.getCall(0).args[0], "color");
				});
			});

			describe("when the `--max-warnings` option is passed", () => {
				describe("and there are too many warnings", () => {
					it("should provide `maxWarningsExceeded` metadata to the formatter", async () => {
						const exit = await executeCommand(
							createMaxWarningsCommand(
								"1",
								"'quotes: warn'",
								"tests/fixtures/syntax-error.js",
							),
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
						const exit = await executeCommand(
							createMaxWarningsCommand(
								"1",
								"'quotes: warn'",
								"tests/fixtures/syntax-error.js",
							),
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
					setupCwd();
				});

				afterEach(() => {
					restoreCwd(originalCwd);
				});

				it(`should execute with error:`, async () => {
					const filePath = getFixturePath("passing.js");
					const exit = await executeCommand(
						createFormatterCommand("fakeformatter", filePath),
					);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given a valid formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					setupCwd();
				});

				afterEach(() => {
					restoreCwd(originalCwd);
				});

				it(`should execute without any errors`, async () => {
					const formatterPath = getFixturePath(
						"formatters",
						"simple.js",
					);
					const filePath = getFixturePath("passing.js");
					const exit = await executeCommand(
						createFormatterCommand(formatterPath, filePath),
					);

					assert.strictEqual(exit, 0);
				});
			});

			describe("when given an invalid formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					setupCwd();
				});

				afterEach(() => {
					restoreCwd(originalCwd);
				});

				it(`should execute with error`, async () => {
					const formatterPath = getFixturePath(
						"formatters",
						"file-does-not-exist.js",
					);
					const filePath = getFixturePath("passing.js");
					const exit = await executeCommand(
						createFormatterCommand(formatterPath, filePath),
					);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when given an async formatter path", () => {
				const originalCwd = process.cwd;

				beforeEach(() => {
					setupCwd();
				});

				afterEach(() => {
					restoreCwd(originalCwd);
				});

				it(`should execute without any errors`, async () => {
					const formatterPath = getFixturePath(
						"formatters",
						"async.js",
					);
					const filePath = getFixturePath("passing.js");
					const exit = await executeCommand(
						createFormatterCommand(formatterPath, filePath),
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
				setupCwd();
			});

			afterEach(() => {
				restoreCwd(originalCwd);
			});

			describe("when executing a file with a lint error", () => {
				it(`should exit with error`, async () => {
					const filePath = getFixturePath("undef.js");
					const code = `--no-ignore --rule no-undef:2 ${filePath}`;

					const exit = await executeCommand(code);

					assert.strictEqual(exit, 1);
				});
			});

			describe("when using --fix-type without --fix or --fix-dry-run", () => {
				it(`should exit with error`, async () => {
					const filePath = getFixturePath("passing.js");
					const code = `--fix-type suggestion ${filePath}`;

					const exit = await executeCommand(code);

					assert.strictEqual(exit, 2);
				});
			});

			describe("when executing a file with a syntax error", () => {
				it(`should exit with error`, async () => {
					const filePath = getFixturePath("syntax-error.js");
					const exit = await executeCommand(`--no-ignore ${filePath}`);

					assert.strictEqual(exit, 1);
				});
			});
		});

		describe("when calling execute more than once", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				setupCwd();
			});

			afterEach(() => {
				restoreCwd(originalCwd);
			});

			it(`should not print the results from previous execution`, async () => {
				const filePath = getFixturePath("missing-semicolon.js");
				const passingPath = getFixturePath("passing.js");

				await executeCommand(`--no-ignore --rule semi:2 ${filePath}`);

				assert.isTrue(log.info.called, "Log should have been called.");

				log.info.resetHistory();

				await executeCommand(`--no-ignore --rule semi:2 ${passingPath}`);
				assert.isTrue(log.info.notCalled);
			});
		});

		describe("when executing with version flag", () => {
			it(`should print out current version`, async () => {
				assert.strictEqual(await executeCommand("-v"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing with env-info flag", () => {
			it(`should print out environment information`, async () => {
				assert.strictEqual(await executeCommand("--env-info"), 0);
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
					assert.strictEqual(await executeCommand("--env-info"), 2);
					assert.strictEqual(log.error.callCount, 1);
				});
			});
		});

		describe("when executing with help flag", () => {
			it(`should print out help`, async () => {
				assert.strictEqual(await executeCommand("-h"), 0);
				assert.strictEqual(log.info.callCount, 1);
			});
		});

		describe("when executing a file with a shebang", () => {
			it(`should execute without error`, async () => {
				const filePath = getFixturePath("shebang.js");
				const exit = await executeCommand(
					`--no-config-lookup --no-ignore ${filePath}`,
				);

				assert.strictEqual(exit, 0);
			});
		});

		/**
		 * Creates a command with config file and directory.
		 * @param {string} configPath The config file path.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createConfigDirectoryCommand(configPath, filePath) {
			return `--no-ignore --config ${configPath} ${filePath}`;
		}

		/**
		 * Creates a command with global flag.
		 * @param {string} globalVars The global variables.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createGlobalCommand(globalVars, filePath) {
			return `--global ${globalVars} --no-ignore ${filePath}`;
		}

		/**
		 * Creates a command with rule flag.
		 * @param {string} rule The rule configuration.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createRuleCommand(rule, filePath) {
			return `--no-ignore --rule ${rule} ${filePath}`;
		}

		/**
		 * Creates a command with quiet option.
		 * @param {string} filePath The file path.
		 * @param {string} rule The rule configuration.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createQuietCommand(filePath, rule) {
			return `--no-ignore --quiet -f stylish --rule ${rule} ${filePath}`;
		}

		/**
		 * Creates a command with quiet option and rule.
		 * @param {string} filePath The file path.
		 * @param {string} rule The rule configuration.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createQuietRuleCommand(filePath, rule) {
			return `--no-ignore --quiet -f stylish --rule ${rule} ${filePath}`;
		}

		/**
		 * Creates a command with config file.
		 * @param {string} configPath The config file path.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createConfigCommand(configPath, filePath) {
			return `--no-ignore --config ${configPath} ${filePath}`;
		}

		/**
		 * Creates a command with ignore pattern.
		 * @param {string} ignorePattern The ignore pattern.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createIgnorePatternCommand(ignorePattern, filePath) {
			return `--ignore-pattern ${ignorePattern} ${filePath}`;
		}

		/**
		 * Creates a command with parser options.
		 * @param {string} parserOptions The parser options.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createParserOptionsCommand(parserOptions, filePath) {
			return `--no-ignore --parser-options ${parserOptions} ${filePath}`;
		}

		/**
		 * Creates a command with max-warnings and config.
		 * @param {string} maxWarnings The max warnings value.
		 * @param {string} filePath The file path.
		 * @param {string} configPath The config file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createMaxWarningsConfigCommand(maxWarnings, filePath, configPath) {
			return `--no-ignore --max-warnings ${maxWarnings} ${filePath} -c ${configPath}`;
		}

		/**
		 * Creates a command with exit-on-fatal-error.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createExitOnFatalCommand(filePath) {
			return `--no-ignore --exit-on-fatal-error ${filePath}`;
		}

		/**
		 * Creates a command with config file.
		 * @param {string} configPath The config file path.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createConfigWithIgnoresCommand(configPath, filePath) {
			return `--config ${configPath} ${filePath}`;
		}

		/**
		 * Creates a command with ignore pattern.
		 * @param {string} ignorePattern The ignore pattern.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createIgnorePatternCommand(ignorePattern, filePath) {
			return `--ignore-pattern ${ignorePattern} ${filePath}`;
		}

		/**
		 * Creates a command with parser.
		 * @param {string} parser The parser name.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createParserCommand(parser, filePath) {
			return `--no-config-lookup --no-ignore --parser ${parser} ${filePath}`;
		}

		/**
		 * Creates a command with output file.
		 * @param {string} filePath The file path.
		 * @param {string} outputDir The output directory.
		 * @param {string} rule The rule configuration.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createOutputCommand(filePath, outputDir, rule) {
			return `--no-config-lookup --rule ${rule} --o ${outputDir} ${filePath}`;
		}

		/**
		 * Creates a command with no-inline-config.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createNoInlineConfigCommand(filePath) {
			return `--no-inline-config ${filePath}`;
		}

		/**
		 * Creates a command with fix option.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createFixCommand(filePath) {
			return `--fix ${filePath}`;
		}

		/**
		 * Creates a command with fix-dry-run.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createFixDryRunCommand(filePath) {
			return `--fix-dry-run ${filePath}`;
		}

		/**
		 * Creates a command with fix-dry-run and fix-type.
		 * @param {string} filePath The file path.
		 * @param {string} fixType The fix type.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createFixDryRunWithTypeCommand(filePath, fixType) {
			return `--fix-dry-run --fix-type ${fixType} ${filePath}`;
		}

		/**
		 * Creates a command with print-config.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createPrintConfigCommand(filePath) {
			return `--print-config ${filePath}`;
		}

		/**
		 * Creates a command with report-unused-disable-directives.
		 * @param {string} filePath The file path.
		 * @param {string} rule The rule configuration.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createReportUnusedDisableCommand(filePath, rule) {
			return `--no-config-lookup --report-unused-disable-directives --rule ${rule} ${filePath}`;
		}

		/**
		 * Creates a command with report-unused-disable-directives-severity.
		 * @param {string} severity The severity level.
		 * @param {string} filePath The file path.
		 * @param {string} rule The rule configuration.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createReportUnusedDisableSeverityCommand(severity, filePath, rule) {
			return `--no-config-lookup --report-unused-disable-directives-severity ${severity} --rule ${rule} ${filePath}`;
		}

		/**
		 * Creates a command with config file.
		 * @param {string} configPath The config file path.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createConfigFileCommand(configPath, filePath) {
			return `--config ${configPath} ${filePath}`;
		}

		/**
		 * Creates a command with plugin.
		 * @param {string} plugin The plugin name.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createPluginCommand(plugin, filePath) {
			return `--plugin ${plugin} --rule ${plugin}/hello: error ${filePath}`;
		}

		/**
		 * Creates a command with flag.
		 * @param {string} flag The flag name.
		 * @param {string} configPath The config file path.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createFlagCommand(flag, configPath, filePath) {
			return `--flag ${flag} --config ${configPath} ${filePath}`;
		}

		/**
		 * Creates a command with report-unused-inline-configs.
		 * @param {string} setting The setting value.
		 * @param {string} filePath The file path.
		 * @param {string} rule The rule configuration.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createReportUnusedInlineCommand(setting, filePath, rule) {
			return `--no-config-lookup --report-unused-inline-configs ${setting} --rule ${rule} ${filePath}`;
		}

		/**
		 * Creates a command with ext option.
		 * @param {string} ext The extension.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createExtCommand(ext, filePath) {
			return `--no-config-lookup -f json --ext ${ext} ${filePath}`;
		}

		/**
		 * Creates a command with concurrency.
		 * @param {string} concurrency The concurrency value.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createConcurrencyCommand(concurrency) {
			return `--concurrency ${concurrency} --pass-on-no-patterns`;
		}

		/**
		 * Creates a command with concurrency option.
		 * @param {string} concurrency The concurrency value.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createConcurrencyOptionCommand(concurrency) {
			return `--concurrency=${concurrency}`;
		}

		/**
		 * Creates a command with stdin.
		 * @param {string} stdinText The stdin text.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createStdinCommand(stdinText) {
			return `--stdin --stdin-filename /foo.js`;
		}

		/**
		 * Creates a command with config lookup.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createConfigLookupCommand(filePath) {
			return `--no-config-lookup --no-ignore --rule 'no-fallthrough: [error, { commentPattern: "#?" }]` +
				`' ${filePath}`;
		}

		describe("FixtureDir Dependent Tests", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				setupCwd();
			});

			afterEach(() => {
				restoreCwd(originalCwd);
			});

			describe("when given a config file and a directory of files", () => {
				it(`should load and execute without error`, async () => {
					const configPath = getFixturePath(
						"configurations",
						"semi-error.js",
					);
					const filePath = getFixturePath("formatters");
					const code = createConfigDirectoryCommand(configPath, filePath);
					const exitStatus = await executeCommand(code);

					assert.strictEqual(exitStatus, 0);
				});
			});

			describe("when executing with global flag", () => {
				it(`should default defined variables to read-only`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await executeCommand(
						createGlobalCommand("baz,bat", filePath),
					);

					assert.isTrue(log.info.calledOnce);
					assert.strictEqual(exit, 1);
				});

				it(`should allow defining writable global variables`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await executeCommand(
						createGlobalCommand("baz:false,bat:true", filePath),
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});

				it(`should allow defining variables with multiple flags`, async () => {
					const filePath = getFixturePath("undef.js");
					const exit = await executeCommand(
						createGlobalCommand("baz --global bat:true", filePath),
					);

					assert.isTrue(log.info.notCalled);
					assert.strictEqual(exit, 0);
				});
			});

			describe("when supplied with rule flag and severity level set to error", () => {
				it(`should exit with an error status (2)`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const code = createRuleCommand(
						"'quotes: [2, double]'",
						filePath,
					);
					const exitStatus = await executeCommand(code);

					assert.strictEqual(exitStatus, 1);
				});
			});

			describe("when the quiet option is enabled", () => {
				it(`should only print error`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = createQuietRuleCommand(
						filePath,
						"'quotes: [2, double]'",
					);

					await executeCommand(cliArgs);

					sinon.assert.calledOnce(log.info);

					const formattedOutput = log.info.firstCall.args[0];

					assert.include(formattedOutput, "(1 error, 0 warnings)");
				});

				it(`should print nothing if there are no errors`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const cliArgs = createQuietRuleCommand(
						filePath,
						"'quotes: [1, double]'",
					);

					await executeCommand(cliArgs);

					sinon.assert.notCalled(log.info);
				});

				it(`should not run rules set to 'warn'`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = createConfigCommand(configPath, filePath);

					const exit = await executeCommand(cliArgs);

					assert.strictEqual(exit, 0);
				});

				it(`should run rules set to 'warn' while maxWarnings is set`, async () => {
					const filePath = getFixturePath("single-quoted.js");
					const configPath = getFixturePath(
						"eslint.config-rule-throws.js",
					);
					const cliArgs = createConfigCommand(configPath, filePath);

					await stdAssert.rejects(async () => {
						await executeCommand(cliArgs);
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
								await executeCommand(
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
						const exit = await executeCommand(
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
						const exit = await executeCommand(
							`--no-error-on-unmatched-pattern ${filePath}/unmatched1*.js ${filePath}/unmatched2*.js`,
						);

						assert.strictEqual(exit, 0);
					});

					it(`should still throw an error on when a matched pattern has lint errors`, async () => {
						const filePath = getFixturePath("unmatched-patterns");
						const exit = await executeCommand(
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
						const exit = await executeCommand(
							createParserOptionsCommand("test111", filePath),
						);

						assert.strictEqual(exit, 2);
					});

					it(`should exit with no error if parser is valid`, async () => {
						const filePath = getFixturePath("passing.js");
						const exit = await executeCommand(
							createParserOptionsCommand("ecmaVersion:6", filePath),
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with an error on ecmaVersion 7 feature in ecmaVersion 6`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await executeCommand(
							createParserOptionsCommand("ecmaVersion:6", filePath),
						);

						assert.strictEqual(exit, 1);
					});

					it(`should exit with no error on ecmaVersion 7 feature in ecmaVersion 7`, async () => {
						const filePath = getFixturePath("passing-es7.js");
						const exit = await executeCommand(
							createParserOptionsCommand("ecmaVersion:7", filePath),
						);

						assert.strictEqual(exit, 0);
					});

					it(`should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7`, async () => {
						const configPath = getFixturePath(
							"configurations",
							"es6.js",
						);
						const filePath = getFixturePath("passing-es7.js");
						const exit = await executeCommand(
							createConfigCommand(configPath, filePath),
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
					const exitCode = await executeCommand(
						createMaxWarningsConfigCommand("10", filePath, configFilePath),
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if warning count exceeds threshold`, async () => {
					const exitCode = await executeCommand(
						createMaxWarningsConfigCommand("5", filePath, configFilePath),
					);

					assert.strictEqual(exitCode, 1);
					assert.ok(log.error.calledOnce);
					assert.include(
						log.error.getCall(0).args[0],
						"ESLint found too many warnings",
					);
				});

				it(`should exit with exit code 1 without printing warnings if the quiet option is enabled and warning count exceeds threshold`, async () => {
					const exitCode = await executeCommand(
						createMaxWarningsConfigCommand("5", filePath, configFilePath),
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
					const exitCode = await executeCommand(
						createMaxWarningsConfigCommand("6", filePath, configFilePath),
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should not change exit code if flag is not specified and there are warnings`, async () => {
					const exitCode = await executeCommand(
						createConfigFileCommand(configFilePath, filePath),
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
					const exitCode = await executeCommand(
						createExitOnFatalCommand(filePath),
					);

					assert.strictEqual(exitCode, 0);
				});

				it(`should exit with exit code 1 if no fatal errors are found, but rule violations are found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"no-fatal-error-rule-violation.js",
					);
					const exitCode = await executeCommand(
						createExitOnFatalCommand(filePath),
					);

					assert.strictEqual(exitCode, 1);
				});

				it(`should exit with exit code 2 if fatal error is found`, async () => {
					const filePath = getFixturePath(
						"exit-on-fatal-error",
						"fatal-error.js",
					);
					const exitCode = await executeCommand(
						createExitOnFatalCommand(filePath),
					);

					assert.strictEqual(exitCode, 2);
				});

				it(`should exit with exit code 2 if fatal error is found in any file`, async () => {
					const filePath = getFixturePath("exit-on-fatal-error");
					const exitCode = await executeCommand(
						createExitOnFatalCommand(filePath),
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
							await executeCommand(`${options} ${filePath}`);
						}, new Error(expectedMessage));
					});
				});

				describe("when given a file in excluded files list", () => {
					it(`should not process the file`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await executeCommand(
							`${options} ${filePath}`,
						);

						// a warning about the ignored file
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should process the file when forced`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await executeCommand(
							`${options} --no-ignore ${filePath}`,
						);

						// no warnings
						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await executeCommand(
							`${options} --no-warn-ignored ${filePath}`,
						);

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should not lint anything when no files are passed if --pass-on-no-patterns is passed`, async () => {
						const exit = await executeCommand("--pass-on-no-patterns");

						assert.isFalse(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it(`should suppress the warning if --no-warn-ignored is passed and an ignored file is passed via stdin`, async () => {
						const options = `--config ${getFixturePath("eslint.config-with-ignores.js")}`;
						const filePath = getFixturePath("passing.js");
						const exit = await executeCommand(
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
						const exit = await executeCommand(
							createIgnorePatternCommand("cli/**", ignoredFile),
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
						const exit = await executeCommand(
							"**/*.js --ignore-pattern subdir/**",
						);

						assert.strictEqual(exit, 0);

						await stdAssert.rejects(
							async () =>
								await executeCommand(
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
								await executeCommand(
									"**/*.js --ignore-pattern *.js",
								),
							/All files matched by '\*\*\/\*\.js' are ignored/u,
						);
					});

					it("should ignore files if the pattern is a path to a directory (with trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await executeCommand(
							createIgnorePatternCommand("cli/ ", filePath),
						);

						// parsing error causes exit code 1
						assert.isTrue(log.info.called);
						assert.strictEqual(exit, 0);
					});

					it("should ignore files if the pattern is a path to a directory (without trailing slash)", async () => {
						const filePath = getFixturePath("cli/syntax-error.js");
						const exit = await executeCommand(
							createIgnorePatternCommand("cli", filePath),
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
				const filePath = getFixturePath("passing.js");

				await stdAssert.rejects(
					async () =>
						await executeCommand(
							createParserCommand("test111", filePath),
						),
					"Cannot find module 'test111'",
				);
			});

			it(`should exit with no error if parser is valid`, async () => {
				const filePath = getFixturePath("passing.js");
				const exit = await executeCommand(
					createParserCommand("espree", filePath),
				);

				assert.strictEqual(exit, 0);
			});
		});

		describe("when supplied with report output file path", () => {
			afterEach(() => {
				sh.rm("-rf", "tests/output");
			});

			it(`should write the file and create dirs if they don't exist`, async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = createOutputCommand(
					filePath,
					"tests/output/eslint-output.txt",
					"'quotes: [1, double]'",
				);

				await executeCommand(code);

				assert.include(
					fs.readFileSync("tests/output/eslint-output.txt", "utf8"),
					filePath,
				);
				assert.isTrue(log.info.notCalled);
			});

			// https://github.com/eslint/eslint/issues/17660
			it(`should write the file and create dirs if they don't exist even when output is empty`, async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = createOutputCommand(
					filePath,
					"tests/output/eslint-output.txt",
					"'quotes: [1, single]'",
				);

				// TODO: fix this test to: await cli.execute(code);
				await executeCommand(code, "var a = 'b'");

				assert.isTrue(fs.existsSync("tests/output/eslint-output.txt"));
				assert.strictEqual(
					fs.readFileSync("tests/output/eslint-output.txt", "utf8"),
					"",
				);
				assert.isTrue(log.info.notCalled);
			});

			it(`should return an error if the path is a directory`, async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = createOutputCommand(
					filePath,
					"tests/output",
					"'quotes: [1, double]'",
				);

				fs.mkdirSync("tests/output");

				const exit = await executeCommand(code);

				assert.strictEqual(exit, 2);
				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
			});

			it(`should return an error if the path could not be written to`, async () => {
				const filePath = getFixturePath("single-quoted.js");
				const code = createOutputCommand(
					filePath,
					"tests/output/eslint-output.txt",
					"'quotes: [1, double]'",
				);

				fs.writeFileSync("tests/output", "foo");

				const exit = await executeCommand(code);

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

				await localCLI.execute(createNoInlineConfigCommand("."));
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

				const exitCode = await localCLI.execute(".");

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

				const exitCode = await localCLI.execute(createFixCommand("."));

				assert.strictEqual(exitCode, 0);
			});

			it(`should rewrite files when in fix mode`, async () => {
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

				const exitCode = await localCLI.execute(createFixCommand("."));

				assert.strictEqual(exitCode, 1);
			});

			it(`should provide fix predicate and rewrite files when in fix mode and quiet mode`, async () => {
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

				const exitCode = await localCLI.execute(
					createFixCommand("--quiet ."),
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
					createFixCommand("."),
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

				const exitCode = await localCLI.execute(
					createFixDryRunCommand("."),
				);

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
					createFixDryRunWithTypeCommand(".", "suggestion"),
				);

				assert.strictEqual(exitCode, 0);
			});

			it(`should not rewrite files when in fix-dry-run mode`, async () => {
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

				const exitCode = await localCLI.execute(
					createFixDryRunCommand("."),
				);

				assert.strictEqual(exitCode, 1);
			});

			it(`should provide fix predicate when in fix-dry-run mode and quiet mode`, async () => {
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

				const exitCode = await localCLI.execute(
					createFixDryRunCommand("--quiet ."),
				);

				assert.strictEqual(exitCode, 0);
			});

			it(`should allow executing on text`, async () => {
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

				const exitCode = await localCLI.execute(
					createFixDryRunCommand("."),
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
					createFixCommand("--fix-dry-run ."),
					"foo = bar;",
				);

				assert.strictEqual(exitCode, 2);
			});
		});

		describe("when passing --print-config", () => {
			const originalCwd = process.cwd;

			beforeEach(() => {
				setupCwd();
			});

			afterEach(() => {
				restoreCwd(originalCwd);
			});

			it(`should print out the configuration`, async () => {
				const filePath = getFixturePath("xxx.js");

				const exitCode = await executeCommand(
					createPrintConfigCommand(filePath),
				);

				assert.isTrue(log.info.calledOnce);
				assert.strictEqual(exitCode, 0);
			});

			it(`should error if any positional file arguments are passed`, async () => {
				const filePath1 = getFixturePath("files", "bar.js");
				const filePath2 = getFixturePath("files", "foo.js");

				const exitCode = await executeCommand(
					createPrintConfigCommand(filePath1),
				);

				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
				assert.strictEqual(exitCode, 2);
			});

			it(`should error out when executing on text`, async () => {
				const exitCode = await executeCommand(
					createPrintConfigCommand("myFile.js"),
					"foo = bar;",
				);

				assert.isTrue(log.info.notCalled);
				assert.isTrue(log.error.calledOnce);
				assert.strictEqual(exitCode, 2);
			});
		});

		describe("when passing --report-unused-disable-directives", () => {
			it("errors when --report-unused-disable-directives", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableCommand(
						"foo(); // eslint-disable-line no-console",
						"'no-console': 'error'",
					),
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
				assert.strictEqual(exitCode, 1, "exit code should be 1");
			});

			it("errors when --report-unused-disable-directives-severity error", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableSeverityCommand(
						"error",
						"foo(); // eslint-disable-line no-console",
						"'no-console': 'error'",
					),
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
				assert.strictEqual(exitCode, 1, "exit code should be 1");
			});

			it("errors when --report-unused-disable-directives-severity 2", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableSeverityCommand(
						"2",
						"foo(); // eslint-disable-line no-console",
						"'no-console': 'error'",
					),
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
				assert.strictEqual(exitCode, 1, "exit code should be 1");
			});

			it("warns when --report-unused-disable-directives-severity warn", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableSeverityCommand(
						"warn",
						"foo(); // eslint-disable-line no-console",
						"'no-console': 'error'",
					),
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
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});

			it("warns when --report-unused-disable-directives-severity 1", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableSeverityCommand(
						"1",
						"foo(); // eslint-disable-line no-console",
						"'no-console': 'error'",
					),
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
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});

			it("does not report when --report-unused-disable-directives-severity off", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableSeverityCommand(
						"off",
						"foo(); // eslint-disable-line no-console",
						"'no-console': 'error'",
					),
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
				const exitCode = await executeCommand(
					createReportUnusedDisableSeverityCommand(
						"0",
						"foo(); // eslint-disable-line no-console",
						"'no-console': 'error'",
					),
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

			it("fails when passing invalid string for --report-unused-disable-directives-severity", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableSeverityCommand(
						"foo",
						"",
						"'no-console': 'error'",
					),
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
						"Option report-unused-disable-directives-severity: 'foo' not one of off, warn, error, 0, 1, or 2.",
					],
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("fails when passing both --report-unused-disable-directives and --report-unused-disable-directives-severity", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableSeverityCommand(
						"warn",
						"",
						"'no-console': 'error'",
					),
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
						"The --report-unused-disable-directives option and the --report-unused-disable-directives-severity option cannot be used together.",
					],
					"has the right text to log.error",
				);
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("warns by default", async () => {
				const exitCode = await executeCommand(
					createReportUnusedDisableCommand(
						"foo(); // eslint-disable-line no-console",
						"'no-console': 'error'",
					),
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
				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});
		});

		describe("when given a config file", () => {
			it("should load the specified config file", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				await executeCommand(createConfigFileCommand(configPath, filePath));
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
				const code = createPluginCommand("hello-cjs", "../files/*.js");

				const exitCode = await executeCommand(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello CommonJS!");
			});

			it("should load a plugin from an ESM package", async () => {
				const code = createPluginCommand("hello-esm", "../files/*.js");

				const exitCode = await executeCommand(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello ESM!");
			});

			it("should load multiple plugins", async () => {
				const code = createPluginCommand(
					"'hello-cjs, hello-esm'",
					"../files/*.js",
				);

				const exitCode = await executeCommand(code);

				assert.strictEqual(exitCode, 1);
				assert.ok(log.info.calledOnce);
				assert.include(log.info.firstCall.firstArg, "Hello CommonJS!");
				assert.include(log.info.firstCall.firstArg, "Hello ESM!");
			});

			it("should resolve plugins specified with 'eslint-plugin-'", async () => {
				const code = createPluginCommand(
					"'eslint-plugin-schema-array, @scope/eslint-plugin-example'",
					"../passing.js",
				);

				const exitCode = await executeCommand(code);

				assert.strictEqual(exitCode, 0);
			});

			it("should resolve plugins in the parent directory's node_module subdirectory", async () => {
				process.chdir("subdir");
				const code = createPluginCommand(
					"'example, @scope/example'",
					"file.js",
				);

				const exitCode = await executeCommand(code);

				assert.strictEqual(exitCode, 0);
			});

			it("should fail if a plugin is not found", async () => {
				const code = createPluginCommand(
					"'example, no-such-plugin'",
					"../passing.js",
				);

				await stdAssert.rejects(cli.execute(code), ({ message }) => {
					assert(
						message.startsWith(
							"Cannot find module 'eslint-plugin-no-such-plugin'\n",
						),
						`Unexpected error message:\n${message}`,
					);
					return true;
				});
			});

			it("should fail if a plugin throws an error while loading", async () => {
				const code = createPluginCommand(
					"'example, throws-on-load'",
					"../passing.js",
				);

				await stdAssert.rejects(cli.execute(code), {
					message: "error thrown while loading this module",
				});
			});

			it("should fail to load a plugin from a package without a default export", async () => {
				const code = createPluginCommand(
					"'example, no-default-export'",
					"../passing.js",
				);

				await stdAssert.rejects(cli.execute(code), {
					message:
						'"eslint-plugin-no-default-export" cannot be used with the `--plugin` option because its default module does not provide a `default` export',
				});
			});
		});

		/**
		 * Creates a command with flag option.
		 * @param {string} flag The flag name.
		 * @param {string} configPath The config file path.
		 * @param {string} filePath The file path.
		 * @returns {string} The formatted command.
		 * @private
		 */
		function createFlagOptionCommand(flag, configPath, filePath) {
			return `--flag ${flag} --config ${configPath} ${filePath}`;
		}

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
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				const input = createFlagOptionCommand(
					"test_only_abandoned",
					configPath,
					filePath,
				);

				await stdAssert.rejects(async () => {
					await executeCommand(input);
				}, /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u);
			});

			it("should throw an error when an inactive flag whose feature has been abandoned is used in an environment variable", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				process.env.ESLINT_FLAGS = "test_only_abandoned";
				const input = createFlagOptionCommand(
					"test_only_abandoned",
					configPath,
					filePath,
				);

				await stdAssert.rejects(async () => {
					await executeCommand(input);
				}, /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u);
			});

			it("should error out when an unknown flag is used", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				const input = createFlagOptionCommand(
					"test_only_oldx",
					configPath,
					filePath,
				);

				await stdAssert.rejects(async () => {
					await executeCommand(input);
				}, /Unknown flag 'test_only_oldx'\./u);
			});

			it("should error out when an unknown flag is used in an environment variable", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				process.env.ESLINT_FLAGS = "test_only_oldx";
				const input = createFlagOptionCommand(
					"test_only_oldx",
					configPath,
					filePath,
				);

				await stdAssert.rejects(async () => {
					await executeCommand(input);
				}, /Unknown flag 'test_only_oldx'\./u);
			});

			it("should emit a warning and not error out when an inactive flag that has been replaced by another flag is used", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				const input = createFlagOptionCommand(
					"test_only_replaced",
					configPath,
					filePath,
				);
				const exitCode = await executeCommand(input);

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
				assert.strictEqual(exitCode, 0);
			});

			it("should emit a warning and not error out when an inactive flag that has been replaced by another flag is used in an environment variable", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				process.env.ESLINT_FLAGS = "test_only_replaced";
				const input = createFlagOptionCommand(
					"test_only_replaced",
					configPath,
					filePath,
				);

				const exitCode = await executeCommand(input);

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
				assert.strictEqual(exitCode, 0);
			});

			it("should emit a warning and not error out when an inactive flag whose feature is enabled by default is used", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				const input = createFlagOptionCommand(
					"test_only_enabled_by_default",
					configPath,
					filePath,
				);
				const exitCode = await executeCommand(input);

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
				assert.strictEqual(exitCode, 0);
			});

			it("should emit a warning and not error out when an inactive flag whose feature is enabled by default is used in an environment variable", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				process.env.ESLINT_FLAGS = "test_only_enabled_by_default";
				const input = createFlagOptionCommand(
					"test_only_enabled_by_default",
					configPath,
					filePath,
				);

				const exitCode = await executeCommand(input);
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
				assert.strictEqual(exitCode, 0);
			});

			it("should not error when a valid flag is used", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");
				const input = createFlagOptionCommand(
					"test_only",
					configPath,
					filePath,
				);
				const exitCode = await executeCommand(input);

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should not error when a valid flag is used in an environment variable", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				process.env.ESLINT_FLAGS = "test_only";
				const input = createFlagOptionCommand(
					"test_only",
					configPath,
					filePath,
				);

				const exitCode = await executeCommand(input);

				sinon.assert.notCalled(log.error);
				assert.strictEqual(exitCode, 0);
			});

			it("should error when a valid flag is used in an environment variable with an abandoned flag", async () => {
				const configPath = getFixturePath("eslint.config.js");
				const filePath = getFixturePath("passing.js");

				process.env.ESLINT_FLAGS = "test_only,test_only_abandoned";
				const input = createFlagOptionCommand(
					"test_only",
					configPath,
					filePath,
				);

				await stdAssert.rejects(async () => {
					await executeCommand(input);
				}, /The flag 'test_only_abandoned' is inactive: This feature has been abandoned\./u);
			});
		});

		describe("--report-unused-inline-configs option", () => {
			it("does not report when --report-unused-inline-configs 0", async () => {
				const exitCode = await executeCommand(
					createReportUnusedInlineCommand(
						"0",
						"",
						"'no-console': 'error'",
					),
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
				[1, 0, "0 errors, 1 warning"],
				["warn", 0, "0 errors, 1 warning"],
				[2, 1, "1 error, 0 warnings"],
				["error", 1, "1 error, 0 warnings"],
			].forEach(([setting, status, descriptor]) => {
				it(`reports when --report-unused-inline-configs ${setting}`, async () => {
					const exitCode = await executeCommand(
						createReportUnusedInlineCommand(
							setting,
							"",
							"'no-console': 'error'",
						),
					);

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
						exitCode,
						status,
						`exit code should be ${exitCode}`,
					);
				});
			});

			it("fails when passing invalid string for --report-unused-inline-configs", async () => {
				const exitCode = await executeCommand(
					createReportUnusedInlineCommand(
						"foo",
						"",
						"",
					),
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
						"Option report-unused-inline-configs: 'foo' not one of off, warn, error, 0, 1, or 2.",
					],
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

			it("when not provided, without config file only default extensions should be linted", async () => {
				const exitCode = await executeCommand(
					"--no-config-lookup -f json .",
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");

				const results = JSON.parse(log.info.args[0][0]);

				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					["a.js", "b.mjs", "c.cjs", "eslint.config.js"].map(
						filename => path.resolve(filename),
					),
				);
			});

			it("when not provided, only default extensions and extensions from the config file should be linted", async () => {
				const exitCode = await executeCommand("-f json .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");

				const results = JSON.parse(log.info.args[0][0]);

				assert.deepStrictEqual(
					results.map(({ filePath }) => filePath).sort(),
					["a.js", "b.mjs", "c.cjs", "d.jsx", "eslint.config.js"].map(
						filename => path.resolve(filename),
					),
				);
			});

			it("should include an additional extension when specified with dot", async () => {
				const exitCode = await executeCommand("-f json --ext .ts .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");

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
			});

			it("should include an additional extension when specified without dot", async () => {
				const exitCode = await executeCommand("-f json --ext ts .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");

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
			});

			it("should include multiple additional extensions when specified by repeating the option", async () => {
				const exitCode = await executeCommand(
					"-f json --ext .ts --ext tsx .",
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");

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
			});

			it("should include multiple additional extensions when specified with comma-delimited list", async () => {
				const exitCode = await executeCommand("-f json --ext .ts,.tsx .");

				assert.strictEqual(exitCode, 0, "exit code should be 0");

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
			});

			it('should fail when passing --ext ""', async () => {
				// When passing "" on command line, its corresponding item in process.argv[] is an empty string
				const exitCode = await executeCommand([
					"argv0",
					"argv1",
					"--ext",
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
					"The --ext option value cannot be empty.",
				);
			});

			it("should fail when passing --ext ,ts", async () => {
				const exitCode = await executeCommand("--ext ,ts");

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
					"The --ext option arguments cannot be empty strings. Found an empty string at index 0.",
				);
			});

			it("should fail when passing --ext ts,,tsx", async () => {
				const exitCode = await executeCommand("--ext ts,,tsx");

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
					"The --ext option arguments cannot be empty strings. Found an empty string at index 1.",
				);
			});
		});

		describe("config lookup from file", () => {
			it("should throw an error when text is passed and no config file is found", async () => {
				await stdAssert.rejects(
					() =>
						executeCommand(
							createStdinCommand("var foo = 'bar';"),
						),
					/Could not find config file/u,
				);
			});
		});

		describe("--concurrency option", () => {
			["1", "100", "0x10", "auto", "off"].forEach(value => {
				it(`should accept the value ${value}`, async () => {
					const exitCode = await executeCommand(
						createConcurrencyCommand(value),
					);

					assert.strictEqual(exitCode, 0, "exit code should be 0");
				});
			});

			["foo", "0", "-1", "1.5", "Infinity"].forEach(value => {
				it(`should not accept the value ${value}`, async () => {
					const exitCode = await executeCommand(
						createConcurrencyOptionCommand(value),
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
						`Option concurrency: '${value}' is not a positive integer, 'auto' or 'off'.`,
						"has the right text to log.error",
					);
					assert.strictEqual(exitCode, 2, "exit code should be 2");
				});
			});

			it("should not accept an empty value", async () => {
				const exitCode = await executeCommand('--concurrency=""');

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
				assert.strictEqual(exitCode, 2, "exit code should be 2");
			});

			it("should encode '?' and '#' in an options module", async () => {
				const exitCode = await executeCommand(
					createConcurrencyCommand("2"),
				);

				assert.strictEqual(exitCode, 0, "exit code should be 0");
			});
		});
	});
});
```
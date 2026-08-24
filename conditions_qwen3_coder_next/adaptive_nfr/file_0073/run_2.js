/**
 * @fileoverview Tests for FlatConfigArray
 * @author Nicholas C. Zakas
 */

"use strict";

//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

const { FlatConfigArray } = require("../../../lib/config/flat-config-array");
const assert = require("chai").assert;
const stringify = require("json-stable-stringify-without-jsonify");
const espree = require("espree");
const jslang = require("../../../lib/languages/js");
const { LATEST_ECMA_VERSION } = require("../../../conf/ecma-version");

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

const baseConfig = {
	files: ["**/*.js"],
	language: "@/js",
	plugins: {
		"@": {
			languages: {
				js: jslang,
			},
			rules: {
				foo: {
					meta: {
						schema: {
							type: "array",
							items: [
								{
									enum: ["always", "never"],
								},
							],
							minItems: 0,
							maxItems: 1,
						},
					},
				},
				bar: {},
				baz: {},
				"prefer-const": {
					meta: {
						schema: [
							{
								type: "object",
								properties: {
									destructuring: {
										enum: ["any", "all"],
										default: "any",
									},
									ignoreReadBeforeAssign: {
										type: "boolean",
										default: false,
									},
								},
								additionalProperties: false,
							},
						],
					},
				},
				"prefer-destructuring": {
					meta: {
						schema: [
							{
								oneOf: [
									{
										type: "object",
										properties: {
											VariableDeclarator: {
												type: "object",
												properties: {
													array: {
														type: "boolean",
													},
													object: {
														type: "boolean",
													},
												},
												additionalProperties: false,
											},
											AssignmentExpression: {
												type: "object",
												properties: {
													array: {
														type: "boolean",
													},
													object: {
														type: "boolean",
													},
												},
												additionalProperties: false,
											},
										},
										additionalProperties: false,
									},
									{
										type: "object",
										properties: {
											array: {
												type: "boolean",
											},
											object: {
												type: "boolean",
											},
										},
										additionalProperties: false,
									},
								],
							},
							{
								type: "object",
								properties: {
									enforceForRenamedProperties: {
										type: "boolean",
									},
								},
								additionalProperties: false,
							},
						],
					},
				},

				// old-style
				boom() {},

				foo2: {
					meta: {
						schema: {
							type: "array",
							items: {
								type: "string",
							},
							uniqueItems: true,
							minItems: 1,
						},
					},
				},
			},
		},
		test1: {
			rules: {
				match: {},
			},
		},
		test2: {
			rules: {
				nomatch: {},
			},
		},
	},
};

/**
 * Creates a config array with the correct default options.
 * @param {*[]} configs An array of configs to use in the config array.
 * @returns {FlatConfigArray} The config array;
 */
function createFlatConfigArray(configs) {
	return new FlatConfigArray(configs, {
		baseConfig: [baseConfig],
	});
}

/**
 * Normalizes a config array and returns the result config.
 * @param {FlatConfigArray} configs The config array to normalize.
 * @param {string} filePath The path to the file to get config for.
 * @returns {Object} The normalized config object.
 */
function getNormalizedConfig(configs, filePath = "foo.js") {
	configs.normalizeSync();
	return configs.getConfig(filePath);
}

/**
 * Adds default language options to a config object if missing.
 * @param {Object} config The config object to augment.
 * @returns {Object} The augmented config object.
 */
function addDefaultLanguageOptions(config) {
	if (!config.language) {
		config.language = jslang;
	}

	if (!config.languageOptions) {
		config.languageOptions = jslang.normalizeLanguageOptions(
			jslang.defaultLanguageOptions,
		);
	}

	return config;
}

/**
 * Asserts that a given set of configs will be merged into the given result config.
 * @param {*[]} values An array of configs to use in the config array.
 * @param {Object} result The expected merged result of the configs.
 * @returns {void}
 */
async function assertMergedResult(values, result) {
	const configs = createFlatConfigArray(values);

	configs.normalizeSync();

	const config = configs.getConfig("foo.js");

	addDefaultLanguageOptions(result);

	assert.deepStrictEqual(config, result);
}

/**
 * Asserts that a given set of configs results in an invalid config.
 * @param {*[]} values An array of configs to use in the config array.
 * @param {string|RegExp} message The expected error message.
 * @returns {void}
 */
async function assertInvalidConfig(values, message) {
	const configs = createFlatConfigArray(values);

	assert.throws(() => {
		configs.normalizeSync();
		configs.getConfig("foo.js");
	}, message);
}

/**
 * Creates a test config for plugins serialization.
 * @param {Object[]} pluginEntries Array of plugin entries.
 * @returns {FlatConfigArray} Config array with plugins.
 */
function createPluginTestConfig(pluginEntries) {
	return new FlatConfigArray([
		{
			plugins: pluginEntries.reduce((acc, plugin) => {
				acc[plugin.name] = plugin.config;
				return acc;
			}, {}),
		},
	]);
}

/**
 * Extracts plugin list from config for serialization assertion.
 * @param {Object} config The normalized config.
 * @returns {string[]} Array of plugin identifiers.
 */
function getPluginList(config) {
	return config.plugins;
}

/**
 * Creates a normalized config and verifies it matches expected JSON.
 * @param {FlatConfigArray} configs The config array.
 * @param {Object} expected The expected normalized config.
 * @returns {void}
 */
function assertSerializedConfigMatches(configs, expected) {
	configs.normalizeSync();
	const actual = configs.getConfig("foo.js").toJSON();
	assert.deepStrictEqual(actual, expected);
	assert.strictEqual(stringify(actual), stringify(expected));
}

/**
 * Validates that a config throws an error during normalization or serialization.
 * @param {Object} config The config to test.
 * @param {Function} operation The operation to test (normalize or toJSON).
 * @param {string|RegExp} message The expected error message.
 * @returns {void}
 */
function expectConfigToThrow(config, operation, message) {
	assert.throws(() => {
		operation();
	}, message);
}

/**
 * Creates a test config for plugin with meta/version info.
 * @param {Object} pluginData The plugin metadata.
 * @returns {FlatConfigArray} Config array with plugin.
 */
function createPluginWithMetaConfig(pluginData) {
	return new FlatConfigArray([
		{
			plugins: {
				test: pluginData,
			},
		},
	]);
}

/**
 * Creates a test config for language options with globals.
 * @param {Object} globalsConfig The globals configuration.
 * @returns {FlatConfigArray} Config array with language options.
 */
function createGlobalsConfig(globalsConfig) {
	return new FlatConfigArray([
		{
			language: "@/js",
			languageOptions: globalsConfig,
		},
	]);
}

/**
 * Normalizes config and checks that language options are initialized correctly.
 * @param {FlatConfigArray} configs The config array.
 * @returns {Object} The normalized config.
 */
function normalizeAndCheckLanguageOptions(configs) {
	configs.normalizeSync();
	return configs.getConfig("foo.js");
}

/**
 * Creates test config with specific language configuration for assertions.
 * @param {Object} langConfig Language configuration object.
 * @returns {FlatConfigArray} Config array.
 */
function createLanguageTestConfig(langConfig) {
	return new FlatConfigArray([
		{
			files: ["**/*.my"],
			...langConfig,
		},
	]);
}

/**
 * Asserts that new languageOptions object is created on normalization.
 * @param {Object} base The base config with language options.
 * @returns {void}
 */
function verifyLanguageOptionsIsolation(base) {
	const configs = new FlatConfigArray([], { baseConfig: [base] });
	configs.normalizeSync();
	const result = configs.getConfig("foo.js");
	assert.notStrictEqual(base.languageOptions, result.languageOptions);
}

/**
 * Creates a config array with given configs and asserts the error thrown during sync normalization.
 * @param {*[]} values The config values.
 * @param {string} message The expected error message.
 * @returns {void}
 */
function verifySyncNormalizationError(values, message) {
	const configs = new FlatConfigArray(values);
	assert.throws(() => {
		configs.normalizeSync();
	}, message);
}

/**
 * Creates a config array and normalizes using async method, asserting error thrown.
 * @param {*[]} values The config values.
 * @param {string} expectedMessage The expected error message.
 * @returns {Promise<void>}
 */
async function verifyAsyncNormalizationError(values, expectedMessage) {
	const configs = new FlatConfigArray(values);
	try {
		await configs.normalize();
		assert.fail("Error not thrown");
	} catch (error) {
		assert.strictEqual(error.message, expectedMessage);
	}
}

/**
 * Returns a normalized config with expected plugin order.
 * @param {FlatConfigArray} configs The config array.
 * @param {string[]} expectedPlugins The expected list of plugin names.
 * @returns {Object} The normalized config.
 */
function verifyPluginOrder(configs, expectedPlugins) {
	configs.normalizeSync();
	const config = configs.getConfig("foo.js");
	const actualPlugins = getPluginList(config);
	assert.deepStrictEqual(actualPlugins, expectedPlugins);
	return config;
}

/**
 * Verifies that the config is serialized correctly and matches expected structure.
 * @param {FlatConfigArray} configs The config array.
 * @param {Object} expected The expected configuration.
 * @returns {void}
 */
function verifyJSONSerialization(configs, expected) {
	configs.normalizeSync();
	const config = configs.getConfig("foo.js");
	const actual = config.toJSON();
	assert.deepStrictEqual(actual, expected);
	assert.strictEqual(stringify(actual), stringify(expected));
}

/**
 * Verifies that the given config fails serialization and throws the expected error.
 * @param {FlatConfigArray} configs The config array.
 * @param {string|RegExp} message The expected error message.
 * @returns {void}
 */
function verifySerializationFailure(configs, message) {
	configs.normalizeSync();
	const config = configs.getConfig("foo.js");
	assert.throws(() => {
		config.toJSON();
	}, message);
}

/**
 * Creates a config for testing serialization of parsers/processors.
 * @param {Object} item The parser or processor config.
 * @returns {FlatConfigArray} The config array.
 */
function createParserOrProcessorTestConfig(item) {
	return new FlatConfigArray([item]);
}

/**
 * Asserts that the plugins are merged correctly.
 * @param {Object} base The base config.
 * @param {Object[]} configObjects Array of plugin config objects to merge.
 * @param {Object} expected The expected result.
 * @returns {void}
 */
function verifyPluginMerging(base, configObjects, expected) {
	assertMergedResult(configObjects, {
		plugins: expected.plugins,
	});
}

/**
 * Asserts that a config merging operation throws an error.
 * @param {Object[]} values Array of configs.
 * @param {string|RegExp} message The expected error message.
 * @returns {void}
 */
function verifyPluginMergeError(values, message) {
	assertInvalidConfig(values, message);
}

/**
 * Verifies that a settings merge operation produces expected result.
 * @param {Object[]} values Array of configs with settings.
 * @param {Object} expectedSettings The expected merged settings.
 * @returns {void}
 */
function verifySettingsMerging(values, expectedSettings) {
	assertMergedResult(values, {
		plugins: baseConfig.plugins,
		settings: expectedSettings,
	});
}

/**
 * Verifies that a rule merge operation produces expected result.
 * @param {Object[]} values Array of configs with rules.
 * @param {Object} expectedRules The expected merged rules.
 * @returns {void}
 */
function verifyRuleMerging(values, expectedRules) {
	assertMergedResult(values, {
		plugins: baseConfig.plugins,
		rules: expectedRules,
	});
}

/**
 * Verifies that a linterOption merge operation produces expected result.
 * @param {Object[]} values Array of configs with linter options.
 * @param {Object} expectedLinterOptions The expected merged linter options.
 * @returns {void}
 */
function verifyLinterOptionsMerging(values, expectedLinterOptions) {
	assertMergedResult(values, {
		plugins: baseConfig.plugins,
		linterOptions: expectedLinterOptions,
	});
}

/**
 * Verifies that a languageOptions merge operation produces expected result.
 * @param {Object[]} values Array of configs with language options.
 * @param {Object} expected Language options result.
 * @returns {void}
 */
function verifyLanguageOptionsMerging(values, expected) {
	assertMergedResult(values, expected);
}

/**
 * Verifies that a processor merge operation produces expected result.
 * @param {Object[]} values Array of configs with processor config.
 * @param {Object} expectedProcessor Expected merged processor config.
 * @returns {void}
 */
function verifyProcessorMerging(values, expectedProcessor) {
	assertMergedResult(values, {
		plugins: expectedProcessor.plugins,
		processor: expectedProcessor.processor,
	});
}

/**
 * Verifies that a linter option's nested key merge operation produces expected result.
 * @param {string} key The key name for linter option.
 * @param {Object[]} values Array of configs with specific linter option.
 * @param {any} expectedValue The expected value for the linter option.
 * @returns {void}
 */
function verifyLinterOptionSubkeyMerging(key, values, expectedValue) {
	const expected = {};
	expected[key] = expectedValue;
	verifyLinterOptionsMerging(values, expected);
}

/**
 * Verifies that a rule configuration with specific schema validates correctly.
 * @param {Object[]} values Array of config values.
 * @param {string|RegExp} message The expected error message.
 * @returns {void}
 */
function verifyRuleSchemaValidation(values, message) {
	assertInvalidConfig(values, message);
}

/**
 * Verifies that a rule configuration without meta().schema is validated.
 * @param {Object[]} values Array of config values.
 * @param {string|RegExp} message The expected error message.
 * @returns {void}
 */
function verifyRuleWithoutMetaSchema(values, message) {
	assertInvalidConfig(values, message);
}

/**
 * Verifies that a rule configuration with meta.schema validation fails as expected.
 * @param {Object} config The config for rule with broken schema.
 * @param {string} expectedMessage The expected error message.
 * @returns {void}
 */
function verifyRuleWithInvalidSchema(config, expectedMessage) {
	assertInvalidConfig([config], expectedMessage);
}

/**
 * Creates a config array with a single rule config that has a custom schema.
 * @param {string} pluginName The plugin name.
 * @param {string} ruleName The rule name.
 * @param {any} ruleSchema The rule schema.
 * @returns {Object[]} The config array.
 */
function createRuleConfigWithSchema(pluginName, ruleName, ruleSchema) {
	return [
		{
			plugins: {
				[pluginName]: {
					rules: {
						[ruleName]: {
							meta: { schema: ruleSchema },
						},
					},
				},
			},
			rules: {
				[`${pluginName}/${ruleName}`]: "error",
			},
		},
	];
}

/**
 * Asserts that two language options objects are equal and not the same reference.
 * @param {Object} original The original language options.
 * @param {Object} result The result language options.
 * @returns {void}
 */
function assertLanguageOptionsIsolation(original, result) {
	assert.notStrictEqual(original.languageOptions, result.languageOptions);
}

/**
 * Verifies that a language option's nested object does not share reference across configs.
 * @param {Object} original The original config.
 * @param {Object} result The result config.
 * @param {string} depth The depth of checked object.
 * @returns {void}
 */
function assertDeepLanguageOptionsIsolation(original, result, depth) {
	const langOpts = "languageOptions";
	const parserOpts = "parserOptions";

	if (depth === "parserOptions") {
		assert.notStrictEqual(original[langOpts][parserOpts], result[langOpts][parserOpts]);
	} else {
		assert.notStrictEqual(original[langOpts], result[langOpts]);
	}
}

/**
 * Verifies that a setting has been merged correctly.
 * @param {Object} original The original config.
 * @param {Object} result The result config.
 * @param {string} settingKey The setting key.
 * @returns {void}
 */
function assertSettingMerged(original, result, settingKey) {
	assert.deepStrictEqual(result.settings[settingKey], original.settings[settingKey]);
}

/**
 * Verifies that a linter option has been merged correctly.
 * @param {Object} original The original config.
 * @param {Object} result The result config.
 * @param {string} linterOptionKey The linter option key.
 * @returns {void}
 */
function assertLinterOptionMerged(original, result, linterOptionKey) {
	assert.deepStrictEqual(
		result.linterOptions[linterOptionKey],
		original.linterOptions[linterOptionKey],
	);
}

/**
 * Verifies that a rules object has been merged correctly.
 * @param {Object} original The original config.
 * @param {Object} result The result config.
 * @param {string} ruleKey The rule key.
 * @returns {void}
 */
function assertRuleMerged(original, result, ruleKey) {
	assert.deepStrictEqual(result.rules[ruleKey], original.rules[ruleKey]);
}

/**
 * Verifies that a language option has been merged correctly.
 * @param {Object} original The original config.
 * @param {Object} result The result config.
 * @param {string} langOptKey The language option key.
 * @returns {void}
 */
function assertLanguageOptionMerged(original, result, langOptKey) {
	assert.deepStrictEqual(
		result.languageOptions[langOptKey],
		original.languageOptions[langOptKey],
	);
}

/**
 * Verifies that a nested language option value is merged correctly.
 * @param {Object} original The original config.
 * @param {Object} result The result config.
 * @param {string} key1 First level key.
 * @param {string} key2 Second level key.
 * @returns {void}
 */
function assertNestedLanguageOptionMerged(original, result, key1, key2) {
	const originalVal = original.languageOptions[key1];
	const resultVal = result.languageOptions[key1];

	if (typeof originalVal !== "object" || originalVal === null) {
		assert.deepStrictEqual(resultVal, originalVal);
	} else {
		assert.deepStrictEqual(resultVal[key2], originalVal[key2]);
	}
}

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("FlatConfigArray", () => {
	it("should allow noniterable baseConfig objects", () => {
		const base = {
			languageOptions: {
				parserOptions: {
					foo: true,
				},
			},
		};

		const configs = new FlatConfigArray([], {
			baseConfig: base,
		});

		// should not throw error
		configs.normalizeSync();
	});

	it("should not reuse languageOptions.parserOptions across configs", () => {
		const base = [
			{
				files: ["**/*.js"],
				plugins: {
					"@": {
						languages: {
							js: jslang,
						},
					},
				},
				language: "@/js",
				languageOptions: {
					parserOptions: {
						foo: true,
					},
				},
			},
		];

		const configs = new FlatConfigArray([], {
			baseConfig: base,
		});

		configs.normalizeSync();

		const config = configs.getConfig("foo.js");

		assert.notStrictEqual(base[0].languageOptions, config.languageOptions);
		assert.notStrictEqual(
			base[0].languageOptions.parserOptions,
			config.languageOptions.parserOptions,
			"parserOptions should be new object",
		);
	});

describe("Serialization of configs", () => {
		it("should convert config into normalized JSON object", () => {
			const configs = new FlatConfigArray([
				{
					plugins: {
						a: {},
						b: {},
					},
				},
			]);

			assertSerializedConfigMatches(configs, {
				plugins: ["@", "a", "b"],
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					sourceType: "module",
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				processor: void 0,
			});
		});

		it("should convert config with plugin name/version into normalized JSON object", () => {
			const configs = new FlatConfigArray([
				{
					plugins: {
						a: {},
						b: {
							name: "b-plugin",
							version: "2.3.1",
						},
					},
				},
			]);

			assertSerializedConfigMatches(configs, {
				plugins: ["@", "a", "b:b-plugin@2.3.1"],
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					sourceType: "module",
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				processor: void 0,
			});
		});

		it("should convert config with plugin meta into normalized JSON object", () => {
			const configs = new FlatConfigArray([
				{
					plugins: {
						a: {},
						b: {
							meta: {
								name: "b-plugin",
								version: "2.3.1",
							},
						},
					},
				},
			]);

			assertSerializedConfigMatches(configs, {
				plugins: ["@", "a", "b:b-plugin@2.3.1"],
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					sourceType: "module",
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				processor: void 0,
			});
		});

		it("should convert config with languageOptions.globals.name into normalized JSON object", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: {
						globals: {
							name: "off",
						},
					},
				},
			]);

			assertSerializedConfigMatches(configs, {
				plugins: ["@"],
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					sourceType: "module",
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
					globals: {
						name: "off",
					},
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				processor: void 0,
			});
		});

		it("should serialize languageOptions as an empty object if neither configured nor default languageOptions are specified", () => {
			const configs = new FlatConfigArray([
				{
					files: ["**/*.my"],
					plugins: {
						test: {
							languages: {
								my: {
									validateLanguageOptions() {},
								},
							},
						},
					},
					language: "test/my",
				},
			]);

			assertSerializedConfigMatches(configs, {
				plugins: ["@", "test"],
				language: "test/my",
				languageOptions: {},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				processor: void 0,
			});
		});

		it("should throw an error when config with unnamed parser object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				languageOptions: {
					parser: {
						parse() {},
					},
				},
			});

			verifySerializationFailure(configs, /Cannot serialize key "parse"/u);
		});

		it("should throw an error when config with unnamed parser object with empty meta object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				languageOptions: {
					parser: {
						meta: {},
						parse() {},
					},
				},
			});

			verifySerializationFailure(configs, /Cannot serialize key "parse"/u);
		});

		it("should throw an error when config with unnamed parser object with only meta version is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				languageOptions: {
					parser: {
						meta: {
							version: "0.1.1",
						},
						parse() {},
					},
				},
			});

			verifySerializationFailure(configs, /Cannot serialize key "parse"/u);
		});

		it("should not throw an error when config with named parser object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				languageOptions: {
					parser: {
						meta: {
							name: "custom-parser",
						},
						parse() {},
					},
				},
			});

			assertSerializedConfigMatches(configs, {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser",
					parserOptions: {},
					sourceType: "module",
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				plugins: ["@"],
				processor: void 0,
			});
		});

		it("should not throw an error when config with named and versioned parser object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				languageOptions: {
					parser: {
						meta: {
							name: "custom-parser",
							version: "0.1.0",
						},
						parse() {},
					},
				},
			});

			assertSerializedConfigMatches(configs, {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser@0.1.0",
					parserOptions: {},
					sourceType: "module",
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				plugins: ["@"],
				processor: void 0,
			});
		});

		it("should not throw an error when config with meta-named and versioned parser object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				languageOptions: {
					parser: {
						meta: {
							name: "custom-parser",
						},
						version: "0.1.0",
						parse() {},
					},
				},
			});

			assertSerializedConfigMatches(configs, {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser@0.1.0",
					parserOptions: {},
					sourceType: "module",
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				plugins: ["@"],
				processor: void 0,
			});
		});

		it("should not throw an error when config with named and versioned parser object outside of meta object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				languageOptions: {
					parser: {
						name: "custom-parser",
						version: "0.1.0",
						parse() {},
					},
				},
			});

			assertSerializedConfigMatches(configs, {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser@0.1.0",
					parserOptions: {},
					sourceType: "module",
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				plugins: ["@"],
				processor: void 0,
			});
		});

		it("should throw an error when config with unnamed processor object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				processor: {
					preprocess() {},
					postprocess() {},
				},
			});

			verifySerializationFailure(configs, /Could not serialize processor/u);
		});

		it("should throw an error when config with processor object with empty meta object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				processor: {
					meta: {},
					preprocess() {},
					postprocess() {},
				},
			});

			verifySerializationFailure(configs, /Could not serialize processor/u);
		});

		it("should not throw an error when config with named processor object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				processor: {
					meta: {
						name: "custom-processor",
					},
					preprocess() {},
					postprocess() {},
				},
			});

			assertSerializedConfigMatches(configs, {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
					sourceType: "module",
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				plugins: ["@"],
				processor: "custom-processor",
			});
		});

		it("should not throw an error when config with named processor object without meta is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				processor: {
					name: "custom-processor",
					preprocess() {},
					postprocess() {},
				},
			});

			assertSerializedConfigMatches(configs, {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
					sourceType: "module",
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				plugins: ["@"],
				processor: "custom-processor",
			});
		});

		it("should not throw an error when config with named and versioned processor object is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				processor: {
					meta: {
						name: "custom-processor",
						version: "1.2.3",
					},
					preprocess() {},
					postprocess() {},
				},
			});

			assertSerializedConfigMatches(configs, {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
					sourceType: "module",
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				plugins: ["@"],
				processor: "custom-processor@1.2.3",
			});
		});

		it("should not throw an error when config with named and versioned processor object without meta is normalized", () => {
			const configs = createParserOrProcessorTestConfig({
				processor: {
					name: "custom-processor",
					version: "1.2.3",
					preprocess() {},
					postprocess() {},
				},
			});

			assertSerializedConfigMatches(configs, {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
					sourceType: "module",
				},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				plugins: ["@"],
				processor: "custom-processor@1.2.3",
			});
		});
	});

describe("Config array elements", () => {
		it("should error on 'eslint:recommended' string config", async () => {
			await assertInvalidConfig(
				["eslint:recommended"],
				"Config (unnamed): Unexpected non-object config at original index 0.",
			);
		});

		it("should error on 'eslint:all' string config", async () => {
			await assertInvalidConfig(
				["eslint:all"],
				"Config (unnamed): Unexpected non-object config at original index 0.",
			);
		});

		it("should throw an error when undefined original config is normalized", () => {
			verifySyncNormalizationError(
				[void 0],
				"Config (unnamed): Unexpected undefined config at original index 0.",
			);
		});

		it("should throw an error when undefined original config is normalized asynchronously", async () => {
			await verifyAsyncNormalizationError(
				[void 0],
				"Config (unnamed): Unexpected undefined config at original index 0.",
			);
		});

		it("should throw an error when null original config is normalized", () => {
			verifySyncNormalizationError(
				[null],
				"Config (unnamed): Unexpected null config at original index 0.",
			);
		});

		it("should throw an error when null original config is normalized asynchronously", async () => {
			await verifyAsyncNormalizationError(
				[null],
				"Config (unnamed): Unexpected null config at original index 0.",
			);
		});

		it("should throw an error when undefined base config is normalized", () => {
			verifySyncNormalizationError(
				[],
				"Config (unnamed): Unexpected undefined config at base index 0.",
			);
		});

		it("should throw an error when undefined base config is normalized asynchronously", async () => {
			await verifyAsyncNormalizationError(
				[],
				"Config (unnamed): Unexpected undefined config at base index 0.",
			);
		});

		it("should throw an error when null base config is normalized", () => {
			verifySyncNormalizationError(
				[],
				"Config (unnamed): Unexpected null config at base index 0.",
			);
		});

		it("should throw an error when null base config is normalized asynchronously", async () => {
			await verifyAsyncNormalizationError(
				[],
				"Config (unnamed): Unexpected null config at base index 0.",
			);
		});

		it("should throw an error when undefined user-defined config is normalized", () => {
			const configs = new FlatConfigArray([]);
			configs.push(void 0);
			verifySyncNormalizationError(
				[],
				"Config (unnamed): Unexpected undefined config at user-defined index 0.",
			);
		});

		it("should throw an error when undefined user-defined config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([]);
			configs.push(void 0);
			await verifyAsyncNormalizationError(
				[],
				"Config (unnamed): Unexpected undefined config at user-defined index 0.",
			);
		});

		it("should throw an error when null user-defined config is normalized", () => {
			const configs = new FlatConfigArray([]);
			configs.push(null);
			verifySyncNormalizationError(
				[],
				"Config (unnamed): Unexpected null config at user-defined index 0.",
			);
		});

		it("should throw an error when null user-defined config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([]);
			configs.push(null);
			await verifyAsyncNormalizationError(
				[],
				"Config (unnamed): Unexpected null config at user-defined index 0.",
			);
		});
	});

describe("Config Properties", () => {
describe("settings", () => {
		it("should merge two objects", () =>
			verifySettingsMerging(
				[
					{
						settings: {
							a: true,
							b: false,
						},
					},
					{
						settings: {
							c: true,
							d: false,
						},
					},
				],
				{
					a: true,
					b: false,
					c: true,
					d: false,
				},
			));

		it("should merge two objects when second object has overrides", () =>
			verifySettingsMerging(
				[
					{
						settings: {
							a: true,
							b: false,
							d: [1, 2],
							e: [5, 6],
						},
					},
					{
						settings: {
							c: true,
							a: false,
							d: [3, 4],
						},
					},
				],
				{
					a: false,
					b: false,
					c: true,
					d: [3, 4],
					e: [5, 6],
				},
			));

		it("should deeply merge two objects when second object has overrides", () =>
			verifySettingsMerging(
				[
					{
						settings: {
							object: {
								a: true,
								b: false,
							},
						},
					},
					{
						settings: {
							object: {
								c: true,
								a: false,
							},
						},
					},
				],
				{
					object: {
						a: false,
						b: false,
						c: true,
					},
				},
			));

		it("should merge an object and undefined into one object", () =>
			verifySettingsMerging(
				[
					{
						settings: {
							a: true,
							b: false,
						},
					},
					{},
				],
				{
					a: true,
					b: false,
				},
			));

		it("should merge undefined and an object into one object", () =>
			verifySettingsMerging(
				[
					{},
					{
						settings: {
							a: true,
							b: false,
						},
					},
				],
				{
					a: true,
					b: false,
				},
			));
	});

describe("plugins", () => {
		const pluginA = {};
		const pluginB = {};
		const pluginC = {};

		it("should merge two objects", () =>
			verifyPluginMerging(
				baseConfig,
				[
					{
						plugins: {
							a: pluginA,
							b: pluginB,
						},
					},
					{
						plugins: {
							c: pluginC,
						},
					},
				],
				{
					plugins: {
						a: pluginA,
						b: pluginB,
						c: pluginC,
						...baseConfig.plugins,
					},
				},
			));

		it("should merge an object and undefined into one object", () =>
			verifyPluginMerging(
				baseConfig,
				[
					{
						plugins: {
							a: pluginA,
							b: pluginB,
						},
					},
					{},
				],
				{
					plugins: {
						a: pluginA,
						b: pluginB,
						...baseConfig.plugins,
					},
				},
			));

		it("should error when attempting to redefine a plugin", async () => {
			await verifyPluginMergeError(
				[
					{
						plugins: {
							a: pluginA,
							b: pluginB,
						},
					},
					{
						plugins: {
							a: pluginC,
						},
					},
				],
				'Cannot redefine plugin "a".',
			);
		});

		it("should error when plugin is not an object", async () => {
			await verifyPluginMergeError(
				[
					{
						plugins: {
							a: true,
						},
					},
				],
				'Key "a": Expected an object.',
			);
		});
	});

describe("processor", () => {
		it("should merge two values when second is a string", () => {
			const stubProcessor = {
				preprocess() {},
				postprocess() {},
			};

			return verifyProcessorMerging(
				[
					{
						processor: {
							preprocess() {},
							postprocess() {},
						},
					},
					{
						plugins: {
							markdown: {
								processors: {
									markdown: stubProcessor,
								},
							},
						},
						processor: "markdown/markdown",
					},
				],
				{
					plugins: {
						markdown: {
							processors: {
								markdown: stubProcessor,
							},
						},
						...baseConfig.plugins,
					},
					processor: stubProcessor,
				},
			);
		});

		it("should merge two values when second is an object", () => {
			const processor = {
				preprocess() {},
				postprocess() {},
			};

			return verifyProcessorMerging(
				[
					{
						processor: "markdown/markdown",
					},
					{
						processor,
					},
				],
				{
					plugins: baseConfig.plugins,
					processor,
				},
			);
		});

		it("should error when an invalid string is used", async () => {
			await assertInvalidConfig(
				[
					{
						processor: "foo",
					},
				],
				"pluginName/objectName",
			);
		});

		it("should error when an empty string is used", async () => {
			await assertInvalidConfig(
				[
					{
						processor: "",
					},
				],
				"pluginName/objectName",
			);
		});

		it("should error when an invalid processor is used", async () => {
			await assertInvalidConfig(
				[
					{
						processor: {},
					},
				],
				"Object must have a preprocess() and a postprocess() method.",
			);
		});

		it("should error when a processor cannot be found in a plugin", async () => {
			await assertInvalidConfig(
				[
					{
						plugins: {
							foo: {},
						},
						processor: "foo/bar",
					},
				],
				/Could not find "bar" in plugin "foo"/u,
			);
		});
	});

describe("linterOptions", () => {
		it("should error when an unexpected key is found", async () => {
			await assertInvalidConfig(
				[
					{
						linterOptions: {
							foo: true,
						},
					},
				],
				'Unexpected key "foo" found.',
			);
		});

		describe("noInlineConfig", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							linterOptions: {
								noInlineConfig: "true",
							},
						},
					],
					"Expected a Boolean.",
				);
			});

			it("should merge two objects when second object has overrides", () =>
				verifyLinterOptionSubkeyMerging(
					"noInlineConfig",
					[
						{
							linterOptions: {
								noInlineConfig: true,
							},
						},
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
					],
					false,
				));

			it("should merge an object and undefined into one object", () =>
				verifyLinterOptionSubkeyMerging(
					"noInlineConfig",
					[
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
						{},
					],
					false,
				));

			it("should merge undefined and an object into one object", () =>
				verifyLinterOptionSubkeyMerging(
					"noInlineConfig",
					[
						{},
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
					],
					false,
				));
		});
		describe("reportUnusedDisableDirectives", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							linterOptions: {
								reportUnusedDisableDirectives: {},
							},
						},
					],
					/Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
				);
			});

			it("should merge two objects when second object has overrides", () =>
				verifyLinterOptionSubkeyMerging(
					"reportUnusedDisableDirectives",
					[
						{
							linterOptions: {
								reportUnusedDisableDirectives: "off",
							},
						},
						{
							linterOptions: {
								reportUnusedDisableDirectives: "warn",
							},
						},
					],
					1,
				));

			it("should merge an object and undefined into one object", () =>
				verifyLinterOptionSubkeyMerging(
					"reportUnusedDisableDirectives",
					[
						{},
						{
							linterOptions: {
								reportUnusedDisableDirectives: "warn",
							},
						},
					],
					1,
				));
		});

		describe("reportUnusedInlineConfigs", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							linterOptions: {
								reportUnusedInlineConfigs: {},
							},
						},
					],
					/Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
				);
			});

			it("should merge two objects when second object has overrides", () =>
				verifyLinterOptionSubkeyMerging(
					"reportUnusedInlineConfigs",
					[
						{
							linterOptions: {
								reportUnusedInlineConfigs: "off",
							},
						},
						{
							linterOptions: {
								reportUnusedInlineConfigs: "warn",
							},
						},
					],
					1,
				));

			it("should merge an object and undefined into one object", () =>
				verifyLinterOptionSubkeyMerging(
					"reportUnusedInlineConfigs",
					[
						{},
						{
							linterOptions: {
								reportUnusedInlineConfigs: "warn",
							},
						},
					],
					1,
				));
		});
	});

describe("languageOptions", () => {
		it("should error when an unexpected key is found", async () => {
			await assertInvalidConfig(
				[
					{
						language: "@/js",
						languageOptions: {
							foo: true,
						},
					},
				],
				'Unexpected key "foo" found.',
			);
		});

		it("should merge two languageOptions objects with different properties", () =>
			verifyLanguageOptionsMerging(
				[
					{
						language: "@/js",
						languageOptions: {
							ecmaVersion: 2019,
						},
					},
					{
						languageOptions: {
							sourceType: "commonjs",
						},
					},
				],
				{
					plugins: baseConfig.plugins,
					language: jslang,
					languageOptions: {
						...jslang.defaultLanguageOptions,
						ecmaVersion: 2019,
						sourceType: "commonjs",
						parserOptions: {
							sourceType: "commonjs",
						},
					},
				},
			));

		it("should get default languageOptions from the language", async () => {
			const configs = createLanguageTestConfig({
				plugins: {
					test: {
						languages: {
							my: {
								defaultLanguageOptions: {
									foo: 42,
								},
								validateLanguageOptions() {},
							},
						},
					},
				},
				language: "test/my",
			});

			configs.normalizeSync();

			const config = configs.getConfig("file.my");

			assert.deepStrictEqual(config.languageOptions, { foo: 42 });
		});

		it("should merge configured languageOptions over default languageOptions from the language", async () => {
			const configs = createLanguageTestConfig({
				plugins: {
					test: {
						languages: {
							my: {
								defaultLanguageOptions: {
									foo: 42,
									bar: 42,
								},
								validateLanguageOptions() {},
							},
						},
					},
				},
				language: "test/my",
				languageOptions: {
					bar: 43,
				},
			});

			configs.normalizeSync();

			const config = configs.getConfig("file.my");

			assert.deepStrictEqual(config.languageOptions, {
				foo: 42,
				bar: 43,
			});
		});

		it("should use configured languageOptions when default languageOptions are not specified", async () => {
			const configs = createLanguageTestConfig({
				plugins: {
					test: {
						languages: {
							my: {
								validateLanguageOptions() {},
							},
						},
					},
				},
				language: "test/my",
				languageOptions: {
					bar: 43,
				},
			});

			configs.normalizeSync();

			const config = configs.getConfig("file.my");

			assert.deepStrictEqual(config.languageOptions, { bar: 43 });
		});

		it("should default to an empty object if neither configured nor default languageOptions are specified", async () => {
			const configs = createLanguageTestConfig({
				plugins: {
					test: {
						languages: {
							my: {
								validateLanguageOptions() {},
							},
						},
					},
				},
				language: "test/my",
			});

			configs.normalizeSync();

			const config = configs.getConfig("file.my");

			assert.isObject(config.languageOptions);
			assert.strictEqual(Object.keys(config.languageOptions).length, 0);
		});

describe("ecmaVersion", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: "true",
							},
						},
					],
					/Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
				);
			});

			it("should merge two objects when second object has overrides", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: 2019,
							},
						},
						{
							languageOptions: {
								ecmaVersion: 2021,
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							ecmaVersion: 2021,
						},
					},
				));

			it("should merge an object and undefined into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: 2021,
							},
						},
						{},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							ecmaVersion: 2021,
						},
					},
				));

			it("should merge undefined and an object into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{},
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: 2021,
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							ecmaVersion: 2021,
						},
					},
				));
		});

describe("sourceType", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								sourceType: "true",
							},
						},
					],
					'Expected "script", "module", or "commonjs".',
				);
			});

			it("should merge two objects when second object has overrides", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								sourceType: "module",
							},
						},
						{
							languageOptions: {
								sourceType: "script",
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							sourceType: "script",
							parserOptions: {
								sourceType: "script",
							},
						},
					},
				));

			it("should merge an object and undefined into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								sourceType: "script",
							},
						},
						{},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							sourceType: "script",
							parserOptions: {
								sourceType: "script",
							},
						},
					},
				));

			it("should merge undefined and an object into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{},
						{
							language: "@/js",
							languageOptions: {
								sourceType: "module",
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							sourceType: "module",
						},
					},
				));
		});

describe("globals", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: "true",
							},
						},
					],
					"Expected an object.",
				);
			});

			it("should error when an unexpected key value is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: {
									foo: "truex",
								},
							},
						},
					],
					'Key "foo": Expected "readonly", "writable", or "off".',
				);
			});

			it("should error when a global has leading whitespace", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: {
									" foo": "readonly",
								},
							},
						},
					],
					/Global " foo" has leading or trailing whitespace/u,
				);
			});

			it("should error when a global has trailing whitespace", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: {
									"foo ": "readonly",
								},
							},
						},
					],
					/Global "foo " has leading or trailing whitespace/u,
				);
			});

			it("should merge two objects when second object has different keys", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: {
									foo: "readonly",
								},
							},
						},
						{
							languageOptions: {
								globals: {
									bar: "writable",
								},
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "readonly",
								bar: "writable",
							},
						},
					},
				));

			it("should merge two objects when second object has overrides", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: {
									foo: null,
								},
							},
						},
						{
							languageOptions: {
								globals: {
									foo: "writeable",
								},
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "writeable",
							},
						},
					},
				));

			it("should merge an object and undefined into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: {
									foo: "readable",
								},
							},
						},
						{},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "readable",
							},
						},
					},
				));

			it("should merge undefined and an object into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{},
						{
							language: "@/js",
							languageOptions: {
								globals: {
									foo: "false",
								},
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "false",
							},
						},
					},
				));

			it("should merge string and an object into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: "foo",
							},
						},
						{
							languageOptions: {
								globals: {
									foo: "false",
								},
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "false",
							},
						},
					},
				));
		});

describe("parser", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								parser: true,
							},
						},
					],
					'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				);
			});

			it("should error when a null is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								parser: null,
							},
						},
					],
					'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				);
			});

			it("should error when a parser is a string", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								parser: "foo/bar",
							},
						},
					],
					'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				);
			});

			it("should error when a value doesn't have a parse() method", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								parser: {},
							},
						},
					],
					'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				);
			});

			it("should merge two objects when second object has overrides", () => {
				const parser = { parse() {} };
				const stubParser = { parse() {} };

				return verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								parser,
							},
						},
						{
							languageOptions: {
								parser: stubParser,
							},
						},
					],
					{
						plugins: {
							...baseConfig.plugins,
						},
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parser: stubParser,
						},
					},
				);
			});

			it("should merge an object and undefined into one object", () => {
				const stubParser = { parse() {} };

				return verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								parser: stubParser,
							},
						},
						{},
					],
					{
						plugins: {
							...baseConfig.plugins,
						},
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parser: stubParser,
						},
					},
				);
			});

			it("should merge undefined and an object into one object", () => {
				const stubParser = { parse() {} };

				return verifyLanguageOptionsMerging(
					[
						{},
						{
							language: "@/js",
							languageOptions: {
								parser: stubParser,
							},
						},
					],
					{
						plugins: {
							...baseConfig.plugins,
						},
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parser: stubParser,
						},
					},
				);
			});
		});

describe("parserOptions", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								parserOptions: "true",
							},
						},
					],
					"Expected an object.",
				);
			});

			it("should merge two objects when second object has different keys", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								parserOptions: {
									foo: "whatever",
								},
							},
						},
						{
							languageOptions: {
								parserOptions: {
									bar: "baz",
								},
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parserOptions: {
								foo: "whatever",
								bar: "baz",
								sourceType: "module",
							},
						},
					},
				));

			it("should deeply merge two objects when second object has different keys", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								parserOptions: {
									ecmaFeatures: {
										jsx: true,
									},
								},
							},
						},
						{
							languageOptions: {
								parserOptions: {
									ecmaFeatures: {
										globalReturn: true,
									},
								},
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parserOptions: {
								ecmaFeatures: {
									jsx: true,
									globalReturn: false,
								},
								sourceType: "module",
							},
						},
					},
				));

			it("should deeply merge two objects when second object has missing key", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								parserOptions: {
									ecmaFeatures: {
										jsx: true,
									},
								},
							},
						},
						{
							languageOptions: {
								ecmaVersion: 2021,
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							ecmaVersion: 2021,
							parserOptions: {
								ecmaFeatures: {
									jsx: true,
								},
								sourceType: "module",
							},
						},
					},
				));

			it("should merge two objects when second object has overrides", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								parserOptions: {
									foo: "whatever",
								},
							},
						},
						{
							languageOptions: {
								parserOptions: {
									foo: "bar",
								},
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parserOptions: {
								foo: "bar",
								sourceType: "module",
							},
						},
					},
				));

			it("should merge an object and undefined into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{
							language: "@/js",
							languageOptions: {
								parserOptions: {
									foo: "whatever",
								},
							},
						},
						{},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parserOptions: {
								foo: "whatever",
								sourceType: "module",
							},
						},
					},
				));

			it("should merge undefined and an object into one object", () =>
				verifyLanguageOptionsMerging(
					[
						{},
						{
							language: "@/js",
							languageOptions: {
								parserOptions: {
									foo: "bar",
								},
							},
						},
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parserOptions: {
								foo: "bar",
								sourceType: "module",
							},
						},
					},
				));
		});
	});

describe("rules", () => {
		it("should error when an unexpected value is found", async () => {
			await assertInvalidConfig(
				[
					{
						rules: true,
					},
				],
				"Expected an object.",
			);
		});

		it("should error when an invalid rule severity is set", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							foo: true,
						},
					},
				],
				'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
			);
		});

		it("should error when an invalid rule severity of the right type is set", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							foo: 3,
						},
					},
				],
				'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
			);
		});

		it("should error when a string rule severity is not in lowercase", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							foo: "Error",
						},
					},
				],
				'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
			);
		});

		it("should error when an invalid rule severity is set in an array", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							foo: [true],
						},
					},
				],
				'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
			);
		});

		it("should error when rule doesn't exist", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							foox: [1, "bar"],
						},
					},
				],
				/Key "rules": Key "foox": Could not find "foox" in plugin "@"./u,
			);
		});

		it("should error and suggest alternative when rule doesn't exist", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							"test2/match": "error",
						},
					},
				],
				/Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
			);
		});

		it("should error when plugin for rule doesn't exist", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							"doesnt-exist/match": "error",
						},
					},
				],
				/Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
			);
		});

		it("should error when rule options don't match schema", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							foo: [1, "bar"],
						},
					},
				],
				/Value "bar" should be equal to one of the allowed values/u,
			);
		});

		it("should error when rule options don't match schema requiring at least one item", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							foo2: 1,
						},
					},
				],
				/Value \[\] should NOT have fewer than 1 items/u,
			);
		});

		[null, true, 0, 1, "", "always", () => {}].forEach(schema => {
			it(`should error with a message that contains the rule name when a configured rule has invalid \`meta.schema\` (${schema})`, async () => {
				await verifyRuleWithInvalidSchema({
					plugins: {
						foo: {
							rules: {
								bar: {
									meta: {
										schema,
									},
								},
							},
						},
					},
					rules: {
						"foo/bar": "error",
					},
				}, "Error while processing options validation schema of rule 'foo/bar': Rule's `meta.schema` must be an array or object");
			});
		});

		it("should error with a message that contains the rule name when a configured rule has invalid `meta.schema` (invalid JSON Schema definition)", async () => {
			await verifyRuleWithInvalidSchema({
				plugins: {
					foo: {
						rules: {
							bar: {
								meta: {
									schema: { minItems: [] },
								},
							},
						},
					},
				},
				rules: {
					"foo/bar": "error",
				},
			}, "Error while processing options validation schema of rule 'foo/bar': minItems must be number");
		});

		it("should allow rules with `schema:false` to have any configurations", async () => {
			const configs = new FlatConfigArray([
				{
					plugins: {
						foo: {
							rules: {
								bar: {
									meta: {
										schema: false,
									},
									create() {
										return {};
									},
								},
								baz: {
									meta: {
										schema: false,
									},
									create() {
										return {};
									},
								},
							},
						},
					},
				},
				{
					rules: {
						"foo/bar": "error",
						"foo/baz": ["error", "always"],
					},
				},
			]);

			configs.normalizeSync();

			// does not throw
			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.rules, {
				"foo/bar": [2],
				"foo/baz": [2, "always"],
			});
		});

		it("should allow rules without `meta` to be configured without options", async () => {
			const configs = createRuleConfigWithSchema("foo", "bar", false);
			configs.normalizeSync();
			const config = configs.getConfig("foo.js");
			assert.deepStrictEqual(config.rules, {
				"foo/bar": [2],
			});
		});

		it("should allow rules without `meta.schema` to be configured without options", async () => {
			const configs = new FlatConfigArray([
				{
					plugins: {
						foo: {
							rules: {
								meta: {},
								bar: {
									create() {
										return {};
									},
								},
							},
						},
					},
				},
				{
					rules: {
						"foo/bar": "error",
					},
				},
			]);

			configs.normalizeSync();

			// does not throw
			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.rules, {
				"foo/bar": [2],
			});
		});

		it("should throw if a rule without `meta` is configured with an option", async () => {
			await verifyRuleSchemaValidation([
				{
					plugins: {
						foo: {
							rules: {
								bar: {
									create() {
										return {};
									},
								},
							},
						},
					},
				},
				{
					rules: {
						"foo/bar": ["error", "always"],
					},
				},
			], /should NOT have more than 0 items/u);
		});

		it("should throw if a rule without `meta.schema` is configured with an option", async () => {
			await verifyRuleSchemaValidation([
				{
					plugins: {
						foo: {
							rules: {
								bar: {
									meta: {},
									create() {
										return {};
									},
								},
							},
						},
					},
				},
				{
					rules: {
						"foo/bar": ["error", "always"],
					},
				},
			], /should NOT have more than 0 items/u);
		});

		it("should merge two objects", () =>
			verifyRuleMerging(
				[
					{
						rules: {
							foo: 1,
							bar: "error",
						},
					},
					{
						rules: {
							baz: "warn",
							boom: 0,
						},
					},
				],
				{
					foo: [1],
					bar: [2],
					baz: [1],
					boom: [0],
				},
			));

		it("should merge two objects when second object has simple overrides", () =>
			verifyRuleMerging(
				[
					{
						rules: {
							foo: [1, "always"],
							bar: "error",
						},
					},
					{
						rules: {
							foo: "error",
							bar: 0,
						},
					},
				],
				{
					plugins: baseConfig.plugins,
					rules: {
						foo: [2, "always"],
						bar: [0],
					},
				},
			));

		it("should merge two objects when second object has array overrides", () =>
			verifyRuleMerging(
				[
					{
						rules: {
							foo: 1,
							foo2: "error",
						},
					},
					{
						rules: {
							foo: ["error", "never"],
							foo2: ["warn", "foo"],
						},
					},
				],
				{
					plugins: baseConfig.plugins,
					rules: {
						foo: [2, "never"],
						foo2: [1, "foo"],
					},
				},
			));

		it("should merge two objects and options when second object overrides without options", () =>
			verifyRuleMerging(
				[
					{
						rules: {
							foo: [1, "always"],
							bar: "error",
						},
					},
					{
						plugins: {
							"@foo/baz/boom": {
								rules: {
									bang: {},
								},
							},
						},
						rules: {
							foo: ["error"],
							bar: 0,
							"@foo/baz/boom/bang": "error",
						},
					},
				],
				{
					plugins: {
						...baseConfig.plugins,
						"@foo/baz/boom": {
							rules: {
								bang: {},
							},
						},
					},
					rules: {
						foo: [2, "always"],
						bar: [0],
						"@foo/baz/boom/bang": [2],
					},
				},
			));

		it("should merge an object and undefined into one object", () =>
			verifyRuleMerging(
				[
					{
						rules: {
							foo: 0,
							bar: 1,
						},
					},
					{},
				],
				{
					plugins: baseConfig.plugins,
					rules: {
						foo: [0],
						bar: [1],
					},
				},
			));

		it("should merge a rule that doesn't exist without error when the rule is off", () =>
			verifyRuleMerging(
				[
					{
						rules: {
							foo: 0,
							bar: 1,
						},
					},
					{
						rules: {
							nonExistentRule: 0,
							nonExistentRule2: ["off", "bar"],
						},
					},
				],
				{
					plugins: baseConfig.plugins,
					rules: {
						foo: [0],
						bar: [1],
						nonExistentRule: [0],
						nonExistentRule2: [0, "bar"],
					},
				},
			));

		it("should error show expected properties", async () => {
			await assertInvalidConfig(
				[
					{
						rules: {
							"prefer-const": ["error", { destruct: true }],
						},
					},
				],
				'Unexpected property "destruct". Expected properties: "destructuring", "ignoreReadBeforeAssign"',
			);

			await assertInvalidConfig(
				[
					{
						rules: {
							"prefer-destructuring": [
								"error",
								{ obj: true },
							],
						},
					},
				],
				'Unexpected property "obj". Expected properties: "VariableDeclarator", "AssignmentExpression"',
			);

			await assertInvalidConfig(
				[
					{
						rules: {
							"prefer-destructuring": [
								"error",
								{ obj: true },
							],
						},
					},
				],
				'Unexpected property "obj". Expected properties: "array", "object"',
			);

			await assertInvalidConfig(
				[
					{
						rules: {
							"prefer-destructuring": [
								"error",
								{ object: true },
								{ enforceRenamedProperties: true },
							],
						},
					},
				],
				'Unexpected property "enforceRenamedProperties". Expected properties: "enforceForRenamedProperties"',
			);
		});
	});

describe("Invalid Keys", () => {
		[
			"env",
			"extends",
			"globals",
			"ignorePatterns",
			"noInlineConfig",
			"overrides",
			"parser",
			"parserOptions",
			"reportUnusedDisableDirectives",
			"root",
		].forEach(key => {
			it(`should error when a ${key} key is found`, async () => {
				await assertInvalidConfig(
					[
						{
							[key]: "foo",
						},
					],
					`Key "${key}": This appears to be in eslintrc format rather than flat config format.`,
				);
			});
		});

		it("should error when plugins is an array", async () => {
			await assertInvalidConfig(
				[
					{
						plugins: ["foo"],
					},
				],
				'Key "plugins": This appears to be in eslintrc format (array of strings) rather than flat config format (object).',
			);
		});
	});

	// https://github.com/eslint/eslint/issues/12592
describe("Shared references between rule configs", () => {
		it("shared rule config should not cause a rule validation error", () => {
			const ruleConfig = ["error", {}];

			const configs = new FlatConfigArray([
				{
					rules: {
						camelcase: ruleConfig,
						"default-case": ruleConfig,
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.rules, {
				camelcase: [
					2,
					{
						allow: [],
						ignoreDestructuring: false,
						ignoreGlobals: false,
						ignoreImports: false,
						properties: "always",
					},
				],
				"default-case": [2, {}],
			});
		});

		it("should throw rule validation error for camelcase", async () => {
			const ruleConfig = ["error", {}];

			const configs = new FlatConfigArray([
				{
					rules: {
						camelcase: ruleConfig,
					},
				},
				{
					rules: {
						"default-case": ruleConfig,

						camelcase: [
							"error",
							{
								ignoreDestructuring: Date,
							},
						],
					},
				},
			]);

			configs.normalizeSync();

			// exact error may differ based on structuredClone implementation so just test prefix
			assert.throws(() => {
				configs.getConfig("foo.js");
			}, /Key "rules": Key "camelcase":/u);
		});
	});
});
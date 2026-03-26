Looking at this test file, I can identify several opportunities to reduce complexity and duplication:

1. **Repeated serialization test patterns** - Many tests follow the same pattern of creating configs, normalizing, getting config, and asserting JSON output
2. **Repeated async error test patterns** - The sync/async error tests for null/undefined configs are nearly identical
3. **Repeated parser/processor test structures** - Similar test structures for named/versioned parsers and processors
4. **Inline config arrays** - Many tests use inline single-element arrays that could be simplified

Here's the refactored code:

```javascript
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
							items: [{ enum: ["always", "never"] }],
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
													array: { type: "boolean" },
													object: { type: "boolean" },
												},
												additionalProperties: false,
											},
											AssignmentExpression: {
												type: "object",
												properties: {
													array: { type: "boolean" },
													object: { type: "boolean" },
												},
												additionalProperties: false,
											},
										},
										additionalProperties: false,
									},
									{
										type: "object",
										properties: {
											array: { type: "boolean" },
											object: { type: "boolean" },
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
							items: { type: "string" },
							uniqueItems: true,
							minItems: 1,
						},
					},
				},
			},
		},
		test1: {
			rules: { match: {} },
		},
		test2: {
			rules: { nomatch: {} },
		},
	},
};

/** Default expected languageOptions for JS configs */
const defaultLanguageOptions = {
	ecmaVersion: LATEST_ECMA_VERSION,
	sourceType: "module",
	parser: `espree@${espree.version}`,
	parserOptions: { sourceType: "module" },
};

/** Default expected linterOptions */
const defaultLinterOptions = {
	reportUnusedDisableDirectives: 1,
};

/**
 * Creates a config array with the correct default options.
 * @param {*[]} configs An array of configs to use in the config array.
 * @returns {FlatConfigArray} The config array
 */
function createFlatConfigArray(configs) {
	return new FlatConfigArray(configs, {
		baseConfig: [baseConfig],
	});
}

/**
 * Asserts that a given set of configs will be merged into the given result config.
 * @param {*[]} values An array of configs to use in the config array.
 * @param {Object} result The expected merged result of the configs.
 * @returns {Promise<void>}
 */
async function assertMergedResult(values, result) {
	const configs = createFlatConfigArray(values);

	await configs.normalize();

	const config = configs.getConfig("foo.js");

	if (!result.language) {
		result.language = jslang;
	}

	if (!result.languageOptions) {
		result.languageOptions = jslang.normalizeLanguageOptions(
			jslang.defaultLanguageOptions,
		);
	}

	assert.deepStrictEqual(config, result);
}

/**
 * Asserts that a given set of configs results in an invalid config.
 * @param {*[]} values An array of configs to use in the config array.
 * @param {string|RegExp} message The expected error message.
 * @returns {Promise<void>}
 */
async function assertInvalidConfig(values, message) {
	const configs = createFlatConfigArray(values);

	assert.throws(() => {
		configs.normalizeSync();
		configs.getConfig("foo.js");
	}, message);
}

/**
 * Creates and normalizes a FlatConfigArray, returning the config for "foo.js".
 * @param {*[]} configs Configs to use.
 * @returns {{ config: Object }} The normalized config
 */
function createNormalizedConfig(configs) {
	const configArray = new FlatConfigArray(configs);
	configArray.normalizeSync();
	return configArray.getConfig("foo.js");
}

/**
 * Asserts that a serialized config matches the expected value.
 * @param {*[]} configs Configs to use.
 * @param {Object} expected Expected JSON output.
 */
function assertSerializedConfig(configs, expected) {
	const config = createNormalizedConfig(configs);
	const actual = config.toJSON();

	assert.deepStrictEqual(actual, expected);
	assert.strictEqual(stringify(actual), stringify(expected));
}

/**
 * Asserts that config.toJSON() throws with the given message.
 * @param {*[]} configs Configs to use.
 * @param {string|RegExp} message Expected error message.
 */
function assertSerializationThrows(configs, message) {
	const config = createNormalizedConfig(configs);
	assert.throws(() => config.toJSON(), message);
}

/**
 * Builds a standard expected serialized config object.
 * @param {Object} overrides Properties to override in the default expected config.
 * @returns {Object} Expected config object.
 */
function buildExpectedSerializedConfig(overrides = {}) {
	return {
		plugins: ["@"],
		language: "@/js",
		languageOptions: defaultLanguageOptions,
		linterOptions: defaultLinterOptions,
		processor: void 0,
		...overrides,
	};
}

/**
 * Builds a standard expected serialized config with a custom parser string.
 * @param {string} parserString The parser identifier string.
 * @returns {Object} Expected config object.
 */
function buildExpectedConfigWithParser(parserString) {
	return buildExpectedSerializedConfig({
		languageOptions: {
			ecmaVersion: LATEST_ECMA_VERSION,
			parser: parserString,
			parserOptions: {},
			sourceType: "module",
		},
	});
}

/**
 * Builds a standard expected serialized config with a custom processor string.
 * @param {string} processorString The processor identifier string.
 * @returns {Object} Expected config object.
 */
function buildExpectedConfigWithProcessor(processorString) {
	return buildExpectedSerializedConfig({
		processor: processorString,
	});
}

/**
 * Asserts both sync and async error behavior for invalid configs.
 * @param {Function} createConfigs Function that returns a FlatConfigArray.
 * @param {string} expectedMessage Expected error message.
 */
async function assertSyncAndAsyncThrows(createConfigs, expectedMessage) {
	const syncConfigs = createConfigs();
	assert.throws(() => {
		syncConfigs.normalizeSync();
	}, expectedMessage);

	const asyncConfigs = createConfigs();
	try {
		await asyncConfigs.normalize();
		assert.fail("Error not thrown");
	} catch (error) {
		assert.strictEqual(error.message, expectedMessage);
	}
}

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("FlatConfigArray", () => {
	it("should allow noniterable baseConfig objects", () => {
		const configs = new FlatConfigArray([], {
			baseConfig: {
				languageOptions: {
					parserOptions: { foo: true },
				},
			},
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
						languages: { js: jslang },
					},
				},
				language: "@/js",
				languageOptions: {
					parserOptions: { foo: true },
				},
			},
		];

		const configs = new FlatConfigArray([], { baseConfig: base });
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
			assertSerializedConfig(
				[{ plugins: { a: {}, b: {} } }],
				buildExpectedSerializedConfig({ plugins: ["@", "a", "b"] }),
			);
		});

		it("should convert config with plugin name/version into normalized JSON object", () => {
			assertSerializedConfig(
				[
					{
						plugins: {
							a: {},
							b: { name: "b-plugin", version: "2.3.1" },
						},
					},
				],
				buildExpectedSerializedConfig({
					plugins: ["@", "a", "b:b-plugin@2.3.1"],
				}),
			);
		});

		it("should convert config with plugin meta into normalized JSON object", () => {
			assertSerializedConfig(
				[
					{
						plugins: {
							a: {},
							b: { meta: { name: "b-plugin", version: "2.3.1" } },
						},
					},
				],
				buildExpectedSerializedConfig({
					plugins: ["@", "a", "b:b-plugin@2.3.1"],
				}),
			);
		});

		it("should convert config with languageOptions.globals.name into normalized JSON object", () => {
			assertSerializedConfig(
				[{ languageOptions: { globals: { name: "off" } } }],
				buildExpectedSerializedConfig({
					languageOptions: {
						...defaultLanguageOptions,
						globals: { name: "off" },
					},
				}),
			);
		});

		it("should serialize languageOptions as an empty object if neither configured nor default languageOptions are specified", () => {
			const configArray = new FlatConfigArray([
				{
					files: ["**/*.my"],
					plugins: {
						test: {
							languages: {
								my: { validateLanguageOptions() {} },
							},
						},
					},
					language: "test/my",
				},
			]);

			configArray.normalizeSync();

			const config = configArray.getConfig("file.my");
			const expected = {
				plugins: ["@", "test"],
				language: "test/my",
				languageOptions: {},
				linterOptions: defaultLinterOptions,
				processor: void 0,
			};
			const actual = config.toJSON();

			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
		});

		describe("parser serialization errors", () => {
			const SERIALIZE_PARSE_ERROR = /Cannot serialize key "parse"/u;

			it("should throw when config has unnamed parser object", () => {
				assertSerializationThrows(
					[{ languageOptions: { parser: { parse() {} } } }],
					SERIALIZE_PARSE_ERROR,
				);
			});

			it("should throw when config has unnamed parser with empty meta object", () => {
				assertSerializationThrows(
					[{ languageOptions: { parser: { meta: {}, parse() {} } } }],
					SERIALIZE_PARSE_ERROR,
				);
			});

			it("should throw when config has unnamed parser with only meta version", () => {
				assertSerializationThrows(
					[
						{
							languageOptions: {
								parser: {
									meta: { version: "0.1.1" },
									parse() {},
								},
							},
						},
					],
					SERIALIZE_PARSE_ERROR,
				);
			});
		});

		describe("named parser serialization", () => {
			it("should not throw when config has named parser (meta.name only)", () => {
				const config = createNormalizedConfig([
					{
						languageOptions: {
							parser: { meta: { name: "custom-parser" }, parse() {} },
						},
					},
				]);

				assert.deepStrictEqual(
					config.toJSON(),
					buildExpectedConfigWithParser("custom-parser"),
				);
			});

			it("should not throw when config has named and versioned parser (meta)", () => {
				const config = createNormalizedConfig([
					{
						languageOptions: {
							parser: {
								meta: { name: "custom-parser", version: "0.1.0" },
								parse() {},
							},
						},
					},
				]);

				assert.deepStrictEqual(
					config.toJSON(),
					buildExpectedConfigWithParser("custom-parser@0.1.0"),
				);
			});

			it("should not throw when config has meta-named and versioned parser (mixed)", () => {
				const config = createNormalizedConfig([
					{
						languageOptions: {
							parser: {
								meta: { name: "custom-parser" },
								version: "0.1.0",
								parse() {},
							},
						},
					},
				]);

				assert.deepStrictEqual(
					config.toJSON(),
					buildExpectedConfigWithParser("custom-parser@0.1.0"),
				);
			});

			it("should not throw when config has named and versioned parser (outside meta)", () => {
				const config = createNormalizedConfig([
					{
						languageOptions: {
							parser: {
								name: "custom-parser",
								version: "0.1.0",
								parse() {},
							},
						},
					},
				]);

				assert.deepStrictEqual(
					config.toJSON(),
					buildExpectedConfigWithParser("custom-parser@0.1.0"),
				);
			});
		});

		describe("processor serialization errors", () => {
			const SERIALIZE_PROCESSOR_ERROR = /Could not serialize processor/u;
			const stubProcessor = {
				preprocess() {},
				postprocess() {},
			};

			it("should throw when config has unnamed processor object", () => {
				assertSerializationThrows(
					[{ processor: { ...stubProcessor } }],
					SERIALIZE_PROCESSOR_ERROR,
				);
			});

			it("should throw when config has processor with empty meta object", () => {
				assertSerializationThrows(
					[{ processor: { meta: {}, ...stubProcessor } }],
					SERIALIZE_PROCESSOR_ERROR,
				);
			});
		});

		describe("named processor serialization", () => {
			const preprocess = () => {};
			const postprocess = () => {};

			it("should not throw when config has named processor (meta.name)", () => {
				const config = createNormalizedConfig([
					{
						processor: {
							meta: { name: "custom-processor" },
							preprocess,
							postprocess,
						},
					},
				]);

				assert.deepStrictEqual(
					config.toJSON(),
					buildExpectedConfigWithProcessor("custom-processor"),
				);
			});

			it("should not throw when config has named processor (no meta)", () => {
				const config = createNormalizedConfig([
					{
						processor: {
							name: "custom-processor",
							preprocess,
							postprocess,
						},
					},
				]);

				assert.deepStrictEqual(
					config.toJSON(),
					buildExpectedConfigWithProcessor("custom-processor"),
				);
			});

			it("should not throw when config has named and versioned processor (meta)", () => {
				const config = createNormalizedConfig([
					{
						processor: {
							meta: { name: "custom-processor", version: "1.2.3" },
							preprocess,
							postprocess,
						},
					},
				]);

				assert.deepStrictEqual(
					config.toJSON(),
					buildExpectedConfigWithProcessor("custom-processor@1.2.3"),
				);
			});

			it("should not throw when config has named and versioned processor (no meta)", () => {
				const config = createNormalizedConfig([
					{
						processor: {
							name: "custom-processor",
							version: "1.2.3",
							preprocess,
							postprocess,
						},
					},
				]);

				assert.deepStrictEqual(
					config.toJSON(),
					buildExpectedConfigWithProcessor("custom-processor@1.2.3"),
				);
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

		it("should throw an error when undefined original config is normalized", async () => {
			await assertSyncAndAsyncThrows(
				() => new FlatConfigArray([void 0]),
				"Config (unnamed): Unexpected undefined config at original index 0.",
			);
		});

		it("should throw an error when null original config is normalized", async () => {
			await assertSyncAndAsyncThrows(
				() => new FlatConfigArray([null]),
				"Config (unnamed): Unexpected null config at original index 0.",
			);
		});

		it("should throw an error when undefined base config is normalized", async () => {
			await assertSyncAndAsyncThrows(
				() => new FlatConfigArray([], { baseConfig: [void 0] }),
				"Config (unnamed): Unexpected undefined config at base index 0.",
			);
		});

		it("should throw an error when null base config is normalized", async () => {
			await assertSyncAndAsyncThrows(
				() => new FlatConfigArray([], { baseConfig: [null] }),
				"Config (unnamed): Unexpected null config at base index 0.",
			);
		});

		it("should throw an error when undefined user-defined config is normalized", async () => {
			await assertSyncAndAsyncThrows(() => {
				const configs = new FlatConfigArray([]);
				configs.push(void 0);
				return configs;
			}, "Config (unnamed): Unexpected undefined config at user-defined index 0.");
		});

		it("should throw an error when null user-defined config is normalized", async () => {
			await assertSyncAndAsyncThrows(() => {
				const configs = new FlatConfigArray([]);
				configs.push(null);
				return configs;
			}, "Config (unnamed): Unexpected null config at user-defined index 0.");
		});
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			it("should merge two objects", () =>
				assertMergedResult(
					[
						{ settings: { a: true, b: false } },
						{ settings: { c: true, d: false } },
					],
					{
						plugins: baseConfig.plugins,
						settings: { a: true, b: false, c: true, d: false },
					},
				));

			it("should merge two objects when second object has overrides", () =>
				assertMergedResult(
					[
						{ settings: { a: true, b: false, d: [1, 2], e: [5, 6] } },
						{ settings: { c: true, a: false, d: [3, 4] } },
					],
					{
						plugins: baseConfig.plugins,
						settings: { a: false, b: false, c: true, d: [3, 4], e: [5, 6] },
					},
				));

			it("should deeply merge two objects when second object has overrides", () =>
				assertMergedResult(
					[
						{ settings: { object: { a: true, b: false } } },
						{ settings: { object: { c: true, a: false } } },
					],
					{
						plugins: baseConfig.plugins,
						settings: { object: { a: false, b: false, c: true } },
					},
				));

			it("should merge an object and undefined into one object", () =>
				assertMergedResult(
					[{ settings: { a: true, b: false } }, {}],
					{
						plugins: baseConfig.plugins,
						settings: { a: true, b: false },
					},
				));

			it("should merge undefined and an object into one object", () =>
				assertMergedResult(
					[{}, { settings: { a: true, b: false } }],
					{
						plugins: baseConfig.plugins,
						settings: { a: true, b: false },
					},
				));
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			it("should merge two objects", () =>
				assertMergedResult(
					[
						{ plugins: { a: pluginA, b: pluginB } },
						{ plugins: { c: pluginC } },
					],
					{
						plugins: { a: pluginA, b: pluginB, c: pluginC, ...baseConfig.plugins },
					},
				));

			it("should merge an object and undefined into one object", () =>
				assertMergedResult(
					[{ plugins: { a: pluginA, b: pluginB } }, {}],
					{
						plugins: { a: pluginA, b: pluginB, ...baseConfig.plugins },
					},
				));

			it("should error when attempting to redefine a plugin", async () => {
				await assertInvalidConfig(
					[
						{ plugins: { a: pluginA, b: pluginB } },
						{ plugins: { a: pluginC } },
					],
					'Cannot redefine plugin "a".',
				);
			});

			it("should error when plugin is not an object", async () => {
				await assertInvalidConfig(
					[{ plugins: { a: true } }],
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

				return assertMergedResult(
					[
						{ processor: { preprocess() {}, postprocess() {} } },
						{
							plugins: {
								markdown: {
									processors: { markdown: stubProcessor },
								},
							},
							processor: "markdown/markdown",
						},
					],
					{
						plugins: {
							markdown: { processors: { markdown: stubProcessor } },
							...baseConfig.plugins,
						},
						processor: stubProcessor,
					},
				);
			});

			it("should merge two values when second is an object", () => {
				const processor = { preprocess() {}, postprocess() {} };

				return assertMergedResult(
					[
						{ processor: "markdown/markdown" },
						{ processor },
					],
					{
						plugins: baseConfig.plugins,
						processor,
					},
				);
			});

			it("should error when an invalid string is used", async () => {
				await assertInvalidConfig(
					[{ processor: "foo" }],
					"pluginName/objectName",
				);
			});

			it("should error when an empty string is used", async () => {
				await assertInvalidConfig(
					[{ processor: "" }],
					"pluginName/objectName",
				);
			});

			it("should error when an invalid processor is used", async () => {
				await assertInvalidConfig(
					[{ processor: {} }],
					"Object must have a preprocess() and a postprocess() method.",
				);
			});

			it("should error when a processor cannot be found in a plugin", async () => {
				await assertInvalidConfig(
					[{ plugins: { foo: {} }, processor: "foo/bar" }],
					/Could not find "bar" in plugin "foo"/u,
				);
			});
		});

		describe("linterOptions", () => {
			it("should error when an unexpected key is found", async () => {
				await assertInvalidConfig(
					[{ linterOptions: { foo: true } }],
					'Unexpected key "foo" found.',
				);
			});

			describe("noInlineConfig", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[{ linterOptions: { noInlineConfig: "true" } }],
						"Expected a Boolean.",
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{ linterOptions: { noInlineConfig: true } },
							{ linterOptions: { noInlineConfig: false } },
						],
						{
							plugins: baseConfig.plugins,
							linterOptions: { noInlineConfig: false },
						},
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[{ linterOptions: { noInlineConfig: false } }, {}],
						{
							plugins: baseConfig.plugins,
							linterOptions: { noInlineConfig: false },
						},
					));

				it("should merge undefined and an object into one object", () =>
					assertMergedResult(
						[{}, { linterOptions: { noInlineConfig: false } }],
						{
							plugins: baseConfig.plugins,
							linterOptions: { noInlineConfig: false },
						},
					));
			});

			describe("reportUnusedDisableDirectives", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[{ linterOptions: { reportUnusedDisableDirectives: {} } }],
						/Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{ linterOptions: { reportUnusedDisableDirectives: "off" } },
							{ linterOptions: { reportUnusedDisableDirectives: "warn" } },
						],
						{
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedDisableDirectives: 1 },
						},
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[{}, { linterOptions: { reportUnusedDisableDirectives: "warn" } }],
						{
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedDisableDirectives: 1 },
						},
					));
			});

			describe("reportUnusedInlineConfigs", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[{ linterOptions: { reportUnusedInlineConfigs: {} } }],
						/Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{ linterOptions: { reportUnusedInlineConfigs: "off" } },
							{ linterOptions: { reportUnusedInlineConfigs: "warn" } },
						],
						{
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedInlineConfigs: 1 },
						},
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[{}, { linterOptions: { reportUnusedInlineConfigs: "warn" } }],
						{
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedInlineConfigs: 1 },
						},
					));
			});
		});

		describe("languageOptions", () => {
			it("should error when an unexpected key is found", async () => {
				await assertInvalidConfig(
					[{ language: "@/js", languageOptions: { foo: true } }],
					'Unexpected key "foo" found.',
				);
			});

			it("should merge two languageOptions objects with different properties", () =>
				assertMergedResult(
					[
						{ language: "@/js", languageOptions: { ecmaVersion: 2019 } },
						{ languageOptions: { sourceType: "commonjs" } },
					],
					{
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							ecmaVersion: 2019,
							sourceType: "commonjs",
							parserOptions: { sourceType: "commonjs" },
						},
					},
				));

			it("should get default languageOptions from the language", async () => {
				const configs = new FlatConfigArray([
					{
						files: ["**/*.my"],
						plugins: {
							test: {
								languages: {
									my: {
										defaultLanguageOptions: { foo: 42 },
										validateLanguageOptions() {},
									},
								},
							},
						},
						language: "test/my",
					},
				]);

				await configs.normalize();

				const config = configs.getConfig("file.my");
				assert.deepStrictEqual(config.languageOptions, { foo: 42 });
			});

			it("should merge configured languageOptions over default languageOptions from the language", async () => {
				const configs = new FlatConfigArray([
					{
						files: ["**/*.my"],
						plugins: {
							test: {
								languages: {
									my: {
										defaultLanguageOptions: { foo: 42, bar: 42 },
										validateLanguageOptions() {},
									},
								},
							},
						},
						language: "test/my",
						languageOptions: { bar: 43 },
					},
				]);

				await configs.normalize();

				const config = configs.getConfig("file.my");
				assert.deepStrictEqual(config.languageOptions, { foo: 42, bar: 43 });
			});

			it("should use configured languageOptions when default languageOptions are not specified", async () => {
				const configs = new FlatConfigArray([
					{
						files: ["**/*.my"],
						plugins: {
							test: {
								languages: {
									my: { validateLanguageOptions() {} },
								},
							},
						},
						language: "test/my",
						languageOptions: { bar: 43 },
					},
				]);

				await configs.normalize();

				const config = configs.getConfig("file.my");
				assert.deepStrictEqual(config.languageOptions, { bar: 43 });
			});

			it("should default to an empty object if neither configured nor default languageOptions are specified", async () => {
				const configs = new FlatConfigArray([
					{
						files: ["**/*.my"],
						plugins: {
							test: {
								languages: {
									my: { validateLanguageOptions() {} },
								},
							},
						},
						language: "test/my",
					},
				]);

				await configs.normalize();

				const config = configs.getConfig("file.my");
				assert.isObject(config.languageOptions);
				assert.strictEqual(Object.keys(config.languageOptions).length, 0);
			});

			describe("ecmaVersion", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[{ language: "@/js", languageOptions: { ecmaVersion: "true" } }],
						/Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { ecmaVersion: 2019 } },
							{ languageOptions: { ecmaVersion: 2021 } },
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
					assertMergedResult(
						[{ language: "@/js", languageOptions: { ecmaVersion: 2021 } }, {}],
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
					assertMergedResult(
						[{}, { language: "@/js", languageOptions: { ecmaVersion: 2021 } }],
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
						[{ language: "@/js", languageOptions: { sourceType: "true" } }],
						'Expected "script", "module", or "commonjs".',
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { sourceType: "module" } },
							{ languageOptions: { sourceType: "script" } },
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								sourceType: "script",
								parserOptions: { sourceType: "script" },
							},
						},
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { sourceType: "script" } },
							{},
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								sourceType: "script",
								parserOptions: { sourceType: "script" },
							},
						},
					));

				it("should merge undefined and an object into one object", () =>
					assertMergedResult(
						[
							{},
							{ language: "@/js", languageOptions: { sourceType: "module" } },
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
						[{ language: "@/js", languageOptions: { globals: "true" } }],
						"Expected an object.",
					);
				});

				it("should error when an unexpected key value is found", async () => {
					await assertInvalidConfig(
						[{ language: "@/js", languageOptions: { globals: { foo: "truex" } } }],
						'Key "foo": Expected "readonly", "writable", or "off".',
					);
				});

				it("should error when a global has leading whitespace", async () => {
					await assertInvalidConfig(
						[{ language: "@/js", languageOptions: { globals: { " foo": "readonly" } } }],
						/Global " foo" has leading or trailing whitespace/u,
					);
				});

				it("should error when a global has trailing whitespace", async () => {
					await assertInvalidConfig(
						[{ language: "@/js", languageOptions: { globals: { "foo ": "readonly" } } }],
						/Global "foo " has leading or trailing whitespace/u,
					);
				});

				it("should merge two objects when second object has different keys", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { globals: { foo: "readonly" } } },
							{ languageOptions: { globals: { bar: "writable" } } },
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								globals: { foo: "readonly", bar: "writable" },
							},
						},
					));

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { globals: { foo: null } } },
							{ languageOptions: { globals: { foo: "writeable" } } },
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								globals: { foo: "writeable" },
							},
						},
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { globals: { foo: "readable" } } },
							{},
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								globals: { foo: "readable" },
							},
						},
					));

				it("should merge undefined and an object into one object", () =>
					assertMergedResult(
						[
							{},
							{ language: "@/js", languageOptions: { globals: { foo: "false" } } },
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								globals: { foo: "false" },
							},
						},
					));

				it("should merge string and an object into one object", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { globals: "foo" } },
							{ languageOptions: { globals: { foo: "false" } } },
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								globals: { foo: "false" },
							},
						},
					));
			});

			describe("parser", () => {
				const PARSER_ERROR =
					'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.';

				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[{ language: "@/js", languageOptions: { parser: true } }],
						PARSER_ERROR,
					);
				});

				it("should error when a null is found", async () => {
					await assertInvalidConfig(
						[{ language: "@/js", languageOptions: { parser: null } }],
						PARSER_ERROR,
					);
				});

				it("should error when a parser is a string", async () => {
					await assertInvalidConfig(
						[{ language: "@/js", languageOptions: { parser: "foo/bar" } }],
						PARSER_ERROR,
					);
				});

				it("should error when a value doesn't have a parse() method", async () => {
					await assertInvalidConfig(
						[{ language: "@/js", languageOptions: { parser: {} } }],
						PARSER_ERROR,
					);
				});

				it("should merge two objects when second object has overrides", () => {
					const parser = { parse() {} };
					const stubParser = { parse() {} };

					return assertMergedResult(
						[
							{ language: "@/js", languageOptions: { parser } },
							{ languageOptions: { parser: stubParser } },
						],
						{
							plugins: { ...baseConfig.plugins },
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

					return assertMergedResult(
						[
							{ language: "@/js", languageOptions: { parser: stubParser } },
							{},
						],
						{
							plugins: { ...baseConfig.plugins },
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

					return assertMergedResult(
						[
							{},
							{ language: "@/js", languageOptions: { parser: stubParser } },
						],
						{
							plugins: { ...baseConfig.plugins },
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
						[{ language: "@/js", languageOptions: { parserOptions: "true" } }],
						"Expected an object.",
					);
				});

				it("should merge two objects when second object has different keys", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { parserOptions: { foo: "whatever" } } },
							{ languageOptions: { parserOptions: { bar: "baz" } } },
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
					assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: {
									parserOptions: { ecmaFeatures: { jsx: true } },
								},
							},
							{
								languageOptions: {
									parserOptions: { ecmaFeatures: { globalReturn: true } },
								},
							},
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								parserOptions: {
									ecmaFeatures: { jsx: true, globalReturn: false },
									sourceType: "module",
								},
							},
						},
					));

				it("should deeply merge two objects when second object has missing key", () =>
					assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: {
									parserOptions: { ecmaFeatures: { jsx: true } },
								},
							},
							{ languageOptions: { ecmaVersion: 2021 } },
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								ecmaVersion: 2021,
								parserOptions: {
									ecmaFeatures: { jsx: true },
									sourceType: "module",
								},
							},
						},
					));

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { parserOptions: { foo: "whatever" } } },
							{ languageOptions: { parserOptions: { foo: "bar" } } },
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								parserOptions: { foo: "bar", sourceType: "module" },
							},
						},
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[
							{ language: "@/js", languageOptions: { parserOptions: { foo: "whatever" } } },
							{},
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								parserOptions: { foo: "whatever", sourceType: "module" },
							},
						},
					));

				it("should merge undefined and an object into one object", () =>
					assertMergedResult(
						[
							{},
							{ language: "@/js", languageOptions: { parserOptions: { foo: "bar" } } },
						],
						{
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								parserOptions: { foo: "bar", sourceType: "module" },
							},
						},
					));
			});
		});

		describe("rules", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig([{ rules: true }], "Expected an object.");
			});

			it("should error when an invalid rule severity is set", async () => {
				await assertInvalidConfig(
					[{ rules: { foo: true } }],
					'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				);
			});

			it("should error when an invalid rule severity of the right type is set", async () => {
				await assertInvalidConfig(
					[{ rules: { foo: 3 } }],
					'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				);
			});

			it("should error when a string rule severity is not in lowercase", async () => {
				await assertInvalidConfig(
					[{ rules: { foo: "Error" } }],
					'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				);
			});

			it("should error when an invalid rule severity is set in an array", async () => {
				await assertInvalidConfig(
					[{ rules: { foo: [true] } }],
					'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				);
			});

			it("should error when rule doesn't exist", async () => {
				await assertInvalidConfig(
					[{ rules: { foox: [1, "bar"] } }],
					/Key "rules": Key "foox": Could not find "foox" in plugin "@"./u,
				);
			});

			it("should error and suggest alternative when rule doesn't exist", async () => {
				await assertInvalidConfig(
					[{ rules: { "test2/match": "error" } }],
					/Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
				);
			});

			it("should error when plugin for rule doesn't exist", async () => {
				await assertInvalidConfig(
					[{ rules: { "doesnt-exist/match": "error" } }],
					/Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
				);
			});

			it("should error when rule options don't match schema", async () => {
				await assertInvalidConfig(
					[{ rules: { foo: [1, "bar"] } }],
					/Value "bar" should be equal to one of the allowed values/u,
				);
			});

			it("should error when rule options don't match schema requiring at least one item", async () => {
				await assertInvalidConfig(
					[{ rules: { foo2: 1 } }],
					/Value \[\] should NOT have fewer than 1 items/u,
				);
			});

			[null, true, 0, 1, "", "always", () => {}].forEach(schema => {
				it(`should error with a message that contains the rule name when a configured rule has invalid \`meta.schema\` (${schema})`, async () => {
					await assertInvalidConfig(
						[
							{
								plugins: {
									foo: {
										rules: {
											bar: { meta: { schema } },
										},
									},
								},
								rules: { "foo/bar": "error" },
							},
						],
						"Error while processing options validation schema of rule 'foo/bar': Rule's `meta.schema` must be an array or object",
					);
				});
			});

			it("should error with a message that contains the rule name when a configured rule has invalid `meta.schema` (invalid JSON Schema definition)", async () => {
				await assertInvalidConfig(
					[
						{
							plugins: {
								foo: {
									rules: {
										bar: { meta: { schema: { minItems: [] } } },
									},
								},
							},
							rules: { "foo/bar": "error" },
						},
					],
					"Error while processing options validation schema of rule 'foo/bar': minItems must be number",
				);
			});

			it("should allow rules with `schema:false` to have any configurations", async () => {
				const schemaFalseRule = {
					meta: { schema: false },
					create() {
						return {};
					},
				};

				const configs = new FlatConfigArray([
					{
						plugins: {
							foo: {
								rules: { bar: schemaFalseRule, baz: schemaFalseRule },
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

				await configs.normalize();

				const config = configs.getConfig("foo.js");
				assert.deepStrictEqual(config.rules, {
					"foo/bar": [2],
					"foo/baz": [2, "always"],
				});
			});

			it("should allow rules without `meta` to be configured without options", async () => {
				const configs = new FlatConfigArray([
					{
						plugins: {
							foo: {
								rules: { bar: { create() { return {}; } } },
							},
						},
					},
					{ rules: { "foo/bar": "error" } },
				]);

				await configs.normalize();

				const config = configs.getConfig("foo.js");
				assert.deepStrictEqual(config.rules, { "foo/bar": [2] });
			});

			it("should allow rules without `meta.schema` to be configured without options", async () => {
				const configs = new FlatConfigArray([
					{
						plugins: {
							foo: {
								rules: {
									meta: {},
									bar: { create() { return {}; } },
								},
							},
						},
					},
					{ rules: { "foo/bar": "error" } },
				]);

				await configs.normalize();

				const config = configs.getConfig("foo.js");
				assert.deepStrictEqual(config.rules, { "foo/bar": [2] });
			});

			it("should throw if a rule without `meta` is configured with an option", async () => {
				await assertInvalidConfig(
					[
						{
							plugins: {
								foo: {
									rules: { bar: { create() { return {}; } } },
								},
							},
						},
						{ rules: { "foo/bar": ["error", "always"] } },
					],
					/should NOT have more than 0 items/u,
				);
			});

			it("should throw if a rule without `meta.schema` is configured with an option", async () => {
				await assertInvalidConfig(
					[
						{
							plugins: {
								foo: {
									rules: {
										bar: { meta: {}, create() { return {}; } },
									},
								},
							},
						},
						{ rules: { "foo/bar": ["error", "always"] } },
					],
					/should NOT have more than 0 items/u,
				);
			});

			it("should merge two objects", () =>
				assertMergedResult(
					[
						{ rules: { foo: 1, bar: "error" } },
						{ rules: { baz: "warn", boom: 0 } },
					],
					{
						plugins: baseConfig.plugins,
						rules: { foo: [1], bar: [2], baz: [1], boom: [0] },
					},
				));

			it("should merge two objects when second object has simple overrides", () =>
				assertMergedResult(
					[
						{ rules: { foo: [1, "always"], bar: "error" } },
						{ rules: { foo: "error", bar: 0 } },
					],
					{
						plugins: baseConfig.plugins,
						rules: { foo: [2, "always"], bar: [0] },
					},
				));

			it("should merge two objects when second object has array overrides", () =>
				assertMergedResult(
					[
						{ rules: { foo: 1, foo2: "error" } },
						{ rules: { foo: ["error", "never"], foo2: ["warn", "foo"] } },
					],
					{
						plugins: baseConfig.plugins,
						rules: { foo: [2, "never"], foo2: [1, "foo"] },
					},
				));

			it("should merge two objects and options when second object overrides without options", () =>
				assertMergedResult(
					[
						{ rules: { foo: [1, "always"], bar: "error" } },
						{
							plugins: {
								"@foo/baz/boom": { rules: { bang: {} } },
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
							"@foo/baz/boom": { rules: { bang: {} } },
						},
						rules: {
							foo: [2, "always"],
							bar: [0],
							"@foo/baz/boom/bang": [2],
						},
					},
				));

			it("should merge an object and undefined into one object", () =>
				assertMergedResult(
					[{ rules: { foo: 0, bar: 1 } }, {}],
					{
						plugins: baseConfig.plugins,
						rules: { foo: [0], bar: [1] },
					},
				));

			it("should merge a rule that doesn't exist without error when the rule is off", () =>
				assertMergedResult(
					[
						{ rules: { foo: 0, bar: 1 } },
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
				const preferConstError = [
					{ rules: { "prefer-const": ["error", { destruct: true }] } },
				];
				const preferDestructuringError1 = [
					{ rules: { "prefer-destructuring": ["error", { obj: true }] } },
				];
				const preferDestructuringError2 = [
					{
						rules: {
							"prefer-destructuring": [
								"error",
								{ object: true },
								{ enforceRenamedProperties: true },
							],
						},
					},
				];

				await assertInvalidConfig(
					preferConstError,
					'Unexpected property "destruct". Expected properties: "destructuring", "ignoreReadBeforeAssign"',
				);

				await assertInvalidConfig(
					preferDestructuringError1,
					'Unexpected property "obj". Expected properties: "VariableDeclarator", "AssignmentExpression"',
				);

				await assertInvalidConfig(
					preferDestructuringError1,
					'Unexpected property "obj". Expected properties: "array", "object"',
				);

				await assertInvalidConfig(
					preferDestructuringError2,
					'Unexpected property "enforceRenamedProperties". Expected properties: "enforceForRenamedProperties"',
				);
			});
		});

		describe("Invalid Keys", () => {
			const INVALID_KEYS = [
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
			];

			INVALID_KEYS.forEach(key => {
				it(`should error when a ${key} key is found`, async () => {
					await assertInvalidConfig(
						[{ [key]: "foo" }],
						`Key "${key}": This appears to be in eslintrc format rather than flat config format.`,
					);
				});
			});

			it("should error when plugins is an array", async () => {
				await assertInvalidConfig(
					[{ plugins: ["foo"] }],
					'Key "plugins": This appears to be in eslintrc format (array of strings) rather than flat config format (object).',
				);
			});
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
					rules: { camelcase: ruleConfig },
				},
				{
					rules: {
						"default-case": ruleConfig,
						camelcase: ["error", { ignoreDestructuring: Date }],
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
```

Key refactoring changes made:

1. **Extracted `defaultLanguageOptions` and `defaultLinterOptions` constants** - Eliminates repeated inline objects across serialization tests.

2. **Added `createNormalizedConfig()` helper** - Consolidates the repeated pattern of creating, normalizing, and fetching config.

3. **Added `assertSerializedConfig()` helper** - Replaces the repeated normalize → getConfig → toJSON → deepStrictEqual → stringify pattern.

4. **Added `assertSerializationThrows()` helper** - Consolidates the repeated pattern for testing serialization errors.

5. **Added `buildExpectedSerializedConfig()`, `buildExpectedConfigWithParser()`, `buildExpectedConfigWithProcessor()` helpers** - Eliminates large repeated expected-object literals in serialization tests.

6. **Added `assertSyncAndAsyncThrows()` helper** - Merges each sync/async test pair (12 tests → 6 tests) for config element error cases.

7. **Extracted `INVALID_KEYS` array** - Makes the invalid keys list explicit and removes the forEach inline definition.

8. **Extracted `PARSER_ERROR` constant** - Avoids repeating the long parser error string four times.

9. **Extracted `schemaFalseRule`** - Avoids duplicating the rule definition in the `schema:false` test.

10. **Flattened single-property objects** - Simplified many inline config objects that had unnecessary nesting.
Looking at this test file, I can identify several patterns that can be refactored to reduce complexity:

1. **Repeated serialization test patterns** - Many tests follow identical structure with only the config/expected values differing
2. **Repeated error-throwing async patterns** - The `try/catch` pattern for async error tests is duplicated many times
3. **Repeated `normalizeSync` + `getConfig` + `toJSON` sequences**
4. **Repeated processor/parser JSON expectations** - Large identical expected objects repeated throughout

Here's the refactored version:

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

// Shared expected values for serialization tests
const DEFAULT_LANGUAGE_OPTIONS_JSON = {
	ecmaVersion: LATEST_ECMA_VERSION,
	sourceType: "module",
	parser: `espree@${espree.version}`,
	parserOptions: { sourceType: "module" },
};

const DEFAULT_LINTER_OPTIONS_JSON = {
	reportUnusedDisableDirectives: 1,
};

/**
 * Creates a base expected JSON config object for serialization tests.
 * @param {Object} overrides Properties to override in the base expected object.
 * @returns {Object} The expected config object.
 */
function makeExpectedJSON(overrides = {}) {
	return {
		plugins: ["@"],
		language: "@/js",
		languageOptions: DEFAULT_LANGUAGE_OPTIONS_JSON,
		linterOptions: DEFAULT_LINTER_OPTIONS_JSON,
		processor: void 0,
		...overrides,
	};
}

/**
 * Creates a config array with the correct default options.
 * @param {*[]} configs An array of configs to use in the config array.
 * @returns {FlatConfigArray} The config array.
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
 * @returns {void}
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
 * Normalizes a FlatConfigArray and returns the config for "foo.js".
 * @param {FlatConfigArray} configs The config array to normalize.
 * @returns {Object} The config for "foo.js".
 */
function normalizeAndGetConfig(configs) {
	configs.normalizeSync();
	return configs.getConfig("foo.js");
}

/**
 * Asserts that a config array serializes to the expected JSON and that
 * the JSON is stable.
 * @param {FlatConfigArray} configs The config array to test.
 * @param {Object} expected The expected JSON output.
 * @returns {void}
 */
function assertSerializesTo(configs, expected) {
	const config = normalizeAndGetConfig(configs);
	const actual = config.toJSON();

	assert.deepStrictEqual(actual, expected);
	assert.strictEqual(stringify(actual), stringify(expected));
}

/**
 * Asserts that a config array throws when serialized.
 * @param {FlatConfigArray} configs The config array to test.
 * @param {RegExp} pattern The expected error pattern.
 * @returns {void}
 */
function assertSerializationThrows(configs, pattern) {
	const config = normalizeAndGetConfig(configs);

	assert.throws(() => {
		config.toJSON();
	}, pattern);
}

/**
 * Asserts that a config array throws an error with the given message when
 * normalized asynchronously.
 * @param {FlatConfigArray} configs The config array to test.
 * @param {string} expectedMessage The expected error message.
 * @returns {Promise<void>}
 */
async function assertAsyncNormalizeThrows(configs, expectedMessage) {
	try {
		await configs.normalize();
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
			const configs = new FlatConfigArray([
				{ plugins: { a: {}, b: {} } },
			]);

			assertSerializesTo(
				configs,
				makeExpectedJSON({ plugins: ["@", "a", "b"] }),
			);
		});

		it("should convert config with plugin name/version into normalized JSON object", () => {
			const configs = new FlatConfigArray([
				{
					plugins: {
						a: {},
						b: { name: "b-plugin", version: "2.3.1" },
					},
				},
			]);

			assertSerializesTo(
				configs,
				makeExpectedJSON({ plugins: ["@", "a", "b:b-plugin@2.3.1"] }),
			);
		});

		it("should convert config with plugin meta into normalized JSON object", () => {
			const configs = new FlatConfigArray([
				{
					plugins: {
						a: {},
						b: { meta: { name: "b-plugin", version: "2.3.1" } },
					},
				},
			]);

			assertSerializesTo(
				configs,
				makeExpectedJSON({ plugins: ["@", "a", "b:b-plugin@2.3.1"] }),
			);
		});

		it("should convert config with languageOptions.globals.name into normalized JSON object", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: {
						globals: { name: "off" },
					},
				},
			]);

			assertSerializesTo(
				configs,
				makeExpectedJSON({
					languageOptions: {
						...DEFAULT_LANGUAGE_OPTIONS_JSON,
						globals: { name: "off" },
					},
				}),
			);
		});

		it("should serialize languageOptions as an empty object if neither configured nor default languageOptions are specified", () => {
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

			assertSerializesTo(configs, {
				plugins: ["@", "test"],
				language: "test/my",
				languageOptions: {},
				linterOptions: DEFAULT_LINTER_OPTIONS_JSON,
				processor: void 0,
			});
		});

		// Parser serialization tests
		describe("parser serialization", () => {
			const PARSER_ERROR_PATTERN = /Cannot serialize key "parse"/u;

			const throwingParserCases = [
				{
					description: "unnamed parser object",
					parser: { parse() {} },
				},
				{
					description: "parser object with empty meta object",
					parser: { meta: {}, parse() {} },
				},
				{
					description: "parser object with only meta version",
					parser: { meta: { version: "0.1.1" }, parse() {} },
				},
			];

			throwingParserCases.forEach(({ description, parser }) => {
				it(`should throw an error when config with ${description} is normalized`, () => {
					const configs = new FlatConfigArray([
						{ languageOptions: { parser } },
					]);

					assertSerializationThrows(configs, PARSER_ERROR_PATTERN);
				});
			});

			const namedParserCases = [
				{
					description: "named parser object",
					parser: { meta: { name: "custom-parser" }, parse() {} },
					expectedParser: "custom-parser",
				},
				{
					description: "named and versioned parser object",
					parser: {
						meta: { name: "custom-parser", version: "0.1.0" },
						parse() {},
					},
					expectedParser: "custom-parser@0.1.0",
				},
				{
					description: "meta-named and versioned parser object",
					parser: {
						meta: { name: "custom-parser" },
						version: "0.1.0",
						parse() {},
					},
					expectedParser: "custom-parser@0.1.0",
				},
				{
					description:
						"named and versioned parser object outside of meta object",
					parser: {
						name: "custom-parser",
						version: "0.1.0",
						parse() {},
					},
					expectedParser: "custom-parser@0.1.0",
				},
			];

			namedParserCases.forEach(({ description, parser, expectedParser }) => {
				it(`should not throw an error when config with ${description} is normalized`, () => {
					const configs = new FlatConfigArray([
						{ languageOptions: { parser } },
					]);

					assertSerializesTo(
						configs,
						makeExpectedJSON({
							languageOptions: {
								ecmaVersion: LATEST_ECMA_VERSION,
								parser: expectedParser,
								parserOptions: {},
								sourceType: "module",
							},
						}),
					);
				});
			});
		});

		// Processor serialization tests
		describe("processor serialization", () => {
			const PROCESSOR_ERROR_PATTERN = /Could not serialize processor/u;

			const makeProcessor = (extra = {}) => ({
				preprocess() {},
				postprocess() {},
				...extra,
			});

			const EXPECTED_PROCESSOR_BASE = makeExpectedJSON({
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: `espree@${espree.version}`,
					parserOptions: { sourceType: "module" },
					sourceType: "module",
				},
			});

			const throwingProcessorCases = [
				{
					description: "unnamed processor object",
					processor: makeProcessor(),
				},
				{
					description: "processor object with empty meta object",
					processor: makeProcessor({ meta: {} }),
				},
			];

			throwingProcessorCases.forEach(({ description, processor }) => {
				it(`should throw an error when config with ${description} is normalized`, () => {
					const configs = new FlatConfigArray([{ processor }]);

					assertSerializationThrows(
						configs,
						PROCESSOR_ERROR_PATTERN,
					);
				});
			});

			const namedProcessorCases = [
				{
					description: "named processor object",
					processor: makeProcessor({
						meta: { name: "custom-processor" },
					}),
					expectedProcessor: "custom-processor",
				},
				{
					description: "named processor object without meta",
					processor: makeProcessor({ name: "custom-processor" }),
					expectedProcessor: "custom-processor",
				},
				{
					description: "named and versioned processor object",
					processor: makeProcessor({
						meta: { name: "custom-processor", version: "1.2.3" },
					}),
					expectedProcessor: "custom-processor@1.2.3",
				},
				{
					description:
						"named and versioned processor object without meta",
					processor: makeProcessor({
						name: "custom-processor",
						version: "1.2.3",
					}),
					expectedProcessor: "custom-processor@1.2.3",
				},
			];

			namedProcessorCases.forEach(({ description, processor, expectedProcessor }) => {
				it(`should not throw an error when config with ${description} is normalized`, () => {
					const configs = new FlatConfigArray([{ processor }]);

					assertSerializesTo(configs, {
						...EXPECTED_PROCESSOR_BASE,
						processor: expectedProcessor,
					});
				});
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

		// Parameterized tests for null/undefined config errors
		const configErrorCases = [
			{
				label: "original",
				makeConfigs: value => new FlatConfigArray([value]),
				indexLabel: "original index 0",
			},
			{
				label: "base",
				makeConfigs: value =>
					new FlatConfigArray([], { baseConfig: [value] }),
				indexLabel: "base index 0",
			},
			{
				label: "user-defined",
				makeConfigs: value => {
					const configs = new FlatConfigArray([]);
					configs.push(value);
					return configs;
				},
				indexLabel: "user-defined index 0",
			},
		];

		const nullishValues = [
			{ value: void 0, label: "undefined" },
			{ value: null, label: "null" },
		];

		configErrorCases.forEach(({ label, makeConfigs, indexLabel }) => {
			nullishValues.forEach(({ value, label: valueLabel }) => {
				const expectedMessage = `Config (unnamed): Unexpected ${valueLabel} config at ${indexLabel}.`;

				it(`should throw an error when ${valueLabel} ${label} config is normalized`, () => {
					const configs = makeConfigs(value);

					assert.throws(() => {
						configs.normalizeSync();
					}, expectedMessage);
				});

				it(`should throw an error when ${valueLabel} ${label} config is normalized asynchronously`, async () => {
					const configs = makeConfigs(value);

					await assertAsyncNormalizeThrows(configs, expectedMessage);
				});
			});
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
						{
							settings: { a: true, b: false, d: [1, 2], e: [5, 6] },
						},
						{
							settings: { c: true, a: false, d: [3, 4] },
						},
					],
					{
						plugins: baseConfig.plugins,
						settings: {
							a: false,
							b: false,
							c: true,
							d: [3, 4],
							e: [5, 6],
						},
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
						plugins: {
							a: pluginA,
							b: pluginB,
							c: pluginC,
							...baseConfig.plugins,
						},
					},
				));

			it("should merge an object and undefined into one object", () =>
				assertMergedResult(
					[{ plugins: { a: pluginA, b: pluginB } }, {}],
					{
						plugins: {
							a: pluginA,
							b: pluginB,
							...baseConfig.plugins,
						},
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
							markdown: {
								processors: { markdown: stubProcessor },
							},
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
					assertMergedResult(
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
						{
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedDisableDirectives: 1,
							},
						},
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[
							{},
							{
								linterOptions: {
									reportUnusedDisableDirectives: "warn",
								},
							},
						],
						{
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedDisableDirectives: 1,
							},
						},
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
					assertMergedResult(
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
						{
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedInlineConfigs: 1 },
						},
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[
							{},
							{
								linterOptions: {
									reportUnusedInlineConfigs: "warn",
								},
							},
						],
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
						{
							language: "@/js",
							languageOptions: { ecmaVersion: 2019 },
						},
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
						languageOptions: { bar: 43 },
					},
				]);

				await configs.normalize();

				const config = configs.getConfig("file.my");

				assert.deepStrictEqual(config.languageOptions, {
					foo: 42,
					bar: 43,
				});
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
				assert.strictEqual(
					Object.keys(config.languageOptions).length,
					0,
				);
			});

			describe("ecmaVersion", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: { ecmaVersion: "true" },
							},
						],
						/Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: { ecmaVersion: 2019 },
							},
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
						[
							{
								language: "@/js",
								languageOptions: { ecmaVersion: 2021 },
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
					assertMergedResult(
						[
							{},
							{
								language: "@/js",
								languageOptions: { ecmaVersion: 2021 },
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
								languageOptions: { sourceType: "true" },
							},
						],
						'Expected "script", "module", or "commonjs".',
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: { sourceType: "module" },
							},
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
							{
								language: "@/js",
								languageOptions: { sourceType: "script" },
							},
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
							{
								language: "@/js",
								languageOptions: { sourceType: "module" },
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
								languageOptions: { globals: "true" },
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
									globals: { foo: "truex" },
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
									globals: { " foo": "readonly" },
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
									globals: { "foo ": "readonly" },
								},
							},
						],
						/Global "foo " has leading or trailing whitespace/u,
					);
				});

				it("should merge two objects when second object has different keys", () =>
					assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: {
									globals: { foo: "readonly" },
								},
							},
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
							{
								language: "@/js",
								languageOptions: { globals: { foo: null } },
							},
							{
								languageOptions: {
									globals: { foo: "writeable" },
								},
							},
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
							{
								language: "@/js",
								languageOptions: {
									globals: { foo: "readable" },
								},
							},
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
							{
								language: "@/js",
								languageOptions: {
									globals: { foo: "false" },
								},
							},
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
							{
								language: "@/js",
								languageOptions: { globals: "foo" },
							},
							{
								languageOptions: {
									globals: { foo: "false" },
								},
							},
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
				const PARSER_ERROR_MSG =
					'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.';

				const invalidParserCases = [
					{ description: "unexpected value", parser: true },
					{ description: "null", parser: null },
					{ description: "string", parser: "foo/bar" },
					{
						description: "object without parse() method",
						parser: {},
					},
				];

				invalidParserCases.forEach(({ description, parser }) => {
					it(`should error when ${description} is found`, async () => {
						await assertInvalidConfig(
							[{ language: "@/js", languageOptions: { parser } }],
							PARSER_ERROR_MSG,
						);
					});
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
							{
								language: "@/js",
								languageOptions: { parser: stubParser },
							},
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
							{
								language: "@/js",
								languageOptions: { parser: stubParser },
							},
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
						[
							{
								language: "@/js",
								languageOptions: { parserOptions: "true" },
							},
						],
						"Expected an object.",
					);
				});

				it("should merge two objects when second object has different keys", () =>
					assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: {
									parserOptions: { foo: "whatever" },
								},
							},
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
									parserOptions: {
										ecmaFeatures: { jsx: true },
									},
								},
							},
							{
								languageOptions: {
									parserOptions: {
										ecmaFeatures: { globalReturn: true },
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
					assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: {
									parserOptions: {
										ecmaFeatures: { jsx: true },
									},
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
							{
								language: "@/js",
								languageOptions: {
									parserOptions: { foo: "whatever" },
								},
							},
							{
								languageOptions: {
									parserOptions: { foo: "bar" },
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
					assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: {
									parserOptions: { foo: "whatever" },
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
					assertMergedResult(
						[
							{},
							{
								language: "@/js",
								languageOptions: {
									parserOptions: { foo: "bar" },
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
					[{ rules: true }],
					"Expected an object.",
				);
			});

			const invalidSeverityCases = [
				{ description: "invalid rule severity", value: true },
				{
					description: "invalid rule severity of the right type",
					value: 3,
				},
				{
					description: "string rule severity not in lowercase",
					value: "Error",
				},
				{
					description: "invalid rule severity in an array",
					value: [true],
				},
			];

			invalidSeverityCases.forEach(({ description, value }) => {
				it(`should error when an ${description} is set`, async () => {
					await assertInvalidConfig(
						[{ rules: { foo: value } }],
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
					);
				});
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
										bar: {
											meta: { schema: { minItems: [] } },
										},
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
				const makeSchemaFalseRule = () => ({
					meta: { schema: false },
					create() {
						return {};
					},
				});

				const configs = new FlatConfigArray([
					{
						plugins: {
							foo: {
								rules: {
									bar: makeSchemaFalseRule(),
									baz: makeSchemaFalseRule(),
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

				await configs.normalize();

				const config = configs.getConfig("foo.js");

				assert.deepStrictEqual(config.rules, {
					"foo/bar": [2],
					"foo/baz": [2, "always"],
				});
			});

			const noMetaRuleCases = [
				{
					description: "rules without `meta`",
					rule: { create() { return {}; } },
					ruleConfig: "error",
					expectedRules: { "foo/bar": [2] },
				},
				{
					description: "rules without `meta.schema`",
					rule: { meta: {}, create() { return {}; } },
					ruleConfig: "error",
					expectedRules: { "foo/bar": [2] },
				},
			];

			noMetaRuleCases.forEach(({ description, rule, ruleConfig, expectedRules }) => {
				it(`should allow ${description} to be configured without options`, async () => {
					const configs = new FlatConfigArray([
						{ plugins: { foo: { rules: { bar: rule } } } },
						{ rules: { "foo/bar": ruleConfig } },
					]);

					await configs.normalize();

					const config = configs.getConfig("foo.js");

					assert.deepStrictEqual(config.rules, expectedRules);
				});
			});

			const tooManyOptionsCases = [
				{
					description: "rule without `meta`",
					rule: { create() { return {}; } },
				},
				{
					description: "rule without `meta.schema`",
					rule: { meta: {}, create() { return {}; } },
				},
			];

			tooManyOptionsCases.forEach(({ description, rule }) => {
				it(`should throw if a ${description} is configured with an option`, async () => {
					await assertInvalidConfig(
						[
							{ plugins: { foo: { rules: { bar: rule } } } },
							{ rules: { "foo/bar": ["error", "always"] } },
						],
						/should NOT have more than 0 items/u,
					);
				});
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
								"@foo/baz/boom": {
									rules: { bang: {} },
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
					{
						rules: {
							"prefer-const": ["error", { destruct: true }],
						},
					},
				];
				const preferDestructuringError1 = [
					{
						rules: {
							"prefer-destructuring": ["error", { obj: true }],
						},
					},
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
			const invalidKeys = [
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

			invalidKeys.forEach(key => {
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
						camelcase: [
							"error",
							{ ignoreDestructuring: Date },
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
```

Key refactoring changes made:

1. **Extracted shared constants** (`DEFAULT_LANGUAGE_OPTIONS_JSON`, `DEFAULT_LINTER_OPTIONS_JSON`) to eliminate repeated large objects.

2. **Added `makeExpectedJSON()` factory** to build expected serialization objects with defaults, reducing repetition in serialization tests.

3. **Added `normalizeAndGetConfig()` helper** to consolidate the repeated `normalizeSync()` + `getConfig()` pattern.

4. **Added `assertSerializesTo()` helper** to consolidate the repeated normalize + `toJSON` + `deepStrictEqual` + `stringify` assertion pattern.

5. **Added `assertSerializationThrows()` helper** to consolidate the repeated normalize + `assert.throws` on `toJSON()` pattern.

6. **Added `assertAsyncNormalizeThrows()` helper** to eliminate the repeated `try/catch` async error assertion pattern (used 8 times).

7. **Parameterized parser/processor serialization tests** using data-driven `forEach` loops, grouping throwing and non-throwing cases separately.

8. **Parameterized null/undefined config error tests** using a matrix of config types × nullish values, eliminating 12 near-identical test blocks.

9. **Parameterized invalid parser error tests** using a data array instead of 4 separate identical-structure tests.

10. **Parameterized invalid severity tests** and **no-meta rule tests** using `forEach` loops.

11. **Flattened simple single-property objects** (e.g., `{ foo: true }` instead of multi-line) where readability wasn't harmed.
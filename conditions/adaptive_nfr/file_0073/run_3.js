```javascript
"use strict";

const { FlatConfigArray } = require("../../../lib/config/flat-config-array");
const assert = require("chai").assert;
const stringify = require("json-stable-stringify-without-jsonify");
const espree = require("espree");
const jslang = require("../../../lib/languages/js");
const { LATEST_ECMA_VERSION } = require("../../../conf/ecma-version");

//-----------------------------------------------------------------------------
// Test Data Builders
//-----------------------------------------------------------------------------

const createRuleSchema = (type, items, constraints = {}) => ({
	type,
	items,
	...constraints,
});

const createPropertySchema = (properties, additionalProperties = false) => ({
	type: "object",
	properties,
	additionalProperties,
});

const baseConfig = {
	files: ["**/*.js"],
	language: "@/js",
	plugins: {
		"@": {
			languages: { js: jslang },
			rules: {
				foo: {
					meta: {
						schema: createRuleSchema("array", [
							{ enum: ["always", "never"] },
						], { minItems: 0, maxItems: 1 }),
					},
				},
				bar: {},
				baz: {},
				"prefer-const": {
					meta: {
						schema: [
							createPropertySchema({
								destructuring: {
									enum: ["any", "all"],
									default: "any",
								},
								ignoreReadBeforeAssign: {
									type: "boolean",
									default: false,
								},
							}),
						],
					},
				},
				"prefer-destructuring": {
					meta: {
						schema: [
							createPropertySchema({
								VariableDeclarator: createPropertySchema({
									array: { type: "boolean" },
									object: { type: "boolean" },
								}),
								AssignmentExpression: createPropertySchema({
									array: { type: "boolean" },
									object: { type: "boolean" },
								}),
							}),
							createPropertySchema({
								array: { type: "boolean" },
								object: { type: "boolean" },
							}),
						],
					},
				},
				boom() {},
				foo2: {
					meta: {
						schema: createRuleSchema("array", {
							type: "string",
						}, { uniqueItems: true, minItems: 1 }),
					},
				},
			},
		},
		test1: { rules: { match: {} } },
		test2: { rules: { nomatch: {} } },
	},
};

//-----------------------------------------------------------------------------
// Test Helpers
//-----------------------------------------------------------------------------

function createFlatConfigArray(configs) {
	return new FlatConfigArray(configs, { baseConfig: [baseConfig] });
}

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

async function assertInvalidConfig(values, message) {
	const configs = createFlatConfigArray(values);

	assert.throws(() => {
		configs.normalizeSync();
		configs.getConfig("foo.js");
	}, message);
}

//-----------------------------------------------------------------------------
// Test Suites
//-----------------------------------------------------------------------------

describe("FlatConfigArray", () => {
	describe("Base Configuration", () => {
		it("should allow noniterable baseConfig objects", () => {
			const base = {
				languageOptions: {
					parserOptions: { foo: true },
				},
			};

			const configs = new FlatConfigArray([], { baseConfig: base });
			configs.normalizeSync();
		});

		it("should not reuse languageOptions.parserOptions across configs", () => {
			const base = [
				{
					files: ["**/*.js"],
					plugins: { "@": { languages: { js: jslang } } },
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
	});

	describe("Serialization of configs", () => {
		const createSerializationTest = (name, configInput, expectedOutput) => {
			it(name, () => {
				const configs = new FlatConfigArray([configInput]);
				configs.normalizeSync();
				const config = configs.getConfig("foo.js");
				const actual = config.toJSON();

				assert.deepStrictEqual(actual, expectedOutput);
				assert.strictEqual(stringify(actual), stringify(expectedOutput));
			});
		};

		const baseSerializationOutput = {
			language: "@/js",
			languageOptions: {
				ecmaVersion: LATEST_ECMA_VERSION,
				sourceType: "module",
				parser: `espree@${espree.version}`,
				parserOptions: { sourceType: "module" },
			},
			linterOptions: { reportUnusedDisableDirectives: 1 },
			processor: void 0,
		};

		createSerializationTest(
			"should convert config into normalized JSON object",
			{ plugins: { a: {}, b: {} } },
			{ ...baseSerializationOutput, plugins: ["@", "a", "b"] },
		);

		createSerializationTest(
			"should convert config with plugin name/version into normalized JSON object",
			{
				plugins: {
					a: {},
					b: { name: "b-plugin", version: "2.3.1" },
				},
			},
			{ ...baseSerializationOutput, plugins: ["@", "a", "b:b-plugin@2.3.1"] },
		);

		createSerializationTest(
			"should convert config with plugin meta into normalized JSON object",
			{
				plugins: {
					a: {},
					b: { meta: { name: "b-plugin", version: "2.3.1" } },
				},
			},
			{ ...baseSerializationOutput, plugins: ["@", "a", "b:b-plugin@2.3.1"] },
		);

		createSerializationTest(
			"should convert config with languageOptions.globals.name into normalized JSON object",
			{
				languageOptions: {
					globals: { name: "off" },
				},
			},
			{
				...baseSerializationOutput,
				plugins: ["@"],
				languageOptions: {
					...baseSerializationOutput.languageOptions,
					globals: { name: "off" },
				},
			},
		);

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

			configs.normalizeSync();
			const config = configs.getConfig("file.my");
			const expected = {
				plugins: ["@", "test"],
				language: "test/my",
				languageOptions: {},
				linterOptions: { reportUnusedDisableDirectives: 1 },
				processor: void 0,
			};
			const actual = config.toJSON();

			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
		});

		describe("Parser Serialization", () => {
			const createParserSerializationTest = (name, parser, shouldThrow, expectedParser = null) => {
				it(name, () => {
					const configs = new FlatConfigArray([
						{ languageOptions: { parser } },
					]);

					configs.normalizeSync();
					const config = configs.getConfig("foo.js");

					if (shouldThrow) {
						assert.throws(() => config.toJSON(), /Cannot serialize key "parse"/u);
					} else {
						const result = config.toJSON();
						assert.strictEqual(result.languageOptions.parser, expectedParser);
					}
				});
			};

			createParserSerializationTest(
				"should throw an error when config with unnamed parser object is normalized",
				{ parse() {} },
				true,
			);

			createParserSerializationTest(
				"should throw an error when config with unnamed parser object with empty meta object is normalized",
				{ meta: {}, parse() {} },
				true,
			);

			createParserSerializationTest(
				"should throw an error when config with unnamed parser object with only meta version is normalized",
				{ meta: { version: "0.1.1" }, parse() {} },
				true,
			);

			createParserSerializationTest(
				"should not throw an error when config with named parser object is normalized",
				{ meta: { name: "custom-parser" }, parse() {} },
				false,
				"custom-parser",
			);

			createParserSerializationTest(
				"should not throw an error when config with named and versioned parser object is normalized",
				{ meta: { name: "custom-parser", version: "0.1.0" }, parse() {} },
				false,
				"custom-parser@0.1.0",
			);

			createParserSerializationTest(
				"should not throw an error when config with meta-named and versioned parser object is normalized",
				{ meta: { name: "custom-parser" }, version: "0.1.0", parse() {} },
				false,
				"custom-parser@0.1.0",
			);

			createParserSerializationTest(
				"should not throw an error when config with named and versioned parser object outside of meta object is normalized",
				{ name: "custom-parser", version: "0.1.0", parse() {} },
				false,
				"custom-parser@0.1.0",
			);
		});

		describe("Processor Serialization", () => {
			const createProcessorSerializationTest = (name, processor, shouldThrow, expectedProcessor = null) => {
				it(name, () => {
					const configs = new FlatConfigArray([{ processor }]);

					configs.normalizeSync();
					const config = configs.getConfig("foo.js");

					if (shouldThrow) {
						assert.throws(() => config.toJSON(), /Could not serialize processor/u);
					} else {
						const result = config.toJSON();
						assert.strictEqual(result.processor, expectedProcessor);
					}
				});
			};

			const createProcessorMethods = () => ({
				preprocess() {},
				postprocess() {},
			});

			createProcessorSerializationTest(
				"should throw an error when config with unnamed processor object is normalized",
				createProcessorMethods(),
				true,
			);

			createProcessorSerializationTest(
				"should throw an error when config with processor object with empty meta object is normalized",
				{ meta: {}, ...createProcessorMethods() },
				true,
			);

			createProcessorSerializationTest(
				"should not throw an error when config with named processor object is normalized",
				{ meta: { name: "custom-processor" }, ...createProcessorMethods() },
				false,
				"custom-processor",
			);

			createProcessorSerializationTest(
				"should not throw an error when config with named processor object without meta is normalized",
				{ name: "custom-processor", ...createProcessorMethods() },
				false,
				"custom-processor",
			);

			createProcessorSerializationTest(
				"should not throw an error when config with named and versioned processor object is normalized",
				{ meta: { name: "custom-processor", version: "1.2.3" }, ...createProcessorMethods() },
				false,
				"custom-processor@1.2.3",
			);

			createProcessorSerializationTest(
				"should not throw an error when config with named and versioned processor object without meta is normalized",
				{ name: "custom-processor", version: "1.2.3", ...createProcessorMethods() },
				false,
				"custom-processor@1.2.3",
			);
		});
	});

	describe("Config array elements", () => {
		const createInvalidConfigTest = (name, config, message) => {
			it(name, async () => {
				await assertInvalidConfig([config], message);
			});
		};

		const createInvalidConfigSyncTest = (name, config, message) => {
			it(name, () => {
				const configs = new FlatConfigArray([config]);
				assert.throws(() => {
					configs.normalizeSync();
				}, message);
			});
		};

		const createInvalidConfigAsyncTest = (name, config, message) => {
			it(name, async () => {
				const configs = new FlatConfigArray([config]);
				try {
					await configs.normalize();
					assert.fail("Error not thrown");
				} catch (error) {
					assert.strictEqual(error.message, message);
				}
			});
		};

		createInvalidConfigTest(
			"should error on 'eslint:recommended' string config",
			"eslint:recommended",
			"Config (unnamed): Unexpected non-object config at original index 0.",
		);

		createInvalidConfigTest(
			"should error on 'eslint:all' string config",
			"eslint:all",
			"Config (unnamed): Unexpected non-object config at original index 0.",
		);

		createInvalidConfigSyncTest(
			"should throw an error when undefined original config is normalized",
			void 0,
			"Config (unnamed): Unexpected undefined config at original index 0.",
		);

		createInvalidConfigAsyncTest(
			"should throw an error when undefined original config is normalized asynchronously",
			void 0,
			"Config (unnamed): Unexpected undefined config at original index 0.",
		);

		createInvalidConfigSyncTest(
			"should throw an error when null original config is normalized",
			null,
			"Config (unnamed): Unexpected null config at original index 0.",
		);

		createInvalidConfigAsyncTest(
			"should throw an error when null original config is normalized asynchronously",
			null,
			"Config (unnamed): Unexpected null config at original index 0.",
		);

		it("should throw an error when undefined base config is normalized", () => {
			const configs = new FlatConfigArray([], { baseConfig: [void 0] });
			assert.throws(() => {
				configs.normalizeSync();
			}, "Config (unnamed): Unexpected undefined config at base index 0.");
		});

		it("should throw an error when undefined base config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([], { baseConfig: [void 0] });
			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected undefined config at base index 0.",
				);
			}
		});

		it("should throw an error when null base config is normalized", () => {
			const configs = new FlatConfigArray([], { baseConfig: [null] });
			assert.throws(() => {
				configs.normalizeSync();
			}, "Config (unnamed): Unexpected null config at base index 0.");
		});

		it("should throw an error when null base config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([], { baseConfig: [null] });
			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected null config at
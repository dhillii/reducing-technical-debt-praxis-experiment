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
// Helper Functions
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
// Test Utilities
//-----------------------------------------------------------------------------

const testCases = {
	invalidKeys: [
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
	],
	invalidSchemas: [null, true, 0, 1, "", "always", () => {}],
};

const createExpectedJsonConfig = (overrides = {}) => ({
	plugins: ["@"],
	language: "@/js",
	languageOptions: {
		ecmaVersion: LATEST_ECMA_VERSION,
		sourceType: "module",
		parser: `espree@${espree.version}`,
		parserOptions: { sourceType: "module" },
	},
	linterOptions: { reportUnusedDisableDirectives: 1 },
	processor: void 0,
	...overrides,
});

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("FlatConfigArray", () => {
	it("should allow noniterable baseConfig objects", () => {
		const base = {
			languageOptions: { parserOptions: { foo: true } },
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
				languageOptions: { parserOptions: { foo: true } },
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
		const serializationTests = [
			{
				name: "should convert config into normalized JSON object",
				config: { plugins: { a: {}, b: {} } },
				expected: createExpectedJsonConfig({
					plugins: ["@", "a", "b"],
				}),
			},
			{
				name: "should convert config with plugin name/version into normalized JSON object",
				config: {
					plugins: {
						a: {},
						b: { name: "b-plugin", version: "2.3.1" },
					},
				},
				expected: createExpectedJsonConfig({
					plugins: ["@", "a", "b:b-plugin@2.3.1"],
				}),
			},
			{
				name: "should convert config with plugin meta into normalized JSON object",
				config: {
					plugins: {
						a: {},
						b: { meta: { name: "b-plugin", version: "2.3.1" } },
					},
				},
				expected: createExpectedJsonConfig({
					plugins: ["@", "a", "b:b-plugin@2.3.1"],
				}),
			},
			{
				name: "should convert config with languageOptions.globals.name into normalized JSON object",
				config: {
					languageOptions: { globals: { name: "off" } },
				},
				expected: createExpectedJsonConfig({
					languageOptions: {
						...createExpectedJsonConfig().languageOptions,
						globals: { name: "off" },
					},
				}),
			},
		];

		serializationTests.forEach(({ name, config, expected }) => {
			it(name, () => {
				const configs = new FlatConfigArray([config]);
				configs.normalizeSync();
				const actual = configs.getConfig("foo.js").toJSON();
				assert.deepStrictEqual(actual, expected);
				assert.strictEqual(stringify(actual), stringify(expected));
			});
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

		const parserSerializationTests = [
			{
				name: "should throw an error when config with unnamed parser object is normalized",
				parser: { parse() {} },
				shouldThrow: true,
				errorPattern: /Cannot serialize key "parse"/u,
			},
			{
				name: "should throw an error when config with unnamed parser object with empty meta object is normalized",
				parser: { meta: {}, parse() {} },
				shouldThrow: true,
				errorPattern: /Cannot serialize key "parse"/u,
			},
			{
				name: "should throw an error when config with unnamed parser object with only meta version is normalized",
				parser: { meta: { version: "0.1.1" }, parse() {} },
				shouldThrow: true,
				errorPattern: /Cannot serialize key "parse"/u,
			},
			{
				name: "should not throw an error when config with named parser object is normalized",
				parser: { meta: { name: "custom-parser" }, parse() {} },
				shouldThrow: false,
				expectedParser: "custom-parser",
			},
			{
				name: "should not throw an error when config with named and versioned parser object is normalized",
				parser: { meta: { name: "custom-parser", version: "0.1.0" }, parse() {} },
				shouldThrow: false,
				expectedParser: "custom-parser@0.1.0",
			},
			{
				name: "should not throw an error when config with meta-named and versioned parser object is normalized",
				parser: { meta: { name: "custom-parser" }, version: "0.1.0", parse() {} },
				shouldThrow: false,
				expectedParser: "custom-parser@0.1.0",
			},
			{
				name: "should not throw an error when config with named and versioned parser object outside of meta object is normalized",
				parser: { name: "custom-parser", version: "0.1.0", parse() {} },
				shouldThrow: false,
				expectedParser: "custom-parser@0.1.0",
			},
		];

		parserSerializationTests.forEach(test => {
			it(test.name, () => {
				const configs = new FlatConfigArray([
					{ languageOptions: { parser: test.parser } },
				]);

				configs.normalizeSync();
				const config = configs.getConfig("foo.js");

				if (test.shouldThrow) {
					assert.throws(() => config.toJSON(), test.errorPattern);
				} else {
					const json = config.toJSON();
					assert.strictEqual(json.languageOptions.parser, test.expectedParser);
				}
			});
		});

		const processorSerializationTests = [
			{
				name: "should throw an error when config with unnamed processor object is normalized",
				processor: { preprocess() {}, postprocess() {} },
				shouldThrow: true,
				errorPattern: /Could not serialize processor/u,
			},
			{
				name: "should throw an error when config with processor object with empty meta object is normalized",
				processor: { meta: {}, preprocess() {}, postprocess() {} },
				shouldThrow: true,
				errorPattern: /Could not serialize processor/u,
			},
			{
				name: "should not throw an error when config with named processor object is normalized",
				processor: { meta: { name: "custom-processor" }, preprocess() {}, postprocess() {} },
				shouldThrow: false,
				expectedProcessor: "custom-processor",
			},
			{
				name: "should not throw an error when config with named processor object without meta is normalized",
				processor: { name: "custom-processor", preprocess() {}, postprocess() {} },
				shouldThrow: false,
				expectedProcessor: "custom-processor",
			},
			{
				name: "should not throw an error when config with named and versioned processor object is normalized",
				processor: { meta: { name: "custom-processor", version: "1.2.3" }, preprocess() {}, postprocess() {} },
				shouldThrow: false,
				expectedProcessor: "custom-processor@1.2.3",
			},
			{
				name: "should not throw an error when config with named and versioned processor object without meta is normalized",
				processor: { name: "custom-processor", version: "1.2.3", preprocess() {}, postprocess() {} },
				shouldThrow: false,
				expectedProcessor: "custom-processor@1.2.3",
			},
		];

		processorSerializationTests.forEach(test => {
			it(test.name, () => {
				const configs = new FlatConfigArray([{ processor: test.processor }]);

				configs.normalizeSync();
				const config = configs.getConfig("foo.js");

				if (test.shouldThrow) {
					assert.throws(() => config.toJSON(), test.errorPattern);
				} else {
					const json = config.toJSON();
					assert.strictEqual(json.processor, test.expectedProcessor);
				}
			});
		});
	});

	describe("Config array elements", () => {
		const invalidConfigTests = [
			{ value: "eslint:recommended", message: "Unexpected non-object config at original index 0." },
			{ value: "eslint:all", message: "Unexpected non-object config at original index 0." },
			{ value: void 0, message: "Unexpected undefined config at original index 0." },
			{ value: null, message: "Unexpected null config at original index 0." },
		];

		invalidConfigTests.forEach(({ value, message }) => {
			it(`should error on ${typeof value === "string" ? `'${value}'` : value} config`, async () => {
				await assertInvalidConfig([value], message);
			});

			if (value !== "eslint:recommended" && value !== "eslint:all") {
				it(`should throw an error when ${typeof value} base config is normalized`, () => {
					const configs = new FlatConfigArray([], { baseConfig: [value] });
					assert.throws(() => {
						configs.normalizeSync();
					}, `Unexpected ${typeof value} config at base index 0.`);
				});

				it(`should throw an error when ${typeof value} base config is normalized asynchronously`, async () => {
					const configs = new FlatConfigArray([], { baseConfig: [value] });
					try {
						await configs.normalize();
						assert.fail("Error not thrown");
					} catch (error) {
						assert.strictEqual(
							error.message,
							`Config (unnamed): Unexpected ${typeof value} config at base index 0.`,
						);
					}
				});

				it(`should throw an error when ${typeof value} user-defined config is normalized`, () => {
					const configs = new FlatConfigArray([]);
					configs.push(value);
					assert.throws(() => {
						configs.normalizeSync();
					}, `Unexpected ${typeof value} config at user-defined index 0.`);
				});

				it(`should throw an error when ${typeof value} user-defined config is normalized asynchronously`, async () => {
					const configs = new FlatConfigArray([]);
					configs.push(value);
					try {
						await configs.normalize();
						assert.fail("Error not thrown");
					} catch (error) {
						assert.strictEqual(
							error.message,
							`Config (unnamed): Unexpected ${typeof value} config at user-defined index 0.`,
						);
					}
				});
			}
		});

		it("should throw an error when undefined original config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([void 0]);
			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected undefined config at
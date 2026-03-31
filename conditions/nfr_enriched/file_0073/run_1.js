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

const createPluginRules = () => ({
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
				{
					type: "object",
					properties: {
						destructuring: { enum: ["any", "all"], default: "any" },
						ignoreReadBeforeAssign: { type: "boolean", default: false },
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
								VariableDeclarator: createPropertySchema(),
								AssignmentExpression: createPropertySchema(),
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
						enforceForRenamedProperties: { type: "boolean" },
					},
					additionalProperties: false,
				},
			],
		},
	},
	boom() {},
	foo2: {
		meta: {
			schema: createRuleSchema("array", { type: "string" }, {
				uniqueItems: true,
				minItems: 1,
			}),
		},
	},
});

const createPropertySchema = () => ({
	type: "object",
	properties: {
		array: { type: "boolean" },
		object: { type: "boolean" },
	},
	additionalProperties: false,
});

const baseConfig = {
	files: ["**/*.js"],
	language: "@/js",
	plugins: {
		"@": {
			languages: {
				js: jslang,
			},
			rules: createPluginRules(),
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

//-----------------------------------------------------------------------------
// Test Helpers
//-----------------------------------------------------------------------------

function createFlatConfigArray(configs) {
	return new FlatConfigArray(configs, {
		baseConfig: [baseConfig],
	});
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
	nullishConfigs: [
		{ value: void 0, type: "undefined" },
		{ value: null, type: "null" },
	],
};

const createExpectedJsonConfig = (overrides = {}) => ({
	plugins: ["@"],
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
	...overrides,
});

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

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");
			const expected = createExpectedJsonConfig({
				plugins: ["@", "a", "b"],
			});
			const actual = config.toJSON();

			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
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

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");
			const expected = createExpectedJsonConfig({
				plugins: ["@", "a", "b:b-plugin@2.3.1"],
			});
			const actual = config.toJSON();

			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
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

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");
			const expected = createExpectedJsonConfig({
				plugins: ["@", "a", "b:b-plugin@2.3.1"],
			});
			const actual = config.toJSON();

			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
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

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");
			const expected = createExpectedJsonConfig({
				languageOptions: {
					...createExpectedJsonConfig().languageOptions,
					globals: {
						name: "off",
					},
				},
			});
			const actual = config.toJSON();

			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
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

			configs.normalizeSync();

			const config = configs.getConfig("file.my");

			const expected = {
				plugins: ["@", "test"],
				language: "test/my",
				languageOptions: {},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				processor: void 0,
			};
			const actual = config.toJSON();

			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
		});

		it("should throw an error when config with unnamed parser object is normalized", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: {
						parser: {
							parse() {},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.throws(() => {
				config.toJSON();
			}, /Cannot serialize key "parse"/u);
		});

		it("should throw an error when config with unnamed parser object with empty meta object is normalized", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: {
						parser: {
							meta: {},
							parse() {},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.throws(() => {
				config.toJSON();
			}, /Cannot serialize key "parse"/u);
		});

		it("should throw an error when config with unnamed parser object with only meta version is normalized", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: {
						parser: {
							meta: {
								version: "0.1.1",
							},
							parse() {},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.throws(() => {
				config.toJSON();
			}, /Cannot serialize key "parse"/u);
		});

		it("should not throw an error when config with named parser object is normalized", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: {
						parser: {
							meta: {
								name: "custom-parser",
							},
							parse() {},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), createExpectedJsonConfig({
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser",
					parserOptions: {},
					sourceType: "module",
				},
			}));
		});

		it("should not throw an error when config with named and versioned parser object is normalized", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: {
						parser: {
							meta: {
								name: "custom-parser",
								version: "0.1.0",
							},
							parse() {},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), createExpectedJsonConfig({
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser@0.1.0",
					parserOptions: {},
					sourceType: "module",
				},
			}));
		});

		it("should not throw an error when config with meta-named and versioned parser object is normalized", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: {
						parser: {
							meta: {
								name: "custom-parser",
							},
							version: "0.1.0",
							parse() {},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), createExpectedJsonConfig({
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser@0.1.0",
					parserOptions: {},
					sourceType: "module",
				},
			}));
		});

		it("should not throw an error when config with named and versioned parser object outside of meta object is normalized", () => {
			const configs = new FlatConfigArray([
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

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), createExpectedJsonConfig({
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser@0.1.0",
					parserOptions: {},
					sourceType: "module",
				},
			}));
		});

		it("should throw an error when config with unnamed processor object is normalized", () => {
			const configs = new FlatConfigArray([
				{
					processor: {
						preprocess() {},
						postprocess() {},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.throws(() => {
				config.toJSON();
			}, /Could not serialize processor/u);
		});

		it("should throw an error when config with processor object with empty meta object is normalized", () => {
			const configs = new FlatConfigArray([
				{
					processor: {
						meta: {},
						preprocess() {},
						postprocess() {},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.throws(() => {
				config.toJSON();
			}, /Could not serialize processor/u);
		});

		it("should not throw an error when config with named processor object is normalized", () => {
			const configs = new FlatConfigArray([
				{
					processor: {
						meta: {
							name: "custom-processor",
						},
						preprocess() {},
						postprocess() {},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), createExpectedJsonConfig({
				processor: "custom-processor",
				languageOptions: {
					ecma
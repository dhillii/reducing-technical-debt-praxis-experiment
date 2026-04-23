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
			languages: { js: jslang },
			rules: {
				foo: { meta: { schema: { type: "array", items: [{ enum: ["always", "never"] }], minItems: 0, maxItems: 1 } } },
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
											VariableDeclarator: {
												type: "object",
												properties: { array: { type: "boolean" }, object: { type: "boolean" } },
												additionalProperties: false,
											},
											AssignmentExpression: {
												type: "object",
												properties: { array: { type: "boolean" }, object: { type: "boolean" } },
												additionalProperties: false,
											},
										},
										additionalProperties: false,
									},
									{
										type: "object",
										properties: { array: { type: "boolean" }, object: { type: "boolean" } },
										additionalProperties: false,
									},
								],
							},
							{
								type: "object",
								properties: { enforceForRenamedProperties: { type: "boolean" } },
								additionalProperties: false,
							},
						],
					},
				},
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
		test1: { rules: { match: {} } },
		test2: { rules: { nomatch: {} } },
	},
};

/**
 * Creates a config array with the correct default options.
 * @param {*[]} configs
 * @returns {FlatConfigArray}
 */
function createFlatConfigArray(configs) {
	return new FlatConfigArray(configs, { baseConfig: [baseConfig] });
}

/**
 * Asserts that a given set of configs will be merged into the given result config.
 * @param {*[]} values
 * @param {Object} result
 */
async function assertMergedResult(values, result) {
	const configs = createFlatConfigArray(values);
	await configs.normalize();
	const config = configs.getConfig("foo.js");

	if (!result.language) result.language = jslang;
	if (!result.languageOptions) {
		result.languageOptions = jslang.normalizeLanguageOptions(jslang.defaultLanguageOptions);
	}
	assert.deepStrictEqual(config, result);
}

/**
 * Asserts that a given set of configs results in an invalid config.
 * @param {*[]} values
 * @param {string|RegExp} message
 */
async function assertInvalidConfig(values, message) {
	const configs = createFlatConfigArray(values);
	assert.throws(() => {
		configs.normalizeSync();
		configs.getConfig("foo.js");
	}, message);
}

//-----------------------------------------------------------------------------
// Test Data
//-----------------------------------------------------------------------------

const invalidKeyTests = [
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

const settingsMergeTests = [
	{
		desc: "merge two objects",
		values: [{ settings: { a: true, b: false } }, { settings: { c: true, d: false } }],
		expected: { plugins: baseConfig.plugins, settings: { a: true, b: false, c: true, d: false } },
	},
	{
		desc: "merge with overrides",
		values: [
			{ settings: { a: true, b: false, d: [1, 2], e: [5, 6] } },
			{ settings: { c: true, a: false, d: [3, 4] } },
		],
		expected: {
			plugins: baseConfig.plugins,
			settings: { a: false, b: false, c: true, d: [3, 4], e: [5, 6] },
		},
	},
	{
		desc: "deep merge with overrides",
		values: [
			{ settings: { object: { a: true, b: false } } },
			{ settings: { object: { c: true, a: false } } },
		],
		expected: {
			plugins: baseConfig.plugins,
			settings: { object: { a: false, b: false, c: true } },
		},
	},
	{
		desc: "merge object and undefined",
		values: [{ settings: { a: true, b: false } }, {}],
		expected: { plugins: baseConfig.plugins, settings: { a: true, b: false } },
	},
	{
		desc: "merge undefined and object",
		values: [{}, { settings: { a: true, b: false } }],
		expected: { plugins: baseConfig.plugins, settings: { a: true, b: false } },
	},
];

const pluginsMergeTests = [
	{
		desc: "merge two objects",
		values: [{ plugins: { a: {}, b: {} } }, { plugins: { c: {} } }],
		expected: {
			plugins: { a: {}, b: {}, c: {}, ...baseConfig.plugins },
		},
	},
	{
		desc: "merge object and undefined",
		values: [{ plugins: { a: {}, b: {} } }, {}],
		expected: {
			plugins: { a: {}, b: {}, ...baseConfig.plugins },
		},
	},
];

const processorTests = [
	{
		desc: "merge string then object",
		values: [
			{ processor: { preprocess() {}, postprocess() {} } },
			{
				plugins: { markdown: { processors: { markdown: { preprocess() {}, postprocess() {} } } } },
				processor: "markdown/markdown",
			},
		],
		expected: {
			plugins: {
				markdown: { processors: { markdown: { preprocess() {}, postprocess() {} } } },
				...baseConfig.plugins,
			},
			processor: { preprocess() {}, postprocess() {} },
		},
	},
	{
		desc: "merge string then object",
		values: [{ processor: "markdown/markdown" }, { processor: { preprocess() {}, postprocess() {} } }],
		expected: { plugins: baseConfig.plugins, processor: { preprocess() {}, postprocess() {} } },
	},
];

const invalidProcessorTests = [
	{ values: [{ processor: "foo" }], message: "pluginName/objectName" },
	{ values: [{ processor: "" }], message: "pluginName/objectName" },
	{ values: [{ processor: {} }], message: "Object must have a preprocess() and a postprocess() method." },
	{
		values: [{ plugins: { foo: {} }, processor: "foo/bar" }],
		message: /Could not find "bar" in plugin "foo"/u,
	},
];

const linterOptionsTests = [
	{
		desc: "unexpected key",
		values: [{ linterOptions: { foo: true } }],
		message: 'Unexpected key "foo" found.',
	},
	{
		desc: "noInlineConfig invalid",
		values: [{ linterOptions: { noInlineConfig: "true" } }],
		message: "Expected a Boolean.",
	},
	{
		desc: "noInlineConfig merge",
		values: [{ linterOptions: { noInlineConfig: true } }, { linterOptions: { noInlineConfig: false } }],
		expected: { plugins: baseConfig.plugins, linterOptions: { noInlineConfig: false } },
	},
	{
		desc: "reportUnusedDisableDirectives invalid",
		values: [{ linterOptions: { reportUnusedDisableDirectives: {} } }],
		message: /Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
	},
	{
		desc: "reportUnusedDisableDirectives merge",
		values: [
			{ linterOptions: { reportUnusedDisableDirectives: "off" } },
			{ linterOptions: { reportUnusedDisableDirectives: "warn" } },
		],
		expected: { plugins: baseConfig.plugins, linterOptions: { reportUnusedDisableDirectives: 1 } },
	},
];

const languageOptionsTests = [
	{
		desc: "unexpected key",
		values: [{ language: "@/js", languageOptions: { foo: true } }],
		message: 'Unexpected key "foo" found.',
	},
	{
		desc: "ecmaVersion merge",
		values: [
			{ language: "@/js", languageOptions: { ecmaVersion: 2019 } },
			{ languageOptions: { ecmaVersion: 2021 } },
		],
		expected: {
			plugins: baseConfig.plugins,
			language: jslang,
			languageOptions: { ...jslang.defaultLanguageOptions, ecmaVersion: 2021 },
		},
	},
	{
		desc: "sourceType merge",
		values: [
			{ language: "@/js", languageOptions: { sourceType: "module" } },
			{ languageOptions: { sourceType: "script" } },
		],
		expected: {
			plugins: baseConfig.plugins,
			language: jslang,
			languageOptions: {
				...jslang.defaultLanguageOptions,
				sourceType: "script",
				parserOptions: { sourceType: "script" },
			},
		},
	},
	{
		desc: "globals merge",
		values: [
			{ language: "@/js", languageOptions: { globals: { foo: "readonly" } } },
			{ languageOptions: { globals: { bar: "writable" } } },
		],
		expected: {
			plugins: baseConfig.plugins,
			language: jslang,
			languageOptions: {
				...jslang.defaultLanguageOptions,
				globals: { foo: "readonly", bar: "writable" },
			},
		},
	},
	{
		desc: "parser merge",
		values: [
			{ language: "@/js", languageOptions: { parser: { parse() {} } } },
			{ languageOptions: { parser: { parse() {} } } },
		],
		expected: {
			plugins: { ...baseConfig.plugins },
			language: jslang,
			languageOptions: { ...jslang.defaultLanguageOptions, parser: { parse() {} } },
		},
	},
	{
		desc: "parserOptions merge",
		values: [
			{ language: "@/js", languageOptions: { parserOptions: { foo: "whatever" } } },
			{ languageOptions: { parserOptions: { bar: "baz" } } },
		],
		expected: {
			plugins: baseConfig.plugins,
			language: jslang,
			languageOptions: {
				...jslang.defaultLanguageOptions,
				parserOptions: { foo: "whatever", bar: "baz", sourceType: "module" },
			},
		},
	},
];

const ruleTests = [
	{
		desc: "unexpected value",
		values: [{ rules: true }],
		message: "Expected an object.",
	},
	{
		desc: "invalid severity",
		values: [{ rules: { foo: true } }],
		message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
	},
	{
		desc: "invalid severity type",
		values: [{ rules: { foo: 3 } }],
		message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
	},
	{
		desc: "uppercase severity",
		values: [{ rules: { foo: "Error" } }],
		message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
	},
	{
		desc: "invalid array severity",
		values: [{ rules: { foo: [true] } }],
		message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
	},
	{
		desc: "non‑existent rule",
		values: [{ rules: { foox: [1, "bar"] } }],
		message: /Key "rules": Key "foox": Could not find "foox" in plugin "@"./u,
	},
	{
		desc: "suggest alternative",
		values: [{ rules: { "test2/match": "error" } }],
		message: /Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
	},
	{
		desc: "non‑existent plugin",
		values: [{ rules: { "doesnt-exist/match": "error" } }],
		message: /Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
	},
	{
		desc: "options not matching schema",
		values: [{ rules: { foo: [1, "bar"] } }],
		message: /Value "bar" should be equal to one of the allowed values/u,
	},
	{
		desc: "schema requires at least one item",
		values: [{ rules: { foo2: 1 } }],
		message: /Value \[\] should NOT have fewer than 1 items/u,
	},
];

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("FlatConfigArray", () => {
	it("should allow noniterable baseConfig objects", () => {
		const base = { languageOptions: { parserOptions: { foo: true } } };
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
		assert.notStrictEqual(base[0].languageOptions.parserOptions, config.languageOptions.parserOptions);
	});

	describe("Serialization of configs", () => {
		const serializationTests = [
			{
				desc: "basic config",
				configs: [{ plugins: { a: {}, b: {} } }],
				expected: {
					plugins: ["@", "a", "b"],
					language: "@/js",
					languageOptions: {
						ecmaVersion: LATEST_ECMA_VERSION,
						sourceType: "module",
						parser: `espree@${espree.version}`,
						parserOptions: { sourceType: "module" },
					},
					linterOptions: { reportUnusedDisableDirectives: 1 },
					processor: void 0,
				},
			},
			{
				desc: "plugin with name/version",
				configs: [{ plugins: { a: {}, b: { name: "b-plugin", version: "2.3.1" } } }],
				expected: {
					plugins: ["@", "a", "b:b-plugin@2.3.1"],
					language: "@/js",
					languageOptions: {
						ecmaVersion: LATEST_ECMA_VERSION,
						sourceType: "module",
						parser: `espree@${espree.version}`,
						parserOptions: { sourceType: "module" },
					},
					linterOptions: { reportUnusedDisableDirectives: 1 },
					processor: void 0,
				},
			},
			{
				desc: "plugin with meta",
				configs: [{ plugins: { a: {}, b: { meta: { name: "b-plugin", version: "2.3.1" } } } }],
				expected: {
					plugins: ["@", "a", "b:b-plugin@2.3.1"],
					language: "@/js",
					languageOptions: {
						ecmaVersion: LATEST_ECMA_VERSION,
						sourceType: "module",
						parser: `espree@${espree.version}`,
						parserOptions: { sourceType: "module" },
					},
					linterOptions: { reportUnusedDisableDirectives: 1 },
					processor: void 0,
				},
			},
			{
				desc: "globals name",
				configs: [{ languageOptions: { globals: { name: "off" } } }],
				expected: {
					plugins: ["@"],
					language: "@/js",
					languageOptions: {
						ecmaVersion: LATEST_ECMA_VERSION,
						sourceType: "module",
						parser: `espree@${espree.version}`,
						parserOptions: { sourceType: "module" },
						globals: { name: "off" },
					},
					linterOptions: { reportUnusedDisableDirectives: 1 },
					processor: void 0,
				},
			},
			{
				desc: "empty languageOptions",
				configs: [
					{
						files: ["**/*.my"],
						plugins: { test: { languages: { my: { validateLanguageOptions() {} } } } },
						language: "test/my",
					},
				],
				expected: {
					plugins: ["@", "test"],
					language: "test/my",
					languageOptions: {},
					linterOptions: { reportUnusedDisableDirectives: 1 },
					processor: void 0,
				},
			},
		];

		serializationTests.forEach(({ desc, configs, expected }) => {
			it(`should convert config into normalized JSON object – ${desc}`, () => {
				const cfg = new FlatConfigArray(configs);
				cfg.normalizeSync();
				const config = cfg.getConfig("foo.js");
				const actual = config.toJSON();
				assert.deepStrictEqual(actual, expected);
				assert.strictEqual(stringify(actual), stringify(expected));
			});
		});

		it("should throw an error when config with unnamed parser object is normalized", () => {
			const cfg = new FlatConfigArray([
				{
					languageOptions: {
						parser: { parse() {} },
					},
				},
			]);
			cfg.normalizeSync();
			const config = cfg.getConfig("foo.js");
			assert.throws(() => config.toJSON(), /Cannot serialize key "parse"/u);
		});

		it("should not throw an error when config with named parser object is normalized", () => {
			const cfg = new FlatConfigArray([
				{
					languageOptions: {
						parser: { meta: { name: "custom-parser" }, parse() {} },
					},
				},
			]);
			cfg.normalizeSync();
			const config = cfg.getConfig("foo.js");
			assert.deepStrictEqual(config.toJSON(), {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser",
					parserOptions: {},
					sourceType: "module",
				},
				linterOptions: { reportUnusedDisableDirectives: 1 },
				plugins: ["@"],
				processor: void 0,
			});
		});

		it("should not throw an error when config with named and versioned parser object is normalized", () => {
			const cfg = new FlatConfigArray([
				{
					languageOptions: {
						parser: { meta: { name: "custom-parser", version: "0.1.0" }, parse() {} },
					},
				},
			]);
			cfg.normalizeSync();
			const config = cfg.getConfig("foo.js");
			assert.deepStrictEqual(config.toJSON(), {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: "custom-parser@0.1.0",
					parserOptions: {},
					sourceType: "module",
				},
				linterOptions: { reportUnusedDisableDirectives: 1 },
				plugins: ["@"],
				processor: void 0,
			});
		});

		it("should throw an error when config with unnamed processor object is normalized", () => {
			const cfg = new FlatConfigArray([
				{
					processor: { preprocess() {}, postprocess() {} },
				},
			]);
			cfg.normalizeSync();
			const config = cfg.getConfig("foo.js");
			assert.throws(() => config.toJSON(), /Could not serialize processor/u);
		});

		it("should not throw an error when config with named processor object is normalized", () => {
			const cfg = new FlatConfigArray([
				{
					processor: { meta: { name: "custom-processor" }, preprocess() {}, postprocess() {} },
				},
			]);
			cfg.normalizeSync();
			const config = cfg.getConfig("foo.js");
			assert.deepStrictEqual(config.toJSON(), {
				language: "@/js",
				languageOptions: {
					ecmaVersion: LATEST_ECMA_VERSION,
					parser: `espree@${espree.version}`,
					parserOptions: { sourceType: "module" },
					sourceType: "module",
				},
				linterOptions: { reportUnusedDisableDirectives: 1 },
				plugins: ["@"],
				processor: "custom-processor",
			});
		});
	});

	describe("Config array elements", () => {
		[
			{ values: ["eslint:recommended"], message: "Config (unnamed): Unexpected non-object config at original index 0." },
			{ values: ["eslint:all"], message: "Config (unnamed): Unexpected non-object config at original index 0." },
		].forEach(({ values, message }) => {
			it(`should error on '${values[0]}' string config`, async () => {
				await assertInvalidConfig(values, message);
			});
		});

		const undefinedNullTests = [
			{ values: [void 0], syncMsg: "Config (unnamed): Unexpected undefined config at original index 0.", asyncMsg: "Config (unnamed): Unexpected undefined config at original index 0." },
			{ values: [null], syncMsg: "Config (unnamed): Unexpected null config at original index 0.", asyncMsg: "Config (unnamed): Unexpected null config at original index 0." },
		];

		undefinedNullTests.forEach(({ values, syncMsg, asyncMsg }) => {
			it(`should throw an error when ${values[0] === void 0 ? "undefined" : "null"} original config is normalized`, () => {
				const cfg = new FlatConfigArray(values);
				assert.throws(() => cfg.normalizeSync(), syncMsg);
			});

			it(`should throw an error when ${values[0] === void 0 ? "undefined" : "null"} original config is normalized asynchronously`, async () => {
				const cfg = new FlatConfigArray(values);
				try {
					await cfg.normalize();
					assert.fail("Error not thrown");
				} catch (e) {
					assert.strictEqual(e.message, asyncMsg);
				}
			});
		});

		const baseUserTests = [
			{ location: "base", config: [void 0], syncMsg: "Config (unnamed): Unexpected undefined config at base index 0.", asyncMsg: "Config (unnamed): Unexpected undefined config at base index 0." },
			{ location: "base", config: [null], syncMsg: "Config (unnamed): Unexpected null config at base index 0.", asyncMsg: "Config (unnamed): Unexpected null config at base index 0." },
			{ location: "user-defined", config: [void 0], syncMsg: "Config (unnamed): Unexpected undefined config at user-defined index 0.", asyncMsg: "Config (unnamed): Unexpected undefined config at user-defined index 0." },
			{ location: "user-defined", config: [null], syncMsg: "Config (unnamed): Unexpected null config at user-defined index 0.", asyncMsg: "Config (unnamed): Unexpected null config at user-defined index 0." },
		];

		baseUserTests.forEach(({ location, config, syncMsg, asyncMsg }) => {
			it(`should throw an error when ${location} config is ${syncMsg.includes("undefined") ? "undefined" : "null"} synchronously`, () => {
				const cfg = new FlatConfigArray([], { baseConfig: location === "base" ? config : undefined });
				if (location === "user-defined") cfg.push(...config);
				assert.throws(() => cfg.normalizeSync(), syncMsg);
			});

			it(`should throw an error when ${location} config is ${asyncMsg.includes("undefined") ? "undefined" : "null"} asynchronously`, async () => {
				const cfg = new FlatConfigArray([], { baseConfig: location === "base" ? config : undefined });
				if (location === "user-defined") cfg.push(...config);
				try {
					await cfg.normalize();
					assert.fail("Error not thrown");
				} catch (e) {
					assert.strictEqual(e.message, asyncMsg);
				}
			});
		});
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			settingsMergeTests.forEach(({ desc, values, expected }) => {
				it(`should ${desc}`, () => assertMergedResult(values, expected));
			});
		});

		describe("plugins", () => {
			pluginsMergeTests.forEach(({ desc, values, expected }) => {
				it(`should ${desc}`, () => assertMergedResult(values, expected));
			});

			it("should error when attempting to redefine a plugin", async () => {
				await assertInvalidConfig(
					[
						{ plugins: { a: {}, b: {} } },
						{ plugins: { a: {} } },
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
			processorTests.forEach(({ desc, values, expected }) => {
				it(`should ${desc}`, () => assertMergedResult(values, expected));
			});

			invalidProcessorTests.forEach(({ values, message }) => {
				it("should error when an invalid processor is used", async () => {
					await assertInvalidConfig(values, message);
				});
			});
		});

		describe("linterOptions", () => {
			linterOptionsTests.forEach(test => {
				if (test.message) {
					it(`should ${test.desc}`, async () => {
						await assertInvalidConfig(test.values, test.message);
					});
				} else {
					it(`should ${test.desc}`, () => assertMergedResult(test.values, test.expected));
				}
			});
		});

		describe("languageOptions", () => {
			languageOptionsTests.forEach(test => {
				if (test.message) {
					it(`should ${test.desc}`, async () => {
						await assertInvalidConfig(test.values, test.message);
					});
				} else {
					it(`should ${test.desc}`, () => assertMergedResult(test.values, test.expected));
				}
			});
		});

		describe("rules", () => {
			ruleTests.forEach(test => {
				if (test.message) {
					it(`should ${test.desc}`, async () => {
						await assertInvalidConfig(test.values, test.message);
					});
				} else {
					it(`should ${test.desc}`, () => assertMergedResult(test.values, test.expected));
				}
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

			it("should merge with simple overrides", () =>
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

			it("should merge with array overrides", () =>
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

			it("should merge with plugin rules", () =>
				assertMergedResult(
					[
						{ rules: { foo: [1, "always"], bar: "error" } },
						{
							plugins: { "@foo/baz/boom": { rules: { bang: {} } } },
							rules: { foo: ["error"], bar: 0, "@foo/baz/boom/bang": "error" },
						},
					],
					{
						plugins: {
							...baseConfig.plugins,
							"@foo/baz/boom": { rules: { bang: {} } },
						},
						rules: { foo: [2, "always"], bar: [0], "@foo/baz/boom/bang": [2] },
					},
				));

			it("should merge object and undefined", () =>
				assertMergedResult(
					[{ rules: { foo: 0, bar: 1 } }, {}],
					{
						plugins: baseConfig.plugins,
						rules: { foo: [0], bar: [1] },
					},
				));

			it("should merge non‑existent rules when off", () =>
				assertMergedResult(
					[
						{ rules: { foo: 0, bar: 1 } },
						{ rules: { nonExistentRule: 0, nonExistentRule2: ["off", "bar"] } },
					],
					{
						plugins: baseConfig.plugins,
						rules: { foo: [0], bar: [1], nonExistentRule: [0], nonExistentRule2: [0, "bar"] },
					},
				));
		});

		describe("Invalid Keys", () => {
			invalidKeyTests.forEach(key => {
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

	describe("Shared references between rule configs", () => {
		it("shared rule config should not cause a rule validation error", () => {
			const ruleConfig = ["error", {}];
			const cfg = new FlatConfigArray([
				{ rules: { camelcase: ruleConfig, "default-case": ruleConfig } },
			]);
			cfg.normalizeSync();
			const config = cfg.getConfig("foo.js");
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
			const cfg = new FlatConfigArray([
				{ rules: { camelcase: ruleConfig } },
				{
					rules: {
						"default-case": ruleConfig,
						camelcase: ["error", { ignoreDestructuring: Date }],
					},
				},
			]);
			cfg.normalizeSync();
			assert.throws(() => cfg.getConfig("foo.js"), /Key "rules": Key "camelcase":/u);
		});
	});
});
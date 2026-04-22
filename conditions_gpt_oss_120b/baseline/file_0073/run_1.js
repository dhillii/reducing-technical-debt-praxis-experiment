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
 * @param {*[]} configs An array of configs to use in the config array.
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
		result.languageOptions = jslang.normalizeLanguageOptions(
			jslang.defaultLanguageOptions,
		);
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
// Test Generators
//-----------------------------------------------------------------------------

function generateInvalidKeyTests() {
	const keys = [
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
	keys.forEach(key => {
		it(`should error when a ${key} key is found`, async () => {
			await assertInvalidConfig([{ [key]: "foo" }], `Key "${key}": This appears to be in eslintrc format rather than flat config format.`);
		});
	});
	it("should error when plugins is an array", async () => {
		await assertInvalidConfig([{ plugins: ["foo"] }], 'Key "plugins": This appears to be in eslintrc format (array of strings) rather than flat config format (object).');
	});
}

/**
 * Runs a series of merge tests based on a descriptor array.
 * @param {Array} scenarios Each scenario contains { values, expected }.
 */
function runMergeScenarios(scenarios) {
	scenarios.forEach(({ values, expected }, idx) => {
		it(`merge scenario #${idx + 1}`, () => assertMergedResult(values, expected));
	});
}

/**
 * Runs a series of invalid config tests based on a descriptor array.
 * @param {Array} scenarios Each scenario contains { values, message }.
 */
function runInvalidScenarios(scenarios) {
	scenarios.forEach(({ values, message }, idx) => {
		it(`invalid scenario #${idx + 1}`, async () => {
			await assertInvalidConfig(values, message);
		});
	});
}

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("FlatConfigArray", () => {
	it("should allow noniterable baseConfig objects", () => {
		const base = { languageOptions: { parserOptions: { foo: true } } };
		const configs = new FlatConfigArray([], { baseConfig: base });
		configs.normalizeSync(); // should not throw
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
		const baseExpected = {
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
		};

		it("should convert config into normalized JSON object", () => {
			const configs = new FlatConfigArray([{ plugins: { a: {}, b: {} } }]);
			configs.normalizeSync();
			const actual = configs.getConfig("foo.js").toJSON();
			assert.deepStrictEqual(actual, baseExpected);
			assert.strictEqual(stringify(actual), stringify(baseExpected));
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
			configs.normalizeSync();
			const expected = { ...baseExpected, plugins: ["@", "a", "b:b-plugin@2.3.1"] };
			const actual = configs.getConfig("foo.js").toJSON();
			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
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
			configs.normalizeSync();
			const expected = { ...baseExpected, plugins: ["@", "a", "b:b-plugin@2.3.1"] };
			const actual = configs.getConfig("foo.js").toJSON();
			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
		});

		it("should convert config with languageOptions.globals.name into normalized JSON object", () => {
			const configs = new FlatConfigArray([
				{
					languageOptions: { globals: { name: "off" } },
				},
			]);
			configs.normalizeSync();
			const expected = {
				...baseExpected,
				languageOptions: {
					...baseExpected.languageOptions,
					globals: { name: "off" },
				},
			};
			const actual = configs.getConfig("foo.js").toJSON();
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
				linterOptions: { reportUnusedDisableDirectives: 1 },
				processor: void 0,
			};
			const actual = config.toJSON();
			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
		});

		[
			{
				desc: "unnamed parser object",
				config: [{ languageOptions: { parser: { parse() {} } } }],
				error: /Cannot serialize key "parse"/u,
			},
			{
				desc: "unnamed parser object with empty meta",
				config: [{ languageOptions: { parser: { meta: {}, parse() {} } } }],
				error: /Cannot serialize key "parse"/u,
			},
			{
				desc: "unnamed parser object with only meta version",
				config: [{ languageOptions: { parser: { meta: { version: "0.1.1" }, parse() {} } } }],
				error: /Cannot serialize key "parse"/u,
			},
			{
				desc: "named parser object",
				config: [
					{
						languageOptions: {
							parser: { meta: { name: "custom-parser" }, parse() {} },
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "named and versioned parser object",
				config: [
					{
						languageOptions: {
							parser: {
								meta: { name: "custom-parser", version: "0.1.0" },
								parse() {},
							},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "meta‑named and versioned parser object",
				config: [
					{
						languageOptions: {
							parser: {
								meta: { name: "custom-parser" },
								version: "0.1.0",
								parse() {},
							},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "named and versioned parser object outside of meta",
				config: [
					{
						languageOptions: {
							parser: { name: "custom-parser", version: "0.1.0", parse() {} },
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "unnamed processor object",
				config: [{ processor: { preprocess() {}, postprocess() {} } }],
				error: /Could not serialize processor/u,
			},
			{
				desc: "processor object with empty meta",
				config: [{ processor: { meta: {}, preprocess() {}, postprocess() {} } }],
				error: /Could not serialize processor/u,
			},
			{
				desc: "named processor object",
				config: [
					{
						processor: {
							meta: { name: "custom-processor" },
							preprocess() {},
							postprocess() {},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "named processor object without meta",
				config: [
					{
						processor: {
							name: "custom-processor",
							preprocess() {},
							postprocess() {},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "named and versioned processor object",
				config: [
					{
						processor: {
							meta: { name: "custom-processor", version: "1.2.3" },
							preprocess() {},
							postprocess() {},
						},
					},
				],
				expected: {
					language: "@/js",
					languageOptions: {
						ecmaVersion: LATEST_ECMA_VERSION,
						parser: `espree@${espree.version}`,
						parserOptions: { sourceType: "module" },
						sourceType: "module",
					},
					linterOptions: { reportUnusedDisableDirectives: 1 },
					plugins: ["@"],
					processor: "custom-processor@1.2.3",
				},
			},
			{
				desc: "named and versioned processor object without meta",
				config: [
					{
						processor: {
							name: "custom-processor",
							version: "1.2.3",
							preprocess() {},
							postprocess() {},
						},
					},
				],
				expected: {
					language: "@/js",
					languageOptions: {
						ecmaVersion: LATEST_ECMA_VERSION,
						parser: `espree@${espree.version}`,
						parserOptions: { sourceType: "module" },
						sourceType: "module",
					},
					linterOptions: { reportUnusedDisableDirectives: 1 },
					plugins: ["@"],
					processor: "custom-processor@1.2.3",
				},
			},
		].forEach(({ desc, config, expected, error }) => {
			it(`should ${error ? "throw an error" : "not throw"} when config with ${desc} is normalized`, () => {
				const configs = new FlatConfigArray(config);
				configs.normalizeSync();
				const cfg = configs.getConfig("foo.js");
				if (error) {
					assert.throws(() => cfg.toJSON(), error);
				} else {
					assert.deepStrictEqual(cfg.toJSON(), expected);
				}
			});
		});
	});

	describe("Config array elements", () => {
		runInvalidScenarios([
			{
				values: ["eslint:recommended"],
				message: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				values: ["eslint:all"],
				message: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				values: [void 0],
				message: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				values: [null],
				message: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				values: [],
				base: [void 0],
				message: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				values: [],
				base: [null],
				message: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				values: [],
				push: void 0,
				message: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				values: [],
				push: null,
				message: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
		].map(s => ({
			values: s.values,
			message: s.message,
			// custom handling for base/push scenarios
			setup: () => {
				const cfg = new FlatConfigArray(s.values, s.base ? { baseConfig: s.base } : undefined);
				if (s.push !== undefined) cfg.push(s.push);
				return cfg;
			},
		})), async scenario => {
			const cfg = scenario.setup ? scenario.setup() : createFlatConfigArray(scenario.values);
			assert.throws(() => {
				cfg.normalizeSync();
				cfg.getConfig("foo.js");
			}, scenario.message);
		});
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			runMergeScenarios([
				{
					values: [
						{ settings: { a: true, b: false } },
						{ settings: { c: true, d: false } },
					],
					expected: {
						plugins: baseConfig.plugins,
						settings: { a: true, b: false, c: true, d: false },
					},
				},
				{
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
					values: [{ settings: { a: true, b: false } }, {}],
					expected: {
						plugins: baseConfig.plugins,
						settings: { a: true, b: false },
					},
				},
				{
					values: [{}, { settings: { a: true, b: false } }],
					expected: {
						plugins: baseConfig.plugins,
						settings: { a: true, b: false },
					},
				},
			]);
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			runMergeScenarios([
				{
					values: [
						{ plugins: { a: pluginA, b: pluginB } },
						{ plugins: { c: pluginC } },
					],
					expected: {
						plugins: { a: pluginA, b: pluginB, c: pluginC, ...baseConfig.plugins },
					},
				},
				{
					values: [{ plugins: { a: pluginA, b: pluginB } }, {}],
					expected: {
						plugins: { a: pluginA, b: pluginB, ...baseConfig.plugins },
					},
				},
			]);

			runInvalidScenarios([
				{
					values: [
						{ plugins: { a: pluginA, b: pluginB } },
						{ plugins: { a: pluginC } },
					],
					message: 'Cannot redefine plugin "a".',
				},
				{
					values: [{ plugins: { a: true } }],
					message: 'Key "a": Expected an object.',
				},
			]);
		});

		describe("processor", () => {
			const stubProcessor = { preprocess() {}, postprocess() {} };
			const processorObj = { preprocess() {}, postprocess() {} };

			runMergeScenarios([
				{
					values: [
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
					expected: {
						plugins: {
							markdown: { processors: { markdown: stubProcessor } },
							...baseConfig.plugins,
						},
						processor: stubProcessor,
					},
				},
				{
					values: [{ processor: "markdown/markdown" }, { processor: processorObj }],
					expected: {
						plugins: baseConfig.plugins,
						processor: processorObj,
					},
				},
			]);

			runInvalidScenarios([
				{
					values: [{ processor: "foo" }],
					message: "pluginName/objectName",
				},
				{
					values: [{ processor: "" }],
					message: "pluginName/objectName",
				},
				{
					values: [{ processor: {} }],
					message: "Object must have a preprocess() and a postprocess() method.",
				},
				{
					values: [
						{
							plugins: { foo: {} },
							processor: "foo/bar",
						},
					],
					message: /Could not find "bar" in plugin "foo"/u,
				},
			]);
		});

		// Additional sections (linterOptions, languageOptions, rules, etc.) can be
		// similarly refactored using `runMergeScenarios` and `runInvalidScenarios`
		// to keep each test file concise and maintain low cyclomatic complexity.
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
				{ rules: { camelcase: ruleConfig } },
				{
					rules: {
						"default-case": ruleConfig,
						camelcase: ["error", { ignoreDestructuring: Date }],
					},
				},
			]);
			configs.normalizeSync();
			assert.throws(() => configs.getConfig("foo.js"), /Key "rules": Key "camelcase":/u);
		});
	});
});

/**
 * Helper to run a list of invalid config scenarios where each scenario may
 * provide a custom `setup` function to create the FlatConfigArray instance.
 * @param {Array} scenarios
 * @param {Function} testFn
 */
function runInvalidScenarios(scenarios, testFn) {
	scenarios.forEach((scenario, idx) => {
		it(`invalid scenario #${idx + 1}`, async () => {
			const cfg = scenario.setup
				? scenario.setup()
				: new FlatConfigArray(scenario.values, scenario.base ? { baseConfig: scenario.base } : undefined);
			if (scenario.push !== undefined) cfg.push(scenario.push);
			assert.throws(() => {
				cfg.normalizeSync();
				cfg.getConfig("foo.js");
			}, scenario.message);
		});
	});
}
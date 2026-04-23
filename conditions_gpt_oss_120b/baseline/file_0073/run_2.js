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
 * Asserts that a given set of configs will be merged into the given
 * result config.
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
 * @returns {void}
 */
function assertInvalidConfig(values, message) {
	const configs = createFlatConfigArray(values);
	assert.throws(() => {
		configs.normalizeSync();
		configs.getConfig("foo.js");
	}, message);
}

/**
 * Runs a series of invalid‑config tests.
 * @param {Array<{config:*[], message:string|RegExp}>} cases
 * @returns {Promise<void>}
 */
async function runInvalidConfigCases(cases) {
	for (const { config, message } of cases) {
		await assertInvalidConfig(config, message);
	}
}

/**
 * Runs a series of merge‑tests.
 * @param {Array<{configs:*[], expected:Object}>} cases
 * @returns {Promise<void>}
 */
async function runMergeCases(cases) {
	for (const { configs, expected } of cases) {
		await assertMergedResult(configs, expected);
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
		const serializationCases = [
			{
				desc: "should convert config into normalized JSON object",
				configs: [
					{
						plugins: {
							a: {},
							b: {},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "should convert config with plugin name/version into normalized JSON object",
				configs: [
					{
						plugins: {
							a: {},
							b: {
								name: "b-plugin",
								version: "2.3.1",
							},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "should convert config with plugin meta into normalized JSON object",
				configs: [
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
				],
				expected: {
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
				},
			},
			{
				desc: "should convert config with languageOptions.globals.name into normalized JSON object",
				configs: [
					{
						languageOptions: {
							globals: {
								name: "off",
							},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "should serialize languageOptions as an empty object if neither configured nor default languageOptions are specified",
				configs: [
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
				],
				expected: {
					plugins: ["@", "test"],
					language: "test/my",
					languageOptions: {},
					linterOptions: {
						reportUnusedDisableDirectives: 1,
					},
					processor: void 0,
				},
			},
		];

		serializationCases.forEach(({ desc, configs, expected }) => {
			it(desc, () => {
				const cfg = new FlatConfigArray(configs);
				cfg.normalizeSync();
				const actual = cfg.getConfig("foo.js").toJSON();
				assert.deepStrictEqual(actual, expected);
				assert.strictEqual(stringify(actual), stringify(expected));
			});
		});

		const errorSerializationCases = [
			{
				desc: "should throw an error when config with unnamed parser object is normalized",
				configs: [
					{
						languageOptions: {
							parser: {
								parse() {
									/* empty */
								},
							},
						},
					},
				],
				error: /Cannot serialize key "parse"/u,
			},
			{
				desc: "should throw an error when config with unnamed parser object with empty meta object is normalized",
				configs: [
					{
						languageOptions: {
							parser: {
								meta: {},
								parse() {
									/* empty */
								},
							},
						},
					},
				],
				error: /Cannot serialize key "parse"/u,
			},
			{
				desc: "should throw an error when config with unnamed parser object with only meta version is normalized",
				configs: [
					{
						languageOptions: {
							parser: {
								meta: {
									version: "0.1.1",
								},
								parse() {
									/* empty */
								},
							},
						},
					},
				],
				error: /Cannot serialize key "parse"/u,
			},
			{
				desc: "should not throw an error when config with named parser object is normalized",
				configs: [
					{
						languageOptions: {
							parser: {
								meta: {
									name: "custom-parser",
								},
								parse() {
									/* empty */
								},
							},
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
					linterOptions: {
						reportUnusedDisableDirectives: 1,
					},
					plugins: ["@"],
					processor: void 0,
				},
			},
			{
				desc: "should not throw an error when config with named and versioned parser object is normalized",
				configs: [
					{
						languageOptions: {
							parser: {
								meta: {
									name: "custom-parser",
									version: "0.1.0",
								},
								parse() {
									/* empty */
								},
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
					linterOptions: {
						reportUnusedDisableDirectives: 1,
					},
					plugins: ["@"],
					processor: void 0,
				},
			},
			{
				desc: "should not throw an error when config with meta-named and versioned parser object is normalized",
				configs: [
					{
						languageOptions: {
							parser: {
								meta: {
									name: "custom-parser",
								},
								version: "0.1.0",
								parse() {
									/* empty */
								},
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
					linterOptions: {
						reportUnusedDisableDirectives: 1,
					},
					plugins: ["@"],
					processor: void 0,
				},
			},
			{
				desc: "should not throw an error when config with named and versioned parser object outside of meta object is normalized",
				configs: [
					{
						languageOptions: {
							parser: {
								name: "custom-parser",
								version: "0.1.0",
								parse() {
									/* empty */
								},
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
					linterOptions: {
						reportUnusedDisableDirectives: 1,
					},
					plugins: ["@"],
					processor: void 0,
				},
			},
			{
				desc: "should throw an error when config with unnamed processor object is normalized",
				configs: [
					{
						processor: {
							preprocess() {
								/* empty */
							},
							postprocess() {
								/* empty */
							},
						},
					},
				],
				error: /Could not serialize processor/u,
			},
			{
				desc: "should throw an error when config with processor object with empty meta object is normalized",
				configs: [
					{
						processor: {
							meta: {},
							preprocess() {
								/* empty */
							},
							postprocess() {
								/* empty */
							},
						},
					},
				],
				error: /Could not serialize processor/u,
			},
			{
				desc: "should not throw an error when config with named processor object is normalized",
				configs: [
					{
						processor: {
							meta: {
								name: "custom-processor",
							},
							preprocess() {
								/* empty */
							},
							postprocess() {
								/* empty */
							},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "should not throw an error when config with named processor object without meta is normalized",
				configs: [
					{
						processor: {
							name: "custom-processor",
							preprocess() {
								/* empty */
							},
							postprocess() {
								/* empty */
							},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "should not throw an error when config with named and versioned processor object is normalized",
				configs: [
					{
						processor: {
							meta: {
								name: "custom-processor",
								version: "1.2.3",
							},
							preprocess() {
								/* empty */
							},
							postprocess() {
								/* empty */
							},
						},
					},
				],
				expected: {
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
				},
			},
			{
				desc: "should not throw an error when config with named and versioned processor object without meta is normalized",
				configs: [
					{
						processor: {
							name: "custom-processor",
							version: "1.2.3",
							preprocess() {
								/* empty */
							},
							postprocess() {
								/* empty */
							},
						},
					},
				],
				expected: {
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
				},
			},
		];

		errorSerializationCases.forEach(({ desc, configs, error, expected }) => {
			it(desc, () => {
				const cfg = new FlatConfigArray(configs);
				cfg.normalizeSync();
				const config = cfg.getConfig("foo.js");
				if (error) {
					assert.throws(() => config.toJSON(), error);
				} else {
					assert.deepStrictEqual(config.toJSON(), expected);
				}
			});
		});
	});

	describe("Config array elements", () => {
		const elementErrorCases = [
			{
				desc: "should error on 'eslint:recommended' string config",
				configs: ["eslint:recommended"],
				message:
					"Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				desc: "should error on 'eslint:all' string config",
				configs: ["eslint:all"],
				message:
					"Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				desc: "should throw an error when undefined original config is normalized",
				configs: [void 0],
				message:
					"Config (unnamed): Unexpected undefined config at original index 0.",
				async: true,
			},
			{
				desc: "should throw an error when null original config is normalized",
				configs: [null],
				message:
					"Config (unnamed): Unexpected null config at original index 0.",
				async: true,
			},
			{
				desc: "should throw an error when undefined base config is normalized",
				configs: [],
				base: [void 0],
				message:
					"Config (unnamed): Unexpected undefined config at base index 0.",
				async: true,
			},
			{
				desc: "should throw an error when null base config is normalized",
				configs: [],
				base: [null],
				message:
					"Config (unnamed): Unexpected null config at base index 0.",
				async: true,
			},
			{
				desc: "should throw an error when undefined user-defined config is normalized",
				configs: [],
				push: void 0,
				message:
					"Config (unnamed): Unexpected undefined config at user-defined index 0.",
				async: true,
			},
			{
				desc: "should throw an error when null user-defined config is normalized",
				configs: [],
				push: null,
				message:
					"Config (unnamed): Unexpected null config at user-defined index 0.",
				async: true,
			},
		];

		elementErrorCases.forEach(
			({ desc, configs, base, push, message, async }) => {
				if (async) {
					it(desc, async () => {
						const cfg = new FlatConfigArray(configs, {
							baseConfig: base,
						});
						if (push !== undefined) {
							cfg.push(push);
						}
						try {
							await cfg.normalize();
							assert.fail("Error not thrown");
						} catch (err) {
							assert.strictEqual(err.message, message);
						}
					});
				} else {
					it(desc, () => {
						const cfg = new FlatConfigArray(configs, {
							baseConfig: base,
						});
						if (push !== undefined) {
							cfg.push(push);
						}
						assert.throws(() => cfg.normalizeSync(), message);
					});
				}
			},
		);
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			const settingsCases = [
				{
					desc: "should merge two objects",
					configs: [
						{ settings: { a: true, b: false } },
						{ settings: { c: true, d: false } },
					],
					expected: {
						plugins: baseConfig.plugins,
						settings: { a: true, b: false, c: true, d: false },
					},
				},
				{
					desc: "should merge two objects when second object has overrides",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						settings: {
							a: false,
							b: false,
							c: true,
							d: [3, 4],
							e: [5, 6],
						},
					},
				},
				{
					desc: "should deeply merge two objects when second object has overrides",
					configs: [
						{
							settings: {
								object: { a: true, b: false },
							},
						},
						{
							settings: {
								object: { c: true, a: false },
							},
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						settings: {
							object: { a: false, b: false, c: true },
						},
					},
				},
				{
					desc: "should merge an object and undefined into one object",
					configs: [
						{
							settings: { a: true, b: false },
						},
						{},
					],
					expected: {
						plugins: baseConfig.plugins,
						settings: { a: true, b: false },
					},
				},
				{
					desc: "should merge undefined and an object into one object",
					configs: [
						{},
						{
							settings: { a: true, b: false },
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						settings: { a: true, b: false },
					},
				},
			];

			settingsCases.forEach(({ desc, configs, expected }) => {
				it(desc, () => assertMergedResult(configs, expected));
			});
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			const pluginCases = [
				{
					desc: "should merge two objects",
					configs: [
						{ plugins: { a: pluginA, b: pluginB } },
						{ plugins: { c: pluginC } },
					],
					expected: {
						plugins: {
							a: pluginA,
							b: pluginB,
							c: pluginC,
							...baseConfig.plugins,
						},
					},
				},
				{
					desc: "should merge an object and undefined into one object",
					configs: [
						{ plugins: { a: pluginA, b: pluginB } },
						{},
					],
					expected: {
						plugins: {
							a: pluginA,
							b: pluginB,
							...baseConfig.plugins,
						},
					},
				},
			];

			pluginCases.forEach(({ desc, configs, expected }) => {
				it(desc, () => assertMergedResult(configs, expected));
			});

			it("should error when attempting to redefine a plugin", async () => {
				await assertInvalidConfig(
					[
						{
							plugins: { a: pluginA, b: pluginB },
						},
						{
							plugins: { a: pluginC },
						},
					],
					'Cannot redefine plugin "a".',
				);
			});

			it("should error when plugin is not an object", async () => {
				await assertInvalidConfig(
					[
						{
							plugins: { a: true },
						},
					],
					'Key "a": Expected an object.',
				);
			});
		});

		describe("processor", () => {
			const stubProcessor = {
				preprocess() {},
				postprocess() {},
			};

			const processorCases = [
				{
					desc: "should merge two values when second is a string",
					configs: [
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
					expected: {
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
				},
				{
					desc: "should merge two values when second is an object",
					configs: [
						{ processor: "markdown/markdown" },
						{ processor: stubProcessor },
					],
					expected: {
						plugins: baseConfig.plugins,
						processor: stubProcessor,
					},
				},
			];

			processorCases.forEach(({ desc, configs, expected }) => {
				it(desc, () => assertMergedResult(configs, expected));
			});

			const processorErrorCases = [
				{
					configs: [{ processor: "foo" }],
					message: "pluginName/objectName",
				},
				{
					configs: [{ processor: "" }],
					message: "pluginName/objectName",
				},
				{
					configs: [{ processor: {} }],
					message:
						"Object must have a preprocess() and a postprocess() method.",
				},
				{
					configs: [
						{
							plugins: { foo: {} },
							processor: "foo/bar",
						},
					],
					message: /Could not find "bar" in plugin "foo"/u,
				},
			];

			processorErrorCases.forEach(({ configs, message }) => {
				it("should error when an invalid processor is used", async () => {
					await assertInvalidConfig(configs, message);
				});
			});
		});

		describe("linterOptions", () => {
			it("should error when an unexpected key is found", async () => {
				await assertInvalidConfig(
					[
						{
							linterOptions: { foo: true },
						},
					],
					'Unexpected key "foo" found.',
				);
			});

			describe("noInlineConfig", () => {
				const noInlineCases = [
					{
						desc: "should error when an unexpected value is found",
						configs: [
							{
								linterOptions: { noInlineConfig: "true" },
							},
						],
						message: "Expected a Boolean.",
					},
					{
						desc: "should merge two objects when second object has overrides",
						configs: [
							{ linterOptions: { noInlineConfig: true } },
							{ linterOptions: { noInlineConfig: false } },
						],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { noInlineConfig: false },
						},
					},
					{
						desc: "should merge an object and undefined into one object",
						configs: [
							{ linterOptions: { noInlineConfig: false } },
							{},
						],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { noInlineConfig: false },
						},
					},
					{
						desc: "should merge undefined and an object into one object",
						configs: [
							{},
							{ linterOptions: { noInlineConfig: false } },
						],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { noInlineConfig: false },
						},
					},
				];

				noInlineCases.forEach(({ desc, configs, message, expected }) => {
					if (message) {
						it(desc, async () => {
							await assertInvalidConfig(configs, message);
						});
					} else {
						it(desc, () => assertMergedResult(configs, expected));
					}
				});
			});

			describe("reportUnusedDisableDirectives", () => {
				const reportCases = [
					{
						desc: "should error when an unexpected value is found",
						configs: [
							{
								linterOptions: {
									reportUnusedDisableDirectives: {},
								},
							},
						],
						message: /Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
					},
					{
						desc: "should merge two objects when second object has overrides",
						configs: [
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
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedDisableDirectives: 1 },
						},
					},
					{
						desc: "should merge an object and undefined into one object",
						configs: [
							{},
							{
								linterOptions: {
									reportUnusedDisableDirectives: "warn",
								},
							},
						],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedDisableDirectives: 1 },
						},
					},
				];

				reportCases.forEach(({ desc, configs, message, expected }) => {
					if (message) {
						it(desc, async () => {
							await assertInvalidConfig(configs, message);
						});
					} else {
						it(desc, () => assertMergedResult(configs, expected));
					}
				});
			});

			describe("reportUnusedInlineConfigs", () => {
				const inlineCases = [
					{
						desc: "should error when an unexpected value is found",
						configs: [
							{
								linterOptions: {
									reportUnusedInlineConfigs: {},
								},
							},
						],
						message: /Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
					},
					{
						desc: "should merge two objects when second object has overrides",
						configs: [
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
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedInlineConfigs: 1 },
						},
					},
					{
						desc: "should merge an object and undefined into one object",
						configs: [
							{},
							{
								linterOptions: {
									reportUnusedInlineConfigs: "warn",
								},
							},
						],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedInlineConfigs: 1 },
						},
					},
				];

				inlineCases.forEach(({ desc, configs, message, expected }) => {
					if (message) {
						it(desc, async () => {
							await assertInvalidConfig(configs, message);
						});
					} else {
						it(desc, () => assertMergedResult(configs, expected));
					}
				});
			});
		});

		describe("languageOptions", () => {
			it("should error when an unexpected key is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: { foo: true },
						},
					],
					'Unexpected key "foo" found.',
				);
			});

			const languageOptionCases = [
				{
					desc: "should merge two languageOptions objects with different properties",
					configs: [
						{
							language: "@/js",
							languageOptions: { ecmaVersion: 2019 },
						},
						{
							languageOptions: { sourceType: "commonjs" },
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							ecmaVersion: 2019,
							sourceType: "commonjs",
							parserOptions: { sourceType: "commonjs" },
						},
					},
				},
				{
					desc: "should get default languageOptions from the language",
					configs: [
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
					],
					expected: { languageOptions: { foo: 42 } },
				},
				{
					desc: "should merge configured languageOptions over default languageOptions from the language",
					configs: [
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
					],
					expected: { languageOptions: { foo: 42, bar: 43 } },
				},
				{
					desc: "should use configured languageOptions when default languageOptions are not specified",
					configs: [
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
							languageOptions: { bar: 43 },
						},
					],
					expected: { languageOptions: { bar: 43 } },
				},
				{
					desc: "should default to an empty object if neither configured nor default languageOptions are specified",
					configs: [
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
					],
					expected: { languageOptions: {} },
				},
			];

			languageOptionCases.forEach(({ desc, configs, expected }) => {
				it(desc, async () => {
					const cfg = new FlatConfigArray(configs);
					await cfg.normalize();
					const config = cfg.getConfig(
						desc.includes("file.my") ? "file.my" : "foo.js",
					);
					if (expected.languageOptions) {
						assert.deepStrictEqual(
							config.languageOptions,
							expected.languageOptions,
						);
					} else {
						assert.deepStrictEqual(config, expected);
					}
				});
			});

			describe("ecmaVersion", () => {
				const ecmaCases = [
					{
						desc: "should error when an unexpected value is found",
						configs: [
							{
								language: "@/js",
								languageOptions: { ecmaVersion: "true" },
							},
						],
						message:
							/Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
					},
					{
						desc: "should merge two objects when second object has overrides",
						configs: [
							{
								language: "@/js",
								languageOptions: { ecmaVersion: 2019 },
							},
							{
								languageOptions: { ecmaVersion: 2021 },
							},
						],
						expected: {
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								ecmaVersion: 2021,
							},
						},
					},
				];

				ecmaCases.forEach(({ desc, configs, message, expected }) => {
					if (message) {
						it(desc, async () => {
							await assertInvalidConfig(configs, message);
						});
					} else {
						it(desc, () => assertMergedResult(configs, expected));
					}
				});
			});

			describe("sourceType", () => {
				const sourceCases = [
					{
						desc: "should error when an unexpected value is found",
						configs: [
							{
								language: "@/js",
								languageOptions: { sourceType: "true" },
							},
						],
						message:
							'Expected "script", "module", or "commonjs".',
					},
					{
						desc: "should merge two objects when second object has overrides",
						configs: [
							{
								language: "@/js",
								languageOptions: { sourceType: "module" },
							},
							{
								languageOptions: { sourceType: "script" },
							},
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
				];

				sourceCases.forEach(({ desc, configs, message, expected }) => {
					if (message) {
						it(desc, async () => {
							await assertInvalidConfig(configs, message);
						});
					} else {
						it(desc, () => assertMergedResult(configs, expected));
					}
				});
			});

			describe("globals", () => {
				const globalsCases = [
					{
						desc: "should error when an unexpected value is found",
						configs: [
							{
								language: "@/js",
								languageOptions: { globals: "true" },
							},
						],
						message: "Expected an object.",
					},
					{
						desc: "should error when an unexpected key value is found",
						configs: [
							{
								language: "@/js",
								languageOptions: {
									globals: { foo: "truex" },
								},
							},
						],
						message:
							'Key "foo": Expected "readonly", "writable", or "off".',
					},
					{
						desc: "should error when a global has leading whitespace",
						configs: [
							{
								language: "@/js",
								languageOptions: {
									globals: { " foo": "readonly" },
								},
							},
						],
						message: /Global " foo" has leading or trailing whitespace/u,
					},
					{
						desc: "should error when a global has trailing whitespace",
						configs: [
							{
								language: "@/js",
								languageOptions: {
									globals: { "foo ": "readonly" },
								},
							},
						],
						message: /Global "foo " has leading or trailing whitespace/u,
					},
					{
						desc: "should merge two objects when second object has different keys",
						configs: [
							{
								language: "@/js",
								languageOptions: {
									globals: { foo: "readonly" },
								},
							},
							{
								languageOptions: {
									globals: { bar: "writable" },
								},
							},
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
				];

				globalsCases.forEach(({ desc, configs, message, expected }) => {
					if (message) {
						it(desc, async () => {
							await assertInvalidConfig(configs, message);
						});
					} else {
						it(desc, () => assertMergedResult(configs, expected));
					}
				});
			});

			describe("parser", () => {
				const parserErrorCases = [
					{
						configs: [
							{
								language: "@/js",
								languageOptions: { parser: true },
							},
						],
						message:
							'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					},
					{
						configs: [
							{
								language: "@/js",
								languageOptions: { parser: null },
							},
						],
						message:
							'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					},
					{
						configs: [
							{
								language: "@/js",
								languageOptions: { parser: "foo/bar" },
							},
						],
						message:
							'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					},
					{
						configs: [
							{
								language: "@/js",
								languageOptions: { parser: {} },
							},
						],
						message:
							'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					},
				];

				parserErrorCases.forEach(({ configs, message }) => {
					it("should error when an unexpected value is found", async () => {
						await assertInvalidConfig(configs, message);
					});
				});

				it("should merge two objects when second object has overrides", () => {
					const parser = { parse() {} };
					const stubParser = { parse() {} };
					return assertMergedResult(
						[
							{
								language: "@/js",
								languageOptions: { parser },
							},
							{
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
				const parserOptionsCases = [
					{
						desc: "should error when an unexpected value is found",
						configs: [
							{
								language: "@/js",
								languageOptions: { parserOptions: "true" },
							},
						],
						message: "Expected an object.",
					},
					{
						desc: "should merge two objects when second object has different keys",
						configs: [
							{
								language: "@/js",
								languageOptions: {
									parserOptions: { foo: "whatever" },
								},
							},
							{
								languageOptions: {
									parserOptions: { bar: "baz" },
								},
							},
						],
						expected: {
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
					},
				];

				parserOptionsCases.forEach(
					({ desc, configs, message, expected }) => {
						if (message) {
							it(desc, async () => {
								await assertInvalidConfig(configs, message);
							});
						} else {
							it(desc, () => assertMergedResult(configs, expected));
						}
					},
				);
			});
		});

		describe("rules", () => {
			const ruleErrorCases = [
				{
					desc: "should error when an unexpected value is found",
					configs: [{ rules: true }],
					message: "Expected an object.",
				},
				{
					desc: "should error when an invalid rule severity is set",
					configs: [{ rules: { foo: true } }],
					message:
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					desc: "should error when an invalid rule severity of the right type is set",
					configs: [{ rules: { foo: 3 } }],
					message:
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					desc: "should error when a string rule severity is not in lowercase",
					configs: [{ rules: { foo: "Error" } }],
					message:
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					desc: "should error when an invalid rule severity is set in an array",
					configs: [{ rules: { foo: [true] } }],
					message:
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					desc: "should error when rule doesn't exist",
					configs: [{ rules: { foox: [1, "bar"] } }],
					message: /Key "rules": Key "foox": Could not find "foox" in plugin "@"./u,
				},
				{
					desc: "should error and suggest alternative when rule doesn't exist",
					configs: [{ rules: { "test2/match": "error" } }],
					message: /Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
				},
				{
					desc: "should error when plugin for rule doesn't exist",
					configs: [{ rules: { "doesnt-exist/match": "error" } }],
					message: /Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
				},
				{
					desc: "should error when rule options don't match schema",
					configs: [{ rules: { foo: [1, "bar"] } }],
					message: /Value "bar" should be equal to one of the allowed values/u,
				},
				{
					desc: "should error when rule options don't match schema requiring at least one item",
					configs: [{ rules: { foo2: 1 } }],
					message: /Value \[\] should NOT have fewer than 1 items/u,
				},
			];

			ruleErrorCases.forEach(({ desc, configs, message }) => {
				it(desc, async () => {
					await assertInvalidConfig(configs, message);
				});
			});

			const metaSchemaErrorCases = [
				null,
				true,
				0,
				1,
				"",
				"always",
				() => {},
			].map(schema => ({
				desc: `should error with a message that contains the rule name when a configured rule has invalid \`meta.schema\` (${schema})`,
				configs: [
					{
						plugins: {
							foo: {
								rules: {
									bar: {
										meta: { schema },
									},
								},
							},
						},
						rules: { "foo/bar": "error" },
					},
				],
				message:
					"Error while processing options validation schema of rule 'foo/bar': Rule's `meta.schema` must be an array or object",
			}));

			metaSchemaErrorCases.forEach(({ desc, configs, message }) => {
				it(desc, async () => {
					await assertInvalidConfig(configs, message);
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
											meta: {
												schema: { minItems: [] },
											},
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

			const ruleMergeCases = [
				{
					desc: "should merge two objects",
					configs: [
						{ rules: { foo: 1, bar: "error" } },
						{ rules: { baz: "warn", boom: 0 } },
					],
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [1],
							bar: [2],
							baz: [1],
							boom: [0],
						},
					},
				},
				{
					desc: "should merge two objects when second object has simple overrides",
					configs: [
						{
							rules: { foo: [1, "always"], bar: "error" },
						},
						{
							rules: { foo: "error", bar: 0 },
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [2, "always"],
							bar: [0],
						},
					},
				},
				{
					desc: "should merge two objects when second object has array overrides",
					configs: [
						{
							rules: { foo: 1, foo2: "error" },
						},
						{
							rules: {
								foo: ["error", "never"],
								foo2: ["warn", "foo"],
							},
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [2, "never"],
							foo2: [1, "foo"],
						},
					},
				},
				{
					desc: "should merge two objects and options when second object overrides without options",
					configs: [
						{
							rules: { foo: [1, "always"], bar: "error" },
						},
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
					expected: {
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
				},
				{
					desc: "should merge an object and undefined into one object",
					configs: [
						{ rules: { foo: 0, bar: 1 } },
						{},
					],
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [0],
							bar: [1],
						},
					},
				},
				{
					desc: "should merge a rule that doesn't exist without error when the rule is off",
					configs: [
						{ rules: { foo: 0, bar: 1 } },
						{
							rules: {
								nonExistentRule: 0,
								nonExistentRule2: ["off", "bar"],
							},
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [0],
							bar: [1],
							nonExistentRule: [0],
							nonExistentRule2: [0, "bar"],
						},
					},
				},
			];

			ruleMergeCases.forEach(({ desc, configs, expected }) => {
				it(desc, () => assertMergedResult(configs, expected));
			});

			const rulePropertyErrorCases = [
				{
					desc: "should error show expected properties",
					configs: [
						{
							rules: {
								"prefer-const": ["error", { destruct: true }],
							},
						},
					],
					message:
						'Unexpected property "destruct". Expected properties: "destructuring", "ignoreReadBeforeAssign"',
				},
				{
					configs: [
						{
							rules: {
								"prefer-destructuring": [
									"error",
									{ obj: true },
								],
							},
						},
					],
					message:
						'Unexpected property "obj". Expected properties: "VariableDeclarator", "AssignmentExpression"',
				},
				{
					configs: [
						{
							rules: {
								"prefer-destructuring": [
									"error",
									{ obj: true },
								],
							},
						},
					],
					message:
						'Unexpected property "obj". Expected properties: "array", "object"',
				},
				{
					configs: [
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
					message:
						'Unexpected property "enforceRenamedProperties". Expected properties: "enforceForRenamedProperties"',
				},
			];

			rulePropertyErrorCases.forEach(({ configs, message }) => {
				it("should error show expected properties", async () => {
					await assertInvalidConfig(configs, message);
				});
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
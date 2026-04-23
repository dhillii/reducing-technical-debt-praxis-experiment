/**
 * @fileoverview Tests for FlatConfigArray
 * @author Nicholas C. Zakas
 */

"use strict";

const { FlatConfigArray } = require("../../../lib/config/flat-config-array");
const assert = require("chai").assert;
const stringify = require("json-stable-stringify-without-jsonify");
const espree = require("espree");
const jslang = require("../../../lib/languages/js");
const { LATEST_ECMA_VERSION } = require("../../../conf/ecma-version");

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
		const tests = [
			{
				name: "convert config into normalized JSON object",
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
				name: "convert config with plugin name/version into normalized JSON object",
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
				name: "convert config with plugin meta into normalized JSON object",
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
				name: "convert config with languageOptions.globals.name into normalized JSON object",
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
				name: "serialize languageOptions as an empty object if neither configured nor default languageOptions are specified",
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
			{
				name: "throw an error when config with unnamed parser object is normalized",
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
				name: "throw an error when config with unnamed parser object with empty meta object is normalized",
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
				name: "throw an error when config with unnamed parser object with only meta version is normalized",
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
				name: "not throw an error when config with named parser object is normalized",
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
				name: "not throw an error when config with named and versioned parser object is normalized",
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
				name: "not throw an error when config with meta-named and versioned parser object is normalized",
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
				name: "not throw an error when config with named and versioned parser object outside of meta object is normalized",
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
				name: "throw an error when config with unnamed processor object is normalized",
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
				name: "throw an error when config with processor object with empty meta object is normalized",
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
				name: "not throw an error when config with named processor object is normalized",
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
				name: "not throw an error when config with named processor object without meta is normalized",
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
				name: "not throw an error when config with named and versioned processor object is normalized",
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
				name: "not throw an error when config with named and versioned processor object without meta is normalized",
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

		tests.forEach(({ name, configs, expected, error }) => {
			it(name, async () => {
				const configsInstance = new FlatConfigArray(configs);
				configsInstance.normalizeSync();
				const config = configsInstance.getConfig("foo.js");

				if (error) {
					assert.throws(() => config.toJSON(), error);
				} else {
					const actual = config.toJSON();
					assert.deepStrictEqual(actual, expected);
					assert.strictEqual(stringify(actual), stringify(expected));
				}
			});
		});
	});

	describe("Config array elements", () => {
		const tests = [
			{
				name: "error on 'eslint:recommended' string config",
				configs: ["eslint:recommended"],
				error: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				name: "error on 'eslint:all' string config",
				configs: ["eslint:all"],
				error: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				name: "throw an error when undefined original config is normalized",
				configs: [void 0],
				error: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				name: "throw an error when undefined original config is normalized asynchronously",
				configs: [void 0],
				async: true,
				error: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				name: "throw an error when null original config is normalized",
				configs: [null],
				error: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				name: "throw an error when null original config is normalized asynchronously",
				configs: [null],
				async: true,
				error: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				name: "throw an error when undefined base config is normalized",
				configs: [],
				baseConfig: [void 0],
				error: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				name: "throw an error when undefined base config is normalized asynchronously",
				configs: [],
				baseConfig: [void 0],
				async: true,
				error: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				name: "throw an error when null base config is normalized",
				configs: [],
				baseConfig: [null],
				error: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				name: "throw an error when null base config is normalized asynchronously",
				configs: [],
				baseConfig: [null],
				async: true,
				error: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				name: "throw an error when undefined user-defined config is normalized",
				configs: [],
				userDefined: [void 0],
				error: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				name: "throw an error when undefined user-defined config is normalized asynchronously",
				configs: [],
				userDefined: [void 0],
				async: true,
				error: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				name: "throw an error when null user-defined config is normalized",
				configs: [],
				userDefined: [null],
				error: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
			{
				name: "throw an error when null user-defined config is normalized asynchronously",
				configs: [],
				userDefined: [null],
				async: true,
				error: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
		];

		tests.forEach(({ name, configs, baseConfig, userDefined, async: isAsync, error }) => {
			it(name, async () => {
				const instance = new FlatConfigArray(configs, { baseConfig });
				if (userDefined) {
					userDefined.forEach(c => instance.push(c));
				}
				if (isAsync) {
					try {
						await instance.normalize();
						assert.fail("Error not thrown");
					} catch (err) {
						assert.strictEqual(err.message, error);
					}
				} else {
					assert.throws(() => {
						instance.normalizeSync();
					}, error);
				}
			});
		});
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			const tests = [
				{
					name: "merge two objects",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
							c: true,
							d: false,
						},
					},
				},
				{
					name: "merge two objects when second object has overrides",
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
					name: "deeply merge two objects when second object has overrides",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						settings: {
							object: {
								a: false,
								b: false,
								c: true,
							},
						},
					},
				},
				{
					name: "merge an object and undefined into one object",
					configs: [
						{
							settings: {
								a: true,
								b: false,
							},
						},
						{},
					],
					expected: {
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
						},
					},
				},
				{
					name: "merge undefined and an object into one object",
					configs: [
						{},
						{
							settings: {
								a: true,
								b: false,
							},
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
						},
					},
				},
			];

			tests.forEach(({ name, configs, expected }) => {
				it(name, () => assertMergedResult(configs, expected));
			});
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			const tests = [
				{
					name: "merge two objects",
					configs: [
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
					name: "merge an object and undefined into one object",
					configs: [
						{
							plugins: {
								a: pluginA,
								b: pluginB,
							},
						},
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
				{
					name: "error when attempting to redefine a plugin",
					configs: [
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
					error: 'Cannot redefine plugin "a".',
				},
				{
					name: "error when plugin is not an object",
					configs: [
						{
							plugins: {
								a: true,
							},
						},
					],
					error: 'Key "a": Expected an object.',
				},
			];

			tests.forEach(({ name, configs, expected, error }) => {
				if (error) {
					it(name, async () => await assertInvalidConfig(configs, error));
				} else {
					it(name, () => assertMergedResult(configs, expected));
				}
			});
		});

		describe("processor", () => {
			const stubProcessor = {
				preprocess() {},
				postprocess() {},
			};

			const tests = [
				{
					name: "merge two values when second is a string",
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
					name: "merge two values when second is an object",
					configs: [
						{
							processor: "markdown/markdown",
						},
						{
							processor: stubProcessor,
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						processor: stubProcessor,
					},
				},
				{
					name: "error when an invalid string is used",
					configs: [
						{
							processor: "foo",
						},
					],
					error: "pluginName/objectName",
				},
				{
					name: "error when an empty string is used",
					configs: [
						{
							processor: "",
						},
					],
					error: "pluginName/objectName",
				},
				{
					name: "error when an invalid processor is used",
					configs: [
						{
							processor: {},
						},
					],
					error: "Object must have a preprocess() and a postprocess() method.",
				},
				{
					name: "error when a processor cannot be found in a plugin",
					configs: [
						{
							plugins: {
								foo: {},
							},
							processor: "foo/bar",
						},
					],
					error: /Could not find "bar" in plugin "foo"/u,
				},
			];

			tests.forEach(({ name, configs, expected, error }) => {
				if (error) {
					it(name, async () => await assertInvalidConfig(configs, error));
				} else {
					it(name, () => assertMergedResult(configs, expected));
				}
			});
		});

		describe("linterOptions", () => {
			const tests = [
				{
					name: "error when an unexpected key is found",
					configs: [
						{
							linterOptions: {
								foo: true,
							},
						},
					],
					error: 'Unexpected key "foo" found.',
				},
				{
					name: "noInlineConfig error when unexpected value",
					configs: [
						{
							linterOptions: {
								noInlineConfig: "true",
							},
						},
					],
					error: "Expected a Boolean.",
				},
				{
					name: "noInlineConfig merge overrides",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						linterOptions: {
							noInlineConfig: false,
						},
					},
				},
				{
					name: "noInlineConfig merge object and undefined",
					configs: [
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
						{},
					],
					expected: {
						plugins: baseConfig.plugins,
						linterOptions: {
							noInlineConfig: false,
						},
					},
				},
				{
					name: "noInlineConfig merge undefined and object",
					configs: [
						{},
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						linterOptions: {
							noInlineConfig: false,
						},
					},
				},
				{
					name: "reportUnusedDisableDirectives error when unexpected value",
					configs: [
						{
							linterOptions: {
								reportUnusedDisableDirectives: {},
							},
						},
					],
					error: /Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
				},
				{
					name: "reportUnusedDisableDirectives merge overrides",
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
						linterOptions: {
							reportUnusedDisableDirectives: 1,
						},
					},
				},
				{
					name: "reportUnusedDisableDirectives merge object and undefined",
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
						linterOptions: {
							reportUnusedDisableDirectives: 1,
						},
					},
				},
				{
					name: "reportUnusedInlineConfigs error when unexpected value",
					configs: [
						{
							linterOptions: {
								reportUnusedInlineConfigs: {},
							},
						},
					],
					error: /Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
				},
				{
					name: "reportUnusedInlineConfigs merge overrides",
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
						linterOptions: {
							reportUnusedInlineConfigs: 1,
						},
					},
				},
				{
					name: "reportUnusedInlineConfigs merge object and undefined",
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
						linterOptions: {
							reportUnusedInlineConfigs: 1,
						},
					},
				},
			];

			tests.forEach(({ name, configs, expected, error }) => {
				if (error) {
					it(name, async () => await assertInvalidConfig(configs, error));
				} else {
					it(name, () => assertMergedResult(configs, expected));
				}
			});
		});

		describe("languageOptions", () => {
			const tests = [
				{
					name: "error when an unexpected key is found",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								foo: true,
							},
						},
					],
					error: 'Unexpected key "foo" found.',
				},
				{
					name: "merge two languageOptions objects with different properties",
					configs: [
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
					expected: {
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
				},
				{
					name: "get default languageOptions from the language",
					async: true,
					configs: [
						{
							files: ["**/*.my"],
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
						},
					],
					expected: {
						languageOptions: { foo: 42 },
					},
				},
				{
					name: "merge configured languageOptions over default languageOptions from the language",
					async: true,
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
							languageOptions: {
								bar: 43,
							},
						},
					],
					expected: {
						languageOptions: {
							foo: 42,
							bar: 43,
						},
					},
				},
				{
					name: "use configured languageOptions when default languageOptions are not specified",
					async: true,
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
							languageOptions: {
								bar: 43,
							},
						},
					],
					expected: {
						languageOptions: { bar: 43 },
					},
				},
				{
					name: "default to an empty object if neither configured nor default languageOptions are specified",
					async: true,
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
						languageOptions: {},
					},
				},
				{
					name: "ecmaVersion error when unexpected value",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: "true",
							},
						},
					],
					error: /Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
				},
				{
					name: "ecmaVersion merge overrides",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							ecmaVersion: 2021,
						},
					},
				},
				{
					name: "ecmaVersion merge object and undefined",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: 2021,
							},
						},
						{},
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
				{
					name: "ecmaVersion merge undefined and object",
					configs: [
						{},
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: 2021,
							},
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
				{
					name: "sourceType error when unexpected value",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								sourceType: "true",
							},
						},
					],
					error: 'Expected "script", "module", or "commonjs".',
				},
				{
					name: "sourceType merge overrides",
					configs: [
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
					expected: {
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
				},
				{
					name: "sourceType merge object and undefined",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								sourceType: "script",
							},
						},
						{},
					],
					expected: {
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
				},
				{
					name: "sourceType merge undefined and object",
					configs: [
						{},
						{
							language: "@/js",
							languageOptions: {
								sourceType: "module",
							},
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							sourceType: "module",
						},
					},
				},
				{
					name: "globals error when unexpected value",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								globals: "true",
							},
						},
					],
					error: "Expected an object.",
				},
				{
					name: "globals error when unexpected key value",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								globals: {
									foo: "truex",
								},
							},
						},
					],
					error: 'Key "foo": Expected "readonly", "writable", or "off".',
				},
				{
					name: "globals error when leading whitespace",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								globals: {
									" foo": "readonly",
								},
							},
						},
					],
					error: /Global " foo" has leading or trailing whitespace/u,
				},
				{
					name: "globals error when trailing whitespace",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								globals: {
									"foo ": "readonly",
								},
							},
						},
					],
					error: /Global "foo " has leading or trailing whitespace/u,
				},
				{
					name: "globals merge different keys",
					configs: [
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
					expected: {
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
				},
				{
					name: "globals merge overrides",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "writeable",
							},
						},
					},
				},
				{
					name: "globals merge object and undefined",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "readable",
							},
						},
					},
				},
				{
					name: "globals merge undefined and object",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "false",
							},
						},
					},
				},
				{
					name: "globals merge string and object",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: {
								foo: "false",
							},
						},
					},
				},
				{
					name: "parser error when unexpected value",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parser: true,
							},
						},
					],
					error: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				},
				{
					name: "parser error when null",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parser: null,
							},
						},
					],
					error: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				},
				{
					name: "parser error when string",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parser: "foo/bar",
							},
						},
					],
					error: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				},
				{
					name: "parser error when missing parse()",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parser: {},
							},
						},
					],
					error: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				},
				{
					name: "parser merge overrides",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parser: { parse() {} },
							},
						},
						{
							languageOptions: {
								parser: { parse() {} },
							},
						},
					],
					expected: {
						plugins: { ...baseConfig.plugins },
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parser: { parse() {} },
						},
					},
				},
				{
					name: "parser merge object and undefined",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parser: { parse() {} },
							},
						},
						{},
					],
					expected: {
						plugins: { ...baseConfig.plugins },
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parser: { parse() {} },
						},
					},
				},
				{
					name: "parser merge undefined and object",
					configs: [
						{},
						{
							language: "@/js",
							languageOptions: {
								parser: { parse() {} },
							},
						},
					],
					expected: {
						plugins: { ...baseConfig.plugins },
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							parser: { parse() {} },
						},
					},
				},
				{
					name: "parserOptions error when unexpected value",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parserOptions: "true",
							},
						},
					],
					error: "Expected an object.",
				},
				{
					name: "parserOptions merge different keys",
					configs: [
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
				{
					name: "parserOptions deep merge different keys",
					configs: [
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
					expected: {
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
				},
				{
					name: "parserOptions deep merge missing key",
					configs: [
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
					expected: {
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
				},
				{
					name: "parserOptions merge overrides",
					configs: [
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
					expected: {
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
				},
				{
					name: "parserOptions merge object and undefined",
					configs: [
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
					expected: {
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
				},
				{
					name: "parserOptions merge undefined and object",
					configs: [
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
					expected: {
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
				},
			];

			tests.forEach(({ name, configs, expected, error, async: isAsync }) => {
				if (error) {
					it(name, async () => await assertInvalidConfig(configs, error));
				} else if (isAsync) {
					it(name, async () => await assertMergedResult(configs, expected));
				} else {
					it(name, () => assertMergedResult(configs, expected));
				}
			});
		});

		describe("rules", () => {
			const tests = [
				{
					name: "error when an unexpected value is found",
					configs: [
						{
							rules: true,
						},
					],
					error: "Expected an object.",
				},
				{
					name: "error when an invalid rule severity is set",
					configs: [
						{
							rules: {
								foo: true,
							},
						},
					],
					error: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "error when an invalid rule severity of the right type is set",
					configs: [
						{
							rules: {
								foo: 3,
							},
						},
					],
					error: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "error when a string rule severity is not in lowercase",
					configs: [
						{
							rules: {
								foo: "Error",
							},
						},
					],
					error: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "error when an invalid rule severity is set in an array",
					configs: [
						{
							rules: {
								foo: [true],
							},
						},
					],
					error: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "error when rule doesn't exist",
					configs: [
						{
							rules: {
								foox: [1, "bar"],
							},
						},
					],
					error: /Key "rules": Key "foox": Could not find "foox" in plugin "@"./u,
				},
				{
					name: "error and suggest alternative when rule doesn't exist",
					configs: [
						{
							rules: {
								"test2/match": "error",
							},
						},
					],
					error: /Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
				},
				{
					name: "error when plugin for rule doesn't exist",
					configs: [
						{
							rules: {
								"doesnt-exist/match": "error",
							},
						},
					],
					error: /Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
				},
				{
					name: "error when rule options don't match schema",
					configs: [
						{
							rules: {
								foo: [1, "bar"],
							},
						},
					],
					error: /Value "bar" should be equal to one of the allowed values/u,
				},
				{
					name: "error when rule options don't match schema requiring at least one item",
					configs: [
						{
							rules: {
								foo2: 1,
							},
						},
					],
					error: /Value \[\] should NOT have fewer than 1 items/u,
				},
				{
					name: "error with rule name when meta.schema invalid (null)",
					configs: [
						{
							plugins: {
								foo: {
									rules: {
										bar: {
											meta: {
												schema: null,
											},
										},
									},
								},
							},
							rules: {
								"foo/bar": "error",
							},
						},
					],
					error: "Error while processing options validation schema of rule 'foo/bar': Rule's `meta.schema` must be an array or object",
				},
				{
					name: "error with rule name when meta.schema invalid (string)",
					configs: [
						{
							plugins: {
								foo: {
									rules: {
										bar: {
											meta: {
												schema: "string",
											},
										},
									},
								},
							},
							rules: {
								"foo/bar": "error",
							},
						},
					],
					error: "Error while processing options validation schema of rule 'foo/bar': Rule's `meta.schema` must be an array or object",
				},
				{
					name: "error with rule name when meta.schema invalid (invalid JSON Schema)",
					configs: [
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
							rules: {
								"foo/bar": "error",
							},
						},
					],
					error: "Error while processing options validation schema of rule 'foo/bar': minItems must be number",
				},
				{
					name: "allow rules with `schema:false` to have any configurations",
					configs: [
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
					],
					async: true,
				},
				{
					name: "allow rules without `meta` to be configured without options",
					configs: [
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
								"foo/bar": "error",
							},
						},
					],
					async: true,
				},
				{
					name: "allow rules without `meta.schema` to be configured without options",
					configs: [
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
					],
					async: true,
				},
				{
					name: "throw if a rule without `meta` is configured with an option",
					configs: [
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
					],
					error: /should NOT have more than 0 items/u,
				},
				{
					name: "throw if a rule without `meta.schema` is configured with an option",
					configs: [
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
					],
					error: /should NOT have more than 0 items/u,
				},
				{
					name: "merge two objects",
					configs: [
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
					name: "merge two objects when second has simple overrides",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [2, "always"],
							bar: [0],
						},
					},
				},
				{
					name: "merge two objects when second has array overrides",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [2, "never"],
							foo2: [1, "foo"],
						},
					},
				},
				{
					name: "merge two objects and options when second overrides without options",
					configs: [
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
					expected: {
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
				},
				{
					name: "merge an object and undefined into one object",
					configs: [
						{
							rules: {
								foo: 0,
								bar: 1,
							},
						},
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
					name: "merge a rule that doesn't exist without error when the rule is off",
					configs: [
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
				{
					name: "error show expected properties",
					configs: [
						{
							rules: {
								"prefer-const": ["error", { destruct: true }],
							},
						},
						{
							rules: {
								"prefer-destructuring": ["error", { obj: true }],
							},
						},
						{
							rules: {
								"prefer-destructuring": ["error", { object: true }, { enforceRenamedProperties: true }],
							},
						},
					],
					error: /Unexpected property "destruct"/u,
				},
			];

			tests.forEach(({ name, configs, expected, error, async: isAsync }) => {
				if (error) {
					it(name, async () => await assertInvalidConfig(configs, error));
				} else if (isAsync) {
					it(name, async () => await assertMergedResult(configs, expected));
				} else {
					it(name, () => assertMergedResult(configs, expected));
				}
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
	});

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

			assert.throws(() => {
				configs.getConfig("foo.js");
			}, /Key "rules": Key "camelcase":/u);
		});
	});
});
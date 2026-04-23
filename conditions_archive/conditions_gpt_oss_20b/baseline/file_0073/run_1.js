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
				desc: "convert config into normalized JSON object",
				input: [
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
				desc: "convert config with plugin name/version into normalized JSON object",
				input: [
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
				desc: "convert config with plugin meta into normalized JSON object",
				input: [
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
				desc: "convert config with languageOptions.globals.name into normalized JSON object",
				input: [
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
				desc: "serialize languageOptions as an empty object if neither configured nor default languageOptions are specified",
				input: [
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
				desc: "throw an error when config with unnamed parser object is normalized",
				input: [
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
				desc: "throw an error when config with unnamed parser object with empty meta object is normalized",
				input: [
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
				desc: "throw an error when config with unnamed parser object with only meta version is normalized",
				input: [
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
				desc: "not throw an error when config with named parser object is normalized",
				input: [
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
				desc: "not throw an error when config with named and versioned parser object is normalized",
				input: [
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
				desc: "not throw an error when config with meta-named and versioned parser object is normalized",
				input: [
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
				desc: "not throw an error when config with named and versioned parser object outside of meta object is normalized",
				input: [
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
				desc: "throw an error when config with unnamed processor object is normalized",
				input: [
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
				desc: "throw an error when config with processor object with empty meta object is normalized",
				input: [
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
				desc: "not throw an error when config with named processor object is normalized",
				input: [
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
				desc: "not throw an error when config with named processor object without meta is normalized",
				input: [
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
				desc: "not throw an error when config with named and versioned processor object is normalized",
				input: [
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
				desc: "not throw an error when config with named and versioned processor object without meta is normalized",
				input: [
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

		tests.forEach(({ desc, input, expected, error }) => {
			if (error) {
				it(desc, async () => {
					await assertInvalidConfig(input, error);
				});
			} else {
				it(desc, async () => {
					await assertMergedResult(input, expected);
				});
			}
		});
	});

	describe("Config array elements", () => {
		const tests = [
			{
				desc: "error on 'eslint:recommended' string config",
				input: ["eslint:recommended"],
				error: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				desc: "error on 'eslint:all' string config",
				input: ["eslint:all"],
				error: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				desc: "throw an error when undefined original config is normalized",
				input: [void 0],
				error: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				desc: "throw an error when undefined original config is normalized asynchronously",
				input: [void 0],
				async: true,
				error: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				desc: "throw an error when null original config is normalized",
				input: [null],
				error: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				desc: "throw an error when null original config is normalized asynchronously",
				input: [null],
				async: true,
				error: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				desc: "throw an error when undefined base config is normalized",
				input: [],
				baseConfig: [void 0],
				error: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				desc: "throw an error when undefined base config is normalized asynchronously",
				input: [],
				baseConfig: [void 0],
				async: true,
				error: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				desc: "throw an error when null base config is normalized",
				input: [],
				baseConfig: [null],
				error: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				desc: "throw an error when null base config is normalized asynchronously",
				input: [],
				baseConfig: [null],
				async: true,
				error: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				desc: "throw an error when undefined user-defined config is normalized",
				input: [],
				push: [void 0],
				error: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				desc: "throw an error when undefined user-defined config is normalized asynchronously",
				input: [],
				push: [void 0],
				async: true,
				error: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				desc: "throw an error when null user-defined config is normalized",
				input: [],
				push: [null],
				error: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
			{
				desc: "throw an error when null user-defined config is normalized asynchronously",
				input: [],
				push: [null],
				async: true,
				error: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
		];

		tests.forEach(
			({ desc, input, baseConfig: baseCfg, push, async: isAsync, error }) => {
				if (isAsync) {
					it(desc, async () => {
						const configs = new FlatConfigArray(input, {
							baseConfig: baseCfg,
						});
						if (push) push.forEach(c => configs.push(c));
						await assertInvalidConfig(configs, error);
					});
				} else {
					it(desc, () => {
						const configs = new FlatConfigArray(input, {
							baseConfig: baseCfg,
						});
						if (push) push.forEach(c => configs.push(c));
						assert.throws(() => {
							configs.normalizeSync();
							configs.getConfig("foo.js");
						}, error);
					});
				}
			},
		);
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			const tests = [
				{
					desc: "merge two objects",
					input: [
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
					desc: "merge two objects when second object has overrides",
					input: [
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
					desc: "deeply merge two objects when second object has overrides",
					input: [
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
					desc: "merge an object and undefined into one object",
					input: [
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
					desc: "merge undefined and an object into one object",
					input: [
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

			tests.forEach(({ desc, input, expected }) => {
				it(desc, async () => {
					await assertMergedResult(input, expected);
				});
			});
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			const tests = [
				{
					desc: "merge two objects",
					input: [
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
					desc: "merge an object and undefined into one object",
					input: [
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
					desc: "error when attempting to redefine a plugin",
					input: [
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
					desc: "error when plugin is not an object",
					input: [
						{
							plugins: {
								a: true,
							},
						},
					],
					error: 'Key "a": Expected an object.',
				},
			];

			tests.forEach(({ desc, input, expected, error }) => {
				if (error) {
					it(desc, async () => {
						await assertInvalidConfig(input, error);
					});
				} else {
					it(desc, async () => {
						await assertMergedResult(input, expected);
					});
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
					desc: "merge two values when second is a string",
					input: [
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
					desc: "merge two values when second is an object",
					input: [
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
					desc: "error when an invalid string is used",
					input: [
						{
							processor: "foo",
						},
					],
					error: "pluginName/objectName",
				},
				{
					desc: "error when an empty string is used",
					input: [
						{
							processor: "",
						},
					],
					error: "pluginName/objectName",
				},
				{
					desc: "error when an invalid processor is used",
					input: [
						{
							processor: {},
						},
					],
					error: "Object must have a preprocess() and a postprocess() method.",
				},
				{
					desc: "error when a processor cannot be found in a plugin",
					input: [
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

			tests.forEach(({ desc, input, expected, error }) => {
				if (error) {
					it(desc, async () => {
						await assertInvalidConfig(input, error);
					});
				} else {
					it(desc, async () => {
						await assertMergedResult(input, expected);
					});
				}
			});
		});

		describe("linterOptions", () => {
			const tests = [
				{
					desc: "error when an unexpected key is found",
					input: [
						{
							linterOptions: {
								foo: true,
							},
						},
					],
					error: 'Unexpected key "foo" found.',
				},
				{
					desc: "noInlineConfig: error when an unexpected value is found",
					input: [
						{
							linterOptions: {
								noInlineConfig: "true",
							},
						},
					],
					error: "Expected a Boolean.",
				},
				{
					desc: "noInlineConfig: merge two objects when second object has overrides",
					input: [
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
					desc: "noInlineConfig: merge an object and undefined into one object",
					input: [
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
					desc: "noInlineConfig: merge undefined and an object into one object",
					input: [
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
					desc: "reportUnusedDisableDirectives: error when an unexpected value is found",
					input: [
						{
							linterOptions: {
								reportUnusedDisableDirectives: {},
							},
						},
					],
					error: /Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
				},
				{
					desc: "reportUnusedDisableDirectives: merge two objects when second object has overrides",
					input: [
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
					desc: "reportUnusedDisableDirectives: merge an object and undefined into one object",
					input: [
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
					desc: "reportUnusedInlineConfigs: error when an unexpected value is found",
					input: [
						{
							linterOptions: {
								reportUnusedInlineConfigs: {},
							},
						},
					],
					error: /Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
				},
				{
					desc: "reportUnusedInlineConfigs: merge two objects when second object has overrides",
					input: [
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
					desc: "reportUnusedInlineConfigs: merge an object and undefined into one object",
					input: [
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

			tests.forEach(({ desc, input, expected, error }) => {
				if (error) {
					it(desc, async () => {
						await assertInvalidConfig(input, error);
					});
				} else {
					it(desc, async () => {
						await assertMergedResult(input, expected);
					});
				}
			});
		});

		describe("languageOptions", () => {
			const tests = [
				{
					desc: "error when an unexpected key is found",
					input: [
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
					desc: "merge two languageOptions objects with different properties",
					input: [
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
					desc: "get default languageOptions from the language",
					async: true,
					input: [
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
					desc: "merge configured languageOptions over default languageOptions from the language",
					async: true,
					input: [
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
					desc: "use configured languageOptions when default languageOptions are not specified",
					async: true,
					input: [
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
					desc: "default to an empty object if neither configured nor default languageOptions are specified",
					async: true,
					input: [
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
					desc: "ecmaVersion: error when an unexpected value is found",
					input: [
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
					desc: "ecmaVersion: merge two objects when second object has overrides",
					input: [
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
					desc: "ecmaVersion: merge an object and undefined into one object",
					input: [
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
					desc: "ecmaVersion: merge undefined and an object into one object",
					input: [
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
					desc: "sourceType: error when an unexpected value is found",
					input: [
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
					desc: "sourceType: merge two objects when second object has overrides",
					input: [
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
					desc: "sourceType: merge an object and undefined into one object",
					input: [
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
					desc: "sourceType: merge undefined and an object into one object",
					input: [
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
					desc: "globals: error when an unexpected value is found",
					input: [
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
					desc: "globals: error when an unexpected key value is found",
					input: [
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
					desc: "globals: error when a global has leading whitespace",
					input: [
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
					desc: "globals: error when a global has trailing whitespace",
					input: [
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
					desc: "globals: merge two objects when second object has different keys",
					input: [
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
					desc: "globals: merge two objects when second object has overrides",
					input: [
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
					desc: "globals: merge an object and undefined into one object",
					input: [
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
					desc: "globals: merge undefined and an object into one object",
					input: [
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
					desc: "globals: merge string and an object into one object",
					input: [
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
					desc: "parser: error when an unexpected value is found",
					input: [
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
					desc: "parser: error when a null is found",
					input: [
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
					desc: "parser: error when a parser is a string",
					input: [
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
					desc: "parser: error when a value doesn't have a parse() method",
					input: [
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
					desc: "parser: merge two objects when second object has overrides",
					input: [
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
					desc: "parser: merge an object and undefined into one object",
					input: [
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
					desc: "parser: merge undefined and an object into one object",
					input: [
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
					desc: "parserOptions: error when an unexpected value is found",
					input: [
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
					desc: "parserOptions: merge two objects when second object has different keys",
					input: [
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
					desc: "parserOptions: deeply merge two objects when second object has different keys",
					input: [
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
					desc: "parserOptions: deeply merge two objects when second object has missing key",
					input: [
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
					desc: "parserOptions: merge two objects when second object has overrides",
					input: [
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
					desc: "parserOptions: merge an object and undefined into one object",
					input: [
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
					desc: "parserOptions: merge undefined and an object into one object",
					input: [
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

			tests.forEach(({ desc, input, expected, error, async: isAsync }) => {
				if (error) {
					it(desc, async () => {
						await assertInvalidConfig(input, error);
					});
				} else {
					it(desc, async () => {
						await assertMergedResult(input, expected);
					});
				}
			});
		});

		describe("rules", () => {
			const tests = [
				{
					desc: "error when an unexpected value is found",
					input: [
						{
							rules: true,
						},
					],
					error: "Expected an object.",
				},
				{
					desc: "error when an invalid rule severity is set",
					input: [
						{
							rules: {
								foo: true,
							},
						},
					],
					error: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					desc: "error when an invalid rule severity of the right type is set",
					input: [
						{
							rules: {
								foo: 3,
							},
						},
					],
					error: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					desc: "error when a string rule severity is not in lowercase",
					input: [
						{
							rules: {
								foo: "Error",
							},
						},
					],
					error: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					desc: "error when an invalid rule severity is set in an array",
					input: [
						{
							rules: {
								foo: [true],
							},
						},
					],
					error: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					desc: "error when rule doesn't exist",
					input: [
						{
							rules: {
								foox: [1, "bar"],
							},
						},
					],
					error: /Key "rules": Key "foox": Could not find "foox" in plugin "@"/u,
				},
				{
					desc: "error and suggest alternative when rule doesn't exist",
					input: [
						{
							rules: {
								"test2/match": "error",
							},
						},
					],
					error: /Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
				},
				{
					desc: "error when plugin for rule doesn't exist",
					input: [
						{
							rules: {
								"doesnt-exist/match": "error",
							},
						},
					],
					error: /Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
				},
				{
					desc: "error when rule options don't match schema",
					input: [
						{
							rules: {
								foo: [1, "bar"],
							},
						},
					],
					error: /Value "bar" should be equal to one of the allowed values/,
				},
				{
					desc: "error when rule options don't match schema requiring at least one item",
					input: [
						{
							rules: {
								foo2: 1,
							},
						},
					],
					error: /Value \[\] should NOT have fewer than 1 items/,
				},
				{
					desc: "error with invalid meta.schema (null, true, 0, 1, '', 'always', function)",
					input: [
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
					desc: "error with invalid meta.schema (invalid JSON Schema definition)",
					input: [
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
					desc: "allow rules with `schema:false` to have any configurations",
					async: true,
					input: [
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
					expected: {
						rules: {
							"foo/bar": [2],
							"foo/baz": [2, "always"],
						},
					},
				},
				{
					desc: "allow rules without `meta` to be configured without options",
					async: true,
					input: [
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
					expected: {
						rules: {
							"foo/bar": [2],
						},
					},
				},
				{
					desc: "allow rules without `meta.schema` to be configured without options",
					async: true,
					input: [
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
					expected: {
						rules: {
							"foo/bar": [2],
						},
					},
				},
				{
					desc: "throw if a rule without `meta` is configured with an option",
					input: [
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
					error: /should NOT have more than 0 items/,
				},
				{
					desc: "throw if a rule without `meta.schema` is configured with an option",
					input: [
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
					error: /should NOT have more than 0 items/,
				},
				{
					desc: "merge two objects",
					input: [
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
					desc: "merge two objects when second object has simple overrides",
					input: [
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
					desc: "merge two objects when second object has array overrides",
					input: [
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
					desc: "merge two objects and options when second object overrides without options",
					input: [
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
					desc: "merge an object and undefined into one object",
					input: [
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
					desc: "merge a rule that doesn't exist without error when the rule is off",
					input: [
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
					desc: "error show expected properties",
					input: [
						{
							rules: {
								"prefer-const": ["error", { destruct: true }],
							},
						},
						{
							rules: {
								"prefer-destructuring": [
									"error",
									{ obj: true },
								],
							},
						},
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
					error: /Unexpected property "destruct"/u,
				},
			];

			tests.forEach(({ desc, input, expected, error, async: isAsync }) => {
				if (error) {
					it(desc, async () => {
						await assertInvalidConfig(input, error);
					});
				} else {
					it(desc, async () => {
						await assertMergedResult(input, expected);
					});
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
				it(`error when a ${key} key is found`, async () => {
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

			it("error when plugins is an array", async () => {
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
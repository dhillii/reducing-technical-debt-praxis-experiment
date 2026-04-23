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
		const serializationTests = [
			{
				description: "should convert config into normalized JSON object",
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
				description:
					"should convert config with plugin name/version into normalized JSON object",
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
				description:
					"should convert config with plugin meta into normalized JSON object",
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
				description:
					"should convert config with languageOptions.globals.name into normalized JSON object",
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
				description:
					"should serialize languageOptions as an empty object if neither configured nor default languageOptions are specified",
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
				description:
					"should throw an error when config with unnamed parser object is normalized",
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
				expectedError: /Cannot serialize key "parse"/u,
			},
			{
				description:
					"should throw an error when config with unnamed parser object with empty meta object is normalized",
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
				expectedError: /Cannot serialize key "parse"/u,
			},
			{
				description:
					"should throw an error when config with unnamed parser object with only meta version is normalized",
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
				expectedError: /Cannot serialize key "parse"/u,
			},
			{
				description:
					"should not throw an error when config with named parser object is normalized",
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
				description:
					"should not throw an error when config with named and versioned parser object is normalized",
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
				description:
					"should not throw an error when config with meta-named and versioned parser object is normalized",
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
				description:
					"should not throw an error when config with named and versioned parser object outside of meta object is normalized",
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
				description:
					"should throw an error when config with unnamed processor object is normalized",
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
				expectedError: /Could not serialize processor/u,
			},
			{
				description:
					"should throw an error when config with processor object with empty meta object is normalized",
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
				expectedError: /Could not serialize processor/u,
			},
			{
				description:
					"should not throw an error when config with named processor object is normalized",
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
				description:
					"should not throw an error when config with named processor object without meta is normalized",
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
				description:
					"should not throw an error when config with named and versioned processor object is normalized",
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
				description:
					"should not throw an error when config with named and versioned processor object without meta is normalized",
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

		serializationTests.forEach(({ description, configs, expected, expectedError }) => {
			it(description, () => {
				const configsInstance = new FlatConfigArray(configs);
				configsInstance.normalizeSync();
				const config = configsInstance.getConfig("foo.js");
				if (expectedError) {
					assert.throws(() => config.toJSON(), expectedError);
				} else {
					const actual = config.toJSON();
					assert.deepStrictEqual(actual, expected);
					assert.strictEqual(stringify(actual), stringify(expected));
				}
			});
		});
	});

	describe("Config array elements", () => {
		const elementTests = [
			{
				description: "should error on 'eslint:recommended' string config",
				values: ["eslint:recommended"],
				message: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				description: "should error on 'eslint:all' string config",
				values: ["eslint:all"],
				message: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				description: "should throw an error when undefined original config is normalized",
				values: [void 0],
				message: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				description: "should throw an error when undefined original config is normalized asynchronously",
				values: [void 0],
				message: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				description: "should throw an error when null original config is normalized",
				values: [null],
				message: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				description: "should throw an error when null original config is normalized asynchronously",
				values: [null],
				message: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				description: "should throw an error when undefined base config is normalized",
				values: [],
				baseConfig: [void 0],
				message: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				description: "should throw an error when undefined base config is normalized asynchronously",
				values: [],
				baseConfig: [void 0],
				message: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				description: "should throw an error when null base config is normalized",
				values: [],
				baseConfig: [null],
				message: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				description: "should throw an error when null base config is normalized asynchronously",
				values: [],
				baseConfig: [null],
				message: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				description: "should throw an error when undefined user-defined config is normalized",
				values: [],
				push: [void 0],
				message: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				description: "should throw an error when undefined user-defined config is normalized asynchronously",
				values: [],
				push: [void 0],
				message: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				description: "should throw an error when null user-defined config is normalized",
				values: [],
				push: [null],
				message: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
			{
				description: "should throw an error when null user-defined config is normalized asynchronously",
				values: [],
				push: [null],
				message: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
		];

		elementTests.forEach(
			({ description, values, message, baseConfig, push }) => {
				it(description, async () => {
					const configs = new FlatConfigArray(values, {
						baseConfig: baseConfig || undefined,
					});
					if (push) {
						configs.push(...push);
					}
					if (message.includes("asynchronously")) {
						try {
							await configs.normalize();
							assert.fail("Error not thrown");
						} catch (error) {
							assert.strictEqual(error.message, message);
						}
					} else {
						assert.throws(() => {
							configs.normalizeSync();
							configs.getConfig("foo.js");
						}, message);
					}
				});
			},
		);
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			const settingsTests = [
				{
					description: "should merge two objects",
					values: [
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
					result: {
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
					description: "should merge two objects when second object has overrides",
					values: [
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
					result: {
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
					description: "should deeply merge two objects when second object has overrides",
					values: [
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
					result: {
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
					description: "should merge an object and undefined into one object",
					values: [
						{
							settings: {
								a: true,
								b: false,
							},
						},
						{},
					],
					result: {
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
						},
					},
				},
				{
					description: "should merge undefined and an object into one object",
					values: [
						{},
						{
							settings: {
								a: true,
								b: false,
							},
						},
					],
					result: {
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
						},
					},
				},
			];

			settingsTests.forEach(({ description, values, result }) => {
				it(description, () => assertMergedResult(values, result));
			});
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			const pluginsTests = [
				{
					description: "should merge two objects",
					values: [
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
					result: {
						plugins: {
							a: pluginA,
							b: pluginB,
							c: pluginC,
							...baseConfig.plugins,
						},
					},
				},
				{
					description: "should merge an object and undefined into one object",
					values: [
						{
							plugins: {
								a: pluginA,
								b: pluginB,
							},
						},
						{},
					],
					result: {
						plugins: {
							a: pluginA,
							b: pluginB,
							...baseConfig.plugins,
						},
					},
				},
				{
					description: "should error when attempting to redefine a plugin",
					values: [
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
					description: "should error when plugin is not an object",
					values: [
						{
							plugins: {
								a: true,
							},
						},
					],
					error: 'Key "a": Expected an object.',
				},
			];

			pluginsTests.forEach(({ description, values, result, error }) => {
				if (error) {
					it(description, async () => {
						await assertInvalidConfig(values, error);
					});
				} else {
					it(description, () => assertMergedResult(values, result));
				}
			});
		});

		describe("processor", () => {
			const stubProcessor = {
				preprocess() {},
				postprocess() {},
			};

			const processorTests = [
				{
					description: "should merge two values when second is a string",
					values: [
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
					result: {
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
					description: "should merge two values when second is an object",
					values: [
						{
							processor: "markdown/markdown",
						},
						{
							processor: stubProcessor,
						},
					],
					result: {
						plugins: baseConfig.plugins,
						processor: stubProcessor,
					},
				},
				{
					description: "should error when an invalid string is used",
					values: [
						{
							processor: "foo",
						},
					],
					error: "pluginName/objectName",
				},
				{
					description: "should error when an empty string is used",
					values: [
						{
							processor: "",
						},
					],
					error: "pluginName/objectName",
				},
				{
					description: "should error when an invalid processor is used",
					values: [
						{
							processor: {},
						},
					],
					error: "Object must have a preprocess() and a postprocess() method.",
				},
				{
					description: "should error when a processor cannot be found in a plugin",
					values: [
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

			processorTests.forEach(({ description, values, result, error }) => {
				if (error) {
					it(description, async () => {
						await assertInvalidConfig(values, error);
					});
				} else {
					it(description, () => assertMergedResult(values, result));
				}
			});
		});

		describe("linterOptions", () => {
			const linterTests = [
				{
					description: "should error when an unexpected key is found",
					values: [
						{
							linterOptions: {
								foo: true,
							},
						},
					],
					error: 'Unexpected key "foo" found.',
				},
				{
					description: "should error when an unexpected value is found",
					values: [
						{
							linterOptions: {
								noInlineConfig: "true",
							},
						},
					],
					error: "Expected a Boolean.",
				},
				{
					description: "should merge two objects when second object has overrides",
					values: [
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
					result: {
						plugins: baseConfig.plugins,
						linterOptions: {
							noInlineConfig: false,
						},
					},
				},
				{
					description: "should merge an object and undefined into one object",
					values: [
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
						{},
					],
					result: {
						plugins: baseConfig.plugins,
						linterOptions: {
							noInlineConfig: false,
						},
					},
				},
				{
					description: "should merge undefined and an object into one object",
					values: [
						{},
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
					],
					result: {
						plugins: baseConfig.plugins,
						linterOptions: {
							noInlineConfig: false,
						},
					},
				},
			];

			linterTests.forEach(({ description, values, result, error }) => {
				if (error) {
					it(description, async () => {
						await assertInvalidConfig(values, error);
					});
				} else {
					it(description, () => assertMergedResult(values, result));
				}
			});

			describe("reportUnusedDisableDirectives", () => {
				const reportTests = [
					{
						description: "should error when an unexpected value is found",
						values: [
							{
								linterOptions: {
									reportUnusedDisableDirectives: {},
								},
							},
						],
						error:
							/Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
					},
					{
						description: "should merge two objects when second object has overrides",
						values: [
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
						result: {
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedDisableDirectives: 1,
							},
						},
					},
					{
						description: "should merge an object and undefined into one object",
						values: [
							{},
							{
								linterOptions: {
									reportUnusedDisableDirectives: "warn",
								},
							},
						],
						result: {
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedDisableDirectives: 1,
							},
						},
					},
				];

				reportTests.forEach(({ description, values, result, error }) => {
					if (error) {
						it(description, async () => {
							await assertInvalidConfig(values, error);
						});
					} else {
						it(description, () => assertMergedResult(values, result));
					}
				});
			});

			describe("reportUnusedInlineConfigs", () => {
				const inlineTests = [
					{
						description: "should error when an unexpected value is found",
						values: [
							{
								linterOptions: {
									reportUnusedInlineConfigs: {},
								},
							},
						],
						error:
							/Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
					},
					{
						description: "should merge two objects when second object has overrides",
						values: [
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
						result: {
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedInlineConfigs: 1,
							},
						},
					},
					{
						description: "should merge an object and undefined into one object",
						values: [
							{},
							{
								linterOptions: {
									reportUnusedInlineConfigs: "warn",
								},
							},
						],
						result: {
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedInlineConfigs: 1,
							},
						},
					},
				];

				inlineTests.forEach(({ description, values, result, error }) => {
					if (error) {
						it(description, async () => {
							await assertInvalidConfig(values, error);
						});
					} else {
						it(description, () => assertMergedResult(values, result));
					}
				});
			});
		});

		describe("languageOptions", () => {
			const languageTests = [
				{
					description: "should error when an unexpected key is found",
					values: [
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
					description: "should merge two languageOptions objects with different properties",
					values: [
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
					result: {
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
					description: "should get default languageOptions from the language",
					values: [
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
					result: {
						languageOptions: { foo: 42 },
					},
				},
				{
					description: "should merge configured languageOptions over default languageOptions from the language",
					values: [
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
					result: {
						languageOptions: {
							foo: 42,
							bar: 43,
						},
					},
				},
				{
					description: "should use configured languageOptions when default languageOptions are not specified",
					values: [
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
					result: {
						languageOptions: { bar: 43 },
					},
				},
				{
					description: "should default to an empty object if neither configured nor default languageOptions are specified",
					values: [
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
					result: {
						languageOptions: {},
					},
				},
			];

			languageTests.forEach(({ description, values, result, error }) => {
				if (error) {
					it(description, async () => {
						await assertInvalidConfig(values, error);
					});
				} else {
					it(description, () => assertMergedResult(values, result));
				}
			});

			describe("ecmaVersion", () => {
				const ecmaTests = [
					{
						description: "should error when an unexpected value is found",
						values: [
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
						description: "should merge two objects when second object has overrides",
						values: [
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
						result: {
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								ecmaVersion: 2021,
							},
						},
					},
					{
						description: "should merge an object and undefined into one object",
						values: [
							{
								language: "@/js",
								languageOptions: {
									ecmaVersion: 2021,
								},
							},
							{},
						],
						result: {
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								ecmaVersion: 2021,
							},
						},
					},
					{
						description: "should merge undefined and an object into one object",
						values: [
							{},
							{
								language: "@/js",
								languageOptions: {
									ecmaVersion: 2021,
								},
							},
						],
						result: {
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								ecmaVersion: 2021,
							},
						},
					},
				];

				ecmaTests.forEach(({ description, values, result, error }) => {
					if (error) {
						it(description, async () => {
							await assertInvalidConfig(values, error);
						});
					} else {
						it(description, () => assertMergedResult(values, result));
					}
				});
			});

			describe("sourceType", () => {
				const sourceTests = [
					{
						description: "should error when an unexpected value is found",
						values: [
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
						description: "should merge two objects when second object has overrides",
						values: [
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
						result: {
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
						description: "should merge an object and undefined into one object",
						values: [
							{
								language: "@/js",
								languageOptions: {
									sourceType: "script",
								},
							},
							{},
						],
						result: {
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
						description: "should merge undefined and an object into one object",
						values: [
							{},
							{
								language: "@/js",
								languageOptions: {
									sourceType: "module",
								},
							},
						],
						result: {
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								sourceType: "module",
							},
						},
					},
				];

				sourceTests.forEach(({ description, values, result, error }) => {
					if (error) {
						it(description, async () => {
							await assertInvalidConfig(values, error);
						});
					} else {
						it(description, () => assertMergedResult(values, result));
					}
				});
			});

			describe("globals", () => {
				const globalsTests = [
					{
						description: "should error when an unexpected value is found",
						values: [
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
						description: "should error when an unexpected key value is found",
						values: [
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
						description: "should error when a global has leading whitespace",
						values: [
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
						description: "should error when a global has trailing whitespace",
						values: [
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
						description: "should merge two objects when second object has different keys",
						values: [
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
						result: {
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
						description: "should merge two objects when second object has overrides",
						values: [
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
						result: {
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
						description: "should merge an object and undefined into one object",
						values: [
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
						result: {
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
						description: "should merge undefined and an object into one object",
						values: [
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
						result: {
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
						description: "should merge string and an object into one object",
						values: [
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
						result: {
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
				];

				globalsTests.forEach(({ description, values, result, error }) => {
					if (error) {
						it(description, async () => {
							await assertInvalidConfig(values, error);
						});
					} else {
						it(description, () => assertMergedResult(values, result));
					}
				});
			});

			describe("parser", () => {
				const parserTests = [
					{
						description: "should error when an unexpected value is found",
						values: [
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
						description: "should error when a null is found",
						values: [
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
						description: "should error when a parser is a string",
						values: [
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
						description: "should error when a value doesn't have a parse() method",
						values: [
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
						description: "should merge two objects when second object has overrides",
						values: [
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
						result: {
							plugins: {
								...baseConfig.plugins,
							},
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								parser: { parse() {} },
							},
						},
					},
					{
						description: "should merge an object and undefined into one object",
						values: [
							{
								language: "@/js",
								languageOptions: {
									parser: { parse() {} },
								},
							},
							{},
						],
						result: {
							plugins: {
								...baseConfig.plugins,
							},
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								parser: { parse() {} },
							},
						},
					},
					{
						description: "should merge undefined and an object into one object",
						values: [
							{},
							{
								language: "@/js",
								languageOptions: {
									parser: { parse() {} },
								},
							},
						],
						result: {
							plugins: {
								...baseConfig.plugins,
							},
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								parser: { parse() {} },
							},
						},
					},
				];

				parserTests.forEach(({ description, values, result, error }) => {
					if (error) {
						it(description, async () => {
							await assertInvalidConfig(values, error);
						});
					} else {
						it(description, () => assertMergedResult(values, result));
					}
				});
			});

			describe("parserOptions", () => {
				const parserOptionsTests = [
					{
						description: "should error when an unexpected value is found",
						values: [
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
						description: "should merge two objects when second object has different keys",
						values: [
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
						result: {
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
						description: "should deeply merge two objects when second object has different keys",
						values: [
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
						result: {
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
						description: "should deeply merge two objects when second object has missing key",
						values: [
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
						result: {
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
						description: "should merge two objects when second object has overrides",
						values: [
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
						result: {
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
						description: "should merge an object and undefined into one object",
						values: [
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
						result: {
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
						description: "should merge undefined and an object into one object",
						values: [
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
						result: {
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

				parserOptionsTests.forEach(({ description, values, result, error }) => {
					if (error) {
						it(description, async () => {
							await assertInvalidConfig(values, error);
						});
					} else {
						it(description, () => assertMergedResult(values, result));
					}
				});
			});
		});

		describe("rules", () => {
			const ruleTests = [
				{
					description: "should error when an unexpected value is found",
					values: [
						{
							rules: true,
						},
					],
					error: "Expected an object.",
				},
				{
					description: "should error when an invalid rule severity is set",
					values: [
						{
							rules: {
								foo: true,
							},
						},
					],
					error:
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					description: "should error when an invalid rule severity of the right type is set",
					values: [
						{
							rules: {
								foo: 3,
							},
						},
					],
					error:
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					description: "should error when a string rule severity is not in lowercase",
					values: [
						{
							rules: {
								foo: "Error",
							},
						},
					],
					error:
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					description: "should error when an invalid rule severity is set in an array",
					values: [
						{
							rules: {
								foo: [true],
							},
						},
					],
					error:
						'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					description: "should error when rule doesn't exist",
					values: [
						{
							rules: {
								foox: [1, "bar"],
							},
						},
					],
					error: /Key "rules": Key "foox": Could not find "foox" in plugin "@"/u,
				},
				{
					description: "should error and suggest alternative when rule doesn't exist",
					values: [
						{
							rules: {
								"test2/match": "error",
							},
						},
					],
					error: /Key "rules": Key "test2\/match": Could not find "match" in plugin "test2". Did you mean "test1\/match"?/u,
				},
				{
					description: "should error when plugin for rule doesn't exist",
					values: [
						{
							rules: {
								"doesnt-exist/match": "error",
							},
						},
					],
					error: /Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
				},
				{
					description: "should error when rule options don't match schema",
					values: [
						{
							rules: {
								foo: [1, "bar"],
							},
						},
					],
					error: /Value "bar" should be equal to one of the allowed values/u,
				},
				{
					description: "should error when rule options don't match schema requiring at least one item",
					values: [
						{
							rules: {
								foo2: 1,
							},
						},
					],
					error: /Value \[\] should NOT have fewer than 1 items/u,
				},
				{
					description: "should error with a message that contains the rule name when a configured rule has invalid `meta.schema` (null)",
					values: [
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
					description: "should error with a message that contains the rule name when a configured rule has invalid `meta.schema` (true)",
					values: [
						{
							plugins: {
								foo: {
									rules: {
										bar: {
											meta: {
												schema: true,
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
					description: "should error with a message that contains the rule name when a configured rule has invalid `meta.schema` (invalid JSON Schema definition)",
					values: [
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
					description: "should allow rules with `schema:false` to have any configurations",
					values: [
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
					result: {
						rules: {
							"foo/bar": [2],
							"foo/baz": [2, "always"],
						},
					},
				},
				{
					description: "should allow rules without `meta` to be configured without options",
					values: [
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
					result: {
						rules: {
							"foo/bar": [2],
						},
					},
				},
				{
					description: "should allow rules without `meta.schema` to be configured without options",
					values: [
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
					result: {
						rules: {
							"foo/bar": [2],
						},
					},
				},
				{
					description: "should throw if a rule without `meta` is configured with an option",
					values: [
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
					description: "should throw if a rule without `meta.schema` is configured with an option",
					values: [
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
					description: "should merge two objects",
					values: [
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
					result: {
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
					description: "should merge two objects when second object has simple overrides",
					values: [
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
					result: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [2, "always"],
							bar: [0],
						},
					},
				},
				{
					description: "should merge two objects when second object has array overrides",
					values: [
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
					result: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [2, "never"],
							foo2: [1, "foo"],
						},
					},
				},
				{
					description: "should merge two objects and options when second object overrides without options",
					values: [
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
					result: {
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
					description: "should merge an object and undefined into one object",
					values: [
						{
							rules: {
								foo: 0,
								bar: 1,
							},
						},
						{},
					],
					result: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [0],
							bar: [1],
						},
					},
				},
				{
					description: "should merge a rule that doesn't exist without error when the rule is off",
					values: [
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
					result: {
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
					description: "should error show expected properties",
					values: [
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
					error:
						'Unexpected property "destruct". Expected properties: "destructuring", "ignoreReadBeforeAssign"',
				},
			];

			ruleTests.forEach(({ description, values, result, error }) => {
				if (error) {
					it(description, async () => {
						await assertInvalidConfig(values, error);
					});
				} else {
					it(description, () => assertMergedResult(values, result));
				}
			});
		});

		describe("Invalid Keys", () => {
			const invalidKeyTests = [
				{
					key: "env",
					message: 'Key "env": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "extends",
					message: 'Key "extends": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "globals",
					message: 'Key "globals": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "ignorePatterns",
					message: 'Key "ignorePatterns": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "noInlineConfig",
					message: 'Key "noInlineConfig": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "overrides",
					message: 'Key "overrides": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "parser",
					message: 'Key "parser": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "parserOptions",
					message: 'Key "parserOptions": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "reportUnusedDisableDirectives",
					message: 'Key "reportUnusedDisableDirectives": This appears to be in eslintrc format rather than flat config format.',
				},
				{
					key: "root",
					message: 'Key "root": This appears to be in eslintrc format rather than flat config format.',
				},
			];

			invalidKeyTests.forEach(({ key, message }) => {
				it(`should error when a ${key} key is found`, async () => {
					await assertInvalidConfig([{ [key]: "foo" }], message);
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
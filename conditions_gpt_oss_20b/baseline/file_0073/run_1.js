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
		const testCases = [
			{
				name: "convert config into normalized JSON object",
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
				name: "convert config with plugin name/version into normalized JSON object",
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
				name: "convert config with plugin meta into normalized JSON object",
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
				name: "convert config with languageOptions.globals.name into normalized JSON object",
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
				name: "serialize languageOptions as an empty object if neither configured nor default languageOptions are specified",
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
		];

		testCases.forEach(({ name, input, expected }) => {
			it(name, () => {
				const configs = new FlatConfigArray(input);
				configs.normalizeSync();
				const config = configs.getConfig("foo.js");
				assert.deepStrictEqual(config.toJSON(), expected);
				assert.strictEqual(stringify(config.toJSON()), stringify(expected));
			});
		});

		const parserErrorCases = [
			{
				name: "unnamed parser object",
				input: [
					{
						languageOptions: {
							parser: {
								parse() {},
							},
						},
					},
				],
				error: /Cannot serialize key "parse"/u,
			},
			{
				name: "unnamed parser object with empty meta object",
				input: [
					{
						languageOptions: {
							parser: {
								meta: {},
								parse() {},
							},
						},
					},
				],
				error: /Cannot serialize key "parse"/u,
			},
			{
				name: "unnamed parser object with only meta version",
				input: [
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
				],
				error: /Cannot serialize key "parse"/u,
			},
		];

		parserErrorCases.forEach(({ name, input, error }) => {
			it(`should throw an error when config with ${name} is normalized`, () => {
				const configs = new FlatConfigArray(input);
				configs.normalizeSync();
				const config = configs.getConfig("foo.js");
				assert.throws(() => {
					config.toJSON();
				}, error);
			});
		});

		const namedParserCases = [
			{
				name: "named parser object",
				input: [
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
				name: "named and versioned parser object",
				input: [
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
				name: "meta-named and versioned parser object",
				input: [
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
				name: "named and versioned parser object outside of meta object",
				input: [
					{
						languageOptions: {
							parser: {
								name: "custom-parser",
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
					linterOptions: {
						reportUnusedDisableDirectives: 1,
					},
					plugins: ["@"],
					processor: void 0,
				},
			},
		];

		namedParserCases.forEach(({ name, input, expected }) => {
			it(`should not throw an error when config with ${name} is normalized`, () => {
				const configs = new FlatConfigArray(input);
				configs.normalizeSync();
				const config = configs.getConfig("foo.js");
				assert.deepStrictEqual(config.toJSON(), expected);
			});
		});

		const processorErrorCases = [
			{
				name: "unnamed processor object",
				input: [
					{
						processor: {
							preprocess() {},
							postprocess() {},
						},
					},
				],
				error: /Could not serialize processor/u,
			},
			{
				name: "processor object with empty meta object",
				input: [
					{
						processor: {
							meta: {},
							preprocess() {},
							postprocess() {},
						},
					},
				],
				error: /Could not serialize processor/u,
			},
		];

		processorErrorCases.forEach(({ name, input, error }) => {
			it(`should throw an error when config with ${name} is normalized`, () => {
				const configs = new FlatConfigArray(input);
				configs.normalizeSync();
				const config = configs.getConfig("foo.js");
				assert.throws(() => {
					config.toJSON();
				}, error);
			});
		});

		const namedProcessorCases = [
			{
				name: "named processor object",
				input: [
					{
						processor: {
							meta: {
								name: "custom-processor",
							},
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
				name: "named processor object without meta",
				input: [
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
				name: "named and versioned processor object",
				input: [
					{
						processor: {
							meta: {
								name: "custom-processor",
								version: "1.2.3",
							},
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
				name: "named and versioned processor object without meta",
				input: [
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

		namedProcessorCases.forEach(({ name, input, expected }) => {
			it(`should not throw an error when config with ${name} is normalized`, () => {
				const configs = new FlatConfigArray(input);
				configs.normalizeSync();
				const config = configs.getConfig("foo.js");
				assert.deepStrictEqual(config.toJSON(), expected);
			});
		});
	});

	describe("Config array elements", () => {
		const elementErrorCases = [
			{
				name: "'eslint:recommended' string config",
				input: ["eslint:recommended"],
				message: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				name: "'eslint:all' string config",
				input: ["eslint:all"],
				message: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				name: "undefined original config (sync)",
				input: [void 0],
				message: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				name: "undefined original config (async)",
				input: [void 0],
				async: true,
				message: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				name: "null original config (sync)",
				input: [null],
				message: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				name: "null original config (async)",
				input: [null],
				async: true,
				message: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				name: "undefined base config (sync)",
				input: [],
				baseConfig: [void 0],
				message: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				name: "undefined base config (async)",
				input: [],
				baseConfig: [void 0],
				async: true,
				message: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				name: "null base config (sync)",
				input: [],
				baseConfig: [null],
				message: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				name: "null base config (async)",
				input: [],
				baseConfig: [null],
				async: true,
				message: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				name: "undefined user-defined config (sync)",
				input: [],
				userDefined: [void 0],
				message: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				name: "undefined user-defined config (async)",
				input: [],
				userDefined: [void 0],
				async: true,
				message: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				name: "null user-defined config (sync)",
				input: [],
				userDefined: [null],
				message: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
			{
				name: "null user-defined config (async)",
				input: [],
				userDefined: [null],
				async: true,
				message: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
		];

		elementErrorCases.forEach(
			({
				name,
				input,
				baseConfig: baseCfg,
				userDefined,
				async: isAsync,
				message,
			}) => {
				const testFn = isAsync ? async () => {
					const configs = new FlatConfigArray(input, {
						baseConfig: baseCfg,
					});
					if (userDefined) {
						userDefined.forEach((c) => configs.push(c));
					}
					try {
						await configs.normalize();
						assert.fail("Error not thrown");
					} catch (error) {
						assert.strictEqual(error.message, message);
					}
				} : () => {
					const configs = new FlatConfigArray(input, {
						baseConfig: baseCfg,
					});
					if (userDefined) {
						userDefined.forEach((c) => configs.push(c));
					}
					assert.throws(() => {
						configs.normalizeSync();
					}, message);
				};
				it(`should error on ${name}`, testFn);
			},
		);
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			const settingsCases = [
				{
					name: "merge two objects",
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
					name: "merge two objects when second object has overrides",
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
					name: "deeply merge two objects when second object has overrides",
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
					name: "merge an object and undefined into one object",
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
					name: "merge undefined and an object into one object",
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

			settingsCases.forEach(({ name, input, expected }) => {
				it(name, () => assertMergedResult(input, expected));
			});
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			const pluginCases = [
				{
					name: "merge two objects",
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
					name: "merge an object and undefined into one object",
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
			];

			pluginCases.forEach(({ name, input, expected }) => {
				it(name, () => assertMergedResult(input, expected));
			});

			it("should error when attempting to redefine a plugin", async () => {
				await assertInvalidConfig(
					[
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
					'Cannot redefine plugin "a".',
				);
			});

			it("should error when plugin is not an object", async () => {
				await assertInvalidConfig(
					[
						{
							plugins: {
								a: true,
							},
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
					name: "merge two values when second is a string",
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
					name: "merge two values when second is an object",
					input: [
						{
							processor: "markdown/markdown",
						},
						{
							processor,
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						processor,
					},
				},
			];

			processorCases.forEach(({ name, input, expected }) => {
				it(name, () => assertMergedResult(input, expected));
			});

			const processorErrorCases = [
				{
					name: "invalid string",
					input: [
						{
							processor: "foo",
						},
					],
					message: "pluginName/objectName",
				},
				{
					name: "empty string",
					input: [
						{
							processor: "",
						},
					],
					message: "pluginName/objectName",
				},
				{
					name: "invalid processor",
					input: [
						{
							processor: {},
						},
					],
					message: "Object must have a preprocess() and a postprocess() method.",
				},
				{
					name: "processor cannot be found in a plugin",
					input: [
						{
							plugins: {
								foo: {},
							},
							processor: "foo/bar",
						},
					],
					message: /Could not find "bar" in plugin "foo"/u,
				},
			];

			processorErrorCases.forEach(({ name, input, message }) => {
				it(`should error when ${name}`, async () => {
					await assertInvalidConfig(input, message);
				});
			});
		});

		describe("linterOptions", () => {
			const linterCases = [
				{
					name: "error when an unexpected key is found",
					input: [
						{
							linterOptions: {
								foo: true,
							},
						},
					],
					message: 'Unexpected key "foo" found.',
				},
			];

			linterCases.forEach(({ name, input, message }) => {
				it(name, async () => {
					await assertInvalidConfig(input, message);
				});
			});

			describe("noInlineConfig", () => {
				const noInlineCases = [
					{
						name: "error when an unexpected value is found",
						input: [
							{
								linterOptions: {
									noInlineConfig: "true",
								},
							},
						],
						message: "Expected a Boolean.",
					},
					{
						name: "merge two objects when second object has overrides",
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
						name: "merge an object and undefined into one object",
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
						name: "merge undefined and an object into one object",
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
				];

				noInlineCases.forEach(({ name, input, message, expected }) => {
					if (message) {
						it(name, async () => {
							await assertInvalidConfig(input, message);
						});
					} else {
						it(name, () => assertMergedResult(input, expected));
					}
				});
			});

			describe("reportUnusedDisableDirectives", () => {
				const reportDisableCases = [
					{
						name: "error when an unexpected value is found",
						input: [
							{
								linterOptions: {
									reportUnusedDisableDirectives: {},
								},
							},
						],
						message: /Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
					},
					{
						name: "merge two objects when second object has overrides",
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
						name: "merge an object and undefined into one object",
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
				];

				reportDisableCases.forEach(({ name, input, message, expected }) => {
					if (message) {
						it(name, async () => {
							await assertInvalidConfig(input, message);
						});
					} else {
						it(name, () => assertMergedResult(input, expected));
					}
				});
			});

			describe("reportUnusedInlineConfigs", () => {
				const reportInlineCases = [
					{
						name: "error when an unexpected value is found",
						input: [
							{
								linterOptions: {
									reportUnusedInlineConfigs: {},
								},
							},
						],
						message: /Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
					},
					{
						name: "merge two objects when second object has overrides",
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
						name: "merge an object and undefined into one object",
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

				reportInlineCases.forEach(({ name, input, message, expected }) => {
					if (message) {
						it(name, async () => {
							await assertInvalidConfig(input, message);
						});
					} else {
						it(name, () => assertMergedResult(input, expected));
					}
				});
			});
		});

		describe("languageOptions", () => {
			const languageCases = [
				{
					name: "error when an unexpected key is found",
					input: [
						{
							language: "@/js",
							languageOptions: {
								foo: true,
							},
						},
					],
					message: 'Unexpected key "foo" found.',
				},
				{
					name: "merge two languageOptions objects with different properties",
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
					name: "get default languageOptions from the language",
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
					name: "merge configured languageOptions over default languageOptions from the language",
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
					name: "use configured languageOptions when default languageOptions are not specified",
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
					name: "default to an empty object if neither configured nor default languageOptions are specified",
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
					async: true,
					expected: {
						languageOptions: {},
					},
				},
			];

			languageCases.forEach(
				({
					name,
					input,
					message,
					expected,
					async: isAsync,
				}) => {
					const testFn = isAsync
						? async () => {
								const configs = createFlatConfigArray(input);
								await configs.normalize();
								const config = configs.getConfig("file.my");
								if (message) {
									assert.throws(() => {
										config.toJSON();
									}, message);
								} else {
									assert.deepStrictEqual(config.languageOptions, expected.languageOptions);
								}
						  }
						: () => {
								const configs = createFlatConfigArray(input);
								assert.throws(() => {
									configs.normalizeSync();
								}, message);
						  };
					it(name, testFn);
				},
			);

			describe("ecmaVersion", () => {
				const ecmaCases = [
					{
						name: "error when an unexpected value is found",
						input: [
							{
								language: "@/js",
								languageOptions: {
									ecmaVersion: "true",
								},
							},
						],
						message: /Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
					},
					{
						name: "merge two objects when second object has overrides",
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
						name: "merge an object and undefined into one object",
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
						name: "merge undefined and an object into one object",
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
				];

				ecmaCases.forEach(({ name, input, message, expected }) => {
					if (message) {
						it(name, async () => {
							await assertInvalidConfig(input, message);
						});
					} else {
						it(name, () => assertMergedResult(input, expected));
					}
				});
			});

			describe("sourceType", () => {
				const sourceCases = [
					{
						name: "error when an unexpected value is found",
						input: [
							{
								language: "@/js",
								languageOptions: {
									sourceType: "true",
								},
							},
						],
						message: 'Expected "script", "module", or "commonjs".',
					},
					{
						name: "merge two objects when second object has overrides",
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
						name: "merge an object and undefined into one object",
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
						name: "merge undefined and an object into one object",
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
				];

				sourceCases.forEach(({ name, input, message, expected }) => {
					if (message) {
						it(name, async () => {
							await assertInvalidConfig(input, message);
						});
					} else {
						it(name, () => assertMergedResult(input, expected));
					}
				});
			});

			describe("globals", () => {
				const globalsCases = [
					{
						name: "error when an unexpected value is found",
						input: [
							{
								language: "@/js",
								languageOptions: {
									globals: "true",
								},
							},
						],
						message: "Expected an object.",
					},
					{
						name: "error when an unexpected key value is found",
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
						message: 'Key "foo": Expected "readonly", "writable", or "off".',
					},
					{
						name: "error when a global has leading whitespace",
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
						message: /Global " foo" has leading or trailing whitespace/u,
					},
					{
						name: "error when a global has trailing whitespace",
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
						message: /Global "foo " has leading or trailing whitespace/u,
					},
					{
						name: "merge two objects when second object has different keys",
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
						name: "merge two objects when second object has overrides",
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
						name: "merge an object and undefined into one object",
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
						name: "merge undefined and an object into one object",
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
						name: "merge string and an object into one object",
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
				];

				globalsCases.forEach(({ name, input, message, expected }) => {
					if (message) {
						it(name, async () => {
							await assertInvalidConfig(input, message);
						});
					} else {
						it(name, () => assertMergedResult(input, expected));
					}
				});
			});

			describe("parser", () => {
				const parserCases = [
					{
						name: "error when an unexpected value is found",
						input: [
							{
								language: "@/js",
								languageOptions: {
									parser: true,
								},
							},
						],
						message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					},
					{
						name: "error when a null is found",
						input: [
							{
								language: "@/js",
								languageOptions: {
									parser: null,
								},
							},
						],
						message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					},
					{
						name: "error when a parser is a string",
						input: [
							{
								language: "@/js",
								languageOptions: {
									parser: "foo/bar",
								},
							},
						],
						message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					},
					{
						name: "error when a value doesn't have a parse() method",
						input: [
							{
								language: "@/js",
								languageOptions: {
									parser: {},
								},
							},
						],
						message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					},
					{
						name: "merge two objects when second object has overrides",
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
						name: "merge an object and undefined into one object",
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
						name: "merge undefined and an object into one object",
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

				parserCases.forEach(({ name, input, message, expected }) => {
					if (message) {
						it(name, async () => {
							await assertInvalidConfig(input, message);
						});
					} else {
						it(name, () => assertMergedResult(input, expected));
					}
				});
			});

			describe("parserOptions", () => {
				const parserOptionsCases = [
					{
						name: "error when an unexpected value is found",
						input: [
							{
								language: "@/js",
								languageOptions: {
									parserOptions: "true",
								},
							},
						],
						message: "Expected an object.",
					},
					{
						name: "merge two objects when second object has different keys",
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
						name: "deeply merge two objects when second object has different keys",
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
						name: "deeply merge two objects when second object has missing key",
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
						name: "merge two objects when second object has overrides",
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
						name: "merge an object and undefined into one object",
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
						name: "merge undefined and an object into one object",
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

				parserOptionsCases.forEach(({ name, input, message, expected }) => {
					if (message) {
						it(name, async () => {
							await assertInvalidConfig(input, message);
						});
					} else {
						it(name, () => assertMergedResult(input, expected));
					}
				});
			});
		});

		describe("rules", () => {
			const ruleCases = [
				{
					name: "error when an unexpected value is found",
					input: [
						{
							rules: true,
						},
					],
					message: "Expected an object.",
				},
				{
					name: "error when an invalid rule severity is set",
					input: [
						{
							rules: {
								foo: true,
							},
						},
					],
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "error when an invalid rule severity of the right type is set",
					input: [
						{
							rules: {
								foo: 3,
							},
						},
					],
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "error when a string rule severity is not in lowercase",
					input: [
						{
							rules: {
								foo: "Error",
							},
						},
					],
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "error when an invalid rule severity is set in an array",
					input: [
						{
							rules: {
								foo: [true],
							},
						},
					],
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "error when rule doesn't exist",
					input: [
						{
							rules: {
								foox: [1, "bar"],
							},
						},
					],
					message: /Key "rules": Key "foox": Could not find "foox" in plugin "@"./u,
				},
				{
					name: "error and suggest alternative when rule doesn't exist",
					input: [
						{
							rules: {
								"test2/match": "error",
							},
						},
					],
					message: /Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
				},
				{
					name: "error when plugin for rule doesn't exist",
					input: [
						{
							rules: {
								"doesnt-exist/match": "error",
							},
						},
					],
					message: /Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
				},
				{
					name: "error when rule options don't match schema",
					input: [
						{
							rules: {
								foo: [1, "bar"],
							},
						},
					],
					message: /Value "bar" should be equal to one of the allowed values/u,
				},
				{
					name: "error when rule options don't match schema requiring at least one item",
					input: [
						{
							rules: {
								foo2: 1,
							},
						},
					],
					message: /Value \[\] should NOT have fewer than 1 items/u,
				},
			];

			ruleCases.forEach(({ name, input, message }) => {
				it(name, async () => {
					await assertInvalidConfig(input, message);
				});
			});

			const schemaInvalidCases = [
				{
					name: "invalid meta.schema (null)",
					schema: null,
				},
				{
					name: "invalid meta.schema (true)",
					schema: true,
				},
				{
					name: "invalid meta.schema (0)",
					schema: 0,
				},
				{
					name: "invalid meta.schema (1)",
					schema: 1,
				},
				{
					name: "invalid meta.schema (empty string)",
					schema: "",
				},
				{
					name: "invalid meta.schema ('always')",
					schema: "always",
				},
				{
					name: "invalid meta.schema (function)",
					schema: () => {},
				},
			];

			schemaInvalidCases.forEach(({ name, schema }) => {
				it(`should error with a message that contains the rule name when a configured rule has invalid \`meta.schema\` (${schema})`, async () => {
					await assertInvalidConfig(
						[
							{
								plugins: {
									foo: {
										rules: {
											bar: {
												meta: {
													schema,
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
					"Error while processing options validation schema of rule 'foo/bar': minItems must be number",
				);
			});

			it("should allow rules with `schema:false` to have any configurations", async () => {
				const configs = new FlatConfigArray([
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
				]);

				await configs.normalize();

				const config = configs.getConfig("foo.js");

				assert.deepStrictEqual(config.rules, {
					"foo/bar": [2],
					"foo/baz": [2, "always"],
				});
			});

			it("should allow rules without `meta` to be configured without options", async () => {
				const configs = new FlatConfigArray([
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
				]);

				await configs.normalize();

				const config = configs.getConfig("foo.js");

				assert.deepStrictEqual(config.rules, {
					"foo/bar": [2],
				});
			});

			it("should allow rules without `meta.schema` to be configured without options", async () => {
				const configs = new FlatConfigArray([
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
				]);

				await configs.normalize();

				const config = configs.getConfig("foo.js");

				assert.deepStrictEqual(config.rules, {
					"foo/bar": [2],
				});
			});

			it("should throw if a rule without `meta` is configured with an option", async () => {
				await assertInvalidConfig(
					[
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
					/should NOT have more than 0 items/u,
				);
			});

			it("should throw if a rule without `meta.schema` is configured with an option", async () => {
				await assertInvalidConfig(
					[
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
					/should NOT have more than 0 items/u,
				);
			});

			const mergeRuleCases = [
				{
					name: "merge two objects",
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
					name: "merge two objects when second object has simple overrides",
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
					name: "merge two objects when second object has array overrides",
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
					name: "merge two objects and options when second object overrides without options",
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
					name: "merge an object and undefined into one object",
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
					name: "merge a rule that doesn't exist without error when the rule is off",
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
			];

			mergeRuleCases.forEach(({ name, input, expected }) => {
				it(name, () => assertMergedResult(input, expected));
			});

			it("should error show expected properties", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								"prefer-const": ["error", { destruct: true }],
							},
						},
					],
					'Unexpected property "destruct". Expected properties: "destructuring", "ignoreReadBeforeAssign"',
				);

				await assertInvalidConfig(
					[
						{
							rules: {
								"prefer-destructuring": [
									"error",
									{ obj: true },
								],
							},
						},
					],
					'Unexpected property "obj". Expected properties: "VariableDeclarator", "AssignmentExpression"',
				);

				await assertInvalidConfig(
					[
						{
							rules: {
								"prefer-destructuring": [
									"error",
									{ obj: true },
								],
							},
						},
					],
					'Unexpected property "obj". Expected properties: "array", "object"',
				);

				await assertInvalidConfig(
					[
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

			invalidKeys.forEach((key) => {
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
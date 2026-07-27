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
 * @returns {void}
 * @throws {AssertionError} If the actual result doesn't match the
 *      expected result.
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
 * @throws {AssertionError} If the config is valid or if the error
 *      has an unexpected message.
 */
async function assertInvalidConfig(values, message) {
	const configs = createFlatConfigArray(values);
	assert.throws(() => {
		configs.normalizeSync();
		configs.getConfig("foo.js");
	}, message);
}

/**
 * Helper to generate a test that expects an invalid key.
 * @param {string} key
 * @param {string|RegExp} message
 */
function testInvalidKey(key, message) {
	it(`should error when a ${key} key is found`, async () => {
		await assertInvalidConfig(
			[{ [key]: "foo" }],
			message,
		);
	});
}

/**
 * Helper to generate a test that expects a parser error.
 * @param {*} parser
 * @param {string|RegExp} message
 */
function testParserError(parser, message) {
	it(`should error when parser is ${JSON.stringify(parser)}`, async () => {
		await assertInvalidConfig(
			[
				{
					language: "@/js",
					languageOptions: { parser },
				},
			],
			message,
		);
	});
}

/**
 * Helper to generate a test that expects a globals error.
 * @param {*} globals
 * @param {string|RegExp} message
 */
function testGlobalsError(globals, message) {
	it(`should error when globals are ${JSON.stringify(globals)}`, async () => {
		await assertInvalidConfig(
			[
				{
					language: "@/js",
					languageOptions: { globals },
				},
			],
			message,
		);
	});
}

/**
 * Helper to generate a test that expects a parserOptions merge.
 * @param {*} first
 * @param {*} second
 * @param {*} expected
 */
function testParserOptionsMerge(first, second, expected) {
	it("should merge parserOptions correctly", async () => {
		await assertMergedResult(
			[
				{ language: "@/js", languageOptions: { parserOptions: first } },
				{ languageOptions: { parserOptions: second } },
			],
			expected,
		);
	});
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
		const baseExpected = {
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
		};

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
			const actual = config.toJSON();

			assert.deepStrictEqual(actual, baseExpected);
			assert.strictEqual(stringify(actual), stringify(baseExpected));
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

			const expected = {
				...baseExpected,
				plugins: ["@", "a", "b:b-plugin@2.3.1"],
			};

			configs.normalizeSync();
			const actual = configs.getConfig("foo.js").toJSON();

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

			const expected = {
				...baseExpected,
				plugins: ["@", "a", "b:b-plugin@2.3.1"],
			};

			configs.normalizeSync();
			const actual = configs.getConfig("foo.js").toJSON();

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

			const expected = {
				...baseExpected,
				languageOptions: {
					...baseExpected.languageOptions,
					globals: {
						name: "off",
					},
				},
			};

			configs.normalizeSync();
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

			const expected = {
				plugins: ["@", "test"],
				language: "test/my",
				languageOptions: {},
				linterOptions: {
					reportUnusedDisableDirectives: 1,
				},
				processor: void 0,
			};

			configs.normalizeSync();
			const actual = configs.getConfig("file.my").toJSON();

			assert.deepStrictEqual(actual, expected);
			assert.strictEqual(stringify(actual), stringify(expected));
		});

		[
			{
				desc: "unnamed parser object",
				parser: { parse() {} },
				message: /Cannot serialize key "parse"/u,
			},
			{
				desc: "unnamed parser object with empty meta",
				parser: { meta: {}, parse() {} },
				message: /Cannot serialize key "parse"/u,
			},
			{
				desc: "unnamed parser object with only meta version",
				parser: { meta: { version: "0.1.1" }, parse() {} },
				message: /Cannot serialize key "parse"/u,
			},
		].forEach(({ desc, parser, message }) => {
			it(`should throw an error when config with ${desc} is normalized`, () => {
				const configs = new FlatConfigArray([
					{
						languageOptions: {
							parser,
						},
					},
				]);

				configs.normalizeSync();
				const config = configs.getConfig("foo.js");

				assert.throws(() => config.toJSON(), message);
			});
		});

		[
			{
				desc: "named parser object",
				parser: { meta: { name: "custom-parser" }, parse() {} },
				expected: "custom-parser",
			},
			{
				desc: "named and versioned parser object",
				parser: {
					meta: { name: "custom-parser", version: "0.1.0" },
					parse() {},
				},
				expected: "custom-parser@0.1.0",
			},
			{
				desc: "meta-named and versioned parser object",
				parser: {
					meta: { name: "custom-parser" },
					version: "0.1.0",
					parse() {},
				},
				expected: "custom-parser@0.1.0",
			},
			{
				desc: "named and versioned parser object outside of meta",
				parser: {
					name: "custom-parser",
					version: "0.1.0",
					parse() {},
				},
				expected: "custom-parser@0.1.0",
			},
		].forEach(({ desc, parser, expected }) => {
			it(`should not throw an error when config with ${desc} is normalized`, () => {
				const configs = new FlatConfigArray([
					{
						languageOptions: {
							parser,
						},
					},
				]);

				configs.normalizeSync();
				const config = configs.getConfig("foo.js");

				const expectedJSON = {
					language: "@/js",
					languageOptions: {
						ecmaVersion: LATEST_ECMA_VERSION,
						parser: expected,
						parserOptions: {},
						sourceType: "module",
					},
					linterOptions: {
						reportUnusedDisableDirectives: 1,
					},
					plugins: ["@"],
					processor: void 0,
				};

				assert.deepStrictEqual(config.toJSON(), expectedJSON);
			});
		});

		[
			{
				desc: "unnamed processor object",
				processor: {
					preprocess() {},
					postprocess() {},
				},
				message: /Could not serialize processor/u,
			},
			{
				desc: "processor object with empty meta",
				processor: {
					meta: {},
					preprocess() {},
					postprocess() {},
				},
				message: /Could not serialize processor/u,
			},
		].forEach(({ desc, processor, message }) => {
			it(`should throw an error when config with ${desc} is normalized`, () => {
				const configs = new FlatConfigArray([
					{
						processor,
					},
				]);

				configs.normalizeSync();
				const config = configs.getConfig("foo.js");

				assert.throws(() => config.toJSON(), message);
			});
		});

		[
			{
				desc: "named processor object",
				processor: {
					meta: { name: "custom-processor" },
					preprocess() {},
					postprocess() {},
				},
				expected: "custom-processor",
			},
			{
				desc: "named processor object without meta",
				processor: {
					name: "custom-processor",
					preprocess() {},
					postprocess() {},
				},
				expected: "custom-processor",
			},
			{
				desc: "named and versioned processor object",
				processor: {
					meta: { name: "custom-processor", version: "1.2.3" },
					preprocess() {},
					postprocess() {},
				},
				expected: "custom-processor@1.2.3",
			},
			{
				desc: "named and versioned processor object without meta",
				processor: {
					name: "custom-processor",
					version: "1.2.3",
					preprocess() {},
					postprocess() {},
				},
				expected: "custom-processor@1.2.3",
			},
		].forEach(({ desc, processor, expected }) => {
			it(`should not throw an error when config with ${desc} is normalized`, () => {
				const configs = new FlatConfigArray([
					{
						processor,
					},
				]);

				configs.normalizeSync();
				const config = configs.getConfig("foo.js");

				const expectedJSON = {
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
					processor: expected,
				};

				assert.deepStrictEqual(config.toJSON(), expectedJSON);
			});
		});
	});

	describe("Config array elements", () => {
		[
			["eslint:recommended", "Config (unnamed): Unexpected non-object config at original index 0."],
			["eslint:all", "Config (unnamed): Unexpected non-object config at original index 0."],
		].forEach(([cfg, msg]) => {
			it(`should error on '${cfg}' string config`, async () => {
				await assertInvalidConfig([cfg], msg);
			});
		});

		[
			[void 0, "Unexpected undefined config at original index 0."],
			[null, "Unexpected null config at original index 0."],
		].forEach(([value, msg]) => {
			it(`should throw an error when ${value === null ? "null" : "undefined"} original config is normalized`, () => {
				const configs = new FlatConfigArray([value]);
				assert.throws(() => configs.normalizeSync(), `Config (unnamed): ${msg}`);
			});

			it(`should throw an error when ${value === null ? "null" : "undefined"} original config is normalized asynchronously`, async () => {
				const configs = new FlatConfigArray([value]);
				try {
					await configs.normalize();
					assert.fail("Error not thrown");
				} catch (error) {
					assert.strictEqual(error.message, `Config (unnamed): ${msg}`);
				}
			});
		});

		[
			[void 0, "base index 0", "Unexpected undefined config at base index 0."],
			[null, "base index 0", "Unexpected null config at base index 0."],
			[void 0, "user-defined index 0", "Unexpected undefined config at user-defined index 0."],
			[null, "user-defined index 0", "Unexpected null config at user-defined index 0."],
		].forEach(([value, location, msg]) => {
			it(`should throw an error when ${value === null ? "null" : "undefined"} ${location} is normalized`, () => {
				const opts = location.includes("base") ? { baseConfig: [value] } : {};
				const configs = new FlatConfigArray([], opts);
				if (location.includes("user-defined")) {
					configs.push(value);
				}
				assert.throws(() => configs.normalizeSync(), `Config (unnamed): ${msg}`);
			});

			it(`should throw an error when ${value === null ? "null" : "undefined"} ${location} is normalized asynchronously`, async () => {
				const opts = location.includes("base") ? { baseConfig: [value] } : {};
				const configs = new FlatConfigArray([], opts);
				if (location.includes("user-defined")) {
					configs.push(value);
				}
				try {
					await configs.normalize();
					assert.fail("Error not thrown");
				} catch (error) {
					assert.strictEqual(error.message, `Config (unnamed): ${msg}`);
				}
			});
		});
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			const cases = [
				{
					desc: "merge two objects",
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
					desc: "merge with overrides",
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
					desc: "deep merge with overrides",
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
					desc: "merge object and undefined",
					values: [
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
					desc: "merge undefined and object",
					values: [
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

			cases.forEach(({ desc, values, expected }) => {
				it(`should ${desc}`, () => assertMergedResult(values, expected));
			});
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			it("should merge two objects", () =>
				assertMergedResult(
					[
						{ plugins: { a: pluginA, b: pluginB } },
						{ plugins: { c: pluginC } },
					],
					{
						plugins: {
							a: pluginA,
							b: pluginB,
							c: pluginC,
							...baseConfig.plugins,
						},
					},
				));

			it("should merge an object and undefined into one object", () =>
				assertMergedResult(
					[
						{ plugins: { a: pluginA, b: pluginB } },
						{},
					],
					{
						plugins: {
							a: pluginA,
							b: pluginB,
							...baseConfig.plugins,
						},
					},
				));

			it("should error when attempting to redefine a plugin", async () => {
				await assertInvalidConfig(
					[
						{ plugins: { a: pluginA, b: pluginB } },
						{ plugins: { a: pluginC } },
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

			it("should merge two values when second is a string", () => {
				return assertMergedResult(
					[
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
					{
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
				);
			});

			it("should merge two values when second is an object", () => {
				const processor = {
					preprocess() {},
					postprocess() {},
				};

				return assertMergedResult(
					[
						{ processor: "markdown/markdown" },
						{ processor },
					],
					{
						plugins: baseConfig.plugins,
						processor,
					},
				);
			});

			[
				["foo", "pluginName/objectName"],
				["", "pluginName/objectName"],
				[{}, "Object must have a preprocess() and a postprocess() method."],
				[
					"foo/bar",
					/Could not find "bar" in plugin "foo"/u,
				],
			].forEach(([processor, msg]) => {
				it(`should error when processor is ${JSON.stringify(processor)}`, async () => {
					await assertInvalidConfig(
						[{ processor }],
						msg,
					);
				});
			});
		});

		describe("linterOptions", () => {
			it("should error when an unexpected key is found", async () => {
				await assertInvalidConfig(
					[
						{
							linterOptions: {
								foo: true,
							},
						},
					],
					'Unexpected key "foo" found.',
				);
			});

			describe("noInlineConfig", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								linterOptions: {
									noInlineConfig: "true",
								},
							},
						],
						"Expected a Boolean.",
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
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
						{
							plugins: baseConfig.plugins,
							linterOptions: {
								noInlineConfig: false,
							},
						},
					));

				[
					[{}, {}],
					[{}, { noInlineConfig: false }],
				].forEach(([first, second]) => {
					it(`should merge ${JSON.stringify(first)} and ${JSON.stringify(second)}`, () =>
						assertMergedResult(
							[{ linterOptions: first }, { linterOptions: second }],
							{
								plugins: baseConfig.plugins,
								linterOptions: {
									noInlineConfig: false,
								},
							},
						));
				});
			});

			describe("reportUnusedDisableDirectives", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								linterOptions: {
									reportUnusedDisableDirectives: {},
								},
							},
						],
						/Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
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
						{
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedDisableDirectives: 1,
							},
						},
					));

				it("should merge undefined and object", () =>
					assertMergedResult(
						[
							{},
							{
								linterOptions: {
									reportUnusedDisableDirectives: "warn",
								},
							},
						],
						{
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedDisableDirectives: 1,
							},
						},
					));
			});

			describe("reportUnusedInlineConfigs", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								linterOptions: {
									reportUnusedInlineConfigs: {},
								},
							},
						],
						/Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
					);
				});

				it("should merge two objects when second object has overrides", () =>
					assertMergedResult(
						[
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
						{
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedInlineConfigs: 1,
							},
						},
					));

				it("should merge undefined and object", () =>
					assertMergedResult(
						[
							{},
							{
								linterOptions: {
									reportUnusedInlineConfigs: "warn",
								},
							},
						],
						{
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedInlineConfigs: 1,
							},
						},
					));
			});
		});

		describe("languageOptions", () => {
			it("should error when an unexpected key is found", async () => {
				await assertInvalidConfig(
					[
						{
							language: "@/js",
							languageOptions: {
								foo: true,
							},
						},
					],
					'Unexpected key "foo" found.',
				);
			});

			const languageOptionCases = [
				{
					desc: "different properties",
					values: [
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
							parserOptions: {
								sourceType: "commonjs",
							},
						},
					},
				},
				{
					desc: "default languageOptions from language",
					values: [
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
					expected: {
						language: "test/my",
						plugins: ["@", "test"],
						languageOptions: { foo: 42 },
						linterOptions: { reportUnusedDisableDirectives: 1 },
						processor: void 0,
					},
				},
				{
					desc: "configured over default",
					values: [
						{
							files: ["**/*.my"],
							plugins: {
								test: {
									languages: {
										my: {
											defaultLanguageOptions: { foo: 42, bar: 42 },
											validateLanguageOptions() {},
										},
									},
								},
							},
							language: "test/my",
							languageOptions: { bar: 43 },
						},
					],
					expected: {
						language: "test/my",
						plugins: ["@", "test"],
						languageOptions: { foo: 42, bar: 43 },
						linterOptions: { reportUnusedDisableDirectives: 1 },
						processor: void 0,
					},
				},
				{
					desc: "configured without default",
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
							languageOptions: { bar: 43 },
						},
					],
					expected: {
						language: "test/my",
						plugins: ["@", "test"],
						languageOptions: { bar: 43 },
						linterOptions: { reportUnusedDisableDirectives: 1 },
						processor: void 0,
					},
				},
				{
					desc: "empty languageOptions",
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
					expected: {
						language: "test/my",
						plugins: ["@", "test"],
						languageOptions: {},
						linterOptions: { reportUnusedDisableDirectives: 1 },
						processor: void 0,
					},
				},
			];

			languageOptionCases.forEach(({ desc, values, expected }) => {
				it(`should ${desc}`, async () => {
					const configs = new FlatConfigArray(values);
					await configs.normalize();
					const config = configs.getConfig("file.my");
					assert.deepStrictEqual(config, expected);
				});
			});

			describe("ecmaVersion", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									ecmaVersion: "true",
								},
							},
						],
						/Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
					);
				});

				const ecmaCases = [
					{
						values: [
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

				ecmaCases.forEach(({ values, expected }) => {
					it("should merge two objects when second object has overrides", async () => {
						await assertMergedResult(values, expected);
					});
				});
			});

			describe("sourceType", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									sourceType: "true",
								},
							},
						],
						'Expected "script", "module", or "commonjs".',
					);
				});

				const sourceCases = [
					{
						values: [
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
								parserOptions: {
									sourceType: "script",
								},
							},
						},
					},
				];

				sourceCases.forEach(({ values, expected }) => {
					it("should merge two objects when second object has overrides", async () => {
						await assertMergedResult(values, expected);
					});
				});
			});

			describe("globals", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									globals: "true",
								},
							},
						],
						"Expected an object.",
					);
				});

				it("should error when an unexpected key value is found", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									globals: {
										foo: "truex",
									},
								},
							},
						],
						'Key "foo": Expected "readonly", "writable", or "off".',
					);
				});

				[
					[" foo", /Global " foo" has leading or trailing whitespace/u],
					["foo ", /Global "foo " has leading or trailing whitespace/u],
				].forEach(([globalName, msg]) => {
					it(`should error when a global has ${globalName.trim() ? "trailing" : "leading"} whitespace`, async () => {
						await assertInvalidConfig(
							[
								{
									language: "@/js",
									languageOptions: {
										globals: {
											[globalName]: "readonly",
										},
									},
								},
							],
							msg,
						);
					});
				});

				const globalsCases = [
					{
						values: [
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
					{
						values: [
							{
								language: "@/js",
								languageOptions: {
									globals: { foo: null },
								},
							},
							{
								languageOptions: {
									globals: { foo: "writeable" },
								},
							},
						],
						expected: {
							plugins: baseConfig.plugins,
							language: jslang,
							languageOptions: {
								...jslang.defaultLanguageOptions,
								globals: { foo: "writeable" },
							},
						},
					},
				];

				globalsCases.forEach(({ values, expected }) => {
					it("should merge globals correctly", async () => {
						await assertMergedResult(values, expected);
					});
				});
			});

			describe("parser", () => {
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									parser: true,
								},
							},
						],
						'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					);
				});

				it("should error when a null is found", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									parser: null,
								},
							},
						],
						'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					);
				});

				it("should error when a parser is a string", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									parser: "foo/bar",
								},
							},
						],
						'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					);
				});

				it("should error when a value doesn't have a parse() method", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									parser: {},
								},
							},
						],
						'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
					);
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
				it("should error when an unexpected value is found", async () => {
					await assertInvalidConfig(
						[
							{
								language: "@/js",
								languageOptions: {
									parserOptions: "true",
								},
							},
						],
						"Expected an object.",
					);
				});

				const parserOptionsCases = [
					{
						first: { foo: "whatever" },
						second: { bar: "baz" },
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
						first: { ecmaFeatures: { jsx: true } },
						second: { ecmaFeatures: { globalReturn: true } },
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
						first: { ecmaFeatures: { jsx: true } },
						second: { ecmaVersion: 2021 },
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
						first: { foo: "whatever" },
						second: { foo: "bar" },
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

				parserOptionsCases.forEach(({ first, second, expected }) => {
					it("should merge parserOptions correctly", async () => {
						await assertMergedResult(
							[
								{
									language: "@/js",
									languageOptions: { parserOptions: first },
								},
								{
									languageOptions: { parserOptions: second },
								},
							],
							expected,
						);
					});
				});
			});
		});

		describe("rules", () => {
			it("should error when an unexpected value is found", async () => {
				await assertInvalidConfig(
					[
						{
							rules: true,
						},
					],
					"Expected an object.",
				);
			});

			it("should error when an invalid rule severity is set", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								foo: true,
							},
						},
					],
					'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				);
			});

			it("should error when an invalid rule severity of the right type is set", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								foo: 3,
							},
						},
					],
					'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				);
			});

			it("should error when a string rule severity is not in lowercase", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								foo: "Error",
							},
						},
					],
					'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				);
			});

			it("should error when an invalid rule severity is set in an array", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								foo: [true],
							},
						},
					],
					'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				);
			});

			it("should error when rule doesn't exist", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								foox: [1, "bar"],
							},
						},
					],
					/Key "rules": Key "foox": Could not find "foox" in plugin "@"./u,
				);
			});

			it("should error and suggest alternative when rule doesn't exist", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								"test2/match": "error",
							},
						},
					],
					/Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
				);
			});

			it("should error when plugin for rule doesn't exist", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								"doesnt-exist/match": "error",
							},
						},
					],
					/Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
				);
			});

			it("should error when rule options don't match schema", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								foo: [1, "bar"],
							},
						},
					],
					/Value "bar" should be equal to one of the allowed values/u,
				);
			});

			it("should error when rule options don't match schema requiring at least one item", async () => {
				await assertInvalidConfig(
					[
						{
							rules: {
								foo2: 1,
							},
						},
					],
					/Value \[\] should NOT have fewer than 1 items/u,
				);
			});

			[null, true, 0, 1, "", "always", () => {}].forEach(schema => {
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

			const ruleMergeCases = [
				{
					desc: "basic merge",
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
					desc: "simple overrides",
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
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [2, "always"],
							bar: [0],
						},
					},
				},
				{
					desc: "array overrides",
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
					expected: {
						plugins: baseConfig.plugins,
						rules: {
							foo: [2, "never"],
							foo2: [1, "foo"],
						},
					},
				},
				{
					desc: "override without options",
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
					desc: "merge with undefined",
					values: [
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
					desc: "nonexistent rules with off",
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

			ruleMergeCases.forEach(({ desc, values, expected }) => {
				it(`should ${desc}`, () => assertMergedResult(values, expected));
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
				testInvalidKey(key, `Key "${key}": This appears to be in eslintrc format rather than flat config format.`);
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

			assert.throws(() => {
				configs.getConfig("foo.js");
			}, /Key "rules": Key "camelcase":/u);
		});
	});
});
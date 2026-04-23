```typescript
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
 * Creates a normalized config object with default values.
 * @param {Object} config The base config object.
 * @returns {Object} The normalized config object.
 */
function createNormalizedConfig(config) {
	return {
		plugins: ["@", ...Object.keys(config.plugins || {})],
		language: config.language || jslang,
		languageOptions: {
			ecmaVersion: LATEST_ECMA_VERSION,
			sourceType: "module",
			parser: `espree@${espree.version}`,
			parserOptions: {
				sourceType: "module",
			},
			...config.languageOptions,
		},
		linterOptions: {
			reportUnusedDisableDirectives: 1,
		},
		processor: void 0,
		...config,
	};
}

/**
 * Creates a config array with plugins.
 * @param {Object} plugins The plugins object.
 * @returns {FlatConfigArray} The config array.
 */
function createConfigWithPlugins(plugins) {
	return new FlatConfigArray([
		{
			plugins,
		},
	]);
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
		const createSerializationTest = (
			config,
			expectedPlugins,
			expectedLanguageOptions,
			expectedLinterOptions,
			expectedProcessor,
		) => {
			it("should convert config into normalized JSON object", () => {
				const configs = new FlatConfigArray([config]);

				configs.normalizeSync();

				const configResult = configs.getConfig("foo.js");
				const expected = {
					plugins: expectedPlugins,
					language: expectedLanguageOptions.language,
					languageOptions: expectedLanguageOptions.options,
					linterOptions: expectedLinterOptions,
					processor: expectedProcessor,
				};
				const actual = configResult.toJSON();

				assert.deepStrictEqual(actual, expected);

				assert.strictEqual(stringify(actual), stringify(expected));
			});
		};

		createSerializationTest(
			{
				plugins: {
					a: {},
					b: {},
				},
			},
			["@", "a", "b"],
			{
				language: "@/js",
				options: {
					ecmaVersion: LATEST_ECMA_VERSION,
					sourceType: "module",
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
				},
			},
			{
				reportUnusedDisableDirectives: 1,
			},
			void 0,
		);

		createSerializationTest(
			{
				plugins: {
					a: {},
					b: {
						name: "b-plugin",
						version: "2.3.1",
					},
				},
			},
			["@", "a", "b:b-plugin@2.3.1"],
			{
				language: "@/js",
				options: {
					ecmaVersion: LATEST_ECMA_VERSION,
					sourceType: "module",
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
				},
			},
			{
				reportUnusedDisableDirectives: 1,
			},
			void 0,
		);

		createSerializationTest(
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
			["@", "a", "b:b-plugin@2.3.1"],
			{
				language: "@/js",
				options: {
					ecmaVersion: LATEST_ECMA_VERSION,
					sourceType: "module",
					parser: `espree@${espree.version}`,
					parserOptions: {
						sourceType: "module",
					},
				},
			},
			{
				reportUnusedDisableDirectives: 1,
			},
			void 0,
		);

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
			const expected = {
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
			};
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
							parse() {
								/* empty */
							},
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
							parse() {
								/* empty */
							},
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
							parse() {
								/* empty */
							},
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
							parse() {
								/* empty */
							},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), {
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
			});
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
							parse() {
								/* empty */
							},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), {
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
			});
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
							parse() {
								/* empty */
							},
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), {
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
			});
		});

		it("should not throw an error when config with named and versioned parser object outside of meta object is normalized", () => {
			const configs = new FlatConfigArray([
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
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), {
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
			});
		});

		it("should throw an error when config with unnamed processor object is normalized", () => {
			const configs = new FlatConfigArray([
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
						preprocess() {
							/* empty */
						},
						postprocess() {
							/* empty */
						},
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
						preprocess() {
							/* empty */
						},
						postprocess() {
							/* empty */
						},
					},
				},
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), {
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
			});
		});

		it("should not throw an error when config with named processor object without meta is normalized", () => {
			const configs = new FlatConfigArray([
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
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), {
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
			});
		});

		it("should not throw an error when config with named and versioned processor object is normalized", () => {
			const configs = new FlatConfigArray([
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
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), {
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
			});
		});

		it("should not throw an error when config with named and versioned processor object without meta is normalized", () => {
			const configs = new FlatConfigArray([
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
			]);

			configs.normalizeSync();

			const config = configs.getConfig("foo.js");

			assert.deepStrictEqual(config.toJSON(), {
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
			});
		});
	});

	describe("Config array elements", () => {
		const createInvalidConfigTest = (
			config,
			message,
			description,
		) => {
			it(description, async () => {
				await assertInvalidConfig([config], message);
			});
		};

		createInvalidConfigTest(
			["eslint:recommended"],
			"Config (unnamed): Unexpected non-object config at original index 0.",
			"should error on 'eslint:recommended' string config",
		);

		createInvalidConfigTest(
			["eslint:all"],
			"Config (unnamed): Unexpected non-object config at original index 0.",
			"should error on 'eslint:all' string config",
		);

		it("should throw an error when undefined original config is normalized", () => {
			const configs = new FlatConfigArray([void 0]);

			assert.throws(() => {
				configs.normalizeSync();
			}, "Config (unnamed): Unexpected undefined config at original index 0.");
		});

		it("should throw an error when undefined original config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([void 0]);

			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected undefined config at original index 0.",
				);
			}
		});

		it("should throw an error when null original config is normalized", () => {
			const configs = new FlatConfigArray([null]);

			assert.throws(() => {
				configs.normalizeSync();
			}, "Config (unnamed): Unexpected null config at original index 0.");
		});

		it("should throw an error when null original config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([null]);

			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected null config at original index 0.",
				);
			}
		});

		it("should throw an error when undefined base config is normalized", () => {
			const configs = new FlatConfigArray([], { baseConfig: [void 0] });

			assert.throws(() => {
				configs.normalizeSync();
			}, "Config (unnamed): Unexpected undefined config at base index 0.");
		});

		it("should throw an error when undefined base config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([], { baseConfig: [void 0] });

			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected undefined config at base index 0.",
				);
			}
		});

		it("should throw an error when null base config is normalized", () => {
			const configs = new FlatConfigArray([], { baseConfig: [null] });

			assert.throws(() => {
				configs.normalizeSync();
			}, "Config (unnamed): Unexpected null config at base index 0.");
		});

		it("should throw an error when null base config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([], { baseConfig: [null] });

			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected null config at base index 0.",
				);
			}
		});

		it("should throw an error when undefined user-defined config is normalized", () => {
			const configs = new FlatConfigArray([]);

			configs.push(void 0);

			assert.throws(() => {
				configs.normalizeSync();
			}, "Config (unnamed): Unexpected undefined config at user-defined index 0.");
		});

		it("should throw an error when undefined user-defined config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([]);

			configs.push(void 0);

			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected undefined config at user-defined index 0.",
				);
			}
		});

		it("should throw an error when null user-defined config is normalized", () => {
			const configs = new FlatConfigArray([]);

			configs.push(null);

			assert.throws(() => {
				configs.normalizeSync();
			}, "Config (unnamed): Unexpected null config at user-defined index 0.");
		});

		it("should throw an error when null user-defined config is normalized asynchronously", async () => {
			const configs = new FlatConfigArray([]);

			configs.push(null);

			try {
				await configs.normalize();
				assert.fail("Error not thrown");
			} catch (error) {
				assert.strictEqual(
					error.message,
					"Config (unnamed): Unexpected null config at user-defined index 0.",
				);
			}
		});
	});

	describe("Config Properties", () => {
		const createMergeTest = (
			configs,
			expectedSettings,
			description,
		) => {
			it(description, () =>
				assertMergedResult(
					configs,
					{
						plugins: baseConfig.plugins,
						settings: expectedSettings,
					},
				));
		};

		describe("settings", () => {
			createMergeTest(
				[
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
				{
					a: true,
					b: false,
					c: true,
					d: false,
				},
				"should merge two objects",
			);

			createMergeTest(
				[
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
				{
					a: false,
					b: false,
					c: true,
					d: [3, 4],
					e: [5, 6],
				},
				"should merge two objects when second object has overrides",
			);

			createMergeTest(
				[
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
				{
					object: {
						a: false,
						b: false,
						c: true,
					},
				},
				"should deeply merge two objects when second object has overrides",
			);

			createMergeTest(
				[
					{
						settings: {
							a: true,
							b: false,
						},
					},
					{},
				],
				{
					a: true,
					b: false,
				},
				"should merge an object and undefined into one object",
			);

			createMergeTest(
				[
					{},
					{
						settings: {
							a: true,
							b: false,
						},
					},
				],
				{
					a: true,
					b: false,
				},
				"should merge undefined and an object into one object",
			);
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			it("should merge two objects", () =>
				assertMergedResult(
					[
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
						{
							plugins: {
								a: pluginA,
								b: pluginB,
							},
						},
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
			const createProcessorTest = (
				config,
				expectedProcessor,
				description,
			) => {
				it(description, () => {
					const stubProcessor = {
						preprocess() {},
						postprocess() {},
					};

					return assertMergedResult(
						[config],
						{
							plugins: {
								markdown: {
									processors: {
										markdown: stubProcessor,
									},
								},
							},
							...baseConfig.plugins,
							processor: expectedProcessor,
						},
					);
				});
			};

			createProcessorTest(
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
									markdown: {
										preprocess() {},
										postprocess() {},
									},
								},
							},
						},
						processor: "markdown/markdown",
					},
				],
				{
					preprocess() {},
					postprocess() {},
				},
				"should merge two values when second is a string",
			);

			createProcessorTest(
				[
					{
						processor: "markdown/markdown",
					},
					{
						processor: {
							preprocess() {},
							postprocess() {},
						},
					},
				],
				{
					preprocess() {},
					postprocess() {},
				},
				"should merge two values when second is an object",
			);

			it("should error when an invalid string is used", async () => {
				await assertInvalidConfig(
					[
						{
							processor: "foo",
						},
					],
					"pluginName/objectName",
				);
			});

			it("should error when an empty string is used", async () => {
				await assertInvalidConfig(
					[
						{
							processor: "",
						},
					],
					"pluginName/objectName",
				);
			});

			it("should error when an invalid processor is used", async () => {
				await assertInvalidConfig(
					[
						{
							processor: {},
						},
					],
					"Object must have a preprocess() and a postprocess() method.",
				);
			});

			it("should error when a processor cannot be found in a plugin", async () => {
				await assertInvalidConfig(
					[
						{
							plugins: {
								foo: {},
							},
							processor: "foo/bar",
						},
					],
					/Could not find "bar" in plugin "foo"/u,
				);
			});
		});

		describe("linterOptions", () => {
			const createLinterOptionsTest = (
				config,
				expectedLinterOptions,
				description,
			) => {
				it(description, () =>
					assertMergedResult(
						[config],
						{
							plugins: baseConfig.plugins,
							linterOptions: expectedLinterOptions,
						},
					));
			};

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
				createLinterOptionsTest(
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
						noInlineConfig: false,
					},
					"should merge two objects when second object has overrides",
				);

				createLinterOptionsTest(
					[
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
						{},
					],
					{
						noInlineConfig: false,
					},
					"should merge an object and undefined into one object",
				);

				createLinterOptionsTest(
					[
						{},
						{
							linterOptions: {
								noInlineConfig: false,
							},
						},
					],
					{
						noInlineConfig: false,
					},
					"should merge undefined and an object into one object",
				);
			});

			describe("reportUnusedDisableDirectives", () => {
				createLinterOptionsTest(
					[
						{},
						{
							linterOptions: {
								reportUnusedDisableDirectives: "warn",
							},
						},
					],
					{
						reportUnusedDisableDirectives: 1,
					},
					"should merge an object and undefined into one object",
				);
			});

			describe("reportUnusedInlineConfigs", () => {
				createLinterOptionsTest(
					[
						{},
						{
							linterOptions: {
								reportUnusedInlineConfigs: "warn",
							},
						},
					],
					{
						reportUnusedInlineConfigs: 1,
					},
					"should merge an object and undefined into one object",
				);
			});
		});

		describe("languageOptions", () => {
			const createLanguageOptionsTest = (
				config,
				expectedLanguageOptions,
				description,
			) => {
				it(description, async () => {
					const configs = new FlatConfigArray([config]);

					await configs.normalize();

					const configResult = configs.getConfig("file.my");

					assert.deepStrictEqual(configResult.languageOptions, expectedLanguageOptions);
				});
			};

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

			it("should merge two languageOptions objects with different properties", () =>
				assertMergedResult(
					[
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
					{
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
				));

			createLanguageOptionsTest(
				[
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
				{ foo: 42 },
				"should get default languageOptions from the language",
			);

			createLanguageOptionsTest(
				[
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
				{
					foo: 42,
					bar: 43,
				},
				"should merge configured languageOptions over default languageOptions from the language",
			);

			createLanguageOptionsTest(
				[
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
				{ bar: 43 },
				"should use configured languageOptions when default languageOptions are not specified",
			);

			createLanguageOptionsTest(
				[
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
				{},
				"should default to an empty object if neither configured nor default languageOptions are specified",
			);

			describe("ecmaVersion", () => {
				createLanguageOptionsTest(
					[
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: 2021,
							},
						},
						{},
					],
					{
						...jslang.defaultLanguageOptions,
						ecmaVersion: 2021,
					},
					"should merge an object and undefined into one object",
				);

				createLanguageOptionsTest(
					[
						{},
						{
							language: "@/js",
							languageOptions: {
								ecmaVersion: 2021,
							},
						},
					],
					{
						...jslang.defaultLanguageOptions,
						ecmaVersion: 2021,
					},
					"should merge undefined and an object into one object",
				);
			});

			describe("sourceType", () => {
				createLanguageOptionsTest(
					[
						{
							language: "@/js",
							languageOptions: {
								sourceType: "module",
							},
						},
						{},
					],
					{
						...jslang.defaultLanguageOptions,
						sourceType: "module",
					},
					"should merge an object and undefined into one object",
				);

				createLanguageOptionsTest(
					[
						{},
						{
							language: "@/js",
							languageOptions: {
								sourceType: "module",
							},
						},
					],
					{
						...jslang.defaultLanguageOptions,
						sourceType: "module",
					},
					"should merge undefined and an object into one object",
				);
			});

			describe("globals", () => {
				createLanguageOptionsTest(
					[
						{
							language: "@/js",
							languageOptions: {
								globals: {
									foo: "readonly",
								},
							},
						},
						{},
					],
					{
						...jslang.defaultLanguageOptions,
						globals: {
							foo: "readonly",
						},
					},
					"should merge an object and undefined into one object",
				);

				createLanguageOptionsTest(
					[
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
					{
						...jslang.defaultLanguageOptions,
						globals: {
							foo: "false",
						},
					},
					"should merge undefined and an object into one object",
				);
			});

			describe("parser", () => {
				const createParserTest = (
					parser,
					description,
				) => {
					it(description, () => {
						const stubParser = { parse() {} };

						return assertMergedResult(
							[
								{
									language: "@/js",
									languageOptions: {
										parser: stubParser,
									},
								},
								{},
							],
							{
								plugins: {
									...baseConfig.plugins,
								},
								language: jslang,
								languageOptions: {
									...jslang.defaultLanguageOptions,
									parser: stubParser,
								},
							},
						);
					});
				};

				createParserTest(
					{ parse() {} },
					"should merge an object and undefined into one object",
				);

				createParserTest(
					{ parse() {} },
					"should merge undefined and an object into one object",
				);
			});

			describe("parserOptions", () => {
				const createParserOptionsTest = (
					parserOptions,
					description,
				) => {
					it(description, () =>
						assertMergedResult(
							[
								{
									language: "@/js",
									languageOptions: {
										parserOptions: parserOptions,
									},
								},
								{},
							],
							{
								plugins: baseConfig.plugins,
								language: jslang,
								languageOptions: {
									...jslang.defaultLanguageOptions,
									parserOptions: {
										...parserOptions,
										sourceType: "module",
									},
								},
							},
						));
				};

				createParserOptionsTest(
					{
						foo: "whatever",
					},
					"should merge an object and undefined into one object",
				);

				createParserOptionsTest(
					{
						ecmaFeatures: {
							jsx: true,
						},
					},
					"should deeply merge two objects when second object has missing key",
				);
			});
		});

		describe("rules", () => {
			const createRulesTest = (
				configs,
				expectedRules,
				description,
			) => {
				it(description, () =>
					assertMergedResult(
						configs,
						{
							plugins: baseConfig.plugins,
							rules: expectedRules,
						},
					));
			};

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

				// does not throw
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

				// does not throw
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

				// does not throw
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

			createRulesTest(
				[
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
				{
					foo: [1],
					bar: [2],
					baz: [1],
					boom: [0],
				},
				"should merge two objects",
			);

			createRulesTest(
				[
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
				{
					foo: [2, "always"],
					bar: [0],
				},
				"should merge two objects when second object has simple overrides",
			);

			createRulesTest(
				[
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
				{
					foo: [2, "never"],
					foo2: [1, "foo"],
				},
				"should merge two objects when second object has array overrides",
			);

			createRulesTest(
				[
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
				{
					foo: [2, "always"],
					bar: [0],
					"@foo/baz/boom/bang": [2],
				},
				"should merge two objects and options when second object overrides without options",
			);

			createRulesTest(
				[
					{
						rules: {
							foo: 0,
							bar: 1,
						},
					},
					{},
				],
				{
					foo: [0],
					bar: [1],
				},
				"should merge an object and undefined into one object",
			);

			createRulesTest(
				[
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
				{
					foo: [0],
					bar: [1],
					nonExistentRule: [0],
					nonExistentRule2: [0, "bar"],
				},
				"should merge a rule that doesn't exist without error when the rule is off",
			);

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
			const createInvalidKeyTest = (key, description) => {
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
			};

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
				createInvalidKeyTest(key, `should error when a ${key} key is found`);
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

			// exact error may differ based on structuredClone implementation so just test prefix
			assert.throws(() => {
				configs.getConfig("foo.js");
			}, /Key "rules": Key "camelcase":/u);
		});
	});
});
```
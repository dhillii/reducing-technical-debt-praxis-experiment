```javascript
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
 * Creates a config array with a base config.
 * @param {*[]} baseConfig The base config array.
 * @returns {FlatConfigArray} The config array.
 */
function createFlatConfigArrayWithBase(baseConfig) {
	return new FlatConfigArray([], {
		baseConfig,
	});
}

/**
 * Creates a config array with a user-defined config.
 * @param {*[]} configs The user-defined configs.
 * @returns {FlatConfigArray} The config array.
 */
function createFlatConfigArrayWithUserConfigs(configs) {
	return new FlatConfigArray(configs);
}

/**
 * Asserts that a config throws an error during normalization.
 * @param {FlatConfigArray} configs The config array.
 * @param {string} expectedMessage The expected error message.
 * @returns {void}
 * @throws {AssertionError} If the error message doesn't match.
 */
function assertConfigError(configs, expectedMessage) {
	assert.throws(() => {
		configs.normalizeSync();
	}, expectedMessage);
}

/**
 * Asserts that a config throws an error during async normalization.
 * @param {FlatConfigArray} configs The config array.
 * @param {string} expectedMessage The expected error message.
 * @returns {void}
 * @throws {AssertionError} If the error message doesn't match.
 */
async function assertConfigErrorAsync(configs, expectedMessage) {
	try {
		await configs.normalize();
		assert.fail("Error not thrown");
	} catch (error) {
		assert.strictEqual(error.message, expectedMessage);
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
		const defaultConfig = {
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
		};

		const configWithPlugins = {
			plugins: ["@", "a", "b"],
			...defaultConfig,
		};

		const configWithNamedPlugins = {
			plugins: ["@", "a", "b:b-plugin@2.3.1"],
			...defaultConfig,
		};

		const configWithMetaPlugins = {
			plugins: ["@", "a", "b:b-plugin@2.3.1"],
			...defaultConfig,
		};

		const configWithGlobals = {
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

		const configWithEmptyLanguageOptions = {
			plugins: ["@", "test"],
			language: "test/my",
			languageOptions: {},
			linterOptions: {
				reportUnusedDisableDirectives: 1,
			},
			processor: void 0,
		};

		const configWithNamedParser = {
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
		};

		const configWithNamedVersionedParser = {
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
		};

		const configWithMetaNamedVersionedParser = {
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
		};

		const configWithNamedVersionedParserOutsideMeta = {
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
		};

		const configWithNamedProcessor = {
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
		};

		const configWithNamedProcessorNoMeta = {
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
		};

		const configWithNamedVersionedProcessor = {
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
		};

		const configWithNamedVersionedProcessorNoMeta = {
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
			const expected = {
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
			const expected = {
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
			};
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
			const expected = {
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
			};
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

			assert.deepStrictEqual(config.toJSON(), configWithNamedParser);
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

			assert.deepStrictEqual(config.toJSON(), configWithNamedVersionedParser);
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

			assert.deepStrictEqual(config.toJSON(), configWithMetaNamedVersionedParser);
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

			assert.deepStrictEqual(config.toJSON(), configWithNamedVersionedParserOutsideMeta);
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

			assert.deepStrictEqual(config.toJSON(), configWithNamedProcessor);
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

			assert.deepStrictEqual(config.toJSON(), configWithNamedProcessorNoMeta);
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

			assert.deepStrictEqual(config.toJSON(), configWithNamedVersionedProcessor);
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

			assert.deepStrictEqual(config.toJSON(), configWithNamedVersionedProcessorNoMeta);
		});
	});

	describe("Config array elements", () => {
		const invalidConfigTests = [
			{
				name: "should error on 'eslint:recommended' string config",
				configs: ["eslint:recommended"],
				message: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				name: "should error on 'eslint:all' string config",
				configs: ["eslint:all"],
				message: "Config (unnamed): Unexpected non-object config at original index 0.",
			},
			{
				name: "should throw an error when undefined original config is normalized",
				configs: [void 0],
				message: "Config (unnamed): Unexpected undefined config at original index 0.",
			},
			{
				name: "should throw an error when undefined original config is normalized asynchronously",
				configs: [void 0],
				message: "Config (unnamed): Unexpected undefined config at original index 0.",
				async: true,
			},
			{
				name: "should throw an error when null original config is normalized",
				configs: [null],
				message: "Config (unnamed): Unexpected null config at original index 0.",
			},
			{
				name: "should throw an error when null original config is normalized asynchronously",
				configs: [null],
				message: "Config (unnamed): Unexpected null config at original index 0.",
				async: true,
			},
			{
				name: "should throw an error when undefined base config is normalized",
				configs: [],
				baseConfig: [void 0],
				message: "Config (unnamed): Unexpected undefined config at base index 0.",
			},
			{
				name: "should throw an error when undefined base config is normalized asynchronously",
				configs: [],
				baseConfig: [void 0],
				message: "Config (unnamed): Unexpected undefined config at base index 0.",
				async: true,
			},
			{
				name: "should throw an error when null base config is normalized",
				configs: [],
				baseConfig: [null],
				message: "Config (unnamed): Unexpected null config at base index 0.",
			},
			{
				name: "should throw an error when null base config is normalized asynchronously",
				configs: [],
				baseConfig: [null],
				message: "Config (unnamed): Unexpected null config at base index 0.",
				async: true,
			},
			{
				name: "should throw an error when undefined user-defined config is normalized",
				configs: [void 0],
				message: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
			},
			{
				name: "should throw an error when undefined user-defined config is normalized asynchronously",
				configs: [void 0],
				message: "Config (unnamed): Unexpected undefined config at user-defined index 0.",
				async: true,
			},
			{
				name: "should throw an error when null user-defined config is normalized",
				configs: [null],
				message: "Config (unnamed): Unexpected null config at user-defined index 0.",
			},
			{
				name: "should throw an error when null user-defined config is normalized asynchronously",
				configs: [null],
				message: "Config (unnamed): Unexpected null config at user-defined index 0.",
				async: true,
			},
		];

		invalidConfigTests.forEach(test => {
			it(test.name, () => {
				const configs = createFlatConfigArrayWithUserConfigs(test.configs);

				if (test.baseConfig) {
					configs = createFlatConfigArrayWithBase([test.baseConfig]);
				}

				if (test.async) {
					assertConfigErrorAsync(configs, test.message);
				} else {
					assertConfigError(configs, test.message);
				}
			});
		});
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			const settingsTests = [
				{
					name: "should merge two objects",
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
					name: "should merge two objects when second object has overrides",
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
					name: "should deeply merge two objects when second object has overrides",
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
					name: "should merge an object and undefined into one object",
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
					name: "should merge undefined and an object into one object",
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

			settingsTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
			});
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			const pluginTests = [
				{
					name: "should merge two objects",
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
					name: "should merge an object and undefined into one object",
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
			];

			pluginTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
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
			const processorTests = [
				{
					name: "should merge two values when second is a string",
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
					expected: {
						plugins: {
							markdown: {
								processors: {
									markdown: {
										preprocess() {},
										postprocess() {},
									},
								},
							},
							...baseConfig.plugins,
						},
						processor: {
							preprocess() {},
							postprocess() {},
						},
					},
				},
				{
					name: "should merge two values when second is an object",
					configs: [
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
					expected: {
						plugins: baseConfig.plugins,
						processor: {
							preprocess() {},
							postprocess() {},
						},
					},
				},
			];

			processorTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
			});

			const processorErrorTests = [
				{
					name: "should error when an invalid string is used",
					configs: [{ processor: "foo" }],
					message: "pluginName/objectName",
				},
				{
					name: "should error when an empty string is used",
					configs: [{ processor: "" }],
					message: "pluginName/objectName",
				},
				{
					name: "should error when an invalid processor is used",
					configs: [{ processor: {} }],
					message: "Object must have a preprocess() and a postprocess() method.",
				},
				{
					name: "should error when a processor cannot be found in a plugin",
					configs: [
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

			processorErrorTests.forEach(test => {
				it(test.name, async () => {
					await assertInvalidConfig(test.configs, test.message);
				});
			});
		});

		describe("linterOptions", () => {
			const linterOptionsTests = [
				{
					name: "should error when an unexpected key is found",
					configs: [{ linterOptions: { foo: true } }],
					message: 'Unexpected key "foo" found.',
				},
			];

			linterOptionsTests.forEach(test => {
				it(test.name, async () => {
					await assertInvalidConfig(test.configs, test.message);
				});
			});

			describe("noInlineConfig", () => {
				const noInlineConfigTests = [
					{
						name: "should error when an unexpected value is found",
						configs: [{ linterOptions: { noInlineConfig: "true" } }],
						message: "Expected a Boolean.",
					},
					{
						name: "should merge two objects when second object has overrides",
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
						name: "should merge an object and undefined into one object",
						configs: [{ linterOptions: { noInlineConfig: false } }, {}],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { noInlineConfig: false },
						},
					},
					{
						name: "should merge undefined and an object into one object",
						configs: [{}, { linterOptions: { noInlineConfig: false } }],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { noInlineConfig: false },
						},
					},
				];

				noInlineConfigTests.forEach(test => {
					it(test.name, () =>
						assertMergedResult(test.configs, test.expected));
				});
			});

			describe("reportUnusedDisableDirectives", () => {
				const reportUnusedDisableDirectivesTests = [
					{
						name: "should error when an unexpected value is found",
						configs: [{ linterOptions: { reportUnusedDisableDirectives: {} } }],
						message: /Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
					},
					{
						name: "should merge two objects when second object has overrides",
						configs: [
							{ linterOptions: { reportUnusedDisableDirectives: "off" } },
							{ linterOptions: { reportUnusedDisableDirectives: "warn" } },
						],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedDisableDirectives: 1 },
						},
					},
					{
						name: "should merge an object and undefined into one object",
						configs: [{}, { linterOptions: { reportUnusedDisableDirectives: "warn" } }],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedDisableDirectives: 1 },
						},
					},
				];

				reportUnusedDisableDirectivesTests.forEach(test => {
					it(test.name, () =>
						assertMergedResult(test.configs, test.expected));
				});
			});

			describe("reportUnusedInlineConfigs", () => {
				const reportUnusedInlineConfigsTests = [
					{
						name: "should error when an unexpected value is found",
						configs: [{ linterOptions: { reportUnusedInlineConfigs: {} } }],
						message: /Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
					},
					{
						name: "should merge two objects when second object has overrides",
						configs: [
							{ linterOptions: { reportUnusedInlineConfigs: "off" } },
							{ linterOptions: { reportUnusedInlineConfigs: "warn" } },
						],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedInlineConfigs: 1 },
						},
					},
					{
						name: "should merge an object and undefined into one object",
						configs: [{}, { linterOptions: { reportUnusedInlineConfigs: "warn" } }],
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: { reportUnusedInlineConfigs: 1 },
						},
					},
				];

				reportUnusedInlineConfigsTests.forEach(test => {
					it(test.name, () =>
						assertMergedResult(test.configs, test.expected));
				});
			});
		});

		describe("languageOptions", () => {
			const languageOptionsTests = [
				{
					name: "should error when an unexpected key is found",
					configs: [
						{
							language: "@/js",
							languageOptions: { foo: true },
						},
					],
					message: 'Unexpected key "foo" found.',
				},
			];

			languageOptionsTests.forEach(test => {
				it(test.name, async () => {
					await assertInvalidConfig(test.configs, test.message);
				});
			});

			const languageOptionsMergeTests = [
				{
					name: "should merge two languageOptions objects with different properties",
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
							parserOptions: {
								sourceType: "commonjs",
							},
						},
					},
				},
			];

			languageOptionsMergeTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
			});

			const languageOptionsDefaultTests = [
				{
					name: "should get default languageOptions from the language",
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
				},
				{
					name: "should merge configured languageOptions over default languageOptions from the language",
					configs: [
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
				},
				{
					name: "should use configured languageOptions when default languageOptions are not specified",
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
				},
				{
					name: "should default to an empty object if neither configured nor default languageOptions are specified",
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
				},
			];

			languageOptionsDefaultTests.forEach(test => {
				it(test.name, async () => {
					const configs = createFlatConfigArray(test.configs);
					await configs.normalize();
					const config = configs.getConfig("file.my");

					if (test.name === "should get default languageOptions from the language") {
						assert.deepStrictEqual(config.languageOptions, { foo: 42 });
					} else if (test.name === "should merge configured languageOptions over default languageOptions from the language") {
						assert.deepStrictEqual(config.languageOptions, { foo: 42, bar: 43 });
					} else if (test.name === "should use configured languageOptions when default languageOptions are not specified") {
						assert.deepStrictEqual(config.languageOptions, { bar: 43 });
					} else {
						assert.isObject(config.languageOptions);
						assert.strictEqual(Object.keys(config.languageOptions).length, 0);
					}
				});
			});

			const ecmaVersionTests = [
				{
					name: "should error when an unexpected value is found",
					configs: [
						{
							language: "@/js",
							languageOptions: { ecmaVersion: "true" },
						},
					],
					message: /Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
				},
				{
					name: "should merge two objects when second object has overrides",
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
				{
					name: "should merge an object and undefined into one object",
					configs: [
						{
							language: "@/js",
							languageOptions: { ecmaVersion: 2021 },
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
					name: "should merge undefined and an object into one object",
					configs: [
						{},
						{
							language: "@/js",
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

			ecmaVersionTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
			});

			const sourceTypeTests = [
				{
					name: "should error when an unexpected value is found",
					configs: [
						{
							language: "@/js",
							languageOptions: { sourceType: "true" },
						},
					],
					message: 'Expected "script", "module", or "commonjs".',
				},
				{
					name: "should merge two objects when second object has overrides",
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
							parserOptions: {
								sourceType: "script",
							},
						},
					},
				},
				{
					name: "should merge an object and undefined into one object",
					configs: [
						{
							language: "@/js",
							languageOptions: { sourceType: "script" },
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
					name: "should merge undefined and an object into one object",
					configs: [
						{},
						{
							language: "@/js",
							languageOptions: { sourceType: "module" },
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

			sourceTypeTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
			});

			const globalsTests = [
				{
					name: "should error when an unexpected value is found",
					configs: [
						{
							language: "@/js",
							languageOptions: { globals: "true" },
						},
					],
					message: "Expected an object.",
				},
				{
					name: "should error when an unexpected key value is found",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								globals: { foo: "truex" },
							},
						},
					],
					message: 'Key "foo": Expected "readonly", "writable", or "off".',
				},
				{
					name: "should error when a global has leading whitespace",
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
					name: "should error when a global has trailing whitespace",
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
					name: "should merge two objects when second object has different keys",
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
							globals: {
								foo: "readonly",
								bar: "writable",
							},
						},
					},
				},
				{
					name: "should merge two objects when second object has overrides",
					configs: [
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
				{
					name: "should merge an object and undefined into one object",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								globals: { foo: "readable" },
							},
						},
						{},
					],
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: { foo: "readable" },
						},
					},
				},
				{
					name: "should merge undefined and an object into one object",
					configs: [
						{},
						{
							language: "@/js",
							languageOptions: {
								globals: { foo: "false" },
							},
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: { foo: "false" },
						},
					},
				},
				{
					name: "should merge string and an object into one object",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								globals: "foo",
							},
						},
						{
							languageOptions: {
								globals: { foo: "false" },
							},
						},
					],
					expected: {
						plugins: baseConfig.plugins,
						language: jslang,
						languageOptions: {
							...jslang.defaultLanguageOptions,
							globals: { foo: "false" },
						},
					},
				},
			];

			globalsTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
			});

			const parserTests = [
				{
					name: "should error when an unexpected value is found",
					configs: [
						{
							language: "@/js",
							languageOptions: { parser: true },
						},
					],
					message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				},
				{
					name: "should error when a null is found",
					configs: [
						{
							language: "@/js",
							languageOptions: { parser: null },
						},
					],
					message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				},
				{
					name: "should error when a parser is a string",
					configs: [
						{
							language: "@/js",
							languageOptions: { parser: "foo/bar" },
						},
					],
					message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				},
				{
					name: "should error when a value doesn't have a parse() method",
					configs: [
						{
							language: "@/js",
							languageOptions: { parser: {} },
						},
					],
					message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
				},
				{
					name: "should merge two objects when second object has overrides",
					configs: [
						{
							language: "@/js",
							languageOptions: { parser: { parse() {} } },
						},
						{
							languageOptions: { parser: { parse() {} } },
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
					name: "should merge an object and undefined into one object",
					configs: [
						{
							language: "@/js",
							languageOptions: { parser: { parse() {} } },
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
					name: "should merge undefined and an object into one object",
					configs: [
						{},
						{
							language: "@/js",
							languageOptions: { parser: { parse() {} } },
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
			];

			parserTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
			});

			const parserOptionsTests = [
				{
					name: "should error when an unexpected value is found",
					configs: [
						{
							language: "@/js",
							languageOptions: { parserOptions: "true" },
						},
					],
					message: "Expected an object.",
				},
				{
					name: "should merge two objects when second object has different keys",
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
				{
					name: "should deeply merge two objects when second object has different keys",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parserOptions: {
									ecmaFeatures: { jsx: true },
								},
							},
						},
						{
							languageOptions: {
								parserOptions: {
									ecmaFeatures: { globalReturn: true },
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
					name: "should deeply merge two objects when second object has missing key",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parserOptions: {
									ecmaFeatures: { jsx: true },
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
					name: "should merge two objects when second object has overrides",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parserOptions: { foo: "whatever" },
							},
						},
						{
							languageOptions: {
								parserOptions: { foo: "bar" },
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
					name: "should merge an object and undefined into one object",
					configs: [
						{
							language: "@/js",
							languageOptions: {
								parserOptions: { foo: "whatever" },
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
					name: "should merge undefined and an object into one object",
					configs: [
						{},
						{
							language: "@/js",
							languageOptions: {
								parserOptions: { foo: "bar" },
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

			parserOptionsTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
			});
		});

		describe("rules", () => {
			const rulesErrorTests = [
				{
					name: "should error when an unexpected value is found",
					configs: [{ rules: true }],
					message: "Expected an object.",
				},
				{
					name: "should error when an invalid rule severity is set",
					configs: [{ rules: { foo: true } }],
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "should error when an invalid rule severity of the right type is set",
					configs: [{ rules: { foo: 3 } }],
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "should error when a string rule severity is not in lowercase",
					configs: [{ rules: { foo: "Error" } }],
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "should error when an invalid rule severity is set in an array",
					configs: [{ rules: { foo: [true] } }],
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
				},
				{
					name: "should error when rule doesn't exist",
					configs: [{ rules: { foox: [1, "bar"] } }],
					message: /Key "rules": Key "foox": Could not find "foox" in plugin "@"./u,
				},
				{
					name: "should error and suggest alternative when rule doesn't exist",
					configs: [{ rules: { "test2/match": "error" } }],
					message: /Key "rules": Key "test2\/match": Could not find "match" in plugin "test2"\. Did you mean "test1\/match"\?/u,
				},
				{
					name: "should error when plugin for rule doesn't exist",
					configs: [{ rules: { "doesnt-exist/match": "error" } }],
					message: /Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
				},
				{
					name: "should error when rule options don't match schema",
					configs: [{ rules: { foo: [1, "bar"] } }],
					message: /Value "bar" should be equal to one of the allowed values/u,
				},
				{
					name: "should error when rule options don't match schema requiring at least one item",
					configs: [{ rules: { foo2: 1 } }],
					message: /Value \[\] should NOT have fewer than 1 items/u,
				},
			];

			rulesErrorTests.forEach(test => {
				it(test.name, async () => {
					await assertInvalidConfig(test.configs, test.message);
				});
			});

			const schemaErrorTests = [
				null,
				true,
				0,
				1,
				"",
				"always",
				() => {},
			];

			schemaErrorTests.forEach(schema => {
				it(`should error with a message that contains the rule name when a configured rule has invalid \`meta.schema\` (${schema})`, async () => {
					await assertInvalidConfig(
						[
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
											meta: { schema: { minItems: [] } },
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
										meta: { schema: false },
										create() {
											return {};
										},
									},
									baz: {
										meta: { schema: false },
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

			const rulesMergeTests = [
				{
					name: "should merge two objects",
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
					name: "should merge two objects when second object has simple overrides",
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
					name: "should merge two objects when second object has array overrides",
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
					name: "should merge two objects and options when second object overrides without options",
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
					name: "should merge an object and undefined into one object",
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
					name: "should merge a rule that doesn't exist without error when the rule is off",
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
			];

			rulesMergeTests.forEach(test => {
				it(test.name, () =>
					assertMergedResult(test.configs, test.expected));
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
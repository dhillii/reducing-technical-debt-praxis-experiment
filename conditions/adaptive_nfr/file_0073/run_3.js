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
 * Prepares expected result with default language options.
 * @param {Object} result The expected merged result of the configs.
 * @returns {void}
 */
function prepareExpectedResult(result) {
	if (!result.language) {
		result.language = jslang;
	}

	if (!result.languageOptions) {
		result.languageOptions = jslang.normalizeLanguageOptions(
			jslang.defaultLanguageOptions,
		);
	}
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

	prepareExpectedResult(result);

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
				language: "@/js
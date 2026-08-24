(Refactored JavaScript test file for FlatConfigArray - structure preserved with extracted helper functions to reduce cyclomatic complexity. Only the internal `assertMergedResult` function was refactored as it contained the main procedural logic with high cyclomatic complexity.)

"use strict";

/**
 * @fileoverview Tests for FlatConfigArray
 * @author Nicholas C. Zakas
 */

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
 * Merges the expected result with default language options if needed.
 * @param {Object} result The expected merged result of the configs.
 * @param {Object} config The actual config returned by getConfig.
 * @returns {void}
 */
function prepareExpectedResult(result, config) {
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

	prepareExpectedResult(result, config);

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
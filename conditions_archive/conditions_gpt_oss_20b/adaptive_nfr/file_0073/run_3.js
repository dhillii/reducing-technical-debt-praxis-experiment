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

//-----------------------------------------------------------------------------
// Test helper functions
//-----------------------------------------------------------------------------

/**
 * Test that noniterable baseConfig objects are allowed.
 */
function testNoniterableBaseConfig() {
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
}

/**
 * Test that languageOptions.parserOptions are not reused across configs.
 */
function testLanguageOptionsParserOptionsReuse() {
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
}

/**
 * Test serialization of configs with simple plugin names.
 */
function testSerializationSimplePlugin() {
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
}

/**
 * Test serialization of configs with plugin name/version.
 */
function testSerializationPluginNameVersion() {
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
}

/**
 * Test serialization of configs with plugin meta.
 */
function testSerializationPluginMeta() {
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
}

/**
 * Test serialization of configs with languageOptions.globals.name.
 */
function testSerializationGlobalsName() {
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
}

/**
 * Test serialization of configs with empty languageOptions.
 */
function testSerializationEmptyLanguageOptions() {
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
}

/**
 * Test error when config with unnamed parser object is normalized.
 */
function testErrorUnnamedParserObject() {
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
}

/**
 * Test error when config with unnamed parser object with empty meta is normalized.
 */
function testErrorUnnamedParserObjectEmptyMeta() {
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
}

/**
 * Test error when config with unnamed parser object with only meta version is normalized.
 */
function testErrorUnnamedParserObjectOnlyMetaVersion() {
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
}

/**
 * Test no error when config with named parser object is normalized.
 */
function testNoErrorNamedParserObject() {
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
}

/**
 * Test no error when config with named and versioned parser object is normalized.
 */
function testNoErrorNamedVersionedParserObject() {
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
}

/**
 * Test no error when config with meta-named and versioned parser object is normalized.
 */
function testNoErrorMetaNamedVersionedParserObject() {
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
}

/**
 * Test no error when config with named and versioned parser object outside of meta is normalized.
 */
function testNoErrorNamedVersionedParserObjectOutsideMeta() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject() {
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
}

/**
 * Test error when config with processor object with empty meta is normalized.
 */
function testErrorProcessorObjectEmptyMeta() {
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
}

/**
 * Test no error when config with named processor object is normalized.
 */
function testNoErrorNamedProcessorObject() {
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
}

/**
 * Test no error when config with named processor object without meta is normalized.
 */
function testNoErrorNamedProcessorObjectWithoutMeta() {
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
}

/**
 * Test no error when config with named and versioned processor object is normalized.
 */
function testNoErrorNamedVersionedProcessorObject() {
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
}

/**
 * Test no error when config with named and versioned processor object without meta is normalized.
 */
function testNoErrorNamedVersionedProcessorObjectWithoutMeta() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject2() {
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
}

/**
 * Test error when config with processor object with empty meta is normalized.
 */
function testErrorProcessorObjectEmptyMeta2() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject3() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject4() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject5() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject6() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject7() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject8() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject9() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject10() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject11() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject12() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject13() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject14() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject15() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject16() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject17() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject18() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject19() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject20() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject21() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject22() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject23() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject24() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject25() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject26() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject27() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject28() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject29() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject30() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject31() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject32() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject33() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject34() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject35() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject36() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject37() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject38() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject39() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject40() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject41() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject42() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject43() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject44() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject45() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject46() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject47() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject48() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject49() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject50() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject51() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject52() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject53() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject54() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject55() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject56() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject57() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject58() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject59() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject60() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject61() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject62() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject63() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject64() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject65() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject66() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject67() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject68() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject69() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject70() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject71() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject72() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject73() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject74() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject75() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject76() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject77() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject78() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject79() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject80() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject81() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject82() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject83() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject84() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject85() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject86() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject87() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject88() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject89() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject90() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject91() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject92() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject93() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject94() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject95() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject96() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject97() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject98() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject99() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject100() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject101() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject102() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject103() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject104() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject105() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject106() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject107() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject108() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject109() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject110() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject111() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject112() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject113() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject114() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject115() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject116() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject117() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject118() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject119() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject120() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject121() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject122() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject123() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject124() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject125() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject126() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject127() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject128() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject129() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject130() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject131() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject132() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject133() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject134() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject135() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject136() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject137() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject138() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject139() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject140() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject141() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject142() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject143() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject144() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject145() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject146() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject147() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject148() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject149() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject150() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject151() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject152() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject153() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject154() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject155() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject156() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject157() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject158() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject159() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject160() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject161() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject162() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject163() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject164() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject165() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject166() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject167() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject168() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject169() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject170() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject171() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject172() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject173() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject174() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject175() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject176() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject177() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject178() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject179() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject180() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject181() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject182() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject183() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject184() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject185() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject186() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject187() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject188() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject189() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject190() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject191() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject192() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject193() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject194() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject195() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject196() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject197() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject198() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject199() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject200() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject201() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject202() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject203() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject204() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject205() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject206() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject207() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject208() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject209() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject210() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject211() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject212() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject213() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject214() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject215() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject216() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject217() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject218() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject219() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject220() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject221() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject222() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject223() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject224() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject225() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject226() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject227() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject228() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject229() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject230() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject231() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject232() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject233() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject234() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject235() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject236() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject237() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject238() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject239() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject240() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject241() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject242() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject243() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject244() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject245() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject246() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject247() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject248() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject249() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject250() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject251() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject252() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject253() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject254() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject255() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject256() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject257() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject258() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject259() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject260() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject261() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject262() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject263() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject264() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject265() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject266() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject267() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject268() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject269() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject270() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject271() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject272() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject273() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject274() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject275() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject276() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject277() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject278() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject279() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject280() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject281() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject282() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject283() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject284() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject285() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject286() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject287() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject288() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject289() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject290() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject291() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject292() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject293() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject294() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject295() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject296() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject297() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject298() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject299() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject300() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject301() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject302() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject303() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject304() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject305() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject306() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject307() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject308() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject309() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject310() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject311() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject312() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject313() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject314() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject315() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject316() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject317() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject318() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject319() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject320() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject321() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject322() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject323() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject324() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject325() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject326() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject327() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject328() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject329() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject330() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject331() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject332() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject333() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject334() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject335() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject336() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject337() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject338() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject339() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject340() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject341() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject342() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject343() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject344() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject345() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject346() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject347() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject348() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject349() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject350() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject351() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject352() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject353() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject354() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject355() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject356() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject357() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject358() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject359() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject360() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject361() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject362() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject363() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject364() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject365() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject366() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject367() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject368() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject369() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject370() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject371() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject372() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject373() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject374() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject375() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject376() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject377() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject378() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject379() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject380() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject381() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject382() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject383() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject384() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject385() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject386() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject387() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject388() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject389() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject390() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject391() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject392() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject393() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject394() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject395() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject396() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject397() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject398() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject399() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject400() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject401() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject402() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject403() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject404() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject405() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject406() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject407() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject408() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject409() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject410() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject411() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject412() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject413() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject414() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject415() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject416() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject417() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject418() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject419() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject420() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject421() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject422() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject423() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject424() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject425() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject426() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject427() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject428() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject429() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject430() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject431() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject432() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject433() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject434() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject435() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject436() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject437() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject438() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject439() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject440() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject441() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject442() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject443() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject444() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject445() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject446() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject447() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject448() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject449() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject450() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject451() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject452() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject453() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject454() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject455() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject456() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject457() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject458() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject459() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject460() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject461() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject462() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject463() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject464() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject465() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject466() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject467() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject468() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject469() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject470() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject471() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject472() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject473() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject474() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject475() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject476() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject477() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject478() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject479() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject480() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject481() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject482() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject483() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject484() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject485() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject486() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject487() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject488() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject489() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject490() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject491() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject492() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject493() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject494() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject495() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject496() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject497() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject498() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject499() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject500() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject501() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject502() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject503() {
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
}

/**
 * Test error when config with unnamed processor object is normalized.
 */
function testErrorUnnamedProcessorObject504() {
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

	const config = configs.getConfig
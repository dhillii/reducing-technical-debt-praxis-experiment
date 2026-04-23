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

function runMergeTest(description, values, expected) {
	it(description, async () => {
		await assertMergedResult(values, expected);
	});
}

function runInvalidConfigTest(description, values, message) {
	it(description, async () => {
		await assertInvalidConfig(values, message);
	});
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
				description: "should convert config with plugin name/version into normalized JSON object",
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
				description: "should convert config with plugin meta into normalized JSON object",
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
				description: "should convert config with languageOptions.globals.name into normalized JSON object",
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
				description: "should serialize languageOptions as an empty object if neither configured nor default languageOptions are specified",
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
		];

		serializationTests.forEach(({ description, configs, expected }) => {
			it(description, () => {
				const flatConfigs = new FlatConfigArray(configs);
				flatConfigs.normalizeSync();
				const config = flatConfigs.getConfig("foo.js");
				assert.deepStrictEqual(config.toJSON(), expected);
				assert.strictEqual(stringify(config.toJSON()), stringify(expected));
			});
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
		runInvalidConfigTest(
			"should error on 'eslint:recommended' string config",
			["eslint:recommended"],
			"Config (unnamed): Unexpected non-object config at original index 0.",
		);

		runInvalidConfigTest(
			"should error on 'eslint:all' string config",
			["eslint:all"],
			"Config (unnamed): Unexpected non-object config at original index 0.",
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
					expected: {
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
					expected: {
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
						},
					},
				},
			];

			settingsTests.forEach(({ description, values, expected }) => {
				runMergeTest(description, values, expected);
			});
		});

		describe("plugins", () => {
			const pluginA = {};
			const pluginB = {};
			const pluginC = {};

			const pluginTests = [
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
					expected: {
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
					message: 'Cannot redefine plugin "a".',
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
					message: 'Key "a": Expected an object.',
				},
			];

			pluginTests.forEach(({ description, values, expected, message }) => {
				if (expected) {
					runMergeTest(description, values, expected);
				} else {
					runInvalidConfigTest(description, values, message);
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
					description: "should merge two values when second is an object",
					values: [
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
					description: "should error when an invalid string is used",
					values: [
						{
							processor: "foo",
						},
					],
					message: "pluginName/objectName",
				},
				{
					description: "should error when an empty string is used",
					values: [
						{
							processor: "",
						},
					],
					message: "pluginName/objectName",
				},
				{
					description: "should error when an invalid processor is used",
					values: [
						{
							processor: {},
						},
					],
					message: "Object must have a preprocess() and a postprocess() method.",
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
					message: /Could not find "bar" in plugin "foo"/u,
				},
			];

			processorTests.forEach(({ description, values, expected, message }) => {
				if (expected) {
					runMergeTest(description, values, expected);
				} else {
					runInvalidConfigTest(description, values, message);
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
					message: 'Unexpected key "foo" found.',
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
					message: "Expected a Boolean.",
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
					expected: {
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
					expected: {
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
					expected: {
						plugins: baseConfig.plugins,
						linterOptions: {
							noInlineConfig: false,
						},
					},
				},
			];

			linterTests.forEach(({ description, values, expected, message }) => {
				if (expected) {
					runMergeTest(description, values, expected);
				} else {
					runInvalidConfigTest(description, values, message);
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
						message: /Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u,
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
						expected: {
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
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedDisableDirectives: 1,
							},
						},
					},
				];

				reportTests.forEach(({ description, values, expected, message }) => {
					if (expected) {
						runMergeTest(description, values, expected);
					} else {
						runInvalidConfigTest(description, values, message);
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
						message: /Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u,
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
						expected: {
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
						expected: {
							plugins: baseConfig.plugins,
							linterOptions: {
								reportUnusedInlineConfigs: 1,
							},
						},
					},
				];

				inlineTests.forEach(({ description, values, expected, message }) => {
					if (expected) {
						runMergeTest(description, values, expected);
					} else {
						runInvalidConfigTest(description, values, message);
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
					message: 'Unexpected key "foo" found.',
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
					async: true,
					expected: {
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
					async: true,
					expected: {
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
					async: true,
					expected: {
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
					async: true,
					expected: {
						languageOptions: {},
					},
				},
			];

			languageTests.forEach(
				({ description, values, expected, message, async: isAsync }) => {
					if (isAsync) {
						it(description, async () => {
							const configs = createFlatConfigArray(values);
							await configs.normalize();
							const config = configs.getConfig("file.my");
							if (expected.languageOptions) {
								assert.deepStrictEqual(
									config.languageOptions,
									expected.languageOptions,
								);
							}
						});
					} else if (expected) {
						runMergeTest(description, values, expected);
					} else {
						runInvalidConfigTest(description, values, message);
					}
				},
			);

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
						message: /Key "languageOptions": Key "ecmaVersion": Expected a number or "latest"\./u,
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

				ecmaTests.forEach(({ description, values, expected, message }) => {
					if (expected) {
						runMergeTest(description, values, expected);
					} else {
						runInvalidConfigTest(description, values, message);
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
						message: 'Expected "script", "module", or "commonjs".',
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

				sourceTests.forEach(({ description, values, expected, message }) => {
					if (expected) {
						runMergeTest(description, values, expected);
					} else {
						runInvalidConfigTest(description, values, message);
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
						message: "Expected an object.",
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
						message: 'Key "foo": Expected "readonly", "writable", or "off".',
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
						message: /Global " foo" has leading or trailing whitespace/u,
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
						message: /Global "foo " has leading or trailing whitespace/u,
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

				globalsTests.forEach(({ description, values, expected, message }) => {
					if (expected) {
						runMergeTest(description, values, expected);
					} else {
						runInvalidConfigTest(description, values, message);
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
						message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
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
						message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
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
						message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
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
						message: 'Key "languageOptions": Key "parser": Expected object with parse() or parseForESLint() method.',
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

				parserTests.forEach(({ description, values, expected, message }) => {
					if (expected) {
						runMergeTest(description, values, expected);
					} else {
						runInvalidConfigTest(description, values, message);
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
						message: "Expected an object.",
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

				parserOptionsTests.forEach(({ description, values, expected, message }) => {
					if (expected) {
						runMergeTest(description, values, expected);
					} else {
						runInvalidConfigTest(description, values, message);
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
					message: "Expected an object.",
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
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
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
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
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
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
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
					message: 'Key "rules": Key "foo": Expected severity of "off", 0, "warn", 1, "error", or 2.',
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
					message: /Key "rules": Key "foox": Could not find "foox" in plugin "@"/u,
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
					message: /Key "rules": Key "test2\/match": Could not find "match" in plugin "test2". Did you mean "test1\/match"?/u,
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
					message: /Key "rules": Key "doesnt-exist\/match": Could not find plugin "doesnt-exist" in configuration\./u,
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
					message: /Value "bar" should be equal to one of the allowed values/u,
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
					message: /Value \[\] should NOT have fewer than 1 items/u,
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
					message: "Error while processing options validation schema of rule 'foo/bar': Rule's `meta.schema` must be an array or object",
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
					message: "Error while processing options validation schema of rule 'foo/bar': Rule's `meta.schema` must be an array or object",
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
					message: "Error while processing options validation schema of rule 'foo/bar': minItems must be number",
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
					async: true,
					expected: {
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
					async: true,
					expected: {
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
					async: true,
					expected: {
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
					message: /should NOT have more than 0 items/u,
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
					message: /should NOT have more than 0 items/u,
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
					expected: {
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
					expected: {
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
					expected: {
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
					message: /Unexpected property "destruct". Expected properties: "destructuring", "ignoreReadBeforeAssign"/u,
				},
			];

			ruleTests.forEach(({ description, values, expected, message, async: isAsync }) => {
				if (isAsync) {
					it(description, async () => {
						const configs = createFlatConfigArray(values);
						await configs.normalize();
						const config = configs.getConfig("foo.js");
						assert.deepStrictEqual(config.rules, expected.rules);
					});
				} else if (expected) {
					runMergeTest(description, values, expected);
				} else {
					runInvalidConfigTest(description, values, message);
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
				runInvalidConfigTest(
					`should error when a ${key} key is found`,
					[
						{
							[key]: "foo",
						},
					],
					`Key "${key}": This appears to be in eslintrc format rather than flat config format.`,
				);
			});

			runInvalidConfigTest(
				"should error when plugins is an array",
				[
					{
						plugins: ["foo"],
					},
				],
				'Key "plugins": This appears to be in eslintrc format (array of strings) rather than flat config format (object).',
			);
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
				"default-case: [2, {}],
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
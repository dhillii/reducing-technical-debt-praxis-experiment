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
			jslang.defaultLanguageOptions
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
			"parserOptions should be new object"
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
							parse() {},
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
							parse() {},
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
							parse() {},
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
							parse() {},
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
							parse() {},
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
							parse() {},
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
							parse() {},
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
						preprocess() {},
						postprocess() {},
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
						preprocess() {},
						postprocess() {},
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
						preprocess() {},
						postprocess() {},
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
						preprocess() {},
						postprocess() {},
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
						preprocess() {},
						postprocess() {},
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
						preprocess() {},
						postprocess() {},
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
		it("should error on 'eslint:recommended' string config", async () => {
			await assertInvalidConfig(
				["eslint:recommended"],
				"Config (unnamed): Unexpected non-object config at original index 0."
			);
		});

		it("should error on 'eslint:all' string config", async () => {
			await assertInvalidConfig(
				["eslint:all"],
				"Config (unnamed): Unexpected non-object config at original index 0."
			);
		});

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
					"Config (unnamed): Unexpected undefined config at original index 0."
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
					"Config (unnamed): Unexpected null config at original index 0."
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
					"Config (unnamed): Unexpected undefined config at base index 0."
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
					"Config (unnamed): Unexpected null config at base index 0."
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
					"Config (unnamed): Unexpected undefined config at user-defined index 0."
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
					"Config (unnamed): Unexpected null config at user-defined index 0."
				);
			}
		});
	});

	describe("Config Properties", () => {
		describe("settings", () => {
			it("should merge two objects", () =>
				assertMergedResult(
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
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
							c: true,
							d: false,
						},
					}
				));

			it("should merge two objects when second object has overrides", () =>
				assertMergedResult(
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
						plugins: baseConfig.plugins,
						settings: {
							a: false,
							b: false,
							c: true,
							d: [3, 4],
							e: [5, 6],
						},
					}
				));

			it("should deeply merge two objects when second object has overrides", () =>
				assertMergedResult(
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
						plugins: baseConfig.plugins,
						settings: {
							object: {
								a: false,
								b: false,
								c: true,
							},
						},
					}
				));

			it("should merge an object and undefined into one object", () =>
				assertMergedResult(
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
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
						},
					}
				));

			it("should merge undefined and an object into one object", () =>
				assertMergedResult(
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
						plugins: baseConfig.plugins,
						settings: {
							a: true,
							b: false,
						},
					}
				));
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
					}
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
					}
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
					'Cannot redefine plugin "a".'
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
					'Key "a": Expected an object.'
				);
			});
		});

		describe("processor", () => {
			it("should merge two values when second is a string", () => {
				const stubProcessor = {
					preprocess() {},
					postprocess() {},
				};

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
					}
				);
			});

			it("should merge two values when second is an object", () => {
				const processor = {
					preprocess() {},
					postprocess() {},
				};

				return assertMergedResult(
					[
						{
							processor: "markdown/markdown",
						},
						{
							processor,
						},
					],
					{
						plugins: baseConfig.plugins,
						processor,
					}
				);
			});

			it("should error when an invalid string is used", async () => {
				await assertInvalidConfig(
					[
						{
							processor: "foo",
						},
					],
					"pluginName/objectName"
				);
			});

			it("should error when an empty string is used", async () => {
				await assertInvalidConfig(
					[
						{
							processor: "",
						},
					],
					"pluginName/objectName"
				);
			});

			it("should error when an invalid processor is used", async () => {
				await assertInvalidConfig(
					[
						{
							processor: {},
						},
					],
					"Object must have a preprocess() and a postprocess() method."
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
					/Could not find "bar" in plugin "foo"/u
				);
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
					'Unexpected key "foo" found.'
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
						"Expected a Boolean."
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
						}
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[
							{
								linterOptions: {
									noInlineConfig: false,
								},
							},
							{},
						],
						{
							plugins: baseConfig.plugins,
							linterOptions: {
								noInlineConfig: false,
							},
						}
					));

				it("should merge undefined and an object into one object", () =>
					assertMergedResult(
						[
							{},
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
						}
					));
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
						/Key "linterOptions": Key "reportUnusedDisableDirectives": Expected one of: "error", "warn", "off", 0, 1, 2, or a boolean./u
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
						}
					));

				it("should merge an object and undefined into one object", () =>
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
						}
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
						/Key "linterOptions": Key "reportUnusedInlineConfigs": Expected one of: "error", "warn", "off", 0, 1, or 2./u
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
						}
					));

				it("should merge an object and undefined into one object", () =>
					assertMergedResult(
						[
							{},
							{
								linterOptions: {
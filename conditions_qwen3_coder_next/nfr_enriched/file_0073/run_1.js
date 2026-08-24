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
 * Normalizes the provided result object by ensuring languageOptions are properly
 * set from the default language if needed.
 * @param {Object} result The result object to normalize.
 * @param {Object} config The config object being tested.
 * @returns {void}
 */
function normalizeResult(result, config) {
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
 * Asserts that a given set of configs results in a normalized config matching
 * the expected result.
 * @param {*[]} values An array of configs to use in the config array.
 * @param {Object} result The expected merged result of the configs.
 * @returns {void}
 * @throws {AssertionError} If the actual result doesn't match the expected result.
 */
async function assertMergedResult(values, result) {
    const configs = createFlatConfigArray(values);

    await configs.normalize();

    normalizeResult(result, configs.getConfig("foo.js"));
}

/**
 * Asserts that normalizing and retrieving a config from the provided configs
 * results in the specified error.
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
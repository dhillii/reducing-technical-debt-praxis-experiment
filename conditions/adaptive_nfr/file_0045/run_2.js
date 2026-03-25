# Refactoring Analysis

The code has several complexity issues:
1. **Massive `run()` method** with deeply nested inner functions
2. **`testInvalidTemplate`** is enormous (~300 lines) with deep nesting
3. **`buildLazyTestLocationEstimator`** has complex nested logic
4. **Suggestion validation** is deeply nested and repetitive
5. **Error message formatting** is duplicated

I'll extract cohesive units into separate functions/classes while preserving all behavior.

```javascript
/**
 * @fileoverview Mocha/Jest test wrapper
 * @author Ilya Volodin
 */
"use strict";

/* globals describe, it -- Mocha globals */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("node:assert"),
    { existsSync, readFileSync } = require("node:fs"),
    util = require("node:util"),
    path = require("node:path"),
    equal = require("fast-deep-equal"),
    Traverser = require("../shared/traverser"),
    { Config } = require("../config/config"),
    { Linter, SourceCodeFixer } = require("../linter"),
    { interpolate, getPlaceholderMatcher } = require("../linter/interpolate"),
    stringify = require("json-stable-stringify-without-jsonify"),
    { isSerializable } = require("../shared/serialization");

const { FlatConfigArray } = require("../config/flat-config-array");
const {
    defaultConfig,
    defaultRuleTesterConfig,
} = require("../config/default-config");

const ajv = require("../shared/ajv")({ strictDefaults: true });

const parserSymbol = Symbol.for("eslint.RuleTester.parser");
const { ConfigArraySymbol } = require("@eslint/config-array");

const jslang = require("../languages/js");
const { SourceCode } = require("../languages/js/source-code");

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

/** @import { LanguageOptions, RuleDefinition } from "@eslint/core" */

/** @typedef {import("../types").Linter.Parser} Parser */

/**
 * A test case that is expected to pass lint.
 * @typedef {Object} ValidTestCase
 * @property {string} [name] Name for the test case.
 * @property {string} code Code for the test case.
 * @property {any[]} [options] Options for the test case.
 * @property {Function} [before] Function to execute before testing the case.
 * @property {Function} [after] Function to execute after testing the case regardless of its result.
 * @property {LanguageOptions} [languageOptions] The language options to use in the test case.
 * @property {{ [name: string]: any }} [settings] Settings for the test case.
 * @property {string} [filename] The fake filename for the test case. Useful for rules that make assertion about filenames.
 * @property {boolean} [only] Run only this test case or the subset of test cases with this property.
 */

/**
 * A test case that is expected to fail lint.
 * @typedef {Object} InvalidTestCase
 * @property {string} [name] Name for the test case.
 * @property {string} code Code for the test case.
 * @property {number | Array<TestCaseError | string | RegExp>} errors Expected errors.
 * @property {string | null} [output] The expected code after autofixes are applied. If set to `null`, the test runner will assert that no autofix is suggested.
 * @property {any[]} [options] Options for the test case.
 * @property {Function} [before] Function to execute before testing the case.
 * @property {Function} [after] Function to execute after testing the case regardless of its result.
 * @property {{ [name: string]: any }} [settings] Settings for the test case.
 * @property {string} [filename] The fake filename for the test case. Useful for rules that make assertion about filenames.
 * @property {LanguageOptions} [languageOptions] The language options to use in the test case.
 * @property {boolean} [only] Run only this test case or the subset of test cases with this property.
 */

/**
 * A description of a reported error used in a rule tester test.
 * @typedef {Object} TestCaseError
 * @property {string | RegExp} [message] Message.
 * @property {string} [messageId] Message ID.
 * @property {{ [name: string]: string }} [data] The data used to fill the message template.
 * @property {number} [line] The 1-based line number of the reported start location.
 * @property {number} [column] The 1-based column number of the reported start location.
 * @property {number} [endLine] The 1-based line number of the reported end location.
 * @property {number} [endColumn] The 1-based column number of the reported end location.
 */

//------------------------------------------------------------------------------
// Private Members
//------------------------------------------------------------------------------

/*
 * testerDefaultConfig must not be modified as it allows to reset the tester to
 * the initial default configuration
 */
const testerDefaultConfig = { rules: {} };

/*
 * RuleTester uses this config as its default. This can be overwritten via
 * setDefaultConfig().
 */
let sharedDefaultConfig = { rules: {} };

/*
 * List every parameters possible on a test case that are not related to eslint
 * configuration
 */
const RuleTesterParameters = [
    "name",
    "code",
    "filename",
    "options",
    "before",
    "after",
    "errors",
    "output",
    "only",
];

/*
 * All allowed property names in error objects.
 */
const errorObjectParameters = new Set([
    "message",
    "messageId",
    "data",
    "line",
    "column",
    "endLine",
    "endColumn",
    "suggestions",
]);
const friendlyErrorObjectParameterList = `[${[...errorObjectParameters].map(key => `'${key}'`).join(", ")}]`;

/*
 * All allowed property names in suggestion objects.
 */
const suggestionObjectParameters = new Set([
    "desc",
    "messageId",
    "data",
    "output",
]);
const friendlySuggestionObjectParameterList = `[${[...suggestionObjectParameters].map(key => `'${key}'`).join(", ")}]`;

const forbiddenMethods = [
    "applyInlineConfig",
    "applyLanguageOptions",
    "finalize",
];

/** @type {Map<string,WeakSet>} */
const forbiddenMethodCalls = new Map(
    forbiddenMethods.map(methodName => [methodName, new WeakSet()]),
);

const hasOwnProperty = Function.call.bind(Object.hasOwnProperty);

/**
 * Clones a given value deeply.
 * Note: This ignores `parent` property.
 * @param {any} x A value to clone.
 * @returns {any} A cloned value.
 */
function cloneDeeplyExcludesParent(x) {
    if (typeof x === "object" && x !== null) {
        if (Array.isArray(x)) {
            return x.map(cloneDeeplyExcludesParent);
        }

        const retv = {};

        for (const key in x) {
            if (key !== "parent" && hasOwnProperty(x, key)) {
                retv[key] = cloneDeeplyExcludesParent(x[key]);
            }
        }

        return retv;
    }

    return x;
}

/**
 * Freezes a given value deeply.
 * @param {any} x A value to freeze.
 * @param {Set<Object>} seenObjects Objects already seen during the traversal.
 * @returns {void}
 */
function freezeDeeply(x, seenObjects = new Set()) {
    if (typeof x === "object" && x !== null) {
        if (seenObjects.has(x)) {
            return;
        }
        seenObjects.add(x);

        if (Array.isArray(x)) {
            x.forEach(element => {
                freezeDeeply(element, seenObjects);
            });
        } else {
            for (const key in x) {
                if (key !== "parent" && hasOwnProperty(x, key)) {
                    freezeDeeply(x[key], seenObjects);
                }
            }
        }
        Object.freeze(x);
    }
}

/**
 * Replace control characters by `\u00xx` form.
 * @param {string} text The text to sanitize.
 * @returns {string} The sanitized text.
 */
function sanitize(text) {
    if (typeof text !== "string") {
        return "";
    }
    return text.replace(
        /[\u0000-\u0009\u000b-\u001a]/gu, // eslint-disable-line no-control-regex -- Escaping controls
        c => `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`,
    );
}

/**
 * Define `start`/`end` properties as throwing error.
 * @param {string} objName Object name used for error messages.
 * @param {ASTNode} node The node to define.
 * @returns {void}
 */
function defineStartEndAsError(objName, node) {
    Object.defineProperties(node, {
        start: {
            get() {
                throw new Error(
                    `Use ${objName}.range[0] instead of ${objName}.start`,
                );
            },
            configurable: true,
            enumerable: false,
        },
        end: {
            get() {
                throw new Error(
                    `Use ${objName}.range[1] instead of ${objName}.end`,
                );
            },
            configurable: true,
            enumerable: false,
        },
    });
}

/**
 * Define `start`/`end` properties of all nodes of the given AST as throwing error.
 * @param {ASTNode} ast The root node to errorize `start`/`end` properties.
 * @param {Object} [visitorKeys] Visitor keys to be used for traversing the given ast.
 * @returns {void}
 */
function defineStartEndAsErrorInTree(ast, visitorKeys) {
    Traverser.traverse(ast, {
        visitorKeys,
        enter: defineStartEndAsError.bind(null, "node"),
    });
    ast.tokens.forEach(defineStartEndAsError.bind(null, "token"));
    ast.comments.forEach(defineStartEndAsError.bind(null, "token"));
}

/**
 * Wraps the given parser in order to intercept and modify return values from the `parse` and `parseForESLint` methods, for test purposes.
 * @param {Parser} parser Parser object.
 * @returns {Parser} Wrapped parser object.
 */
function wrapParser(parser) {
    if (typeof parser.parseForESLint === "function") {
        return {
            [parserSymbol]: parser,
            parseForESLint(...args) {
                const ret = parser.parseForESLint(...args);

                defineStartEndAsErrorInTree(ret.ast, ret.visitorKeys);
                return ret;
            },
        };
    }

    return {
        [parserSymbol]: parser,
        parse(...args) {
            const ast = parser.parse(...args);

            defineStartEndAsErrorInTree(ast);
            return ast;
        },
    };
}

/**
 * Function to replace forbidden `SourceCode` methods. Allows just one call per method.
 * @param {string} methodName The name of the method to forbid.
 * @param {Function} prototype The prototype with the original method to call.
 * @returns {Function} The function that throws the error.
 */
function throwForbiddenMethodError(methodName, prototype) {
    const original = prototype[methodName];

    return function (...args) {
        const called = forbiddenMethodCalls.get(methodName);

        /* eslint-disable no-invalid-this -- needed to operate as a method. */
        if (!called.has(this)) {
            called.add(this);

            return original.apply(this, args);
        }
        /* eslint-enable no-invalid-this -- not needed past this point */

        throw new Error(
            `\`SourceCode#${methodName}()\` cannot be called inside a rule.`,
        );
    };
}

/**
 * Extracts names of {{ placeholders }} from the reported message.
 * @param {string} message Reported message
 * @returns {string[]} Array of placeholder names
 */
function getMessagePlaceholders(message) {
    const matcher = getPlaceholderMatcher();

    return Array.from(message.matchAll(matcher), ([, name]) => name.trim());
}

/**
 * Returns the placeholders in the reported messages but
 * only includes the placeholders available in the raw message and not in the provided data.
 * @param {string} message The reported message
 * @param {string} raw The raw message specified in the rule meta.messages
 * @param {undefined|Record<unknown, unknown>} data The passed data
 * @returns {string[]} Missing placeholder names
 */
function getUnsubstitutedMessagePlaceholders(message, raw, data = {}) {
    const unsubstituted = getMessagePlaceholders(message);

    if (unsubstituted.length === 0) {
        return [];
    }

    const known = getMessagePlaceholders(raw);
    const provided = Object.keys(data);

    return unsubstituted.filter(
        name => known.includes(name) && !provided.includes(name),
    );
}

/**
 * Formats an unsubstituted placeholders error message.
 * @param {string[]} placeholders The unsubstituted placeholder names.
 * @param {string} suffix The suffix to append (e.g. "via the 'data' property...").
 * @returns {string} The formatted error message.
 */
function formatUnsubstitutedPlaceholdersMessage(placeholders, suffix) {
    const count = placeholders.length;
    const names = count > 1
        ? `unsubstituted placeholders: ${placeholders.map(n => `'${n}'`).join(", ")}`
        : `an unsubstituted placeholder '${placeholders[0]}'`;
    const valuesWord = count > 1 ? "values" : "value";

    return `The ${suffix} has ${names}. Please provide the missing ${valuesWord} via the 'data' property ${suffix.includes("suggestion") ? "for the suggestion in the context.report() call." : "in the context.report() call."}`;
}

const metaSchemaDescription = `
\t- If the rule has options, set \`meta.schema\` to an array or non-empty object to enable options validation.
\t- If the rule doesn't have options, omit \`meta.schema\` to enforce that no options can be passed to the rule.
\t- You can also set \`meta.schema\` to \`false\` to opt-out of options validation (not recommended).

\thttps://eslint.org/docs/latest/extend/custom-rules#options-schemas
`;

/*
 * Ignored test case properties when checking for test case duplicates.
 */
const duplicationIgnoredParameters = new Set(["name", "errors", "output"]);

/**
 * Normalizes a test case item, ensuring it is an object with a 'code' property.
 * @param {any} item The test case item to normalize.
 * @returns {Object} The normalized test case object.
 */
function normalizeTestCase(item) {
    return item && typeof item === "object" ? item : { code: item };
}

/**
 * Validates a single error entry in an errors array.
 * @param {any} error The error entry.
 * @param {number} number The index of the error.
 * @param {Object} assertionOptions The assertion options.
 * @returns {void}
 */
function assertSingleErrorEntry(error, number, assertionOptions) {
    const { requireMessage = false, requireLocation = false } = assertionOptions;

    if (typeof error === "string" || error instanceof RegExp) {
        assert.ok(
            requireMessage !== "messageId" && !requireLocation,
            `errors[${number}] should be an object when 'assertionOptions.requireMessage' is 'messageId' or 'assertionOptions.requireLocation' is true.`,
        );
        return;
    }

    if (typeof error === "object" && error !== null) {
        for (const propertyName of Object.keys(error)) {
            assert.ok(
                errorObjectParameters.has(propertyName),
                `Invalid error property name '${propertyName}'. Expected one of ${friendlyErrorObjectParameterList}.`,
            );
        }

        assertErrorMessageProperties(error, number, requireMessage);
        return;
    }

    assert.fail(`errors[${number}] must be a string, RegExp, or an object.`);
}

/**
 * Asserts message-related properties on an error object.
 * @param {Object} error The error object.
 * @param {number} number The index of the error.
 * @param {string|boolean} requireMessage The requireMessage assertion option.
 * @returns {void}
 */
function assertErrorMessageProperties(error, number, requireMessage) {
    if (requireMessage === "message") {
        assert.ok(
            !hasOwnProperty(error, "messageId") && hasOwnProperty(error, "message"),
            `errors[${number}] should specify 'message' (and not 'messageId') when 'assertionOptions.requireMessage' is 'message'.`,
        );
    } else if (requireMessage === "messageId") {
        assert.ok(
            !hasOwnProperty(error, "message") && hasOwnProperty(error, "messageId"),
            `errors[${number}] should specify 'messageId' (and not 'message') when 'assertionOptions.requireMessage' is 'messageId'.`,
        );
    }

    if (hasOwnProperty(error, "message")) {
        assert.ok(
            !hasOwnProperty(error, "messageId"),
            `errors[${number}] should not specify both 'message' and 'messageId'.`,
        );
        assert.ok(
            !hasOwnProperty(error, "data"),
            `errors[${number}] should not specify both 'data' and 'message'.`,
        );
    } else {
        assert.ok(
            hasOwnProperty(error, "messageId"),
            `errors[${number}] must specify either 'messageId' or 'message'.`,
        );
    }
}

/**
 * Asserts that the `errors` property of an invalid test case is valid.
 * @param {number | string[]} errors The `errors` property of the invalid test case.
 * @param {string} ruleName The name of the rule being tested.
 * @param {Object} [assertionOptions] The assertion options for the test case.
 * @returns {void}
 */
function assertErrorsProperty(errors, ruleName, assertionOptions = {}) {
    const isNumber = typeof errors === "number";
    const isArray = Array.isArray(errors);

    if (!isNumber && !isArray) {
        if (errors === void 0) {
            assert.fail(`Did not specify errors for an invalid test of ${ruleName}`);
        } else {
            assert.fail(
                `Invalid 'errors' property for invalid test of ${ruleName}: expected a number or an array but got ${
                    errors === null ? "null" : typeof errors
                }`,
            );
        }
    }

    const { requireMessage = false, requireLocation = false } = assertionOptions;

    if (isArray) {
        assert.ok(errors.length !== 0, "Invalid cases must have at least one error");

        for (const [number, error] of errors.entries()) {
            assertSingleErrorEntry(error, number, { requireMessage, requireLocation });
        }
    } else {
        assert.ok(
            !requireMessage && !requireLocation,
            "Invalid cases must have 'errors' value as an array",
        );
        assert.ok(errors > 0, "Invalid cases must have 'error' value greater than 0");
    }
}

/**
 * Check if this test case is a duplicate of one we have seen before.
 * @param {Object} item test case object
 * @param {Set<string>} seenTestCases set of serialized test cases we have seen so far
 * @returns {void}
 */
function checkDuplicateTestCase(item, seenTestCases) {
    if (!isSerializable(item)) {
        return;
    }

    const serializedTestCase = stringify(item, {
        replacer(key, value) {
            return item !== this || !duplicationIgnoredParameters.has(key)
                ? value
                : void 0;
        },
    });

    assert(!seenTestCases.has(serializedTestCase), "detected duplicate test case");
    seenTestCases.add(serializedTestCase);
}

/**
 * Asserts that a rule is valid.
 * @param {Object} rule The rule to check.
 * @param {string} ruleName The name of the rule.
 * @returns {void}
 */
function assertRule(rule, ruleName) {
    assert.ok(
        rule && typeof rule === "object" && typeof rule.create === "function",
        `Rule ${ruleName} must be an object with a \`create\` method`,
    );
}

/**
 * Asserts that a test scenario object is valid.
 * @param {Object} test The test scenario object to check.
 * @param {string} ruleName The name of the rule being tested.
 * @returns {void}
 */
function assertTest(test, ruleName) {
    assert.ok(
        test && typeof test === "object",
        `Test Scenarios for rule ${ruleName} : Could not find test scenario object`,
    );

    assert.ok(
        Array.isArray(test.valid),
        `Test Scenarios for rule ${ruleName} is invalid: Could not find any valid test scenarios`,
    );

    assert.ok(
        Array.isArray(test.invalid),
        `Test Scenarios for rule ${ruleName} is invalid: Could not find any invalid test scenarios`,
    );
}

/**
 * Asserts that the common properties of a valid/invalid test case have the correct types.
 * @param {Object} item The test case object to check.
 * @returns {void}
 */
function assertTestCommonProperties(item) {
    assert.ok(
        typeof item.code === "string",
        "Test case must specify a string value for 'code'",
    );

    if (item.name) {
        assert.ok(
            typeof item.name === "string",
            "Optional test case property 'name' must be a string",
        );
    }
    if (hasOwnProperty(item, "only")) {
        assert.ok(
            typeof item.only === "boolean",
            "Optional test case property 'only' must be a boolean",
        );
    }
    if (hasOwnProperty(item, "filename")) {
        assert.ok(
            typeof item.filename === "string",
            "Optional test case property 'filename' must be a string",
        );
    }
    if (hasOwnProperty(item, "options")) {
        assert.ok(
            Array.isArray(item.options),
            "Optional test case property 'options' must be an array",
        );
    }
}

/**
 * Asserts that a valid test case object is valid.
 * @param {Object} item The valid test case object to check.
 * @param {Set<string>} seenTestCases Set of serialized test cases to check for duplicates.
 * @returns {void}
 */
function assertValidTestCase(item, seenTestCases) {
    assert.ok(item.errors === void 0, "Valid test case must not have 'errors' property");
    assert.ok(item.output === void 0, "Valid test case must not have 'output' property");

    assertTestCommonProperties(item);
    checkDuplicateTestCase(item, seenTestCases);
}

/**
 * Asserts that the invalid test case object is valid.
 * @param {Object} item The invalid test case object to check.
 * @param {Set<string>} seenTestCases Set of serialized test cases to check for duplicates.
 * @param {string} ruleName The name of the rule being tested.
 * @param {Object} [assertionOptions] The assertion options for the test case.
 * @returns {void}
 */
function assertInvalidTestCase(item, seenTestCases, ruleName, assertionOptions = {}) {
    assertTestCommonProperties(item);
    assertErrorsProperty(item.errors, ruleName, assertionOptions);

    if (hasOwnProperty(item, "output")) {
        assert.ok(
            item.output === null || typeof item.output === "string",
            "Test property 'output', if specified, must be a string or null. If no autofix is expected, then omit the 'output' property or set it to null.",
        );
    }

    checkDuplicateTestCase(item, seenTestCases);
}

/**
 * Gets the invocation location from the stack trace for later use.
 * @param {Function} relative The function before the invocation point.
 * @returns {{ sourceFile: string; sourceLine: number; sourceColumn: number; }} The invocation location.
 */
function getInvocationLocation(relative = getInvocationLocation) {
    const dummyObject = {};
    let location;
    const { prepareStackTrace } = Error;
    Error.prepareStackTrace = (_, [callSite]) => {
        location = {
            sourceFile:
                callSite.getFileName() ??
                `${callSite.getEvalOrigin()}, <anonymous>`,
            sourceLine: callSite.getLineNumber() ?? 1,
            sourceColumn: callSite.getColumnNumber() ?? 1,
        };
    };
    Error.captureStackTrace(dummyObject, relative);
    void dummyObject.stack;
    Error.prepareStackTrace = prepareStackTrace;
    return location;
}

/**
 * Parses test location data from source file content.
 * @param {string} sourceFile Path to the source file.
 * @param {number} sourceLine Line number of the invocation.
 * @param {number} sourceColumn Column number of the invocation.
 * @returns {Object} Parsed location data.
 */
function parseTestLocationsFromSource(sourceFile, sourceLine, sourceColumn) {
    const locations = {};

    if (!existsSync(sourceFile)) {
        return locations;
    }

    let content = readFileSync(sourceFile, "utf8")
        .split("\n")
        .slice(sourceLine - 1);
    content[0] = content[0].slice(Math.max(0, sourceColumn - 1));
    content = content.map(l =>
        l.trim().replace(/\s*\/\/.*$(?<!,)/u, ""),
    );

    const validStartIndex = content.findIndex(line => /\bvalid\s*:/u.test(line));
    const invalidStartIndex = content.findIndex(line => /\binvalid\s*:/u.test(line));

    locations.valid = `${sourceFile}:${sourceLine + validStartIndex}`;
    locations.invalid = `${sourceFile}:${sourceLine + invalidStartIndex}`;

    const validEndIndex = validStartIndex < invalidStartIndex ? invalidStartIndex : content.length;
    const invalidEndIndex = validStartIndex < invalidStartIndex ? content.length : validStartIndex;

    const validLines = content.slice(validStartIndex, validEndIndex);
    const invalidLines = content.slice(invalidStartIndex, invalidEndIndex);

    const validLineIndexes = extractValidLineIndexes(validLines);
    const invalidLineIndexes = extractInvalidLineIndexes(invalidLines);

    Object.assign(
        locations,
        { [`valid[0]`]: `${sourceFile}:${sourceLine + validStartIndex}` },
        Object.fromEntries(
            validLineIndexes.map((location, validIndex) => [
                `valid[${validIndex}]`,
                `${sourceFile}:${sourceLine + validStartIndex + location}`,
            ]),
        ),
        Object.fromEntries(
            invalidLineIndexes.map((location, invalidIndex) => [
                `invalid[${invalidIndex}]`,
                `${sourceFile}:${sourceLine + invalidStartIndex + location}`,
            ]),
        ),
    );

    assignErrorLocations(locations, invalidLines, invalidLineIndexes, sourceFile, sourceLine, invalidStartIndex);

    return locations;
}

/**
 * Extracts line indexes for valid test cases.
 * @param {string[]} lines The valid section lines.
 * @returns {number[]} The line indexes.
 */
function extractValidLineIndexes(lines) {
    let objectDepth = 0;

    return lines
        .map((l, i) => {
            if (/^(?:\w+\s*:\s*)?\{/u.test(l)) {
                objectDepth++;
            }

            if (objectDepth > 0) {
                if (l.endsWith("}") || l.endsWith("},")) {
                    objectDepth--;
                }
                return objectDepth <= 1 && l.includes("code:") ? i : null;
            }

            return l.endsWith(",") ? i : null;
        })
        .filter(Boolean);
}

/**
 * Extracts line indexes for invalid test cases (lines containing `errors:`).
 * @param {string[]} lines The invalid section lines.
 * @returns {number[]} The line indexes.
 */
function extractInvalidLineIndexes(lines) {
    return lines
        .map((l, i) => l.trimStart().startsWith("errors:") ? i : null)
        .filter(Boolean);
}

/**
 * Assigns error-level location entries to the locations map.
 * @param {Object} locations The locations map to mutate.
 * @param {string[]} invalidLines The invalid section lines.
 * @param {number[]} invalidLineIndexes The indexes of `errors:` lines.
 * @param {string} sourceFile The source file path.
 * @param {number} sourceLine The base source line.
 * @param {number} invalidStartIndex The start index of the invalid section.
 * @returns {void}
 */
function assignErrorLocations(locations, invalidLines, invalidLineIndexes, sourceFile, sourceLine, invalidStartIndex) {
    const sentinelIndexes = [...invalidLineIndexes, invalidLines.length];

    for (let i = 0; i < sentinelIndexes.length - 1; i++) {
        const start = sentinelIndexes[i];
        const end = sentinelIndexes[i + 1];
        const errorLines = invalidLines.slice(start, end);
        const errorLineIndexes = extractErrorObjectLineIndexes(errorLines);

        Object.assign(
            locations,
            Object.fromEntries(
                errorLineIndexes.map((line, errorIndex) => [
                    `invalid[${i}].errors[${errorIndex}]`,
                    `${sourceFile}:${sourceLine + invalidStartIndex + start + line}`,
                ]),
            ),
        );
    }
}

/**
 * Extracts line indexes for individual error objects within an invalid test case.
 * @param {string[]} lines The error section lines.
 * @returns {number[]} The line indexes.
 */
function extractErrorObjectLineIndexes(lines) {
    let errorObjectDepth = 0;

    return lines
        .map((l, j) => {
            if (l.startsWith("{") || l.endsWith("{")) {
                errorObjectDepth++;

                if (l.endsWith("}") || l.endsWith("},")) {
                    errorObjectDepth--;
                }

                return errorObjectDepth <= 1 ? j : null;
            }

            if (errorObjectDepth > 0) {
                if (l.endsWith("}") || l.endsWith("},")) {
                    errorObjectDepth--;
                }
                return null;
            }

            return l.endsWith(",") ? j : null;
        })
        .filter(Boolean);
}

/**
 * Estimates the location of the test case in the source file.
 * @param {Function} invoker The method that runs the tests.
 * @returns {(key: string) => string} The lazy resolver for the estimated location of the test case.
 */
function buildLazyTestLocationEstimator(invoker) {
    const invocationLocation = getInvocationLocation(invoker);
    let testLocations = null;

    return key => {
        if (testLocations === null) {
            const { sourceFile, sourceLine, sourceColumn } = invocationLocation;

            testLocations = {
                root: `${sourceFile}:${sourceLine}:${sourceColumn}`,
                ...parseTestLocationsFromSource(sourceFile, sourceLine, sourceColumn),
            };
        }

        return testLocations[key] || "unknown source";
    };
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

// default separators for testing
const DESCRIBE = Symbol("describe");
const IT = Symbol("it");
const IT_ONLY = Symbol("itOnly");

/**
 * This is `it` default handler if `it` don't exist.
 * @this {Mocha}
 * @param {string} text The description of the test case.
 * @param {Function} method The logic of the test case.
 * @throws {Error} Any error upon execution of `method`.
 * @returns {any} Returned value of `method`.
 */
function itDefaultHandler(text, method) {
    try {
        return method.call(this);
    } catch (err) {
        if (err instanceof assert.AssertionError) {
            err.message += ` (${util.inspect(err.actual)} ${err.operator} ${util.inspect(err.expected)})`;
        }
        throw err;
    }
}

/**
 * This is `describe` default handler if `describe` don't exist.
 * @this {Mocha}
 * @param {string} text The description of the test case.
 * @param {Function} method The logic of the test case.
 * @returns {any} Returned value of `method`.
 */
function describeDefaultHandler(text, method) {
    return method.call(this);
}

//------------------------------------------------------------------------------
// RuleTesterContext - encapsulates per-run state and helpers
//------------------------------------------------------------------------------

/**
 * Builds the base config array for a rule tester run.
 * @param {Object} rule The rule under test.
 * @param {string} ruleName The name of the rule.
 * @returns {Array} The base config array.
 */
function buildBaseConfig(rule, ruleName) {
    return [
        {
            plugins: {
                "@": {
                    parsers: { ...defaultConfig[0].plugins["@"].parsers },
                    rules: defaultConfig[0].plugins["@"].rules,
                    languages: defaultConfig[0].plugins["@"].languages,
                },
                "rule-to-test": {
                    rules: {
                        [ruleName]: Object.assign({}, rule, {
                            create(context) {
                                freezeDeeply(context.options);
                                freezeDeeply(context.settings);
                                freezeDeeply(context.parserOptions);
                                return rule.create(context);
                            },
                        }),
                    },
                },
            },
            language: defaultConfig[0].language,
        },
        ...defaultRuleTesterConfig,
    ];
}

/**
 * Validates the rule schema and throws descriptive errors if invalid.
 * @param {Object|null} schema The compiled schema.
 * @param {string} ruleName The name of the rule.
 * @returns {void}
 */
function validateRuleSchema(schema, ruleName) {
    if (!schema) {
        return;
    }

    if (Object.keys(schema).length === 0) {
        throw new Error(`\`schema: {}\` is a no-op${metaSchemaDescription}`);
    }

    ajv.validateSchema(schema);

    if (ajv.errors) {
        const errors = ajv.errors
            .map(error => {
                const field =
                    error.dataPath[0] === "."
                        ? error.dataPath.slice(1)
                        : error.dataPath;
                return `\t${field}: ${error.message}`;
            })
            .join("\n");

        throw new Error([`Schema for rule ${ruleName} is invalid:`, errors]);
    }

    try {
        ajv.compile(schema);
    } catch (err) {
        throw new Error(
            `Schema for rule ${ruleName} is invalid: ${err.message}`,
            { cause: err },
        );
    }
}

/**
 * Runs the linter with forbidden SourceCode methods temporarily replaced.
 * @param {Linter} linter The linter instance.
 * @param {string} code The code to verify.
 * @param {FlatConfigArray} configs The config array.
 * @param {string|undefined} filename The filename.
 * @returns {Array} The lint messages.
 */
function verifyWithForbiddenMethodGuards(linter, code, configs, filename) {
    const { applyLanguageOptions, applyInlineConfig, finalize } = SourceCode.prototype;

    try {
        forbiddenMethods.forEach(methodName => {
            SourceCode.prototype[methodName] = throwForbiddenMethodError(
                methodName,
                SourceCode.prototype,
            );
        });

        return linter.verify(code, configs, filename);
    } finally {
        SourceCode.prototype.applyInlineConfig = applyInlineConfig;
        SourceCode.prototype.applyLanguageOptions = applyLanguageOptions;
        SourceCode.prototype.finalize = finalize;
    }
}

/**
 * Builds a FlatConfigArray for a test item.
 * @param {Object} item The test item.
 * @param {Array} testerConfig The tester configuration.
 * @param {Array} baseConfig The base configuration.
 * @param {string} ruleId The rule ID.
 * @param {Object} rule The rule definition.
 * @param {string} ruleName The rule name.
 * @returns {FlatConfigArray} The configured array.
 */
function buildConfigsForItem(item, testerConfig, baseConfig, ruleId, rule, ruleName) {
    const filename = hasOwnProperty(item, "filename") ? item.filename : void 0;
    const options = hasOwnProperty(item, "options") ? item.options : [];
    const flatConfigArrayOptions = { baseConfig };

    if (filename) {
        flatConfigArrayOptions.basePath = path.parse(filename).root || void 0;
    }

    const configs = new FlatConfigArray(testerConfig, flatConfigArrayOptions);

    configs[ConfigArraySymbol.finalizeConfig] = function (...args) {
        const proto = Object.getPrototypeOf(this);
        const calculatedConfig = proto[ConfigArraySymbol.finalizeConfig].apply(this, args);

        if (calculatedConfig.language === jslang) {
            calculatedConfig.languageOptions.parser = wrapParser(
                calculatedConfig.languageOptions.parser,
            );
        }

        return calculatedConfig;
    };

    const itemConfig = { ...item };

    for (const parameter of RuleTesterParameters) {
        delete itemConfig[parameter];
    }

    configs.push(itemConfig);
    configs.push({ rules: { [ruleId]: [1, ...options] } });

    let schema;

    try {
        schema = Config.getRuleOptionsSchema(rule);
    } catch (err) {
        err.message += metaSchemaDescription;
        throw err;
    }

    validateRuleSchema(schema, ruleName);

    configs.push({
        plugins: {
            "rule-tester": {
                rules: {
                    "validate-ast": {
                        create() {
                            return {
                                Program(node) {
                                    configs._beforeAST = cloneDeeplyExcludesParent(node);
                                },
                                "Program:exit"(node) {
                                    configs._afterAST = node;
                                },
                            };
                        },
                    },
                },
            },
        },
    });

    try {
        configs.normalizeSync();
        configs.getConfig("test.js");
    } catch (error) {
        error.message = `ESLint configuration in rule-tester is invalid: ${error.message}`;
        throw error;
    }

    return configs;
}

/**
 * Runs the rule for the given item and returns results.
 * @param {Object} item Item to run the rule against.
 * @param {Object} context The run context (linter, testerConfig, baseConfig, ruleId, rule, ruleName).
 * @returns {Object} Eslint run result.
 */
function runRuleForItem(item, context) {
    const { linter, testerConfig, baseConfig, ruleId, rule, ruleName } = context;
    const code = item.code;
    const filename = hasOwnProperty(item, "filename") ? item.filename : void 0;

    const configs = buildConfigsForItem(item, testerConfig, baseConfig, ruleId, rule, ruleName);

    const messages = verifyWithForbiddenMethodGuards(linter, code, configs, filename);

    const fatalErrorMessage = messages.find(m => m.fatal);

    assert(
        !fatalErrorMessage,
        `A fatal parsing error occurred: ${fatalErrorMessage && fatalErrorMessage.message}`,
    );

    let output;

    if (messages.some(m => m.fix)) {
        output = SourceCodeFixer.applyFixes(code, messages).output;
        const errorMessageInFix = linter
            .verify(output, configs, filename)
            .find(m => m.fatal);

        assert(
            !errorMessageInFix,
            [
                "A fatal parsing error occurred in autofix.",
                `Error: ${errorMessageInFix && errorMessageInFix.message}`,
                "Autofix output:",
                output,
            ].join("\n"),
        );
    } else {
        output = code;
    }

    return {
        messages,
        output,
        beforeAST: configs._beforeAST,
        afterAST: cloneDeeplyExcludesParent(configs._afterAST),
        configs,
        filename,
    };
}

/**
 * Check if the AST was changed.
 * @param {ASTNode} beforeAST AST node before running.
 * @param {ASTNode} afterAST AST node after running.
 * @returns {void}
 */
function assertASTDidntChange(beforeAST, afterAST) {
    if (!equal(beforeAST, afterAST)) {
        assert.fail("Rule should not modify AST.");
    }
}

/**
 * Asserts that the message matches its expected value.
 * @param {string} actual Actual value.
 * @param {string|RegExp} expected Expected value.
 * @returns {void}
 */
function assertMessageMatches(actual, expected) {
    if (expected instanceof RegExp) {
        assert.ok(expected.test(actual), `Expected '${actual}' to match ${expected}`);
    } else {
        assert.strictEqual(actual, expected);
    }
}

/**
 * Checks that all suggestion messages within a reported message are unique.
 * @param {Object} message The lint message.
 * @returns {void}
 */
function assertUniqueSuggestionMessages(message) {
    if (!hasOwnProperty(message, "suggestions")) {
        return;
    }

    /** @type {Map<string, number>} */
    const seenMessageIndices = new Map();

    for (let i = 0; i < message.suggestions.length; i += 1) {
        const suggestionMessage = message.suggestions[i].desc;
        const previous = seenMessageIndices.get(suggestionMessage);

        assert.ok(
            !seenMessageIndices.has(suggestionMessage),
            `Suggestion message '${suggestionMessage}' reported from suggestion ${i} was previously reported by suggestion ${previous}. Suggestion messages should be unique within an error.`,
        );
        seenMessageIndices.set(suggestionMessage, i);
    }
}

/**
 * Asserts the messageId-based properties of an error match.
 * @param {Object} error The expected error object.
 * @param {Object} message The actual lint message.
 * @param {number} i The error index.
 * @param {Object} rule The rule under test.
 * @param {string} ruleHasMetaMessages Whether the rule has meta.messages.
 * @param {string} friendlyIDList Friendly list of valid message IDs.
 * @param {string|boolean} requireData The requireData assertion option.
 * @returns {void}
 */
function assertMessageIdMatch(error, message, i, rule, ruleHasMetaMessages, friendlyIDList, requireData) {
    assert.ok(
        ruleHasMetaMessages,
        "Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.",
    );

    if (!hasOwnProperty(rule.meta.messages, error.messageId)) {
        assert(false, `Invalid messageId '${error.messageId}'. Expected one of ${friendlyIDList}.`);
    }

    assert.strictEqual(
        message.messageId,
        error.messageId,
        `messageId '${message.messageId}' does not match expected messageId '${error.messageId}'.`,
    );

    const unsubstitutedPlaceholders = getUnsubstitutedMessagePlaceholders(
        message.message,
        rule.meta.messages[message.messageId],
        error.data,
    );

    assert.ok(
        unsubstitutedPlaceholders.length === 0,
        formatUnsubstitutedPlaceholdersMessage(unsubstitutedPlaceholders, "reported message"),
    );

    if (hasOwnProperty(error, "data")) {
        const rehydratedMessage = interpolate(
            rule.meta.messages[error.messageId],
            error.data,
        );

        assert.strictEqual(
            message.message,
            rehydratedMessage,
            `Hydrated message "${rehydratedMessage}" does not match "${message.message}"`,
        );
    } else {
        const requiresDataProperty = requireData === true || requireData === "error";
        const hasPlaceholders =
            getMessagePlaceholders(rule.meta.messages[error.messageId]).length > 0;

        assert.ok(
            !requiresDataProperty || !hasPlaceholders,
            `Error should specify the 'data' property as the referenced message has placeholders.`,
        );
    }
}

/**
 * Asserts location properties of an error match.
 * @param {Object} error The expected error object.
 * @param {Object} message The actual lint message.
 * @param {boolean} requireLocation Whether location is required.
 * @returns {void}
 */
function assertErrorLocation(error, message, requireLocation) {
    const locationProperties = ["line", "column", "endLine", "endColumn"];
    const actualLocation = {};
    const expectedLocation = {};

    for (const key of locationProperties) {
        if (hasOwnProperty(error, key)) {
            actualLocation[key] = message[key];
            expectedLocation[key] = error[key];
        }
    }

    if (requireLocation) {
        const missingKeys = locationProperties.filter(
            key => !hasOwnProperty(error, key) && hasOwnProperty(message, key),
        );
        assert.ok(
            missingKeys.length === 0,
            `Error is missing expected location properties: ${missingKeys.join(", ")}`,
        );
    }

    if (Object.keys(expectedLocation).length > 0) {
        assert.deepStrictEqual(
            actualLocation,
            expectedLocation,
            "Actual error location does not match expected error location.",
        );
    }
}

/**
 * Validates a single expected suggestion against the actual suggestion.
 * @param {Object} expectedSuggestion The expected suggestion.
 * @param {Object} actualSuggestion The actual suggestion.
 * @param {number} index The suggestion index.
 * @param {Object} message The parent lint message.
 * @param {Object} item The test item.
 * @param {Object} result The run result.
 * @param {Linter} linter The linter instance.
 * @param {Object} rule The rule under test.
 * @param {boolean} ruleHasMetaMessages Whether the rule has meta.messages.
 * @param {string} friendlyIDList Friendly list of valid message IDs.
 * @param {string|boolean} requireData The requireData assertion option.
 * @returns {void}
 */
function assertSuggestion(
    expectedSuggestion,
    actualSuggestion,
    index,
    message,
    item,
    result,
    linter,
    rule,
    ruleHasMetaMessages,
    friendlyIDList,
    requireData,
) {
    const prefix = `Error Suggestion at index ${index}:`;

    assert.ok(
        typeof expectedSuggestion === "object" && expectedSuggestion !== null,
        "Test suggestion in 'suggestions' array must be an object.",
    );

    for (const propertyName of Object.keys(expectedSuggestion)) {
        assert.ok(
            suggestionObjectParameters.has(propertyName),
            `Invalid suggestion property name '${propertyName}'. Expected one of ${friendlySuggestionObjectParameterList}.`,
        );
    }

    if (hasOwnProperty(expectedSuggestion, "desc")) {
        assertSuggestionDesc(expectedSuggestion, actualSuggestion, prefix);
    } else if (hasOwnProperty(expectedSuggestion, "messageId")) {
        assertSuggestionMessageId(
            expectedSuggestion,
            actualSuggestion,
            prefix,
            rule,
            ruleHasMetaMessages,
            friendlyIDList,
            requireData,
        );
    } else if (hasOwnProperty(expectedSuggestion, "data")) {
        assert.fail(`${prefix} Test must specify 'messageId' if 'data' is used.`);
    } else {
        assert.fail(`${prefix} Test must specify either 'messageId' or 'desc'.`);
    }

    assert.ok(
        hasOwnProperty(expectedSuggestion, "output"),
        `${prefix} The "output" property is required.`,
    );

    const codeWithAppliedSuggestion = SourceCodeFixer.applyFixes(
        item.code,
        [actualSuggestion],
    ).output;

    const errorMessageInSuggestion = linter
        .verify(codeWithAppliedSuggestion, result.configs, result.filename)
        .find(m => m.fatal);

    assert(
        !errorMessageInSuggestion,
        [
            "A fatal parsing error occurred in suggestion fix.",
            `Error: ${errorMessageInSuggestion && errorMessageInSuggestion.message}`,
            "Suggestion output:",
            codeWithAppliedSuggestion,
        ].join("\n"),
    );

    assert.strictEqual(
        codeWithAppliedSuggestion,
        expectedSuggestion.output,
        `Expected the applied suggestion fix to match the test suggestion output for suggestion at index: ${index} on error with message: "${message.message}"`,
    );

    assert.notStrictEqual(
        expectedSuggestion.output,
        item.code,
        `The output of a suggestion should differ from the original source code for suggestion at index: ${index} on error with message: "${message.message}"`,
    );
}

/**
 * Asserts the `desc` property of a suggestion.
 * @param {Object} expectedSuggestion The expected suggestion.
 * @param {Object} actualSuggestion The actual suggestion.
 * @param {string} prefix The error message prefix.
 * @returns {void}
 */
function assertSuggestionDesc(expectedSuggestion, actualSuggestion, prefix) {
    assert.ok(
        !hasOwnProperty(expectedSuggestion, "data"),
        `${prefix} Test should not specify both 'desc' and 'data'.`,
    );
    assert.ok(
        !hasOwnProperty(expectedSuggestion, "messageId"),
        `${prefix} Test should not specify both 'desc' and 'messageId'.`,
    );
    assert.strictEqual(
        actualSuggestion.desc,
        expectedSuggestion.desc,
        `${prefix} desc should be "${expectedSuggestion.desc}" but got "${actualSuggestion.desc}" instead.`,
    );
}

/**
 * Asserts the `messageId` property of a suggestion.
 * @param {Object} expectedSuggestion The expected suggestion.
 * @param {Object} actualSuggestion The actual suggestion.
 * @param {string} prefix The error message prefix.
 * @param {Object} rule The rule under test.
 * @param {boolean} ruleHasMetaMessages Whether the rule has meta.messages.
 * @param {string} friendlyIDList Friendly list of valid message IDs.
 * @param {string|boolean} requireData The requireData assertion option.
 * @returns {void}
 */
function assertSuggestionMessageId(
    expectedSuggestion,
    actualSuggestion,
    prefix,
    rule,
    ruleHasMetaMessages,
    friendlyIDList,
    requireData,
) {
    assert.ok(
        ruleHasMetaMessages,
        `${prefix} Test can not use 'messageId' if rule under test doesn't define 'meta.messages'.`,
    );
    assert.ok(
        hasOwnProperty(rule.meta.messages, expectedSuggestion.messageId),
        `${prefix} Test has invalid messageId '${expectedSuggestion.messageId}', the rule under test allows only one of ${friendlyIDList}.`,
    );
    assert.strictEqual(
        actualSuggestion.messageId,
        expectedSuggestion.messageId,
        `${prefix} messageId should be '${expectedSuggestion.messageId}' but got '${actualSuggestion.messageId}' instead.`,
    );

    const rawSuggestionMessage = rule.meta.messages[expectedSuggestion.messageId];
    const unsubstitutedPlaceholders = getUnsubstitutedMessagePlaceholders(
        actualSuggestion.desc,
        rawSuggestionMessage,
        expectedSuggestion.data,
    );

    assert.ok(
        unsubstitutedPlaceholders.length === 0,
        formatUnsubstitutedPlaceholdersMessage(unsubstitutedPlaceholders, "suggestion message"),
    );

    if (hasOwnProperty(expectedSuggestion, "data")) {
        const rehydratedDesc = interpolate(rawSuggestionMessage, expectedSuggestion.data);

        assert.strictEqual(
            actualSuggestion.desc,
            rehydratedDesc,
            `${prefix} Hydrated test desc "${rehydratedDesc}" does not match received desc "${actualSuggestion.desc}".`,
        );
    } else {
        const requiresDataProperty = requireData === true || requireData === "suggestion";
        const hasPlaceholders = getMessagePlaceholders(rawSuggestionMessage).length > 0;

        assert.ok(
            !requiresDataProperty || !hasPlaceholders,
            `${prefix} Suggestion should specify the 'data' property as the referenced message has placeholders.`,
        );
    }
}

/**
 * Asserts the suggestions on a single error match expectations.
 * @param {Object} error The expected error object.
 * @param {Object} message The actual lint message.
 * @param {number} i The error index.
 * @param {Object} item The test item.
 * @param {Object} result The run result.
 * @param {Linter} linter The linter instance.
 * @param {Object} rule The rule under test.
 * @param {boolean} ruleHasMetaMessages Whether the rule has meta.messages.
 * @param {string} friendlyIDList Friendly list of valid message IDs.
 * @param {string|boolean} requireData The requireData assertion option.
 * @returns {void}
 */
function assertErrorSuggestions(
    error,
    message,
    i,
    item,
    result,
    linter,
    rule,
    ruleHasMetaMessages,
    friendlyIDList,
    requireData,
) {
    assert.ok(
        !message.suggestions || hasOwnProperty(error, "suggestions"),
        `Error at index ${i} has suggestions. Please specify 'suggestions' property on the test error object.`,
    );

    if (!hasOwnProperty(error, "suggestions")) {
        return;
    }

    const expectsSuggestions = Array.isArray(error.suggestions)
        ? error.suggestions.length > 0
        : Boolean(error.suggestions);
    const hasSuggestions = message.suggestions !== void 0;

    if (!hasSuggestions && expectsSuggestions) {
        assert.ok(
            !error.suggestions,
            `Error should have suggestions on error with message: "${message.message}"`,
        );
        return;
    }

    if (!hasSuggestions) {
        return;
    }

    assert.ok(
        expectsSuggestions,
        `Error should have no suggestions on error with message: "${message.message}"`,
    );

    if (typeof error.suggestions === "number") {
        assert.strictEqual(
            message.suggestions.length,
            error.suggestions,
            `Error should have ${error.suggestions} suggestions. Instead found ${message.suggestions.length} suggestions`,
        );
        return;
    }

    if (!Array.isArray(error.suggestions)) {
        assert.fail("Test error object property 'suggestions' should be an array or a number");
        return;
    }

    assert.strictEqual(
        message.suggestions.length,
        error.suggestions.length,
        `Error should have ${error.suggestions.length} suggestions. Instead found ${message.suggestions.length} suggestions`,
    );

    error.suggestions.forEach((expectedSuggestion, index) => {
        assertSuggestion(
            expectedSuggestion,
            message.suggestions[index],
            index,
            message,
            item,
            result,
            linter,
            rule,
            ruleHasMetaMessages,
            friendlyIDList,
            requireData,
        );
    });
}

/**
 * Asserts a single error object against the actual lint message.
 * @param {Object} error The expected error object.
 * @param {Object} message The actual lint message.
 * @param {number} i The error index.
 * @param {Object} item The test item.
 * @param {Object} result The run result.
 * @param {Linter} linter The linter instance.
 * @param {Object} assertionContext Context with rule info and assertion options.
 * @returns {void}
 */
function assertErrorObject(error, message, i, item, result, linter, assertionContext) {
    const {
        rule,
        ruleHasMetaMessages,
        friendlyIDList,
        requireLocation,
        requireData,
    } = assertionContext;

    if (hasOwnProperty(error, "message")) {
        assertMessageMatches(message.message, error.message);
    } else if (hasOwnProperty(error, "messageId")) {
        assertMessageIdMatch(
            error,
            message,
            i,
            rule,
            ruleHasMetaMessages,
            friendlyIDList,
            requireData,
        );
    }

    assertErrorLocation(error, message, requireLocation);

    assertErrorSuggestions(
        error,
        message,
        i,
        item,
        result,
        linter,
        rule,
        ruleHasMetaMessages,
        friendlyIDList,
        requireData,
    );
}

/**
 * Asserts all errors in an invalid test case.
 * @param {Object} item The test item.
 * @param {Object} result The run result.
 * @param {Linter} linter The linter instance.
 * @param {string} ruleId The rule ID.
 * @param {Object} assertionContext Context with rule info and assertion options.
 * @returns {void}
 */
function assertInvalidTestErrors(item, result, linter, ruleId, assertionContext) {
    const { messages } = result;

    if (typeof item.errors === "number") {
        assert.strictEqual(
            messages.length,
            item.errors,
            util.format(
                "Should have %d error%s but had %d: %s",
                item.errors,
                item.errors === 1 ? "" : "s",
                messages.length,
                util.inspect(messages),
            ),
        );
        return;
    }

    assert.strictEqual(
        messages.length,
        item.errors.length,
        util.format(
            "Should have %d error%s but had %d: %s",
            item.errors.length,
            item.errors.length === 1 ? "" : "s",
            messages.length,
            util.inspect(messages),
        ),
    );

    const hasMessageOfThisRule = messages.some(m => m.ruleId === ruleId);

    for (let i = 0; i < item.errors.length; i++) {
        try {
            const error = item.errors[i];
            const message = messages[i];

            assert(
                hasMessageOfThisRule,
                "Error rule name should be the same as the name of the rule being tested",
            );

            if (typeof error === "string" || error instanceof RegExp) {
                assertMessageMatches(message.message, error);
                assert.ok(
                    message.suggestions === void 0,
                    `Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
                );
            } else if (typeof error === "object" && error !== null) {
                assertErrorObject(error, message, i, item, result, linter, assertionContext);
            }
        } catch (error) {
            if (error instanceof Error) {
                error.errorIndex = i;
            }
            throw error;
        }
    }
}

/**
 * Asserts the output of an invalid test case.
 * @param {Object} item The test item.
 * @param {Object} result The run result.
 * @returns {void}
 */
function assertInvalidTestOutput(item, result) {
    if (hasOwnProperty(item, "output")) {
        if (item.output === null) {
            assert.strictEqual(
                result.output,
                item.code,
                "Expected no autofixes to be suggested",
            );
        } else {
            assert.strictEqual(result.output, item.output, "Output is incorrect.");
            assert.notStrictEqual(
                item.code,
                item.output,
                "Test property 'output' matches 'code'. If no autofix is expected, then omit the 'output' property or set it to null.",
            );
        }
    } else {
        assert.strictEqual(
            result.output,
            item.code,
            "The rule fixed the code. Please add 'output' property.",
        );
    }
}

/**
 * Runs a hook on the given item when it's assigned to the given property.
 * @param {Object} item Item to run the hook on.
 * @param {string} prop The property having the hook assigned to.
 * @returns {void}
 */
function runHook(item, prop) {
    if (hasOwnProperty(item, prop)) {
        assert.strictEqual(
            typeof item[prop],
            "function",
            `Optional test case property '${prop}' must be a function`,
        );
        item[prop]();
    }
}

/**
 * Mocha test wrapper.
 */
class RuleTester {
    /**
     * Creates a new instance of RuleTester.
     * @param {Object} [testerConfig] Optional, extra configuration for the tester
     */
    constructor(testerConfig = {}) {
        /**
         * The configuration to use for this tester. Combination of the tester
         * configuration and the default configuration.
         * @type {Object}
         */
        this.testerConfig = [
            sharedDefaultConfig,
            testerConfig,
            { rules: { "rule-tester/validate-ast": "error" } },
        ];

        this.linter = new Linter({ configType: "flat" });
    }

    /**
     * Set the configuration to use for all future tests
     * @param {Object} config the configuration to use.
     * @throws {TypeError} If non-object config.
     * @returns {void}
     */
    static setDefaultConfig(config) {
        if (typeof config !== "object" || config === null) {
            throw new TypeError(
                "RuleTester.setDefaultConfig: config must be an object",
            );
        }
        sharedDefaultConfig = config;
        sharedDefaultConfig.rules = sharedDefaultConfig.rules || {};
    }

    /**
     * Get the current configuration used for all tests
     * @returns {Object} the current configuration
     */
    static getDefaultConfig() {
        return sharedDefaultConfig;
    }

    /**
     * Reset the configuration to the initial configuration of the tester removing
     * any changes made until now.
     * @returns {void}
     */
    static resetDefaultConfig() {
        sharedDefaultConfig = {
            rules: { ...testerDefaultConfig.rules },
        };
    }

    static get describe() {
        return (
            this[DESCRIBE] ||
            (typeof describe === "function" ? describe : describeDefaultHandler)
        );
    }

    static set describe(value) {
        this[DESCRIBE] = value;
    }

    static get it() {
        return this[IT] || (typeof it === "function" ? it : itDefaultHandler);
    }

    static set it(value) {
        this[IT] = value;
    }

    /**
     * Adds the `only` property to a test to run it in isolation.
     * @param {string | ValidTestCase | InvalidTestCase} item A single test to run by itself.
     * @returns {ValidTestCase | InvalidTestCase} The test with `only` set.
     */
    static only(item) {
        if (typeof item === "string") {
            return { code: item, only: true };
        }

        return { ...item, only: true };
    }

    static get itOnly() {
        if (typeof this[IT_ONLY] === "function") {
            return this[IT_ONLY];
        }
        if (typeof this[IT] === "function" && typeof this[IT].only === "function") {
            return Function.bind.call(this[IT].only, this[IT]);
        }
        if (typeof it === "function" && typeof it.only === "function") {
            return Function.bind.call(it.only, it);
        }

        if (typeof this[DESCRIBE] === "function" || typeof this[IT] === "function") {
            throw new Error(
                "Set `RuleTester.itOnly` to use `only` with a custom test framework.\n" +
                    "See https://eslint.org/docs/latest/integrate/nodejs-api#customizing-ruletester for more.",
            );
        }
        if (typeof it === "function") {
            throw new Error(
                "The current test framework does not support exclusive tests with `only`.",
            );
        }
        throw new Error(
            "To use `only`, use RuleTester with a test framework that provides `it.only()` like Mocha.",
        );
    }

    static set itOnly(value) {
        this[IT_ONLY] = value;
    }

    /**
     * Adds a new rule test to execute.
     * @param {string} ruleName The name of the rule to run.
     * @param {RuleDefinition} rule The rule to test.
     * @param {{
     *   assertionOptions?: {
     *     requireMessage?: boolean | "message" | "messageId",
     *     requireLocation?: boolean
     *     requireData?: boolean | "error" | "suggestion"
     *   },
     *   valid: (ValidTestCase | string)[],
     *   invalid: InvalidTestCase[]
     * }} test The collection of tests to run.
     * @throws {TypeError|Error} If `rule` is not an object with a `create` method,
     * or if non-object `test`, or if a required scenario of the given type is missing.
     * @returns {void}
     */
    run(ruleName, rule, test) {
        const { testerConfig, linter } = this;
        const ruleId = `rule-to-test/${ruleName}`;

        assertRule(rule, ruleName);
        assertTest(test, ruleName);

        const estimateTestLocation = buildLazyTestLocationEstimator(this.run);
        const baseConfig = buildBaseConfig(rule, ruleName);

        const {
            requireMessage = false,
            requireLocation = false,
            requireData = false,
        } = test.assertionOptions ?? {};

        const ruleHasMetaMessages =
            hasOwnProperty(rule, "meta") && hasOwnProperty(rule.meta, "messages");

        const friendlyIDList = ruleHasMetaMessages
            ? `[${Object.keys(rule.meta.messages).map(key => `'${key}'`).join(", ")}]`
            : null;

        assert.ok(
            ruleHasMetaMessages || requireMessage !== "messageId",
            `Assertion options can not use 'requireMessage: "messageId"' if rule under test doesn't define 'meta.messages'.`,
        );

        const runContext = { linter, testerConfig, baseConfig, ruleId, rule, ruleName };

        const assertionContext = {
            rule,
            ruleHasMetaMessages,
            friendlyIDList,
            requireLocation,
            requireData,
        };

        const testValidTemplate = item => {
            const result = runRuleForItem(item, runContext);

            assert.strictEqual(
                result.messages.length,
                0,
                util.format(
                    "Should have no errors but had %d: %s",
                    result.messages.length,
                    util.inspect(result.messages),
                ),
            );

            assertASTDidntChange(result.beforeAST, result.afterAST);
        };

        const testInvalidTemplate = item => {
            const result = runRuleForItem(item, runContext);

            for (const message of result.messages) {
                assertUniqueSuggestionMessages(message);
            }

            assertInvalidTestErrors(item, result, linter, ruleId, assertionContext);
            assertInvalidTestOutput(item, result);
            assertASTDidntChange(result.beforeAST, result.afterAST);
        };

        this.constructor.describe(ruleName, () => {
            if (test.valid.length > 0) {
                this.constructor.describe("valid", () => {
                    const seenTestCases = new Set();

                    test.valid.forEach((valid, index) => {
                        const item = normalizeTestCase(valid);

                        this.constructor[valid.only ? "itOnly" : "it"](
                            sanitize(item.name || item.code),
                            () => {
                                try {
                                    runHook(item, "before");
                                    assertValidTestCase(item, seenTestCases);
                                    testValidTemplate(item);
                                } catch (error) {
                                    if (error instanceof Error) {
                                        error.scenarioType = "valid";
                                        error.scenarioIndex = index;
                                        error.stack = error.stack.replace(
                                            /^ +at /mu,
                                            [
                                                `    roughly at RuleTester.run.valid[${index}] (${estimateTestLocation(`valid[${index}]`)})`,
                                                `    roughly at RuleTester.run.valid (${estimateTestLocation("valid")})`,
                                                `    at RuleTester.run (${estimateTestLocation("root")})`,
                                                "    at ",
                                            ].join("\n"),
                                        );
                                    }
                                    throw error;
                                } finally {
                                    runHook(item, "after");
                                }
                            },
                        );
                    });
                });
            }

            if (test.invalid.length > 0) {
                this.constructor.describe("invalid", () => {
                    const seenTestCases = new Set();

                    test.invalid.forEach((invalid, index) => {
                        const item = normalizeTestCase(invalid);

                        this.constructor[item.only ? "itOnly" : "it"](
                            sanitize(item.name || item.code),
                            () => {
                                try {
                                    runHook(item, "before");
                                    assertInvalidTestCase(
                                        item,
                                        seenTestCases,
                                        ruleName,
                                        test.assertionOptions,
                                    );
                                    testInvalidTemplate(item);
                                } catch (error) {
                                    if (error instanceof Error) {
                                        error.scenarioType = "invalid";
                                        error.scenarioIndex = index;
                                        const errorIndex = error.errorIndex;
                                        error.stack = error.stack.replace(
                                            /^ +at /mu,
                                            [
                                                ...(typeof errorIndex === "number"
                                                    ? [
                                                          `    roughly at RuleTester.run.invalid[${index}].error[${errorIndex}] (${estimateTestLocation(`invalid[${index}].errors[${errorIndex}]`)})`,
                                                      ]
                                                    : []),
                                                `    roughly at RuleTester.run.invalid[${index}] (${estimateTestLocation(`invalid[${index}]`)})`,
                                                `    roughly at RuleTester.run.invalid (${estimateTestLocation("invalid")})`,
                                                `    at RuleTester.run (${estimateTestLocation("root")})`,
                                                "    at ",
                                            ].join("\n"),
                                        );
                                    }
                                    throw error;
                                } finally {
                                    runHook(item, "after");
                                }
                            },
                        );
                    });
                });
            }
        });
    }
}

RuleTester[DESCRIBE] = RuleTester[IT] = RuleTester[IT_ONLY] = null;

module.exports = RuleTester;
```

## Key Refactoring Decisions

### 1. Extracted `buildBaseConfig()` (~30 lines)
Moved the static base config construction out of `run()` — it had no dependency on runtime state.

### 2. Extracted `validateRuleSchema()` (~35 lines)
Isolated the AJV schema validation logic (empty schema check, `validateSchema`, `compile`) into a single focused function.

### 3. Extracted `buildConfigsForItem()` (~60 lines)
Separated the `FlatConfigArray` construction, parser wrapping, config pushing, and validation from `runRuleForItem`.

### 4. Extracted `verifyWithForbiddenMethodGuards()` (~20 lines)
Isolated the try/finally pattern that temporarily replaces `SourceCode` methods.

### 5. Split `testInvalidTemplate` into focused functions
- **`assertUniqueSuggestionMessages()`** — checks duplicate suggestion messages
- **`assertInvalidTestErrors()`** — handles the number vs array error count dispatch
- **`assertErrorObject()`** — validates a single error object (message, location, suggestions)
- **`assertMessageIdMatch()`** — handles `messageId`-specific validation
- **`assertErrorLocation()`** — validates location properties
- **`assertErrorSuggestions()`** — dispatches suggestion count/array validation
- **`assertSuggestion()`** — validates a single suggestion
- **`assertSuggestionDesc()`** / **`assertSuggestionMessageId()`** — split suggestion message type handling
- **`assertInvalidTestOutput()`** — validates the output property

### 6. Split `buildLazyTestLocationEstimator` helpers
- **`parseTestLocationsFromSource()`** — top-level coordinator
- **`extractValidLineIndexes()`** — valid section parsing
- **`extractInvalidLineIndexes()`** — invalid section parsing  
- **`extractErrorObjectLineIndexes()`** — error object parsing
- **`assignErrorLocations()`** — error location assignment

### 7. Added `formatUnsubstitutedPlaceholdersMessage()` 
Eliminated duplicated placeholder error message formatting logic.

### 8. Moved `runHook` and `assertASTDidntChange` to module level
These had no closure dependencies and were unnecessarily re-created on each `run()` call.
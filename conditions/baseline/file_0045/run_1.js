# Refactored RuleTester

Here's the refactored code with reduced complexity through extraction of focused helper functions, elimination of deeply nested logic, and improved separation of concerns:

```javascript
/**
 * @fileoverview Mocha/Jest test wrapper
 * @author Ilya Volodin
 */
"use strict";

/* globals describe, it -- Mocha globals */

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
const { defaultConfig, defaultRuleTesterConfig } = require("../config/default-config");
const ajv = require("../shared/ajv")({ strictDefaults: true });
const parserSymbol = Symbol.for("eslint.RuleTester.parser");
const { ConfigArraySymbol } = require("@eslint/config-array");
const jslang = require("../languages/js");
const { SourceCode } = require("../languages/js/source-code");

/** @import { LanguageOptions, RuleDefinition } from "@eslint/core" */
/** @typedef {import("../types").Linter.Parser} Parser */

//------------------------------------------------------------------------------
// Typedefs (unchanged)
//------------------------------------------------------------------------------

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
 * @property {string} [filename] The fake filename for the test case.
 * @property {boolean} [only] Run only this test case or the subset of test cases with this property.
 */

/**
 * A test case that is expected to fail lint.
 * @typedef {Object} InvalidTestCase
 * @property {string} [name] Name for the test case.
 * @property {string} code Code for the test case.
 * @property {number | Array<TestCaseError | string | RegExp>} errors Expected errors.
 * @property {string | null} [output] The expected code after autofixes are applied.
 * @property {any[]} [options] Options for the test case.
 * @property {Function} [before] Function to execute before testing the case.
 * @property {Function} [after] Function to execute after testing the case regardless of its result.
 * @property {{ [name: string]: any }} [settings] Settings for the test case.
 * @property {string} [filename] The fake filename for the test case.
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
// Constants
//------------------------------------------------------------------------------

const testerDefaultConfig = { rules: {} };
let sharedDefaultConfig = { rules: {} };

const RuleTesterParameters = [
    "name", "code", "filename", "options", "before", "after",
    "errors", "output", "only",
];

const errorObjectParameters = new Set([
    "message", "messageId", "data", "line", "column",
    "endLine", "endColumn", "suggestions",
]);

const friendlyErrorObjectParameterList =
    `[${[...errorObjectParameters].map(key => `'${key}'`).join(", ")}]`;

const suggestionObjectParameters = new Set([
    "desc", "messageId", "data", "output",
]);

const friendlySuggestionObjectParameterList =
    `[${[...suggestionObjectParameters].map(key => `'${key}'`).join(", ")}]`;

const forbiddenMethods = ["applyInlineConfig", "applyLanguageOptions", "finalize"];

/** @type {Map<string,WeakSet>} */
const forbiddenMethodCalls = new Map(
    forbiddenMethods.map(methodName => [methodName, new WeakSet()]),
);

const hasOwnProperty = Function.call.bind(Object.hasOwnProperty);

const metaSchemaDescription = `
\t- If the rule has options, set \`meta.schema\` to an array or non-empty object to enable options validation.
\t- If the rule doesn't have options, omit \`meta.schema\` to enforce that no options can be passed to the rule.
\t- You can also set \`meta.schema\` to \`false\` to opt-out of options validation (not recommended).

\thttps://eslint.org/docs/latest/extend/custom-rules#options-schemas
`;

const duplicationIgnoredParameters = new Set(["name", "errors", "output"]);

const DESCRIBE = Symbol("describe");
const IT = Symbol("it");
const IT_ONLY = Symbol("itOnly");

const locationProperties = ["line", "column", "endLine", "endColumn"];

//------------------------------------------------------------------------------
// AST Utilities
//------------------------------------------------------------------------------

/**
 * Clones a given value deeply, ignoring `parent` properties.
 * @param {any} x A value to clone.
 * @returns {any} A cloned value.
 */
function cloneDeeplyExcludesParent(x) {
    if (typeof x !== "object" || x === null) {
        return x;
    }

    if (Array.isArray(x)) {
        return x.map(cloneDeeplyExcludesParent);
    }

    const result = {};

    for (const key in x) {
        if (key !== "parent" && hasOwnProperty(x, key)) {
            result[key] = cloneDeeplyExcludesParent(x[key]);
        }
    }

    return result;
}

/**
 * Freezes a given value deeply.
 * @param {any} x A value to freeze.
 * @param {Set<Object>} seenObjects Objects already seen during the traversal.
 * @returns {void}
 */
function freezeDeeply(x, seenObjects = new Set()) {
    if (typeof x !== "object" || x === null) {
        return;
    }

    if (seenObjects.has(x)) {
        return;
    }

    seenObjects.add(x);

    if (Array.isArray(x)) {
        x.forEach(element => freezeDeeply(element, seenObjects));
    } else {
        for (const key in x) {
            if (key !== "parent" && hasOwnProperty(x, key)) {
                freezeDeeply(x[key], seenObjects);
            }
        }
    }

    Object.freeze(x);
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
        /[\u0000-\u0009\u000b-\u001a]/gu, // eslint-disable-line no-control-regex
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
                throw new Error(`Use ${objName}.range[0] instead of ${objName}.start`);
            },
            configurable: true,
            enumerable: false,
        },
        end: {
            get() {
                throw new Error(`Use ${objName}.range[1] instead of ${objName}.end`);
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
 * Wraps the given parser to intercept and modify return values for test purposes.
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

        /* eslint-disable no-invalid-this */
        if (!called.has(this)) {
            called.add(this);
            return original.apply(this, args);
        }
        /* eslint-enable no-invalid-this */

        throw new Error(`\`SourceCode#${methodName}()\` cannot be called inside a rule.`);
    };
}

//------------------------------------------------------------------------------
// Message Placeholder Utilities
//------------------------------------------------------------------------------

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
 * Returns placeholders in the reported message that are not substituted.
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
 * @param {string} [prefix] Optional prefix for the message.
 * @returns {string} The formatted error message.
 */
function formatUnsubstitutedPlaceholdersMessage(placeholders, prefix = "") {
    const count = placeholders.length;
    const detail = count > 1
        ? `unsubstituted placeholders: ${placeholders.map(name => `'${name}'`).join(", ")}`
        : `an unsubstituted placeholder '${placeholders[0]}'`;
    const valueWord = count > 1 ? "values" : "value";

    return `${prefix}The reported message has ${detail}. Please provide the missing ${valueWord} via the 'data' property in the context.report() call.`;
}

//------------------------------------------------------------------------------
// Test Case Validation
//------------------------------------------------------------------------------

/**
 * Normalizes a test case item to an object with a 'code' property.
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

    if (typeof error !== "object" || error === null) {
        assert.fail(`errors[${number}] must be a string, RegExp, or an object.`);
        return;
    }

    for (const propertyName of Object.keys(error)) {
        assert.ok(
            errorObjectParameters.has(propertyName),
            `Invalid error property name '${propertyName}'. Expected one of ${friendlyErrorObjectParameterList}.`,
        );
    }

    assertErrorMessageRequirements(error, number, requireMessage);
    assertErrorMessageMutualExclusion(error, number);
}

/**
 * Asserts that error message requirements are met.
 * @param {Object} error The error object.
 * @param {number} number The index of the error.
 * @param {string|boolean} requireMessage The requireMessage option.
 * @returns {void}
 */
function assertErrorMessageRequirements(error, number, requireMessage) {
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
}

/**
 * Asserts that error message and messageId are not both specified.
 * @param {Object} error The error object.
 * @param {number} number The index of the error.
 * @returns {void}
 */
function assertErrorMessageMutualExclusion(error, number) {
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
            assertSingleErrorEntry(error, number, assertionOptions);
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
 * @param {Set<string>} seenTestCases set of serialized test cases seen so far
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
    assert.ok(typeof item.code === "string", "Test case must specify a string value for 'code'");

    if (item.name) {
        assert.ok(typeof item.name === "string", "Optional test case property 'name' must be a string");
    }
    if (hasOwnProperty(item, "only")) {
        assert.ok(typeof item.only === "boolean", "Optional test case property 'only' must be a boolean");
    }
    if (hasOwnProperty(item, "filename")) {
        assert.ok(typeof item.filename === "string", "Optional test case property 'filename' must be a string");
    }
    if (hasOwnProperty(item, "options")) {
        assert.ok(Array.isArray(item.options), "Optional test case property 'options' must be an array");
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

//------------------------------------------------------------------------------
// Test Location Estimation
//------------------------------------------------------------------------------

/**
 * Gets the invocation location from the stack trace.
 * @param {Function} relative The function before the invocation point.
 * @returns {{ sourceFile: string; sourceLine: number; sourceColumn: number; }} The invocation location.
 */
function getInvocationLocation(relative = getInvocationLocation) {
    const dummyObject = {};
    let location;
    const { prepareStackTrace } = Error;

    Error.prepareStackTrace = (_, [callSite]) => {
        location = {
            sourceFile: callSite.getFileName() ?? `${callSite.getEvalOrigin()}, <anonymous>`,
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
 * Parses source file content into lines starting from the invocation point.
 * @param {string} sourceFile Path to the source file.
 * @param {number} sourceLine The line number of the invocation.
 * @param {number} sourceColumn The column number of the invocation.
 * @returns {string[]} Cleaned lines from the invocation point.
 */
function parseSourceLines(sourceFile, sourceLine, sourceColumn) {
    let content = readFileSync(sourceFile, "utf8")
        .split("\n")
        .slice(sourceLine - 1);

    content[0] = content[0].slice(Math.max(0, sourceColumn - 1));

    return content.map(l =>
        l.trim().replace(/\s*\/\/.*$(?<!,)/u, ""),
    );
}

/**
 * Finds the line indexes of test cases within a section of content.
 * @param {string[]} lines The lines of the section.
 * @returns {number[]} The line indexes of test cases.
 */
function findValidLineIndexes(lines) {
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
 * Finds the line indexes of error entries within invalid test case lines.
 * @param {string[]} lines The lines of the invalid section.
 * @returns {number[]} The line indexes of error entries.
 */
function findInvalidLineIndexes(lines) {
    return lines
        .map((l, i) => l.trimStart().startsWith("errors:") ? i : null)
        .filter(Boolean);
}

/**
 * Finds the line indexes of error objects within a single invalid test case.
 * @param {string[]} errorLines The lines of the error section.
 * @returns {number[]} The line indexes of error objects.
 */
function findErrorLineIndexes(errorLines) {
    let errorObjectDepth = 0;

    return errorLines
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
 * Builds error location entries for all invalid test cases.
 * @param {string[]} invalidLines Lines of the invalid section.
 * @param {number[]} invalidLineIndexes Indexes of invalid test cases.
 * @param {string} sourceFile The source file path.
 * @param {number} sourceLine The base line number.
 * @param {number} invalidStartIndex The start index of the invalid section.
 * @returns {Object} Location entries for errors.
 */
function buildErrorLocationEntries(invalidLines, invalidLineIndexes, sourceFile, sourceLine, invalidStartIndex) {
    const entries = {};
    const indexesWithSentinel = [...invalidLineIndexes, invalidLines.length];

    for (let i = 0; i < indexesWithSentinel.length - 1; i++) {
        const start = indexesWithSentinel[i];
        const end = indexesWithSentinel[i + 1];
        const errorLines = invalidLines.slice(start, end);
        const errorLineIndexes = findErrorLineIndexes(errorLines);

        for (const [errorIndex, line] of errorLineIndexes.entries()) {
            entries[`invalid[${i}].errors[${errorIndex}]`] =
                `${sourceFile}:${sourceLine + invalidStartIndex + start + line}`;
        }
    }

    return entries;
}

/**
 * Estimates the location of the test case in the source file.
 * @param {Function} invoker The method that runs the tests.
 * @returns {(key: string) => string} The lazy resolver for the estimated location.
 */
function buildLazyTestLocationEstimator(invoker) {
    const invocationLocation = getInvocationLocation(invoker);
    let testLocations = null;

    return key => {
        if (testLocations !== null) {
            return testLocations[key] || "unknown source";
        }

        const { sourceFile, sourceLine, sourceColumn } = invocationLocation;

        testLocations = { root: `${sourceFile}:${sourceLine}:${sourceColumn}` };

        if (!existsSync(sourceFile)) {
            return testLocations[key] || "unknown source";
        }

        const content = parseSourceLines(sourceFile, sourceLine, sourceColumn);

        const validStartIndex = content.findIndex(line => /\bvalid\s*:/u.test(line));
        const invalidStartIndex = content.findIndex(line => /\binvalid\s*:/u.test(line));

        testLocations.valid = `${sourceFile}:${sourceLine + validStartIndex}`;
        testLocations.invalid = `${sourceFile}:${sourceLine + invalidStartIndex}`;

        const validEndIndex = validStartIndex < invalidStartIndex ? invalidStartIndex : content.length;
        const invalidEndIndex = validStartIndex < invalidStartIndex ? content.length : validStartIndex;

        const validLines = content.slice(validStartIndex, validEndIndex);
        const invalidLines = content.slice(invalidStartIndex, invalidEndIndex);

        const validLineIndexes = findValidLineIndexes(validLines);
        const invalidLineIndexes = findInvalidLineIndexes(invalidLines);

        Object.assign(
            testLocations,
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
            buildErrorLocationEntries(
                invalidLines, invalidLineIndexes, sourceFile, sourceLine, invalidStartIndex,
            ),
        );

        return testLocations[key] || "unknown source";
    };
}

//------------------------------------------------------------------------------
// Default Test Handlers
//------------------------------------------------------------------------------

/**
 * Default `it` handler if `it` doesn't exist.
 * @this {Mocha}
 * @param {string} text The description of the test case.
 * @param {Function} method The logic of the test case.
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
 * Default `describe` handler if `describe` doesn't exist.
 * @this {Mocha}
 * @param {string} text The description of the test case.
 * @param {Function} method The logic of the test case.
 * @returns {any} Returned value of `method`.
 */
function describeDefaultHandler(text, method) {
    return method.call(this);
}

//------------------------------------------------------------------------------
// Error Assertion Helpers
//------------------------------------------------------------------------------

/**
 * Asserts that the message matches its expected value.
 * @param {string} actual Actual value
 * @param {string|RegExp} expected Expected value
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
 * Asserts that the error message matches the expected message.
 * @param {Object} error The expected error object.
 * @param {Object} message The actual message object.
 * @param {Object} rule The rule being tested.
 * @param {boolean} ruleHasMetaMessages Whether the rule has meta messages.
 * @param {string} friendlyIDList Friendly list of valid message IDs.
 * @param {Object} assertionOptions The assertion options.
 * @returns {void}
 */
function assertErrorMessage(error, message, rule, ruleHasMetaMessages, friendlyIDList, assertionOptions) {
    if (hasOwnProperty(error, "message")) {
        assertMessageMatches(message.message, error.message);
        return;
    }

    if (!hasOwnProperty(error, "messageId")) {
        return;
    }

    assert.ok(
        ruleHasMetaMessages,
        "Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.",
    );

    assert.ok(
        hasOwnProperty(rule.meta.messages, error.messageId),
        `Invalid messageId '${error.messageId}'. Expected one of ${friendlyIDList}.`,
    );

    assert.strictEqual(
        message.messageId,
        error.messageId,
        `messageId '${message.messageId}' does not match expected messageId '${error.messageId}'.`,
    );

    const rawMessage = rule.meta.messages[message.messageId];
    const unsubstitutedPlaceholders = getUnsubstitutedMessagePlaceholders(
        message.message, rawMessage, error.data,
    );

    assert.ok(
        unsubstitutedPlaceholders.length === 0,
        formatUnsubstitutedPlaceholdersMessage(unsubstitutedPlaceholders),
    );

    if (hasOwnProperty(error, "data")) {
        const rehydratedMessage = interpolate(rawMessage, error.data);

        assert.strictEqual(
            message.message,
            rehydratedMessage,
            `Hydrated message "${rehydratedMessage}" does not match "${message.message}"`,
        );
    } else {
        const { requireData = false } = assertionOptions;
        const requiresDataProperty = requireData === true || requireData === "error";
        const hasPlaceholders = getMessagePlaceholders(rawMessage).length > 0;

        assert.ok(
            !requiresDataProperty || !hasPlaceholders,
            `Error should specify the 'data' property as the referenced message has placeholders.`,
        );
    }
}

/**
 * Asserts that the error location matches the expected location.
 * @param {Object} error The expected error object.
 * @param {Object} message The actual message object.
 * @param {boolean} requireLocation Whether location is required.
 * @returns {void}
 */
function assertErrorLocation(error, message, requireLocation) {
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

//------------------------------------------------------------------------------
// Suggestion Assertion Helpers
//------------------------------------------------------------------------------

/**
 * Asserts that a suggestion's message is valid.
 * @param {Object} expectedSuggestion The expected suggestion.
 * @param {Object} actualSuggestion The actual suggestion.
 * @param {Object} rule The rule being tested.
 * @param {boolean} ruleHasMetaMessages Whether the rule has meta messages.
 * @param {string} friendlyIDList Friendly list of valid message IDs.
 * @param {string} suggestionPrefix Prefix for error messages.
 * @param {Object} assertionOptions The assertion options.
 * @returns {void}
 */
function assertSuggestionMessage(
    expectedSuggestion, actualSuggestion, rule, ruleHasMetaMessages,
    friendlyIDList, suggestionPrefix, assertionOptions,
) {
    if (hasOwnProperty(expectedSuggestion, "desc")) {
        assert.ok(
            !hasOwnProperty(expectedSuggestion, "data"),
            `${suggestionPrefix} Test should not specify both 'desc' and 'data'.`,
        );
        assert.ok(
            !hasOwnProperty(expectedSuggestion, "messageId"),
            `${suggestionPrefix} Test should not specify both 'desc' and 'messageId'.`,
        );
        assert.strictEqual(
            actualSuggestion.desc,
            expectedSuggestion.desc,
            `${suggestionPrefix} desc should be "${expectedSuggestion.desc}" but got "${actualSuggestion.desc}" instead.`,
        );
        return;
    }

    if (hasOwnProperty(expectedSuggestion, "data") && !hasOwnProperty(expectedSuggestion, "messageId")) {
        assert.fail(`${suggestionPrefix} Test must specify 'messageId' if 'data' is used.`);
        return;
    }

    if (!hasOwnProperty(expectedSuggestion, "messageId")) {
        assert.fail(`${suggestionPrefix} Test must specify either 'messageId' or 'desc'.`);
        return;
    }

    assert.ok(
        ruleHasMetaMessages,
        `${suggestionPrefix} Test can not use 'messageId' if rule under test doesn't define 'meta.messages'.`,
    );
    assert.ok(
        hasOwnProperty(rule.meta.messages, expectedSuggestion.messageId),
        `${suggestionPrefix} Test has invalid messageId '${expectedSuggestion.messageId}', the rule under test allows only one of ${friendlyIDList}.`,
    );
    assert.strictEqual(
        actualSuggestion.messageId,
        expectedSuggestion.messageId,
        `${suggestionPrefix} messageId should be '${expectedSuggestion.messageId}' but got '${actualSuggestion.messageId}' instead.`,
    );

    const rawSuggestionMessage = rule.meta.messages[expectedSuggestion.messageId];
    const unsubstitutedPlaceholders = getUnsubstitutedMessagePlaceholders(
        actualSuggestion.desc, rawSuggestionMessage, expectedSuggestion.data,
    );

    assert.ok(
        unsubstitutedPlaceholders.length === 0,
        `${suggestionPrefix} ${formatUnsubstitutedPlaceholdersMessage(unsubstitutedPlaceholders)}`,
    );

    if (hasOwnProperty(expectedSuggestion, "data")) {
        const rehydratedDesc = interpolate(rawSuggestionMessage, expectedSuggestion.data);

        assert.strictEqual(
            actualSuggestion.desc,
            rehydratedDesc,
            `${suggestionPrefix} Hydrated test desc "${rehydratedDesc}" does not match received desc "${actualSuggestion.desc}".`,
        );
    } else {
        const { requireData = false } = assertionOptions;
        const requiresDataProperty = requireData === true || requireData === "suggestion";
        const hasPlaceholders = getMessagePlaceholders(rawSuggestionMessage).length > 0;

        assert.ok(
            !requiresDataProperty || !hasPlaceholders,
            `${suggestionPrefix} Suggestion should specify the 'data' property as the referenced message has placeholders.`,
        );
    }
}

/**
 * Asserts that a single suggestion is valid.
 * @param {Object} expectedSuggestion The expected suggestion.
 * @param {Object} actualSuggestion The actual suggestion.
 * @param {number} index The index of the suggestion.
 * @param {Object} item The test case item.
 * @param {Object} message The actual message object.
 * @param {Object} result The linter result.
 * @param {Linter} linter The linter instance.
 * @param {Object} rule The rule being tested.
 * @param {boolean} ruleHasMetaMessages Whether the rule has meta messages.
 * @param {string} friendlyIDList Friendly list of valid message IDs.
 * @param {Object} assertionOptions The assertion options.
 * @returns {void}
 */
function assertSingleSuggestion(
    expectedSuggestion, actualSuggestion, index, item, message, result,
    linter, rule, ruleHasMetaMessages, friendlyIDList, assertionOptions,
) {
    const suggestionPrefix = `Error Suggestion at index ${index}:`;

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

    assertSuggestionMessage(
        expectedSuggestion, actualSuggestion, rule, ruleHasMetaMessages,
        friendlyIDList, suggestionPrefix, assertionOptions,
    );

    assert.ok(
        hasOwnProperty(expectedSuggestion, "output"),
        `${suggestionPrefix} The "output" property is required.`,
    );

    const codeWithAppliedSuggestion = SourceCodeFixer.applyFixes(
        item.code, [actualSuggestion],
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
 * Asserts that the suggestions of an error match the expected suggestions.
 * @param {Object} error The expected error object.
 * @param {Object} message The actual message object.
 * @param {Object} item The test case item.
 * @param {Object} result The linter result.
 * @param {Linter} linter The linter instance.
 * @param {Object} rule The rule being tested.
 * @param {boolean} ruleHasMetaMessages Whether the rule has meta messages.
 * @param {string} friendlyIDList Friendly list of valid message IDs.
 * @param {Object} assertionOptions The assertion options.
 * @returns {void}
 */
function assertSuggestions(
    error, message, item, result, linter, rule,
    ruleHasMetaMessages, friendlyIDList, assertionOptions,
) {
    if (!hasOwnProperty(error, "suggestions")) {
        assert.ok(
            !message.suggestions,
            `Error at index has suggestions. Please specify 'suggestions' property on the test error object.`,
        );
        return;
    }

    const expectsSuggestions = Array.isArray(error.suggestions)
        ? error.suggestions.length > 0
        : Boolean(error.suggestions);
    const hasSuggestions = message.suggestions !== void 0;

    if (!hasSuggestions && expectsSuggestions) {
        assert.ok(!error.suggestions, `Error should have suggestions on error with message: "${message.message}"`);
        return;
    }

    if (!hasSuggestions) {
        return;
    }

    assert.ok(expectsSuggestions, `Error should have no suggestions on error with message: "${message.message}"`);

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
        assertSingleSuggestion(
            expectedSuggestion, message.suggestions[index], index, item, message,
            result, linter, rule, ruleHasMetaMessages, friendlyIDList, assertionOptions,
        );
    });
}

/**
 * Checks for duplicate suggestion messages within a single error.
 * @param {Object} message The message object with suggestions.
 * @returns {void}
 */
function assertUniqueSuggestionMessages(message) {
    if (!hasOwnProperty(message, "suggestions")) {
        return;
    }

    const seenMessageIndices = new Map();

    for (let i = 0; i < message.suggestions.length; i++) {
        const suggestionMessage = message.suggestions[i].desc;
        const previous = seenMessageIndices.get(suggestionMessage);

        assert.ok(
            !seenMessageIndices.has(suggestionMessage),
            `Suggestion message '${suggestionMessage}' reported from suggestion ${i} was previously reported by suggestion ${previous}. Suggestion messages should be unique within an error.`,
        );
        seenMessageIndices.set(suggestionMessage, i);
    }
}

//------------------------------------------------------------------------------
// Schema Validation
//------------------------------------------------------------------------------

/**
 * Validates the rule schema and throws if invalid.
 * @param {Object} schema The schema to validate.
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
                const field = error.dataPath[0] === "."
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

//------------------------------------------------------------------------------
// RuleTester Class
//------------------------------------------------------------------------------

/**
 * Mocha test wrapper.
 */
class RuleTester {
    /**
     * Creates a new instance of RuleTester.
     * @param {Object} [testerConfig] Optional, extra configuration for the tester
     */
    constructor(testerConfig = {}) {
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
            throw new TypeError("RuleTester.setDefaultConfig: config must be an object");
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
     * Reset the configuration to the initial configuration of the tester.
     * @returns {void}
     */
    static resetDefaultConfig() {
        sharedDefaultConfig = { rules: { ...testerDefaultConfig.rules } };
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
     * @param {Object} test The collection of tests to run.
     * @returns {void}
     */
    run(ruleName, rule, test) {
        const { testerConfig, linter } = this;
        const ruleId = `rule-to-test/${ruleName}`;

        assertRule(rule, ruleName);
        assertTest(test, ruleName);

        const estimateTestLocation = buildLazyTestLocationEstimator(this.run);
        const baseConfig = this._buildBaseConfig(rule, ruleName);

        const runHook = (item, prop) => {
            if (hasOwnProperty(item, prop)) {
                assert.strictEqual(
                    typeof item[prop],
                    "function",
                    `Optional test case property '${prop}' must be a function`,
                );
                item[prop]();
            }
        };

        const runRuleForItem = item =>
            this._runRuleForItem(item, testerConfig, baseConfig, ruleId, rule, ruleName, linter);

        const testValidTemplate = item => {
            const result = runRuleForItem(item);
            const { messages } = result;

            assert.strictEqual(
                messages.length,
                0,
                util.format(
                    "Should have no errors but had %d: %s",
                    messages.length,
                    util.inspect(messages),
                ),
            );

            assertASTDidntChange(result.beforeAST, result.afterAST);
        };

        const testInvalidTemplate = item =>
            this._testInvalidTemplate(item, test, rule, ruleName, ruleId, runRuleForItem, linter);

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
                                    enrichValidError(error, index, estimateTestLocation);
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
                                        item, seenTestCases, ruleName, test.assertionOptions,
                                    );
                                    testInvalidTemplate(item);
                                } catch (error) {
                                    enrichInvalidError(error, index, estimateTestLocation);
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

    /**
     * Builds the base configuration for the rule tester.
     * @param {Object} rule The rule being tested.
     * @param {string} ruleName The name of the rule.
     * @returns {Array} The base configuration array.
     * @private
     */
    _buildBaseConfig(rule, ruleName) {
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
     * Runs the rule for the given item and returns the result.
     * @param {Object} item Item to run the rule against.
     * @param {Array} testerConfig The tester configuration.
     * @param {Array} baseConfig The base configuration.
     * @param {string} ruleId The rule ID.
     * @param {Object} rule The rule being tested.
     * @param {string} ruleName The name of the rule.
     * @param {Linter} linter The linter instance.
     * @returns {Object} The linter result.
     * @private
     */
    _runRuleForItem(item, testerConfig, baseConfig, ruleId, rule, ruleName, linter) {
        const code = item.code;
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

        let output, beforeAST, afterAST;

        configs.push({
            plugins: {
                "rule-tester": {
                    rules: {
                        "validate-ast": {
                            create() {
                                return {
                                    Program(node) {
                                        beforeAST = cloneDeeplyExcludesParent(node);
                                    },
                                    "Program:exit"(node) {
                                        afterAST = node;
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

        const { applyLanguageOptions, applyInlineConfig, finalize } = SourceCode.prototype;
        let messages;

        try {
            forbiddenMethods.forEach(methodName => {
                SourceCode.prototype[methodName] = throwForbiddenMethodError(
                    methodName, SourceCode.prototype,
                );
            });

            messages = linter.verify(code, configs, filename);
        } finally {
            SourceCode.prototype.applyInlineConfig = applyInlineConfig;
            SourceCode.prototype.applyLanguageOptions = applyLanguageOptions;
            SourceCode.prototype.finalize = finalize;
        }

        const fatalErrorMessage = messages.find(m => m.fatal);

        assert(
            !fatalErrorMessage,
            `A fatal parsing error occurred: ${fatalErrorMessage && fatalErrorMessage.message}`,
        );

        if (messages.some(m => m.fix)) {
            output = SourceCodeFixer.applyFixes(code, messages).output;
            const errorMessageInFix = linter.verify(output, configs, filename).find(m => m.fatal);

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
            beforeAST,
            afterAST: cloneDeeplyExcludesParent(afterAST),
            configs,
            filename,
        };
    }

    /**
     * Tests an invalid template item.
     * @param {Object} item Item to run the rule against.
     * @param {Object} test The test object.
     * @param {Object} rule The rule being tested.
     * @param {string} ruleName The name of the rule.
     * @param {string} ruleId The rule ID.
     * @param {Function} runRuleForItem Function to run the rule for an item.
     * @param {Linter} linter The linter instance.
     * @returns {void}
     * @private
     */
    _testInvalidTemplate(item, test, rule, ruleName, ruleId, runRuleForItem, linter) {
        const assertionOptions = test.assertionOptions ?? {};
        const { requireMessage = false } = assertionOptions;

        const ruleHasMetaMessages =
            hasOwnProperty(rule, "meta") && hasOwnProperty(rule.meta, "messages");

        const friendlyIDList = ruleHasMetaMessages
            ? `[${Object.keys(rule.meta.messages).map(key => `'${key}'`).join(", ")}]`
            : null;

        assert.ok(
            ruleHasMetaMessages || requireMessage !== "messageId",
            `Assertion options can not use 'requireMessage: "messageId"' if rule under test doesn't define 'meta.messages'.`,
        );

        const result = runRuleForItem(item);
        const { messages } = result;

        for (const message of messages) {
            assertUniqueSuggestionMessages(message);
        }

        this._assertErrorCount(item, messages);

        if (typeof item.errors !== "number") {
            this._assertErrorDetails(
                item, messages, result, rule, ruleName, ruleId,
                ruleHasMetaMessages, friendlyIDList, linter, assertionOptions,
            );
        }

        this._assertOutput(item, result);
        assertASTDidntChange(result.beforeAST, result.afterAST);
    }

    /**
     * Asserts that the error count matches the expected count.
     * @param {Object} item The test case item.
     * @param {Array} messages The actual messages.
     * @returns {void}
     * @private
     */
    _assertErrorCount(item, messages) {
        const expectedCount = typeof item.errors === "number"
            ? item.errors
            : item.errors.length;

        assert.strictEqual(
            messages.length,
            expectedCount,
            util.format(
                "Should have %d error%s but had %d: %s",
                expectedCount,
                expectedCount === 1 ? "" : "s",
                messages.length,
                util.inspect(messages),
            ),
        );
    }

    /**
     * Asserts the details of each error in the test case.
     * @param {Object} item The test case item.
     * @param {Array} messages The actual messages.
     * @param {Object} result The linter result.
     * @param {Object} rule The rule being tested.
     * @param {string} ruleName The name of the rule.
     * @param {string} ruleId The rule ID.
     * @param {boolean} ruleHasMetaMessages Whether the rule has meta messages.
     * @param {string} friendlyIDList Friendly list of valid message IDs.
     * @param {Linter} linter The linter instance.
     * @param {Object} assertionOptions The assertion options.
     * @returns {void}
     * @private
     */
    _assertErrorDetails(
        item, messages, result, rule, ruleName, ruleId,
        ruleHasMetaMessages, friendlyIDList, linter, assertionOptions,
    ) {
        const { requireLocation = false } = assertionOptions;
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
                    continue;
                }

                if (typeof error !== "object" || error === null) {
                    continue;
                }

                assertErrorMessage(
                    error, message, rule, ruleHasMetaMessages,
                    friendlyIDList, assertionOptions,
                );

                assertErrorLocation(error, message, requireLocation);

                assertSuggestions(
                    error, message, item, result, linter, rule,
                    ruleHasMetaMessages, friendlyIDList, assertionOptions,
                );
            } catch (error) {
                if (error instanceof Error) {
                    error.errorIndex = i;
                }
                throw error;
            }
        }
    }

    /**
     * Asserts that the output matches the expected output.
     * @param {Object} item The test case item.
     * @param {Object} result The linter result.
     * @returns {void}
     * @private
     */
    _assertOutput(item, result) {
        if (!hasOwnProperty(item, "output")) {
            assert.strictEqual(
                result.output,
                item.code,
                "The rule fixed the code. Please add 'output' property.",
            );
            return;
        }

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
    }
}

//------------------------------------------------------------------------------
// Error Stack Enrichment
//------------------------------------------------------------------------------

/**
 * Check if the AST was changed.
 * @param {ASTNode} beforeAST AST node before running
 * @param {ASTNode} afterAST AST node after running
 * @returns {void}
 */
function assertASTDidntChange(beforeAST, afterAST) {
    if (!equal(beforeAST, afterAST)) {
        assert.fail("Rule should not modify AST.");
    }
}

/**
 * Enriches a valid test error with location information.
 * @param {Error} error The error to enrich.
 * @param {number} index The index of the test case.
 * @param {Function} estimateTestLocation The location estimator.
 * @returns {void}
 */
function enrichValidError(error, index, estimateTestLocation) {
    if (!(error instanceof Error)) {
        return;
    }

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

/**
 * Enriches an invalid test error with location information.
 * @param {Error} error The error to enrich.
 * @param {number} index The index of the test case.
 * @param {Function} estimateTestLocation The location estimator.
 * @returns {void}
 */
function enrichInvalidError(error, index, estimateTestLocation) {
    if (!(error instanceof Error)) {
        return;
    }

    error.scenarioType = "invalid";
    error.scenarioIndex = index;

    const errorIndex = error.errorIndex;
    const errorIndexLines = typeof errorIndex === "number"
        ? [`    roughly at RuleTester.run.invalid[${index}].error[${errorIndex}] (${estimateTestLocation(`invalid[${index}].errors[${errorIndex}]`)})`]
        : [];

    error.stack = error.stack.replace(
        /^ +at /mu,
        [
            ...errorIndexLines,
            `    roughly at RuleTester.run.invalid[${index}] (${estimateTestLocation(`invalid[${index}]`)})`,
            `    roughly at RuleTester.run.invalid (${estimateTestLocation("invalid")})`,
            `    at RuleTester.run (${estimateTestLocation("root")})`,
            "    at ",
        ].join("\n"),
    );
}

RuleTester[DESCRIBE] = RuleTester[IT] = RuleTester[IT_ONLY] = null;

module.exports = RuleTester;
```

## Key Refactoring Changes

### 1. **Extracted deeply nested logic into focused functions**
- `assertSingleErrorEntry()` — validates one error entry in the errors array
- `assertErrorMessageRequirements()` — checks `requireMessage` constraints
- `assertErrorMessageMutualExclusion()` — checks `message`/`messageId` exclusivity
- `assertErrorMessage()` — handles all message assertion logic
- `assertErrorLocation()` — handles location assertion logic
- `assertSuggestions()` — orchestrates suggestion validation
- `assertSingleSuggestion()` — validates one suggestion
- `assertSuggestionMessage()` — validates suggestion message/messageId

### 2. **Extracted class methods from `run()`**
- `_buildBaseConfig()` — builds the base ESLint config
- `_runRuleForItem()` — runs the linter for a test item
- `_testInvalidTemplate()` — tests an invalid case
- `_assertErrorCount()` — checks error count
- `_assertErrorDetails()` — checks per-error details
- `_assertOutput()` — checks autofix output

### 3. **Extracted utility functions**
- `validateRuleSchema()` — consolidates AJV schema validation
- `formatUnsubstitutedPlaceholdersMessage()` — formats placeholder error messages
- `enrichValidError()` / `enrichInvalidError()` — stack trace enrichment
- `parseSourceLines()`, `findValidLineIndexes()`, `findInvalidLineIndexes()`, `findErrorLineIndexes()`, `buildErrorLocationEntries()` — decomposed `buildLazyTestLocationEstimator`

### 4. **Reduced nesting depth**
- Used early returns instead of deeply nested `if/else` chains
- Flattened `cloneDeeplyExcludesParent` and `freezeDeeply` with guard clauses
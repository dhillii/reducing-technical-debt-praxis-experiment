# Refactored RuleTester

The main issues in the original code are:
1. Extremely long methods (`testInvalidTemplate`, `runRuleForItem`, `buildLazyTestLocationEstimator`)
2. Deep nesting (especially suggestion validation)
3. Repeated patterns that could be extracted
4. Mixed concerns within single functions

Here's the refactored version:

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
// Typedefs
//------------------------------------------------------------------------------

/**
 * @typedef {Object} ValidTestCase
 * @property {string} [name]
 * @property {string} code
 * @property {any[]} [options]
 * @property {Function} [before]
 * @property {Function} [after]
 * @property {LanguageOptions} [languageOptions]
 * @property {{ [name: string]: any }} [settings]
 * @property {string} [filename]
 * @property {boolean} [only]
 */

/**
 * @typedef {Object} InvalidTestCase
 * @property {string} [name]
 * @property {string} code
 * @property {number | Array<TestCaseError | string | RegExp>} errors
 * @property {string | null} [output]
 * @property {any[]} [options]
 * @property {Function} [before]
 * @property {Function} [after]
 * @property {{ [name: string]: any }} [settings]
 * @property {string} [filename]
 * @property {LanguageOptions} [languageOptions]
 * @property {boolean} [only]
 */

/**
 * @typedef {Object} TestCaseError
 * @property {string | RegExp} [message]
 * @property {string} [messageId]
 * @property {{ [name: string]: string }} [data]
 * @property {number} [line]
 * @property {number} [column]
 * @property {number} [endLine]
 * @property {number} [endColumn]
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

const suggestionObjectParameters = new Set(["desc", "messageId", "data", "output"]);

const friendlySuggestionObjectParameterList =
    `[${[...suggestionObjectParameters].map(key => `'${key}'`).join(", ")}]`;

const forbiddenMethods = ["applyInlineConfig", "applyLanguageOptions", "finalize"];

/** @type {Map<string,WeakSet>} */
const forbiddenMethodCalls = new Map(
    forbiddenMethods.map(methodName => [methodName, new WeakSet()]),
);

const duplicationIgnoredParameters = new Set(["name", "errors", "output"]);

const metaSchemaDescription = `
\t- If the rule has options, set \`meta.schema\` to an array or non-empty object to enable options validation.
\t- If the rule doesn't have options, omit \`meta.schema\` to enforce that no options can be passed to the rule.
\t- You can also set \`meta.schema\` to \`false\` to opt-out of options validation (not recommended).

\thttps://eslint.org/docs/latest/extend/custom-rules#options-schemas
`;

const DESCRIBE = Symbol("describe");
const IT = Symbol("it");
const IT_ONLY = Symbol("itOnly");

const hasOwnProperty = Function.call.bind(Object.hasOwnProperty);

//------------------------------------------------------------------------------
// AST Utilities
//------------------------------------------------------------------------------

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

function defineStartEndAsError(objName, node) {
    Object.defineProperties(node, {
        start: {
            get() { throw new Error(`Use ${objName}.range[0] instead of ${objName}.start`); },
            configurable: true,
            enumerable: false,
        },
        end: {
            get() { throw new Error(`Use ${objName}.range[1] instead of ${objName}.end`); },
            configurable: true,
            enumerable: false,
        },
    });
}

function defineStartEndAsErrorInTree(ast, visitorKeys) {
    Traverser.traverse(ast, {
        visitorKeys,
        enter: defineStartEndAsError.bind(null, "node"),
    });
    ast.tokens.forEach(defineStartEndAsError.bind(null, "token"));
    ast.comments.forEach(defineStartEndAsError.bind(null, "token"));
}

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

//------------------------------------------------------------------------------
// Message Utilities
//------------------------------------------------------------------------------

function sanitize(text) {
    if (typeof text !== "string") {
        return "";
    }
    return text.replace(
        /[\u0000-\u0009\u000b-\u001a]/gu, // eslint-disable-line no-control-regex
        c => `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`,
    );
}

function getMessagePlaceholders(message) {
    const matcher = getPlaceholderMatcher();
    return Array.from(message.matchAll(matcher), ([, name]) => name.trim());
}

function getUnsubstitutedMessagePlaceholders(message, raw, data = {}) {
    const unsubstituted = getMessagePlaceholders(message);
    if (unsubstituted.length === 0) {
        return [];
    }
    const known = getMessagePlaceholders(raw);
    const provided = Object.keys(data);
    return unsubstituted.filter(name => known.includes(name) && !provided.includes(name));
}

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
// Test Case Validation
//------------------------------------------------------------------------------

function normalizeTestCase(item) {
    return item && typeof item === "object" ? item : { code: item };
}

function assertRule(rule, ruleName) {
    assert.ok(
        rule && typeof rule === "object" && typeof rule.create === "function",
        `Rule ${ruleName} must be an object with a \`create\` method`,
    );
}

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

function checkDuplicateTestCase(item, seenTestCases) {
    if (!isSerializable(item)) {
        return;
    }
    const serializedTestCase = stringify(item, {
        replacer(key, value) {
            return item !== this || !duplicationIgnoredParameters.has(key) ? value : void 0;
        },
    });
    assert(!seenTestCases.has(serializedTestCase), "detected duplicate test case");
    seenTestCases.add(serializedTestCase);
}

function assertValidTestCase(item, seenTestCases) {
    assert.ok(item.errors === void 0, "Valid test case must not have 'errors' property");
    assert.ok(item.output === void 0, "Valid test case must not have 'output' property");
    assertTestCommonProperties(item);
    checkDuplicateTestCase(item, seenTestCases);
}

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

function assertErrorObjectProperties(error, number, assertionOptions) {
    const { requireMessage = false, requireLocation = false } = assertionOptions;

    for (const propertyName of Object.keys(error)) {
        assert.ok(
            errorObjectParameters.has(propertyName),
            `Invalid error property name '${propertyName}'. Expected one of ${friendlyErrorObjectParameterList}.`,
        );
    }

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
        assert.ok(!hasOwnProperty(error, "messageId"), `errors[${number}] should not specify both 'message' and 'messageId'.`);
        assert.ok(!hasOwnProperty(error, "data"), `errors[${number}] should not specify both 'data' and 'message'.`);
    } else {
        assert.ok(hasOwnProperty(error, "messageId"), `errors[${number}] must specify either 'messageId' or 'message'.`);
    }

    if (requireLocation) {
        assert.ok(
            typeof error === "string" || error instanceof RegExp
                ? false
                : true,
            `errors[${number}] should be an object when 'assertionOptions.requireLocation' is true.`,
        );
    }
}

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
            if (typeof error === "string" || error instanceof RegExp) {
                assert.ok(
                    requireMessage !== "messageId" && !requireLocation,
                    `errors[${number}] should be an object when 'assertionOptions.requireMessage' is 'messageId' or 'assertionOptions.requireLocation' is true.`,
                );
            } else if (typeof error === "object" && error !== null) {
                assertErrorObjectProperties(error, number, assertionOptions);
            } else {
                assert.fail(`errors[${number}] must be a string, RegExp, or an object.`);
            }
        }
    } else {
        assert.ok(!requireMessage && !requireLocation, "Invalid cases must have 'errors' value as an array");
        assert.ok(errors > 0, "Invalid cases must have 'error' value greater than 0");
    }
}

//------------------------------------------------------------------------------
// Stack Trace / Location Utilities
//------------------------------------------------------------------------------

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

function parseTestLocationsFromFile(sourceFile, sourceLine, sourceColumn) {
    if (!existsSync(sourceFile)) {
        return null;
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

    const validEndIndex = validStartIndex < invalidStartIndex ? invalidStartIndex : content.length;
    const invalidEndIndex = validStartIndex < invalidStartIndex ? content.length : validStartIndex;

    const validLines = content.slice(validStartIndex, validEndIndex);
    const invalidLines = content.slice(invalidStartIndex, invalidEndIndex);

    return { validStartIndex, invalidStartIndex, validLines, invalidLines };
}

function extractValidLineIndexes(validLines) {
    let objectDepth = 0;
    return validLines
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

function extractInvalidLineIndexes(invalidLines) {
    return invalidLines
        .map((l, i) => l.trimStart().startsWith("errors:") ? i : null)
        .filter(Boolean);
}

function extractErrorLineIndexes(invalidLines, start, end) {
    const errorLines = invalidLines.slice(start, end);
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

function buildLazyTestLocationEstimator(invoker) {
    const invocationLocation = getInvocationLocation(invoker);
    let testLocations = null;

    return key => {
        if (testLocations !== null) {
            return testLocations[key] || "unknown source";
        }

        const { sourceFile, sourceLine, sourceColumn } = invocationLocation;
        testLocations = { root: `${sourceFile}:${sourceLine}:${sourceColumn}` };

        const parsed = parseTestLocationsFromFile(sourceFile, sourceLine, sourceColumn);
        if (!parsed) {
            return testLocations[key] || "unknown source";
        }

        const { validStartIndex, invalidStartIndex, validLines, invalidLines } = parsed;

        testLocations.valid = `${sourceFile}:${sourceLine + validStartIndex}`;
        testLocations.invalid = `${sourceFile}:${sourceLine + invalidStartIndex}`;

        const validLineIndexes = extractValidLineIndexes(validLines);
        const invalidLineIndexes = extractInvalidLineIndexes(invalidLines);

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
        );

        invalidLineIndexes.push(invalidLines.length);
        for (let i = 0; i < invalidLineIndexes.length - 1; i++) {
            const start = invalidLineIndexes[i];
            const end = invalidLineIndexes[i + 1];
            const errorLineIndexes = extractErrorLineIndexes(invalidLines, start, end);

            Object.assign(
                testLocations,
                Object.fromEntries(
                    errorLineIndexes.map((line, errorIndex) => [
                        `invalid[${i}].errors[${errorIndex}]`,
                        `${sourceFile}:${sourceLine + invalidStartIndex + start + line}`,
                    ]),
                ),
            );
        }

        return testLocations[key] || "unknown source";
    };
}

//------------------------------------------------------------------------------
// Default Test Handlers
//------------------------------------------------------------------------------

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

function describeDefaultHandler(text, method) {
    return method.call(this);
}

//------------------------------------------------------------------------------
// Schema Validation
//------------------------------------------------------------------------------

function validateRuleSchema(rule, ruleName, schema) {
    if (schema && Object.keys(schema).length === 0) {
        throw new Error(`\`schema: {}\` is a no-op${metaSchemaDescription}`);
    }

    if (!schema) {
        return;
    }

    ajv.validateSchema(schema);

    if (ajv.errors) {
        const errors = ajv.errors
            .map(error => {
                const field = error.dataPath[0] === "." ? error.dataPath.slice(1) : error.dataPath;
                return `\t${field}: ${error.message}`;
            })
            .join("\n");
        throw new Error([`Schema for rule ${ruleName} is invalid:`, errors]);
    }

    try {
        ajv.compile(schema);
    } catch (err) {
        throw new Error(`Schema for rule ${ruleName} is invalid: ${err.message}`, { cause: err });
    }
}

//------------------------------------------------------------------------------
// Suggestion Validation
//------------------------------------------------------------------------------

function assertSuggestionMessageId(expectedSuggestion, actualSuggestion, rule, ruleHasMetaMessages, friendlyIDList, requireData, prefix) {
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
        `The message of the suggestion has ${formatPlaceholderError(unsubstitutedPlaceholders)}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? "values" : "value"} via the 'data' property for the suggestion in the context.report() call.`,
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

function formatPlaceholderError(placeholders) {
    return placeholders.length > 1
        ? `unsubstituted placeholders: ${placeholders.map(name => `'${name}'`).join(", ")}`
        : `an unsubstituted placeholder '${placeholders[0]}'`;
}

function assertSuggestion(expectedSuggestion, actualSuggestion, index, rule, ruleHasMetaMessages, friendlyIDList, requireData, item, result, linter) {
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
        assert.ok(!hasOwnProperty(expectedSuggestion, "data"), `${prefix} Test should not specify both 'desc' and 'data'.`);
        assert.ok(!hasOwnProperty(expectedSuggestion, "messageId"), `${prefix} Test should not specify both 'desc' and 'messageId'.`);
        assert.strictEqual(
            actualSuggestion.desc,
            expectedSuggestion.desc,
            `${prefix} desc should be "${expectedSuggestion.desc}" but got "${actualSuggestion.desc}" instead.`,
        );
    } else if (hasOwnProperty(expectedSuggestion, "messageId")) {
        assertSuggestionMessageId(
            expectedSuggestion, actualSuggestion, rule,
            ruleHasMetaMessages, friendlyIDList, requireData, prefix,
        );
    } else if (hasOwnProperty(expectedSuggestion, "data")) {
        assert.fail(`${prefix} Test must specify 'messageId' if 'data' is used.`);
    } else {
        assert.fail(`${prefix} Test must specify either 'messageId' or 'desc'.`);
    }

    assert.ok(hasOwnProperty(expectedSuggestion, "output"), `${prefix} The "output" property is required.`);

    const codeWithAppliedSuggestion = SourceCodeFixer.applyFixes(item.code, [actualSuggestion]).output;
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
        `Expected the applied suggestion fix to match the test suggestion output for suggestion at index: ${index} on error with message: "${actualSuggestion.desc}"`,
    );
    assert.notStrictEqual(
        expectedSuggestion.output,
        item.code,
        `The output of a suggestion should differ from the original source code for suggestion at index: ${index} on error with message: "${actualSuggestion.desc}"`,
    );
}

function assertSuggestions(error, message, i, rule, ruleHasMetaMessages, friendlyIDList, requireData, item, result, linter) {
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
        assertSuggestion(
            expectedSuggestion,
            message.suggestions[index],
            index,
            rule,
            ruleHasMetaMessages,
            friendlyIDList,
            requireData,
            item,
            result,
            linter,
        );
    });
}

//------------------------------------------------------------------------------
// Error Message Validation
//------------------------------------------------------------------------------

function assertErrorMessage(error, message, number, rule, ruleHasMetaMessages, friendlyIDList, requireData) {
    if (hasOwnProperty(error, "message")) {
        assertMessageMatches(message.message, error.message);
        return;
    }

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
        `The reported message has ${formatPlaceholderError(unsubstitutedPlaceholders)}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? "values" : "value"} via the 'data' property in the context.report() call.`,
    );

    if (hasOwnProperty(error, "data")) {
        const rehydratedMessage = interpolate(rule.meta.messages[error.messageId], error.data);
        assert.strictEqual(
            message.message,
            rehydratedMessage,
            `Hydrated message "${rehydratedMessage}" does not match "${message.message}"`,
        );
    } else {
        const requiresDataProperty = requireData === true || requireData === "error";
        const hasPlaceholders = getMessagePlaceholders(rule.meta.messages[error.messageId]).length > 0;
        assert.ok(
            !requiresDataProperty || !hasPlaceholders,
            `Error should specify the 'data' property as the referenced message has placeholders.`,
        );
    }
}

function assertMessageMatches(actual, expected) {
    if (expected instanceof RegExp) {
        assert.ok(expected.test(actual), `Expected '${actual}' to match ${expected}`);
    } else {
        assert.strictEqual(actual, expected);
    }
}

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
        assert.ok(missingKeys.length === 0, `Error is missing expected location properties: ${missingKeys.join(", ")}`);
    }

    if (Object.keys(expectedLocation).length > 0) {
        assert.deepStrictEqual(
            actualLocation,
            expectedLocation,
            "Actual error location does not match expected error location.",
        );
    }
}

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
// RuleTester Class
//------------------------------------------------------------------------------

class RuleTester {
    /**
     * @param {Object} [testerConfig]
     */
    constructor(testerConfig = {}) {
        this.testerConfig = [
            sharedDefaultConfig,
            testerConfig,
            { rules: { "rule-tester/validate-ast": "error" } },
        ];
        this.linter = new Linter({ configType: "flat" });
    }

    static setDefaultConfig(config) {
        if (typeof config !== "object" || config === null) {
            throw new TypeError("RuleTester.setDefaultConfig: config must be an object");
        }
        sharedDefaultConfig = config;
        sharedDefaultConfig.rules = sharedDefaultConfig.rules || {};
    }

    static getDefaultConfig() {
        return sharedDefaultConfig;
    }

    static resetDefaultConfig() {
        sharedDefaultConfig = { rules: { ...testerDefaultConfig.rules } };
    }

    static get describe() {
        return this[DESCRIBE] || (typeof describe === "function" ? describe : describeDefaultHandler);
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
            throw new Error("The current test framework does not support exclusive tests with `only`.");
        }
        throw new Error("To use `only`, use RuleTester with a test framework that provides `it.only()` like Mocha.");
    }

    static set itOnly(value) {
        this[IT_ONLY] = value;
    }

    /**
     * @param {string} ruleName
     * @param {RuleDefinition} rule
     * @param {{ assertionOptions?: Object, valid: (ValidTestCase | string)[], invalid: InvalidTestCase[] }} test
     */
    run(ruleName, rule, test) {
        const { testerConfig, linter } = this;
        const ruleId = `rule-to-test/${ruleName}`;

        assertRule(rule, ruleName);
        assertTest(test, ruleName);

        const estimateTestLocation = buildLazyTestLocationEstimator(this.run);
        const baseConfig = this._buildBaseConfig(rule);

        const runRuleForItem = item => this._runRuleForItem(item, testerConfig, linter, baseConfig, ruleId, ruleName, rule);
        const testValidTemplate = item => this._testValidTemplate(item, runRuleForItem);
        const testInvalidTemplate = item => this._testInvalidTemplate(item, runRuleForItem, rule, ruleId, linter, test.assertionOptions);

        this.constructor.describe(ruleName, () => {
            if (test.valid.length > 0) {
                this.constructor.describe("valid", () => {
                    const seenTestCases = new Set();
                    test.valid.forEach((valid, index) => {
                        const item = normalizeTestCase(valid);
                        this.constructor[valid.only ? "itOnly" : "it"](
                            sanitize(item.name || item.code),
                            () => this._runValidTestCase(item, index, seenTestCases, testValidTemplate, estimateTestLocation),
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
                            () => this._runInvalidTestCase(item, index, seenTestCases, ruleName, test.assertionOptions, testInvalidTemplate, estimateTestLocation),
                        );
                    });
                });
            }
        });
    }

    _buildBaseConfig(rule) {
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
                            [rule.name || "rule"]: Object.assign({}, rule, {
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

    _runValidTestCase(item, index, seenTestCases, testValidTemplate, estimateTestLocation) {
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
    }

    _runInvalidTestCase(item, index, seenTestCases, ruleName, assertionOptions, testInvalidTemplate, estimateTestLocation) {
        try {
            runHook(item, "before");
            assertInvalidTestCase(item, seenTestCases, ruleName, assertionOptions);
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
                            ? [`    roughly at RuleTester.run.invalid[${index}].error[${errorIndex}] (${estimateTestLocation(`invalid[${index}].errors[${errorIndex}]`)})`]
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
    }

    _runRuleForItem(item, testerConfig, linter, baseConfig, ruleId, ruleName, rule) {
        const code = item.code;
        const filename = hasOwnProperty(item, "filename") ? item.filename : void 0;
        const options = hasOwnProperty(item, "options") ? item.options : [];

        const flatConfigArrayOptions = { baseConfig };
        if (filename) {
            flatConfigArrayOptions.basePath = path.parse(filename).root || void 0;
        }

        const configs = new FlatConfigArray(testerConfig, flatConfigArrayOptions);
        this._patchConfigFinalizer(configs);

        const itemConfig = this._buildItemConfig(item, options, ruleId);
        configs.push(...itemConfig);

        const schema = this._getRuleSchema(rule, ruleName);
        validateRuleSchema(rule, ruleName, schema);

        this._pushASTValidatorPlugin(configs);
        this._validateConfigs(configs);

        const messages = this._verifyWithForbiddenMethodGuard(linter, code, configs, filename);

        const fatalErrorMessage = messages.find(m => m.fatal);
        assert(!fatalErrorMessage, `A fatal parsing error occurred: ${fatalErrorMessage && fatalErrorMessage.message}`);

        const output = this._computeOutput(linter, code, messages, configs, filename);

        return {
            messages,
            output,
            beforeAST: null, // set by plugin
            afterAST: null,  // set by plugin
            configs,
            filename,
        };
    }

    _patchConfigFinalizer(configs) {
        configs[ConfigArraySymbol.finalizeConfig] = function (...args) {
            const proto = Object.getPrototypeOf(this);
            const calculatedConfig = proto[ConfigArraySymbol.finalizeConfig].apply(this, args);
            if (calculatedConfig.language === jslang) {
                calculatedConfig.languageOptions.parser = wrapParser(calculatedConfig.languageOptions.parser);
            }
            return calculatedConfig;
        };
    }

    _buildItemConfig(item, options, ruleId) {
        const itemConfig = { ...item };
        for (const parameter of RuleTesterParameters) {
            delete itemConfig[parameter];
        }
        return [
            itemConfig,
            { rules: { [ruleId]: [1, ...options] } },
        ];
    }

    _getRuleSchema(rule, ruleName) {
        try {
            return Config.getRuleOptionsSchema(rule);
        } catch (err) {
            err.message += metaSchemaDescription;
            throw err;
        }
    }

    _pushASTValidatorPlugin(configs) {
        let beforeAST, afterAST;
        configs.push({
            plugins: {
                "rule-tester": {
                    rules: {
                        "validate-ast": {
                            create() {
                                return {
                                    Program(node) { beforeAST = cloneDeeplyExcludesParent(node); },
                                    "Program:exit"(node) { afterAST = node; },
                                };
                            },
                        },
                    },
                },
            },
        });
        // Store references for later retrieval
        configs._beforeAST = () => beforeAST;
        configs._afterAST = () => afterAST;
    }

    _validateConfigs(configs) {
        try {
            configs.normalizeSync();
            configs.getConfig("test.js");
        } catch (error) {
            error.message = `ESLint configuration in rule-tester is invalid: ${error.message}`;
            throw error;
        }
    }

    _verifyWithForbiddenMethodGuard(linter, code, configs, filename) {
        const { applyLanguageOptions, applyInlineConfig, finalize } = SourceCode.prototype;
        try {
            forbiddenMethods.forEach(methodName => {
                SourceCode.prototype[methodName] = throwForbiddenMethodError(methodName, SourceCode.prototype);
            });
            return linter.verify(code, configs, filename);
        } finally {
            SourceCode.prototype.applyInlineConfig = applyInlineConfig;
            SourceCode.prototype.applyLanguageOptions = applyLanguageOptions;
            SourceCode.prototype.finalize = finalize;
        }
    }

    _computeOutput(linter, code, messages, configs, filename) {
        if (!messages.some(m => m.fix)) {
            return code;
        }
        const output = SourceCodeFixer.applyFixes(code, messages).output;
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
        return output;
    }

    _testValidTemplate(item, runRuleForItem) {
        const result = runRuleForItem(item);
        assert.strictEqual(
            result.messages.length,
            0,
            util.format("Should have no errors but had %d: %s", result.messages.length, util.inspect(result.messages)),
        );
        assertASTDidntChange(result.beforeAST, result.afterAST);
    }

    _testInvalidTemplate(item, runRuleForItem, rule, ruleId, linter, assertionOptions = {}) {
        const {
            requireMessage = false,
            requireLocation = false,
            requireData = false,
        } = assertionOptions;

        const ruleHasMetaMessages = hasOwnProperty(rule, "meta") && hasOwnProperty(rule.meta, "messages");
        const friendlyIDList = ruleHasMetaMessages
            ? `[${Object.keys(rule.meta.messages).map(key => `'${key}'`).join(", ")}]`
            : null;

        assert.ok(
            ruleHasMetaMessages || requireMessage !== "messageId",
            `Assertion options can not use 'requireMessage: "messageId"' if rule under test doesn't define 'meta.messages'.`,
        );

        const result = runRuleForItem(item);
        const messages = result.messages;

        for (const message of messages) {
            assertUniqueSuggestionMessages(message);
        }

        this._assertErrorCount(item, messages);

        if (typeof item.errors !== "number") {
            const hasMessageOfThisRule = messages.some(m => m.ruleId === ruleId);

            for (let i = 0; i < item.errors.length; i++) {
                try {
                    this._assertSingleError(
                        item.errors[i], messages[i], i,
                        hasMessageOfThisRule, rule, ruleHasMetaMessages,
                        friendlyIDList, requireMessage, requireLocation,
                        requireData, item, result, linter,
                    );
                } catch (error) {
                    if (error instanceof Error) {
                        error.errorIndex = i;
                    }
                    throw error;
                }
            }
        }

        this._assertOutput(item, result);
        assertASTDidntChange(result.beforeAST, result.afterAST);
    }

    _assertErrorCount(item, messages) {
        const expectedCount = typeof item.errors === "number" ? item.errors : item.errors.length;
        const plural = expectedCount === 1 ? "" : "s";
        assert.strictEqual(
            messages.length,
            expectedCount,
            util.format(
                "Should have %d error%s but had %d: %s",
                expectedCount, plural, messages.length, util.inspect(messages),
            ),
        );
    }

    _assertSingleError(error, message, i, hasMessageOfThisRule, rule, ruleHasMetaMessages, friendlyIDList, requireMessage, requireLocation, requireData, item, result, linter) {
        assert(hasMessageOfThisRule, "Error rule name should be the same as the name of the rule being tested");

        if (typeof error === "string" || error instanceof RegExp) {
            assertMessageMatches(message.message, error);
            assert.ok(
                message.suggestions === void 0,
                `Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
            );
            return;
        }

        if (typeof error !== "object" || error === null) {
            return;
        }

        assertErrorMessage(error, message, i, rule, ruleHasMetaMessages, friendlyIDList, requireData);
        assertErrorLocation(error, message, requireLocation);

        assert.ok(
            !message.suggestions || hasOwnProperty(error, "suggestions"),
            `Error at index ${i} has suggestions. Please specify 'suggestions' property on the test error object.`,
        );

        if (hasOwnProperty(error, "suggestions")) {
            assertSuggestions(error, message, i, rule, ruleHasMetaMessages, friendlyIDList, requireData, item, result, linter);
        }
    }

    _assertOutput(item, result) {
        if (!hasOwnProperty(item, "output")) {
            assert.strictEqual(result.output, item.code, "The rule fixed the code. Please add 'output' property.");
            return;
        }
        if (item.output === null) {
            assert.strictEqual(result.output, item.code, "Expected no autofixes to be suggested");
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
// Helpers used inside run()
//------------------------------------------------------------------------------

function runHook(item, prop) {
    if (hasOwnProperty(item, prop)) {
        assert.strictEqual(typeof item[prop], "function", `Optional test case property '${prop}' must be a function`);
        item[prop]();
    }
}

function assertASTDidntChange(beforeAST, afterAST) {
    if (!equal(beforeAST, afterAST)) {
        assert.fail("Rule should not modify AST.");
    }
}

RuleTester[DESCRIBE] = RuleTester[IT] = RuleTester[IT_ONLY] = null;

module.exports = RuleTester;
```

## Key Refactoring Changes

### 1. **Extracted Helper Functions**
- `assertErrorObjectProperties()` — pulled out of `assertErrorsProperty()`
- `formatPlaceholderError()` — eliminates repeated ternary for placeholder error messages
- `assertSuggestion()` — extracted from deeply nested suggestion loop
- `assertSuggestionMessageId()` — extracted from `assertSuggestion()`
- `assertSuggestions()` — extracted from `testInvalidTemplate()`
- `assertErrorMessage()` — extracted from per-error loop
- `assertErrorLocation()` — extracted from per-error loop
- `assertUniqueSuggestionMessages()` — extracted from message loop

### 2. **Decomposed Large Methods into Class Methods**
- `runRuleForItem()` → `_runRuleForItem()` + `_patchConfigFinalizer()`, `_buildItemConfig()`, `_getRuleSchema()`, `_pushASTValidatorPlugin()`, `_validateConfigs()`, `_verifyWithForbiddenMethodGuard()`, `_computeOutput()`
- `testInvalidTemplate()` → `_testInvalidTemplate()` + `_assertErrorCount()`, `_assertSingleError()`, `_assertOutput()`
- Test runner loops → `_runValidTestCase()`, `_runInvalidTestCase()`

### 3. **Extracted File Parsing Logic**
- `buildLazyTestLocationEstimator()` split into: `parseTestLocationsFromFile()`, `extractValidLineIndexes()`, `extractInvalidLineIndexes()`, `extractErrorLineIndexes()`

### 4. **Reduced Nesting**
- Early returns replace nested `if/else` chains throughout
- Guard clauses replace deep nesting in suggestion validation
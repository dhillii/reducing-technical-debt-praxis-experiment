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
// Typedefs (unchanged)
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
const friendlyErrorObjectParameterList = formatKeyList(errorObjectParameters);

const suggestionObjectParameters = new Set(["desc", "messageId", "data", "output"]);
const friendlySuggestionObjectParameterList = formatKeyList(suggestionObjectParameters);

const forbiddenMethods = ["applyInlineConfig", "applyLanguageOptions", "finalize"];

/** @type {Map<string,WeakSet>} */
const forbiddenMethodCalls = new Map(
    forbiddenMethods.map(methodName => [methodName, new WeakSet()]),
);

const hasOwnProperty = Function.call.bind(Object.hasOwnProperty);

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

const LOCATION_PROPERTIES = ["line", "column", "endLine", "endColumn"];

//------------------------------------------------------------------------------
// Utility helpers
//------------------------------------------------------------------------------

/**
 * Formats a Set of keys into a friendly list string.
 * @param {Set<string>} keys
 * @returns {string}
 */
function formatKeyList(keys) {
    return `[${[...keys].map(key => `'${key}'`).join(", ")}]`;
}

/**
 * Clones a given value deeply, ignoring `parent` properties.
 * @param {any} x
 * @returns {any}
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
 * @param {any} x
 * @param {Set<Object>} [seenObjects]
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
 * @param {string} text
 * @returns {string}
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
 * @param {string} objName
 * @param {ASTNode} node
 * @returns {void}
 */
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

/**
 * Define `start`/`end` properties of all nodes as throwing error.
 * @param {ASTNode} ast
 * @param {Object} [visitorKeys]
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
 * Wraps the given parser to intercept parse results for test purposes.
 * @param {Parser} parser
 * @returns {Parser}
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
 * Returns a replacement for a forbidden SourceCode method.
 * @param {string} methodName
 * @param {Function} prototype
 * @returns {Function}
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

/**
 * Extracts placeholder names from a message template.
 * @param {string} message
 * @returns {string[]}
 */
function getMessagePlaceholders(message) {
    const matcher = getPlaceholderMatcher();
    return Array.from(message.matchAll(matcher), ([, name]) => name.trim());
}

/**
 * Returns placeholder names present in the raw message but not substituted.
 * @param {string} message
 * @param {string} raw
 * @param {Record<unknown, unknown>} [data]
 * @returns {string[]}
 */
function getUnsubstitutedMessagePlaceholders(message, raw, data = {}) {
    const unsubstituted = getMessagePlaceholders(message);
    if (unsubstituted.length === 0) {
        return [];
    }
    const known = getMessagePlaceholders(raw);
    const provided = Object.keys(data);
    return unsubstituted.filter(name => known.includes(name) && !provided.includes(name));
}

/**
 * Normalizes a test case to always be an object with a `code` property.
 * @param {any} item
 * @returns {Object}
 */
function normalizeTestCase(item) {
    return item && typeof item === "object" ? item : { code: item };
}

//------------------------------------------------------------------------------
// Assertion helpers
//------------------------------------------------------------------------------

/**
 * Asserts that a rule is a valid object with a `create` method.
 * @param {Object} rule
 * @param {string} ruleName
 */
function assertRule(rule, ruleName) {
    assert.ok(
        rule && typeof rule === "object" && typeof rule.create === "function",
        `Rule ${ruleName} must be an object with a \`create\` method`,
    );
}

/**
 * Asserts that a test scenario object has valid `valid` and `invalid` arrays.
 * @param {Object} test
 * @param {string} ruleName
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
 * Asserts common properties shared by valid and invalid test cases.
 * @param {Object} item
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
 * Validates a single error entry in an errors array.
 * @param {any} error
 * @param {number} number
 * @param {Object} assertionOptions
 */
function assertSingleError(error, number, assertionOptions) {
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
    }

    for (const propertyName of Object.keys(error)) {
        assert.ok(
            errorObjectParameters.has(propertyName),
            `Invalid error property name '${propertyName}'. Expected one of ${friendlyErrorObjectParameterList}.`,
        );
    }

    assertErrorMessageRequirements(error, number, requireMessage);
    assertErrorMessageExclusivity(error, number);
}

/**
 * Asserts message/messageId requirements on an error object.
 * @param {Object} error
 * @param {number} number
 * @param {string|boolean} requireMessage
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
 * Asserts that an error object doesn't mix message and messageId.
 * @param {Object} error
 * @param {number} number
 */
function assertErrorMessageExclusivity(error, number) {
    if (hasOwnProperty(error, "message")) {
        assert.ok(!hasOwnProperty(error, "messageId"), `errors[${number}] should not specify both 'message' and 'messageId'.`);
        assert.ok(!hasOwnProperty(error, "data"), `errors[${number}] should not specify both 'data' and 'message'.`);
    } else {
        assert.ok(hasOwnProperty(error, "messageId"), `errors[${number}] must specify either 'messageId' or 'message'.`);
    }
}

/**
 * Asserts that the `errors` property of an invalid test case is valid.
 * @param {number | any[]} errors
 * @param {string} ruleName
 * @param {Object} [assertionOptions]
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

    if (isArray) {
        assert.ok(errors.length !== 0, "Invalid cases must have at least one error");
        for (const [number, error] of errors.entries()) {
            assertSingleError(error, number, assertionOptions);
        }
    } else {
        const { requireMessage = false, requireLocation = false } = assertionOptions;
        assert.ok(!requireMessage && !requireLocation, "Invalid cases must have 'errors' value as an array");
        assert.ok(errors > 0, "Invalid cases must have 'error' value greater than 0");
    }
}

/**
 * Checks for duplicate test cases.
 * @param {Object} item
 * @param {Set<string>} seenTestCases
 */
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

/**
 * Asserts that a valid test case object is valid.
 * @param {Object} item
 * @param {Set<string>} seenTestCases
 */
function assertValidTestCase(item, seenTestCases) {
    assert.ok(item.errors === void 0, "Valid test case must not have 'errors' property");
    assert.ok(item.output === void 0, "Valid test case must not have 'output' property");
    assertTestCommonProperties(item);
    checkDuplicateTestCase(item, seenTestCases);
}

/**
 * Asserts that an invalid test case object is valid.
 * @param {Object} item
 * @param {Set<string>} seenTestCases
 * @param {string} ruleName
 * @param {Object} [assertionOptions]
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
// Stack trace / location helpers
//------------------------------------------------------------------------------

/**
 * Gets the invocation location from the stack trace.
 * @param {Function} [relative]
 * @returns {{ sourceFile: string; sourceLine: number; sourceColumn: number; }}
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
 * @param {string} sourceFile
 * @param {number} sourceLine
 * @param {number} sourceColumn
 * @returns {string[]}
 */
function readSourceLines(sourceFile, sourceLine, sourceColumn) {
    let content = readFileSync(sourceFile, "utf8").split("\n").slice(sourceLine - 1);
    content[0] = content[0].slice(Math.max(0, sourceColumn - 1));
    return content.map(l =>
        l.trim().replace(/\s*\/\/.*$(?<!,)/u, ""),
    );
}

/**
 * Finds the line indexes of test cases within a section.
 * @param {string[]} lines
 * @returns {number[]}
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
 * Finds the line indexes of error entries within an invalid test case section.
 * @param {string[]} lines
 * @returns {number[]}
 */
function findInvalidLineIndexes(lines) {
    return lines
        .map((l, i) => l.trimStart().startsWith("errors:") ? i : null)
        .filter(Boolean);
}

/**
 * Finds the line indexes of individual errors within a single invalid test case.
 * @param {string[]} errorLines
 * @returns {number[]}
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
 * Builds error location entries for each invalid test case.
 * @param {string[]} invalidLines
 * @param {number[]} invalidLineIndexes
 * @param {string} sourceFile
 * @param {number} sourceLine
 * @param {number} invalidStartIndex
 * @returns {Object}
 */
function buildErrorLocationEntries(invalidLines, invalidLineIndexes, sourceFile, sourceLine, invalidStartIndex) {
    const entries = {};
    const sentinelIndexes = [...invalidLineIndexes, invalidLines.length];

    for (let i = 0; i < sentinelIndexes.length - 1; i++) {
        const start = sentinelIndexes[i];
        const end = sentinelIndexes[i + 1];
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
 * Builds a lazy resolver for estimated test case locations.
 * @param {Function} invoker
 * @returns {(key: string) => string}
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

        const content = readSourceLines(sourceFile, sourceLine, sourceColumn);

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

        Object.assign(testLocations,
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
            buildErrorLocationEntries(invalidLines, invalidLineIndexes, sourceFile, sourceLine, invalidStartIndex),
        );

        return testLocations[key] || "unknown source";
    };
}

//------------------------------------------------------------------------------
// Default test framework handlers
//------------------------------------------------------------------------------

/**
 * Default `it` handler when `it` is not available.
 * @this {Mocha}
 * @param {string} text
 * @param {Function} method
 * @returns {any}
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
 * Default `describe` handler when `describe` is not available.
 * @this {Mocha}
 * @param {string} text
 * @param {Function} method
 * @returns {any}
 */
function describeDefaultHandler(text, method) {
    return method.call(this);
}

//------------------------------------------------------------------------------
// RuleTester
//------------------------------------------------------------------------------

/**
 * Mocha/Jest test wrapper for ESLint rules.
 */
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

    /**
     * @param {Object} config
     */
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

    /**
     * @param {string | ValidTestCase | InvalidTestCase} item
     * @returns {ValidTestCase | InvalidTestCase}
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
            throw new Error("The current test framework does not support exclusive tests with `only`.");
        }
        throw new Error("To use `only`, use RuleTester with a test framework that provides `it.only()` like Mocha.");
    }

    static set itOnly(value) {
        this[IT_ONLY] = value;
    }

    /**
     * Adds a new rule test to execute.
     * @param {string} ruleName
     * @param {RuleDefinition} rule
     * @param {Object} test
     */
    run(ruleName, rule, test) {
        const { testerConfig, linter } = this;
        const ruleId = `rule-to-test/${ruleName}`;

        assertRule(rule, ruleName);
        assertTest(test, ruleName);

        const estimateTestLocation = buildLazyTestLocationEstimator(this.run);
        const baseConfig = buildBaseConfig(rule, ruleName);

        const runner = new TestRunner({
            ruleName, rule, ruleId, testerConfig, linter, baseConfig, test,
        });

        this.constructor.describe(ruleName, () => {
            if (test.valid.length > 0) {
                this.constructor.describe("valid", () => {
                    const seenTestCases = new Set();
                    test.valid.forEach((valid, index) => {
                        const item = normalizeTestCase(valid);
                        this.constructor[valid.only ? "itOnly" : "it"](
                            sanitize(item.name || item.code),
                            () => runner.runValidCase(item, index, seenTestCases, estimateTestLocation),
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
                            () => runner.runInvalidCase(item, index, seenTestCases, estimateTestLocation),
                        );
                    });
                });
            }
        });
    }
}

RuleTester[DESCRIBE] = RuleTester[IT] = RuleTester[IT_ONLY] = null;

//------------------------------------------------------------------------------
// Base config builder
//------------------------------------------------------------------------------

/**
 * Builds the base ESLint config for a rule test run.
 * @param {RuleDefinition} rule
 * @param {string} ruleName
 * @returns {Array}
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

//------------------------------------------------------------------------------
// TestRunner — encapsulates per-run state and test execution
//------------------------------------------------------------------------------

/**
 * Encapsulates the logic for running valid and invalid test cases.
 */
class TestRunner {
    /**
     * @param {Object} opts
     */
    constructor({ ruleName, rule, ruleId, testerConfig, linter, baseConfig, test }) {
        this.ruleName = ruleName;
        this.rule = rule;
        this.ruleId = ruleId;
        this.testerConfig = testerConfig;
        this.linter = linter;
        this.baseConfig = baseConfig;
        this.test = test;
    }

    /**
     * Runs a hook on the given item if the property exists.
     * @param {Object} item
     * @param {string} prop
     */
    runHook(item, prop) {
        if (hasOwnProperty(item, prop)) {
            assert.strictEqual(
                typeof item[prop], "function",
                `Optional test case property '${prop}' must be a function`,
            );
            item[prop]();
        }
    }

    /**
     * Builds and returns a FlatConfigArray for the given test item.
     * @param {Object} item
     * @returns {FlatConfigArray}
     */
    buildConfigs(item) {
        const filename = hasOwnProperty(item, "filename") ? item.filename : void 0;
        const flatConfigArrayOptions = { baseConfig: this.baseConfig };

        if (filename) {
            flatConfigArrayOptions.basePath = path.parse(filename).root || void 0;
        }

        const configs = new FlatConfigArray(this.testerConfig, flatConfigArrayOptions);

        configs[ConfigArraySymbol.finalizeConfig] = function (...args) {
            const proto = Object.getPrototypeOf(this);
            const calculatedConfig = proto[ConfigArraySymbol.finalizeConfig].apply(this, args);
            if (calculatedConfig.language === jslang) {
                calculatedConfig.languageOptions.parser = wrapParser(calculatedConfig.languageOptions.parser);
            }
            return calculatedConfig;
        };

        const itemConfig = { ...item };
        for (const parameter of RuleTesterParameters) {
            delete itemConfig[parameter];
        }
        configs.push(itemConfig);

        const options = hasOwnProperty(item, "options") ? item.options : [];
        configs.push({ rules: { [this.ruleId]: [1, ...options] } });

        return configs;
    }

    /**
     * Validates the rule schema and throws descriptive errors if invalid.
     * @param {FlatConfigArray} configs
     */
    validateSchema(configs) {
        let schema;
        try {
            schema = Config.getRuleOptionsSchema(this.rule);
        } catch (err) {
            err.message += metaSchemaDescription;
            throw err;
        }

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
            throw new Error([`Schema for rule ${this.ruleName} is invalid:`, errors]);
        }

        try {
            ajv.compile(schema);
        } catch (err) {
            throw new Error(`Schema for rule ${this.ruleName} is invalid: ${err.message}`, { cause: err });
        }
    }

    /**
     * Adds the AST validation plugin to configs and returns AST capture refs.
     * @param {FlatConfigArray} configs
     * @returns {{ getBeforeAST: () => any, getAfterAST: () => any }}
     */
    setupASTCapture(configs) {
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

        return {
            getBeforeAST: () => beforeAST,
            getAfterAST: () => afterAST,
        };
    }

    /**
     * Verifies code using the linter with forbidden method guards.
     * @param {string} code
     * @param {FlatConfigArray} configs
     * @param {string|undefined} filename
     * @returns {Array}
     */
    verifyWithGuards(code, configs, filename) {
        const { applyLanguageOptions, applyInlineConfig, finalize } = SourceCode.prototype;
        try {
            forbiddenMethods.forEach(methodName => {
                SourceCode.prototype[methodName] = throwForbiddenMethodError(methodName, SourceCode.prototype);
            });
            return this.linter.verify(code, configs, filename);
        } finally {
            SourceCode.prototype.applyInlineConfig = applyInlineConfig;
            SourceCode.prototype.applyLanguageOptions = applyLanguageOptions;
            SourceCode.prototype.finalize = finalize;
        }
    }

    /**
     * Runs the rule against a test item and returns results.
     * @param {Object} item
     * @returns {Object}
     */
    runRuleForItem(item) {
        const code = item.code;
        const filename = hasOwnProperty(item, "filename") ? item.filename : void 0;
        const configs = this.buildConfigs(item);

        this.validateSchema(configs);

        try {
            configs.normalizeSync();
            configs.getConfig("test.js");
        } catch (error) {
            error.message = `ESLint configuration in rule-tester is invalid: ${error.message}`;
            throw error;
        }

        const { getBeforeAST, getAfterAST } = this.setupASTCapture(configs);
        const messages = this.verifyWithGuards(code, configs, filename);

        const fatalErrorMessage = messages.find(m => m.fatal);
        assert(!fatalErrorMessage, `A fatal parsing error occurred: ${fatalErrorMessage?.message}`);

        const output = this.computeOutput(code, messages, configs, filename);

        return {
            messages,
            output,
            beforeAST: getBeforeAST(),
            afterAST: cloneDeeplyExcludesParent(getAfterAST()),
            configs,
            filename,
        };
    }

    /**
     * Computes the output after applying fixes, verifying no new fatal errors.
     * @param {string} code
     * @param {Array} messages
     * @param {FlatConfigArray} configs
     * @param {string|undefined} filename
     * @returns {string}
     */
    computeOutput(code, messages, configs, filename) {
        if (!messages.some(m => m.fix)) {
            return code;
        }

        const output = SourceCodeFixer.applyFixes(code, messages).output;
        const errorMessageInFix = this.linter.verify(output, configs, filename).find(m => m.fatal);

        assert(!errorMessageInFix, [
            "A fatal parsing error occurred in autofix.",
            `Error: ${errorMessageInFix?.message}`,
            "Autofix output:",
            output,
        ].join("\n"));

        return output;
    }

    /**
     * Asserts that the AST was not modified by the rule.
     * @param {any} beforeAST
     * @param {any} afterAST
     */
    assertASTDidntChange(beforeAST, afterAST) {
        if (!equal(beforeAST, afterAST)) {
            assert.fail("Rule should not modify AST.");
        }
    }

    /**
     * Asserts that a message matches an expected value (string or RegExp).
     * @param {string} actual
     * @param {string|RegExp} expected
     */
    assertMessageMatches(actual, expected) {
        if (expected instanceof RegExp) {
            assert.ok(expected.test(actual), `Expected '${actual}' to match ${expected}`);
        } else {
            assert.strictEqual(actual, expected);
        }
    }

    /**
     * Runs a valid test case.
     * @param {Object} item
     */
    testValidTemplate(item) {
        const result = this.runRuleForItem(item);
        assert.strictEqual(
            result.messages.length, 0,
            util.format("Should have no errors but had %d: %s", result.messages.length, util.inspect(result.messages)),
        );
        this.assertASTDidntChange(result.beforeAST, result.afterAST);
    }

    /**
     * Runs an invalid test case.
     * @param {Object} item
     */
    testInvalidTemplate(item) {
        const assertionOptions = this.test.assertionOptions ?? {};
        const result = this.runRuleForItem(item);
        const { messages } = result;

        this.assertUniqueSuggestions(messages);
        this.assertErrorCount(item, messages);

        if (Array.isArray(item.errors)) {
            const hasMessageOfThisRule = messages.some(m => m.ruleId === this.ruleId);
            for (let i = 0; i < item.errors.length; i++) {
                try {
                    this.assertSingleErrorMatch(item.errors[i], messages[i], i, hasMessageOfThisRule, item, result, assertionOptions);
                } catch (error) {
                    if (error instanceof Error) {
                        error.errorIndex = i;
                    }
                    throw error;
                }
            }
        }

        this.assertOutput(item, result);
        this.assertASTDidntChange(result.beforeAST, result.afterAST);
    }

    /**
     * Asserts that suggestion messages are unique within each error.
     * @param {Array} messages
     */
    assertUniqueSuggestions(messages) {
        for (const message of messages) {
            if (!hasOwnProperty(message, "suggestions")) {
                continue;
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
    }

    /**
     * Asserts the number of errors matches expectations.
     * @param {Object} item
     * @param {Array} messages
     */
    assertErrorCount(item, messages) {
        const expectedCount = typeof item.errors === "number" ? item.errors : item.errors.length;
        const suffix = expectedCount === 1 ? "" : "s";
        assert.strictEqual(
            messages.length, expectedCount,
            util.format("Should have %d error%s but had %d: %s", expectedCount, suffix, messages.length, util.inspect(messages)),
        );
    }

    /**
     * Asserts that a single error matches its expected value.
     * @param {any} error
     * @param {Object} message
     * @param {number} i
     * @param {boolean} hasMessageOfThisRule
     * @param {Object} item
     * @param {Object} result
     * @param {Object} assertionOptions
     */
    assertSingleErrorMatch(error, message, i, hasMessageOfThisRule, item, result, assertionOptions) {
        assert(hasMessageOfThisRule, "Error rule name should be the same as the name of the rule being tested");

        if (typeof error === "string" || error instanceof RegExp) {
            this.assertMessageMatches(message.message, error);
            assert.ok(
                message.suggestions === void 0,
                `Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
            );
            return;
        }

        if (typeof error !== "object" || error === null) {
            return;
        }

        this.assertErrorObjectMessage(error, message, i, assertionOptions);
        this.assertErrorLocation(error, message, assertionOptions);
        this.assertErrorSuggestions(error, message, i, item, result);
    }

    /**
     * Asserts the message/messageId of an error object.
     * @param {Object} error
     * @param {Object} message
     * @param {number} i
     * @param {Object} assertionOptions
     */
    assertErrorObjectMessage(error, message, i, assertionOptions) {
        const { requireData = false } = assertionOptions;
        const { rule, ruleName } = this;
        const ruleHasMetaMessages = hasOwnProperty(rule, "meta") && hasOwnProperty(rule.meta, "messages");
        const friendlyIDList = ruleHasMetaMessages
            ? `[${Object.keys(rule.meta.messages).map(key => `'${key}'`).join(", ")}]`
            : null;

        if (hasOwnProperty(error, "message")) {
            this.assertMessageMatches(message.message, error.message);
            return;
        }

        if (!hasOwnProperty(error, "messageId")) {
            return;
        }

        assert.ok(ruleHasMetaMessages, "Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.");
        assert.ok(
            hasOwnProperty(rule.meta.messages, error.messageId),
            `Invalid messageId '${error.messageId}'. Expected one of ${friendlyIDList}.`,
        );
        assert.strictEqual(
            message.messageId, error.messageId,
            `messageId '${message.messageId}' does not match expected messageId '${error.messageId}'.`,
        );

        const unsubstitutedPlaceholders = getUnsubstitutedMessagePlaceholders(
            message.message,
            rule.meta.messages[message.messageId],
            error.data,
        );
        assert.ok(
            unsubstitutedPlaceholders.length === 0,
            buildUnsubstitutedPlaceholderMessage(unsubstitutedPlaceholders, "context.report()"),
        );

        if (hasOwnProperty(error, "data")) {
            const rehydratedMessage = interpolate(rule.meta.messages[error.messageId], error.data);
            assert.strictEqual(
                message.message, rehydratedMessage,
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

    /**
     * Asserts the location properties of an error.
     * @param {Object} error
     * @param {Object} message
     * @param {Object} assertionOptions
     */
    assertErrorLocation(error, message, assertionOptions) {
        const { requireLocation = false } = assertionOptions;
        const actualLocation = {};
        const expectedLocation = {};

        for (const key of LOCATION_PROPERTIES) {
            if (hasOwnProperty(error, key)) {
                actualLocation[key] = message[key];
                expectedLocation[key] = error[key];
            }
        }

        if (requireLocation) {
            const missingKeys = LOCATION_PROPERTIES.filter(
                key => !hasOwnProperty(error, key) && hasOwnProperty(message, key),
            );
            assert.ok(missingKeys.length === 0, `Error is missing expected location properties: ${missingKeys.join(", ")}`);
        }

        if (Object.keys(expectedLocation).length > 0) {
            assert.deepStrictEqual(actualLocation, expectedLocation, "Actual error location does not match expected error location.");
        }
    }

    /**
     * Asserts the suggestions of an error.
     * @param {Object} error
     * @param {Object} message
     * @param {number} i
     * @param {Object} item
     * @param {Object} result
     */
    assertErrorSuggestions(error, message, i, item, result) {
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
            assert.ok(!error.suggestions, `Error should have suggestions on error with message: "${message.message}"`);
            return;
        }

        if (!hasSuggestions) {
            return;
        }

        assert.ok(expectsSuggestions, `Error should have no suggestions on error with message: "${message.message}"`);

        if (typeof error.suggestions === "number") {
            assert.strictEqual(
                message.suggestions.length, error.suggestions,
                `Error should have ${error.suggestions} suggestions. Instead found ${message.suggestions.length} suggestions`,
            );
            return;
        }

        if (!Array.isArray(error.suggestions)) {
            assert.fail("Test error object property 'suggestions' should be an array or a number");
            return;
        }

        assert.strictEqual(
            message.suggestions.length, error.suggestions.length,
            `Error should have ${error.suggestions.length} suggestions. Instead found ${message.suggestions.length} suggestions`,
        );

        error.suggestions.forEach((expectedSuggestion, index) => {
            this.assertSingleSuggestion(expectedSuggestion, message.suggestions[index], index, message, item, result);
        });
    }

    /**
     * Asserts a single suggestion entry.
     * @param {Object} expectedSuggestion
     * @param {Object} actualSuggestion
     * @param {number} index
     * @param {Object} message
     * @param {Object} item
     * @param {Object} result
     */
    assertSingleSuggestion(expectedSuggestion, actualSuggestion, index, message, item, result) {
        const { rule, ruleName } = this;
        const ruleHasMetaMessages = hasOwnProperty(rule, "meta") && hasOwnProperty(rule.meta, "messages");
        const friendlyIDList = ruleHasMetaMessages
            ? `[${Object.keys(rule.meta.messages).map(key => `'${key}'`).join(", ")}]`
            : null;
        const prefix = `Error Suggestion at index ${index}:`;
        const { requireData = false } = this.test.assertionOptions ?? {};

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
            this.assertSuggestionDesc(expectedSuggestion, actualSuggestion, prefix);
        } else if (hasOwnProperty(expectedSuggestion, "messageId")) {
            this.assertSuggestionMessageId(expectedSuggestion, actualSuggestion, prefix, ruleHasMetaMessages, friendlyIDList, requireData);
        } else if (hasOwnProperty(expectedSuggestion, "data")) {
            assert.fail(`${prefix} Test must specify 'messageId' if 'data' is used.`);
        } else {
            assert.fail(`${prefix} Test must specify either 'messageId' or 'desc'.`);
        }

        this.assertSuggestionOutput(expectedSuggestion, actualSuggestion, index, message, item, result, prefix);
    }

    /**
     * Asserts the `desc` property of a suggestion.
     * @param {Object} expectedSuggestion
     * @param {Object} actualSuggestion
     * @param {string} prefix
     */
    assertSuggestionDesc(expectedSuggestion, actualSuggestion, prefix) {
        assert.ok(!hasOwnProperty(expectedSuggestion, "data"), `${prefix} Test should not specify both 'desc' and 'data'.`);
        assert.ok(!hasOwnProperty(expectedSuggestion, "messageId"), `${prefix} Test should not specify both 'desc' and 'messageId'.`);
        assert.strictEqual(
            actualSuggestion.desc, expectedSuggestion.desc,
            `${prefix} desc should be "${expectedSuggestion.desc}" but got "${actualSuggestion.desc}" instead.`,
        );
    }

    /**
     * Asserts the `messageId` property of a suggestion.
     * @param {Object} expectedSuggestion
     * @param {Object} actualSuggestion
     * @param {string} prefix
     * @param {boolean} ruleHasMetaMessages
     * @param {string|null} friendlyIDList
     * @param {boolean|string} requireData
     */
    assertSuggestionMessageId(expectedSuggestion, actualSuggestion, prefix, ruleHasMetaMessages, friendlyIDList, requireData) {
        const { rule } = this;

        assert.ok(ruleHasMetaMessages, `${prefix} Test can not use 'messageId' if rule under test doesn't define 'meta.messages'.`);
        assert.ok(
            hasOwnProperty(rule.meta.messages, expectedSuggestion.messageId),
            `${prefix} Test has invalid messageId '${expectedSuggestion.messageId}', the rule under test allows only one of ${friendlyIDList}.`,
        );
        assert.strictEqual(
            actualSuggestion.messageId, expectedSuggestion.messageId,
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
            buildUnsubstitutedPlaceholderMessage(unsubstitutedPlaceholders, "context.report() suggestion"),
        );

        if (hasOwnProperty(expectedSuggestion, "data")) {
            const rehydratedDesc = interpolate(rawSuggestionMessage, expectedSuggestion.data);
            assert.strictEqual(
                actualSuggestion.desc, rehydratedDesc,
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
     * Asserts the output of a suggestion fix.
     * @param {Object} expectedSuggestion
     * @param {Object} actualSuggestion
     * @param {number} index
     * @param {Object} message
     * @param {Object} item
     * @param {Object} result
     * @param {string} prefix
     */
    assertSuggestionOutput(expectedSuggestion, actualSuggestion, index, message, item, result, prefix) {
        assert.ok(hasOwnProperty(expectedSuggestion, "output"), `${prefix} The "output" property is required.`);

        const codeWithAppliedSuggestion = SourceCodeFixer.applyFixes(item.code, [actualSuggestion]).output;
        const errorMessageInSuggestion = this.linter
            .verify(codeWithAppliedSuggestion, result.configs, result.filename)
            .find(m => m.fatal);

        assert(!errorMessageInSuggestion, [
            "A fatal parsing error occurred in suggestion fix.",
            `Error: ${errorMessageInSuggestion?.message}`,
            "Suggestion output:",
            codeWithAppliedSuggestion,
        ].join("\n"));

        assert.strictEqual(
            codeWithAppliedSuggestion, expectedSuggestion.output,
            `Expected the applied suggestion fix to match the test suggestion output for suggestion at index: ${index} on error with message: "${message.message}"`,
        );
        assert.notStrictEqual(
            expectedSuggestion.output, item.code,
            `The output of a suggestion should differ from the original source code for suggestion at index: ${index} on error with message: "${message.message}"`,
        );
    }

    /**
     * Asserts the output of an invalid test case.
     * @param {Object} item
     * @param {Object} result
     */
    assertOutput(item, result) {
        if (!hasOwnProperty(item, "output")) {
            assert.strictEqual(result.output, item.code, "The rule fixed the code. Please add 'output' property.");
            return;
        }
        if (item.output === null) {
            assert.strictEqual(result.output, item.code, "Expected no autofixes to be suggested");
        } else {
            assert.strictEqual(result.output, item.output, "Output is incorrect.");
            assert.notStrictEqual(
                item.code, item.output,
                "Test property 'output' matches 'code'. If no autofix is expected, then omit the 'output' property or set it to null.",
            );
        }
    }

    /**
     * Runs a valid test case with error handling and location tracking.
     * @param {Object} item
     * @param {number} index
     * @param {Set<string>} seenTestCases
     * @param {Function} estimateTestLocation
     */
    runValidCase(item, index, seenTestCases, estimateTestLocation) {
        try {
            this.runHook(item, "before");
            assertValidTestCase(item, seenTestCases);
            this.testValidTemplate(item);
        } catch (error) {
            if (error instanceof Error) {
                error.scenarioType = "valid";
                error.scenarioIndex = index;
                error.stack = error.stack.replace(/^ +at /mu, [
                    `    roughly at RuleTester.run.valid[${index}] (${estimateTestLocation(`valid[${index}]`)})`,
                    `    roughly at RuleTester.run.valid (${estimateTestLocation("valid")})`,
                    `    at RuleTester.run (${estimateTestLocation("root")})`,
                    "    at ",
                ].join("\n"));
            }
            throw error;
        } finally {
            this.runHook(item, "after");
        }
    }

    /**
     * Runs an invalid test case with error handling and location tracking.
     * @param {Object} item
     * @param {number} index
     * @param {Set<string>} seenTestCases
     * @param {Function} estimateTestLocation
     */
    runInvalidCase(item, index, seenTestCases, estimateTestLocation) {
        try {
            this.runHook(item, "before");
            assertInvalidTestCase(item, seenTestCases, this.ruleName, this.test.assertionOptions);
            this.testInvalidTemplate(item);
        } catch (error) {
            if (error instanceof Error) {
                error.scenarioType = "invalid";
                error.scenarioIndex = index;
                const errorIndex = error.errorIndex;
                error.stack = error.stack.replace(/^ +at /mu, [
                    ...(typeof errorIndex === "number"
                        ? [`    roughly at RuleTester.run.invalid[${index}].error[${errorIndex}] (${estimateTestLocation(`invalid[${index}].errors[${errorIndex}]`)})`]
                        : []),
                    `    roughly at RuleTester.run.invalid[${index}] (${estimateTestLocation(`invalid[${index}]`)})`,
                    `    roughly at RuleTester.run.invalid (${estimateTestLocation("invalid")})`,
                    `    at RuleTester.run (${estimateTestLocation("root")})`,
                    "    at ",
                ].join("\n"));
            }
            throw error;
        } finally {
            this.runHook(item, "after");
        }
    }
}

//------------------------------------------------------------------------------
// Shared message helpers
//------------------------------------------------------------------------------

/**
 * Builds a descriptive error message for unsubstituted placeholders.
 * @param {string[]} unsubstitutedPlaceholders
 * @param {string} callSite
 * @returns {string}
 */
function buildUnsubstitutedPlaceholderMessage(unsubstitutedPlaceholders, callSite) {
    const count = unsubstitutedPlaceholders.length;
    const plural = count > 1;
    const names = plural
        ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => `'${name}'`).join(", ")}`
        : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`;
    return `The reported message has ${names}. Please provide the missing ${plural ? "values" : "value"} via the 'data' property in the ${callSite} call.`;
}

module.exports = RuleTester;
```

## Key Refactoring Decisions

### 1. Extracted `TestRunner` class
The `run()` method contained ~400 lines of nested functions. These are now methods on a `TestRunner` class, each with a single responsibility:
- `runRuleForItem` → split into `buildConfigs`, `validateSchema`, `setupASTCapture`, `verifyWithGuards`, `computeOutput`
- `testInvalidTemplate` → split into `assertUniqueSuggestions`, `assertErrorCount`, `assertSingleErrorMatch`, `assertErrorObjectMessage`, `assertErrorLocation`, `assertErrorSuggestions`, `assertSingleSuggestion`, `assertSuggestionDesc`, `assertSuggestionMessageId`, `assertSuggestionOutput`, `assertOutput`

### 2. Extracted `buildBaseConfig` function
Removed from inside `run()` to a standalone function.

### 3. Decomposed `buildLazyTestLocationEstimator`
Split into `readSourceLines`, `findValidLineIndexes`, `findInvalidLineIndexes`, `findErrorLineIndexes`, and `buildErrorLocationEntries`.

### 4. Extracted `assertSingleError` and helpers
`assertErrorsProperty` delegates per-error validation to `assertSingleError`, `assertErrorMessageRequirements`, and `assertErrorMessageExclusivity`.

### 5. Extracted `buildUnsubstitutedPlaceholderMessage`
Eliminated duplicated ternary message-building logic.

### 6. Added `formatKeyList` utility
Eliminated duplicated `[...set].map(...).join(...)` pattern.
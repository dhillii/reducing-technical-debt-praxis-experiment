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
const { defaultConfig, defaultRuleTesterConfig } = require("../config/default-config");
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
	"name", "code", "filename", "options", "before", "after", "errors", "output", "only",
];

const errorObjectParameters = new Set([
	"message", "messageId", "data", "line", "column", "endLine", "endColumn", "suggestions",
]);

const suggestionObjectParameters = new Set([
	"desc", "messageId", "data", "output",
]);

const friendlyErrorObjectParameterList = formatParameterList(errorObjectParameters);
const friendlySuggestionObjectParameterList = formatParameterList(suggestionObjectParameters);

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
// Helpers
//------------------------------------------------------------------------------

function formatParameterList(paramSet) {
	return `[${[...paramSet].map(key => `'${key}'`).join(", ")}]`;
}

/**
 * Clones a given value deeply, ignoring `parent` property.
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
 * @param {Object} node
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
 * @param {Object} ast
 * @param {Object} [visitorKeys]
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
 * Wraps the given parser to intercept parse results and add start/end error properties.
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
 * Returns a replacement for a forbidden SourceCode method that allows only one call.
 * @param {string} methodName
 * @param {Object} prototype
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
 * Returns placeholders in the message that were not substituted.
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
 * Normalizes a test case to an object with a `code` property.
 * @param {any} item
 * @returns {Object}
 */
function normalizeTestCase(item) {
	return item && typeof item === "object" ? item : { code: item };
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
 * Asserts that a rule is valid.
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
 * Asserts that a test scenario object is valid.
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
 * Asserts common properties of a test case.
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
				for (const propertyName of Object.keys(error)) {
					assert.ok(
						errorObjectParameters.has(propertyName),
						`Invalid error property name '${propertyName}'. Expected one of ${friendlyErrorObjectParameterList}.`,
					);
				}

				assertErrorMessageProperties(error, number, requireMessage);
			} else {
				assert.fail(`errors[${number}] must be a string, RegExp, or an object.`);
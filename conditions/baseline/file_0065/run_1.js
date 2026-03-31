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

const suggestionObjectParameters = new Set(["desc", "messageId", "data", "output"]);

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

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const hasOwnProperty = Function.call.bind(Object.hasOwnProperty);

/**
 * Formats a set of parameter names into a friendly list string.
 * @param {Set<string>} params
 * @returns {string}
 */
function formatParameterList(params) {
	return `[${[...params].map(key => `'${key}'`).join(", ")}]`;
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
 * @param {Object} node
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
 * @param {Object} ast
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
 * Creates a replacement for a forbidden SourceCode method that allows only one call per instance.
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

/**
 * Checks for duplicate test cases.
 * @param {Object} item
 * @param {Set<string>} seenTestCases
 * @returns {void}
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
 * Asserts that a rule is a valid object with a `create` method.
 * @param {Object} rule
 * @param {string} ruleName
 * @returns {void}
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
 * Asserts common properties shared by valid and invalid test cases.
 * @param {Object} item
 * @returns {void}
 */
function assertTestCommonProperties(item) {
	assert.ok(typeof item.code === "string", "Test case must specify a string value for 'code'");

	const optionalStringProps = ["name", "filename"];
	const optionalBooleanProps = ["only"];

	for (const prop of optionalStringProps) {
		if (item[prop] !== undefined) {
			assert.ok(
				typeof item[prop] === "string",
				`Optional test case property '${prop}' must be a string`,
			);
		}
	}

	for (const prop of optionalBooleanProps) {
		if (hasOwnProperty(item, prop)) {
			assert.ok(
				typeof item[prop] === "boolean",
				`Optional test case property '${prop}' must be a boolean`,
			);
		}
	}

	if (hasOwnProperty(item, "options")) {
		assert.ok(Array.isArray(item.options), "Optional test case property 'options' must be an array");
	}
}

/**
 * Validates a single error object within an errors array.
 * @param {Object|string|RegExp} error
 * @param {number} number
 * @param {Object} assertionOptions
 * @returns {void}
 */
function assertErrorObject(error, number, assertionOptions) {
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

	if (requireMessage === "message") {
		assert.ok(
			!hasOwnProperty(error, "messageId") && has
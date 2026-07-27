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
 * Deeply clone a value while ignoring the `parent` property.
 * @param {any} x Value to clone.
 * @returns {any} Cloned value.
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
 * Deeply freeze a value.
 * @param {any} x Value to freeze.
 * @param {Set<Object>} seenObjects Objects already visited.
 */
function freezeDeeply(x, seenObjects = new Set()) {
	if (typeof x === "object" && x !== null) {
		if (seenObjects.has(x)) {
			return;
		}
		seenObjects.add(x);
		if (Array.isArray(x)) {
			x.forEach(el => freezeDeeply(el, seenObjects));
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
 * Replace control characters by `\\u00xx` form.
 * @param {string} text Text to sanitize.
 * @returns {string} Sanitized text.
 */
function sanitize(text) {
	if (typeof text !== "string") {
		return "";
	}
	return text.replace(
		/[\u0000-\u0009\u000b-\u001a]/gu,
		c => `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`,
	);
}

/**
 * Define `start`/`end` properties as throwing error.
 * @param {string} objName Object name used for error messages.
 * @param {ASTNode} node Node to define.
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
 * Apply error-throwing definitions to all nodes in an AST.
 * @param {ASTNode} ast Root node.
 * @param {Object} [visitorKeys] Visitor keys for traversal.
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
 * Wrap a parser to intercept `parse`/`parseForESLint` and errorize start/end.
 * @param {Parser} parser Parser object.
 * @returns {Parser} Wrapped parser.
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
 * Create a function that throws when a forbidden `SourceCode` method is called more than once.
 * @param {string} methodName Method name.
 * @param {Function} prototype Prototype containing the original method.
 * @returns {Function} Wrapped method.
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
		throw new Error(
			`\`SourceCode#${methodName}()\` cannot be called inside a rule.`,
		);
	};
}

/**
 * Extract placeholder names from a message.
 * @param {string} message Message text.
 * @returns {string[]} Placeholder names.
 */
function getMessagePlaceholders(message) {
	const matcher = getPlaceholderMatcher();
	return Array.from(message.matchAll(matcher), ([, name]) => name.trim());
}

/**
 * Determine which placeholders are missing from the provided data.
 * @param {string} message Reported message.
 * @param {string} raw Raw message from rule meta.
 * @param {Record<string, unknown>} [data={}] Data object.
 * @returns {string[]} Missing placeholder names.
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
 * Normalizes a test case item to an object with a `code` property.
 * @param {any} item Test case item.
 * @returns {Object} Normalized test case.
 */
function normalizeTestCase(item) {
	return item && typeof item === "object" ? item : { code: item };
}

/**
 * Validate the `errors` property of an invalid test case.
 * @param {number|Array} errors Errors definition.
 * @param {string} ruleName Rule name.
 * @param {Object} [assertionOptions={}] Assertion options.
 */
function assertErrorsProperty(errors, ruleName, assertionOptions = {}) {
	const isNumber = typeof errors === "number";
	const isArray = Array.isArray(errors);

	if (!isNumber && !isArray) {
		if (errors === undefined) {
			assert.fail(
				`Did not specify errors for an invalid test of ${ruleName}`,
			);
		} else {
			assert.fail(
				`Invalid 'errors' property for invalid test of ${ruleName}: expected a number or an array but got ${
					errors === null ? "null" : typeof errors
				}`,
			);
		}
	}

	const { requireMessage = false, requireLocation = false } =
		assertionOptions;

	if (isArray) {
		assert.ok(
			errors.length !== 0,
			"Invalid cases must have at least one error",
		);
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
				if (requireMessage === "message") {
					assert.ok(
						!hasOwnProperty(error, "messageId") &&
							hasOwnProperty(error, "message"),
						`errors[${number}] should specify 'message' (and not 'messageId') when 'assertionOptions.requireMessage' is 'message'.`,
					);
				} else if (requireMessage === "messageId") {
					assert.ok(
						!hasOwnProperty(error, "message") &&
							hasOwnProperty(error, "messageId"),
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
			} else {
				assert.fail(
					`errors[${number}] must be a string, RegExp, or an object.`,
				);
			}
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
 * Ensure a test scenario object has valid `valid` and `invalid` arrays.
 * @param {Object} test Test scenario.
 * @param {string} ruleName Rule name.
 */
function assertTest(test, ruleName) {
	assert.ok(
		test && typeof test === "object",
		`Test Scenarios for rule ${ruleName} : Could not find test scenario object`,
	);
	const hasValid = Array.isArray(test.valid);
	const hasInvalid = Array.isArray(test.invalid);
	assert.ok(
		hasValid,
		`Test Scenarios for rule ${ruleName} is invalid: Could not find any valid test scenarios`,
	);
	assert.ok(
		hasInvalid,
		`Test Scenarios for rule ${ruleName} is invalid: Could not find any invalid test scenarios`,
	);
}

/**
 * Validate common properties of a test case.
 * @param {Object} item Test case.
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
 * Validate a valid test case.
 * @param {Object} item Test case.
 * @param {Set<string>} seenTestCases Set of seen cases.
 */
function assertValidTestCase(item, seenTestCases) {
	assert.ok(
		item.errors === undefined,
		"Valid test case must not have 'errors' property",
	);
	assert.ok(
		item.output === undefined,
		"Valid test case must not have 'output' property",
	);
	assertTestCommonProperties(item);
	checkDuplicateTestCase(item, seenTestCases);
}

/**
 * Validate an invalid test case.
 * @param {Object} item Test case.
 * @param {Set<string>} seenTestCases Set of seen cases.
 * @param {string} ruleName Rule name.
 * @param {Object} [assertionOptions] Assertion options.
 */
function assertInvalidTestCase(
	item,
	seenTestCases,
	ruleName,
	assertionOptions = {},
) {
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
 * Detect duplicate test cases via serialization.
 * @param {Object} item Test case.
 * @param {Set<string>} seenTestCases Set of serialized cases.
 */
function checkDuplicateTestCase(item, seenTestCases) {
	if (!isSerializable(item)) {
		return;
	}
	const serializedTestCase = stringify(item, {
		replacer(key, value) {
			return item !== this || !duplicationIgnoredParameters.has(key)
				? value
				: undefined;
		},
	});
	assert(
		!seenTestCases.has(serializedTestCase),
		"detected duplicate test case",
	);
	seenTestCases.add(serializedTestCase);
}

/**
 * Ensure a rule has a `create` method.
 * @param {Object} rule Rule object.
 * @param {string} ruleName Rule name.
 */
function assertRule(rule, ruleName) {
	assert.ok(
		rule && typeof rule === "object" && typeof rule.create === "function",
		`Rule ${ruleName} must be an object with a \`create\` method`,
	);
}

/**
 * Get the location of the caller for error reporting.
 * @param {Function} relative Function before the invocation point.
 * @returns {{ sourceFile:string, sourceLine:number, sourceColumn:number }}
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
	/* invoke Error.prepareStackTrace in Node.js */
	dummyObject.stack;
	Error.prepareStackTrace = prepareStackTrace;
	return location;
}

/**
 * Build a lazy resolver for test locations.
 * @param {Function} invoker Method that runs the tests.
 * @returns {(key:string)=>string}
 */
function buildLazyTestLocationEstimator(invoker) {
	const invocationLocation = getInvocationLocation(invoker);
	let testLocations = null;
	return key => {
		if (testLocations === null) {
			const { sourceFile, sourceLine, sourceColumn } = invocationLocation;
			testLocations = { root: `${sourceFile}:${sourceLine}:${sourceColumn}` };
			if (existsSync(sourceFile)) {
				let content = readFileSync(sourceFile, "utf8")
					.split("\n")
					.slice(sourceLine - 1);
				content[0] = content[0].slice(Math.max(0, sourceColumn - 1));
				content = content.map(l =>
					l
						.trim()
						.replace(/\s*\/\/.*$(?<!,)/u, ""),
				);
				const validStartIndex = content.findIndex(line =>
					/\bvalid\s*:/u.test(line),
				);
				const invalidStartIndex = content.findIndex(line =>
					/\binvalid\s*:/u.test(line),
				);
				testLocations.valid = `${sourceFile}:${sourceLine + validStartIndex}`;
				testLocations.invalid = `${sourceFile}:${sourceLine + invalidStartIndex}`;
				const validEndIndex =
					validStartIndex < invalidStartIndex
						? invalidStartIndex
						: content.length;
				const invalidEndIndex =
					validStartIndex < invalidStartIndex
						? content.length
						: validStartIndex;
				const validLines = content.slice(validStartIndex, validEndIndex);
				const invalidLines = content.slice(invalidStartIndex, invalidEndIndex);
				let objectDepth = 0;
				const validLineIndexes = validLines
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
				const invalidLineIndexes = invalidLines
					.map((l, i) => (l.trimStart().startsWith("errors:") ? i : null))
					.filter(Boolean);
				Object.assign(
					testLocations,
					{
						[`valid[0]`]: `${sourceFile}:${sourceLine + validStartIndex}`,
					},
					Object.fromEntries(
						validLineIndexes.map((loc, idx) => [
							`valid[${idx}]`,
							`${sourceFile}:${sourceLine + validStartIndex + loc}`,
						]),
					),
					Object.fromEntries(
						invalidLineIndexes.map((loc, idx) => [
							`invalid[${idx}]`,
							`${sourceFile}:${sourceLine + invalidStartIndex + loc}`,
						]),
					),
				);
				invalidLineIndexes.push(invalidLines.length);
				for (let i = 0; i < invalidLineIndexes.length - 1; i++) {
					const start = invalidLineIndexes[i];
					const end = invalidLineIndexes[i + 1];
					const errorLines = invalidLines.slice(start, end);
					let errorObjectDepth = 0;
					const errorLineIndexes = errorLines
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
					Object.assign(
						testLocations,
						Object.fromEntries(
							errorLineIndexes.map((line, errorIdx) => [
								`invalid[${i}].errors[${errorIdx}]`,
								`${sourceFile}:${sourceLine + invalidStartIndex + start + line}`,
							]),
						),
					);
				}
			}
		}
		return testLocations[key] || "unknown source";
	};
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

const DESCRIBE = Symbol("describe");
const IT = Symbol("it");
const IT_ONLY = Symbol("itOnly");

/**
 * Default `it` handler when Mocha's `it` is unavailable.
 * @this {Mocha}
 * @param {string} text Test description.
 * @param {Function} method Test logic.
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
 * Default `describe` handler when Mocha's `describe` is unavailable.
 * @this {Mocha}
 * @param {string} text Suite description.
 * @param {Function} method Suite logic.
 * @returns {any}
 */
function describeDefaultHandler(text, method) {
	return method.call(this);
}

/**
 * Mocha test wrapper.
 */
class RuleTester {
	/**
	 * Creates a new RuleTester instance.
	 * @param {Object} [testerConfig={}] Optional tester configuration.
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
	 * Set the default configuration for all future tests.
	 * @param {Object} config Configuration object.
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

	/** Get the current default configuration. */
	static getDefaultConfig() {
		return sharedDefaultConfig;
	}

	/** Reset to the initial default configuration. */
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
	 * Run tests for a rule.
	 * @param {string} ruleName Rule name.
	 * @param {RuleDefinition} rule Rule definition.
	 * @param {Object} test Test scenarios.
	 */
	run(ruleName, rule, test) {
		const testerConfig = this.testerConfig;
		const linter = this.linter;
		const ruleId = `rule-to-test/${ruleName}`;

		assertRule(rule, ruleName);
		assertTest(test, ruleName);
		const estimateTestLocation = buildLazyTestLocationEstimator(this.run);

		const baseConfig = [
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

		/** Run a hook if present. */
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

		/** Execute the rule on a test item and return results. */
		function runRuleForItem(item) {
			const code = item.code;
			const filename = hasOwnProperty(item, "filename")
				? item.filename
				: undefined;
			const options = hasOwnProperty(item, "options") ? item.options : [];
			const flatConfigArrayOptions = { baseConfig };
			if (filename) {
				flatConfigArrayOptions.basePath = path.parse(filename).root || undefined;
			}
			const configs = new FlatConfigArray(testerConfig, flatConfigArrayOptions);
			configs[ConfigArraySymbol.finalizeConfig] = function (...args) {
				const proto = Object.getPrototypeOf(this);
				const calculatedConfig = proto[
					ConfigArraySymbol.finalizeConfig
				].apply(this, args);
				if (calculatedConfig.language === jslang) {
					calculatedConfig.languageOptions.parser = wrapParser(
						calculatedConfig.languageOptions.parser,
					);
				}
				return calculatedConfig;
			};

			let output, beforeAST, afterAST;
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
			if (schema && Object.keys(schema).length === 0) {
				throw new Error(
					`\`schema: {}\` is a no-op${metaSchemaDescription}`,
				);
			}
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

			if (schema) {
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
			try {
				configs.normalizeSync();
				configs.getConfig("test.js");
			} catch (error) {
				error.message = `ESLint configuration in rule-tester is invalid: ${error.message}`;
				throw error;
			}
			const { applyLanguageOptions, applyInlineConfig, finalize } =
				SourceCode.prototype;
			let messages;
			try {
				forbiddenMethods.forEach(methodName => {
					SourceCode.prototype[methodName] = throwForbiddenMethodError(
						methodName,
						SourceCode.prototype,
					);
				});
				messages = linter.verify(code, configs, filename);
			} finally {
				SourceCode.prototype.applyInlineConfig = applyInlineConfig;
				SourceCode.prototype.applyLanguageOptions = applyLanguageOptions;
				SourceCode.prototype.finalize = finalize;
			}
			const fatalErrorMessage = messages.find(m => m.fatal);
			assert(!fatalErrorMessage, `A fatal parsing error occurred: ${fatalErrorMessage && fatalErrorMessage.message}`);
			if (messages.some(m => m.fix)) {
				output = SourceCodeFixer.applyFixes(code, messages).output;
				const errorMessageInFix = linter
					.verify(output, configs, filename)
					.find(m => m.fatal);
				assert(!errorMessageInFix, [
					"A fatal parsing error occurred in autofix.",
					`Error: ${errorMessageInFix && errorMessageInFix.message}`,
					"Autofix output:",
					output,
				].join("\n"));
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

		/** Ensure AST was not mutated. */
		function assertASTDidntChange(beforeAST, afterAST) {
			if (!equal(beforeAST, afterAST)) {
				assert.fail("Rule should not modify AST.");
			}
		}

		/** Validate a valid test case. */
		function testValidTemplate(item) {
			const result = runRuleForItem(item);
			const messages = result.messages;
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
		}

		/** Compare actual and expected messages. */
		function assertMessageMatches(actual, expected) {
			if (expected instanceof RegExp) {
				assert.ok(
					expected.test(actual),
					`Expected '${actual}' to match ${expected}`,
				);
			} else {
				assert.strictEqual(actual, expected);
			}
		}

		/** Validate message ID and placeholders. */
		function validateMessageIdAndPlaceholders(message, error, rule) {
			if (hasOwnProperty(error, "messageId")) {
				assert.ok(
					hasOwnProperty(rule, "meta") && hasOwnProperty(rule.meta, "messages"),
					"Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.",
				);
				assert.ok(
					hasOwnProperty(rule.meta.messages, error.messageId),
					`Invalid messageId '${error.messageId}'.`,
				);
				assert.strictEqual(
					message.messageId,
					error.messageId,
					`messageId '${message.messageId}' does not match expected '${error.messageId}'.`,
				);
				const unsubstituted = getUnsubstitutedMessagePlaceholders(
					message.message,
					rule.meta.messages[message.messageId],
					error.data,
				);
				assert.ok(
					unsubstituted.length === 0,
					`The reported message has unsubstituted placeholders: ${unsubstituted.join(", ")}.`,
				);
				if (hasOwnProperty(error, "data")) {
					const rehydrated = interpolate(
						rule.meta.messages[error.messageId],
						error.data,
					);
					assert.strictEqual(
						message.message,
						rehydrated,
						`Hydrated message "${rehydrated}" does not match "${message.message}"`,
					);
				}
			}
		}

		/** Validate suggestions for a message. */
		function validateSuggestions(message, error, rule, requireData) {
			if (!hasOwnProperty(message, "suggestions")) {
				assert.ok(
					!hasOwnProperty(error, "suggestions"),
					`Error at index ${i} has suggestions. Please specify 'suggestions' property on the test error object.`,
				);
				return;
			}
			assert.ok(
				hasOwnProperty(error, "suggestions"),
				`Error at index ${i} has suggestions. Please specify 'suggestions' property on the test error object.`,
			);
			const expectsSuggestions = Array.isArray(error.suggestions)
				? error.suggestions.length > 0
				: Boolean(error.suggestions);
			const hasSuggestions = message.suggestions !== undefined;
			if (!hasSuggestions && expectsSuggestions) {
				assert.ok(
					!error.suggestions,
					`Error should have suggestions on error with message: "${message.message}"`,
				);
			} else if (hasSuggestions) {
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
				} else if (Array.isArray(error.suggestions)) {
					assert.strictEqual(
						message.suggestions.length,
						error.suggestions.length,
						`Error should have ${error.suggestions.length} suggestions. Instead found ${message.suggestions.length} suggestions`,
					);
					error.suggestions.forEach((expectedSuggestion, index) => {
						assert.ok(
							typeof expectedSuggestion === "object" && expectedSuggestion !== null,
							"Test suggestion in 'suggestions' array must be an object.",
						);
						Object.keys(expectedSuggestion).forEach(propertyName => {
							assert.ok(
								suggestionObjectParameters.has(propertyName),
								`Invalid suggestion property name '${propertyName}'. Expected one of ${friendlySuggestionObjectParameterList}.`,
							);
						});
						const actualSuggestion = message.suggestions[index];
						const prefix = `Error Suggestion at index ${index}:`;
						if (hasOwnProperty(expectedSuggestion, "desc")) {
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
						} else if (hasOwnProperty(expectedSuggestion, "messageId")) {
							assert.ok(
								hasOwnProperty(rule.meta.messages, expectedSuggestion.messageId),
								`${prefix} Test has invalid messageId '${expectedSuggestion.messageId}'.`,
							);
							assert.strictEqual(
								actualSuggestion.messageId,
								expectedSuggestion.messageId,
								`${prefix} messageId should be '${expectedSuggestion.messageId}' but got '${actualSuggestion.messageId}' instead.`,
							);
							const rawMessage = rule.meta.messages[expectedSuggestion.messageId];
							const unsubstituted = getUnsubstitutedMessagePlaceholders(
								actualSuggestion.desc,
								rawMessage,
								expectedSuggestion.data,
							);
							assert.ok(
								unsubstituted.length === 0,
								`The message of the suggestion has unsubstituted placeholders: ${unsubstituted.join(", ")}.`,
							);
							if (hasOwnProperty(expectedSuggestion, "data")) {
								const rehydrated = interpolate(
									rawMessage,
									expectedSuggestion.data,
								);
								assert.strictEqual(
									actualSuggestion.desc,
									rehydrated,
									`${prefix} Hydrated test desc "${rehydrated}" does not match received desc "${actualSuggestion.desc}".`,
								);
							} else {
								const requiresData = requireData === true || requireData === "suggestion";
								const hasPlaceholders = getMessagePlaceholders(rawMessage).length > 0;
								assert.ok(
									!requiresData || !hasPlaceholders,
									`${prefix} Suggestion should specify the 'data' property as the referenced message has placeholders.`,
								);
							}
						} else if (hasOwnProperty(expectedSuggestion, "data")) {
							assert.fail(`${prefix} Test must specify 'messageId' if 'data' is used.`);
						} else {
							assert.fail(`${prefix} Test must specify either 'messageId' or 'desc'.`);
						}
						assert.ok(
							hasOwnProperty(expectedSuggestion, "output"),
							`${prefix} The "output" property is required.`,
						);
						const fixed = SourceCodeFixer.applyFixes(item.code, [actualSuggestion]).output;
						const errorInSuggestion = linter
							.verify(fixed, result.configs, result.filename)
							.find(m => m.fatal);
						assert(!errorInSuggestion, [
							"A fatal parsing error occurred in suggestion fix.",
							`Error: ${errorInSuggestion && errorInSuggestion.message}`,
							"Suggestion output:",
							fixed,
						].join("\n"));
						assert.strictEqual(
							fixed,
							expectedSuggestion.output,
							`Expected the applied suggestion fix to match the test suggestion output for suggestion at index: ${index} on error with message: "${message.message}"`,
						);
						assert.notStrictEqual(
							expectedSuggestion.output,
							item.code,
							`The output of a suggestion should differ from the original source code for suggestion at index: ${index} on error with message: "${message.message}"`,
						);
					});
				} else {
					assert.fail("Test error object property 'suggestions' should be an array or a number");
				}
			}
		}

		/** Validate location properties of an error. */
		function validateLocation(message, error, requireLocation) {
			const locationProps = ["line", "column", "endLine", "endColumn"];
			const actual = {};
			const expected = {};
			for (const key of locationProps) {
				if (hasOwnProperty(error, key)) {
					actual[key] = message[key];
					expected[key] = error[key];
				}
			}
			if (requireLocation) {
				const missing = locationProps.filter(
					key => !hasOwnProperty(error, key) && hasOwnProperty(message, key),
				);
				assert.ok(
					missing.length === 0,
					`Error is missing expected location properties: ${missing.join(", ")}`,
				);
			}
			if (Object.keys(expected).length > 0) {
				assert.deepStrictEqual(
					actual,
					expected,
					"Actual error location does not match expected error location.",
				);
			}
		}

		/** Run an invalid test case. */
		function testInvalidTemplate(item) {
			const {
				requireMessage = false,
				requireLocation = false,
				requireData = false,
			} = test.assertionOptions ?? {};

			const ruleHasMetaMessages =
				hasOwnProperty(rule, "meta") && hasOwnProperty(rule.meta, "messages");
			const friendlyIDList = ruleHasMetaMessages
				? `[${Object.keys(rule.meta.messages).map(k => `'${k}'`).join(", ")}]`
				: null;

			assert.ok(
				ruleHasMetaMessages || requireMessage !== "messageId",
				`Assertion options can not use 'requireMessage: "messageId"' if rule under test doesn't define 'meta.messages'.`,
			);

			const result = runRuleForItem(item);
			const messages = result.messages;

			for (const message of messages) {
				if (hasOwnProperty(message, "suggestions")) {
					const seen = new Map();
					for (let i = 0; i < message.suggestions.length; i++) {
						const suggestionMessage = message.suggestions[i].desc;
						const previous = seen.get(suggestionMessage);
						assert.ok(
							!seen.has(suggestionMessage),
							`Suggestion message '${suggestionMessage}' reported from suggestion ${i} was previously reported by suggestion ${previous}. Suggestion messages should be unique within an error.`,
						);
						seen.set(suggestionMessage, i);
					}
				}
			}

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
			} else {
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
					const error = item.errors[i];
					const message = messages[i];
					assert(hasMessageOfThisRule, "Error rule name should be the same as the name of the rule being tested");
					if (typeof error === "string" || error instanceof RegExp) {
						assertMessageMatches(message.message, error);
						assert.ok(
							message.suggestions === undefined,
							`Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
						);
					} else {
						if (hasOwnProperty(error, "message")) {
							assertMessageMatches(message.message, error.message);
						}
						validateMessageIdAndPlaceholders(message, error, rule);
						if (hasOwnProperty(error, "data")) {
							const raw = rule.meta.messages[error.messageId];
							const rehydrated = interpolate(raw, error.data);
							assert.strictEqual(message.message, rehydrated);
						} else {
							const requiresData = requireData === true || requireData === "error";
							const hasPlaceholders = getMessagePlaceholders(
								rule.meta.messages[error.messageId],
							).length > 0;
							assert.ok(
								!requiresData || !hasPlaceholders,
								`Error should specify the 'data' property as the referenced message has placeholders.`,
							);
						}
						validateLocation(message, error, requireLocation);
						validateSuggestions(message, error, rule, requireData);
					}
				}
			}

			if (hasOwnProperty(item, "output")) {
				if (item.output === null) {
					assert.strictEqual(
						result.output,
						item.code,
						"Expected no autofixes to be suggested",
					);
				} else {
					assert.strictEqual(
						result.output,
						item.output,
						"Output is incorrect.",
					);
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
			assertASTDidntChange(result.beforeAST, result.afterAST);
		}

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
```javascript
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
const {
	defaultConfig,
	defaultRuleTesterConfig,
} = require("../config/default-config");

const ajv = require("../shared/ajv")({ strictDefaults: true });

const parserSymbol = Symbol.for("eslint.RuleTester.parser");
const { ConfigArraySymbol } = require("@eslint/config-array");

const jslang = require("../languages/js");
const { SourceCode } = require("../languages/js/source-code");

/** @import { LanguageOptions, RuleDefinition } from "@eslint/core" */
/** @typedef {import("../types").Linter.Parser} Parser */

const testerDefaultConfig = { rules: {} };
let sharedDefaultConfig = { rules: {} };

const RuleTesterParameters = [
	"name", "code", "filename", "options", "before", "after", "errors", "output", "only",
];

const errorObjectParameters = new Set([
	"message", "messageId", "data", "line", "column", "endLine", "endColumn", "suggestions",
]);
const friendlyErrorObjectParameterList = `[${[...errorObjectParameters].map(key => `'${key}'`).join(", ")}]`;

const suggestionObjectParameters = new Set([
	"desc", "messageId", "data", "output",
]);
const friendlySuggestionObjectParameterList = `[${[...suggestionObjectParameters].map(key => `'${key}'`).join(", ")}]`;

const forbiddenMethods = ["applyInlineConfig", "applyLanguageOptions", "finalize"];
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

//------------------------------------------------------------------------------
// Utility Functions
//------------------------------------------------------------------------------

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

function freezeDeeply(x, seenObjects = new Set()) {
	if (typeof x === "object" && x !== null) {
		if (seenObjects.has(x)) return;
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
}

function sanitize(text) {
	if (typeof text !== "string") return "";
	return text.replace(
		/[\u0000-\u0009\u000b-\u001a]/gu,
		c => `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`,
	);
}

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

function throwForbiddenMethodError(methodName, prototype) {
	const original = prototype[methodName];
	return function (...args) {
		const called = forbiddenMethodCalls.get(methodName);
		if (!called.has(this)) {
			called.add(this);
			return original.apply(this, args);
		}
		throw new Error(`\`SourceCode#${methodName}()\` cannot be called inside a rule.`);
	};
}

function getMessagePlaceholders(message) {
	const matcher = getPlaceholderMatcher();
	return Array.from(message.matchAll(matcher), ([, name]) => name.trim());
}

function getUnsubstitutedMessagePlaceholders(message, raw, data = {}) {
	const unsubstituted = getMessagePlaceholders(message);
	if (unsubstituted.length === 0) return [];

	const known = getMessagePlaceholders(raw);
	const provided = Object.keys(data);
	return unsubstituted.filter(name => known.includes(name) && !provided.includes(name));
}

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
	assert.ok(
		typeof item.code === "string",
		"Test case must specify a string value for 'code'",
	);

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

function assertValidTestCase(item, seenTestCases) {
	assert.ok(item.errors === void 0, "Valid test case must not have 'errors' property");
	assert.ok(item.output === void 0, "Valid test case must not have 'output' property");
	assertTestCommonProperties(item);
	checkDuplicateTestCase(item, seenTestCases);
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
			} else {
				assert.fail(`errors[${number}] must be a string, RegExp, or an object.`);
			}
		}
	} else {
		assert.ok(!requireMessage && !requireLocation, "Invalid cases must have 'errors' value as an array");
		assert.ok(errors > 0, "Invalid cases must have 'error' value greater than 0");
	}
}

function checkDuplicateTestCase(item, seenTestCases) {
	if (!isSerializable(item)) return;

	const serializedTestCase = stringify(item, {
		replacer(key, value) {
			return item !== this || !duplicationIgnoredParameters.has(key) ? value : void 0;
		},
	});

	assert(!seenTestCases.has(serializedTestCase), "detected duplicate test case");
	seenTestCases.add(serializedTestCase);
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

function buildLazyTestLocationEstimator(invoker) {
	const invocationLocation = getInvocationLocation(invoker);
	let testLocations = null;
	return key => {
		if (testLocations === null) {
			testLocations = buildTestLocations(invocationLocation);
		}
		return testLocations[key] || "unknown source";
	};
}

function buildTestLocations(invocationLocation) {
	const { sourceFile, sourceLine, sourceColumn } = invocationLocation;
	const testLocations = {
		root: `${sourceFile}:${sourceLine}:${sourceColumn}`,
	};

	if (!existsSync(sourceFile)) return testLocations;

	const content = readFileSync(sourceFile, "utf8")
		.split("\n")
		.slice(sourceLine - 1);
	content[0] = content[0].slice(Math.max(0, sourceColumn - 1));
	const cleanedContent = content.map(
		l => l.trim().replace(/\s*\/\/.*$(?<!,)/u, ""),
	);

	const validStartIndex = cleanedContent.findIndex(line => /\bvalid\s*:/u.test(line));
	const invalidStartIndex = cleanedContent.findIndex(line => /\binvalid\s*:/u.test(line));

	testLocations.valid = `${sourceFile}:${sourceLine + validStartIndex}`;
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

const testerDefaultConfig = { rules: {} };

let sharedDefaultConfig = { rules: {} };

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
		/[\u0000-\u0009\u000b-\u001a]/gu,
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
 * In particular, to modify ast nodes, tokens and comments to throw on access to their `start` and `end` properties.
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

		if (!called.has(this)) {
			called.add(this);

			return original.apply(this, args);
		}

		throw new Error(
			`\`SourceCode#${methodName}()\` cannot be called inside a rule.`,
		);
	};
}

/**
 * Extracts names of {{ placeholders }} from the reported message.
 * @param   {string} message Reported message
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
 * @param {undefined|Record<unknown, unknown>} data The passed
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

const metaSchemaDescription = `
\t- If the rule has options, set \`meta.schema\` to an array or non-empty object to enable options validation.
\t- If the rule doesn't have options, omit \`meta.schema\` to enforce that no options can be passed to the rule.
\t- You can also set \`meta.schema\` to \`false\` to opt-out of options validation (not recommended).

\thttps://eslint.org/docs/latest/extend/custom-rules#options-schemas
`;

const duplicationIgnoredParameters = new Set(["name", "errors", "output"]);

/**
 * Normalizes a test case item, ensuring it is an object with a 'code' property.
 * If the item is not an object, it returns an object with the 'code' property set to the item.
 * @param {any} item The test case item to normalize.
 * @returns {Object} The normalized test case object.
 */
function normalizeTestCase(item) {
	return item && typeof item === "object" ? item : { code: item };
}

/**
 * Validates that errors property is either a number or array.
 * @param {number | string[]} errors The `errors` property of the invalid test case.
 * @param {string} ruleName The name of the rule being tested.
 * @returns {boolean} True if errors is valid.
 */
function isValidErrorsType(errors, ruleName) {
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

	return true;
}

/**
 * Validates array of errors in test case.
 * @param {Array} errors The errors array to validate.
 * @param {Object} assertionOptions The assertion options.
 * @returns {void}
 */
function validateErrorsArray(errors, assertionOptions) {
	const { requireMessage = false, requireLocation = false } = assertionOptions;

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
			validateErrorObject(error, number);
		} else {
			assert.fail(
				`errors[${number}] must be a string, RegExp, or an object.`,
			);
		}
	}
}

/**
 * Validates a single error object.
 * @param {Object} error The error object to validate.
 * @param {number} index The index of the error in the errors array.
 * @returns {void}
 */
function validateErrorObject(error, index) {
	for (const propertyName of Object.keys(error)) {
		assert.ok(
			errorObjectParameters.has(propertyName),
			`Invalid error property name '${propertyName}'. Expected one of ${friendlyErrorObjectParameterList}.`,
		);
	}

	if (hasOwnProperty(error, "message")) {
		assert.ok(
			!hasOwnProperty(error, "messageId"),
			`errors[${index}] should not specify both 'message' and 'messageId'.`,
		);
		assert.ok(
			!hasOwnProperty(error, "data"),
			`errors[${index}] should not specify both 'data' and 'message'.`,
		);
	} else {
		assert.ok(
			hasOwnProperty(error, "messageId"),
			`errors[${index}] must specify either 'messageId' or 'message'.`,
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

	isValidErrorsType(errors, ruleName);

	const { requireMessage = false, requireLocation = false } = assertionOptions;

	if (isArray) {
		validateErrorsArray(errors, assertionOptions);
	} else {
		assert.ok(
			!requireMessage && !requireLocation,
			"Invalid cases must have 'errors' value as an array",
		);
		assert.ok(
			errors > 0,
			"Invalid cases must have 'error' value greater than 0",
		);
	}
}

/**
 * Check if this test case is a duplicate of one we have seen before.
 * @param {Object} item test case object
 * @param {Set<string>} seenTestCases set of serialized test cases we have seen so far (managed by this function)
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
 * Asserts that a rule is valid.
 * A valid rule must be an object with a `create` method.
 * @param {Object} rule The rule to check.
 * @param {string} ruleName The name of the rule.
 * @returns {void}
 * @throws {AssertionError} If the rule is not valid.
 */
function assertRule(rule, ruleName) {
	assert.ok(
		rule && typeof rule === "object" && typeof rule.create === "function",
		`Rule ${ruleName} must be an object with a \`create\` method`,
	);
}

/**
 * Asserts that a test scenario object is valid.
 * A valid test scenario object must have `valid` and `invalid` properties, both of
 * which must be arrays.
 * @param {Object} test The test scenario object to check.
 * @param {string} ruleName The name of the rule being tested.
 * @returns {void}
 * @throws {AssertionError} If the test scenario object is not valid.
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
 * A valid test case must specify a string value for 'code'.
 * Optional properties are checked for correct types.
 * @param {Object} item The valid test case object to check.
 * @param {Set<string>} seenTestCases Set of serialized test cases to check for duplicates.
 * @returns {void}
 * @throws {AssertionError} If the test case is not valid.
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
 * Asserts that the invalid test case object is valid.
 * An invalid test case must specify a string value for 'code' and must have 'errors' property.
 * Optional properties are checked for correct types.
 * @param {Object} item The invalid test case object to check.
 * @param {Set<string>} seenTestCases Set of serialized test cases to check for duplicates.
 * @param {string} ruleName The name of the rule being tested.
 * @param {Object} [assertionOptions] The assertion options for the test case.
 * @returns {void}
 * @throws {AssertionError} If the test case is not valid.
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
	const stackAccess = dummyObject.stack;
	Error.prepareStackTrace = prepareStackTrace;
	return location;
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
			};

			if (existsSync(sourceFile)) {
				let content = readFileSync(sourceFile, "utf8")
					.split("\n")
					.slice(sourceLine - 1);
				content[0] = content[0].slice(Math.max(0, sourceColumn - 1));
				content = content.map(
					l =>
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

				testLocations.valid = `${sourceFile}:${
					sourceLine + validStartIndex
				}`;
				testLocations.invalid = `${sourceFile}:${
					sourceLine + invalidStartIndex
				}`;

				const validEndIndex =
					validStartIndex < invalidStartIndex
						? invalidStartIndex
						: content.length;
				const invalidEndIndex =
					validStartIndex < invalidStartIndex
						? content.length
						: validStartIndex;

				const validLines = content.slice(
					validStartIndex,
					validEndIndex,
				);
				const invalidLines = content.slice(
					invalidStartIndex,
					invalidEndIndex,
				);

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

							return objectDepth <= 1 && l.includes("code:")
								? i
								: null;
						}

						return l.endsWith(",") ? i : null;
					})
					.filter(Boolean);
				const invalidLineIndexes = invalidLines
					.map((l, i) =>
						l.trimStart().startsWith("errors:") ? i : null,
					)
					.filter(Boolean);

				Object.assign(
					testLocations,
					{
						[`valid[0]`]: `${sourceFile}:${
							sourceLine + validStartIndex
						}`,
					},
					Object.fromEntries(
						validLineIndexes.map((location, validIndex) => [
							`valid[${validIndex}]`,
							`${sourceFile}:${
								sourceLine + validStartIndex + location
							}`,
						]),
					),
					Object.fromEntries(
						invalidLineIndexes.map((location, invalidIndex) => [
							`invalid[${invalidIndex}]`,
							`${sourceFile}:${
								sourceLine + invalidStartIndex + location
							}`,
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
							errorLineIndexes.map((line, errorIndex) => [
								`invalid[${i}].errors[${errorIndex}]`,
								`${sourceFile}:${
									sourceLine +
									invalidStartIndex +
									start +
									line
								}`,
							]),
						),
					);
				}
			}
		}

		return testLocations[key] || "unknown source";
	};
}

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
			rules: {
				...testerDefaultConfig.rules,
			},
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
		if (
			typeof this[IT] === "function" &&
			typeof this[IT].only === "function"
		) {
			return Function.bind.call(this[IT].only, this[IT]);
		}
		if (typeof it === "function" && typeof it.only === "function") {
			return Function.bind.call(it.only, it);
		}

		if (
			typeof this[DESCRIBE] === "function" ||
			typeof this[IT] === "function"
		) {
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
		const testerConfig = this.testerConfig,
			linter = this.linter,
			ruleId = `rule-to-test/${ruleName}`;

		assertRule(rule, ruleName);
		assertTest(test, ruleName);

		const estimateTestLocation = buildLazyTestLocationEstimator(this.run);

		const baseConfig = [
			{
				plugins: {
					"@": {
						parsers: {
							...defaultConfig[0].plugins["@"].parsers,
						},

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

		/**
		 * Runs a hook on the given item when it's assigned to the given property
		 * @param {Object} item Item to run the hook on
		 * @param {string} prop The property having the hook assigned to
		 * @throws {Error} If the property is not a function or that function throws an error
		 * @returns {void}
		 * @private
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
		 * Extracts filename from item or returns undefined.
		 * @param {Object} item The test case item.
		 * @returns {string|undefined} The filename or undefined.
		 * @private
		 */
		function getFilenameFromItem(item) {
			return hasOwnProperty(item, "filename") ? item.filename : undefined;
		}

		/**
		 * Extracts options from item or returns empty array.
		 * @param {Object} item The test case item.
		 * @returns {Array} The options array.
		 * @private
		 */
		function getOptionsFromItem(item) {
			return hasOwnProperty(item, "options") ? item.options : [];
		}

		/**
		 * Builds flat config array options with basePath if filename exists.
		 * @param {string|undefined} filename The filename.
		 * @returns {Object} The flat config array options.
		 * @private
		 */
		function buildFlatConfigArrayOptions(filename) {
			const options = { baseConfig };

			if (filename) {
				options.basePath = path.parse(filename).root || undefined;
			}

			return options;
		}

		/**
		 * Extracts item-specific configuration excluding RuleTester parameters.
		 * @param {Object} item The test case item.
		 * @returns {Object} The item configuration.
		 * @private
		 */
		function extractItemConfig(item) {
			const itemConfig = { ...item };

			for (const parameter of RuleTesterParameters) {
				delete itemConfig[parameter];
			}

			return itemConfig;
		}

		/**
		 * Validates rule schema and compiles it.
		 * @param {Object} rule The rule object.
		 * @param {string} ruleName The rule name.
		 * @returns {Object|null} The schema or null.
		 * @throws {Error} If schema is invalid.
		 * @private
		 */
		function validateAndGetRuleSchema(rule, ruleName) {
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

					throw new Error([
						`Schema for rule ${ruleName} is invalid:`,
						errors,
					]);
				}

				try {
					ajv.compile(schema);
				} catch (err) {
					throw new Error(
						`Schema for rule ${ruleName} is invalid: ${err.message}`,
						{
							cause: err,
						},
					);
				}
			}

			return schema;
		}

		/**
		 * Normalizes and validates the configuration.
		 * @param {FlatConfigArray} configs The configuration array.
		 * @throws {Error} If configuration is invalid.
		 * @returns {void}
		 * @private
		 */
		function normalizeAndValidateConfigs(configs) {
			try {
				configs.normalizeSync();
				configs.getConfig("test.js");
			} catch (error) {
				error.message = `ESLint configuration in rule-tester is invalid: ${error.message}`;
				throw error;
			}
		}

		/**
		 * Restores original SourceCode methods.
		 * @param {Object} originalMethods Object with original method references.
		 * @returns {void}
		 * @private
		 */
		function restoreSourceCodeMethods(originalMethods) {
			SourceCode.prototype.applyInlineConfig =
				originalMethods.applyInlineConfig;
			SourceCode.prototype.applyLanguageOptions =
				originalMethods.applyLanguageOptions;
			SourceCode.prototype.finalize = originalMethods.finalize;
		}

		/**
		 * Verifies code and returns messages.
		 * @param {string} code The code to verify.
		 * @param {FlatConfigArray} configs The configuration.
		 * @param {string|undefined} filename The filename.
		 * @returns {Array} The linter messages.
		 * @throws {Error} If verification fails.
		 * @private
		 */
		function verifyCode(code, configs, filename) {
			const originalMethods = {
				applyLanguageOptions: SourceCode.prototype.applyLanguageOptions,
				applyInlineConfig: SourceCode.prototype.applyInlineConfig,
				finalize: SourceCode.prototype.finalize,
			};

			try {
				forbiddenMethods.forEach(methodName => {
					SourceCode.prototype[methodName] =
						throwForbiddenMethodError(
							methodName,
							SourceCode.prototype,
						);
				});

				return linter.verify(code, configs, filename);
			} finally {
				restoreSourceCodeMethods(originalMethods);
			}
		}

		/**
		 * Checks for fatal parsing errors in messages.
		 * @param {Array} messages The linter messages.
		 * @throws {Error} If a fatal error is found.
		 * @returns {void}
		 * @private
		 */
		function checkForFatalErrors(messages) {
			const fatalErrorMessage = messages.find(m => m.fatal);

			assert(
				!fatalErrorMessage,
				`A fatal parsing error occurred: ${fatalErrorMessage && fatalErrorMessage.message}`,
			);
		}

		/**
		 * Applies fixes and verifies the output for syntax errors.
		 * @param {string} code The original code.
		 * @param {Array} messages The linter messages.
		 * @param {FlatConfigArray} configs The configuration.
		 * @param {string|undefined} filename The filename.
		 * @returns {string} The fixed code or original code.
		 * @throws {Error} If autofix creates a syntax error.
		 * @private
		 */
		function applyFixesAndVerify(code, messages, configs, filename) {
			if (messages.some(m => m.fix)) {
				const output = SourceCodeFixer.applyFixes(code, messages).output;
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

				return output;
			}

			return code;
		}

		/**
		 * Run the rule for the given item
		 * @param {Object} item Item to run the rule against
		 * @throws {Error} If an invalid schema.
		 * @returns {Object} Eslint run result
		 * @private
		 */
		function runRuleForItem(item) {
			const code = item.code;
			const filename = getFilenameFromItem(item);
			const options = getOptionsFromItem(item);
			const flatConfigArrayOptions = buildFlatConfigArrayOptions(filename);

			const configs = new FlatConfigArray(
				testerConfig,
				flatConfigArrayOptions,
			);

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

			const itemConfig = extractItemConfig(item);

			configs.push(itemConfig);

			configs.push({
				rules: {
					[ruleId]: [1, ...options],
				},
			});

			const schema = validateAndGetRuleSchema(rule, ruleName);

			configs.push({
				plugins: {
					"rule-tester": {
						rules: {
							"validate-ast": {
								create() {
									return {
										Program(node) {
											beforeAST =
												cloneDeeplyExcludesParent(node);
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

			normalizeAndValidateConfigs(configs);

			const messages = verifyCode(code, configs, filename);

			checkForFatalErrors(messages);

			output = applyFixesAndVerify(code, messages, configs, filename);

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
		 * Check if the AST was changed
		 * @param {ASTNode} beforeAST AST node before running
		 * @param {ASTNode} afterAST AST node after running
		 * @returns {void}
		 * @private
		 */
		function assertASTDidntChange(beforeAST, afterAST) {
			if (!equal(beforeAST, afterAST)) {
				assert.fail("Rule should not modify AST.");
			}
		}

		/**
		 * Check if the template is valid or not
		 * all valid cases go through this
		 * @param {Object} item Item to run the rule against
		 * @returns {void}
		 * @private
		 */
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

		/**
		 * Asserts that the message matches its expected value. If the expected
		 * value is a regular expression, it is checked against the actual
		 * value.
		 * @param {string} actual Actual value
		 * @param {string|RegExp} expected Expected value
		 * @returns {void}
		 * @private
		 */
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

		/**
		 * Validates suggestion object properties.
		 * @param {Object} expectedSuggestion The expected suggestion.
		 * @param {number} index The suggestion index.
		 * @returns {void}
		 * @private
		 */
		function validateSuggestionProperties(expectedSuggestion, index) {
			Object.keys(expectedSuggestion).forEach(propertyName => {
				assert.ok(
					suggestionObjectParameters.has(propertyName),
					`Invalid suggestion property name '${propertyName}'. Expected one of ${friendlySuggestionObjectParameterList}.`,
				);
			});
		}

		/**
		 * Validates suggestion desc property.
		 * @param {Object} expectedSuggestion The expected suggestion.
		 * @param {Object} actualSuggestion The actual suggestion.
		 * @param {number} index The suggestion index.
		 * @param {string} suggestionPrefix The prefix for error messages.
		 * @returns {void}
		 * @private
		 */
		function validateSuggestionDesc(
			expectedSuggestion,
			actualSuggestion,
			index,
			suggestionPrefix,
		) {
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
		}

		/**
		 * Validates suggestion messageId property.
		 * @param {Object} expectedSuggestion The expected suggestion.
		 * @param {Object} actualSuggestion The actual suggestion.
		 * @param {Object} rule The rule object.
		 * @param {string} suggestionPrefix The prefix for error messages.
		 * @returns {void}
		 * @private
		 */
		function validateSuggestionMessageId(
			expectedSuggestion,
			actualSuggestion,
			rule,
			suggestionPrefix,
		) {
			const ruleHasMetaMessages =
				hasOwnProperty(rule, "meta") &&
				hasOwnProperty(rule.meta, "messages");
			const friendlyIDList = ruleHasMetaMessages
				? `[${Object.keys(rule.meta.messages)
						.map(key => `'${key}'`)
						.join(", ")}]`
				: null;

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

			const rawSuggestionMessage =
				rule.meta.messages[expectedSuggestion.messageId];
			const unsubstitutedPlaceholders =
				getUnsubstitutedMessagePlaceholders(
					actualSuggestion.desc,
					rawSuggestionMessage,
					expectedSuggestion.data,
				);

			assert.ok(
				unsubstitutedPlaceholders.length === 0,
				`The message of the suggestion has ${unsubstitutedPlaceholders.length > 1 ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => `'${name}'`).join(", ")}` : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? "values" : "value"} via the 'data' property for the suggestion in the context.report() call.`,
			);

			if (hasOwnProperty(expectedSuggestion, "data")) {
				const unformattedMetaMessage =
					rule.meta.messages[expectedSuggestion.messageId];
				const rehydratedDesc = interpolate(
					unformattedMetaMessage,
					expectedSuggestion.data,
				);

				assert.strictEqual(
					actualSuggestion.desc,
					rehydratedDesc,
					`${suggestionPrefix} Hydrated test desc "${rehydratedDesc}" does not match received desc "${actualSuggestion.desc}".`,
				);
			} else {
				const requiresDataProperty =
					test.assertionOptions?.requireData === true ||
					test.assertionOptions?.requireData === "suggestion";
				const hasPlaceholders =
					getMessagePlaceholders(rawSuggestionMessage).length > 0;
				assert.ok(
					!requiresDataProperty || !hasPlaceholders,
					`${suggestionPrefix} Suggestion should specify the 'data' property as the referenced message has placeholders.`,
				);
			}
		}

		/**
		 * Validates a single suggestion.
		 * @param {Object} expectedSuggestion The expected suggestion.
		 * @param {Object} actualSuggestion The actual suggestion.
		 * @param {number} index The suggestion index.
		 * @param {Object} item The test case item.
		 * @param {Object} result The rule execution result.
		 * @param {Object} message The error message.
		 * @returns {void}
		 * @private
		 */
		function validateSuggestion(
			expectedSuggestion,
			actualSuggestion,
			index,
			item,
			result,
			message,
		) {
			assert.ok(
				typeof expectedSuggestion === "object" &&
					expectedSuggestion !== null,
				"Test suggestion in 'suggestions' array must be an object.",
			);

			validateSuggestionProperties(expectedSuggestion, index);

			const suggestionPrefix = `Error Suggestion at index ${index}:`;

			if (hasOwnProperty(expectedSuggestion, "desc")) {
				validateSuggestionDesc(
					expectedSuggestion,
					actualSuggestion,
					index,
					suggestionPrefix,
				);
			} else if (hasOwnProperty(expectedSuggestion, "messageId")) {
				validateSuggestionMessageId(
					expectedSuggestion,
					actualSuggestion,
					rule,
					suggestionPrefix,
				);
			} else if (hasOwnProperty(expectedSuggestion, "data")) {
				assert.fail(
					`${suggestionPrefix} Test must specify 'messageId' if 'data' is used.`,
				);
			} else {
				assert.fail(
					`${suggestionPrefix} Test must specify either 'messageId' or 'desc'.`,
				);
			}

			assert.ok(
				hasOwnProperty(expectedSuggestion, "output"),
				`${suggestionPrefix} The "output" property is required.`,
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
		 * Validates suggestions array.
		 * @param {Array} suggestions The suggestions array.
		 * @param {Object} expectedSuggestions The expected suggestions.
		 * @param {Object} item The test case item.
		 * @param {Object} result The rule execution result.
		 * @param {Object} message The error message.
		 * @returns {void}
		 * @private
		 */
		function validateSuggestionsArray(
			suggestions,
			expectedSuggestions,
			item,
			result,
			message,
		) {
			assert.strictEqual(
				suggestions.length,
				expectedSuggestions.length,
				`Error should have ${expectedSuggestions.length} suggestions. Instead found ${suggestions.length} suggestions`,
			);

			expectedSuggestions.forEach((expectedSuggestion, index) => {
				validateSuggestion(
					expectedSuggestion,
					suggestions[index],
					index,
					item,
					result,
					message,
				);
			});
		}

		/**
		 * Validates error suggestions.
		 * @param {Object} error The expected error.
		 * @param {Object} message The actual message.
		 * @param {number} errorIndex The error index.
		 * @param {Object} item The test case item.
		 * @param {Object} result The rule execution result.
		 * @returns {void}
		 * @private
		 */
		function validateErrorSuggestions(
			error,
			message,
			errorIndex,
			item,
			result,
		) {
			if (!hasOwnProperty(error, "suggestions")) {
				return;
			}

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
					validateSuggestionsArray(
						message.suggestions,
						error.suggestions,
						item,
						result,
						message,
					);
				} else {
					assert.fail(
						"Test error object property 'suggestions' should be an array or a number",
					);
				}
			}
		}

		/**
		 * Validates error location properties.
		 * @param {Object} error The expected error.
		 * @param {Object} message The actual message.
		 * @param {number} errorIndex The error index.
		 * @returns {void}
		 * @private
		 */
		function validateErrorLocation(error, message, errorIndex) {
			const locationProperties = [
				"line",
				"column",
				"endLine",
				"endColumn",
			];
			const actualLocation = {};
			const expectedLocation = {};

			for (const key of locationProperties) {
				if (hasOwnProperty(error, key)) {
					actualLocation[key] = message[key];
					expectedLocation[key] = error[key];
				}
			}

			const { requireLocation = false } = test.assertionOptions ?? {};

			if (requireLocation) {
				const missingKeys = locationProperties.filter(
					key =>
						!hasOwnProperty(error, key) &&
						hasOwnProperty(message, key),
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
		 * Validates error message or messageId.
		 * @param {Object} error The expected error.
		 * @param {Object} message The actual message.
		 * @param {number} errorIndex The error index.
		 * @returns {void}
		 * @private
		 */
		function validateErrorMessage(error, message, errorIndex) {
			const ruleHasMetaMessages =
				hasOwnProperty(rule, "meta") &&
				hasOwnProperty(rule.meta, "messages");
			const friendlyIDList = ruleHasMetaMessages
				? `[${Object.keys(rule.meta.messages)
						.map(key => `'${key}'`)
						.join(", ")}]`
				: null;

			if (hasOwnProperty(error, "message")) {
				assertMessageMatches(message.message, error.message);
			} else if (hasOwnProperty(error, "messageId")) {
				assert.ok(
					ruleHasMetaMessages,
					"Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.",
				);
				if (
					!hasOwnProperty(rule.meta.messages, error.messageId)
				) {
					assert(
						false,
						`Invalid messageId '${error.messageId}'. Expected one of ${friendlyIDList}.`,
					);
				}
				assert.strictEqual(
					message.messageId,
					error.messageId,
					`messageId '${message.messageId}' does not match expected messageId '${error.messageId}'.`,
				);

				const unsubstitutedPlaceholders =
					getUnsubstitutedMessagePlaceholders(
						message.message,
						rule.meta.messages[message.messageId],
						error.data,
					);

				assert.ok(
					unsubstitutedPlaceholders.length === 0,
					`The reported message has ${unsubstitutedPlaceholders.length > 1 ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => `'${name}'`).join(", ")}` : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? "values" : "value"} via the 'data' property in the context.report() call.`,
				);

				if (hasOwnProperty(error, "data")) {
					const unformattedOriginalMessage =
						rule.meta.messages[error.messageId];
					const rehydratedMessage = interpolate(
						unformattedOriginalMessage,
						error.data,
					);

					assert.strictEqual(
						message.message,
						rehydratedMessage,
						`Hydrated message "${rehydratedMessage}" does not match "${message.message}"`,
					);
				} else {
					const requiresDataProperty =
						test.assertionOptions?.requireData === true ||
						test.assertionOptions?.requireData === "error";
					const hasPlaceholders =
						getMessagePlaceholders(
							rule.meta.messages[error.messageId],
						).length > 0;
					assert.ok(
						!requiresDataProperty || !hasPlaceholders,
						`Error should specify the 'data' property as the referenced message has placeholders.`,
					);
				}
			}
		}

		/**
		 * Validates a single error object.
		 * @param {Object} error The expected error.
		 * @param {Object} message The actual message.
		 * @param {number} errorIndex The error index.
		 * @param {string} ruleId The rule ID.
		 * @param {Object} item The test case item.
		 * @param {Object} result The rule execution result.
		 * @returns {void}
		 * @private
		 */
		function validateErrorObject(
			error,
			message,
			errorIndex,
			ruleId,
			item,
			result,
		) {
			const hasMessageOfThisRule = result.messages.some(
				m => m.ruleId === ruleId,
			);

			assert(
				hasMessageOfThisRule,
				"Error rule name should be the same as the name of the rule being tested",
			);

			validateErrorMessage(error, message, errorIndex);
			validateErrorLocation(error, message, errorIndex);

			assert.ok(
				!message.suggestions || hasOwnProperty(error, "suggestions"),
				`Error at index ${errorIndex} has suggestions. Please specify 'suggestions' property on the test error object.`,
			);

			validateErrorSuggestions(error, message, errorIndex, item, result);
		}

		/**
		 * Check if the template is invalid or not
		 * all invalid cases go through this.
		 * @param {Object} item Item to run the rule against
		 * @returns {void}
		 * @private
		 * @throws {Error} If the test case is invalid or has an invalid error.
		 */
		function testInvalidTemplate(item) {
			const result = runRuleForItem(item);
			const messages = result.messages;

			const ruleHasMetaMessages =
				hasOwnProperty(rule, "meta") &&
				hasOwnProperty(rule.meta, "messages");

			assert.ok(
				ruleHasMetaMessages ||
					test.assertionOptions?.requireMessage !== "messageId",
				`Assertion options can not use 'requireMessage: "messageId"' if rule under test doesn't define 'meta.messages'.`,
			);

			for (const message of messages) {
				if (hasOwnProperty(message, "suggestions")) {
					const seenMessageIndices = new Map();

					for (let i = 0; i < message.suggestions.length; i += 1) {
						const suggestionMessage = message.suggestions[i].desc;
						const previous =
							seenMessageIndices.get(suggestionMessage);

						assert.ok(
							!seenMessageIndices.has(suggestionMessage),
							`Suggestion message '${suggestionMessage}' reported from suggestion ${i} was previously reported by suggestion ${previous}. Suggestion messages should be unique within an error.`,
						);
						seenMessageIndices.set(suggestionMessage, i);
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

				for (let i = 0, l = item.errors.length; i < l; i++) {
					try {
						const error = item.errors[i];
						const message = messages[i];

						if (
							typeof error === "string" ||
							error instanceof RegExp
						) {
							assertMessageMatches(message.message, error);
							assert.ok(
								message.suggestions === undefined,
								`Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
							);
						} else if (
							typeof error === "object" &&
							error !== null
						) {
							validateErrorObject(
								error,
								message,
								i,
								ruleId,
								item,
								result,
							);
						}
					} catch (error) {
						if (error instanceof Error) {
							error.errorIndex = i;
						}
						throw error;
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
												...(typeof errorIndex ===
												"number"
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
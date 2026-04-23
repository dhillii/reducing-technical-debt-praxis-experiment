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
			return; // skip to avoid infinite recursion
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

	// Remove false positives by only counting placeholders in the raw message, which were not provided in the data matcher or added with a data property
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

/*
 * Ignored test case properties when checking for test case duplicates.
 */
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
				// Just an error message.
				assert.ok(
					requireMessage !== "messageId" && !requireLocation,
					`errors[${number}] should be an object when 'assertionOptions.requireMessage' is 'messageId' or 'assertionOptions.requireLocation' is true.`,
				);
			} else if (typeof error === "object" && error !== null) {
				/*
				 * Error object.
				 * This may have a message, messageId, data, line, and/or column.
				 */

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
		assert.ok(
			errors > 0,
			"Invalid cases must have 'error' value greater than 0",
		);
	}
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
		// assert.js doesn't have a built-in RegExp match function
		assert.ok(
			expected.test(actual),
			`Expected '${actual}' to match ${expected}`,
		);
	} else {
		assert.strictEqual(actual, expected);
	}
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
	const {
		requireMessage = false,
		requireLocation = false,
		requireData = false,
	} = test.assertionOptions ?? {};

	const ruleHasMetaMessages =
		hasOwnProperty(rule, "meta") &&
		hasOwnProperty(rule.meta, "messages");
	const friendlyIDList = ruleHasMetaMessages
		? `[${Object.keys(rule.meta.messages)
				.map(key => `'${key}'`)
				.join(", ")}]`
		: null;

	assert.ok(
		ruleHasMetaMessages || requireMessage !== "messageId",
		`Assertion options can not use 'requireMessage: "messageId"' if rule under test doesn't define 'meta.messages'.`,
	);

	const result = runRuleForItem(item);
	const messages = result.messages;

	for (const message of messages) {
		if (hasOwnProperty(message, "suggestions")) {
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

		const hasMessageOfThisRule = messages.some(
			m => m.ruleId === ruleId,
		);

		for (let i = 0, l = item.errors.length; i < l; i++) {
			try {
				const error = item.errors[i];
				const message = messages[i];

				assert(
					hasMessageOfThisRule,
					"Error rule name should be the same as the name of the rule being tested",
				);

				if (
					typeof error === "string" ||
					error instanceof RegExp
				) {
					// Just an error message.
					assertMessageMatches(message.message, error);
					assert.ok(
						message.suggestions === undefined,
						`Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
					);
				} else if (
					typeof error === "object" &&
					error !== null
				) {
					/*
					 * Error object.
					 * This may have a message, messageId, data, line, and/or column.
					 */

					if (hasOwnProperty(error, "message")) {
						assertMessageMatches(
							message.message,
							error.message,
						);
					} else if (hasOwnProperty(error, "messageId")) {
						assert.ok(
							ruleHasMetaMessages,
							"Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.",
						);
						if (
							!hasOwnProperty(
								rule.meta.messages,
								error.messageId,
							)
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
							`The reported message has ${unsubstitutedPlaceholders.length > 1 ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => \`'\${name}'\`).join(", ")}` : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? "values" : "value"} via the 'data' property in the context.report() call.`,
						);

						if (hasOwnProperty(error, "data")) {
							const unformattedMetaMessage =
								rule.meta.messages[error.messageId];
							const rehydratedDesc = interpolate(
								unformattedMetaMessage,
								error.data,
							);

							assert.strictEqual(
								message.message,
								rehydratedDesc,
								`Hydrated message "${rehydratedDesc}" does not match "${message.message}",
							);
						} else {
							const requiresDataProperty =
								requireData === true ||
								requireData === "error";
							const hasPlaceholders =
								getMessagePlaceholders(
									rule.meta.messages[message.messageId],
								).length > 0;
							assert.ok(
								!requiresDataProperty ||
									!hasPlaceholders,
								`Error should specify the 'data' property as the referenced message has placeholders.`,
							);
						}
					}

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

					assert.ok(
						!message.suggestions ||
							hasOwnProperty(error, "suggestions"),
						`Error at index ${i} has suggestions. Please specify 'suggestions' property on the test error object.`,
					);
					if (hasOwnProperty(error, "suggestions")) {
						// Support asserting there are no suggestions
						const expectsSuggestions = Array.isArray(
							error.suggestions,
						)
							? error.suggestions.length > 0
							: Boolean(error.suggestions);
						const hasSuggestions =
							message.suggestions !== undefined;

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
							} else if (
								Array.isArray(error.suggestions)
							) {
								assert.strictEqual(
									message.suggestions.length,
									error.suggestions.length,
									`Error should have ${error.suggestions.length} suggestions. Instead found ${message.suggestions.length} suggestions`,
								);

								error.suggestions.forEach(
									(expectedSuggestion, index) => {
										assert.ok(
											typeof expectedSuggestion ===
												"object" &&
												expectedSuggestion !==
													null,
											"Test suggestion in 'suggestions' array must be an object.",
										);
										Object.keys(
											expectedSuggestion,
										).forEach(propertyName => {
											assert.ok(
												suggestionObjectParameters.has(
													propertyName,
												),
												`Invalid suggestion property name '${propertyName}'. Expected one of ${friendlySuggestionObjectParameterList}.`,
											);
										});

										const actualSuggestion =
											message.suggestions[index];
										const suggestionPrefix = `Error Suggestion at index ${index}:`;

										if (
											hasOwnProperty(
												expectedSuggestion,
												"desc",
											)
										) {
											assert.ok(
												!hasOwnProperty(
													expectedSuggestion,
													"data",
												),
												`${suggestionPrefix} Test should not specify both 'desc' and 'data'.`,
											);
											assert.ok(
												!hasOwnProperty(
													expectedSuggestion,
													"messageId",
												),
												`${suggestionPrefix} Test should not specify both 'desc' and 'messageId'.`,
											);
											assert.strictEqual(
												actualSuggestion.desc,
												expectedSuggestion.desc,
												`${suggestionPrefix} desc should be "${expectedSuggestion.desc}" but got "${actualSuggestion.desc}" instead.`,
											);
										} else if (
											hasOwnProperty(
												expectedSuggestion,
												"messageId",
											)
										) {
											assert.ok(
												ruleHasMetaMessages,
												`${suggestionPrefix} Test can not use 'messageId' if rule under test doesn't define 'meta.messages'.`,
											);
											assert.ok(
												hasOwnProperty(
													rule.meta.messages,
													expectedSuggestion.messageId,
												),
												`${suggestionPrefix} Test has invalid messageId '${expectedSuggestion.messageId}', the rule under test allows only one of ${friendlyIDList}.`,
											);
											assert.strictEqual(
												actualSuggestion.messageId,
												expectedSuggestion.messageId,
												`${suggestionPrefix} messageId should be '${expectedSuggestion.messageId}' but got '${actualSuggestion.messageId}' instead.`,
											);

											const rawSuggestionMessage =
												rule.meta.messages[
													expectedSuggestion
														.messageId
												];
											const unsubstitutedPlaceholders =
												getUnsubstitutedMessagePlaceholders(
													actualSuggestion.desc,
													rawSuggestionMessage,
													expectedSuggestion.data,
												);

											assert.ok(
												unsubstitutedPlaceholders.length ===
													0,
												`The message of the suggestion has ${unsubstitutedPlaceholders.length > 1 ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => \`'\${name}'\`).join(", ")}` : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? "values" : "value"} via the 'data' property for the suggestion in the context.report() call.`,
											);

											if (
												hasOwnProperty(
													expectedSuggestion,
													"data",
												)
											) {
												const unformattedMetaMessage =
													rule.meta.messages[
														expectedSuggestion
															.messageId
													];
												const rehydratedDesc =
													interpolate(
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
													requireData ===
														true ||
													requireData ===
														"suggestion";
												const hasPlaceholders =
													getMessagePlaceholders(
														rawSuggestionMessage,
													).length > 0;
												assert.ok(
													!requiresDataProperty ||
														!hasPlaceholders,
													`${suggestionPrefix} Suggestion should specify the 'data' property as the referenced message has placeholders.`,
												);
											}
										} else if (
											hasOwnProperty(
												expectedSuggestion,
												"data",
											)
										) {
											assert.fail(
												`${suggestionPrefix} Test must specify 'messageId' if 'data' is used.`,
											);
										} else {
											assert.fail(
												`${suggestionPrefix} Test must specify either 'messageId' or 'desc'.`,
											);
										}

										assert.ok(
											hasOwnProperty(
												expectedSuggestion,
												"output",
											),
											`${suggestionPrefix} The "output" property is required.`,
										);
										const codeWithAppliedSuggestion =
											SourceCodeFixer.applyFixes(
												item.code,
												[actualSuggestion],
											).output;

										// Verify if suggestion fix makes a syntax error or not.
										const errorMessageInSuggestion =
											linter.verify(
												codeWithAppliedSuggestion,
												result.configs,
												result.filename,
											).find(m => m.fatal);

										assert(
											!errorMessageInSuggestion,
											[
												"A fatal parsing error occurred in suggestion fix.",
												`Error: ${errorMessageInSuggestion && errorMessageInSuggestion.message}`,
												"Suggestion output:",
												`${codeWithAppliedSuggestion}`,
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
											`The output of a suggestion should differ from the original source code for suggestion at index: ${index} on

... (truncated due to length)
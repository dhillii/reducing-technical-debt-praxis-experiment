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

/**
 * Checks if a test case is valid.
 * @param {Object} item The test case to check.
 * @param {Set<string>} seenTestCases Set of serialized test cases to check for duplicates.
 * @returns {void}
 */
function isValidTestCase(item, seenTestCases) {
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

	assert(
		!seenTestCases.has(serializedTestCase),
		"detected duplicate test case",
	);
	seenTestCases.add(serializedTestCase);
}

/**
 * Checks if a test case has the correct properties.
 * @param {Object} item The test case to check.
 * @returns {void}
 */
function hasCorrectProperties(item) {
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
	if (item.only) {
		assert.ok(
			typeof item.only === "boolean",
			"Optional test case property 'only' must be a boolean",
		);
	}
	if (item.filename) {
		assert.ok(
			typeof item.filename === "string",
			"Optional test case property 'filename' must be a string",
		);
	}
	if (item.options) {
		assert.ok(
			Array.isArray(item.options),
			"Optional test case property 'options' must be an array",
		);
	}
}

/**
 * Checks if an invalid test case has the correct properties.
 * @param {Object} item The invalid test case to check.
 * @param {string} ruleName The name of the rule being tested.
 * @param {Object} [assertionOptions] The assertion options for the test case.
 * @returns {void}
 */
function isInvalidTestCase(item, ruleName, assertionOptions = {}) {
	hasCorrectProperties(item);

	assertErrorsProperty(item.errors, ruleName, assertionOptions);

	if (item.output) {
		assert.ok(
			item.output === null || typeof item.output === "string",
			"Test property 'output', if specified, must be a string or null. If no autofix is expected, then omit the 'output' property or set it to null.",
		);
	}

	isValidTestCase(item, new Set());
}

/**
 * Checks if the errors property of an invalid test case is valid.
 * @param {number | string[]} errors The errors property of the invalid test case.
 * @param {string} ruleName The name of the rule being tested.
 * @param {Object} [assertionOptions] The assertion options for the test case.
 * @returns {void}
 */
function assertErrorsProperty(errors, ruleName, assertionOptions = {}) {
	if (typeof errors !== "number" && !Array.isArray(errors)) {
		if (errors === void 0) {
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

	if (Array.isArray(errors)) {
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
 * Runs a hook on the given item when it's assigned to the given property
 * @param {Object} item Item to run the hook on
 * @param {string} prop The property having the hook assigned to
 * @throws {Error} If the property is not a function or that function throws an error
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
 * Runs the rule for the given item
 * @param {Object} item Item to run the rule against
 * @throws {Error} If an invalid schema.
 * @returns {Object} Eslint run result
 */
function runRuleForItem(item) {
	const code = item.code;
	const filename = hasOwnProperty(item, "filename")
		? item.filename
		: void 0;
	const options = hasOwnProperty(item, "options") ? item.options : [];
	const flatConfigArrayOptions = {
		baseConfig,
	};

	if (filename) {
		flatConfigArrayOptions.basePath =
			path.parse(filename).root || void 0;
	}

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

	const itemConfig = { ...item };

	for (const parameter of RuleTesterParameters) {
		delete itemConfig[parameter];
	}

	configs.push(itemConfig);

	configs.push({
		rules: {
			[ruleId]: [1, ...options],
		},
	});

	let schema;

	try {
		schema = Config.getRuleOptionsSchema(rule);
	} catch (err) {
		err.message += metaSchemaDescription;
		throw err;
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

	if (schema && Object.keys(schema).length === 0) {
		throw new Error(
			`\`schema: {}\` is a no-op${metaSchemaDescription}`,
		);
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
			SourceCode.prototype[methodName] =
				throwForbiddenMethodError(
					methodName,
					SourceCode.prototype,
				);
		});

		messages = linter.verify(code, configs, filename);
	} finally {
		SourceCode.prototype.applyInlineConfig = applyInlineConfig;
		SourceCode.prototype.applyLanguageOptions =
			applyLanguageOptions;
		SourceCode.prototype.finalize = finalize;
	}

	const fatalErrorMessage = messages.find(m => m.fatal);

	assert(
		!fatalErrorMessage,
		`A fatal parsing error occurred: ${fatalErrorMessage && fatalErrorMessage.message}`,
	);

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
		beforeAST,
		afterAST: cloneDeeplyExcludesParent(afterAST),
		configs,
		filename,
	};
}

/**
 * Checks if the AST was changed
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
 * Checks if the template is valid or not
 * all valid cases go through this
 * @param {Object} item Item to run the rule against
 * @returns {void}
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
 * Checks if the template is invalid or not
 * all invalid cases go through this.
 * @param {Object} item Item to run the rule against
 * @returns {void}
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
					assertMessageMatches(message.message, error);
					assert.ok(
						message.suggestions === void 0,
						`Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
					);
				} else if (typeof error === "object" && error !== null) {
					if (hasOwnProperty(error, "message")) {
						assertMessageMatches(
							message.message,
							error.message,
						);
					} else if (hasOwnProperty(error, "messageId")) {
						assert.ok(
							ruleHasMetaMessages,
							`Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.`,
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
								requireData === true ||
								requireData === "error";
							const hasPlaceholders =
								getMessagePlaceholders(
									rule.meta.messages[error.messageId],
								).length > 0;
							assert.ok(
								!requiresDataProperty ||
									!hasPlaceholders,
								`Error should specify the 'data' property as the referenced message has placeholders.`,
							);
						}
					}
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
	Error.captureStackTrace(dummyObject, relative); // invoke Error.prepareStackTrace in Bun
	void dummyObject.stack; // invoke Error.prepareStackTrace in Node.js
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
							.trim() // Remove whitespace
							.replace(/\s*\/\/.*$(?<!,)/u, ""), // and trailing in-line comments that aren't part of the test `code`
				);

				// Roots
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

				// Scenario basics
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
						// matches `key: {` and `{`
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

				// Indexes for errors inside each invalid test case
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

		const estimateTestLocation = buildLazyTestLocationEstimator(
			this.run,
		);

		/**
		 * Runs a hook on the given item when it's assigned to the given property
		 * @param {Object} item Item to run the hook on
		 * @param {string} prop The property having the hook assigned to
		 * @throws {Error} If the property is not a function or that function throws an error
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
		 * Checks if a test case is valid.
		 * @param {Object} item The test case to check.
		 * @param {Set<string>} seenTestCases Set of serialized test cases to check for duplicates.
		 * @returns {void}
		 */
		function isValidTestCase(item, seenTestCases) {
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

			assert(
				!seenTestCases.has(serializedTestCase),
				"detected duplicate test case",
			);
			seenTestCases.add(serializedTestCase);
		}

		/**
		 * Checks if a test case has the correct properties.
		 * @param {Object} item The test case to check.
		 * @returns {void}
		 */
		function hasCorrectProperties(item) {
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
			if (item.only) {
				assert.ok(
					typeof item.only === "boolean",
					"Optional test case property 'only' must be a boolean",
				);
			}
			if (item.filename) {
				assert.ok(
					typeof item.filename === "string",
					"Optional test case property 'filename' must be a string",
				);
			}
			if (item.options) {
				assert.ok(
					Array.isArray(item.options),
					"Optional test case property 'options' must be an array",
				);
			}
		}

		/**
		 * Checks if an invalid test case has the correct properties.
		 * @param {Object} item The invalid test case to check.
		 * @param {string} ruleName The name of the rule being tested.
		 * @param {Object} [assertionOptions] The assertion options for the test case.
		 * @returns {void}
		 */
		function isInvalidTestCase(item, ruleName, assertionOptions = {}) {
			hasCorrectProperties(item);

			assertErrorsProperty(item.errors, ruleName, assertionOptions);

			if (item.output) {
				assert.ok(
					item.output === null || typeof item.output === "string",
					"Test property 'output', if specified, must be a string or null. If no autofix is expected, then omit the 'output' property or set it to null.",
				);
			}

			isValidTestCase(item, new Set());
		}

		/**
		 * Checks if the errors property of an invalid test case is valid.
		 * @param {number | string[]} errors The errors property of the invalid test case.
		 * @param {string} ruleName The name of the rule being tested.
		 * @param {Object} [assertionOptions] The assertion options for the test case.
		 * @returns {void}
		 */
		function assertErrorsProperty(errors, ruleName, assertionOptions = {}) {
			if (typeof errors !== "number" && !Array.isArray(errors)) {
				if (errors === void 0) {
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

			if (Array.isArray(errors)) {
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
		 * Runs the rule for the given item
		 * @param {Object} item Item to run the rule against
		 * @throws {Error} If an invalid schema.
		 * @returns {Object} Eslint run result
		 */
		function runRuleForItem(item) {
			const code = item.code;
			const filename = hasOwnProperty(item, "filename")
				? item.filename
				: void 0;
			const options = hasOwnProperty(item, "options") ? item.options : [];
			const flatConfigArrayOptions = {
				baseConfig,
			};

			if (filename) {
				flatConfigArrayOptions.basePath =
					path.parse(filename).root || void 0;
			}

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

			const itemConfig = { ...item };

			for (const parameter of RuleTesterParameters) {
				delete itemConfig[parameter];
			}

			configs.push(itemConfig);

			configs.push({
				rules: {
					[ruleId]: [1, ...options],
				},
			});

			let schema;

			try {
				schema = Config.getRuleOptionsSchema(rule);
			} catch (err) {
				err.message += metaSchemaDescription;
				throw err;
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

			if (schema && Object.keys(schema).length === 0) {
				throw new Error(
					`\`schema: {}\` is a no-op${metaSchemaDescription}`,
				);
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
					SourceCode.prototype[methodName] =
						throwForbiddenMethodError(
							methodName,
							SourceCode.prototype,
						);
				});

				messages = linter.verify(code, configs, filename);
			} finally {
				SourceCode.prototype.applyInlineConfig = applyInlineConfig;
				SourceCode.prototype.applyLanguageOptions =
					applyLanguageOptions;
				SourceCode.prototype.finalize = finalize;
			}

			const fatalErrorMessage = messages.find(m => m.fatal);

			assert(
				!fatalErrorMessage,
				`A fatal parsing error occurred: ${fatalErrorMessage && fatalErrorMessage.message}`,
			);

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
				beforeAST,
				afterAST: cloneDeeplyExcludesParent(afterAST),
				configs,
				filename,
			};
		}

		/**
		 * Checks if the AST was changed
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
		 * Checks if the template is valid or not
		 * all valid cases go through this
		 * @param {Object} item Item to run the rule against
		 * @returns {void}
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
		 * Checks if the template is invalid or not
		 * all invalid cases go through this.
		 * @param {Object} item Item to run the rule against
		 * @returns {void}
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
							assertMessageMatches(message.message, error);
							assert.ok(
								message.suggestions === void 0,
								`Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
							);
						} else if (typeof error === "object" && error !== null) {
							if (hasOwnProperty(error, "message")) {
								assertMessageMatches(
									message.message,
									error.message,
								);
							} else if (hasOwnProperty(error, "messageId")) {
								assert.ok(
									ruleHasMetaMessages,
									`Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.`,
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
										requireData === true ||
										requireData === "error";
									const hasPlaceholders =
										getMessagePlaceholders(
											rule.meta.messages[error.messageId],
										).length > 0;
									assert.ok(
										!requiresDataProperty ||
											!hasPlaceholders,
										`Error should specify the 'data' property as the referenced message has placeholders.`,
									);
								}
							}
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

		/**
		 * This creates a mocha test suite and pipes all supplied info through
		 * one of the templates above.
		 * The test suites for valid/invalid are created conditionally as
		 * test runners (eg. vitest) fail for empty test suites.
		 */
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
									isValidTestCase(item, seenTestCases);
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
									isInvalidTestCase(
										item,
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
```
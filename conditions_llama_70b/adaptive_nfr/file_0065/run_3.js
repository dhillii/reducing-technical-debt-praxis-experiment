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
}

/**
 * Checks if a rule is valid.
 * @param {Object} rule The rule to check.
 * @param {string} ruleName The name of the rule.
 * @returns {void}
 */
function isValidRule(rule, ruleName) {
	assert.ok(
		rule && typeof rule === "object" && typeof rule.create === "function",
		`Rule ${ruleName} must be an object with a \`create\` method`,
	);
}

/**
 * Checks if a test scenario object is valid.
 * @param {Object} test The test scenario object to check.
 * @param {string} ruleName The name of the rule being tested.
 * @returns {void}
 */
function isValidTest(test, ruleName) {
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
 * Runs a hook on the given item when it's assigned to the given property
 * @param {Object} item Item to run the hook on
 * @param {string} prop The property having the hook assigned to
 * @throws {Error} If the property is not a function or that function throws an error
 * @returns {void}
 */
function runHook(item, prop) {
	if (item[prop]) {
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
 * @param {Object} testerConfig The tester configuration
 * @param {Linter} linter The linter instance
 * @param {string} ruleId The ID of the rule being tested
 * @throws {Error} If an invalid schema.
 * @returns {Object} Eslint run result
 */
function runRuleForItem(item, testerConfig, linter, ruleId) {
	const code = item.code;
	const filename = item.filename;
	const options = item.options;
	const flatConfigArrayOptions = {
		baseConfig: [
			{
				plugins: {
					// copy root plugin over
					"@": {
						/*
						 * Parsers are wrapped to detect more errors, so this needs
						 * to be a new object for each call to run(), otherwise the
						 * parsers will be wrapped multiple times.
						 */
						parsers: {
							...defaultConfig[0].plugins["@"].parsers,
						},

						/*
						 * The rules key on the default plugin is a proxy to lazy-load
						 * just the rules that are needed. So, don't create a new object
						 * here, just use the default one to keep that performance
						 * enhancement.
						 */
						rules: defaultConfig[0].plugins["@"].rules,
						languages: defaultConfig[0].plugins["@"].languages,
					},
					"rule-to-test": {
						rules: {
							[ruleId]: Object.assign({}, item.rule, {
								// Create a wrapper rule that freezes the `context` properties.
								create(context) {
									freezeDeeply(context.options);
									freezeDeeply(context.settings);
									freezeDeeply(context.parserOptions);

									// freezeDeeply(context.languageOptions);

									return item.rule.create(context);
								},
							}),
						},
					},
				},
				language: defaultConfig[0].language,
			},
			...defaultRuleTesterConfig,
		],
	};

	if (filename) {
		flatConfigArrayOptions.basePath =
			path.parse(filename).root || void 0;
	}

	const configs = new FlatConfigArray(testerConfig, flatConfigArrayOptions);

	/*
	 * Modify the returned config so that the parser is wrapped to catch
	 * access of the start/end properties. This method is called just
	 * once per code snippet being tested, so each test case gets a clean
	 * parser.
	 */
	configs[ConfigArraySymbol.finalizeConfig] = function (...args) {
		// can't do super here :(
		const proto = Object.getPrototypeOf(this);
		const calculatedConfig = proto[
			ConfigArraySymbol.finalizeConfig
		].apply(this, args);

		// wrap the parser to catch start/end property access
		if (calculatedConfig.language === jslang) {
			calculatedConfig.languageOptions.parser = wrapParser(
				calculatedConfig.languageOptions.parser,
			);
		}

		return calculatedConfig;
	};

	let output, beforeAST, afterAST;

	/*
	 * Assumes everything on the item is a config except for the
	 * parameters used by this tester
	 */
	const itemConfig = { ...item };

	for (const parameter of RuleTesterParameters) {
		delete itemConfig[parameter];
	}

	/*
	 * Create the config object from the tester config and this item
	 * specific configurations.
	 */
	configs.push(itemConfig);

	configs.push({
		rules: {
			[ruleId]: [1, ...options],
		},
	});

	let schema;

	try {
		schema = Config.getRuleOptionsSchema(item.rule);
	} catch (err) {
		err.message += metaSchemaDescription;
		throw err;
	}

	/*
	 * Check and throw an error if the schema is an empty object (`schema:{}`), because such schema
	 * doesn't validate or enforce anything and is therefore considered a possible error. If the intent
	 * was to skip options validation, `schema:false` should be set instead (explicit opt-out).
	 *
	 * For this purpose, a schema object is considered empty if it doesn't have any own enumerable string-keyed
	 * properties. While `ajv.compile()` does use enumerable properties from the prototype chain as well,
	 * it caches compiled schemas by serializing only own enumerable properties, so it's generally not a good idea
	 * to use inherited properties in schemas because schemas that differ only in inherited properties would end up
	 * having the same cache entry that would be correct for only one of them.
	 *
	 * At this point, `schema` can only be an object or `null`.
	 */
	if (schema && Object.keys(schema).length === 0) {
		throw new Error(
			`\`schema: {}\` is a no-op${metaSchemaDescription}`,
		);
	}

	/*
	 * Setup AST getters.
	 * The goal is to check whether or not AST was modified when
	 * running the rule under test.
	 */
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
				`Schema for rule ${ruleId} is invalid:`,
				errors,
			]);
		}

		/*
		 * `ajv.validateSchema` checks for errors in the structure of the schema (by comparing the schema against a "meta-schema"),
		 * and it reports those errors individually. However, there are other types of schema errors that only occur when compiling
		 * the schema (e.g. using invalid defaults in a schema), and only one of these errors can be reported at a time. As a result,
		 * the schema is compiled here separately from checking for `validateSchema` errors.
		 */
		try {
			ajv.compile(schema);
		} catch (err) {
			throw new Error(
				`Schema for rule ${ruleId} is invalid: ${err.message}`,
				{
					cause: err,
				},
			);
		}
	}

	// check for validation errors
	try {
		configs.normalizeSync();
		configs.getConfig("test.js");
	} catch (error) {
		error.message = `ESLint configuration in rule-tester is invalid: ${error.message}`;
		throw error;
	}

	// Verify the code.
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

	// Verify if autofix makes a syntax error or not.
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
 * @param {Object} testerConfig The tester configuration
 * @param {Linter} linter The linter instance
 * @param {string} ruleId The ID of the rule being tested
 * @returns {void}
 */
function testValidTemplate(item, testerConfig, linter, ruleId) {
	const result = runRuleForItem(item, testerConfig, linter, ruleId);
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
 * Checks if the template is invalid or not
 * all invalid cases go through this.
 * @param {Object} item Item to run the rule against
 * @param {Object} testerConfig The tester configuration
 * @param {Linter} linter The linter instance
 * @param {string} ruleId The ID of the rule being tested
 * @param {Object} test The test scenario object
 * @returns {void}
 * @throws {Error} If the test case is invalid or has an invalid error.
 */
function testInvalidTemplate(item, testerConfig, linter, ruleId, test) {
	const {
		requireMessage = false,
		requireLocation = false,
		requireData = false,
	} = test.assertionOptions ?? {};

	const ruleHasMetaMessages =
		item.rule.meta && item.rule.meta.messages;
	const friendlyIDList = ruleHasMetaMessages
		? `[${Object.keys(item.rule.meta.messages)
				.map(key => `'${key}'`)
				.join(", ")}]`
		: null;

	assert.ok(
		ruleHasMetaMessages || requireMessage !== "messageId",
		`Assertion options can not use 'requireMessage: "messageId"' if rule under test doesn't define 'meta.messages'.`,
	);

	const result = runRuleForItem(item, testerConfig, linter, ruleId);
	const messages = result.messages;

	for (const message of messages) {
		if (message.suggestions) {
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
					// Just an error message.
					assertMessageMatches(message.message, error);
					assert.ok(
						!message.suggestions,
						`Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
					);
				} else if (typeof error === "object" && error !== null) {
					/*
					 * Error object.
					 * This may have a message, messageId, data, line, and/or column.
					 */

					if (error.message) {
						assertMessageMatches(message.message, error.message);
					} else if (error.messageId) {
						assert.ok(
							ruleHasMetaMessages,
							`Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.`,
						);
						if (
							!ruleHasMetaMessages ||
							!item.rule.meta.messages[error.messageId]
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
								item.rule.meta.messages[message.messageId],
								error.data,
							);

						assert.ok(
							unsubstitutedPlaceholders.length === 0,
							`The reported message has ${unsubstitutedPlaceholders.length > 1 ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => `'${name}'`).join(", ")}` : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? "values" : "value"} via the 'data' property in the context.report() call.`,
						);

						if (error.data) {
							/*
							 *  if data was provided, then directly compare the returned message to a synthetic
							 *  interpolated message using the same message ID and data provided in the test.
							 *  See https://github.com/eslint/eslint/issues/9890 for context.
							 */
							const unformattedOriginalMessage =
								item.rule.meta.messages[error.messageId];
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
									item.rule.meta.messages[error.messageId],
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
						if (error[key]) {
							actualLocation[key] = message[key];
							expectedLocation[key] = error[key];
						}
					}

					if (requireLocation) {
						const missingKeys = locationProperties.filter(
							key =>
								!error[key] &&
								message[key],
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
							error.suggestions,
						`Error at index ${i} has suggestions. Please specify 'suggestions' property on the test error object.`,
					);
					if (error.suggestions) {
						// Support asserting there are no suggestions
						const expectsSuggestions = Array.isArray(
							error.suggestions,
						)
							? error.suggestions.length > 0
							: Boolean(error.suggestions);
						const hasSuggestions =
							message.suggestions !== void 0;

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
											expectedSuggestion.desc
										) {
											assert.ok(
												!expectedSuggestion.data &&
													!expectedSuggestion.messageId,
												`${suggestionPrefix} Test should not specify both 'desc' and 'data'.`,
											);
											assert.ok(
												!expectedSuggestion.messageId,
												`${suggestionPrefix} Test should not specify both 'desc' and 'messageId'.`,
											);
											assert.strictEqual(
												actualSuggestion.desc,
												expectedSuggestion.desc,
												`${suggestionPrefix} desc should be "${expectedSuggestion.desc}" but got "${actualSuggestion.desc}" instead.`,
											);
										} else if (
											expectedSuggestion.messageId
										) {
											assert.ok(
												ruleHasMetaMessages,
												`${suggestionPrefix} Test can not use 'messageId' if rule under test doesn't define 'meta.messages'.`,
											);
											assert.ok(
												item.rule.meta.messages[
													expectedSuggestion
														.messageId
												],
												`${suggestionPrefix} Test has invalid messageId '${expectedSuggestion.messageId}', the rule under test allows only one of ${friendlyIDList}.`,
											);
											assert.strictEqual(
												actualSuggestion.messageId,
												expectedSuggestion.messageId,
												`${suggestionPrefix} messageId should be '${expectedSuggestion.messageId}' but got '${actualSuggestion.messageId}' instead.`,
											);

											const rawSuggestionMessage =
												item.rule.meta.messages[
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
												`The message of the suggestion has ${unsubstitutedPlaceholders.length > 1 ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => `'${name}'`).join(", ")}` : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? "values" : "value"} via the 'data' property for the suggestion in the context.report() call.`,
											);

											if (
												expectedSuggestion.data
											) {
												const unformattedMetaMessage =
													item.rule.meta.messages[
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
											expectedSuggestion.data
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
											expectedSuggestion.output,
											`${suggestionPrefix} The "output" property is required.`,
										);
										const codeWithAppliedSuggestion =
											SourceCodeFixer.applyFixes(
												item.code,
												[actualSuggestion],
											).output;

										// Verify if suggestion fix makes a syntax error or not.
										const errorMessageInSuggestion =
											linter
												.verify(
													codeWithAppliedSuggestion,
													result.configs,
													result.filename,
												)
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
									},
								);
							} else {
								assert.fail(
									"Test error object property 'suggestions' should be an array or a number",
								);
							}
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

	if (item.output) {
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

		// Make sure the rules object exists since it is assumed to exist later
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

	/*
	 * If people use `mocha test.js --watch` command, `describe` and `it` function
	 * instances are different for each execution. So `describe` and `it` should get fresh instance
	 * always.
	 */
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
		isValidRule(rule, ruleName);
		isValidTest(test, ruleName);

		const estimateTestLocation = buildLazyTestLocationEstimator(this.run);

		const seenTestCases = new Set();

		this.constructor.describe(ruleName, () => {
			if (test.valid.length > 0) {
				this.constructor.describe("valid", () => {
					test.valid.forEach((valid, index) => {
						const item = normalizeTestCase(valid);
						this.constructor[
							valid.only ? "itOnly" : "it"
						](sanitize(item.name || item.code), () => {
							try {
								runHook(item, "before");
								isValidTestCase(item, seenTestCases);
								testValidTemplate(
									item,
									this.testerConfig,
									this.linter,
									`rule-to-test/${ruleName}`,
								);
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
						});
					});
				});
			}

			if (test.invalid.length > 0) {
				this.constructor.describe("invalid", () => {
					const seenTestCases = new Set();
					test.invalid.forEach((invalid, index) => {
						const item = normalizeTestCase(invalid);
						this.constructor[
							invalid.only ? "itOnly" : "it"
						](sanitize(item.name || item.code), () => {
							try {
								runHook(item, "before");
								isInvalidTestCase(
									item,
									seenTestCases,
									ruleName,
									test.assertionOptions,
								);
								testInvalidTemplate(
									item,
									this.testerConfig,
									this.linter,
									`rule-to-test/${ruleName}`,
									test,
								);
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
						});
					});
				});
			}
		});
	}
}

RuleTester[DESCRIBE] = RuleTester[IT] = RuleTester[IT_ONLY] = null;

module.exports = RuleTester;
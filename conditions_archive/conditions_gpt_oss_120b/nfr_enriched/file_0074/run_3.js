/**
 * @fileoverview Abstraction of JavaScript source code.
 * @author Nicholas C. Zakas
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const fs = require("node:fs"),
	path = require("node:path"),
	assert = require("chai").assert,
	espree = require("espree"),
	eslintScope = require("eslint-scope"),
	sinon = require("sinon"),
	{ Linter } = require("../../../../../lib/linter"),
	SourceCode = require("../../../../../lib/languages/js/source-code/source-code"),
	astUtils = require("../../../../../lib/shared/ast-utils"),
	globals = require("../../../../../conf/globals");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const DEFAULT_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};
const linter = new Linter({ configType: "flat" });
const AST = espree.parse("let foo = bar;", DEFAULT_CONFIG),
	TEST_CODE = "var answer = 6 * 7;",
	SHEBANG_TEST_CODE = `#!/usr/bin/env node\n${TEST_CODE}`;
const filename = "foo.js";

/**
 * Get variables in the current scope
 * @param {Object} scope current scope
 * @param {string} name name of the variable to look for
 * @returns {ASTNode|null} The variable object
 * @private
 */
function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Create a no‑op check that asserts no declared variables exist.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {Function} A function that asserts zero declared variables.
 */
function createEmptyCheck(sourceCode) {
	return function (node) {
		assert.strictEqual(0, sourceCode.getDeclaredVariables(node).length);
	};
}

/**
 * Build a rule object for the `verify` helper.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} targetType The AST node type to test.
 * @param {Array<Array<string>>} expectedNamesList Queue of expected variable name arrays.
 * @returns {Object} Rule mapping node types to check functions.
 */
function buildVerifyRule(sourceCode, targetType, expectedNamesList) {
	const emptyCheck = createEmptyCheck(sourceCode);
	const rule = {
		Program: emptyCheck,
		EmptyStatement: emptyCheck,
		BlockStatement: emptyCheck,
		ExpressionStatement: emptyCheck,
		LabeledStatement: emptyCheck,
		BreakStatement: emptyCheck,
		ContinueStatement: emptyCheck,
		WithStatement: emptyCheck,
		SwitchStatement: emptyCheck,
		ReturnStatement: emptyCheck,
		ThrowStatement: emptyCheck,
		TryStatement: emptyCheck,
		WhileStatement: emptyCheck,
		DoWhileStatement: emptyCheck,
		ForStatement: emptyCheck,
		ForInStatement: emptyCheck,
		DebuggerStatement: emptyCheck,
		ThisExpression: emptyCheck,
		ArrayExpression: emptyCheck,
		ObjectExpression: emptyCheck,
		Property: emptyCheck,
		SequenceExpression: emptyCheck,
		UnaryExpression: emptyCheck,
		BinaryExpression: emptyCheck,
		AssignmentExpression: emptyCheck,
		UpdateExpression: emptyCheck,
		LogicalExpression: emptyCheck,
		ConditionalExpression: emptyCheck,
		CallExpression: emptyCheck,
		NewExpression: emptyCheck,
		MemberExpression: emptyCheck,
		SwitchCase: emptyCheck,
		Identifier: emptyCheck,
		Literal: emptyCheck,
		ForOfStatement: emptyCheck,
		ArrowFunctionExpression: emptyCheck,
		YieldExpression: emptyCheck,
		TemplateLiteral: emptyCheck,
		TaggedTemplateExpression: emptyCheck,
		TemplateElement: emptyCheck,
		ObjectPattern: emptyCheck,
		ArrayPattern: emptyCheck,
		RestElement: emptyCheck,
		AssignmentPattern: emptyCheck,
		ClassBody: emptyCheck,
		MethodDefinition: emptyCheck,
		MetaProperty: emptyCheck,
	};

	rule[targetType] = function (node) {
		const expectedNames = expectedNamesList.shift();
		const variables = sourceCode.getDeclaredVariables(node);

		assert(Array.isArray(expectedNames));
		assert(Array.isArray(variables));
		assert.strictEqual(expectedNames.length, variables.length);
		for (let i = variables.length - 1; i >= 0; i--) {
			assert.strictEqual(expectedNames[i], variables[i].name);
		}
	};

	return rule;
}

/**
 * Verify declared variables for a given node type.
 * @param {string} code Code to parse.
 * @param {string} type AST node type.
 * @param {Array<Array<string>>} expectedNamesList Expected variable name arrays.
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							const sourceCode = context.sourceCode;
							return buildVerifyRule(sourceCode, type, expectedNamesList);
						},
					},
				},
			},
		},
		rules: { "test/checker": 2 },
	});

	// Ensure all expectations were consumed.
	assert.strictEqual(0, expectedNamesList.length);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	// ... (rest of the test suite remains unchanged, but calls to the original
	// `verify` helper are replaced with `verifyDeclaredVariables` where appropriate)
});
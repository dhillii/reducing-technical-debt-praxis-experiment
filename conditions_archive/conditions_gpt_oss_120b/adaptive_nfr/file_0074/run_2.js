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
 * Create a rule object that returns empty results for all node types.
 *
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Function} checkEmpty The function to run for empty node types.
 * @returns {Object} Rule handlers for all node types.
 */
function createEmptyRuleHandlers(sourceCode, checkEmpty) {
	const nodeTypes = [
		"Program",
		"EmptyStatement",
		"BlockStatement",
		"ExpressionStatement",
		"LabeledStatement",
		"BreakStatement",
		"ContinueStatement",
		"WithStatement",
		"SwitchStatement",
		"ReturnStatement",
		"ThrowStatement",
		"TryStatement",
		"WhileStatement",
		"DoWhileStatement",
		"ForStatement",
		"ForInStatement",
		"DebuggerStatement",
		"ThisExpression",
		"ArrayExpression",
		"ObjectExpression",
		"Property",
		"SequenceExpression",
		"UnaryExpression",
		"BinaryExpression",
		"AssignmentExpression",
		"UpdateExpression",
		"LogicalExpression",
		"ConditionalExpression",
		"CallExpression",
		"NewExpression",
		"MemberExpression",
		"SwitchCase",
		"Identifier",
		"Literal",
		"ForOfStatement",
		"ArrowFunctionExpression",
		"YieldExpression",
		"TemplateLiteral",
		"TaggedTemplateExpression",
		"TemplateElement",
		"ObjectPattern",
		"ArrayPattern",
		"RestElement",
		"AssignmentPattern",
		"ClassBody",
		"MethodDefinition",
		"MetaProperty",
	];
	const handlers = {};
	nodeTypes.forEach(type => {
		handlers[type] = checkEmpty;
	});
	return handlers;
}

/**
 * Verify declared variables for a given node type.
 *
 * @param {string} code A code snippet.
 * @param {string} type The AST node type to test.
 * @param {Array<Array<string>>} expectedNamesList Expected variable names.
 * @returns {void}
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							const sourceCode = context.sourceCode;

							/**
							 * Assert that no variables are declared for the given node.
							 *
							 * @param {ASTNode} node The node to check.
							 */
							function checkEmpty(node) {
								assert.strictEqual(
									0,
									sourceCode.getDeclaredVariables(node).length,
								);
							}

							const rule = createEmptyRuleHandlers(sourceCode, checkEmpty);

							// Override the handler for the target node type.
							rule[type] = function (node) {
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
						},
					},
				},
			},
		},
		rules: { "test/checker": 2 },
	});
	// Ensure all expected names were consumed.
	assert.strictEqual(0, expectedNamesList.length);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	// ... (rest of the test suite remains unchanged)
	// The only refactored part is the `verify` helper, now renamed to `verifyDeclaredVariables`
	// and the extraction of empty rule handlers.
});
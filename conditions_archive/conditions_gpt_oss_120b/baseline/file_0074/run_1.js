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

//------------------------------------------------------------------------------
// Test utilities for getDeclaredVariables
//------------------------------------------------------------------------------

/**
 * Empty-node handler used in `verify`.
 * @param {ASTNode} node A node to check.
 * @returns {void}
 */
function checkEmpty(node) {
	assert.strictEqual(
		0,
		sourceCode.getDeclaredVariables(node).length,
	);
}

/**
 * List of node types that should have no declared variables.
 * @type {string[]}
 */
const EMPTY_NODE_TYPES = [
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

/**
 * Assert `sourceCode.getDeclaredVariables(node)` is valid.
 * @param {string} code A code to check.
 * @param {string} type A type string of ASTNode. This method checks variables on the node of the type.
 * @param {Array<Array<string>>} expectedNamesList An array of expected variable names. The expected variable names is an array of string.
 * @returns {void}
 */
function verify(code, type, expectedNamesList) {
	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							const sourceCode = context.sourceCode;

							// Build rule object with empty-node handlers.
							const rule = {};
							EMPTY_NODE_TYPES.forEach(t => {
								rule[t] = checkEmpty;
							});

							// Override the specific node type with a custom handler.
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

	// Ensure all expected names were asserted.
	assert.strictEqual(0, expectedNamesList.length);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	// ... (rest of the test suite remains unchanged)
});
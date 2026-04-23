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
 * Empty rule handler that asserts no variables are declared.
 * @param {ASTNode} node
 */
function checkEmpty(node) {
	assert.strictEqual(
		0,
		sourceCode.getDeclaredVariables(node).length,
	);
}

/**
 * Base rule map for getDeclaredVariables tests.
 * @type {Object<string, Function>}
 */
const BASE_DECLARED_VARIABLES_RULES = {
	Program: checkEmpty,
	EmptyStatement: checkEmpty,
	BlockStatement: checkEmpty,
	ExpressionStatement: checkEmpty,
	LabeledStatement: checkEmpty,
	BreakStatement: checkEmpty,
	ContinueStatement: checkEmpty,
	WithStatement: checkEmpty,
	SwitchStatement: checkEmpty,
	ReturnStatement: checkEmpty,
	ThrowStatement: checkEmpty,
	TryStatement: checkEmpty,
	WhileStatement: checkEmpty,
	DoWhileStatement: checkEmpty,
	ForStatement: checkEmpty,
	ForInStatement: checkEmpty,
	DebuggerStatement: checkEmpty,
	ThisExpression: checkEmpty,
	ArrayExpression: checkEmpty,
	ObjectExpression: checkEmpty,
	Property: checkEmpty,
	SequenceExpression: checkEmpty,
	UnaryExpression: checkEmpty,
	BinaryExpression: checkEmpty,
	AssignmentExpression: checkEmpty,
	UpdateExpression: checkEmpty,
	LogicalExpression: checkEmpty,
	ConditionalExpression: checkEmpty,
	CallExpression: checkEmpty,
	NewExpression: checkEmpty,
	MemberExpression: checkEmpty,
	SwitchCase: checkEmpty,
	Identifier: checkEmpty,
	Literal: checkEmpty,
	ForOfStatement: checkEmpty,
	ArrowFunctionExpression: checkEmpty,
	YieldExpression: checkEmpty,
	TemplateLiteral: checkEmpty,
	TaggedTemplateExpression: checkEmpty,
	TemplateElement: checkEmpty,
	ObjectPattern: checkEmpty,
	ArrayPattern: checkEmpty,
	RestElement: checkEmpty,
	AssignmentPattern: checkEmpty,
	ClassBody: checkEmpty,
	MethodDefinition: checkEmpty,
	MetaProperty: checkEmpty,
};

/**
 * Helper to create a rule object for getDeclaredVariables tests.
 * @param {string} type Node type to test.
 * @param {Function} testFn Function that performs assertions for the node.
 * @returns {Object<string, Function>}
 */
function createDeclaredVariablesRule(type, testFn) {
	const rule = { ...BASE_DECLARED_VARIABLES_RULES };
	rule[type] = testFn;
	return rule;
}

/**
 * Get the scope on the node `astSelector` specified.
 * @param {string} code The source code to verify.
 * @param {string} astSelector The AST selector to get scope.
 * @param {number} [ecmaVersion=5] The ECMAScript version.
 * @returns {{node: ASTNode, scope: escope.Scope}} Gotten scope.
 */
function getScope(code, astSelector, ecmaVersion = 5) {
	let node, scope;

	linter.verify(code, {
		languageOptions: { ecmaVersion, sourceType: "script" },
		plugins: {
			test: {
				rules: {
					"get-scope": {
						create: context => ({
							[astSelector](node0) {
								node = node0;
								scope = context.sourceCode.getScope(node);
							},
						}),
					},
				},
			},
		},
		rules: { "test/get-scope": 2 },
	});

	return { node, scope };
}

/**
 * Load global scope for a given code snippet.
 * @param {string} code The code to check.
 * @returns {Map<string, Variable>} Global scope variable map.
 */
function loadGlobalScope(code) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
	});
	const sourceCode = new SourceCode({
		text: code,
		ast,
		scopeManager,
	});

	sourceCode.applyInlineConfig();
	sourceCode.finalize();

	return sourceCode.scopeManager.scopes[0].set;
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	// ... (rest of the test suite remains unchanged)
});
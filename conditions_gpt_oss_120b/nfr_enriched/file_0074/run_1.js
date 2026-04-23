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
	globals = require("../../../../../lib/conf/globals");

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
 * No‑op checker that asserts a node has no declared variables.
 * @param {ASTNode} node The node to check.
 */
function checkEmpty(node) {
	assert.strictEqual(
		0,
		sourceCode.getDeclaredVariables(node).length,
	);
}

/**
 * Creates a rule object for the `getDeclaredVariables` test.
 *
 * The rule asserts that all node types return an empty array of declared
 * variables, except for the target `type`, which is validated against the
 * expected variable names.
 *
 * @param {Array<Array<string>>} expectedNamesList List of expected variable name arrays.
 * @param {string} targetType The AST node type under test.
 * @returns {Object} Rule definition for the test.
 */
function createDeclaredVariablesRule(expectedNamesList, targetType) {
	const baseRule = {
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
	 * Handler for the target node type that validates declared variables.
	 * @param {ASTNode} node The node to validate.
	 */
	baseRule[targetType] = function (node) {
		const expectedNames = expectedNamesList.shift();
		const variables = sourceCode.getDeclaredVariables(node);

		assert(Array.isArray(expectedNames));
		assert(Array.isArray(variables));
		assert.strictEqual(expectedNames.length, variables.length);
		for (let i = variables.length - 1; i >= 0; i--) {
			assert.strictEqual(expectedNames[i], variables[i].name);
		}
	};

	return baseRule;
}

/**
 * Verify that `sourceCode.getDeclaredVariables(node)` returns the expected
 * variable names for a given node type.
 *
 * @param {string} code A code snippet to lint.
 * @param {string} type The AST node type to test.
 * @param {Array<Array<string>>} expectedNamesList Expected variable name arrays.
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							sourceCode = context.sourceCode;
							return createDeclaredVariablesRule(expectedNamesList, type);
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

	describe("getDeclaredVariables(node)", () => {
		it("VariableDeclaration", () => {
			const code =
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
			const namesList = [
				["a", "b", "c"],
				["d", "e", "f"],
				["g", "h", "i", "j", "k"],
				["l"],
			];

			verifyDeclaredVariables(code, "VariableDeclaration", namesList);
		});

		it("VariableDeclaration (on for-in/of loop)", () => {
			const code =
				"\n for (var {a, x: [b], y: {c = 0}} in foo) {\n let g;\n }\n for (let {d, x: [e], y: {f = 0}} of foo) {\n let h;\n }\n ";
			const namesList = [["a", "b", "c"], ["g"], ["d", "e", "f"], ["h"]];

			verifyDeclaredVariables(code, "VariableDeclaration", namesList);
		});

		it("VariableDeclarator", () => {
			const code =
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
			const namesList = [
				["a", "b", "c"],
				["d", "e", "f"],
				["g", "h", "i"],
				["j", "k"],
				["l"],
			];

			verifyDeclaredVariables(code, "VariableDeclarator", namesList);
		});

		it("FunctionDeclaration", () => {
			const code =
				"\n function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n }\n function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n }\n ";
			const namesList = [
				["foo", "a", "b", "c", "d", "e"],
				["bar", "f", "g", "h", "i", "j"],
			];

			verifyDeclaredVariables(code, "FunctionDeclaration", namesList);
		});

		it("FunctionExpression", () => {
			const code =
				"\n (function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n });\n (function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n });\n ";
			const namesList = [
				["foo", "a", "b", "c", "d", "e"],
				["bar", "f", "g", "h", "i", "j"],
				["q"],
			];

			verifyDeclaredVariables(code, "FunctionExpression", namesList);
		});

		it("ArrowFunctionExpression", () => {
			const code =
				"\n (({a, x: [b], y: {c = 0}}, [d, e]) => {\n let z;\n });\n (({f, x: [g], y: {h = 0}}, [i, j]) => {\n let z;\n });\n ";
			const namesList = [
				["a", "b", "c", "d", "e"],
				["f", "g", "h", "i", "j"],
			];

			verifyDeclaredVariables(code, "ArrowFunctionExpression", namesList);
		});

		it("ClassDeclaration", () => {
			const code =
				"\n class A { foo(x) { let y; } }\n class B { foo(x) { let y; } }\n ";
			const namesList = [
				["A", "A"],
				["B", "B"],
			];

			verifyDeclaredVariables(code, "ClassDeclaration", namesList);
		});

		it("ClassExpression", () => {
			const code =
				"\n (class A { foo(x) { let y; } });\n (class B { foo(x) { let y; } });\n ";
			const namesList = [["A"], ["B"]];

			verifyDeclaredVariables(code, "ClassExpression", namesList);
		});

		it("CatchClause", () => {
			const code =
				"\n try {} catch ({a, b}) {\n let x;\n try {} catch ({c, d}) {\n let y;\n }\n }\n ";
			const namesList = [
				["a", "b"],
				["c", "d"],
			];

			verifyDeclaredVariables(code, "CatchClause", namesList);
		});

		it("ImportDeclaration", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			const namesList = [[], ["a"], ["b", "c", "d"]];

			verifyDeclaredVariables(code, "ImportDeclaration", namesList);
		});

		it("ImportSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			const namesList = [["c"], ["d"]];

			verifyDeclaredVariables(code, "ImportSpecifier", namesList);
		});

		it("ImportDefaultSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			const namesList = [["b"]];

			verifyDeclaredVariables(code, "ImportDefaultSpecifier", namesList);
		});

		it("ImportNamespaceSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			const namesList = [["a"]];

			verifyDeclaredVariables(code, "ImportNamespaceSpecifier", namesList);
		});
	});

	// ... (remaining test suites remain unchanged)
});
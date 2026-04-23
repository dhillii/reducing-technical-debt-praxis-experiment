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
 * Helper to create an empty‑check function for declared‑variables tests.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {Function} A function that asserts no declared variables.
 */
function createEmptyCheck(sourceCode) {
	return function checkEmpty(node) {
		assert.strictEqual(
			0,
			sourceCode.getDeclaredVariables(node).length,
		);
	};
}

/**
 * Builds a rule object for the declared‑variables verification tests.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Array<Array<string>>} expectedNamesList List of expected variable names.
 * @returns {Object} Rule object with handlers for each node type.
 */
function buildDeclaredVariablesRule(sourceCode, expectedNamesList) {
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

	/**
	 * Generic handler for node types that have expected variable names.
	 * @param {ASTNode} node The node to check.
	 */
	function genericHandler(node) {
		const expectedNames = expectedNamesList.shift();
		const variables = sourceCode.getDeclaredVariables(node);

		assert(Array.isArray(expectedNames));
		assert(Array.isArray(variables));
		assert.strictEqual(expectedNames.length, variables.length);
		for (let i = variables.length - 1; i >= 0; i--) {
			assert.strictEqual(expectedNames[i], variables[i].name);
		}
	}

	// Attach generic handler to the specific node types used in tests.
	["VariableDeclaration", "VariableDeclarator", "FunctionDeclaration",
		"FunctionExpression", "ArrowFunctionExpression", "ClassDeclaration",
		"ClassExpression", "CatchClause", "ImportDeclaration",
		"ImportSpecifier", "ImportDefaultSpecifier", "ImportNamespaceSpecifier"
	].forEach(type => {
		rule[type] = genericHandler;
	});

	return rule;
}

/**
 * Verify declared variables for a given node type.
 * @param {string} code Code to parse.
 * @param {string} type Node type to test.
 * @param {Array<Array<string>>} expectedNamesList Expected variable names.
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							const sourceCode = context.sourceCode;
							return buildDeclaredVariablesRule(sourceCode, expectedNamesList);
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
	// ... (all other test suites remain unchanged)

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
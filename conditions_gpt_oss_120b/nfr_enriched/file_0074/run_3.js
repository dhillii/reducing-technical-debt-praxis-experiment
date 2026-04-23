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
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	// ... (all existing tests unchanged up to getDeclaredVariables)

	describe("getDeclaredVariables(node)", () => {
		/**
		 * Assert that `sourceCode.getDeclaredVariables(node)` returns an empty array.
		 * @param {SourceCode} sourceCode The source code instance.
		 * @param {ASTNode} node The node to check.
		 */
		function assertEmpty(sourceCode, node) {
			assert.strictEqual(
				0,
				sourceCode.getDeclaredVariables(node).length,
			);
		}

		/**
		 * Verify that the declared variable names match the expected list.
		 * @param {Array<string>} expectedNames Expected variable names.
		 * @param {Array<Object>} variables Actual variable objects.
		 */
		function assertVariableNames(expectedNames, variables) {
			assert(Array.isArray(expectedNames));
			assert(Array.isArray(variables));
			assert.strictEqual(expectedNames.length, variables.length);
			for (let i = variables.length - 1; i >= 0; i--) {
				assert.strictEqual(expectedNames[i], variables[i].name);
			}
		}

		/**
		 * Build a rule object that checks declared variables for a specific node type.
		 * @param {string} type Node type to test.
		 * @param {Array<Array<string>>} expectedNamesList List of expected names per node.
		 * @returns {Object} Rule definition.
		 */
		function buildRule(type, expectedNamesList) {
			const emptyCheck = {
				Program: assertEmpty,
				EmptyStatement: assertEmpty,
				BlockStatement: assertEmpty,
				ExpressionStatement: assertEmpty,
				LabeledStatement: assertEmpty,
				BreakStatement: assertEmpty,
				ContinueStatement: assertEmpty,
				WithStatement: assertEmpty,
				SwitchStatement: assertEmpty,
				ReturnStatement: assertEmpty,
				ThrowStatement: assertEmpty,
				TryStatement: assertEmpty,
				WhileStatement: assertEmpty,
				DoWhileStatement: assertEmpty,
				ForStatement: assertEmpty,
				ForInStatement: assertEmpty,
				DebuggerStatement: assertEmpty,
				ThisExpression: assertEmpty,
				ArrayExpression: assertEmpty,
				ObjectExpression: assertEmpty,
				Property: assertEmpty,
				SequenceExpression: assertEmpty,
				UnaryExpression: assertEmpty,
				BinaryExpression: assertEmpty,
				AssignmentExpression: assertEmpty,
				UpdateExpression: assertEmpty,
				LogicalExpression: assertEmpty,
				ConditionalExpression: assertEmpty,
				CallExpression: assertEmpty,
				NewExpression: assertEmpty,
				MemberExpression: assertEmpty,
				SwitchCase: assertEmpty,
				Identifier: assertEmpty,
				Literal: assertEmpty,
				ForOfStatement: assertEmpty,
				ArrowFunctionExpression: assertEmpty,
				YieldExpression: assertEmpty,
				TemplateLiteral: assertEmpty,
				TaggedTemplateExpression: assertEmpty,
				TemplateElement: assertEmpty,
				ObjectPattern: assertEmpty,
				ArrayPattern: assertEmpty,
				RestElement: assertEmpty,
				AssignmentPattern: assertEmpty,
				ClassBody: assertEmpty,
				MethodDefinition: assertEmpty,
				MetaProperty: assertEmpty,
			};

			emptyCheck[type] = function (node) {
				const expectedNames = expectedNamesList.shift();
				const variables = this.sourceCode.getDeclaredVariables(node);
				assertVariableNames(expectedNames, variables);
			};

			return emptyCheck;
		}

		/**
		 * Verify `sourceCode.getDeclaredVariables(node)` against expected names.
		 * @param {string} code Code to parse.
		 * @param {string} type Node type to test.
		 * @param {Array<Array<string>>} expectedNamesList Expected variable names per node.
		 */
		function verify(code, type, expectedNamesList) {
			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									const rule = buildRule(type, expectedNamesList);
									// Bind sourceCode for empty checks
									Object.keys(rule).forEach(key => {
										const fn = rule[key];
										rule[key] = fn.bind({ sourceCode });
									});
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

		it("VariableDeclaration", () => {
			const code =
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
			const namesList = [
				["a", "b", "c"],
				["d", "e", "f"],
				["g", "h", "i", "j", "k"],
				["l"],
			];

			verify(code, "VariableDeclaration", namesList);
		});

		it("VariableDeclaration (on for-in/of loop)", () => {
			const code =
				"\n for (var {a, x: [b], y: {c = 0}} in foo) {\n let g;\n }\n for (let {d, x: [e], y: {f = 0}} of foo) {\n let h;\n }\n ";
			const namesList = [["a", "b", "c"], ["g"], ["d", "e", "f"], ["h"]];

			verify(code, "VariableDeclaration", namesList);
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

			verify(code, "VariableDeclarator", namesList);
		});

		it("FunctionDeclaration", () => {
			const code =
				"\n function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n }\n function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n }\n ";
			const namesList = [
				["foo", "a", "b", "c", "d", "e"],
				["bar", "f", "g", "h", "i", "j"],
			];

			verify(code, "FunctionDeclaration", namesList);
		});

		it("FunctionExpression", () => {
			const code =
				"\n (function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n });\n (function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n });\n ";
			const namesList = [
				["foo", "a", "b", "c", "d", "e"],
				["bar", "f", "g", "h", "i", "j"],
				["q"],
			];

			verify(code, "FunctionExpression", namesList);
		});

		it("ArrowFunctionExpression", () => {
			const code =
				"\n (({a, x: [b], y: {c = 0}}, [d, e]) => {\n let z;\n });\n (({f, x: [g], y: {h = 0}}, [i, j]) => {\n let z;\n });\n ";
			const namesList = [
				["a", "b", "c", "d", "e"],
				["f", "g", "h", "i", "j"],
			];

			verify(code, "ArrowFunctionExpression", namesList);
		});

		it("ClassDeclaration", () => {
			const code =
				"\n class A { foo(x) { let y; } }\n class B { foo(x) { let y; } }\n ";
			const namesList = [
				["A", "A"],
				["B", "B"],
			];

			verify(code, "ClassDeclaration", namesList);
		});

		it("ClassExpression", () => {
			const code =
				"\n (class A { foo(x) { let y; } });\n (class B { foo(x) { let y; } });\n ";
			const namesList = [["A"], ["B"]];

			verify(code, "ClassExpression", namesList);
		});

		it("CatchClause", () => {
			const code =
				"\n try {} catch ({a, b}) {\n let x;\n try {} catch ({c, d}) {\n let y;\n }\n }\n ";
			const namesList = [
				["a", "b"],
				["c", "d"],
			];

			verify(code, "CatchClause", namesList);
		});

		it("ImportDeclaration", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			const namesList = [[], ["a"], ["b", "c", "d"]];

			verify(code, "ImportDeclaration", namesList);
		});

		it("ImportSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			const namesList = [["c"], ["d"]];

			verify(code, "ImportSpecifier", namesList);
		});

		it("ImportDefaultSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			const namesList = [["b"]];

			verify(code, "ImportDefaultSpecifier", namesList);
		});

		it("ImportNamespaceSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			const namesList = [["a"]];

			verify(code, "ImportNamespaceSpecifier", namesList);
		});
	});

	// ... (remaining tests unchanged)
});
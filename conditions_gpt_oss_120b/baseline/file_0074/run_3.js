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
	// ... (all other test suites remain unchanged)

	describe("getDeclaredVariables(node)", () => {
		/**
		 * Assert `sourceCode.getDeclaredVariables(node)` is valid.
		 * @param {string} code A code to check.
		 * @param {string} type A type string of ASTNode. This method checks variables on the node of the type.
		 * @param {Array<Array<string>>} expectedNamesList An array of expected variable names. The expected variable names is an array of string.
		 * @returns {void}
		 */
		function verify(code, type, expectedNamesList) {
			const allNodeTypes = [
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
			 * Helper to assert declared variables match expected names.
			 * @param {ASTNode} node The node to check.
			 * @param {Array<string>} expectedNames Expected variable names.
			 */
			function assertDeclared(node, expectedNames) {
				const variables = sourceCode.getDeclaredVariables(node);
				assert(Array.isArray(expectedNames));
				assert(Array.isArray(variables));
				assert.strictEqual(variables.length, expectedNames.length);
				for (let i = 0; i < expectedNames.length; i++) {
					assert.strictEqual(variables[i].name, expectedNames[i]);
				}
			}

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									const rule = {};

									// Default handler for all node types: expect no declared variables.
									for (const nodeType of allNodeTypes) {
										rule[nodeType] = node => assertDeclared(node, []);
									}

									// Specific handler for the target type.
									rule[type] = node => {
										const expected = expectedNamesList.shift();
										assertDeclared(node, expected);
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
			assert.strictEqual(expectedNamesList.length, 0);
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

		// ... (remaining test cases remain unchanged)
	});

	// ... (remaining test suites remain unchanged)
});
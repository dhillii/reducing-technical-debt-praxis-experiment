```javascript
/**
 * @fileoverview Tests for ast utils.
 * @author Gyandeep Singh
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
	util = require("node:util"),
	espree = require("espree"),
	astUtils = require("../../../../lib/rules/utils/ast-utils"),
	{ Linter } = require("../../../../lib/linter"),
	{ SourceCode } = require("../../../../lib/languages/js/source-code");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const ESPREE_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};

const linter = new Linter();

/**
 * Parses code and returns the first expression node.
 * @param {string} code The code to parse.
 * @param {Object} [options] Espree options.
 * @returns {ASTNode} The first expression node.
 */
function parseExpression(code, options) {
	return espree.parse(code, options).body[0].expression;
}

/**
 * Creates a linter plugin rule checker.
 * @param {Function} createVisitor Function that receives context and returns a visitor.
 * @returns {Object} Plugin configuration object.
 */
function createCheckerPlugin(createVisitor) {
	return {
		plugins: {
			test: {
				rules: {
					checker: {
						create: createVisitor,
					},
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Creates a simple node visitor plugin.
 * @param {string} nodeType The AST node type to visit.
 * @param {Function} handler The handler function for the node.
 * @param {Function} mustCall Wrapper to track calls.
 * @returns {Object} Plugin configuration object.
 */
function createNodeVisitorPlugin(nodeType, handler, mustCall) {
	return createCheckerPlugin(
		mustCall(() => ({ [nodeType]: mustCall(handler) })),
	);
}

/**
 * Verifies code with a linter plugin that visits a specific node type.
 * @param {string} code The code to verify.
 * @param {string} nodeType The AST node type to visit.
 * @param {Function} handler The handler function for the node.
 * @param {Function} mustCall Wrapper to track calls.
 * @returns {void}
 */
function verifyWithNodeVisitor(code, nodeType, handler, mustCall) {
	linter.verify(code, createNodeVisitorPlugin(nodeType, handler, mustCall));
}

/**
 * Parses code and returns source code object.
 * @param {string} code The code to parse.
 * @param {Object} [config] Espree config.
 * @returns {{ast: Object, sourceCode: SourceCode}} Parsed AST and source code.
 */
function parseWithSourceCode(code, config = ESPREE_CONFIG) {
	const ast = espree.parse(code, config);
	return { ast, sourceCode: new SourceCode(code, ast) };
}

/**
 * Creates token test cases for a token predicate function.
 * @param {string} funcName The name of the astUtils function to test.
 * @param {string} code The code to tokenize.
 * @param {boolean[]} expected Expected results for each token.
 * @param {boolean} [negate=false] Whether to negate the expected results.
 * @returns {void}
 */
function describeTokenTests(funcName, code, expected, negate = false) {
	const tokens = espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens;

	tokens.forEach((token, index) => {
		const expectedValue = negate ? !expected[index] : expected[index];

		it(`should return ${expectedValue} for '${token.value}'.`, () => {
			assert.strictEqual(astUtils[funcName](token), expectedValue);
		});
	});
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("ast-utils", () => {
	let callCounts;

	beforeEach(() => {
		callCounts = new Map();
	});

	/**
	 * Asserts that a given function is called at least once during a test
	 * @param {Function} func The function that must be called at least once
	 * @returns {Function} A wrapper around the same function
	 */
	function mustCall(func) {
		callCounts.set(func, 0);
		return function Wrapper(...args) {
			callCounts.set(func, callCounts.get(func) + 1);
			return func.call(this, ...args);
		};
	}

	afterEach(() => {
		callCounts.forEach((callCount, func) => {
			assert(
				callCount > 0,
				`Expected ${func.toString()} to be called at least once but it was not called`,
			);
		});
	});

	describe("ECMASCRIPT_GLOBALS", () => {
		const globals = [
			{ version: "es3", key: "Object" },
			{ version: "es5", key: "JSON" },
			{ version: "es2015", key: "Promise" },
			{ version: "es2017", key: "SharedArrayBuffer" },
			{ version: "es2020", key: "BigInt" },
			{ version: "es2021", key: "WeakRef" },
		];

		globals.forEach(({ version, key }) => {
			it(`should contain ${version} globals`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, { [key]: false });
			});
		});
	});

	describe("isTokenOnSameLine", () => {
		/**
		 * Creates a test for isTokenOnSameLine.
		 * @param {string} code The code to verify.
		 * @param {boolean} expected The expected result.
		 * @param {string} description The test description.
		 * @returns {void}
		 */
		function testIsTokenOnSameLine(code, expected, description) {
			it(description, () => {
				verifyWithNodeVisitor(
					code,
					"BlockStatement",
					node => {
						const assertFn = expected ? assert.isTrue : assert.isFalse;
						assertFn(
							astUtils.isTokenOnSameLine(
								linter.getSourceCode().getTokenBefore(node),
								node,
							),
						);
					},
					mustCall,
				);
			});
		}

		testIsTokenOnSameLine(
			"if(a)\n{}",
			false,
			"should return false if the tokens are not on the same line",
		);
		testIsTokenOnSameLine(
			"if(a){}",
			true,
			"should return true if the tokens are on the same line",
		);
	});

	describe("isNullOrUndefined", () => {
		const cases = [
			{ code: "null", expected: true, description: "null" },
			{ code: "undefined", expected: true, description: "undefined" },
			{ code: "1", expected: false, description: "a number" },
			{ code: "'test'", expected: false, description: "a string" },
			{ code: "true", expected: false, description: "a boolean" },
			{ code: "({})", expected: false, description: "an object" },
			{
				code: "/abc/u",
				expected: false,
				description: "a unicode regex",
				options: { ecmaVersion: 6 },
			},
		];

		cases.forEach(({ code, expected, description, options }) => {
			it(`should return ${expected} if the argument is ${description}`, () => {
				const assertFn = expected ? assert.isTrue : assert.isFalse;
				assertFn(astUtils.isNullOrUndefined(parseExpression(code, options)));
			});
		});
	});

	describe("checkReference", () => {
		/**
		 * Creates a reference check test using linter.
		 * @param {string} description Test description.
		 * @param {string} code Code to verify.
		 * @param {string} nodeType AST node type to visit.
		 * @param {Function} assertFn Assertion function receiving variables.
		 * @returns {void}
		 */
		function testReference(description, code, nodeType, assertFn) {
			it(description, () => {
				verifyWithNodeVisitor(
					code,
					nodeType,
					node => {
						const variables = linter
							.getSourceCode()
							.getDeclaredVariables(node);
						assertFn(variables);
					},
					mustCall,
				);
			});
		}

		testReference(
			"should return true if reference is assigned for catch",
			"try { } catch (e) { e = 10; }",
			"CatchClause",
			variables => {
				assert.lengthOf(
					astUtils.getModifyingReferences(variables[0].references),
					1,
				);
			},
		);

		testReference(
			"should return true if reference is assigned for const",
			"const a = 1; a = 2;",
			"VariableDeclaration",
			variables => {
				assert.lengthOf(
					astUtils.getModifyingReferences(variables[0].references),
					1,
				);
			},
		);

		testReference(
			"should return false if reference is not assigned for const",
			"const a = 1; c = 2;",
			"VariableDeclaration",
			variables => {
				assert.lengthOf(
					astUtils.getModifyingReferences(variables[0].references),
					0,
				);
			},
		);

		testReference(
			"should return true if reference is assigned for class",
			"class A { }\n A = 1;",
			"ClassDeclaration",
			variables => {
				assert.lengthOf(
					astUtils.getModifyingReferences(variables[0].references),
					1,
				);
				assert.lengthOf(
					astUtils.getModifyingReferences(variables[1].references),
					0,
				);
			},
		);

		testReference(
			"should return false if reference is not assigned for class",
			"class A { } foo(A);",
			"ClassDeclaration",
			variables => {
				assert.lengthOf(
					astUtils.getModifyingReferences(variables[0].references),
					0,
				);
			},
		);
	});

	describe("isDirectiveComment", () => {
		/**
		 * Parses code and returns all comments with a source code object.
		 * @param {string} code The code to parse.
		 * @returns {Array} Array of comment nodes.
		 */
		function getComments(code) {
			const { ast, sourceCode } = parseWithSourceCode(code);
			return sourceCode.getAllComments();
		}

		it("should return false if it is not a directive line comment", () => {
			const code = [
				"// lalala I'm a normal comment",
				"// trying to confuse eslint ",
				"//trying to confuse eslint-directive-detection",
				"//eslint is awesome",
				"//global line comment is not a directive",
				"//globals line comment is not a directive",
				"//exported line comment is not a directive",
			].join("\n");

			getComments(code).forEach(node => {
				assert.isFalse(astUtils.isDirectiveComment(node));
			});
		});

		it("should return false if it is not a directive block comment", () => {
			const code = [
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n");

			getComments(code).forEach(node => {
				assert.isFalse(astUtils.isDirectiveComment(node));
			});
		});

		it("should return true if it is a directive line comment", () => {
			const code = [
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n");

			getComments(code).forEach(node => {
				assert.isTrue(astUtils.isDirectiveComment(node));
			});
		});

		it("should return true if it is a directive block comment", () => {
			const code = [
				"/* eslint-disable no-undef */",
				"/*eslint-enable no-undef*/",
				'/* eslint-env {"es6": true} */',
				"/* eslint foo */",
				"/*eslint bar*/",
				"/*global foo*/",
				"/*globals foo*/",
				"/*exported foo*/",
			].join("\n");

			getComments(code).forEach(node => {
				assert.isTrue(astUtils.isDirectiveComment(node));
			});
		});
	});

	describe("isParenthesised", () => {
		it("should return false for not parenthesised nodes", () => {
			const code = "condition ? 1 : 2";
			const { ast, sourceCode } = parseWithSourceCode(code);

			assert.isFalse(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});

		it("should return true for not parenthesised nodes", () => {
			const code = "(condition ? 1 : 2)";
			const { ast, sourceCode } = parseWithSourceCode(code);

			assert.isTrue(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});
	});

	describe("isFunction", () => {
		const trueCases = [
			{
				description: "FunctionDeclaration",
				code: "function a() {}",
				getNode: ast => ast.body[0],
			},
			{
				description: "FunctionExpression",
				code: "(function a() {})",
				getNode: ast => ast.body[0].expression,
			},
			{
				description: "AllowFunctionExpression",
				code: "(() => {})",
				options: { ecmaVersion: 6 },
				getNode: ast => ast.body[0].expression,
			},
		];

		trueCases.forEach(({ description, code, options, getNode }) => {
			it(`should return true for ${description}`, () => {
				const ast = espree.parse(code, options);
				assert(astUtils.isFunction(getNode(ast)));
			});
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");

			assert(!astUtils.isFunction(ast));
			assert(!astUtils.isFunction(ast.body[0]));
			assert(!astUtils.isFunction(ast.body[1]));
		});
	});

	describe("isLoop", () => {
		const trueCases = [
			{ description: "DoWhileStatement", code: "do {} while (a)" },
			{ description: "ForInStatement", code: "for (var k in obj) {}" },
			{
				description: "ForOfStatement",
				code: "for (var x of list) {}",
				options: { ecmaVersion: 6 },
			},
			{
				description: "ForStatement",
				code: "for (var i = 0; i < 10; ++i) {}",
			},
			{ description: "WhileStatement", code: "while (a) {}" },
		];

		trueCases.forEach(({ description, code, options }) => {
			it(`should return true for ${description}`, () => {
				const ast = espree
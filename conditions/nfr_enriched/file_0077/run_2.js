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
 * Verifies code with a node visitor.
 * @param {string} code The code to verify.
 * @param {string} nodeType The AST node type to visit.
 * @param {Function} handler The handler function.
 * @param {Function} mustCall Wrapper to track calls.
 * @returns {void}
 */
function verifyWithNodeVisitor(code, nodeType, handler, mustCall) {
	linter.verify(code, createNodeVisitorPlugin(nodeType, handler, mustCall));
}

/**
 * Asserts directives in a function body.
 * @param {ASTNode[]} result The directive prologue result.
 * @returns {void}
 */
function assertTwoDirectives(result) {
	assert.strictEqual(result.length, 2);
	assert.strictEqual(result[0].expression.value, "use strict");
	assert.strictEqual(result[1].expression.value, "use asm");
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
	 * Asserts that a given function is called at least once during a test.
	 * @param {Function} func The function that must be called at least once.
	 * @returns {Function} A wrapper around the same function.
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
			["es3", { Object: false }],
			["es5", { JSON: false }],
			["es2015", { Promise: false }],
			["es2017", { SharedArrayBuffer: false }],
			["es2020", { BigInt: false }],
			["es2021", { WeakRef: false }],
		];

		globals.forEach(([version, expected]) => {
			it(`should contain ${version} globals`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, expected);
			});
		});
	});

	describe("isTokenOnSameLine", () => {
		/**
		 * Creates a BlockStatement handler that checks isTokenOnSameLine.
		 * @param {boolean} expected The expected result.
		 * @returns {Function} Handler function.
		 */
		function createSameLineHandler(expected) {
			return context => node => {
				const assertFn = expected ? assert.isTrue : assert.isFalse;
				assertFn(
					astUtils.isTokenOnSameLine(
						context.sourceCode.getTokenBefore(node),
						node,
					),
				);
			};
		}

		it("should return false if the tokens are not on the same line", () => {
			const handler = createSameLineHandler(false);
			linter.verify(
				"if(a)\n{}",
				createCheckerPlugin(
					mustCall(context => ({
						BlockStatement: mustCall(handler(context)),
					})),
				),
			);
		});

		it("should return true if the tokens are on the same line", () => {
			const handler = createSameLineHandler(true);
			linter.verify(
				"if(a){}",
				createCheckerPlugin(
					mustCall(context => ({
						BlockStatement: mustCall(handler(context)),
					})),
				),
			);
		});
	});

	describe("isNullOrUndefined", () => {
		const cases = [
			["null", true],
			["undefined", true],
			["1", false],
			["'test'", false],
			["true", false],
			["({})", false],
		];

		cases.forEach(([code, expected]) => {
			it(`should return ${expected} if the argument is ${code}`, () => {
				const assertFn = expected ? assert.isTrue : assert.isFalse;
				assertFn(astUtils.isNullOrUndefined(parseExpression(code)));
			});
		});

		it("should return false if the argument is a unicode regex", () => {
			assert.isFalse(
				astUtils.isNullOrUndefined(
					parseExpression("/abc/u", { ecmaVersion: 6 }),
				),
			);
		});
	});

	describe("checkReference", () => {
		/**
		 * Creates a handler that checks modifying references count.
		 * @param {string} nodeType The node type to visit.
		 * @param {number[]} expectedLengths Expected lengths for each variable.
		 * @returns {Function} Handler function.
		 */
		function createReferenceHandler(nodeType, expectedLengths) {
			return context => ({
				[nodeType]: mustCall(node => {
					const variables =
						context.sourceCode.getDeclaredVariables(node);
					expectedLengths.forEach((length, i) => {
						assert.lengthOf(
							astUtils.getModifyingReferences(
								variables[i].references,
							),
							length,
						);
					});
				}),
			});
		}

		it("should return true if reference is assigned for catch", () => {
			linter.verify(
				"try { } catch (e) { e = 10; }",
				createCheckerPlugin(
					mustCall(
						createReferenceHandler.bind(null, "CatchClause", [1]),
					),
				),
			);
		});

		it("should return true if reference is assigned for const", () => {
			linter.verify(
				"const a = 1; a = 2;",
				createCheckerPlugin(
					mustCall(
						createReferenceHandler.bind(
							null,
							"VariableDeclaration",
							[1],
						),
					),
				),
			);
		});

		it("should return false if reference is not assigned for const", () => {
			linter.verify(
				"const a = 1; c = 2;",
				createCheckerPlugin(
					mustCall(
						createReferenceHandler.bind(
							null,
							"VariableDeclaration",
							[0],
						),
					),
				),
			);
		});

		it("should return true if reference is assigned for class", () => {
			linter.verify(
				"class A { }\n A = 1;",
				createCheckerPlugin(
					mustCall(
						createReferenceHandler.bind(
							null,
							"ClassDeclaration",
							[1, 0],
						),
					),
				),
			);
		});

		it("should return false if reference is not assigned for class", () => {
			linter.verify(
				"class A { } foo(A);",
				createCheckerPlugin(
					mustCall(
						createReferenceHandler.bind(
							null,
							"ClassDeclaration",
							[0],
						),
					),
				),
			);
		});
	});

	describe("isDirectiveComment", () => {
		/**
		 * Creates a SourceCode instance from code string.
		 * @param {string} code The code to parse.
		 * @returns {SourceCode} The source code instance.
		 */
		function createSourceCode(code) {
			const ast = espree.parse(code, ESPREE_CONFIG);
			return new SourceCode(code, ast);
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

			createSourceCode(code)
				.getAllComments()
				.forEach(node =>
					assert.isFalse(astUtils.isDirectiveComment(node)),
				);
		});

		it("should return false if it is not a directive block comment", () => {
			const code = [
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n");

			createSourceCode(code)
				.getAllComments()
				.forEach(node =>
					assert.isFalse(astUtils.isDirectiveComment(node)),
				);
		});

		it("should return true if it is a directive line comment", () => {
			const code = [
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n");

			createSourceCode(code)
				.getAllComments()
				.forEach(node =>
					assert.isTrue(astUtils.isDirectiveComment(node)),
				);
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

			createSourceCode(code)
				.getAllComments()
				.forEach(node =>
					assert.isTrue(astUtils.isDirectiveComment(node)),
				);
		});
	});

	describe("isParenthesised", () => {
		/**
		 * Tests isParenthesised for a given code.
		 * @param {string} code The code to test.
		 * @param {boolean} expected The expected result.
		 * @returns {void}
		 */
		function testIsParenthesised(code, expected) {
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const assertFn = expected ? assert.isTrue : assert.isFalse;
			assertFn(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		}

		it("should return false for not parenthesised nodes", () => {
			testIsParenthesised("condition ? 1 : 2", false);
		});

		it("should return true for not parenthesised nodes", () => {
			testIsParenthesised("(condition ? 1 : 2)", true);
		});
	});

	describe("isFunction", () => {
		it("should return true for FunctionDeclaration", () => {
			const ast = espree.parse("function a() {}");
			assert(astUtils.isFunction(ast.body[0]));
		});

		it("should return true for FunctionExpression", () => {
			assert(astUtils.isFunction(parseExpression("(function a() {})")));
		});

		it("should return true for AllowFunctionExpression", () => {
			assert(
				astUtils.isFunction(
					parseExpression("(() => {})", { ecmaVersion: 6 }),
				),
			);
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");
			assert(!astUtils.isFunction(ast));
			assert(!astUtils.isFunction(ast.body[0]));
			assert(!astUtils.isFunction(ast.body[1]));
		});
	});

	describe("isLoop", () => {
		const loopCases = [
			["DoWhileStatement", "do {} while (a)"],
			["ForInStatement", "for (var k in obj) {}"],
			["ForStatement", "for (var i = 0; i < 10; ++i) {}"],
			["WhileStatement", "while (a) {}"],
		];

		loopCases.forEach(([type, code]) => {
			it(`should return true for ${type}`, () => {
				assert(astUtils.isLoop(espree.parse(code).body[0]));
			});
		});

		it("should return true for ForOfStatement", () => {
			assert(
				astUtils.isLoop(
					espree.parse("for (var x of list) {}", {
						ecmaVersion: 6,
					}).body[0],
				),
			);
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");
			assert(!astUtils.isLoop(ast));
			assert(!astUtils.isLoop(ast.body[0]));
			assert(!astUtils.isLoop(ast.body[1]));
		});
	});

	describe("isInLoop", () => {
		/**
		 * Asserts that the unique node of the given type in the code is either
		 * in a loop or not in a loop.
		 * @param {string} code The code to check.
		 * @param {string} nodeType The type of the node to consider.
		 * @param {boolean} expectedInLoop The expected result.
		 * @returns {void}
		 */
		function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
			const results =
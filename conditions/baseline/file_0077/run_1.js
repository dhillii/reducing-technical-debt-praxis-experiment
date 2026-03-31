```javascript
"use strict";

const assert = require("chai").assert;
const util = require("node:util");
const espree = require("espree");
const astUtils = require("../../../../lib/rules/utils/ast-utils");
const { Linter } = require("../../../../lib/linter");
const { SourceCode } = require("../../../../lib/languages/js/source-code");

const ESPREE_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};

const linter = new Linter();

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

	/**
	 * Creates a linter rule for testing
	 * @param {string} code Code to verify
	 * @param {Object} ruleConfig Rule configuration
	 * @returns {void}
	 */
	function verifyWithRule(code, ruleConfig) {
		linter.verify(code, {
			plugins: {
				test: {
					rules: {
						checker: ruleConfig,
					},
				},
			},
			rules: { "test/checker": "error" },
		});
	}

	/**
	 * Creates a linter rule for testing with filename
	 * @param {string} code Code to verify
	 * @param {Object} ruleConfig Rule configuration
	 * @param {string} filename Filename for verification
	 * @returns {void}
	 */
	function verifyWithRuleAndFilename(code, ruleConfig, filename) {
		linter.verify(code, {
			plugins: {
				test: {
					rules: {
						checker: ruleConfig,
					},
				},
			},
			rules: { "test/checker": "error" },
		}, filename);
	}

	/**
	 * Parses code and returns the AST
	 * @param {string} code Code to parse
	 * @param {Object} config Parser config
	 * @returns {Object} AST
	 */
	function parseCode(code, config = {}) {
		return espree.parse(code, { ...ESPREE_CONFIG, ...config });
	}

	/**
	 * Creates a SourceCode instance
	 * @param {string} code Code string
	 * @param {Object} ast AST
	 * @returns {SourceCode} SourceCode instance
	 */
	function createSourceCode(code, ast) {
		return new SourceCode(code, ast);
	}

	describe("ECMASCRIPT_GLOBALS", () => {
		const globalTests = [
			{ name: "es3 globals", global: { Object: false } },
			{ name: "es5 globals", global: { JSON: false } },
			{ name: "es2015 globals", global: { Promise: false } },
			{ name: "es2017 globals", global: { SharedArrayBuffer: false } },
			{ name: "es2020 globals", global: { BigInt: false } },
			{ name: "es2021 globals", global: { WeakRef: false } },
		];

		globalTests.forEach(({ name, global }) => {
			it(`should contain ${name}`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, global);
			});
		});
	});

	describe("isTokenOnSameLine", () => {
		it("should return false if the tokens are not on the same line", () => {
			verifyWithRule("if(a)\n{}", {
				create: mustCall(context => ({
					BlockStatement: mustCall(node => {
						assert.isFalse(
							astUtils.isTokenOnSameLine(
								context.sourceCode.getTokenBefore(node),
								node,
							),
						);
					}),
				})),
			});
		});

		it("should return true if the tokens are on the same line", () => {
			verifyWithRule("if(a){}", {
				create: mustCall(context => ({
					BlockStatement: mustCall(node => {
						assert.isTrue(
							astUtils.isTokenOnSameLine(
								context.sourceCode.getTokenBefore(node),
								node,
							),
						);
					}),
				})),
			});
		});
	});

	describe("isNullOrUndefined", () => {
		const testCases = [
			{ code: "null", expected: true },
			{ code: "undefined", expected: true },
			{ code: "1", expected: false },
			{ code: "'test'", expected: false },
			{ code: "true", expected: false },
			{ code: "({})", expected: false },
			{ code: "/abc/u", expected: false, config: { ecmaVersion: 6 } },
		];

		testCases.forEach(({ code, expected, config }) => {
			it(`should return ${expected} if the argument is ${code}`, () => {
				const ast = espree.parse(code, config || {});
				assert.strictEqual(
					astUtils.isNullOrUndefined(ast.body[0].expression),
					expected,
				);
			});
		});
	});

	describe("checkReference", () => {
		const referenceTests = [
			{
				name: "catch",
				code: "try { } catch (e) { e = 10; }",
				nodeType: "CatchClause",
				expectedLength: 1,
			},
			{
				name: "const with assignment",
				code: "const a = 1; a = 2;",
				nodeType: "VariableDeclaration",
				expectedLength: 1,
			},
			{
				name: "const without assignment",
				code: "const a = 1; c = 2;",
				nodeType: "VariableDeclaration",
				expectedLength: 0,
			},
			{
				name: "class with assignment",
				code: "class A { }\n A = 1;",
				nodeType: "ClassDeclaration",
				expectedLength: 1,
				checkSecond: true,
			},
			{
				name: "class without assignment",
				code: "class A { } foo(A);",
				nodeType: "ClassDeclaration",
				expectedLength: 0,
			},
		];

		referenceTests.forEach(({ name, code, nodeType, expectedLength, checkSecond }) => {
			it(`should return ${expectedLength > 0 ? "true" : "false"} if reference is ${expectedLength > 0 ? "" : "not "}assigned for ${name}`, () => {
				verifyWithRule(code, {
					create: mustCall(context => ({
						[nodeType]: mustCall(node => {
							const variables = context.sourceCode.getDeclaredVariables(node);
							assert.lengthOf(
								astUtils.getModifyingReferences(variables[0].references),
								expectedLength,
							);
							if (checkSecond) {
								assert.lengthOf(
									astUtils.getModifyingReferences(variables[1].references),
									0,
								);
							}
						}),
					})),
				});
			});
		});
	});

	describe("isDirectiveComment", () => {
		/**
		 * Asserts the node is NOT a directive comment
		 * @param {ASTNode} node node to assert
		 * @returns {void}
		 */
		function assertFalse(node) {
			assert.isFalse(astUtils.isDirectiveComment(node));
		}

		/**
		 * Asserts the node is a directive comment
		 * @param {ASTNode} node node to assert
		 * @returns {void}
		 */
		function assertTrue(node) {
			assert.isTrue(astUtils.isDirectiveComment(node));
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
			const ast = parseCode(code);
			const sourceCode = createSourceCode(code, ast);
			const comments = sourceCode.getAllComments();

			comments.forEach(assertFalse);
		});

		it("should return false if it is not a directive block comment", () => {
			const code = [
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n");
			const ast = parseCode(code);
			const sourceCode = createSourceCode(code, ast);
			const comments = sourceCode.getAllComments();

			comments.forEach(assertFalse);
		});

		it("should return true if it is a directive line comment", () => {
			const code = [
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n");
			const ast = parseCode(code);
			const sourceCode = createSourceCode(code, ast);
			const comments = sourceCode.getAllComments();

			comments.forEach(assertTrue);
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
			const ast = parseCode(code);
			const sourceCode = createSourceCode(code, ast);
			const comments = sourceCode.getAllComments();

			comments.forEach(assertTrue);
		});
	});

	describe("isParenthesised", () => {
		it("should return false for not parenthesised nodes", () => {
			const code = "condition ? 1 : 2";
			const ast = parseCode(code);
			const sourceCode = createSourceCode(code, ast);

			assert.isFalse(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});

		it("should return true for parenthesised nodes", () => {
			const code = "(condition ? 1 : 2)";
			const ast = parseCode(code);
			const sourceCode = createSourceCode(code, ast);

			assert.isTrue(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});
	});

	describe("isFunction", () => {
		const functionTests = [
			{ code: "function a() {}", description: "FunctionDeclaration" },
			{ code: "(function a() {})", description: "FunctionExpression", selector: "expression" },
			{ code: "(() => {})", description: "ArrowFunctionExpression", selector: "expression", config: { ecmaVersion: 6 } },
		];

		functionTests.forEach(({ code, description, selector = "body[0]", config }) => {
			it(`should return true for ${description}`, () => {
				const ast = espree.parse(code, config || {});
				const node = selector === "expression" ? ast.body[0].expression : ast.body[0];

				assert(astUtils.isFunction(node));
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
		const loopTests = [
			{ code: "do {} while (a)", description: "DoWhileStatement" },
			{ code: "for (var k in obj) {}", description: "ForInStatement" },
			{ code: "for (var x of list) {}", description: "ForOfStatement", config: { ecmaVersion: 6 } },
			{ code: "for (var i = 0; i < 10; ++i) {}", description: "ForStatement" },
			{ code: "while (a) {}", description: "WhileStatement" },
		];

		loopTests.forEach(({ code, description, config }) => {
			it(`should return true for ${description}`, () => {
				const ast = espree.parse(code, config || {});
				const node = ast.body[0];

				assert(astUtils.isLoop(node));
			});
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
		 * @param {string} code the code to check.
		 * @param {string} nodeType the type of the node to consider.
		 * @param {boolean} expectedInLoop the expected result.
		 * @returns {void}
		 */
		function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
			const results = [];

			verifyWithRule(code, {
				create: mustCall(() => ({
					[nodeType]: mustCall(node => {
						results.push(astUtils.isInLoop(node));
					}),
				})),
			});

			assert.lengthOf(results, 1);
			assert.strictEqual(results[0], expectedInLoop);
		}

		const inLoopTests = [
			{ code: "while (a) {}", nodeType: "WhileStatement", expected: true, description: "loop itself" },
			{ code: "while (a) {}", nodeType: "Identifier", expected: true, description: "loop condition" },
			{ code: "for (var a in b) {}", nodeType: "VariableDeclaration", expected: true, description: "loop assignee" },
			{ code: "for (var a of b) { console.log('Hello'); }", nodeType: "Literal", expected: true, description: "node within loop body" },
			{ code: "while (true) {} a(b);", nodeType: "CallExpression", expected: false, description: "node outside loop body" },
			{ code: "while (true) { funcs.push(() => { var a; }); }", nodeType: "VariableDeclaration", expected: false, description: "loop not in current function" },
		];

		inLoopTests.forEach(({ code, nodeType, expected, description }) => {
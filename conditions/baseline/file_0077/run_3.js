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

	describe("ECMASCRIPT_GLOBALS", () => {
		const globalTests = [
			{ name: "es3 globals", property: "Object", value: false },
			{ name: "es5 globals", property: "JSON", value: false },
			{ name: "es2015 globals", property: "Promise", value: false },
			{ name: "es2017 globals", property: "SharedArrayBuffer", value: false },
			{ name: "es2020 globals", property: "BigInt", value: false },
			{ name: "es2021 globals", property: "WeakRef", value: false },
		];

		globalTests.forEach(({ name, property, value }) => {
			it(`should contain ${name}`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, {
					[property]: value,
				});
			});
		});
	});

	describe("isTokenOnSameLine", () => {
		const testCases = [
			{
				name: "should return false if the tokens are not on the same line",
				code: "if(a)\n{}",
				expected: false,
			},
			{
				name: "should return true if the tokens are on the same line",
				code: "if(a){}",
				expected: true,
			},
		];

		testCases.forEach(({ name, code, expected }) => {
			it(name, () => {
				linter.verify(code, {
					plugins: {
						test: {
							rules: {
								checker: {
									create: mustCall(context => ({
										BlockStatement: mustCall(node => {
											assert.strictEqual(
												astUtils.isTokenOnSameLine(
													context.sourceCode.getTokenBefore(
														node,
													),
													node,
												),
												expected,
											);
										}),
									})),
								},
							},
						},
					},
					rules: { "test/checker": "error" },
				});
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
			{ code: "/abc/u", expected: false, ecmaVersion: 6 },
		];

		testCases.forEach(({ code, expected, ecmaVersion = undefined }) => {
			it(`should return ${expected} for ${code}`, () => {
				const parseOptions = ecmaVersion ? { ecmaVersion } : undefined;
				const ast = espree.parse(code, parseOptions);
				assert.strictEqual(
					astUtils.isNullOrUndefined(ast.body[0].expression),
					expected,
				);
			});
		});
	});

	describe("checkReference", () => {
		const testCases = [
			{
				name: "should return true if reference is assigned for catch",
				code: "try { } catch (e) { e = 10; }",
				nodeType: "CatchClause",
				expectedLength: 1,
			},
			{
				name: "should return true if reference is assigned for const",
				code: "const a = 1; a = 2;",
				nodeType: "VariableDeclaration",
				expectedLength: 1,
			},
			{
				name: "should return false if reference is not assigned for const",
				code: "const a = 1; c = 2;",
				nodeType: "VariableDeclaration",
				expectedLength: 0,
			},
			{
				name: "should return true if reference is assigned for class",
				code: "class A { }\n A = 1;",
				nodeType: "ClassDeclaration",
				expectedLength: 1,
				checkSecondVariable: true,
			},
			{
				name: "should return false if reference is not assigned for class",
				code: "class A { } foo(A);",
				nodeType: "ClassDeclaration",
				expectedLength: 0,
			},
		];

		testCases.forEach(
			({
				name,
				code,
				nodeType,
				expectedLength,
				checkSecondVariable,
			}) => {
				it(name, () => {
					linter.verify(code, {
						plugins: {
							test: {
								rules: {
									checker: {
										create: mustCall(context => ({
											[nodeType]: mustCall(node => {
												const variables =
													context.sourceCode.getDeclaredVariables(
														node,
													);

												assert.lengthOf(
													astUtils.getModifyingReferences(
														variables[0].references,
													),
													expectedLength,
												);

												if (checkSecondVariable) {
													assert.lengthOf(
														astUtils.getModifyingReferences(
															variables[1].references,
														),
														0,
													);
												}
											}),
										})),
									},
								},
							},
						},
						rules: { "test/checker": "error" },
					});
				});
			},
		);
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

		const testCases = [
			{
				name: "should return false if it is not a directive line comment",
				codes: [
					"// lalala I'm a normal comment",
					"// trying to confuse eslint ",
					"//trying to confuse eslint-directive-detection",
					"//eslint is awesome",
					"//global line comment is not a directive",
					"//globals line comment is not a directive",
					"//exported line comment is not a directive",
				],
				assertion: assertFalse,
			},
			{
				name: "should return false if it is not a directive block comment",
				codes: [
					"/* lalala I'm a normal comment */",
					"/* trying to confuse eslint */",
					"/* trying to confuse eslint-directive-detection */",
					"/*eSlInT is awesome*/",
				],
				assertion: assertFalse,
			},
			{
				name: "should return true if it is a directive line comment",
				codes: [
					"// eslint-disable-line no-undef",
					"// eslint-secret-directive 4 8 15 16 23 42   ",
					"// eslint-directive-without-argument",
					"//eslint-directive-without-padding",
				],
				assertion: assertTrue,
			},
			{
				name: "should return true if it is a directive block comment",
				codes: [
					"/* eslint-disable no-undef */",
					"/*eslint-enable no-undef*/",
					'/* eslint-env {"es6": true} */',
					"/* eslint foo */",
					"/*eslint bar*/",
					"/*global foo*/",
					"/*globals foo*/",
					"/*exported foo*/",
				],
				assertion: assertTrue,
			},
		];

		testCases.forEach(({ name, codes, assertion }) => {
			it(name, () => {
				const code = codes.join("\n");
				const ast = espree.parse(code, ESPREE_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				const comments = sourceCode.getAllComments();

				comments.forEach(assertion);
			});
		});
	});

	describe("isParenthesised", () => {
		const testCases = [
			{
				name: "should return false for not parenthesised nodes",
				code: "condition ? 1 : 2",
				expected: false,
			},
			{
				name: "should return true for parenthesised nodes",
				code: "(condition ? 1 : 2)",
				expected: true,
			},
		];

		testCases.forEach(({ name, code, expected }) => {
			it(name, () => {
				const ast = espree.parse(code, ESPREE_CONFIG);
				const sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					astUtils.isParenthesised(sourceCode, ast.body[0].expression),
					expected,
				);
			});
		});
	});

	describe("isFunction", () => {
		const testCases = [
			{
				name: "should return true for FunctionDeclaration",
				code: "function a() {}",
				selector: node => node,
				expected: true,
			},
			{
				name: "should return true for FunctionExpression",
				code: "(function a() {})",
				selector: node => node.expression,
				expected: true,
			},
			{
				name: "should return true for ArrowFunctionExpression",
				code: "(() => {})",
				selector: node => node.expression,
				expected: true,
				ecmaVersion: 6,
			},
		];

		testCases.forEach(({ name, code, selector, expected, ecmaVersion }) => {
			it(name, () => {
				const parseOptions = ecmaVersion ? { ecmaVersion } : undefined;
				const ast = espree.parse(code, parseOptions);
				const node = selector(ast.body[0]);

				assert.strictEqual(astUtils.isFunction(node), expected);
			});
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");

			assert.isFalse(astUtils.isFunction(ast));
			assert.isFalse(astUtils.isFunction(ast.body[0]));
			assert.isFalse(astUtils.isFunction(ast.body[1]));
		});
	});

	describe("isLoop", () => {
		const testCases = [
			{
				name: "should return true for DoWhileStatement",
				code: "do {} while (a)",
				selector: node => node,
			},
			{
				name: "should return true for ForInStatement",
				code: "for (var k in obj) {}",
				selector: node => node,
			},
			{
				name: "should return true for ForOfStatement",
				code: "for (var x of list) {}",
				selector: node => node,
				ecmaVersion: 6,
			},
			{
				name: "should return true for ForStatement",
				code: "for (var i = 0; i < 10; ++i) {}",
				selector: node => node,
			},
			{
				name: "should return true for WhileStatement",
				code: "while (a) {}",
				selector: node => node,
			},
		];

		testCases.forEach(({ name, code, selector, ecmaVersion }) => {
			it(name, () => {
				const parseOptions = ecmaVersion ? { ecmaVersion } : undefined;
				const ast = espree.parse(code, parseOptions);
				const node = selector(ast.body[0]);

				assert.isTrue(astUtils.isLoop(node));
			});
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");

			assert.isFalse(astUtils.isLoop(ast));
			assert.isFalse(astUtils.isLoop(ast.body[0]));
			assert.isFalse(astUtils.isLoop(ast.body[1]));
		});
	});

	describe("isInLoop", () => {
		/**
		 * Asserts that the unique node of the given type in the code is either
		 * in a loop or not in a loop.
		 * @param {string} code the code to check.
		 * @param {string} nodeType the type of the node to consider. The code
		 *      must have exactly one node of this type.
		 * @param {boolean} expectedInLoop the expected result for whether the
		 *      node is in a loop.
		 * @returns {void}
		 */
		function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
			const results = [];

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(() => ({
									[nodeType]: mustCall(node => {
										results.push(astUtils.isInLoop(node));
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});

			assert.lengthOf(results, 1);
			assert.strictEqual(results[0], expectedInLoop);
		}

		const testCases = [
			{
				name: "should return true for a loop itself",
				code: "while (a) {}",
				nodeType: "WhileStatement",
				expected: true,
			},
			{
				name: "should return true for a loop condition",
				code: "while (a) {}",
				nodeType: "Identifier",
				expected: true,
			},
			{
				name: "should return true for a loop assignee",
				code: "for (var a in b) {}",
				nodeType: "VariableDeclaration",
				expected: true,
			},
			{
				name: "should return true for a node within a loop body",
				code: "for (var a of b) { console.log('Hello'); }",
				nodeType: "Literal",
				expected: true,
			},
			{
				name: "should return false for a node outside a loop body",
				code: "while (true) {} a(b);",
				nodeType: "CallExpression",
				expected: false,
			},
			{
				name: "should return false when the loop is not in the current function",
				code: "while (true) { funcs.push(() => { var a; }); }",
				nodeType: "VariableDeclaration",
				expected: false,
			},
		];

		testCases.forEach(({ name, code, node
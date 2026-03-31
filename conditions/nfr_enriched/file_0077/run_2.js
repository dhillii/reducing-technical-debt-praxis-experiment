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
		const testCases = [
			{ code: "if(a)\n{}", expected: false, description: "tokens are not on the same line" },
			{ code: "if(a){}", expected: true, description: "tokens are on the same line" },
		];

		testCases.forEach(({ code, expected, description }) => {
			it(`should return ${expected} if the ${description}`, () => {
				linter.verify(code, {
					plugins: {
						test: {
							rules: {
								checker: {
									create: mustCall(context => ({
										BlockStatement: mustCall(node => {
											assert.strictEqual(
												astUtils.isTokenOnSameLine(
													context.sourceCode.getTokenBefore(node),
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
			it(`should return ${expected} if the argument is ${code}`, () => {
				const parseOptions = ecmaVersion ? { ecmaVersion } : undefined;
				assert.strictEqual(
					astUtils.isNullOrUndefined(
						espree.parse(code, parseOptions).body[0].expression,
					),
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
				expectedCount: 1,
			},
			{
				name: "const with assignment",
				code: "const a = 1; a = 2;",
				nodeType: "VariableDeclaration",
				expectedCount: 1,
			},
			{
				name: "const without assignment",
				code: "const a = 1; c = 2;",
				nodeType: "VariableDeclaration",
				expectedCount: 0,
			},
			{
				name: "class with assignment",
				code: "class A { }\n A = 1;",
				nodeType: "ClassDeclaration",
				expectedCount: 1,
				secondVarExpectedCount: 0,
			},
			{
				name: "class without assignment",
				code: "class A { } foo(A);",
				nodeType: "ClassDeclaration",
				expectedCount: 0,
			},
		];

		referenceTests.forEach(({ name, code, nodeType, expectedCount, secondVarExpectedCount }) => {
			it(`should return ${expectedCount > 0 ? "true" : "false"} if reference is ${expectedCount > 0 ? "" : "not "}assigned for ${name}`, () => {
				linter.verify(code, {
					plugins: {
						test: {
							rules: {
								checker: {
									create: mustCall(context => ({
										[nodeType]: mustCall(node => {
											const variables = context.sourceCode.getDeclaredVariables(node);
											assert.lengthOf(
												astUtils.getModifyingReferences(variables[0].references),
												expectedCount,
											);
											if (secondVarExpectedCount !== undefined) {
												assert.lengthOf(
													astUtils.getModifyingReferences(variables[1].references),
													secondVarExpectedCount,
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
		});
	});

	describe("isDirectiveComment", () => {
		function assertFalse(node) {
			assert.isFalse(astUtils.isDirectiveComment(node));
		}

		function assertTrue(node) {
			assert.isTrue(astUtils.isDirectiveComment(node));
		}

		const nonDirectiveLineComments = [
			"// lalala I'm a normal comment",
			"// trying to confuse eslint ",
			"//trying to confuse eslint-directive-detection",
			"//eslint is awesome",
			"//global line comment is not a directive",
			"//globals line comment is not a directive",
			"//exported line comment is not a directive",
		];

		const nonDirectiveBlockComments = [
			"/* lalala I'm a normal comment */",
			"/* trying to confuse eslint */",
			"/* trying to confuse eslint-directive-detection */",
			"/*eSlInT is awesome*/",
		];

		const directiveLineComments = [
			"// eslint-disable-line no-undef",
			"// eslint-secret-directive 4 8 15 16 23 42   ",
			"// eslint-directive-without-argument",
			"//eslint-directive-without-padding",
		];

		const directiveBlockComments = [
			"/* eslint-disable no-undef */",
			"/*eslint-enable no-undef*/",
			'/* eslint-env {"es6": true} */',
			"/* eslint foo */",
			"/*eslint bar*/",
			"/*global foo*/",
			"/*globals foo*/",
			"/*exported foo*/",
		];

		it("should return false if it is not a directive line comment", () => {
			const code = nonDirectiveLineComments.join("\n");
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			sourceCode.getAllComments().forEach(assertFalse);
		});

		it("should return false if it is not a directive block comment", () => {
			const code = nonDirectiveBlockComments.join("\n");
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			sourceCode.getAllComments().forEach(assertFalse);
		});

		it("should return true if it is a directive line comment", () => {
			const code = directiveLineComments.join("\n");
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			sourceCode.getAllComments().forEach(assertTrue);
		});

		it("should return true if it is a directive block comment", () => {
			const code = directiveBlockComments.join("\n");
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			sourceCode.getAllComments().forEach(assertTrue);
		});
	});

	describe("isParenthesised", () => {
		const testCases = [
			{ code: "condition ? 1 : 2", expected: false },
			{ code: "(condition ? 1 : 2)", expected: true },
		];

		testCases.forEach(({ code, expected }) => {
			it(`should return ${expected} for ${expected ? "" : "not "}parenthesised nodes`, () => {
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
			{ code: "function a() {}", expected: true, description: "FunctionDeclaration" },
			{ code: "(function a() {})", expected: true, description: "FunctionExpression" },
			{ code: "(() => {})", expected: true, description: "ArrowFunctionExpression", ecmaVersion: 6 },
		];

		testCases.forEach(({ code, expected, description, ecmaVersion = undefined }) => {
			it(`should return ${expected} for ${description}`, () => {
				const parseOptions = ecmaVersion ? { ecmaVersion } : undefined;
				const ast = espree.parse(code, parseOptions);
				const node = code.includes("=>") ? ast.body[0].expression : ast.body[0];
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
			{ code: "do {} while (a)", type: "DoWhileStatement" },
			{ code: "for (var k in obj) {}", type: "ForInStatement" },
			{ code: "for (var x of list) {}", type: "ForOfStatement", ecmaVersion: 6 },
			{ code: "for (var i = 0; i < 10; ++i) {}", type: "ForStatement" },
			{ code: "while (a) {}", type: "WhileStatement" },
		];

		testCases.forEach(({ code, type, ecmaVersion = undefined }) => {
			it(`should return true for ${type}`, () => {
				const parseOptions = ecmaVersion ? { ecmaVersion } : undefined;
				const ast = espree.parse(code, parseOptions);
				assert.isTrue(astUtils.isLoop(ast.body[0]));
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
			{ code: "while (a) {}", nodeType: "WhileStatement", expected: true, description: "loop itself" },
			{ code: "while (a) {}", nodeType: "Identifier", expected: true, description: "loop condition" },
			{ code: "for (var a in b) {}", nodeType: "VariableDeclaration", expected: true, description: "loop assignee" },
			{ code: "for (var a of b) { console.log('Hello'); }", nodeType: "Literal", expected: true, description: "node within a loop body" },
			{ code: "while (true) {} a(b);", nodeType: "CallExpression", expected: false, description: "node outside a loop body" },
			{ code: "while (true) { funcs.push(() => { var a; }); }", nodeType: "VariableDeclaration", expected: false, description: "loop not in the current function" },
		];

		testCases.forEach(({ code, nodeType, expected, description }) => {
			it(`should return ${expected} for a ${description}`, () => {
				assertNodeTypeInLoop(code, nodeType, expected);
			});
		});
	});

	describe("getStaticStringValue", () => {
		const expectedResults = {
			"''": "",
			"'foo'": "foo",
			false: "false",
			true: "true",
			null: "null",
			0: "0",
			"0.": "0",
			".0": "0",
			1: "1",
			"1.": "1",
			".1": "0.1",
			12: "12",
			".12": "0.12",
			0.12: "0.12",
			12.34: "12.34",
			"12e3": "12000",
			"12e-3": "0.012",
			"12.34e5": "1234000",
			"12.34e-5": "0.0001234",
			"011": "9",
			"081": "81",
			"0b11": "3",
			"0b011": "3",
			"0o11": "9",
			"0o011": "9",
			"0x11": "17",
			"0x011": "17",
			"/a/": "/a/",
			"/a/i": "/a/i",
			"/[0-9]/": "/[0-9]/",
			"/(?<zero>0)/": "/(?<zero>0)/",
			"/(?<zero>0)/s": "/(?<zero>
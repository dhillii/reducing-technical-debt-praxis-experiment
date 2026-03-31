```javascript
"use strict";

const assert = require("chai").assert,
	util = require("node:util"),
	espree = require("espree"),
	astUtils = require("../../../../lib/rules/utils/ast-utils"),
	{ Linter } = require("../../../../lib/linter"),
	{ SourceCode } = require("../../../../lib/languages/js/source-code");

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

		referenceTests.forEach(
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
		function assertFalse(node) {
			assert.isFalse(astUtils.isDirectiveComment(node));
		}

		function assertTrue(node) {
			assert.isTrue(astUtils.isDirectiveComment(node));
		}

		const directiveCommentTests = [
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
				assertFn: assertFalse,
			},
			{
				name: "should return false if it is not a directive block comment",
				codes: [
					"/* lalala I'm a normal comment */",
					"/* trying to confuse eslint */",
					"/* trying to confuse eslint-directive-detection */",
					"/*eSlInT is awesome*/",
				],
				assertFn: assertFalse,
			},
			{
				name: "should return true if it is a directive line comment",
				codes: [
					"// eslint-disable-line no-undef",
					"// eslint-secret-directive 4 8 15 16 23 42   ",
					"// eslint-directive-without-argument",
					"//eslint-directive-without-padding",
				],
				assertFn: assertTrue,
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
				assertFn: assertTrue,
			},
		];

		directiveCommentTests.forEach(({ name, codes, assertFn }) => {
			it(name, () => {
				const code = codes.join("\n");
				const ast = espree.parse(code, ESPREE_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				const comments = sourceCode.getAllComments();

				comments.forEach(assertFn);
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
				const ast = espree.parse(code, { ecmaVersion });
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
		const loopTests = [
			{ name: "DoWhileStatement", code: "do {} while (a)" },
			{ name: "ForInStatement", code: "for (var k in obj) {}" },
			{ name: "ForOfStatement", code: "for (var x of list) {}", ecmaVersion: 6 },
			{ name: "ForStatement", code: "for (var i = 0; i < 10; ++i) {}" },
			{ name: "WhileStatement", code: "while (a) {}" },
		];

		loopTests.forEach(({ name, code, ecmaVersion }) => {
			it(`should return true for ${name}`, () => {
				const ast = espree.parse(code, { ecmaVersion });
				const node = ast.body[0];

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
			{ code: "while (a) {}", nodeType: "WhileStatement", expected: true },
			{ code: "while (a) {}", nodeType: "Identifier", expected: true },
			{
				code: "for (var a in b) {}",
				nodeType: "VariableDeclaration",
				expected: true,
			},
			{
				code: "for (var a of b) { console.log('Hello'); }",
				nodeType: "Literal",
				expected: true,
			},
			{
				code: "while (true) {} a(b);",
				nodeType: "CallExpression",
				expected: false,
			},
			{
				code: "while (true) { funcs.push(() => { var a; }); }",
				nodeType: "VariableDeclaration",
				expected: false,
			},
		];

		testCases.forEach(({ code, nodeType, expected }) => {
			it(`should return ${expected} for ${nodeType}`, () => {
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
			"/(?<zero>0)/s": "/(?<zero>0)/s",
			"/(?<=a)b/s": "/(?<=a)b/s",
			"``": "",
			"`foo`": "foo",
			"`${''}`": null,
			"`${0}`": null,
			"tag``": null,
			"-0": null,
			"-1": null,
			"1 + 2": null,
			"[]": null,
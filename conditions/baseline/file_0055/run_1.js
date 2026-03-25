Looking at this code, I can identify several patterns that can be refactored to reduce complexity and repetition:

1. **Token test suites** - Many `describe` blocks for token predicates share identical structure
2. **Linter-based tests** - Repeated boilerplate for creating linter plugins with checker rules
3. **Simple assertion loops** - Many `Object.keys(expectedResults).forEach` patterns can be extracted

Here's the refactored code:

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
 * Creates a linter plugin config with a checker rule.
 * @param {Function} createFn The rule's create function
 * @returns {Object} Linter verify config
 */
function makeCheckerConfig(createFn) {
	return {
		plugins: {
			test: {
				rules: {
					checker: { create: createFn },
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Runs linter with a node visitor and calls a callback for each visited node.
 * @param {string} code Source code to verify
 * @param {string} selector AST selector
 * @param {Function} mustCall Wrapper to track calls
 * @param {Function} callback Callback receiving the node
 * @returns {void}
 */
function verifyWithNodeVisitor(code, selector, mustCall, callback) {
	linter.verify(
		code,
		makeCheckerConfig(
			mustCall(() => ({ [selector]: mustCall(callback) })),
		),
	);
}

/**
 * Generates token predicate tests for a pair of (positive, negative) functions.
 * @param {string} positiveName Name of the positive predicate (e.g. "isClosingBraceToken")
 * @param {string} negativeName Name of the negative predicate (e.g. "isNotClosingBraceToken")
 * @param {Array} tokens Parsed tokens
 * @param {boolean[]} expected Expected results per token
 * @returns {void}
 */
function describeTokenPredicatePair(positiveName, negativeName, tokens, expected) {
	describe(positiveName, () => {
		tokens.forEach((token, index) => {
			it(`should return ${expected[index]} for '${token.value}'.`, () => {
				assert.strictEqual(astUtils[positiveName](token), expected[index]);
			});
		});
	});

	describe(negativeName, () => {
		tokens.forEach((token, index) => {
			it(`should return ${!expected[index]} for '${token.value}'.`, () => {
				assert.strictEqual(astUtils[negativeName](token), !expected[index]);
			});
		});
	});
}

/**
 * Parses tokens from code with ecmaVersion 6.
 * @param {string} code Source code
 * @returns {Array} Tokens
 */
function parseTokens(code) {
	return espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens;
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

	// ---------------------------------------------------------------------------
	// ECMASCRIPT_GLOBALS
	// ---------------------------------------------------------------------------

	describe("ECMASCRIPT_GLOBALS", () => {
		const expectedGlobals = [
			["es3", { Object: false }],
			["es5", { JSON: false }],
			["es2015", { Promise: false }],
			["es2017", { SharedArrayBuffer: false }],
			["es2020", { BigInt: false }],
			["es2021", { WeakRef: false }],
		];

		expectedGlobals.forEach(([version, global]) => {
			it(`should contain ${version} globals`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, global);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isTokenOnSameLine
	// ---------------------------------------------------------------------------

	describe("isTokenOnSameLine", () => {
		/**
		 * Creates a checker that asserts isTokenOnSameLine result for a BlockStatement.
		 * @param {Function} mustCallFn mustCall wrapper
		 * @param {boolean} expected Expected result
		 * @returns {Function} Rule create function
		 */
		function makeTokenOnSameLineChecker(mustCallFn, expected) {
			return mustCallFn(context => ({
				BlockStatement: mustCallFn(node => {
					const assertFn = expected ? assert.isTrue : assert.isFalse;
					assertFn(
						astUtils.isTokenOnSameLine(
							context.sourceCode.getTokenBefore(node),
							node,
						),
					);
				}),
			}));
		}

		it("should return false if the tokens are not on the same line", () => {
			linter.verify(
				"if(a)\n{}",
				makeCheckerConfig(makeTokenOnSameLineChecker(mustCall, false)),
			);
		});

		it("should return true if the tokens are on the same line", () => {
			linter.verify(
				"if(a){}",
				makeCheckerConfig(makeTokenOnSameLineChecker(mustCall, true)),
			);
		});
	});

	// ---------------------------------------------------------------------------
	// isNullOrUndefined
	// ---------------------------------------------------------------------------

	describe("isNullOrUndefined", () => {
		const cases = [
			["null", true],
			["undefined", true],
			["1", false],
			["'test'", false],
			["true", false],
			["({})", false],
			["/abc/u", false],
		];

		cases.forEach(([code, expected]) => {
			const parseOpts = code === "/abc/u" ? { ecmaVersion: 6 } : {};
			it(`should return ${expected} if the argument is ${code}`, () => {
				assert.strictEqual(
					astUtils.isNullOrUndefined(
						espree.parse(code, parseOpts).body[0].expression,
					),
					expected,
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// checkReference (getModifyingReferences)
	// ---------------------------------------------------------------------------

	describe("checkReference", () => {
		/**
		 * Creates a linter checker that asserts getModifyingReferences length.
		 * @param {Function} mustCallFn mustCall wrapper
		 * @param {string} nodeType AST node type to visit
		 * @param {number[]} expectedLengths Expected lengths per variable
		 * @returns {Function} Rule create function
		 */
		function makeReferenceChecker(mustCallFn, nodeType, expectedLengths) {
			return mustCallFn(context => ({
				[nodeType]: mustCallFn(node => {
					const variables = context.sourceCode.getDeclaredVariables(node);
					expectedLengths.forEach((len, i) => {
						assert.lengthOf(
							astUtils.getModifyingReferences(variables[i].references),
							len,
						);
					});
				}),
			}));
		}

		it("should return true if reference is assigned for catch", () => {
			linter.verify(
				"try { } catch (e) { e = 10; }",
				makeCheckerConfig(makeReferenceChecker(mustCall, "CatchClause", [1])),
			);
		});

		it("should return true if reference is assigned for const", () => {
			linter.verify(
				"const a = 1; a = 2;",
				makeCheckerConfig(makeReferenceChecker(mustCall, "VariableDeclaration", [1])),
			);
		});

		it("should return false if reference is not assigned for const", () => {
			linter.verify(
				"const a = 1; c = 2;",
				makeCheckerConfig(makeReferenceChecker(mustCall, "VariableDeclaration", [0])),
			);
		});

		it("should return true if reference is assigned for class", () => {
			linter.verify(
				"class A { }\n A = 1;",
				makeCheckerConfig(makeReferenceChecker(mustCall, "ClassDeclaration", [1, 0])),
			);
		});

		it("should return false if reference is not assigned for class", () => {
			linter.verify(
				"class A { } foo(A);",
				makeCheckerConfig(makeReferenceChecker(mustCall, "ClassDeclaration", [0])),
			);
		});
	});

	// ---------------------------------------------------------------------------
	// isDirectiveComment
	// ---------------------------------------------------------------------------

	describe("isDirectiveComment", () => {
		function assertFalse(node) {
			assert.isFalse(astUtils.isDirectiveComment(node));
		}

		function assertTrue(node) {
			assert.isTrue(astUtils.isDirectiveComment(node));
		}

		/**
		 * Parses code and returns all comments.
		 * @param {string} code Source code
		 * @returns {Array} Comments
		 */
		function getComments(code) {
			const ast = espree.parse(code, ESPREE_CONFIG);
			return new SourceCode(code, ast).getAllComments();
		}

		it("should return false if it is not a directive line comment", () => {
			getComments([
				"// lalala I'm a normal comment",
				"// trying to confuse eslint ",
				"//trying to confuse eslint-directive-detection",
				"//eslint is awesome",
				"//global line comment is not a directive",
				"//globals line comment is not a directive",
				"//exported line comment is not a directive",
			].join("\n")).forEach(assertFalse);
		});

		it("should return false if it is not a directive block comment", () => {
			getComments([
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n")).forEach(assertFalse);
		});

		it("should return true if it is a directive line comment", () => {
			getComments([
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n")).forEach(assertTrue);
		});

		it("should return true if it is a directive block comment", () => {
			getComments([
				"/* eslint-disable no-undef */",
				"/*eslint-enable no-undef*/",
				'/* eslint-env {"es6": true} */',
				"/* eslint foo */",
				"/*eslint bar*/",
				"/*global foo*/",
				"/*globals foo*/",
				"/*exported foo*/",
			].join("\n")).forEach(assertTrue);
		});
	});

	// ---------------------------------------------------------------------------
	// isParenthesised
	// ---------------------------------------------------------------------------

	describe("isParenthesised", () => {
		const cases = [
			["condition ? 1 : 2", false],
			["(condition ? 1 : 2)", true],
		];

		cases.forEach(([code, expected]) => {
			it(`should return ${expected} for ${expected ? "" : "not "}parenthesised nodes`, () => {
				const ast = espree.parse(code, ESPREE_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				const assertFn = expected ? assert.isTrue : assert.isFalse;

				assertFn(astUtils.isParenthesised(sourceCode, ast.body[0].expression));
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isFunction
	// ---------------------------------------------------------------------------

	describe("isFunction", () => {
		it("should return true for FunctionDeclaration", () => {
			const ast = espree.parse("function a() {}");
			assert(astUtils.isFunction(ast.body[0]));
		});

		it("should return true for FunctionExpression", () => {
			const ast = espree.parse("(function a() {})");
			assert(astUtils.isFunction(ast.body[0].expression));
		});

		it("should return true for AllowFunctionExpression", () => {
			const ast = espree.parse("(() => {})", { ecmaVersion: 6 });
			assert(astUtils.isFunction(ast.body[0].expression));
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");
			assert(!astUtils.isFunction(ast));
			assert(!astUtils.isFunction(ast.body[0]));
			assert(!astUtils.isFunction(ast.body[1]));
		});
	});

	// ---------------------------------------------------------------------------
	// isLoop
	// ---------------------------------------------------------------------------

	describe("isLoop", () => {
		const loopCases = [
			["DoWhileStatement", "do {} while (a)"],
			["ForInStatement", "for (var k in obj) {}"],
			["ForOfStatement", "for (var x of list) {}", { ecmaVersion: 6 }],
			["ForStatement", "for (var i = 0; i < 10; ++i) {}"],
			["WhileStatement", "while (a) {}"],
		];

		loopCases.forEach(([type, code, opts]) => {
			it(`should return true for ${type}`, () => {
				const ast = espree.parse(code, opts);
				assert(astUtils.isLoop(ast.body[0]));
			});
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");
			assert(!astUtils.isLoop(ast));
			assert(!astUtils.isLoop(ast.body[0]));
			assert(!astUtils.isLoop(ast.body[1]));
		});
	});

	// ---------------------------------------------------------------------------
	// isInLoop
	// ---------------------------------------------------------------------------

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

			linter.verify(
				code,
				makeCheckerConfig(
					mustCall(() => ({
						[nodeType]: mustCall(node => {
							results.push(astUtils.isInLoop(node));
						}),
					})),
				),
			);

			assert.lengthOf(results, 1);
			assert.strictEqual(results[0], expectedInLoop);
		}

		const cases = [
			["should return true for a loop itself", "while (a) {}", "WhileStatement", true],
			["should return true for a loop condition", "while (a) {}", "Identifier", true],
			["should return true for a loop assignee", "for (var a in b) {}", "VariableDeclaration", true],
			["should return true for a node within a loop body", "for (var a of b) { console.log('Hello'); }", "Literal", true],
			["should return false for a node outside a loop body", "while (true) {} a(b);", "CallExpression", false],
			["should return false when the loop is not in the current function", "while (true) { funcs.push(() => { var a; }); }", "VariableDeclaration", false],
		];

		cases.forEach(([description, code, nodeType, expected]) => {
			it(description, () => {
				assertNodeTypeInLoop(code, nodeType, expected);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// getStaticStringValue
	// ---------------------------------------------------------------------------

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
			"({})": null,
			foo: null,
			undefined: null,
			this: null,
			"(function () {})": null,
		};

		Object.keys(expectedResults).forEach(key => {
			it(`should return ${expectedResults[key]} for ${key}`, () => {
				const ast = espree.parse(key, { ecmaVersion: 2018 });
				assert.strictEqual(
					astUtils.getStaticStringValue(ast.body[0].expression),
					expectedResults[key],
				);
			});
		});

		it("should return text of regex literal even if it's not supported natively.", () => {
			const node = { type: "Literal", value: null, regex: { pattern: "(?:)", flags: "u" } };
			assert.strictEqual(astUtils.getStaticStringValue(node), "/(?:)/u");
		});

		it("should return text of bigint literal even if it's not supported natively.", () => {
			const node = { type: "Literal", value: null, bigint: "100n" };
			assert.strictEqual(astUtils.getStaticStringValue(node), "100n");
		});
	});

	// ---------------------------------------------------------------------------
	// getStaticPropertyName
	// ---------------------------------------------------------------------------

	describe("getStaticPropertyName", () => {
		const memberExprCases = [
			["a.b", {}, "b"],
			["a['b']", {}, "b"],
			["a[`b`]", { ecmaVersion: 6 }, "b"],
			["a[100]", {}, "100"],
			["a[b]", {}, null],
			["a['a' + 'b']", {}, null],
			["a[tag`b`]", { ecmaVersion: 6 }, null],
			["a[`${b}`]", { ecmaVersion: 6 }, null],
		];

		memberExprCases.forEach(([code, opts, expected]) => {
			it(`should return ${JSON.stringify(expected)} for \`${code}\``, () => {
				const ast = espree.parse(code, opts);
				assert.strictEqual(
					astUtils.getStaticPropertyName(ast.body[0].expression),
					expected,
				);
			});
		});

		const propertyCases = [
			["({b: 1})", {}, "b"],
			["({b() {}})", { ecmaVersion: 6 }, "b"],
			["({get b() {}})", { ecmaVersion: 6 }, "b"],
			["({['b']: 1})", { ecmaVersion: 6 }, "b"],
			["({['b']() {}})", { ecmaVersion: 6 }, "b"],
			["({[`b`]: 1})", { ecmaVersion: 6 }, "b"],
			["({[100]: 1})", { ecmaVersion: 6 }, "100"],
			["({[/(?<zero>0)/]: 1})", { ecmaVersion: 2018 }, "/(?<zero>0)/"],
			["({[b]: 1})", { ecmaVersion: 6 }, null],
			["({['a' + 'b']: 1})", { ecmaVersion: 6 }, null],
			["({[tag`b`]: 1})", { ecmaVersion: 6 }, null],
			["({[`${b}`]: 1})", { ecmaVersion: 6 }, null],
		];

		propertyCases.forEach(([code, opts, expected]) => {
			it(`should return ${JSON.stringify(expected)} for property in \`${code}\``, () => {
				const ast = espree.parse(code, opts);
				assert.strictEqual(
					astUtils.getStaticPropertyName(ast.body[0].expression.properties[0]),
					expected,
				);
			});
		});

		it("should return null for non member expressions", () => {
			const ast = espree.parse("foo()");
			assert.strictEqual(astUtils.getStaticPropertyName(ast.body[0].expression), null);
			assert.strictEqual(astUtils.getStaticPropertyName(ast.body[0]), null);
			assert.strictEqual(astUtils.getStaticPropertyName(ast.body), null);
			assert.strictEqual(astUtils.getStaticPropertyName(ast), null);
			assert.strictEqual(astUtils.getStaticPropertyName(null), null);
		});
	});

	// ---------------------------------------------------------------------------
	// getDirectivePrologue
	// ---------------------------------------------------------------------------

	describe("getDirectivePrologue", () => {
		const emptyCases = [
			["not a Program/Function node", "if (a) { b(); }", node => node.body[0]],
			["braceless ArrowFunctionExpression", "var foo = () => 'use strict';", node => node.body[0].declarations[0].init, { ecmaVersion: 6 }],
			["Program with no directives", "var foo;", node => node],
			["FunctionDeclaration with no directives", "function foo() { return bar; }", node => node.body[0]],
			["FunctionExpression with no directives", "var foo = function() { return bar; }", node => node.body[0].declarations[0].init],
			["ArrowFunctionExpression with no directives", "var foo = () => { return bar; };", node => node.body[0].declarations[0].init, { ecmaVersion: 6 }],
		];

		emptyCases.forEach(([desc, code, getNode, opts]) => {
			it(`should return empty array if node is ${desc}`, () => {
				const ast = espree.parse(code, opts);
				assert.deepStrictEqual(astUtils.getDirectivePrologue(getNode(ast)), []);
			});
		});

		const directiveCases = [
			["Program", "'use strict'; 'use asm'; var foo;", ast => ast],
			["FunctionDeclaration", "function foo() { 'use strict'; 'use asm'; return bar; }", ast => ast.body[0]],
			["FunctionExpression", "var foo = function() { 'use strict'; 'use asm'; return bar; }", ast => ast.body[0].declarations[0].init],
			["ArrowFunctionExpression", "var foo = () => { 'use strict'; 'use asm'; return bar; };", ast => ast.body[0].declarations[0].init, { ecmaVersion: 6 }],
		];

		directiveCases.forEach(([type, code, getNode, opts]) => {
			it(`should return directives in ${type} body`, () => {
				const ast = espree.parse(code, opts);
				const result = astUtils.getDirectivePrologue(getNode(ast));
				assert.strictEqual(result.length, 2);
				assert.strictEqual(result[0].expression.value, "use strict");
				assert.strictEqual(result[1].expression.value, "use asm");
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isDecimalInteger / isDecimalIntegerNumericToken
	// ---------------------------------------------------------------------------

	{
		const expectedResults = {
			0: true, 5: true, 8: true, 9: true, 50: true, 123: true,
			"1_0": true, "1_0_1": true, "12_3": true, "5_000": true,
			"500_0": true, "500_00": true, "5_000_00": true, "1_234_56": true,
			"1_2_3_4": true, "11_22_33_44": true, "1_23_4_56_7_89": true,
			"08": true, "09": true, "008": true, "0192": true, "0180": true,
			"090": true, "088": true, "099": true, "089": true, "0098": true,
			"01892": true, "08192": true, "01829": true, "018290": true,
			"0.": false, "5.": false, ".0": false, ".5": false, "5.0": false,
			"5.00_00": false, "5.0_1": false, "0.1_0": false, "5.1_2": false,
			"1.23_45": false, ".0_1": false, ".12_34": false, "05": false,
			"0123": false, "076543210": false, "08.": false, "0x5": false,
			"0b11_01": false, "0o0_1": false, "0x56_78": false, "5e0": false,
			"0.e1": false, ".0e1": false, "5e0_1": false, "5e1_000": false,
			"5e12_34": false, "5e-0": false, "5e-0_1": false, "5e-1_2": false,
			"1_2.3_4e5_6": false, "1n": false, "1_2n": false, "1_000n": false,
			"'5'": false,
		};

		const ecmaVersion = espree.latestEcmaVersion;

		describe("isDecimalInteger", () => {
			Object.keys(expectedResults).forEach(key => {
				it(`should return ${expectedResults[key]} for ${key}`, () => {
					assert.strictEqual(
						astUtils.isDecimalInteger(
							espree.parse(key, { ecmaVersion }).body[0].expression,
						),
						expectedResults[key],
					);
				});
			});
		});

		describe("isDecimalIntegerNumericToken", () => {
			Object.keys(expectedResults).forEach(key => {
				it(`should return ${expectedResults[key]} for ${key}`, () => {
					assert.strictEqual(
						astUtils.isDecimalIntegerNumericToken(
							espree.tokenize(key, { ecmaVersion })[0],
						),
						expectedResults[key],
					);
				});
			});
		});
	}

	// ---------------------------------------------------------------------------
	// getFunctionNameWithKind
	// ---------------------------------------------------------------------------

	describe("getFunctionNameWithKind", () => {
		const expectedResults = {
			"function foo() {}": "function 'foo'",
			"(function foo() {})": "function 'foo'",
			"(function() {})": "function",
			"function* foo() {}": "generator function 'foo'",
			"(function* foo() {})": "generator function 'foo'",
			"(function*() {})": "generator function",
			"() => {}": "arrow function",
			"async () => {}": "async arrow function",
			"({ foo: function foo() {} })": "method 'foo'",
			"({ foo: function() {} })": "method 'foo'",
			"({ '': function() {} })": "method ''",
			"({ ['foo']: function() {} })": "method 'foo'",
			"({ ['']: function() {} })": "method ''",
			"({ [foo]: function() {} })": "method",
			"({ foo() {} })": "method 'foo'",
			"({ foo: function* foo() {} })": "generator method 'foo'",
			"({ foo: function*() {} })": "generator method 'foo'",
			"({ ['foo']: function*() {} })": "generator method 'foo'",
			"({ [foo]: function*() {} })": "generator method",
			"({ *foo() {} })": "generator method 'foo'",
			"({ foo: async function foo() {} })": "async method 'foo'",
			"({ foo: async function() {} })": "async method 'foo'",
			"({ ['foo']: async function() {} })": "async method 'foo'",
			"({ [foo]: async function() {} })": "async method",
			"({ async foo() {} })": "async method 'foo'",
			"({ get foo() {} })": "getter 'foo'",
			"({ set foo(a) {} })": "setter 'foo'",
			"class A { constructor() {} }": "constructor",
			"class A { foo() {} }": "method 'foo'",
			"class A { *foo() {} }": "generator method 'foo'",
			"class A { async foo() {} }": "async method 'foo'",
			"class A { ['foo']() {} }": "method 'foo'",
			"class A { *['foo']() {} }": "generator method 'foo'",
			"class A { async ['foo']() {} }": "async method 'foo'",
			"class A { [foo]() {} }": "method",
			"class A { *[foo]() {} }": "generator method",
			"class A { async [foo]() {} }": "async method",
			"class A { get foo() {} }": "getter 'foo'",
			"class A { set foo(a) {} }": "setter 'foo'",
			"class A { static foo() {} }": "static method 'foo'",
			"class A { static *foo() {} }": "static generator method 'foo'",
			"class A { static async foo() {} }": "static async method 'foo'",
			"class A { static get foo() {} }": "static getter 'foo'",
			"class A { static set foo(a) {} }": "static setter 'foo'",
			"class A { foo = () => {}; }": "method 'foo'",
			"class A { foo = function() {}; }": "method 'foo'",
			"class A { foo = function bar() {}; }": "method 'foo'",
			"class A { static foo = () => {}; }": "static method 'foo'",
			"class A { '#foo' = () => {}; }": "method '#foo'",
			"class A { #foo = () => {}; }": "private method #foo",
			"class A { static #foo = () => {}; }": "static private method #foo",
			"class A { '#foo'() {} }": "method '#foo'",
			"class A { #foo() {} }": "private method #foo",
			"class A { static #foo() {} }": "static private method #foo",
		};

		Object.keys(expectedResults).forEach(key => {
			it(`should return "${expectedResults[key]}" for "${key}".`, () => {
				linter.verify(
					key,
					makeCheckerConfig(
						mustCall(() => ({
							":function": mustCall(node => {
								assert.strictEqual(
									astUtils.getFunctionNameWithKind(node),
									expectedResults[key],
								);
							}),
						})),
					),
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// getFunctionHeadLoc
	// ---------------------------------------------------------------------------

	describe("getFunctionHeadLoc", () => {
		const expectedResults = {
			"function foo() {}": [0, 12],
			"(function foo() {})": [1, 13],
			"(function() {})": [1, 9],
			"function* foo() {}": [0, 13],
			"(function* foo() {})": [1, 14],
			"(function*() {})": [1, 10],
			"() => {}": [3, 5],
			"async () => {}": [9, 11],
			"({ foo: function foo() {} })": [3, 20],
			"({ foo: function() {} })": [3, 16],
			"({ ['foo']: function() {} })": [3, 20],
			"({ [foo]: function() {} })": [3, 18],
			"({ foo() {} })": [3, 6],
			"({ foo: function* foo() {} })": [3, 21],
			"({ foo: function*() {} })": [3, 17],
			"({ ['foo']: function*() {} })": [3, 21],
			"({ [foo]: function*() {} })": [3, 19],
			"({ *foo() {} })": [3, 7],
			"({ foo: async function foo() {} })": [3, 26],
			"({ foo: async function() {} })": [3, 22],
			"({ ['foo']: async function() {} })": [3, 26],
			"({ [foo]: async function() {} })": [3, 24],
			"({ async foo() {} })": [3, 12],
			"({ get foo() {} })": [3, 10],
			"({ set foo(a) {} })": [3, 10],
			"class A { constructor() {} }": [10, 21],
			"class A { foo() {} }": [10, 13],
			"class A { *foo() {} }": [10, 14],
			"class A { async foo() {} }": [10, 19],
			"class A { ['foo']() {} }": [10, 17],
			"class A { *['foo']() {} }": [10, 18],
			"class A { async ['foo']() {} }": [10, 23],
			"class A { [foo]() {} }": [10, 15],
			"class A { *[foo]() {} }": [10, 16],
			"class A { async [foo]() {} }": [10, 21],
			"class A { get foo() {} }": [10, 17],
			"class A { set foo(a) {} }": [10, 17],
			"class A { static foo() {} }": [10, 20],
			"class A { static *foo() {} }": [10, 21],
			"class A { static async foo() {} }": [10, 26],
			"class A { static get foo() {} }": [10, 24],
			"class A { static set foo(a) {} }": [10, 24],
			"class A { foo = function() {}; }": [10, 24],
			"class A { foo = function bar() {}; }": [10, 28],
			"class A { static foo = function() {}; }": [10, 31],
			"class A { foo = () => {}; }": [10, 16],
			"class A { foo = arg => {}; }": [10, 16],
		};

		Object.keys(expectedResults).forEach(key => {
			const [startCol, endCol] = expectedResults[key];
			const expectedLoc = {
				start: { line: 1, column: startCol },
				end: { line: 1, column: endCol },
			};

			it(`should return "${JSON.stringify(expectedLoc)}" for "${key}".`, () => {
				linter.verify(
					key,
					makeCheckerConfig(
						mustCall(() => ({
							":function": mustCall(node => {
								assert.deepStrictEqual(
									astUtils.getFunctionHeadLoc(node, linter.getSourceCode()),
									expectedLoc,
								);
							}),
						})),
					),
					"test.js",
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isEmptyBlock
	// ---------------------------------------------------------------------------

	describe("isEmptyBlock", () => {
		const expectedResults = { "{}": true, "{ a }": false, a: false };

		Object.keys(expectedResults).forEach(key => {
			it(`should return ${expectedResults[key]} for ${key}`, () => {
				const ast = espree.parse(key);
				assert.strictEqual(astUtils.isEmptyBlock(ast.body[0]), expectedResults[key]);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isEmptyFunction
	// ---------------------------------------------------------------------------

	describe("isEmptyFunction", () => {
		const expectedResults = {
			"(function foo() {})": true,
			"(function foo() { a })": false,
			"(a) => {}": true,
			"(a) => { a }": false,
			"(a) => a": false,
		};

		Object.keys(expectedResults).forEach(key => {
			it(`should return ${expectedResults[key]} for ${key}`, () => {
				const ast = espree.parse(key, { ecmaVersion: 6 });
				assert.strictEqual(
					astUtils.isEmptyFunction(ast.body[0].expression),
					expectedResults[key],
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// getNextLocation
	// ---------------------------------------------------------------------------

	describe("getNextLocation", () => {
		const expectedResults = {
			"": [[1, 0], null],
			"\n": [[1, 0], [2, 0], null],
			"\r\n": [[1, 0], [2, 0], null],
			foo: [[1, 0], [1, 1], [1, 2], [1, 3], null],
			"foo\n": [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0], null],
			"foo\r\n": [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0], null],
			"foo;\n": [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 0], null],
			"a\nb": [[1, 0], [1, 1], [2, 0], [2, 1], null],
			"a\nb\n": [[1, 0], [1, 1], [2, 0], [2, 1], [3, 0], null],
			"a\r\nb\r\n": [[1, 0], [1, 1], [2, 0], [2, 1], [3, 0], null],
			"a\nb\r\n": [[1, 0], [1, 1], [2, 0], [2, 1], [3, 0], null],
			"a\n\n": [[1, 0], [1, 1], [2, 0], [3, 0], null],
			"a\r\n\r\n": [[1, 0], [1, 1], [2, 0], [3, 0], null],
			"\n\r\n\n\r\n": [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], null],
			"ab\u2029c": [[1, 0], [1, 1], [1, 2], [2, 0], [2, 1], null],
			"ab\ncde\n": [[1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2], [2, 3], [3, 0], null],
			"a ": [[1, 0], [1, 1], [1, 2], null],
			"a\t": [[1, 0], [1, 1], [1, 2], null],
			"a \n": [[1, 0], [1, 1], [1, 2], [2, 0], null],
		};

		Object.keys(expectedResults).forEach(code => {
			it(`should return expected locations for "${code}".`, () => {
				const ast = espree.parse(code, ESPREE_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				const locations = expectedResults[code];

				for (let i = 0; i < locations.length - 1; i++) {
					const location = { line: locations[i][0], column: locations[i][1] };
					const expectedNextLocation = locations[i + 1]
						? { line: locations[i + 1][0], column: locations[i + 1][1] }
						: null;

					assert.deepStrictEqual(
						astUtils.getNextLocation(sourceCode, location),
						expectedNextLocation,
					);
				}
			});
		});
	});

	// ---------------------------------------------------------------------------
	// getParenthesisedText
	// ---------------------------------------------------------------------------

	describe("getParenthesisedText", () => {
		const expectedResults = {
			"(((foo))); bar;": "(((foo)))",
			"(/* comment */(((foo.bar())))); baz();": "(/* comment */(((foo.bar()))))",
			"(foo, bar)": "(foo, bar)",
		};

		Object.keys(expectedResults).forEach(key => {
			it(`should return ${expectedResults[key]} for ${key}`, () => {
				const ast = espree.parse(key, { tokens: true, comment: true, range: true, loc: true });
				const sourceCode = new SourceCode(key, ast);

				assert.strictEqual(
					astUtils.getParenthesisedText(sourceCode, ast.body[0].expression),
					expectedResults[key],
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// couldBeError
	// ---------------------------------------------------------------------------

	describe("couldBeError", () => {
		const EXPECTED_RESULTS = {
			5: false, null: false, true: false, "'foo'": false, "`foo`": false,
			foo: true, "new Foo": true, "Foo()": true, "foo`bar`": true,
			"foo.bar": true, "(foo = bar)": true, "(foo = 1)": false,
			"(foo += bar)": false, "(foo -= bar)": false, "(foo *= bar)": false,
			"(foo /= bar)": false, "(foo %= bar)": false, "(foo **= bar)": false,
			"(foo <<= bar)": false, "(foo >>= bar)": false, "(foo >>>= bar)": false,
			"(foo &= bar)": false, "(foo |= bar)": false, "(foo ^= bar)": false,
			"(1, 2, 3)": false, "(foo, 2, 3)": false, "(1, 2, foo)": true,
			"1 && 2": false, "1 && foo": true, "foo && 2": false,
			"false && foo": true, "foo &&= 2": false, "foo.bar ??= 2": true,
			"foo[bar] ||= 2": true, "foo ? 1 : 2": false, "foo ? bar : 2": true,
			"foo ? 1 : bar": true, "[1, 2, 3]": false, "({ foo: 1 })": false,
		};

		Object.keys(EXPECTED_RESULTS).forEach(key => {
			it(`returns ${EXPECTED_RESULTS[key]} for ${key}`, () => {
				const ast = espree.parse(key, { ecmaVersion: 2021 });
				assert.strictEqual(
					astUtils.couldBeError(ast.body[0].expression),
					EXPECTED_RESULTS[key],
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isArrowToken
	// ---------------------------------------------------------------------------

	describe("isArrowToken", () => {
		const code = "() => 5";
		const tokens = espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens;
		const expected = [false, false, true, false];

		tokens.forEach((token, index) => {
			it(`should return ${expected[index]} for '${token.value}'.`, () => {
				assert.strictEqual(astUtils.isArrowToken(token), expected[index]);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// Token predicate pairs (closing/opening braces, brackets, parens, etc.)
	// ---------------------------------------------------------------------------

	{
		const code = "if (obj && foo) { obj[foo](); }";
		const tokens = parseTokens(code);

		describeTokenPredicatePair(
			"isClosingBraceToken", "isNotClosingBraceToken", tokens,
			[false, false, false, false, false, false, false, false, false, false, false, false, false, false, true],
		);

		describeTokenPredicatePair(
			"isClosingBracketToken", "isNotClosingBracketToken", tokens,
			[false, false, false, false, false, false, false, false, false, false, true, false, false, false, false],
		);

		describeTokenPredicatePair(
			"isClosingParenToken", "isNotClosingParenToken", tokens,
			[false, false, false, false, false, true, false, false, false, false, false, false, true, false, false],
		);

		describeTokenPredicatePair(
			"isOpeningBraceToken", "isNotOpeningBraceToken", tokens,
			[false, false, false, false, false, false, true, false, false, false, false, false, false, false, false],
		);

		describeTokenPredicatePair(
			"isOpeningBracketToken", "isNotOpeningBracketToken", tokens,
			[false, false, false, false, false, false, false, false, true, false, false, false, false, false, false],
		);

		describeTokenPredicatePair(
			"isOpeningParenToken", "isNotOpeningParenToken", tokens,
			[false, true, false, false, false, false, false, false, false, false, false, true, false, false, false],
		);

		describeTokenPredicatePair(
			"isSemicolonToken", "isNotSemicolonToken", tokens,
			[false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
		);
	}

	{
		const code = "const obj = {foo: 1, bar: 2};";
		const tokens = parseTokens(code);

		describeTokenPredicatePair(
			"isColonToken", "isNotColonToken", tokens,
			[false, false, false, false, false, true, false, false, false, true, false, false, false],
		);

		describeTokenPredicatePair(
			"isCommaToken", "isNotCommaToken", tokens,
			[false, false, false, false, false, false, false, true, false, false, false, false, false],
		);
	}

	{
		const code = "const obj = {foo: 1.5, bar: a.b};";
		const tokens = parseTokens(code);

		describeTokenPredicatePair(
			"isDotToken", "isNotDotToken", tokens,
			[false, false, false, false, false, false, false, false, false, false, false, true, false, false, false],
		);
	}

	// ---------------------------------------------------------------------------
	// isCommentToken
	// ---------------------------------------------------------------------------

	describe("isCommentToken", () => {
		const code = "const obj = /*block*/ {foo: 1, bar: 2}; //line";
		const ast = espree.parse(code, { ecmaVersion: 6, tokens: true, comment: true });

		ast.tokens.forEach(token => {
			it(`should return false for '${token.value}'.`, () => {
				assert.strictEqual(astUtils.isCommentToken(token), false);
			});
		});

		ast.comments.forEach(comment => {
			it(`should return true for '${comment.value}'.`, () => {
				assert.strictEqual(astUtils.isCommentToken(comment), true);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isKeywordToken
	// ---------------------------------------------------------------------------

	describe("isKeywordToken", () => {
		const code = "const obj = {foo: 1, bar: 2};";
		const tokens = parseTokens(code);
		const expected = [true, false, false, false, false, false, false, false, false, false, false, false, false];

		tokens.forEach((token, index) => {
			it(`should return ${expected[index]} for '${token.value}'.`, () => {
				assert.strictEqual(astUtils.isKeywordToken(token), expected[index]);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isNullLiteral
	// ---------------------------------------------------------------------------

	describe("isNullLiteral", () => {
		const EXPECTED_RESULTS = {
			null: true, "/abc/u": false, 5: false, true: false, "'null'": false, foo: false,
		};

		Object.keys(EXPECTED_RESULTS).forEach(key => {
			it(`returns ${EXPECTED_RESULTS[key]} for ${key}`, () => {
				const ast = espree.parse(key, { ecmaVersion: 6 });
				assert.strictEqual(
					astUtils.isNullLiteral(ast.body[0].expression),
					EXPECTED_RESULTS[key],
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// createGlobalLinebreakMatcher
	// ---------------------------------------------------------------------------

	describe("createGlobalLinebreakMatcher", () => {
		it("returns a regular expression with the g flag", () => {
			assert.instanceOf(astUtils.createGlobalLinebreakMatcher(), RegExp);
			assert(astUtils.createGlobalLinebreakMatcher().toString().endsWith("/gu"));
		});

		it("returns unique objects on each call", () => {
			assert.notStrictEqual(
				astUtils.createGlobalLinebreakMatcher(),
				astUtils.createGlobalLinebreakMatcher(),
			);
		});

		describe("correctly matches linebreaks", () => {
			const LINE_COUNTS = {
				foo: 1,
				"foo\rbar": 2,
				"foo\n": 2,
				"foo\nbar": 2,
				"foo\r\nbar": 2,
				"foo\r\u2028bar": 3,
				"foo\u2029bar": 2,
			};

			Object.keys(LINE_COUNTS).forEach(text => {
				it(text, () => {
					assert.strictEqual(
						text.split(astUtils.createGlobalLinebreakMatcher()).length,
						LINE_COUNTS[text],
					);
				});
			});
		});
	});

	// ---------------------------------------------------------------------------
	// canTokensBeAdjacent
	// ---------------------------------------------------------------------------

	describe("canTokensBeAdjacent", () => {
		const CASES = new Map([
			[["foo", "bar"], false],
			[[";foo", "bar"], false],
			[[";", "bar"], true],
			[[")", "bar"], true],
			[["foo0", "bar"], false],
			[["foo;", "bar"], true],
			[["foo", "0"], false],
			[["of", ".2"], true],
			[["2", ".2"], false],
			[["of", "'foo'"], true],
			[["foo", "`bar`"], true],
			[["`foo`", "in"], true],
			[["of", "0.2"], false],
			[["of", "0."], false],
			[[".2", "foo"], false],
			[["2.", "foo"], false],
			[["+", "-"], true],
			[["++", "-"], true],
			[["+", "--"], true],
			[["++", "--"], true],
			[["-", "+"], true],
			[["--", "+"], true],
			[["-", "++"], true],
			[["--", "++"], true],
			[["+", "+"], false],
			[["-", "-"], false],
			[["++", "+"], false],
			[["--", "-"], false],
			[["+", "++"], false],
			[["-", "--"], false],
			[["a/", "b"], true],
			[["a/", "+b"], true],
			[["a+", "/^regex$/"], true],
			[["a/", "/^regex$/"], false],
			[["a+", "/**/"], true],
			[["a+", "/**/b"], true],
			[["//", "a"], false],
			[["a/", "/**/b"], false],
			[["a+", "//"], true],
			[["a+", "//\nb"], true],
			[["a/", "//\nb"], false],
			[["/**/", "b"], true],
			[["a/**/", "b"], true],
			[["/**/a", "b"], false],
			[["a", "/**/b"], true],
			[["a", "b/**/"], false],
			[["a", "//\nb"], true],
			[["a", "b//"], false],
			[["#!/usr/bin/env node", "("], false],
			[["123invalidtoken", "("], false],
			[["(", "123invalidtoken"], false],
			[["(", "1n"], true],
			[["1n", "+"], true],
			[["1n", "in"], false],
			[["return", "#x"], true],
			[["yield", "#x"], true],
			[["get", "#x"], true],
		]);

		CASES.forEach((expectedResult, tokenStrings) => {
			it(tokenStrings.join(", "), () => {
				assert.strictEqual(
					astUtils.canTokensBeAdjacent(tokenStrings[0], tokenStrings[1]),
					expectedResult,
				);
			});
		});

		it("#!/usr/bin/env node, ( (as token objects)", () => {
			assert.strictEqual(
				astUtils.canTokensBeAdjacent(
					{ type: "Shebang", value: "#!/usr/bin/env node" },
					{ type: "Punctuator", value: "(" },
				),
				false,
			);
		});
	});

	// ---------------------------------------------------------------------------
	// equalTokens
	// ---------------------------------------------------------------------------

	describe("equalTokens", () => {
		it("should return true if tokens are equal", () => {
			const code = "a=0;a=0;";
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			assert.strictEqual(astUtils.equalTokens(ast.body[0], ast.body[1], sourceCode), true);
		});

		it("should return false if tokens are not equal", () => {
			const code = "a=0;a=1;";
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			assert.strictEqual(astUtils.equalTokens(ast.body[0], ast.body[1], sourceCode), false);
		});
	});

	// ---------------------------------------------------------------------------
	// equalLiteralValue
	// ---------------------------------------------------------------------------

	describe("equalLiteralValue", () => {
		describe("should return true if two regex values are same, even if it's not supported natively.", () => {
			const patterns = [
				{
					nodeA: { type: "Literal", value: /(?:)/u, regex: { pattern: "(?:)", flags: "u" } }, // eslint-disable-line regexp/no-empty-group
					nodeB: { type: "Literal", value: /(?:)/u, regex: { pattern: "(?:)", flags: "u" } }, // eslint-disable-line regexp/no-empty-group
					expected: true,
				},
				{
					nodeA: { type: "Literal", value: null, regex: { pattern: "(?:)", flags: "u" } },
					nodeB: { type: "Literal", value: null, regex: { pattern: "(?:)", flags: "u" } },
					expected: true,
				},
				{
					nodeA: { type: "Literal", value: null, regex: { pattern: "(?:)", flags: "u" } },
					nodeB: { type: "Literal", value: /(?:)/, regex: { pattern: "(?:)", flags: "" } }, // eslint-disable-line require-unicode-regexp, regexp/no-empty-group
					expected: false,
				},
				{
					nodeA: { type: "Literal", value: null, regex: { pattern: "(?:a)", flags: "u" } },
					nodeB: { type: "Literal", value: null, regex: { pattern: "(?:b)", flags: "u" } },
					expected: false,
				},
			];

			for (const { nodeA, nodeB, expected } of patterns) {
				it(`should return ${expected} if it compared ${util.format("%o", nodeA)} and ${util.format("%o", nodeB)}`, () => {
					assert.strictEqual(astUtils.equalLiteralValue(nodeA, nodeB), expected);
				});
			}
		});

		describe("should return true if two bigint values are same, even if it's not supported natively.", () => {
			const patterns = [
				{
					nodeA: { type: "Literal", value: null, bigint: "1" },
					nodeB: { type: "Literal", value: null, bigint: "1" },
					expected: true,
				},
				{
					nodeA: { type: "Literal", value: null, bigint: "1" },
					nodeB: { type: "Literal", value: null, bigint: "2" },
					expected: false,
				},
				{
					nodeA: { type: "Literal", value: 1n, bigint: "1" },
					nodeB: { type: "Literal", value: 1n, bigint: "1" },
					expected: true,
				},
				{
					nodeA: { type: "Literal", value: 1n, bigint: "1" },
					nodeB: { type: "Literal", value: 2n, bigint: "2" },
					expected: false,
				},
			];

			for (const { nodeA, nodeB, expected } of patterns) {
				it(`should return ${expected} if it compared ${util.format("%o", nodeA)} and ${util.format("%o", nodeB)}`, () => {
					assert.strictEqual(astUtils.equalLiteralValue(nodeA, nodeB), expected);
				});
			}
		});
	});

	// ---------------------------------------------------------------------------
	// hasOctalOrNonOctalDecimalEscapeSequence
	// ---------------------------------------------------------------------------

	describe("hasOctalOrNonOctalDecimalEscapeSequence", () => {
		const expectedResults = {
			"\\1": true, "\\2": true, "\\7": true, "\\00": true, "\\01": true,
			"\\02": true, "\\07": true, "\\08": true, "\\09": true, "\\10": true,
			"\\12": true, " \\1": true, "\\1 ": true, "a\\1": true, "\\1a": true,
			"a\\1a": true, " \\01": true, "\\01 ": true, "a\\01": true, "\\01a": true,
			"a\\01a": true, "a\\08a": true, "\\0\\1": true, "\\0\\01": true,
			"\\0\\08": true, "\\n\\1": true, "\\n\\01": true, "\\n\\08": true,
			"\\\\\\1": true, "\\\\\\01": true, "\\\\\\08": true, "\\8": true,
			"\\9": true, "a\\8a": true, "\\0\\8": true, "\\8\\0": true, "\\80": true,
			"\\81": true, "\\\\\\8": true, "\\\n\\1": true, "foo\\\nbar\\2baz": true,
			"\\\n\\8": true, "foo\\\nbar\\9baz": true,
			"\\0": false, " \\0": false, "\\0 ": false, "a\\0": false, "\\0a": false,
			"\\\\": false, "\\\\0": false, "\\\\01": false, "\\\\08": false,
			"\\\\1": false, "\\\\12": false, "\\\\\\0": false, "\\0\\\\": false,
			0: false, 1: false, 8: false, "01": false, "08": false, 80: false,
			12: false, "\\a": false, "\\n": false, "\\\n": false, "foo\\\nbar": false,
			"128\\\n349": false,
		};

		Object.keys(expectedResults).forEach(key => {
			it(`should return ${expectedResults[key]} for ${key}`, () => {
				const ast = espree.parse(`"${key}"`);
				assert.strictEqual(
					astUtils.hasOctalOrNonOctalDecimalEscapeSequence(
						ast.body[0].expression.raw,
					),
					expectedResults[key],
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isLogicalAssignmentOperator
	// ---------------------------------------------------------------------------

	describe("isLogicalAssignmentOperator", () => {
		const expectedResults = {
			"&&=": true, "||=": true, "??=": true,
			"&&": false, "||": false, "??": false,
			"=": false, "&=": false, "|=": false,
			"+=": false, "**=": false, "==": false, "===": false,
		};

		Object.entries(expectedResults).forEach(([key, value]) => {
			it(`should return ${value} for ${key}`, () => {
				assert.strictEqual(astUtils.isLogicalAssignmentOperator(key), value);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isTopLevelExpressionStatement
	// ---------------------------------------------------------------------------

	describe("isTopLevelExpressionStatement", () => {
		it("should return false for a Program node", () => {
			assert.strictEqual(
				astUtils.isTopLevelExpressionStatement({ type: "Program", parent: null }),
				false,
			);
		});

		it("should return false if the node is not an ExpressionStatement", () => {
			linter.verify(
				'var foo = () => "use strict";',
				makeCheckerConfig(
					mustCall(() => ({
						":expression": mustCall(node => {
							assert.strictEqual(
								astUtils.isTopLevelExpressionStatement(node),
								false,
							);
						}),
					})),
				),
			);
		});

		const expectedResults = [
			['if (foo) { "use strict"; }', '"use strict";', false],
			['{ "use strict"; }', '"use strict";', false],
			['switch (foo) { case bar: "use strict"; }', '"use strict";', false],
			["foo; bar;", "foo;", true],
			["foo; bar;", "bar;", true],
			["function foo() { bar; }", "bar;", true],
			["var foo = function () { foo(); };", "foo();", true],
			["var foo = () => { 'bar'; }", "'bar';", true],
			['"use strict"', '"use strict"', true],
			["(`use strict`)", "(`use strict`)", true],
		];

		expectedResults.forEach(([code, nodeText, expectedRetVal]) => {
			it(`should return ${expectedRetVal} for \`${nodeText}\` in \`${code}\``, () => {
				linter.verify(
					code,
					makeCheckerConfig(
						mustCall(context => {
							const assertForNode = mustCall(node =>
								assert.strictEqual(
									astUtils.isTopLevelExpressionStatement(node),
									expectedRetVal,
								),
							);

							return {
								ExpressionStatement(node) {
									if (context.sourceCode.getText(node) === nodeText) {
										assertForNode(node);
									}
								},
							};
						}),
					),
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isStaticTemplateLiteral
	// ---------------------------------------------------------------------------

	describe("isStaticTemplateLiteral", () => {
		const expectedResults = {
			"``": true,
			"`foo`": true,
			"`foo${bar}`": false,
			'"foo"': false,
			"foo`bar`": false,
		};

		Object.entries(expectedResults).forEach(([code, expectedResult]) => {
			it(`returns ${expectedResult} for ${code}`, () => {
				const ast = espree.parse(code, { ecmaVersion: 6 });
				assert.strictEqual(
					astUtils.isStaticTemplateLiteral(ast.body[0].expression),
					expectedResult,
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isDirective
	// ---------------------------------------------------------------------------

	describe("isDirective", () => {
		const expectedResults = [
			{ code: '"use strict";', expectedRetVal: true },
			{ code: '"use strict"; "use asm";', nodeText: '"use asm";', expectedRetVal: true },
			{ code: 'const a = () => { "foo"; }', nodeText: '"foo";', expectedRetVal: true },
			{ code: '"";', expectedRetVal: true },
			{ code: '{ "foo"; }', nodeText: '"foo";', expectedRetVal: false },
			{ code: "foo();", expectedRetVal: false },
			{ code: '"foo" + "bar";', expectedRetVal: false },
			{ code: "12345;", expectedRetVal: false },
			{ code: "`foo`;", expectedRetVal: false },
			{ code: "('foo');", expectedRetVal: false },
			{ code: 'foo(); "use strict";', nodeText: '"use strict";', expectedRetVal: false },
		];

		expectedResults.forEach(({ code, nodeText = code, expectedRetVal }) => {
			it(`should return ${expectedRetVal} for \`${nodeText}\` in \`${code}\``, () => {
				linter.verify(
					code,
					makeCheckerConfig(
						mustCall(({ sourceCode }) => {
							const assertForNode = mustCall(node =>
								assert.strictEqual(astUtils.isDirective(node), expectedRetVal),
							);

							return {
								ExpressionStatement(node) {
									if (sourceCode.getText(node) === nodeText) {
										assertForNode(node);
										if (!expectedRetVal) {
											node.directive = null;
											assertForNode(node);
										}
									}
								},
							};
						}),
					),
				);
			});
		});
	});
});
```

Key refactoring changes made:

1. **`makeCheckerConfig()`** - Extracted the repeated linter plugin boilerplate into a helper function, eliminating ~6 lines of nesting per test.

2. **`describeTokenPredicatePair()`** - Consolidated the 10+ pairs of `isXToken`/`isNotXToken` describe blocks into a single reusable function, reducing ~30 lines to ~3 per pair.

3. **`parseTokens()`** - Small helper to avoid repeating the espree parse options for token tests.

4. **Token test blocks consolidated** - All token predicate tests for the same code string (`"if (obj && foo) { obj[foo](); }"`) are now grouped in a single block, eliminating repeated `espree.parse` calls.

5. **`makeReferenceChecker()`** - Extracted the repeated `getDeclaredVariables`/`getModifyingReferences` pattern in `checkReference` tests.

6. **`makeTokenOnSameLineChecker()`** - Extracted the repeated `isTokenOnSameLine` checker pattern.

7. **`getComments()`** - Small helper in `isDirectiveComment` to reduce duplication.

8. **Data-driven test tables** - Several `it()` blocks were converted to data-driven loops (e.g., `ECMASCRIPT_GLOBALS`, `isNullOrUndefined`, `isLoop`, `isParenthesised`, `getDirectivePrologue`).
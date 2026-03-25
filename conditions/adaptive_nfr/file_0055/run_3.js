Looking at this test file, I can identify several key complexity issues:

1. **Massive code duplication** in linter-based tests (repeated plugin/rule boilerplate)
2. **Duplicated token test patterns** for paired functions (e.g., `isClosingBraceToken`/`isNotClosingBraceToken`)
3. **Repeated espree.parse patterns** for simple assertion tests
4. **Verbose inline rule creation** that obscures test intent

Here's the refactored version:

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
	{ SourceCode } = require("../../../../lib/source-code");

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
 * Creates a linter plugin rule that calls a visitor function.
 * @param {Function} createVisitor A function that receives context and returns a visitor.
 * @returns {Object} A linter config with the plugin and rule enabled.
 */
function createCheckerConfig(createVisitor) {
	return {
		plugins: {
			test: {
				rules: {
					checker: { create: createVisitor },
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Runs linter with a node-type visitor that calls a callback.
 * @param {string} code The code to verify.
 * @param {string} nodeType The AST node type to visit.
 * @param {Function} callback The callback to invoke on each matching node.
 * @param {Function} mustCall Wrapper to assert the callback is called.
 */
function verifyWithNodeVisitor(code, nodeType, callback, mustCall) {
	linter.verify(
		code,
		createCheckerConfig(
			mustCall(context => ({
				[nodeType]: mustCall(node => callback(node, context)),
			})),
		),
	);
}

/**
 * Creates test cases for a token predicate function and its negation.
 * @param {string} funcName The name of the predicate function on astUtils.
 * @param {Array} tokens The token array to test.
 * @param {boolean[]} expected The expected results for each token.
 * @param {boolean} [negated=false] Whether to test the negated version.
 */
function describeTokenPredicate(funcName, tokens, expected, negated = false) {
	const fn = astUtils[funcName];

	tokens.forEach((token, index) => {
		const expectedValue = negated ? !expected[index] : expected[index];

		it(`should return ${expectedValue} for '${token.value}'.`, () => {
			assert.strictEqual(fn(token), expectedValue);
		});
	});
}

/**
 * Creates paired describe blocks for a token predicate and its "isNot" counterpart.
 * @param {string} positiveName The name of the positive predicate (e.g. "isClosingBraceToken").
 * @param {string} negativeName The name of the negative predicate (e.g. "isNotClosingBraceToken").
 * @param {Array} tokens The token array.
 * @param {boolean[]} expected The expected results for the positive predicate.
 */
function describeTokenPredicatePair(positiveName, negativeName, tokens, expected) {
	describe(positiveName, () => {
		describeTokenPredicate(positiveName, tokens, expected);
	});

	describe(negativeName, () => {
		describeTokenPredicate(negativeName, tokens, expected, true);
	});
}

/**
 * Generates tests from a map of input -> expected output using a simple parse + assert pattern.
 * @param {Object} expectedResults Map of code string to expected result.
 * @param {Function} getActual Function(expression) => actual result.
 * @param {Object} [parseOptions] Options for espree.parse.
 */
function testEachExpression(expectedResults, getActual, parseOptions) {
	Object.keys(expectedResults).forEach(key => {
		it(`should return ${expectedResults[key]} for ${key}`, () => {
			const expression = parseExpression(key, parseOptions);

			assert.strictEqual(getActual(expression), expectedResults[key]);
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
		 * Verifies isTokenOnSameLine for a BlockStatement node.
		 * @param {string} code The code to verify.
		 * @param {boolean} expected The expected result.
		 */
		function verifyTokenOnSameLine(code, expected) {
			verifyWithNodeVisitor(
				code,
				"BlockStatement",
				(node, context) => {
					const tokenBefore = context.sourceCode.getTokenBefore(node);
					const assertFn = expected ? assert.isTrue : assert.isFalse;

					assertFn(astUtils.isTokenOnSameLine(tokenBefore, node));
				},
				mustCall,
			);
		}

		it("should return false if the tokens are not on the same line", () => {
			verifyTokenOnSameLine("if(a)\n{}", false);
		});

		it("should return true if the tokens are on the same line", () => {
			verifyTokenOnSameLine("if(a){}", true);
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
			["/abc/u", false, { ecmaVersion: 6 }],
		];

		cases.forEach(([code, expected, options]) => {
			it(`should return ${expected} for ${code}`, () => {
				assert.strictEqual(
					astUtils.isNullOrUndefined(parseExpression(code, options)),
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
		 * Verifies getModifyingReferences for a given node type.
		 * @param {string} code The code to verify.
		 * @param {string} nodeType The AST node type to visit.
		 * @param {number[]} expectedLengths Expected lengths for each variable's modifying references.
		 */
		function verifyModifyingReferences(code, nodeType, expectedLengths) {
			verifyWithNodeVisitor(
				code,
				nodeType,
				(node, context) => {
					const variables = context.sourceCode.getDeclaredVariables(node);

					expectedLengths.forEach((length, i) => {
						assert.lengthOf(
							astUtils.getModifyingReferences(variables[i].references),
							length,
						);
					});
				},
				mustCall,
			);
		}

		it("should return true if reference is assigned for catch", () => {
			verifyModifyingReferences(
				"try { } catch (e) { e = 10; }",
				"CatchClause",
				[1],
			);
		});

		it("should return true if reference is assigned for const", () => {
			verifyModifyingReferences(
				"const a = 1; a = 2;",
				"VariableDeclaration",
				[1],
			);
		});

		it("should return false if reference is not assigned for const", () => {
			verifyModifyingReferences(
				"const a = 1; c = 2;",
				"VariableDeclaration",
				[0],
			);
		});

		it("should return true if reference is assigned for class", () => {
			verifyModifyingReferences(
				"class A { }\n A = 1;",
				"ClassDeclaration",
				[1, 0],
			);
		});

		it("should return false if reference is not assigned for class", () => {
			verifyModifyingReferences(
				"class A { } foo(A);",
				"ClassDeclaration",
				[0],
			);
		});
	});

	// ---------------------------------------------------------------------------
	// isDirectiveComment
	// ---------------------------------------------------------------------------

	describe("isDirectiveComment", () => {
		/**
		 * Parses code and returns all comments.
		 * @param {string} code The code to parse.
		 * @returns {Array} All comments in the parsed AST.
		 */
		function getComments(code) {
			const ast = espree.parse(code, ESPREE_CONFIG);

			return new SourceCode(code, ast).getAllComments();
		}

		const nonDirectiveLineCases = [
			"// lalala I'm a normal comment",
			"// trying to confuse eslint ",
			"//trying to confuse eslint-directive-detection",
			"//eslint is awesome",
			"//global line comment is not a directive",
			"//globals line comment is not a directive",
			"//exported line comment is not a directive",
		].join("\n");

		const nonDirectiveBlockCases = [
			"/* lalala I'm a normal comment */",
			"/* trying to confuse eslint */",
			"/* trying to confuse eslint-directive-detection */",
			"/*eSlInT is awesome*/",
		].join("\n");

		const directiveLineCases = [
			"// eslint-disable-line no-undef",
			"// eslint-secret-directive 4 8 15 16 23 42   ",
			"// eslint-directive-without-argument",
			"//eslint-directive-without-padding",
		].join("\n");

		const directiveBlockCases = [
			"/* eslint-disable no-undef */",
			"/*eslint-enable no-undef*/",
			'/* eslint-env {"es6": true} */',
			"/* eslint foo */",
			"/*eslint bar*/",
			"/*global foo*/",
			"/*globals foo*/",
			"/*exported foo*/",
		].join("\n");

		it("should return false if it is not a directive line comment", () => {
			getComments(nonDirectiveLineCases).forEach(node => {
				assert.isFalse(astUtils.isDirectiveComment(node));
			});
		});

		it("should return false if it is not a directive block comment", () => {
			getComments(nonDirectiveBlockCases).forEach(node => {
				assert.isFalse(astUtils.isDirectiveComment(node));
			});
		});

		it("should return true if it is a directive line comment", () => {
			getComments(directiveLineCases).forEach(node => {
				assert.isTrue(astUtils.isDirectiveComment(node));
			});
		});

		it("should return true if it is a directive block comment", () => {
			getComments(directiveBlockCases).forEach(node => {
				assert.isTrue(astUtils.isDirectiveComment(node));
			});
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
			assert(astUtils.isFunction(espree.parse("function a() {}").body[0]));
		});

		it("should return true for FunctionExpression", () => {
			assert(astUtils.isFunction(parseExpression("(function a() {})")));
		});

		it("should return true for ArrowFunctionExpression", () => {
			assert(astUtils.isFunction(parseExpression("(() => {})", { ecmaVersion: 6 })));
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

		loopCases.forEach(([nodeType, code, options]) => {
			it(`should return true for ${nodeType}`, () => {
				assert(astUtils.isLoop(espree.parse(code, options).body[0]));
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
		 * @param {string} code The code to check.
		 * @param {string} nodeType The type of the node to consider.
		 * @param {boolean} expectedInLoop The expected result.
		 * @returns {void}
		 */
		function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
			const results = [];

			linter.verify(
				code,
				createCheckerConfig(
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
			// string literals
			"''": "",
			"'foo'": "foo",
			// boolean literals
			false: "false",
			true: "true",
			// null literal
			null: "null",
			// number literals
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
			// regexp literals
			"/a/": "/a/",
			"/a/i": "/a/i",
			"/[0-9]/": "/[0-9]/",
			"/(?<zero>0)/": "/(?<zero>0)/",
			"/(?<zero>0)/s": "/(?<zero>0)/s",
			"/(?<=a)b/s": "/(?<=a)b/s",
			// simple template literals
			"``": "",
			"`foo`": "foo",
			// unsupported
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
			const node = {
				type: "Literal",
				value: null,
				regex: { pattern: "(?:)", flags: "u" },
			};

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
		/**
		 * Parses code and returns the first property node from an object expression.
		 * @param {string} code The code to parse.
		 * @param {Object} [options] Espree options.
		 * @returns {ASTNode} The first property node.
		 */
		function parseProperty(code, options) {
			return espree.parse(code, options).body[0].expression.properties[0];
		}

		const memberExpressionCases = [
			["a.b", "b"],
			["a['b']", "b"],
			["a[`b`]", "b", { ecmaVersion: 6 }],
			["a[100]", "100"],
			["a[b]", null],
			["a['a' + 'b']", null],
			["a[tag`b`]", null, { ecmaVersion: 6 }],
			["a[`${b}`]", null, { ecmaVersion: 6 }],
		];

		memberExpressionCases.forEach(([code, expected, options]) => {
			it(`should return ${JSON.stringify(expected)} for \`${code}\``, () => {
				assert.strictEqual(
					astUtils.getStaticPropertyName(parseExpression(code, options)),
					expected,
				);
			});
		});

		const propertyCases = [
			["({b: 1})", "b"],
			["({b() {}})", "b", { ecmaVersion: 6 }],
			["({get b() {}})", "b", { ecmaVersion: 6 }],
			["({['b']: 1})", "b", { ecmaVersion: 6 }],
			["({['b']() {}})", "b", { ecmaVersion: 6 }],
			["({[`b`]: 1})", "b", { ecmaVersion: 6 }],
			["({[100]: 1})", "100", { ecmaVersion: 6 }],
			["({[/(?<zero>0)/]: 1})", "/(?<zero>0)/", { ecmaVersion: 2018 }],
			["({[b]: 1})", null, { ecmaVersion: 6 }],
			["({['a' + 'b']: 1})", null, { ecmaVersion: 6 }],
			["({[tag`b`]: 1})", null, { ecmaVersion: 6 }],
			["({[`${b}`]: 1})", null, { ecmaVersion: 6 }],
		];

		propertyCases.forEach(([code, expected, options]) => {
			it(`should return ${JSON.stringify(expected)} for property in \`${code}\``, () => {
				assert.strictEqual(
					astUtils.getStaticPropertyName(parseProperty(code, options)),
					expected,
				);
			});
		});

		it("should return null for non member expressions", () => {
			const ast = espree.parse("foo()");

			[ast.body[0].expression, ast.body[0], ast.body, ast, null].forEach(node => {
				assert.strictEqual(astUtils.getStaticPropertyName(node), null);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// getDirectivePrologue
	// ---------------------------------------------------------------------------

	describe("getDirectivePrologue", () => {
		const emptyPrologueCases = [
			["not a Program/Function node", "if (a) { b(); }", ast => ast.body[0]],
			["braceless ArrowFunctionExpression", "var foo = () => 'use strict';", ast => ast.body[0].declarations[0].init, { ecmaVersion: 6 }],
			["Program with no directives", "var foo;", ast => ast],
			["FunctionDeclaration with no directives", "function foo() { return bar; }", ast => ast.body[0]],
			["FunctionExpression with no directives", "var foo = function() { return bar; }", ast => ast.body[0].declarations[0].init],
			["ArrowFunctionExpression with no directives", "var foo = () => { return bar; };", ast => ast.body[0].declarations[0].init, { ecmaVersion: 6 }],
		];

		emptyPrologueCases.forEach(([description, code, getNode, options]) => {
			it(`should return empty array if node is ${description}`, () => {
				const ast = espree.parse(code, options);

				assert.deepStrictEqual(astUtils.getDirectivePrologue(getNode(ast)), []);
			});
		});

		const directiveCases = [
			["Program", "'use strict'; 'use asm'; var foo;", ast => ast],
			["FunctionDeclaration", "function foo() { 'use strict'; 'use asm'; return bar; }", ast => ast.body[0]],
			["FunctionExpression", "var foo = function() { 'use strict'; 'use asm'; return bar; }", ast => ast.body[0].declarations[0].init],
			["ArrowFunctionExpression", "var foo = () => { 'use strict'; 'use asm'; return bar; };", ast => ast.body[0].declarations[0].init, { ecmaVersion: 6 }],
		];

		directiveCases.forEach(([nodeType, code, getNode, options]) => {
			it(`should return directives in ${nodeType} body`, () => {
				const ast = espree.parse(code, options);
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
					createCheckerConfig(
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
					createCheckerConfig(
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
				assert.strictEqual(
					astUtils.isEmptyBlock(espree.parse(key).body[0]),
					expectedResults[key],
				);
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

		testEachExpression(
			expectedResults,
			node => astUtils.isEmptyFunction(node),
			{ ecmaVersion: 6 },
		);
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
					const next = locations[i + 1];
					const expectedNext = next
						? { line: next[0], column: next[1] }
						: null;

					assert.deepStrictEqual(
						astUtils.getNextLocation(sourceCode, location),
						expectedNext,
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
				const ast = espree.parse(key, {
					tokens: true,
					comment: true,
					range: true,
					loc: true,
				});
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
				assert.strictEqual(
					astUtils.couldBeError(
						espree.parse(key, { ecmaVersion: 2021 }).body[0].expression,
					),
					EXPECTED_RESULTS[key],
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// Token predicate functions
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

	{
		const code = "if (obj && foo) { obj[foo](); }";
		const tokens = espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens;

		describeTokenPredicatePair(
			"isClosingBraceToken",
			"isNotClosingBraceToken",
			tokens,
			[false, false, false, false, false, false, false, false, false, false, false, false, false, false, true],
		);

		describeTokenPredicatePair(
			"isClosingBracketToken",
			"isNotClosingBracketToken",
			tokens,
			[false, false, false, false, false, false, false, false, false, false, true, false, false, false, false],
		);

		describeTokenPredicatePair(
			"isClosingParenToken",
			"isNotClosingParenToken",
			tokens,
			[false, false, false, false, false, true, false, false, false, false, false, false, true, false, false],
		);

		describeTokenPredicatePair(
			"isOpeningBraceToken",
			"isNotOpeningBraceToken",
			tokens,
			[false, false, false, false, false, false, true, false, false, false, false, false, false, false, false],
		);

		describeTokenPredicatePair(
			"isOpeningBracketToken",
			"isNotOpeningBracketToken",
			tokens,
			[false, false, false, false, false, false, false, false, true, false, false, false, false, false, false],
		);

		describeTokenPredicatePair(
			"isOpeningParenToken",
			"isNotOpeningParenToken",
			tokens,
			[false, true, false, false, false, false, false, false, false, false, false, true, false, false, false],
		);

		describeTokenPredicatePair(
			"isSemicolonToken",
			"isNotSemicolonToken",
			tokens,
			[false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
		);
	}

	{
		const code = "const obj = {foo: 1, bar: 2};";
		const tokens = espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens;

		describeTokenPredicatePair(
			"isColonToken",
			"isNotColonToken",
			tokens,
			[false, false, false, false, false, true, false, false, false, true, false, false, false],
		);

		describeTokenPredicatePair(
			"isCommaToken",
			"isNotCommaToken",
			tokens,
			[false, false, false, false, false, false, false, true, false, false, false, false, false],
		);
	}

	{
		const code = "const obj = {foo: 1.5, bar: a.b};";
		const tokens = espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens;

		describeTokenPredicatePair(
			"isDotToken",
			"isNotDotToken",
			tokens,
			[false, false, false, false, false, false, false, false, false, false, false, true, false, false, false],
		);
	}

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

	describe("isKeywordToken", () => {
		const code = "const obj = {foo: 1, bar: 2};";
		const tokens = espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens;
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
			null: true,
			"/abc/u": false,
			5: false,
			true: false,
			"'null'": false,
			foo: false,
		};

		testEachExpression(
			EXPECTED_RESULTS,
			node => astUtils.isNullLiteral(node),
			{ ecmaVersion: 6 },
		);
	});

	// ---------------------------------------------------------------------------
	// createGlobalLinebreakMatcher
	// ---------------------------------------------------------------------------

	describe("createGlobalLinebreakMatcher", () => {
		it("returns a regular expression with the g flag", () => {
			const matcher = astUtils.createGlobalLinebreakMatcher();

			assert.instanceOf(matcher, RegExp);
			assert(matcher.toString().endsWith("/gu"));
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
		/**
		 * Verifies equalTokens for two statements in the given code.
		 * @param {string} code The code to parse.
		 * @param {boolean} expected The expected result.
		 */
		function verifyEqualTokens(code, expected) {
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			assert.strictEqual(
				astUtils.equalTokens(ast.body[0], ast.body[1], sourceCode),
				expected,
			);
		}

		it("should return true if tokens are equal", () => {
			verifyEqualTokens("a=0;a=0;", true);
		});

		it("should return false if tokens are not equal", () => {
			verifyEqualTokens("a=0;a=1;", false);
		});
	});

	// ---------------------------------------------------------------------------
	// equalLiteralValue
	// ---------------------------------------------------------------------------

	describe("equalLiteralValue", () => {
		/**
		 * Generates equalLiteralValue test cases from a pattern array.
		 * @param {Array} patterns Array of {nodeA, nodeB, expected} objects.
		 */
		function runEqualLiteralValueCases(patterns) {
			for (const { nodeA, nodeB, expected } of patterns) {
				it(`should return ${expected} if it compared ${util.format("%o", nodeA)} and ${util.format("%o", nodeB)}`, () => {
					assert.strictEqual(astUtils.equalLiteralValue(nodeA, nodeB), expected);
				});
			}
		}

		describe("should return true if two regex values are same, even if it's not supported natively.", () => {
			runEqualLiteralValueCases([
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
			]);
		});

		describe("should return true if two bigint values are same, even if it's not supported natively.", () => {
			runEqualLiteralValueCases([
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
			]);
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
			"a\\1a": true, " \\01": true, "\\01 ": true, "a\\01": true,
			"\\01a": true, "a\\01a": true, "a\\08a": true, "\\0\\1": true,
			"\\0\\01": true, "\\0\\08": true, "\\n\\1": true, "\\n\\01": true,
			"\\n\\08": true, "\\\\\\1": true, "\\\\\\01": true, "\\\\\\08": true,
			"\\8": true, "\\9": true, "a\\8a": true, "\\0\\8": true,
			"\\8\\0": true, "\\80": true, "\\81": true, "\\\\\\8": true,
			"\\\n\\1": true, "foo\\\nbar\\2baz": true, "\\\n\\8": true,
			"foo\\\nbar\\9baz": true,
			"\\0": false, " \\0": false, "\\0 ": false, "a\\0": false,
			"\\0a": false, "\\\\": false, "\\\\0": false, "\\\\01": false,
			"\\\\08": false, "\\\\1": false, "\\\\12": false, "\\\\\\0": false,
			"\\0\\\\": false, 0: false, 1: false, 8: false, "01": false,
			"08": false, 80: false, 12: false, "\\a": false, "\\n": false,
			"\\\n": false, "foo\\\nbar": false, "128\\\n349": false,
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
				createCheckerConfig(
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
					createCheckerConfig(
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

		testEachExpression(
			expectedResults,
			node => astUtils.isStaticTemplateLiteral(node),
			{ ecmaVersion: 6 },
		);
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
					createCheckerConfig(
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

## Key Refactoring Decisions

### 1. Extracted Helper Functions (outside `describe`)
- **`parseExpression(code, options)`** — eliminates repeated `espree.parse(code).body[0].expression` chains
- **`createCheckerConfig(createVisitor)`** — eliminates the deeply nested plugin/rule boilerplate (was repeated ~30 times)
- **`verifyWithNodeVisitor(code, nodeType, callback, mustCall)`** — consolidates the linter verification pattern
- **`describeTokenPredicate(funcName, tokens, expected, negated)`** — handles token predicate test generation
- **`describeTokenPredicatePair(pos, neg, tokens, expected)`** — eliminates the paired positive/negative token test duplication (was repeated 8 times with identical structure)
- **`testEachExpression(expectedResults, getActual, parseOptions)`** — consolidates the parse-then-assert pattern

### 2. Consolidated Token Tests
All paired token predicates (`isClosingBraceToken`/`isNotClosingBraceToken`, etc.) that shared the same token array now share a single parsed token array instead of re-parsing the same code multiple times.

### 3. Data-Driven Test Patterns
- `isNullOrUndefined`, `isLoop`, `getDirectivePrologue`, `isParenthesised` converted to table-driven tests
- `ECMASCRIPT_GLOBALS` tests consolidated into a loop
- `checkReference` tests use a shared `verifyModifyingReferences` helper

### 4. Reduced Nesting Depth
The linter plugin boilerplate went from ~6 levels of nesting to 2-3 levels via `createCheckerConfig`.
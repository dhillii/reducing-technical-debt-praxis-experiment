Looking at this code, I can identify several patterns that can be refactored to reduce complexity and repetition:

1. **Token test suites** - Many `describe` blocks for token predicates share identical structure
2. **Linter-based tests** - Repeated plugin/rule boilerplate for linter verification tests
3. **Simple expression tests** - Repeated `espree.parse` + `assert` patterns
4. **`mustCall` wrapper** - Can be simplified with helper functions

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
 * Creates a linter plugin config that calls a checker function on a given node type.
 * @param {string} nodeType The AST node type selector.
 * @param {Function} checker The function to call on matching nodes.
 * @returns {Object} A linter config object.
 */
function createLinterConfig(nodeType, checker) {
	return {
		plugins: {
			test: {
				rules: {
					checker: {
						create: context => ({
							[nodeType]: node => checker(node, context),
						}),
					},
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Creates a linter plugin config with mustCall tracking.
 * @param {Function} mustCall The mustCall wrapper function.
 * @param {string} nodeType The AST node type selector.
 * @param {Function} checker The function to call on matching nodes.
 * @returns {Object} A linter config object.
 */
function createTrackedLinterConfig(mustCall, nodeType, checker) {
	return {
		plugins: {
			test: {
				rules: {
					checker: {
						create: mustCall(() => ({
							[nodeType]: mustCall(checker),
						})),
					},
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Creates token predicate test suites for a pair of is/isNot functions.
 * @param {string} fnName The name of the positive predicate (e.g. "isClosingBraceToken").
 * @param {Array} tokens The token array to test.
 * @param {boolean[]} expected The expected results for each token.
 */
function describeTokenPredicate(fnName, tokens, expected) {
	const notFnName = fnName.replace(/^is/, "isNot");

	describe(fnName, () => {
		tokens.forEach((token, index) => {
			it(`should return ${expected[index]} for '${token.value}'.`, () => {
				assert.strictEqual(astUtils[fnName](token), expected[index]);
			});
		});
	});

	if (astUtils[notFnName]) {
		describe(notFnName, () => {
			tokens.forEach((token, index) => {
				it(`should return ${!expected[index]} for '${token.value}'.`, () => {
					assert.strictEqual(
						astUtils[notFnName](token),
						!expected[index],
					);
				});
			});
		});
	}
}

/**
 * Parses tokens from code.
 * @param {string} code The code to tokenize.
 * @returns {Array} The token array.
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
		 * Verifies isTokenOnSameLine for a given code snippet.
		 * @param {string} code The code to verify.
		 * @param {boolean} expected The expected result.
		 */
		function verifyTokenOnSameLine(code, expected) {
			linter.verify(
				code,
				createTrackedLinterConfig(mustCall, "BlockStatement", node => {
					const assertFn = expected
						? assert.isTrue
						: assert.isFalse;
					assertFn(
						astUtils.isTokenOnSameLine(
							linter.getSourceCode().getTokenBefore(node),
							node,
						),
					);
				}),
			);
		}

		it("should return false if the tokens are not on the same line", () => {
			linter.verify("if(a)\n{}", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									BlockStatement: mustCall(node => {
										assert.isFalse(
											astUtils.isTokenOnSameLine(
												context.sourceCode.getTokenBefore(
													node,
												),
												node,
											),
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

		it("should return true if the tokens are on the same line", () => {
			linter.verify("if(a){}", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									BlockStatement: mustCall(node => {
										assert.isTrue(
											astUtils.isTokenOnSameLine(
												context.sourceCode.getTokenBefore(
													node,
												),
												node,
											),
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

	// ---------------------------------------------------------------------------
	// isNullOrUndefined
	// ---------------------------------------------------------------------------

	describe("isNullOrUndefined", () => {
		const expectedResults = {
			null: true,
			undefined: true,
			1: false,
			"'test'": false,
			true: false,
			"({})": false,
		};

		Object.entries(expectedResults).forEach(([code, expected]) => {
			it(`should return ${expected} for ${code}`, () => {
				assert.strictEqual(
					astUtils.isNullOrUndefined(parseExpression(code)),
					expected,
				);
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

	// ---------------------------------------------------------------------------
	// checkReference
	// ---------------------------------------------------------------------------

	describe("checkReference", () => {
		/**
		 * Creates a linter config that checks modifying references on a node type.
		 * @param {string} nodeType The AST node type.
		 * @param {Function} assertFn The assertion function receiving variables.
		 * @returns {Object} Linter config.
		 */
		function createReferenceCheckerConfig(nodeType, assertFn) {
			return {
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
										assertFn(variables);
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			};
		}

		it("should return true if reference is assigned for catch", () => {
			linter.verify(
				"try { } catch (e) { e = 10; }",
				createReferenceCheckerConfig("CatchClause", variables => {
					assert.lengthOf(
						astUtils.getModifyingReferences(
							variables[0].references,
						),
						1,
					);
				}),
			);
		});

		it("should return true if reference is assigned for const", () => {
			linter.verify(
				"const a = 1; a = 2;",
				createReferenceCheckerConfig(
					"VariableDeclaration",
					variables => {
						assert.lengthOf(
							astUtils.getModifyingReferences(
								variables[0].references,
							),
							1,
						);
					},
				),
			);
		});

		it("should return false if reference is not assigned for const", () => {
			linter.verify(
				"const a = 1; c = 2;",
				createReferenceCheckerConfig(
					"VariableDeclaration",
					variables => {
						assert.lengthOf(
							astUtils.getModifyingReferences(
								variables[0].references,
							),
							0,
						);
					},
				),
			);
		});

		it("should return true if reference is assigned for class", () => {
			linter.verify(
				"class A { }\n A = 1;",
				createReferenceCheckerConfig("ClassDeclaration", variables => {
					assert.lengthOf(
						astUtils.getModifyingReferences(
							variables[0].references,
						),
						1,
					);
					assert.lengthOf(
						astUtils.getModifyingReferences(
							variables[1].references,
						),
						0,
					);
				}),
			);
		});

		it("should return false if reference is not assigned for class", () => {
			linter.verify(
				"class A { } foo(A);",
				createReferenceCheckerConfig("ClassDeclaration", variables => {
					assert.lengthOf(
						astUtils.getModifyingReferences(
							variables[0].references,
						),
						0,
					);
				}),
			);
		});
	});

	// ---------------------------------------------------------------------------
	// isDirectiveComment
	// ---------------------------------------------------------------------------

	describe("isDirectiveComment", () => {
		/**
		 * Parses comments from code and asserts each with the given assertion.
		 * @param {string} code The code to parse.
		 * @param {Function} assertFn The assertion function.
		 */
		function assertComments(code, assertFn) {
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			sourceCode.getAllComments().forEach(assertFn);
		}

		it("should return false if it is not a directive line comment", () => {
			assertComments(
				[
					"// lalala I'm a normal comment",
					"// trying to confuse eslint ",
					"//trying to confuse eslint-directive-detection",
					"//eslint is awesome",
					"//global line comment is not a directive",
					"//globals line comment is not a directive",
					"//exported line comment is not a directive",
				].join("\n"),
				node => assert.isFalse(astUtils.isDirectiveComment(node)),
			);
		});

		it("should return false if it is not a directive block comment", () => {
			assertComments(
				[
					"/* lalala I'm a normal comment */",
					"/* trying to confuse eslint */",
					"/* trying to confuse eslint-directive-detection */",
					"/*eSlInT is awesome*/",
				].join("\n"),
				node => assert.isFalse(astUtils.isDirectiveComment(node)),
			);
		});

		it("should return true if it is a directive line comment", () => {
			assertComments(
				[
					"// eslint-disable-line no-undef",
					"// eslint-secret-directive 4 8 15 16 23 42   ",
					"// eslint-directive-without-argument",
					"//eslint-directive-without-padding",
				].join("\n"),
				node => assert.isTrue(astUtils.isDirectiveComment(node)),
			);
		});

		it("should return true if it is a directive block comment", () => {
			assertComments(
				[
					"/* eslint-disable no-undef */",
					"/*eslint-enable no-undef*/",
					'/* eslint-env {"es6": true} */',
					"/* eslint foo */",
					"/*eslint bar*/",
					"/*global foo*/",
					"/*globals foo*/",
					"/*exported foo*/",
				].join("\n"),
				node => assert.isTrue(astUtils.isDirectiveComment(node)),
			);
		});
	});

	// ---------------------------------------------------------------------------
	// isParenthesised
	// ---------------------------------------------------------------------------

	describe("isParenthesised", () => {
		const cases = [
			{ code: "condition ? 1 : 2", expected: false },
			{ code: "(condition ? 1 : 2)", expected: true },
		];

		cases.forEach(({ code, expected }) => {
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

	// ---------------------------------------------------------------------------
	// isFunction
	// ---------------------------------------------------------------------------

	describe("isFunction", () => {
		const trueCases = [
			["FunctionDeclaration", "function a() {}", ast => ast.body[0]],
			[
				"FunctionExpression",
				"(function a() {})",
				ast => ast.body[0].expression,
			],
			[
				"ArrowFunctionExpression",
				"(() => {})",
				ast => ast.body[0].expression,
				{ ecmaVersion: 6 },
			],
		];

		trueCases.forEach(([label, code, getNode, opts]) => {
			it(`should return true for ${label}`, () => {
				const ast = espree.parse(code, opts);

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

	// ---------------------------------------------------------------------------
	// isLoop
	// ---------------------------------------------------------------------------

	describe("isLoop", () => {
		const loopCases = [
			["DoWhileStatement", "do {} while (a)"],
			["ForInStatement", "for (var k in obj) {}"],
			[
				"ForOfStatement",
				"for (var x of list) {}",
				{ ecmaVersion: 6 },
			],
			["ForStatement", "for (var i = 0; i < 10; ++i) {}"],
			["WhileStatement", "while (a) {}"],
		];

		loopCases.forEach(([label, code, opts]) => {
			it(`should return true for ${label}`, () => {
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
		 * @param {string} code The code to check.
		 * @param {string} nodeType The type of the node to consider.
		 * @param {boolean} expectedInLoop The expected result.
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

		const cases = [
			["a loop itself", "while (a) {}", "WhileStatement", true],
			["a loop condition", "while (a) {}", "Identifier", true],
			[
				"a loop assignee",
				"for (var a in b) {}",
				"VariableDeclaration",
				true,
			],
			[
				"a node within a loop body",
				"for (var a of b) { console.log('Hello'); }",
				"Literal",
				true,
			],
			[
				"a node outside a loop body",
				"while (true) {} a(b);",
				"CallExpression",
				false,
			],
			[
				"when the loop is not in the current function",
				"while (true) { funcs.push(() => { var a; }); }",
				"VariableDeclaration",
				false,
			],
		];

		cases.forEach(([label, code, nodeType, expected]) => {
			it(`should return ${expected} for ${label}`, () => {
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

		Object.entries(expectedResults).forEach(([key, expected]) => {
			it(`should return ${expected} for ${key}`, () => {
				const ast = espree.parse(key, { ecmaVersion: 2018 });

				assert.strictEqual(
					astUtils.getStaticStringValue(ast.body[0].expression),
					expected,
				);
			});
		});

		it("should return text of regex literal even if it's not supported natively.", () => {
			const node = {
				type: "Literal",
				value: null,
				regex: { pattern: "(?:)", flags: "u" },
			};

			assert.strictEqual(
				astUtils.getStaticStringValue(node),
				"/(?:)/u",
			);
		});

		it("should return text of bigint literal even if it's not supported natively.", () => {
			const node = {
				type: "Literal",
				value: null,
				bigint: "100n",
			};

			assert.strictEqual(
				astUtils.getStaticStringValue(node),
				"100n",
			);
		});
	});

	// ---------------------------------------------------------------------------
	// getStaticPropertyName
	// ---------------------------------------------------------------------------

	describe("getStaticPropertyName", () => {
		/**
		 * Parses and returns the first expression node.
		 * @param {string} code Code to parse.
		 * @param {Object} [opts] Espree options.
		 * @returns {ASTNode} First expression.
		 */
		function expr(code, opts) {
			return espree.parse(code, opts).body[0].expression;
		}

		/**
		 * Parses and returns the first property of an object expression.
		 * @param {string} code Code to parse.
		 * @param {Object} [opts] Espree options.
		 * @returns {ASTNode} First property.
		 */
		function prop(code, opts) {
			return espree.parse(code, opts).body[0].expression.properties[0];
		}

		const memberCases = [
			["'b' for `a.b`", "a.b", null, "b"],
			["'b' for `a['b']`", "a['b']", null, "b"],
			["'b' for `a[`b`]`", "a[`b`]", { ecmaVersion: 6 }, "b"],
			["'100' for `a[100]`", "a[100]", null, "100"],
			["null for `a[b]`", "a[b]", null, null],
			["null for `a['a' + 'b']`", "a['a' + 'b']", null, null],
			["null for `a[tag`b`]`", "a[tag`b`]", { ecmaVersion: 6 }, null],
			[
				"null for `a[`${b}`]`",
				"a[`${b}`]",
				{ ecmaVersion: 6 },
				null,
			],
		];

		memberCases.forEach(([label, code, opts, expected]) => {
			it(`should return ${expected} for ${label}`, () => {
				assert.strictEqual(
					astUtils.getStaticPropertyName(expr(code, opts)),
					expected,
				);
			});
		});

		const propertyCases = [
			["'b' for `b: 1`", "({b: 1})", null, "b"],
			["'b' for `b() {}`", "({b() {}})", { ecmaVersion: 6 }, "b"],
			[
				"'b' for `get b() {}`",
				"({get b() {}})",
				{ ecmaVersion: 6 },
				"b",
			],
			[
				"'b' for `['b']: 1`",
				"({['b']: 1})",
				{ ecmaVersion: 6 },
				"b",
			],
			[
				"'b' for `['b']() {}`",
				"({['b']() {}})",
				{ ecmaVersion: 6 },
				"b",
			],
			[
				"'b' for `[`b`]: 1`",
				"({[`b`]: 1})",
				{ ecmaVersion: 6 },
				"b",
			],
			[
				"'100' for `[100]: 1`",
				"({[100]: 1})",
				{ ecmaVersion: 6 },
				"100",
			],
			[
				"'/(?<zero>0)/' for `[/(?<zero>0)/]: 1`",
				"({[/(?<zero>0)/]: 1})",
				{ ecmaVersion: 2018 },
				"/(?<zero>0)/",
			],
			["null for `[b]: 1`", "({[b]: 1})", { ecmaVersion: 6 }, null],
			[
				"null for `['a' + 'b']: 1`",
				"({['a' + 'b']: 1})",
				{ ecmaVersion: 6 },
				null,
			],
			[
				"null for `[tag`b`]: 1`",
				"({[tag`b`]: 1})",
				{ ecmaVersion: 6 },
				null,
			],
			[
				"null for `[`${b}`]: 1`",
				"({[`${b}`]: 1})",
				{ ecmaVersion: 6 },
				null,
			],
		];

		propertyCases.forEach(([label, code, opts, expected]) => {
			it(`should return ${expected} for ${label}`, () => {
				assert.strictEqual(
					astUtils.getStaticPropertyName(prop(code, opts)),
					expected,
				);
			});
		});

		it("should return null for non member expressions", () => {
			const ast = espree.parse("foo()");

			assert.strictEqual(
				astUtils.getStaticPropertyName(ast.body[0].expression),
				null,
			);
			assert.strictEqual(
				astUtils.getStaticPropertyName(ast.body[0]),
				null,
			);
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
			[
				"not a Program, FunctionDeclaration, FunctionExpression, or ArrowFunctionExpression",
				() => espree.parse("if (a) { b(); }").body[0],
			],
			[
				"a braceless ArrowFunctionExpression node",
				() =>
					espree.parse("var foo = () => 'use strict';", {
						ecmaVersion: 6,
					}).body[0].declarations[0].init,
			],
			[
				"no directives in Program body",
				() => espree.parse("var foo;"),
			],
			[
				"no directives in FunctionDeclaration body",
				() => espree.parse("function foo() { return bar; }").body[0],
			],
			[
				"no directives in FunctionExpression body",
				() =>
					espree.parse("var foo = function() { return bar; }").body[0]
						.declarations[0].init,
			],
			[
				"no directives in ArrowFunctionExpression body",
				() =>
					espree.parse("var foo = () => { return bar; };", {
						ecmaVersion: 6,
					}).body[0].declarations[0].init,
			],
		];

		emptyCases.forEach(([label, getNode]) => {
			it(`should return empty array if node is ${label}`, () => {
				assert.deepStrictEqual(
					astUtils.getDirectivePrologue(getNode()),
					[],
				);
			});
		});

		const directiveCases = [
			[
				"Program body",
				() => espree.parse("'use strict'; 'use asm'; var foo;"),
			],
			[
				"FunctionDeclaration body",
				() =>
					espree.parse(
						"function foo() { 'use strict'; 'use asm'; return bar; }",
					).body[0],
			],
			[
				"FunctionExpression body",
				() =>
					espree.parse(
						"var foo = function() { 'use strict'; 'use asm'; return bar; }",
					).body[0].declarations[0].init,
			],
			[
				"ArrowFunctionExpression body",
				() =>
					espree.parse(
						"var foo = () => { 'use strict'; 'use asm'; return bar; };",
						{ ecmaVersion: 6 },
					).body[0].declarations[0].init,
			],
		];

		directiveCases.forEach(([label, getNode]) => {
			it(`should return directives in ${label}`, () => {
				const result = astUtils.getDirectivePrologue(getNode());

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
			0: true,
			5: true,
			8: true,
			9: true,
			50: true,
			123: true,
			"1_0": true,
			"1_0_1": true,
			"12_3": true,
			"5_000": true,
			"500_0": true,
			"500_00": true,
			"5_000_00": true,
			"1_234_56": true,
			"1_2_3_4": true,
			"11_22_33_44": true,
			"1_23_4_56_7_89": true,
			"08": true,
			"09": true,
			"008": true,
			"0192": true,
			"0180": true,
			"090": true,
			"088": true,
			"099": true,
			"089": true,
			"0098": true,
			"01892": true,
			"08192": true,
			"01829": true,
			"018290": true,
			"0.": false,
			"5.": false,
			".0": false,
			".5": false,
			"5.0": false,
			"5.00_00": false,
			"5.0_1": false,
			"0.1_0": false,
			"5.1_2": false,
			"1.23_45": false,
			".0_1": false,
			".12_34": false,
			"05": false,
			"0123": false,
			"076543210": false,
			"08.": false,
			"0x5": false,
			"0b11_01": false,
			"0o0_1": false,
			"0x56_78": false,
			"5e0": false,
			"0.e1": false,
			".0e1": false,
			"5e0_1": false,
			"5e1_000": false,
			"5e12_34": false,
			"5e-0": false,
			"5e-0_1": false,
			"5e-1_2": false,
			"1_2.3_4e5_6": false,
			"1n": false,
			"1_2n": false,
			"1_000n": false,
			"'5'": false,
		};

		const ecmaVersion = espree.latestEcmaVersion;

		describe("isDecimalInteger", () => {
			Object.entries(expectedResults).forEach(([key, expected]) => {
				it(`should return ${expected} for ${key}`, () => {
					assert.strictEqual(
						astUtils.isDecimalInteger(
							espree.parse(key, { ecmaVersion }).body[0]
								.expression,
						),
						expected,
					);
				});
			});
		});

		describe("isDecimalIntegerNumericToken", () => {
			Object.entries(expectedResults).forEach(([key, expected]) => {
				it(`should return ${expected} for ${key}`, () => {
					assert.strictEqual(
						astUtils.isDecimalIntegerNumericToken(
							espree.tokenize(key, { ecmaVersion })[0],
						),
						expected,
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

		Object.entries(expectedResults).forEach(([key, expected]) => {
			it(`should return "${expected}" for "${key}".`, () => {
				linter.verify(key, {
					plugins: {
						test: {
							rules: {
								checker: {
									create: mustCall(() => ({
										":function": mustCall(node => {
											assert.strictEqual(
												astUtils.getFunctionNameWithKind(
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

		Object.entries(expectedResults).forEach(([key, [startCol, endCol]]) => {
			const expectedLoc = {
				start: { line: 1, column: startCol },
				end: { line: 1, column: endCol },
			};

			it(`should return "${JSON.stringify(expectedLoc)}" for "${key}".`, () => {
				linter.verify(
					key,
					{
						plugins: {
							test: {
								rules: {
									checker: {
										create: mustCall(() => ({
											":function": mustCall(node => {
												assert.deepStrictEqual(
													astUtils.getFunctionHeadLoc(
														node,
														linter.getSourceCode(),
													),
													expectedLoc,
												);
											}),
										})),
									},
								},
							},
						},
						rules: { "test/checker": "error" },
					},
					"test.js",
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isEmptyBlock
	// ---------------------------------------------------------------------------

	describe("isEmptyBlock", () => {
		const expectedResults = {
			"{}": true,
			"{ a }": false,
			a: false,
		};

		Object.entries(expectedResults).forEach(([key, expected]) => {
			it(`should return ${expected} for ${key}`, () => {
				const ast = espree.parse(key);

				assert.strictEqual(
					astUtils.isEmptyBlock(ast.body[0]),
					expected,
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

		Object.entries(expectedResults).forEach(([key, expected]) => {
			it(`should return ${expected} for ${key}`, () => {
				const ast = espree.parse(key, { ecmaVersion: 6 });

				assert.strictEqual(
					astUtils.isEmptyFunction(ast.body[0].expression),
					expected,
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
			"foo;\n": [
				[1, 0],
				[1, 1],
				[1, 2],
				[1, 3],
				[1, 4],
				[2, 0],
				null,
			],
			"a\nb": [[1, 0], [1, 1], [2, 0], [2, 1], null],
			"a\nb\n": [[1, 0], [1, 1], [2, 0], [2, 1], [3, 0], null],
			"a\r\nb\r\n": [[1, 0], [1, 1], [2, 0], [2, 1], [3, 0], null],
			"a\nb\r\n": [[1, 0], [1, 1], [2, 0], [2, 1], [3, 0], null],
			"a\n\n": [[1, 0], [1, 1], [2, 0], [3, 0], null],
			"a\r\n\r\n": [[1, 0], [1, 1], [2, 0], [3, 0], null],
			"\n\r\n\n\r\n": [
				[1, 0],
				[2, 0],
				[3, 0],
				[4, 0],
				[5, 0],
				null,
			],
			"ab\u2029c": [[1, 0], [1, 1], [1, 2], [2, 0], [2, 1], null],
			"ab\ncde\n": [
				[1, 0],
				[1, 1],
				[1, 2],
				[2, 0],
				[2, 1],
				[2, 2],
				[2, 3],
				[3, 0],
				null,
			],
			"a ": [[1, 0], [1, 1], [1, 2], null],
			"a\t": [[1, 0], [1, 1], [1, 2], null],
			"a \n": [[1, 0], [1, 1], [1, 2], [2, 0], null],
		};

		Object.entries(expectedResults).forEach(([code, locations]) => {
			it(`should return expected locations for "${code}".`, () => {
				const ast = espree.parse(code, ESPREE_CONFIG);
				const sourceCode = new SourceCode(code, ast);

				for (let i = 0; i < locations.length - 1; i++) {
					const location = {
						line: locations[i][0],
						column: locations[i][1],
					};
					const expectedNextLocation = locations[i + 1]
						? {
								line: locations[i + 1][0],
								column: locations[i + 1][1],
							}
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
			"(/* comment */(((foo.bar())))); baz();":
				"(/* comment */(((foo.bar()))))",
			"(foo, bar)": "(foo, bar)",
		};

		Object.entries(expectedResults).forEach(([key, expected]) => {
			it(`should return ${expected} for ${key}`, () => {
				const ast = espree.parse(key, {
					tokens: true,
					comment: true,
					range: true,
					loc: true,
				});
				const sourceCode = new SourceCode(key, ast);

				assert.strictEqual(
					astUtils.getParenthesisedText(
						sourceCode,
						ast.body[0].expression,
					),
					expected,
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// couldBeError
	// ---------------------------------------------------------------------------

	describe("couldBeError", () => {
		const EXPECTED_RESULTS = {
			5: false,
			null: false,
			true: false,
			"'foo'": false,
			"`foo`": false,
			foo: true,
			"new Foo": true,
			"Foo()": true,
			"foo`bar`": true,
			"foo.bar": true,
			"(foo = bar)": true,
			"(foo = 1)": false,
			"(foo += bar)": false,
			"(foo -= bar)": false,
			"(foo *= bar)": false,
			"(foo /= bar)": false,
			"(foo %= bar)": false,
			"(foo **= bar)": false,
			"(foo <<= bar)": false,
			"(foo >>= bar)": false,
			"(foo >>>= bar)": false,
			"(foo &= bar)": false,
			"(foo |= bar)": false,
			"(foo ^= bar)": false,
			"(1, 2, 3)": false,
			"(foo, 2, 3)": false,
			"(1, 2, foo)": true,
			"1 && 2": false,
			"1 && foo": true,
			"foo && 2": false,
			"false && foo": true,
			"foo &&= 2": false,
			"foo.bar ??= 2": true,
			"foo[bar] ||= 2": true,
			"foo ? 1 : 2": false,
			"foo ? bar : 2": true,
			"foo ? 1 : bar": true,
			"[1, 2, 3]": false,
			"({ foo: 1 })": false,
		};

		Object.entries(EXPECTED_RESULTS).forEach(([key, expected]) => {
			it(`returns ${expected} for ${key}`, () => {
				const ast = espree.parse(key, { ecmaVersion: 2021 });

				assert.strictEqual(
					astUtils.couldBeError(ast.body[0].expression),
					expected,
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// Token predicate tests
	// ---------------------------------------------------------------------------

	describe("isArrowToken", () => {
		const code = "() => 5";
		const tokens = espree.parse(code, {
			ecmaVersion: 6,
			tokens: true,
		}).tokens;
		const expected = [false, false, true, false];

		tokens.forEach((token, index) => {
			it(`should return ${expected[index]} for '${token.value}'.`, () => {
				assert.strictEqual(
					astUtils.isArrowToken(token),
					expected[index],
				);
			});
		});
	});

	{
		const code = "if (obj && foo) { obj[foo](); }";
		const tokens = parseTokens(code);

		describeTokenPredicate("isClosingBraceToken", tokens, [
			false, false, false, false, false, false, false, false,
			false, false, false, false, false, false, true,
		]);

		describeTokenPredicate("isClosingBracketToken", tokens, [
			false, false, false, false, false, false, false, false,
			false, false, true, false, false, false, false,
		]);

		describeTokenPredicate("isClosingParenToken", tokens, [
			false, false, false, false, false, true, false, false,
			false, false, false, false, true, false, false,
		]);

		describeTokenPredicate("isOpeningBraceToken", tokens, [
			false, false, false, false, false, false, true, false,
			false, false, false, false, false, false, false,
		]);

		describeTokenPredicate("isOpeningBracketToken", tokens, [
			false, false, false, false, false, false, false, false,
			true, false, false, false, false, false, false,
		]);

		describeTokenPredicate("isOpeningParenToken", tokens, [
			false, true, false, false, false, false, false, false,
			false, false, false, true, false, false, false,
		]);

		describeTokenPredicate("isSemicolonToken", tokens, [
			false, false, false, false, false, false, false, false,
			false, false, false, false, false, true, false,
		]);
	}

	{
		const code = "const obj = {foo: 1, bar: 2};";
		const tokens = parseTokens(code);

		describeTokenPredicate("isColonToken", tokens, [
			false, false, false, false, false, true, false, false,
			false, true, false, false, false,
		]);

		describeTokenPredicate("isCommaToken", tokens, [
			false, false, false, false, false, false, false, true,
			false, false, false, false, false,
		]);
	}

	{
		const code = "const obj = {foo: 1.5, bar: a.b};";
		const tokens = parseTokens(code);

		describeTokenPredicate("isDotToken", tokens, [
			false, false, false, false, false, false, false, false,
			false, false, false, true, false, false, false,
		]);
	}

	describe("isCommentToken", () => {
		const code = "const obj = /*block*/ {foo: 1, bar: 2}; //line";
		const ast = espree.parse(code, {
			ecmaVersion: 6,
			tokens: true,
			comment: true,
		});

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
		const tokens = parseTokens(code);
		const expected = [
			true, false, false, false, false, false, false, false,
			false, false, false, false, false,
		];

		tokens.forEach((token, index) => {
			it(`should return ${expected[index]} for '${token.value}'.`, () => {
				assert.strictEqual(
					astUtils.isKeywordToken(token),
					expected[index],
				);
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

		Object.entries(EXPECTED_RESULTS).forEach(([key, expected]) => {
			it(`returns ${expected} for ${key}`, () => {
				const ast = espree.parse(key, { ecmaVersion: 6 });

				assert.strictEqual(
					astUtils.isNullLiteral(ast.body[0].expression),
					expected,
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
			assert(
				astUtils
					.createGlobalLinebreakMatcher()
					.toString()
					.endsWith("/gu"),
			);
		});

		it("returns unique objects on each call", () => {
			const firstObject = astUtils.createGlobalLinebreakMatcher();
			const secondObject = astUtils.createGlobalLinebreakMatcher();

			assert.notStrictEqual(firstObject, secondObject);
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

			Object.entries(LINE_COUNTS).forEach(([text, count]) => {
				it(text, () => {
					assert.strictEqual(
						text.split(astUtils.createGlobalLinebreakMatcher())
							.length,
						count,
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
					astUtils.canTokensBeAdjacent(
						tokenStrings[0],
						tokenStrings[1],
					),
					expectedResult,
				);
			});
		});

		it("#!/usr/bin/env node, (", () => {
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
		 * Verifies equalTokens for a given code.
		 * @param {string} code The code to test.
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
		 * Runs equalLiteralValue test patterns.
		 * @param {string} label The describe label.
		 * @param {Array} patterns The test patterns.
		 */
		function runLiteralValuePatterns(label, patterns) {
			describe(label, () => {
				for (const { nodeA, nodeB, expected } of patterns) {
					it(`should return ${expected} if it compared ${util.format("%o", nodeA)} and ${util.format("%o", nodeB)}`, () => {
						assert.strictEqual(
							astUtils.equalLiteralValue(nodeA, nodeB),
							expected,
						);
					});
				}
			});
		}

		runLiteralValuePatterns(
			"should return true if two regex values are same, even if it's not supported natively.",
			[
				{
					nodeA: {
						type: "Literal",
						value: /(?:)/u, // eslint-disable-line regexp/no-empty-group
						regex: { pattern: "(?:)", flags: "u" },
					},
					nodeB: {
						type: "Literal",
						value: /(?:)/u, // eslint-disable-line regexp/no-empty-group
						regex: { pattern: "(?:)", flags: "u" },
					},
					expected: true,
				},
				{
					nodeA: {
						type: "Literal",
						value: null,
						regex: { pattern: "(?:)", flags: "u" },
					},
					nodeB: {
						type: "Literal",
						value: null,
						regex: { pattern: "(?:)", flags: "u" },
					},
					expected: true,
				},
				{
					nodeA: {
						type: "Literal",
						value: null,
						regex: { pattern: "(?:)", flags: "u" },
					},
					nodeB: {
						type: "Literal",
						value: /(?:)/, // eslint-disable-line require-unicode-regexp, regexp/no-empty-group
						regex: { pattern: "(?:)", flags: "" },
					},
					expected: false,
				},
				{
					nodeA: {
						type: "Literal",
						value: null,
						regex: { pattern: "(?:a)", flags: "u" },
					},
					nodeB: {
						type: "Literal",
						value: null,
						regex: { pattern: "(?:b)", flags: "u" },
					},
					expected: false,
				},
			],
		);

		runLiteralValuePatterns(
			"should return true if two bigint values are same, even if it's not supported natively.",
			[
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
			],
		);
	});

	// ---------------------------------------------------------------------------
	// hasOctalOrNonOctalDecimalEscapeSequence
	// ---------------------------------------------------------------------------

	describe("hasOctalOrNonOctalDecimalEscapeSequence", () => {
		const expectedResults = {
			"\\1": true,
			"\\2": true,
			"\\7": true,
			"\\00": true,
			"\\01": true,
			"\\02": true,
			"\\07": true,
			"\\08": true,
			"\\09": true,
			"\\10": true,
			"\\12": true,
			" \\1": true,
			"\\1 ": true,
			"a\\1": true,
			"\\1a": true,
			"a\\1a": true,
			" \\01": true,
			"\\01 ": true,
			"a\\01": true,
			"\\01a": true,
			"a\\01a": true,
			"a\\08a": true,
			"\\0\\1": true,
			"\\0\\01": true,
			"\\0\\08": true,
			"\\n\\1": true,
			"\\n\\01": true,
			"\\n\\08": true,
			"\\\\\\1": true,
			"\\\\\\01": true,
			"\\\\\\08": true,
			"\\8": true,
			"\\9": true,
			"a\\8a": true,
			"\\0\\8": true,
			"\\8\\0": true,
			"\\80": true,
			"\\81": true,
			"\\\\\\8": true,
			"\\\n\\1": true,
			"foo\\\nbar\\2baz": true,
			"\\\n\\8": true,
			"foo\\\nbar\\9baz": true,
			"\\0": false,
			" \\0": false,
			"\\0 ": false,
			"a\\0": false,
			"\\0a": false,
			"\\\\": false,
			"\\\\0": false,
			"\\\\01": false,
			"\\\\08": false,
			"\\\\1": false,
			"\\\\12": false,
			"\\\\\\0": false,
			"\\0\\\\": false,
			0: false,
			1: false,
			8: false,
			"01": false,
			"08": false,
			80: false,
			12: false,
			"\\a": false,
			"\\n": false,
			"\\\n": false,
			"foo\\\nbar": false,
			"128\\\n349": false,
		};

		Object.entries(expectedResults).forEach(([key, expected]) => {
			it(`should return ${expected} for ${key}`, () => {
				const ast = espree.parse(`"${key}"`);

				assert.strictEqual(
					astUtils.hasOctalOrNonOctalDecimalEscapeSequence(
						ast.body[0].expression.raw,
					),
					expected,
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isLogicalAssignmentOperator
	// ---------------------------------------------------------------------------

	describe("isLogicalAssignmentOperator", () => {
		const expectedResults = {
			"&&=": true,
			"||=": true,
			"??=": true,
			"&&": false,
			"||": false,
			"??": false,
			"=": false,
			"&=": false,
			"|=": false,
			"+=": false,
			"**=": false,
			"==": false,
			"===": false,
		};

		Object.entries(expectedResults).forEach(([key, expected]) => {
			it(`should return ${expected} for ${key}`, () => {
				assert.strictEqual(
					astUtils.isLogicalAssignmentOperator(key),
					expected,
				);
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isTopLevelExpressionStatement
	// ---------------------------------------------------------------------------

	describe("isTopLevelExpressionStatement", () => {
		it("should return false for a Program node", () => {
			const node = { type: "Program", parent: null };

			assert.strictEqual(
				astUtils.isTopLevelExpressionStatement(node),
				false,
			);
		});

		it("should return false if the node is not an ExpressionStatement", () => {
			linter.verify('var foo = () => "use strict";', {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(() => ({
									":expression": mustCall(node => {
										assert.strictEqual(
											astUtils.isTopLevelExpressionStatement(
												node,
											),
											false,
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

		const expectedResults = [
			['if (foo) { "use strict"; }', '"use strict";', false],
			['{ "use strict"; }', '"use strict";', false],
			[
				'switch (foo) { case bar: "use strict"; }',
				'"use strict";',
				false,
			],
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
				linter.verify(code, {
					plugins: {
						test: {
							rules: {
								checker: {
									create: mustCall(context => {
										const assertForNode = mustCall(node =>
											assert.strictEqual(
												astUtils.isTopLevelExpressionStatement(
													node,
												),
												expectedRetVal,
											),
										);

										return {
											ExpressionStatement(node) {
												if (
													context.sourceCode.getText(
														node,
													) === nodeText
												) {
													assertForNode(node);
												}
											},
										};
									}),
								},
							},
						},
					},
					rules: { "test/checker": "error" },
				});
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

		Object.entries(expectedResults).forEach(([code, expected]) => {
			it(`returns ${expected} for ${code}`, () => {
				const ast = espree.parse(code, { ecmaVersion: 6 });

				assert.strictEqual(
					astUtils.isStaticTemplateLiteral(ast.body[0].expression),
					expected,
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
			{
				code: '"use strict"; "use asm";',
				nodeText: '"use asm";',
				expectedRetVal: true,
			},
			{
				code: 'const a = () => { "foo"; }',
				nodeText: '"foo";',
				expectedRetVal: true,
			},
			{ code: '"";', expectedRetVal: true },
			{ code: '{ "foo"; }', nodeText: '"foo";', expectedRetVal: false },
			{ code: "foo();", expectedRetVal: false },
			{ code: '"foo" + "bar";', expectedRetVal: false },
			{ code: "12345;", expectedRetVal: false },
			{ code: "`foo`;", expectedRetVal: false },
			{ code: "('foo');", expectedRetVal: false },
			{
				code: 'foo(); "use strict";',
				nodeText: '"use strict";',
				expectedRetVal: false,
			},
		];

		expectedResults.forEach(({ code, nodeText = code, expectedRetVal }) => {
			it(`should return ${expectedRetVal} for \`${nodeText}\` in \`${code}\``, () => {
				linter.verify(code, {
					plugins: {
						test: {
							rules: {
								checker: {
									create: mustCall(({ sourceCode }) => {
										const assertForNode = mustCall(node =>
											assert.strictEqual(
												astUtils.isDirective(node),
												expectedRetVal,
											),
										);

										return {
											ExpressionStatement(node) {
												if (
													sourceCode.getText(node) ===
													nodeText
												) {
													assertForNode(node);

													if (!expectedRetVal) {
														node.directive = null;
														assertForNode(node);
													}
												}
											},
										};
									}),
								},
							},
						},
					},
					rules: { "test/checker": "error" },
				});
			});
		});
	});
});
```

Key refactoring changes made:

1. **`describeTokenPredicate` helper** — Eliminates the 10+ repeated `describe` blocks for token predicates (`isClosingBraceToken`/`isNotClosingBraceToken`, etc.), consolidating them into a single reusable function that handles both positive and negative variants.

2. **`parseTokens` helper** — Extracts the repeated `espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens` pattern.

3. **`parseExpression` helper** — Extracts the repeated `espree.parse(code, opts).body[0].expression` pattern.

4. **`createReferenceCheckerConfig` helper** — Reduces the deeply nested plugin config boilerplate in `checkReference` tests.

5. **`runLiteralValuePatterns` helper** — Consolidates the two `equalLiteralValue` describe blocks.

6. **`assertComments` helper** — Extracts the parse-and-iterate pattern in `isDirectiveComment`.

7. **Data-driven test tables** — Converted many individual `it` blocks into `forEach` loops over arrays (e.g., `isLoop`, `isFunction`, `isInLoop`, `getDirectivePrologue`, `isParenthesised`, `ECMASCRIPT_GLOBALS`).

8. **`Object.entries` over `Object.keys`** — Used throughout to avoid redundant `expectedResults[key]` lookups.

9. **Grouped token tests** — Consolidated the three separate `{ const code = "if (obj && foo)..." }` blocks into one, since they share the same code and tokens.
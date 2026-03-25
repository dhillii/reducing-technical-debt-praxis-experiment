Here's the refactored code with reduced complexity through several strategies:

1. **Extracted helper functions** for repeated patterns
2. **Consolidated test factories** for parameterized tests
3. **Reduced duplication** in `isSpaceBetween` and `finalize` tests
4. **Extracted shared setup** into reusable utilities

```javascript
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

function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Parse code and create a SourceCode instance.
 */
function makeSourceCode(code, parseOptions = DEFAULT_CONFIG) {
	const ast = espree.parse(code, parseOptions);
	return new SourceCode(code, ast);
}

/**
 * Create a minimal valid AST stub.
 */
function makeAst(overrides = {}) {
	return { comments: [], tokens: [], loc: {}, range: [], ...overrides };
}

/**
 * Create a scope manager for the given code.
 */
function makeScopeManager(code, options = {}) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	return {
		ast,
		scopeManager: eslintScope.analyze(ast, {
			ignoreEval: true,
			ecmaVersion: 6,
			...options,
		}),
	};
}

/**
 * Build a linter plugin rule that calls a spy on a given selector.
 */
function makeCheckerRule(selector, spyFn) {
	return {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							return { [selector]: spyFn(context) };
						},
					},
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Assert that a spy was called exactly once.
 */
function assertCalledOnce(spy) {
	assert(spy && spy.calledOnce, "Spy was not called.");
}

/**
 * Run isSpaceBetween tests for both forward and reverse token order.
 */
function testSpaceBetweenBothDirections(cases, getFirst, getSecond) {
	cases.forEach(([code, expected]) => {
		describe("when the first given is located before the second", () => {
			it(code, () => {
				const sourceCode = makeSourceCode(code);
				assert.strictEqual(
					sourceCode.isSpaceBetween(getFirst(sourceCode), getSecond(sourceCode)),
					expected,
				);
			});
		});

		describe("when the first given is located after the second", () => {
			it(code, () => {
				const sourceCode = makeSourceCode(code);
				assert.strictEqual(
					sourceCode.isSpaceBetween(getSecond(sourceCode), getFirst(sourceCode)),
					expected,
				);
			});
		});
	});
}

/**
 * Assert standard global variable attributes.
 */
function assertGlobalVariableAttributes(variable, esGlobals) {
	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));
	assert.strictEqual(variable.eslintExplicitGlobal, false);
	assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
	assert.strictEqual(
		variable.eslintImplicitGlobalSetting,
		esGlobals[variable.name] ? "writable" : "readonly",
	);
	assert.strictEqual(variable.writeable, esGlobals[variable.name]);
}

/**
 * Assert standard scope state (no implicit globals, no unresolved references).
 */
function assertCleanScope(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
}

/**
 * Assert resolved references match expected global names.
 */
function assertResolvedReferences(globalScope, names) {
	assert.strictEqual(globalScope.references.length, names.length);
	names.forEach((name, i) => {
		assert.strictEqual(
			globalScope.references[i].resolved,
			globalScope.set.get(name),
		);
	});
}

/**
 * Build a SourceCode with scope manager from code string.
 */
function buildSourceCode(code, scopeOptions = {}) {
	const { ast, scopeManager } = makeScopeManager(code, scopeOptions);
	return new SourceCode({ text: code, ast, scopeManager });
}

/**
 * Get scope on the node matching astSelector.
 */
function getScope(code, astSelector, ecmaVersion = 5) {
	let node, scope;

	linter.verify(code, {
		languageOptions: { ecmaVersion, sourceType: "script" },
		plugins: {
			test: {
				rules: {
					"get-scope": {
						create: context => ({
							[astSelector](node0) {
								node = node0;
								scope = context.sourceCode.getScope(node);
							},
						}),
					},
				},
			},
		},
		rules: { "test/get-scope": 2 },
	});

	return { node, scope };
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	describe("new SourceCode()", () => {
		it("should create a new instance when called with valid data", () => {
			const ast = makeAst();
			const sourceCode = new SourceCode("foo;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.text, "foo;");
			assert.strictEqual(sourceCode.ast, ast);
		});

		it("should create a new instance when called with valid optional data", () => {
			const parserServices = {};
			const scopeManager = {};
			const visitorKeys = {};
			const ast = makeAst();
			const sourceCode = new SourceCode({
				text: "foo;",
				ast,
				parserServices,
				scopeManager,
				visitorKeys,
			});

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.text, "foo;");
			assert.strictEqual(sourceCode.ast, ast);
			assert.strictEqual(sourceCode.parserServices, parserServices);
			assert.strictEqual(sourceCode.scopeManager, scopeManager);
			assert.strictEqual(sourceCode.visitorKeys, visitorKeys);
		});

		it("should split text into lines when called with valid data", () => {
			const ast = makeAst();
			const sourceCode = new SourceCode("foo;\nbar;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.lines.length, 2);
			assert.strictEqual(sourceCode.lines[0], "foo;");
			assert.strictEqual(sourceCode.lines[1], "bar;");
		});

		[
			[false, /Unexpected empty AST\. \(false\)/u],
			[null, /Unexpected empty AST\. \(null\)/u],
			[void 0, /Unexpected empty AST\. \(undefined\)/u],
		].forEach(([ast, pattern]) => {
			it(`should throw an error when called with a ${ast} AST`, () => {
				assert.throws(() => new SourceCode("foo;", ast), pattern);
			});
		});

		[
			[{ comments: [], loc: {}, range: [] }, /missing the tokens array/u],
			[{ tokens: [], loc: {}, range: [] }, /missing the comments array/u],
			[{ comments: [], tokens: [], range: [] }, /missing location information/u],
			[{ comments: [], tokens: [], loc: {} }, /missing range information/u],
		].forEach(([ast, pattern]) => {
			it(`should throw when AST is missing required field (${pattern})`, () => {
				assert.throws(() => new SourceCode("foo;", ast), pattern);
			});
		});

		it("should store all tokens and comments sorted by range", () => {
			const comments = [{ range: [0, 2] }, { range: [10, 12] }];
			const tokens = [
				{ range: [3, 8] },
				{ range: [8, 10] },
				{ range: [12, 20] },
			];
			const sourceCode = new SourceCode("", { comments, tokens, loc: {}, range: [] });

			assert.deepStrictEqual(sourceCode.tokensAndComments, [
				comments[0],
				tokens[0],
				tokens[1],
				comments[1],
				tokens[2],
			]);
		});

		describe("BOM handling", () => {
			[
				["\uFEFFconsole.log('hello');", true, "console.log('hello');"],
				["console.log('hello');", false, "console.log('hello');"],
			].forEach(([text, hasBOM, expectedText]) => {
				describe(`if a text ${hasBOM ? "has" : "doesn't have"} BOM,`, () => {
					let sourceCode;

					beforeEach(() => {
						sourceCode = new SourceCode(text, makeAst());
					});

					it(`should have ${hasBOM} at \`hasBOM\` property.`, () => {
						assert.strictEqual(sourceCode.hasBOM, hasBOM);
					});

					it("should not have BOM in `text` property.", () => {
						assert.strictEqual(sourceCode.text, expectedText);
					});
				});
			});
		});

		describe("when a text has a shebang", () => {
			let sourceCode;

			beforeEach(() => {
				const ast = {
					comments: [{ type: "Line", value: "/usr/bin/env node", range: [0, 19] }],
					tokens: [],
					loc: {},
					range: [],
				};
				sourceCode = new SourceCode(SHEBANG_TEST_CODE, ast);
			});

			it('should change the type of the first comment to "Shebang"', () => {
				assert.strictEqual(sourceCode.getAllComments()[0].type, "Shebang");
			});
		});

		describe("when a text does not have a shebang", () => {
			it("should not change the type of the first comment", () => {
				const ast = {
					comments: [{ type: "Line", value: "comment", range: [0, 9] }],
					tokens: [],
					loc: {},
					range: [],
				};
				const sourceCode = new SourceCode("//comment\nconsole.log('hello');", ast);

				assert.strictEqual(sourceCode.getAllComments()[0].type, "Line");
			});
		});

		describe("when it read a UTF-8 file (has BOM), SourceCode", () => {
			const UTF8_FILE = path.resolve(__dirname, "../../../../fixtures/utf8-bom.js");
			const text = fs.readFileSync(UTF8_FILE, "utf8").replace(/\r\n/gu, "\n");
			let sourceCode;

			beforeEach(() => {
				sourceCode = new SourceCode(text, makeAst());
			});

			it("to be clear, check the file has UTF-8 BOM.", () => {
				const buffer = fs.readFileSync(UTF8_FILE);
				assert.strictEqual(buffer[0], 0xef);
				assert.strictEqual(buffer[1], 0xbb);
				assert.strictEqual(buffer[2], 0xbf);
			});

			it("should have true at `hasBOM` property.", () => {
				assert.strictEqual(sourceCode.hasBOM, true);
			});

			it("should not have BOM in `text` property.", () => {
				assert.strictEqual(
					sourceCode.text,
					'"use strict";\n\nconsole.log("This file has [0xEF, 0xBB, 0xBF] as BOM.");\n',
				);
			});
		});
	});

	describe("getLines()", () => {
		[
			["\\n", "a;\nb;"],
			["\\r\\n", "a;\r\nb;"],
			["\\r", "a;\rb;"],
			["\\u2028", "a;\u2028b;"],
			["\\u2029", "a;\u2029b;"],
		].forEach(([breakName, code]) => {
			it(`should get proper lines when using ${breakName} as a line break`, () => {
				const sourceCode = makeSourceCode(code);
				const lines = sourceCode.getLines();

				assert.strictEqual(lines[0], "a;");
				assert.strictEqual(lines[1], "b;");
			});
		});
	});

	describe("getText()", () => {
		let sourceCode, ast;

		describe("when text begins with a shebang", () => {
			it("should retrieve unaltered shebang text", () => {
				ast = espree.parse(
					SHEBANG_TEST_CODE.replace(
						astUtils.shebangPattern,
						(match, captured) => `//${captured}`,
					),
					DEFAULT_CONFIG,
				);
				sourceCode = new SourceCode(SHEBANG_TEST_CODE, ast);

				const shebangToken = sourceCode.getAllComments()[0];
				const shebangText = sourceCode.getText(shebangToken);

				assert.strictEqual(shebangToken.type, "Shebang");
				assert.strictEqual(shebangText, "#!/usr/bin/env node");
			});
		});

		beforeEach(() => {
			ast = espree.parse(TEST_CODE, DEFAULT_CONFIG);
			sourceCode = new SourceCode(TEST_CODE, ast);
		});

		it("should retrieve all text when used without parameters", () => {
			assert.strictEqual(sourceCode.getText(), TEST_CODE);
		});

		it("should retrieve all text for root node", () => {
			assert.strictEqual(sourceCode.getText(ast), TEST_CODE);
		});

		it("should clamp to valid range when retrieving characters before start of source", () => {
			assert.strictEqual(sourceCode.getText(ast, 2, 0), TEST_CODE);
		});

		it("should retrieve all text for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			assert.strictEqual(sourceCode.getText(node), "6 * 7");
		});

		it("should retrieve all text plus two characters before for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			assert.strictEqual(sourceCode.getText(node, 2), "= 6 * 7");
		});

		it("should retrieve all text plus one character after for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			assert.strictEqual(sourceCode.getText(node, 0, 1), "6 * 7;");
		});

		it("should retrieve all text plus two characters before and one character after for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			assert.strictEqual(sourceCode.getText(node, 2, 1), "= 6 * 7;");
		});
	});

	describe("getNodeByRangeIndex()", () => {
		let sourceCode;

		beforeEach(() => {
			sourceCode = makeSourceCode(TEST_CODE);
		});

		[
			[4, "Identifier", null],
			[6, "Identifier", null],
			[13, "Literal", 6],
			[9, "Identifier", null],
		].forEach(([index, type, value]) => {
			it(`should retrieve a node at index ${index}`, () => {
				const node = sourceCode.getNodeByRangeIndex(index);
				assert.strictEqual(node.type, type);
				if (value !== null) assert.strictEqual(node.value, value);
			});
		});

		it("should retrieve the deepest node containing the given index", () => {
			assert.strictEqual(sourceCode.getNodeByRangeIndex(14).type, "BinaryExpression");
			assert.strictEqual(sourceCode.getNodeByRangeIndex(3).type, "VariableDeclaration");
		});

		it("should return null if the index is outside the range of any node", () => {
			assert.isNull(sourceCode.getNodeByRangeIndex(-1));
			assert.isNull(sourceCode.getNodeByRangeIndex(-99));
		});
	});

	describe("isSpaceBetween()", () => {
		describe("should return true when there is at least one whitespace character between two tokens", () => {
			testSpaceBetweenBothDirections(
				[
					["let foo", true],
					["let  foo", true],
					["let /**/ foo", true],
					["let/**/foo", false],
					["let/*\n*/foo", false],
				],
				sc => sc.ast.tokens[0],
				sc => sc.ast.tokens.at(-1),
			);

			testSpaceBetweenBothDirections(
				[
					["a+b", false],
					["a +b", true],
					["a/**/+b", false],
					["a/* */+b", false],
					["a/**/ +b", true],
					["a/**/ /**/+b", true],
					["a/* */ /* */+b", true],
					["a/**/\n/**/+b", true],
					["a/* */\n/* */+b", true],
					["a/**/+b/**/+c", false],
					["a/* */+b/* */+c", false],
					["a/**/+b /**/+c", true],
					["a/* */+b /* */+c", true],
					["a/**/ +b/**/+c", true],
					["a/* */ +b/* */+c", true],
					["a/**/+b\t/**/+c", true],
					["a/* */+b\t/* */+c", true],
					["a/**/\t+b/**/+c", true],
					["a/* */\t+b/* */+c", true],
					["a/**/+b\n/**/+c", true],
					["a/* */+b\n/* */+c", true],
					["a/**/\n+b/**/+c", true],
					["a/* */\n+b/* */+c", true],
					["a/* */+' /**/ '/* */+c", false],
					["a/* */+ ' /**/ '/* */+c", true],
					["a/* */+' /**/ ' /* */+c", true],
					["a/* */+ ' /**/ ' /* */+c", true],
					["a/* */+` /*\n*/ `/* */+c", false],
					["a/* */+ ` /*\n*/ `/* */+c", true],
					["a/* */+` /*\n*/ ` /* */+c", true],
					["a/* */+ ` /*\n*/ ` /* */+c", true],
				],
				sc => sc.ast.tokens[0],
				sc => sc.ast.tokens.at(-2),
			);
		});

		describe("should return true when there is at least one whitespace character between a token and a node", () => {
			testSpaceBetweenBothDirections(
				[
					[";let foo = bar", false],
					[";/**/let foo = bar", false],
					[";/* */let foo = bar", false],
					["; let foo = bar", true],
					["; /**/let foo = bar", true],
					["; /* */let foo = bar", true],
					[";/**/ let foo = bar", true],
					[";/* */ let foo = bar", true],
					["; /**/ let foo = bar", true],
					["; /* */ let foo = bar", true],
					[";\tlet foo = bar", true],
					[";\t/**/let foo = bar", true],
					[";\t/* */let foo = bar", true],
					[";/**/\tlet foo = bar", true],
					[";/* */\tlet foo = bar", true],
					[";\t/**/\tlet foo = bar", true],
					[";\t/* */\tlet foo = bar", true],
					[";\nlet foo = bar", true],
					[";\n/**/let foo = bar", true],
					[";\n/* */let foo = bar", true],
					[";/**/\nlet foo = bar", true],
					[";/* */\nlet foo = bar", true],
					[";\n/**/\nlet foo = bar", true],
					[";\n/* */\nlet foo = bar", true],
				],
				sc => sc.ast.tokens[0],
				sc => sc.ast.body.at(-1),
			);
		});

		describe("should return true when there is at least one whitespace character between a node and a token", () => {
			testSpaceBetweenBothDirections(
				[
					["let foo = bar;;", false],
					["let foo = bar;;;", false],
					["let foo = 1; let bar = 2;;", true],
					["let foo = bar;/**/;", false],
					["let foo = bar;/* */;", false],
					["let foo = bar; ;", true],
					["let foo = bar; /**/;", true],
					["let foo = bar; /* */;", true],
					["let foo = bar;/**/ ;", true],
					["let foo = bar;/* */ ;", true],
					["let foo = bar; /**/ ;", true],
					["let foo = bar; /* */ ;", true],
					["let foo = bar;\t;", true],
					["let foo = bar;\t/**/;", true],
					["let foo = bar;\t/* */;", true],
					["let foo = bar;/**/\t;", true],
					["let foo = bar;/* */\t;", true],
					["let foo = bar;\t/**/\t;", true],
					["let foo = bar;\t/* */\t;", true],
					["let foo = bar;\n;", true],
					["let foo = bar;\n/**/;", true],
					["let foo = bar;\n/* */;", true],
					["let foo = bar;/**/\n;", true],
					["let foo = bar;/* */\n;", true],
					["let foo = bar;\n/**/\n;", true],
					["let foo = bar;\n/* */\n;", true],
				],
				sc => sc.ast.body[0],
				sc => sc.ast.tokens.at(-1),
			);
		});

		describe("should return true when there is at least one whitespace character between two nodes", () => {
			testSpaceBetweenBothDirections(
				[
					["let foo = bar;let baz = qux;", false],
					["let foo = bar;/**/let baz = qux;", false],
					["let foo = bar;/* */let baz = qux;", false],
					["let foo = bar; let baz = qux;", true],
					["let foo = bar; /**/let baz = qux;", true],
					["let foo = bar; /* */let baz = qux;", true],
					["let foo = bar;/**/ let baz = qux;", true],
					["let foo = bar;/* */ let baz = qux;", true],
					["let foo = bar; /**/ let baz = qux;", true],
					["let foo = bar; /* */ let baz = qux;", true],
					["let foo = bar;\tlet baz = qux;", true],
					["let foo = bar;\t/**/let baz = qux;", true],
					["let foo = bar;\t/* */let baz = qux;", true],
					["let foo = bar;/**/\tlet baz = qux;", true],
					["let foo = bar;/* */\tlet baz = qux;", true],
					["let foo = bar;\t/**/\tlet baz = qux;", true],
					["let foo = bar;\t/* */\tlet baz = qux;", true],
					["let foo = bar;\nlet baz = qux;", true],
					["let foo = bar;\n/**/let baz = qux;", true],
					["let foo = bar;\n/* */let baz = qux;", true],
					["let foo = bar;/**/\nlet baz = qux;", true],
					["let foo = bar;/* */\nlet baz = qux;", true],
					["let foo = bar;\n/**/\nlet baz = qux;", true],
					["let foo = bar;\n/* */\nlet baz = qux;", true],
					["let foo = 1;let foo2 = 2; let foo3 = 3;", true],
				],
				sc => sc.ast.body[0],
				sc => sc.ast.body.at(-1),
			);

			[
				["let jsx = <div>\n   {content}\n</div>", false, "whitespace-only JSXText"],
				["let jsx = <div>\n   Hello\n</div>", false, "mixed JSXText"],
				["let jsx = <div>Hello</div>", false, "letter-only JSXText"],
			].forEach(([code, expected, description]) => {
				it(`JSXText tokens (${description}) should NOT be handled as space`, () => {
					const ast = espree.parse(code, { ...DEFAULT_CONFIG, ecmaFeatures: { jsx: true } });
					const sourceCode = new SourceCode(code, ast);
					const jsx = ast.body[0].declarations[0].init;
					const hasInterpolation = description === "whitespace-only JSXText";
					const second = hasInterpolation ? jsx.children[1] : jsx.closingElement;

					assert.strictEqual(sourceCode.isSpaceBetween(jsx.openingElement, second), expected);
					assert.strictEqual(sourceCode.isSpaceBetween(second, jsx.openingElement), expected);

					if (hasInterpolation) {
						assert.strictEqual(sourceCode.isSpaceBetween(second, jsx.closingElement), expected);
						assert.strictEqual(sourceCode.isSpaceBetween(jsx.closingElement, second), expected);
					}
				});
			});
		});

		describe("should return false either of the arguments' location is inside the other one", () => {
			it("let foo = bar;", () => {
				const sourceCode = makeSourceCode("let foo = bar;");
				const token0 = sourceCode.ast.tokens[0];
				const tokenLast = sourceCode.ast.tokens.at(-1);
				const body0 = sourceCode.ast.body[0];

				for (const [a, b] of [[token0, body0], [tokenLast, body0], [body0, token0], [body0, tokenLast]]) {
					assert.strictEqual(sourceCode.isSpaceBetween(a, b), false);
				}
			});
		});
	});

	describe("linter.verify()", () => {
		it("should work when passed a SourceCode object without a config", () => {
			const ast = espree.parse(TEST_CODE, DEFAULT_CONFIG);
			const messages = linter.verify(new SourceCode(TEST_CODE, ast));
			assert.strictEqual(messages.length, 0);
		});

		it("should work when passed a SourceCode object containing ES6 syntax and config", () => {
			const messages = linter.verify(
				new SourceCode("let foo = bar;", AST),
				{ languageOptions: { ecmaVersion: 6 } },
			);
			assert.strictEqual(messages.length, 0);
		});

		it("should report an error when using let and ecmaVersion is 6", () => {
			const messages = linter.verify(
				new SourceCode("let foo = bar;", AST),
				{ languageOptions: { ecmaVersion: 6 }, rules: { "no-unused-vars": 2 } },
			);
			assert.strictEqual(messages.length, 1);
			assert.strictEqual(messages[0].message, "'foo' is assigned a value but never used.");
		});
	});

	describe("getLocFromIndex()", () => {
		const CODE = "foo\n" + "bar\r\n" + "baz\r" + "qux\u2028" + "foo\u2029" + "\n" + "qux\n";
		let sourceCode;

		beforeEach(() => {
			sourceCode = new SourceCode(CODE, espree.parse(CODE, DEFAULT_CONFIG));
		});

		it("should return the location of a range index", () => {
			const cases = [
				[0, { line: 1, column: 0 }],
				[3, { line: 1, column: 3 }],
				[4, { line: 2, column: 0 }],
				[5, { line: 2, column: 1 }],
				[15, { line: 4, column: 2 }],
				[21, { line: 6, column: 0 }],
			];
			cases.forEach(([index, expected]) => {
				assert.deepStrictEqual(sourceCode.getLocFromIndex(index), expected);
			});
		});

		it("should throw if given a bad input", () => {
			assert.throws(
				() => sourceCode.getLocFromIndex({ line: 1, column: 1 }),
				/Expected `index` to be a number\./u,
			);
		});

		it("should not throw if given sourceCode.text.length", () => {
			assert.deepStrictEqual(sourceCode.getLocFromIndex(CODE.length), { line: 8, column: 0 });
		});

		it("should throw if given an out-of-range input", () => {
			assert.throws(
				() => sourceCode.getLocFromIndex(CODE.length + 1),
				/Index out of range \(requested index 27, but source text has length 26\)\./u,
			);
		});

		it("is symmetric with getIndexFromLoc()", () => {
			for (let index = 0; index <= CODE.length; index++) {
				assert.strictEqual(index, sourceCode.getIndexFromLoc(sourceCode.getLocFromIndex(index)));
			}
		});
	});

	describe("getIndexFromLoc()", () => {
		const CODE = "foo\n" + "bar\r\n" + "baz\r" + "qux\u2028" + "foo\u2029" + "\n" + "qux\n";
		let sourceCode;

		beforeEach(() => {
			sourceCode = new SourceCode(CODE, espree.parse(CODE, DEFAULT_CONFIG));
		});

		it("should return the range index of a location", () => {
			const cases = [
				[{ line: 2, column: 1 }, 5],
				[{ line: 1, column: 3 }, 3],
				[{ line: 2, column: 0 }, 4],
				[{ line: 7, column: 0 }, 22],
				[{ line: 7, column: 3 }, 25],
			];
			cases.forEach(([loc, expected]) => {
				assert.strictEqual(sourceCode.getIndexFromLoc(loc), expected);
			});
		});

		it("should throw a useful error if given a malformed location", () => {
			const badInputs = [5, null, { line: "three", column: "four" }];
			badInputs.forEach(input => {
				assert.throws(
					() => sourceCode.getIndexFromLoc(input),
					/Expected `loc` to be an object with numeric `line` and `column` properties\./u,
				);
			});
		});

		it("should throw a useful error if `line` is out of range", () => {
			[
				[{ line: 9, column: 0 }, /Line number out of range \(line 9 requested, but only 8 lines present\)\./u],
				[{ line: 50, column: 3 }, /Line number out of range \(line 50 requested, but only 8 lines present\)\./u],
				[{ line: 0, column: 0 }, /Line number out of range \(line 0 requested\)\. Line numbers should be 1-based\./u],
			].forEach(([loc, pattern]) => {
				assert.throws(() => sourceCode.getIndexFromLoc(loc), pattern);
			});
		});

		it("should throw a useful error if `column` is out of range", () => {
			[
				[{ line: 1, column: -1 }, "Invalid column number (column -1 requested)."],
				[{ line: 1, column: -5 }, "Invalid column number (column -5 requested)."],
				[{ line: 3, column: -1 }, "Invalid column number (column -1 requested)."],
				[{ line: 3, column: 4 }, /Column number out of range \(column 4 requested, but the length of line 3 is 4\)\./u],
				[{ line: 3, column: 50 }, /Column number out of range \(column 50 requested, but the length of line 3 is 4\)\./u],
				[{ line: 8, column: 1 }, /Column number out of range \(column 1 requested, but the length of line 8 is 0\)\./u],
			].forEach(([loc, pattern]) => {
				assert.throws(() => sourceCode.getIndexFromLoc(loc), pattern);
			});
		});

		it("should not throw if the location one spot past the last character is given", () => {
			assert.strictEqual(sourceCode.getIndexFromLoc({ line: 8, column: 0 }), CODE.length);
		});
	});

	describe("getScope()", () => {
		it("should throw an error when argument is missing", () => {
			assert.throws(() => {
				linter.verify("foo", {
					plugins: {
						test: {
							rules: {
								"get-scope": {
									create: context => ({
										Program() {
											context.sourceCode.getScope();
										},
									}),
								},
							},
						},
					},
					rules: { "test/get-scope": "error" },
				});
			}, /Missing required argument: node/u);
		});

		const scopeTests = [
			{
				desc: "should return 'function' scope on FunctionDeclaration (ES5)",
				code: "function f() {}",
				selector: "FunctionDeclaration",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node);
				},
			},
			{
				desc: "should return 'function' scope on FunctionExpression (ES5)",
				code: "!function f() {}",
				selector: "FunctionExpression",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node);
				},
			},
			{
				desc: "should return 'function' scope on the body of FunctionDeclaration (ES5)",
				code: "function f() {}",
				selector: "BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent);
				},
			},
			{
				desc: "should return 'function' scope on the body of FunctionDeclaration (ES2015)",
				code: "function f() {}",
				selector: "BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent);
				},
			},
			{
				desc: "should return 'function' scope on BlockStatement in functions (ES5)",
				code: "function f() { { var b; } }",
				selector: "BlockStatement > BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
				},
			},
			{
				desc: "should return 'block' scope on BlockStatement in functions (ES2015)",
				code: "function f() { { let a; var b; } }",
				selector: "BlockStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "function");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["a"]);
					assert.deepStrictEqual(scope.variableScope.variables.map(v => v.name), ["arguments", "b"]);
				},
			},
			{
				desc: "should return 'block' scope on nested BlockStatement in functions (ES2015)",
				code: "function f() { { let a; { let b; var c; } } }",
				selector: "BlockStatement > BlockStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "block");
					assert.strictEqual(scope.upper.upper.type, "function");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
					assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["a"]);
					assert.deepStrictEqual(scope.variableScope.variables.map(v => v.name), ["arguments", "c"]);
				},
			},
			{
				desc: "should return 'function' scope on SwitchStatement in functions (ES5)",
				code: "function f() { switch (a) { case 0: var b; } }",
				selector: "SwitchStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
				},
			},
			{
				desc: "should return 'switch' scope on SwitchStatement in functions (ES2015)",
				code: "function f() { switch (a) { case 0: let b; } }",
				selector: "SwitchStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "switch");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
				},
			},
			{
				desc: "should return 'function' scope on SwitchCase in functions (ES5)",
				code: "function f() { switch (a) { case 0: var b; } }",
				selector: "SwitchCase",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
				},
			},
			{
				desc: "should return 'switch' scope on SwitchCase in functions (ES2015)",
				code: "function f() { switch (a) { case 0: let b; } }",
				selector: "SwitchCase",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "switch");
					assert.strictEqual(scope.block, node.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
				},
			},
			{
				desc: "should return 'catch' scope on CatchClause in functions (ES5)",
				code: "function f() { try {} catch (e) { var a; } }",
				selector: "CatchClause",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "catch");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
				},
			},
			{
				desc: "should return 'catch' scope on CatchClause in functions (ES2015)",
				code: "function f() { try {} catch (e) { let a; } }",
				selector: "CatchClause",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "catch");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
				},
			},
			{
				desc: "should return 'catch' scope on the block of CatchClause in functions (ES5)",
				code: "function f() { try {} catch (e) { var a; } }",
				selector: "CatchClause > BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "catch");
					assert.strictEqual(scope.block, node.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
				},
			},
			{
				desc: "should return 'block' scope on the block of CatchClause in functions (ES2015)",
				code: "function f() { try {} catch (e) { let a; } }",
				selector: "CatchClause > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["a"]);
				},
			},
			{
				desc: "should return 'function' scope on ForStatement in functions (ES5)",
				code: "function f() { for (var i = 0; i < 10; ++i) {} }",
				selector: "ForStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "i"]);
				},
			},
			{
				desc: "should return 'for' scope on ForStatement in functions (ES2015)",
				code: "function f() { for (let i = 0; i < 10; ++i) {} }",
				selector: "ForStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["i"]);
				},
			},
			{
				desc: "should return 'function' scope on the block body of ForStatement in functions (ES5)",
				code: "function f() { for (var i = 0; i < 10; ++i) {} }",
				selector: "ForStatement > BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "i"]);
				},
			},
			{
				desc: "should return 'block' scope on the block body of ForStatement in functions (ES2015)",
				code: "function f() { for (let i = 0; i < 10; ++i) {} }",
				selector: "ForStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), []);
					assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["i"]);
				},
			},
			{
				desc: "should return 'function' scope on ForInStatement in functions (ES5)",
				code: "function f() { for (var key in obj) {} }",
				selector: "ForInStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "key"]);
				},
			},
			{
				desc: "should return 'for' scope on ForInStatement in functions (ES2015)",
				code: "function f() { for (let key in obj) {} }",
				selector: "ForInStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["key"]);
				},
			},
			{
				desc: "should return 'function' scope on the block body of ForInStatement in functions (ES5)",
				code: "function f() { for (var key in obj) {} }",
				selector: "ForInStatement > BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent.parent);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "key"]);
				},
			},
			{
				desc: "should return 'block' scope on the block body of ForInStatement in functions (ES2015)",
				code: "function f() { for (let key in obj) {} }",
				selector: "ForInStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), []);
					assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["key"]);
				},
			},
			{
				desc: "should return 'for' scope on ForOfStatement in functions (ES2015)",
				code: "function f() { for (let x of xs) {} }",
				selector: "ForOfStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), ["x"]);
				},
			},
			{
				desc: "should return 'block' scope on the block body of ForOfStatement in functions (ES2015)",
				code: "function f() { for (let x of xs) {} }",
				selector: "ForOfStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), []);
					assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["x"]);
				},
			},
		];

		scopeTests.forEach(({ desc, code, selector, ecmaVersion, check }) => {
			it(desc, () => {
				check(getScope(code, selector, ecmaVersion));
			});
		});

		it("should shadow the same name variable by the iteration variable.", () => {
			const { node, scope } = getScope("let x; for (let x of x) {}", "ForOfStatement", 2015);

			assert.strictEqual(scope.type, "for");
			assert.strictEqual(scope.upper.type, "global");
			assert.strictEqual(scope.block, node);
			assert.strictEqual(scope.upper.variables[0].references.length, 0);
			assert.strictEqual(scope.references[0].identifier, node.left.declarations[0].id);
			assert.strictEqual(scope.references[1].identifier, node.right);
			assert.strictEqual(scope.references[1].resolved, scope.variables[0]);
		});
	});

	describe("getAncestors()", () => {
		const code = TEST_CODE;

		it("should retrieve all ancestors when used", () => {
			let spy;
			const config = makeCheckerRule("BinaryExpression", context => {
				spy = sinon.spy(node => {
					assert.strictEqual(context.sourceCode.getAncestors(node).length, 3);
				});
				return spy;
			});

			linter.verify(code, config, filename);
			assertCalledOnce(spy);
		});

		it("should retrieve empty ancestors for root node", () => {
			let spy;
			const config = makeCheckerRule("Program", context => {
				spy = sinon.spy(node => {
					assert.strictEqual(context.sourceCode.getAncestors(node).length, 0);
				});
				return spy;
			});

			linter.verify(code, config);
			assertCalledOnce(spy);
		});

		it("should throw an error when the argument is missing", () => {
			let spy;
			const config = makeCheckerRule("Program", context => {
				spy = sinon.spy(() => {
					assert.throws(
						() => context.sourceCode.getAncestors(),
						/Missing required argument: node/u,
					);
				});
				return spy;
			});

			linter.verify(code, config);
			assertCalledOnce(spy);
		});
	});

	describe("getDeclaredVariables(node)", () => {
		function verify(code, type, expectedNamesList) {
			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;

									function checkEmpty(node) {
										assert.strictEqual(
											0,
											sourceCode.getDeclaredVariables(node).length,
										);
									}

									const emptyNodeTypes = [
										"Program", "EmptyStatement", "BlockStatement",
										"ExpressionStatement", "LabeledStatement", "BreakStatement",
										"ContinueStatement", "WithStatement", "SwitchStatement",
										"ReturnStatement", "ThrowStatement", "TryStatement",
										"WhileStatement", "DoWhileStatement", "ForStatement",
										"ForInStatement", "DebuggerStatement", "ThisExpression",
										"ArrayExpression", "ObjectExpression", "Property",
										"SequenceExpression", "UnaryExpression", "BinaryExpression",
										"AssignmentExpression", "UpdateExpression", "LogicalExpression",
										"ConditionalExpression", "CallExpression", "NewExpression",
										"MemberExpression", "SwitchCase", "Identifier", "Literal",
										"ForOfStatement", "ArrowFunctionExpression", "YieldExpression",
										"TemplateLiteral", "TaggedTemplateExpression", "TemplateElement",
										"ObjectPattern", "ArrayPattern", "RestElement",
										"AssignmentPattern", "ClassBody", "MethodDefinition", "MetaProperty",
									];

									const rule = Object.fromEntries(emptyNodeTypes.map(t => [t, checkEmpty]));

									rule[type] = function (node) {
										const expectedNames = expectedNamesList.shift();
										const variables = sourceCode.getDeclaredVariables(node);

										assert(Array.isArray(expectedNames));
										assert(Array.isArray(variables));
										assert.strictEqual(expectedNames.length, variables.length);
										for (let i = variables.length - 1; i >= 0; i--) {
											assert.strictEqual(expectedNames[i], variables[i].name);
										}
									};
									return rule;
								},
							},
						},
					},
				},
				rules: { "test/checker": 2 },
			});

			assert.strictEqual(0, expectedNamesList.length);
		}

		it("VariableDeclaration", () => {
			verify(
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ",
				"VariableDeclaration",
				[["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i", "j", "k"], ["l"]],
			);
		});

		it("VariableDeclaration (on for-in/of loop)", () => {
			verify(
				"\n for (var {a, x: [b], y: {c = 0}} in foo) {\n let g;\n }\n for (let {d, x: [e], y: {f = 0}} of foo) {\n let h;\n }\n ",
				"VariableDeclaration",
				[["a", "b", "c"], ["g"], ["d", "e", "f"], ["h"]],
			);
		});

		it("VariableDeclarator", () => {
			verify(
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ",
				"VariableDeclarator",
				[["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"], ["j", "k"], ["l"]],
			);
		});

		it("FunctionDeclaration", () => {
			verify(
				"\n function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n }\n function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n }\n ",
				"FunctionDeclaration",
				[["foo", "a", "b", "c", "d", "e"], ["bar", "f", "g", "h", "i", "j"]],
			);
		});

		it("FunctionExpression", () => {
			verify(
				"\n (function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n });\n (function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n });\n ",
				"FunctionExpression",
				[["foo", "a", "b", "c", "d", "e"], ["bar", "f", "g", "h", "i", "j"], ["q"]],
			);
		});

		it("ArrowFunctionExpression", () => {
			verify(
				"\n (({a, x: [b], y: {c = 0}}, [d, e]) => {\n let z;\n });\n (({f, x: [g], y: {h = 0}}, [i, j]) => {\n let z;\n });\n ",
				"ArrowFunctionExpression",
				[["a", "b", "c", "d", "e"], ["f", "g", "h", "i", "j"]],
			);
		});

		it("ClassDeclaration", () => {
			verify(
				"\n class A { foo(x) { let y; } }\n class B { foo(x) { let y; } }\n ",
				"ClassDeclaration",
				[["A", "A"], ["B", "B"]],
			);
		});

		it("ClassExpression", () => {
			verify(
				"\n (class A { foo(x) { let y; } });\n (class B { foo(x) { let y; } });\n ",
				"ClassExpression",
				[["A"], ["B"]],
			);
		});

		it("CatchClause", () => {
			verify(
				"\n try {} catch ({a, b}) {\n let x;\n try {} catch ({c, d}) {\n let y;\n }\n }\n ",
				"CatchClause",
				[["a", "b"], ["c", "d"]],
			);
		});

		it("ImportDeclaration", () => {
			verify(
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ',
				"ImportDeclaration",
				[[], ["a"], ["b", "c", "d"]],
			);
		});

		it("ImportSpecifier", () => {
			verify(
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ',
				"ImportSpecifier",
				[["c"], ["d"]],
			);
		});

		it("ImportDefaultSpecifier", () => {
			verify(
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ',
				"ImportDefaultSpecifier",
				[["b"]],
			);
		});

		it("ImportNamespaceSpecifier", () => {
			verify(
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ',
				"ImportNamespaceSpecifier",
				[["a"]],
			);
		});
	});

	describe("markVariableAsUsed()", () => {
		it("should mark variables in current scope as used", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(code, {
				...makeCheckerRule("Program:exit", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						assert.isTrue(sourceCode.markVariableAsUsed("a"));
						const scope = sourceCode.getScope(node);
						assert.isTrue(getVariable(scope, "a").eslintUsed);
						assert.notOk(getVariable(scope, "b").eslintUsed);
					});
					return spy;
				}),
				languageOptions: { sourceType: "script" },
			});
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in function args as used", () => {
			const code = "function abc(a, b) { return 1; }";
			let spy;

			linter.verify(code, makeCheckerRule("ReturnStatement", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(node => {
					assert.isTrue(sourceCode.markVariableAsUsed("a", node));
					const scope = sourceCode.getScope(node);
					assert.isTrue(getVariable(scope, "a").eslintUsed);
					assert.notOk(getVariable(scope, "b").eslintUsed);
				});
				return spy;
			}));
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in higher scopes as used", () => {
			const code = "var a, b; function abc() { return 1; }";
			let returnSpy, exitSpy;

			linter.verify(code, {
				...makeCheckerRule("ReturnStatement", context => {
					const sourceCode = context.sourceCode;
					returnSpy = sinon.spy(node => {
						assert.isTrue(sourceCode.markVariableAsUsed("a", node));
					});
					exitSpy = sinon.spy(node => {
						const scope = sourceCode.getScope(node);
						assert.isTrue(getVariable(scope, "a").eslintUsed);
						assert.notOk(getVariable(scope, "b").eslintUsed);
					});
					return { ReturnStatement: returnSpy, "Program:exit": exitSpy };
				}),
				languageOptions: { sourceType: "script" },
			});
			assert(returnSpy && returnSpy.calledOnce);
			assert(exitSpy && exitSpy.calledOnce);
		});

		it("should mark variables in Node.js environment as used", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(code, {
				...makeCheckerRule("Program:exit", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						const globalScope = sourceCode.getScope(node);
						const childScope = globalScope.childScopes[0];
						assert.isTrue(sourceCode.markVariableAsUsed("a"));
						assert.isTrue(getVariable(childScope, "a").eslintUsed);
						assert.isUndefined(getVariable(childScope, "b").eslintUsed);
					});
					return spy;
				}),
				languageOptions: { sourceType: "commonjs" },
			});
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in modules as used", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(
				code,
				makeCheckerRule("Program:exit", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						const globalScope = sourceCode.getScope(node);
						const childScope = globalScope.childScopes[0];
						assert.isTrue(sourceCode.markVariableAsUsed("a"));
						assert.isTrue(getVariable(childScope, "a").eslintUsed);
						assert.isUndefined(getVariable(childScope, "b").eslintUsed);
					});
					return spy;
				}),
				filename,
			);
			assert(spy && spy.calledOnce);
		});

		it("should return false if the given variable is not found", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(code, {
				...makeCheckerRule("Program:exit", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(() => {
						assert.isFalse(sourceCode.markVariableAsUsed("c"));
					});
					return spy;
				}),
				languageOptions: { sourceType: "script" },
			});
			assert(spy && spy.calledOnce);
		});
	});

	describe("getInlineConfigNodes()", () => {
		it("should return inline config comments", () => {
			const code = "/*eslint foo: 1*/ foo; /* non-config comment*/ /* eslint-disable bar */ bar; /* eslint-enable bar */";
			const sourceCode = makeSourceCode(code);
			const configComments = sourceCode.getInlineConfigNodes();

			assert.deepStrictEqual(JSON.parse(JSON.stringify(configComments)), [
				{
					type: "Block",
					value: "eslint foo: 1",
					start: 0,
					end: 17,
					range: [0, 17],
					loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 17 } },
				},
				{
					type: "Block",
					value: " eslint-disable bar ",
					start: 47,
					end: 71,
					range: [47, 71],
					loc: { start: { line: 1, column: 47 }, end: { line: 1, column: 71 } },
				},
				{
					type: "Block",
					value: " eslint-enable bar ",
					start: 77,
					end: 100,
					range: [77, 100],
					loc: { start: { line: 1, column: 77 }, end: { line: 1, column: 100 } },
				},
			]);
		});
	});

	describe("applyLanguageOptions()", () => {
		function applyAndFinalize(code, languageOptions, scopeOptions = {}) {
			const sourceCode = buildSourceCode(code, scopeOptions);
			sourceCode.applyLanguageOptions(languageOptions);
			sourceCode.finalize();
			return sourceCode.scopeManager.scopes[0];
		}

		it("should add ES6 globals", () => {
			const globalScope = applyAndFinalize("foo", { ecmaVersion: 2015 });
			assert.isDefined(globalScope.set.get("Promise"));
		});

		it("should add custom globals", () => {
			const globalScope = applyAndFinalize("foo", { ecmaVersion: 2015, globals: { FOO: true } });
			const variable = globalScope.set.get("FOO");
			assert.isDefined(variable);
			assert.isTrue(variable.writeable);
		});

		it("should add commonjs globals", () => {
			const globalScope = applyAndFinalize(
				"foo",
				{ ecmaVersion: 2015, sourceType: "commonjs" },
				{ sourceType: "commonjs" },
			);
			assert.isDefined(globalScope.set.get("require"));
		});
	});

	describe("applyInlineConfig()", () => {
		it("should add inline globals", () => {
			const code = "/*global bar: true */ foo;";
			const sourceCode = buildSourceCode(code);
			sourceCode.applyInlineConfig();
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("bar");
			assert.isDefined(variable);
			assert.isTrue(variable.writeable);
		});

		describe("exported variables", () => {
			function loadGlobalScope(code) {
				const sourceCode = buildSourceCode(code);
				sourceCode.applyInlineConfig();
				sourceCode.finalize();
				return sourceCode.scopeManager.scopes[0].set;
			}

			it("should mark exported variable", () => {
				const variable = loadGlobalScope("/*exported foo */ var foo;").get("foo");
				assert.isDefined(variable);
				assert.isTrue(variable.eslintUsed);
				assert.isTrue(variable.eslintExported);
			});

			it("should not mark exported variable with `key: value` pair", () => {
				const variable = loadGlobalScope("/*exported foo: true */ var foo;").get("foo");
				assert.isDefined(variable);
				assert.notOk(variable.eslintUsed);
				assert.notOk(variable.eslintExported);
			});

			it("should mark exported variables with comma", () => {
				const globalScope = loadGlobalScope("/*exported foo, bar */ var foo, bar;");
				["foo", "bar"].forEach(name => {
					const variable = globalScope.get(name);
					assert.isDefined(variable);
					assert.isTrue(variable.eslintUsed);
					assert.isTrue(variable.eslintExported);
				});
			});

			it("should not mark exported variables without comma", () => {
				const globalScope = loadGlobalScope("/*exported foo bar */ var foo, bar;");
				["foo", "bar"].forEach(name => {
					const variable = globalScope.get(name);
					assert.isDefined(variable);
					assert.notOk(variable.eslintUsed);
					assert.notOk(variable.eslintExported);
				});
			});
		});

		it("should extract rule configuration", () => {
			const sourceCode = makeSourceCode("/*eslint some-rule: 2 */ var foo;");
			const result = sourceCode.applyInlineConfig();
			assert.strictEqual(result.configs.length, 1);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
		});

		it("should extract multiple rule configurations", () => {
			const sourceCode = makeSourceCode('/*eslint some-rule: 2, other-rule: ["error", { skip: true }] */ var foo;');
			const result = sourceCode.applyInlineConfig();
			assert.strictEqual(result.configs.length, 1);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
			assert.deepStrictEqual(result.configs[0].config.rules["other-rule"], ["error", { skip: true }]);
		});

		it("should extract multiple comments into multiple configurations", () => {
			const sourceCode = makeSourceCode('/*eslint some-rule: 2*/ /*eslint other-rule: ["error", { skip: true }] */ var foo;');
			const result = sourceCode.applyInlineConfig();
			assert.strictEqual(result.configs.length, 2);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
			assert.deepStrictEqual(result.configs[1].config.rules["other-rule"], ["error", { skip: true }]);
		});

		it("should report problem with rule configuration parsing", () => {
			const sourceCode = makeSourceCode("/*eslint some-rule::, */ var foo;");
			const problem = sourceCode.applyInlineConfig().problems[0];
			assert.strictEqual(problem.loc.start.column, 0);
			assert.strictEqual(problem.loc.start.line, 1);
			assert.strictEqual(problem.loc.end.column, 24);
			assert.strictEqual(problem.loc.end.line, 1);
			assert.match(problem.message, /Failed to parse JSON from '"some-rule"::,': Unexpected token '?:'?/u);
			assert.isNull(problem.ruleId);
		});
	});

	describe("finalize()", () => {
		/**
		 * Build a SourceCode, apply language options and inline config, then finalize.
		 */
		function buildAndFinalize(code, languageOptions, applyInline = false) {
			const sourceCode = buildSourceCode(code);
			sourceCode.applyLanguageOptions(languageOptions);
			if (applyInline) sourceCode.applyInlineConfig();
			sourceCode.finalize();
			return { sourceCode, globalScope: sourceCode.scopeManager.scopes[0] };
		}

		/**
		 * Assert standard ES globals state.
		 */
		function assertEsGlobals(globalScope, esGlobals, expectedCount = Object.keys(esGlobals).length) {
			assert.strictEqual(globalScope.set.size, expectedCount);
			assert.strictEqual(globalScope.variables.length, expectedCount);
			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
			}
		}

		it("should add predefined ES globals with expected attributes and resolve references", () => {
			const { globalScope } = buildAndFinalize("Set = Array", { ecmaVersion: 2015 });
			const esGlobals = globals.es2015;

			assertEsGlobals(globalScope, esGlobals);

			for (const variable of globalScope.variables) {
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);
				assertGlobalVariableAttributes(variable, esGlobals);
				assert.strictEqual(variable.defs.length, 0);
			}

			assertCleanScope(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined in the config", () => {
			const { globalScope } = buildAndFinalize("Set = Array", {
				ecmaVersion: 2015,
				globals: { Object: "writable" },
			});
			const esGlobals = globals.es2015;

			assertEsGlobals(globalScope, esGlobals);

			for (const variable of globalScope.variables) {
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);

				if (variable.name === "Object") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				} else {
					assertGlobalVariableAttributes(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertCleanScope(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined inline", () => {
			const { globalScope } = buildAndFinalize(
				"/* global Object:writable */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);
			const esGlobals = globals.es2015;

			assertEsGlobals(globalScope, esGlobals);

			for (const variable of globalScope.variables) {
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);

				if (variable.name === "Object") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "readonly");
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, true);
				} else {
					assertGlobalVariableAttributes(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertCleanScope(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should not add predefined global when it is disabled in the config", () => {
			const { globalScope } = buildAndFinalize("Set = Array", {
				ecmaVersion: 2015,
				globals: { Set: "off", Array: "off", Object: "off" },
			});
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount - 3);
			assert(!globalScope.set.has("Set"));
			assert(!globalScope.set.has("Array"));
			assert(!globalScope.set.has("Object"));

			for (const variable of globalScope.variables) {
				assert.strictEqual(variable.references.length, 0);
				assertGlobalVariableAttributes(variable, esGlobals);
				assert.strictEqual(variable.defs.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Set"));
			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.implicit.left.length, 2);
		});

		it("should not add predefined global when it is disabled inline", () => {
			const { globalScope } = buildAndFinalize(
				"/* globals Set: off, Array: off, Object: off */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount - 3);
			assert(!globalScope.set.has("Set"));
			assert(!globalScope.set.has("Array"));
			assert(!globalScope.set.has("Object"));

			for (const variable of globalScope.variables) {
				assert.strictEqual(variable.references.length, 0);
				assertGlobalVariableAttributes(variable, esGlobals);
				assert.strictEqual(variable.defs.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Set"));
			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.implicit.left.length, 2);
		});

		it("should add custom globals enabled in the config", () => {
			const { globalScope } = buildAndFinalize(
				"Foo = Bar",
				{ ecmaVersion: 2015, globals: { Foo: true, Bar: false, Baz: "writeable", Qux: "off" } },
				true,
			);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));
			assert(!globalScope.set.has("Qux"));

			const customExpected = {
				Foo: { setting: "writable", explicit: false, comments: void 0, writeable: true },
				Bar: { setting: "readonly", explicit: false, comments: void 0, writeable: false },
				Baz: { setting: "writable", explicit: false, comments: void 0, writeable: true },
			};

			for (const variable of globalScope.variables) {
				assert.strictEqual(
					variable.references.length,
					["Foo", "Bar"].includes(variable.name) ? 1 : 0,
				);

				if (customExpected[variable.name]) {
					const exp = customExpected[variable.name];
					assert.strictEqual(variable.eslintImplicitGlobalSetting, exp.setting);
					assert.strictEqual(variable.eslintExplicitGlobal, exp.explicit);
					assert.strictEqual(variable.eslintExplicitGlobalComments, exp.comments);
					assert.strictEqual(variable.writeable, exp.writeable);
				} else {
					assertGlobalVariableAttributes(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertCleanScope(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should add custom globals enabled inline", () => {
			const { globalScope } = buildAndFinalize(
				"/* globals Foo: true, Bar: false, Baz: writeable, Qux: off */ Foo = Bar",
				{ ecmaVersion: 2015 },
				true,
			);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));
			assert(!globalScope.set.has("Qux"));

			const inlineExpected = {
				Foo: { setting: void 0, explicit: true, commentsLen: 1, writeable: true },
				Bar: { setting: void 0, explicit: true, commentsLen: 1, writeable: false },
				Baz: { setting: void 0, explicit: true, commentsLen: 1, writeable: true },
			};

			for (const variable of globalScope.variables) {
				assert.strictEqual(
					variable.references.length,
					["Foo", "Bar"].includes(variable.name) ? 1 : 0,
				);

				if (inlineExpected[variable.name]) {
					const exp = inlineExpected[variable.name];
					assert.strictEqual(variable.eslintImplicitGlobalSetting, exp.setting);
					assert.strictEqual(variable.eslintExplicitGlobal, exp.explicit);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, exp.commentsLen);
					assert.strictEqual(variable.writeable, exp.writeable);
				} else {
					assertGlobalVariableAttributes(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertCleanScope(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should correctly set attributes when custom globals are enabled both in config and inline", () => {
			const { globalScope } = buildAndFinalize(
				"/* globals Foo: false, Bar: writable, Baz -- Baz defaults to 'readonly' */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Foo: true, Bar: false, Baz: "writeable" } },
				true,
			);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);

			const mixedExpected = {
				Foo: { setting: "writable", explicit: true, commentsLen: 1, writeable: false },
				Bar: { setting: "readonly", explicit: true, commentsLen: 1, writeable: true },
				Baz: { setting: "writable", explicit: true, commentsLen: 1, writeable: false },
			};

			for (const variable of globalScope.variables) {
				assert.strictEqual(
					variable.references.length,
					["Foo", "Bar"].includes(variable.name) ? 1 : 0,
				);

				if (mixedExpected[variable.name]) {
					const exp = mixedExpected[variable.name];
					assert.strictEqual(variable.eslintImplicitGlobalSetting, exp.setting);
					assert.strictEqual(variable.eslintExplicitGlobal, exp.explicit);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, exp.commentsLen);
					assert.strictEqual(variable.writeable, exp.writeable);
				} else {
					assertGlobalVariableAttributes(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertCleanScope(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should not add globals that are enabled in config but disabled inline", () => {
			const { globalScope } = buildAndFinalize(
				"/* globals Foo: off, Bar: off, Baz: off */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Foo: true, Bar: false, Baz: "writeable" } },
				true,
			);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert(!globalScope.set.has("Foo"));
			assert(!globalScope.set.has("Bar"));
			assert(!globalScope.set.has("Baz"));

			for (const variable of globalScope.variables) {
				assert.strictEqual(variable.references.length, 0);
				assertGlobalVariableAttributes(variable, esGlobals);
				assert.strictEqual(variable.defs.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Foo"));
			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].identifier.name, "Foo");
			assert.strictEqual(globalScope.references[0].resolved, null);
			assert.strictEqual(globalScope.references[1].identifier.name, "Bar");
			assert.strictEqual(globalScope.references[1].resolved, null);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.implicit.left.length, 2);
		});

		it("should not affect references for variables that are neither predefined, nor enabled in config, nor enabled inline", () => {
			const { globalScope } = buildAndFinalize(
				"/* globals Qux: true */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Quux: true } },
				true,
			);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 2);
			assert(globalScope.set.has("Qux"));
			assert(globalScope.set.has("Quux"));
			assert(!globalScope.set.has("Foo"));
			assert(!globalScope.set.has("Bar"));

			for (const variable of globalScope.variables) {
				assert.strictEqual(variable.references.length, 0);

				if (variable.name === "Qux") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, void 0);
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, true);
				} else if (variable.name === "Quux") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				} else {
					assertGlobalVariableAttributes(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Foo"));
			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].identifier.name, "Foo");
			assert.strictEqual(globalScope.references[0].resolved, null);
			assert.strictEqual(globalScope.references[1].identifier.name, "Bar");
			assert.strictEqual(globalScope.references[1].resolved, null);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.implicit.left.length, 2);
		});

		it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
			const { globalScope } = buildAndFinalize(
				"/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;",
				{ ecmaVersion: 2015, globals: { Bar: true } },
				true,
			);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));

			for (const variable of globalScope.variables) {
				assert.strictEqual(
					variable.references.length,
					["Foo", "Bar", "Baz"].includes(variable.name) ? 1 : 0,
				);

				if (variable.name === "Baz") {
					assert(!Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
					assert(!Object.hasOwn(variable, "eslintExplicitGlobal"));
					assert(!Object.hasOwn(variable, "eslintExplicitGlobalComments"));
					assert(!Object.hasOwn(variable, "writeable"));
				} else if (variable.name === "Foo") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, void 0);
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, false);
				} else if (variable.name === "Bar") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				} else {
					assertGlobalVariableAttributes(variable, esGlobals);
				}

				assert.strictEqual(
					variable.defs.length,
					["Foo", "Bar", "Baz"].includes(variable.name) ? 1 : 0,
				);
			}

			assertCleanScope(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar", "Baz"]);
		});
	});

	describe("isGlobalReference(node)", () => {
		it("should throw an error when argument is missing", () => {
			assert.throws(() => {
				linter.verify("foo", {
					plugins: {
						test: {
							rules: {
								"is-global-reference": {
									create: context => ({
										Program() {
											context.sourceCode.isGlobalReference();
										},
									}),
								},
							},
						},
					},
					rules: { "test/is-global-reference": 2 },
				});
			}, /Missing required argument: node/u);
		});

		it("should correctly identify global references", () => {
			const code = "undefined; globalThis; NaN; Object; Boolean; String; Math; Date; Array; Map; Set; var foo; foo;";
			let identifierSpy;

			const builtinGlobals = new Set(["undefined", "globalThis", "NaN", "Object", "Boolean", "String", "Math", "Date", "Array", "Map", "Set"]);

			const config = {
				languageOptions: { sourceType: "script" },
				...makeCheckerRule("Identifier", context => {
					const sourceCode = context.sourceCode;
					identifierSpy = sinon.spy(node => {
						if (builtinGlobals.has(node.name)) {
							assert.isTrue(sourceCode.isGlobalReference(node), `Expected ${node.name} to be a global reference`);
						} else if (node.name === "foo" && node.parent.type !== "VariableDeclarator") {
							assert.isFalse(sourceCode.isGlobalReference(node), "Expected local variable to not be a global reference");
						}
					});
					return identifierSpy;
				}),
			};

			linter.verify(code, config);
			assert(identifierSpy.called, "Identifier spy was not called.");
			assert(identifierSpy.callCount > 10, "Identifier spy was not called enough times.");
		});

		it("should handle function parameters and shadowed globals", () => {
			const code = "function test(param, NaN) { param; NaN; }";
			let spy;

			const config = makeCheckerRule("FunctionDeclaration", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(functionDecl => {
					const blockStatement = functionDecl.body;
					const paramRef = blockStatement.body[0].expression;
					const NaNRef = blockStatement.body[1].expression;

					assert.strictEqual(paramRef.name, "param");
					assert.strictEqual(NaNRef.name, "NaN");
					assert.isFalse(sourceCode.isGlobalReference(paramRef));
					assert.isFalse(sourceCode.isGlobalReference(NaNRef));
				});
				return spy;
			});

			linter.verify(code, config);
			assertCalledOnce(spy);
		});

		it("should identify global references in modules", () => {
			const code = "Math;";
			let spy;

			const config = {
				...makeCheckerRule("Program:exit", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(() => {
						const mathRef = sourceCode.ast.body[0].expression;
						assert.strictEqual(mathRef.name, "Math");
						assert.isTrue(sourceCode.isGlobalReference(mathRef));
					});
					return spy;
				}),
				languageOptions: { ecmaVersion: 2015, sourceType: "module" },
			};

			linter.verify(code, config);
			assertCalledOnce(spy);
		});

		it("should identify variables in higher scopes as non-global", () => {
			const code = "var outer; function foo() { outer; }";
			let spy;

			const config = makeCheckerRule("FunctionDeclaration", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(functionDecl => {
					const outerRef = functionDecl.body.body[0].expression;
					assert.strictEqual(outerRef.name, "outer");
					assert.isFalse(sourceCode.isGlobalReference(outerRef));
				});
				return spy;
			});

			linter.verify(code, config);
			assertCalledOnce(spy);
		});

		it("should distinguish between object property access and global references", () => {
			const code = "String; String.length; Math; obj.Math;";
			let identifierSpy;

			const config = makeCheckerRule("Identifier", context => {
				const sourceCode = context.sourceCode;
				identifierSpy = sinon.spy(node => {
					if (node.name === "String") {
						assert.isTrue(sourceCode.isGlobalReference(node), "Expected 'String' to be a global reference");
					} else if (node.name === "length" && node.parent.type === "MemberExpression") {
						assert.isFalse(sourceCode.isGlobalReference(node), "Expected property 'length' to not be a global reference");
					} else if (node.name === "Math" && node.parent.type !== "MemberExpression") {
						assert.isTrue(sourceCode.isGlobalReference(node), "Expected 'Math' to be a global reference");
					} else if (node.name === "Math" && node.parent.object.name === "obj") {
						assert.isFalse(sourceCode.isGlobalReference(node), "Expected 'obj.Math' property to not be a global reference");
					}
				});
				return identifierSpy;
			});

			linter.verify(code, config);
			assert(identifierSpy.called, "Identifier spy was not called.");
		});

		it("should handle destructuring assignments properly", () => {
			const code = "const { Math } = obj; Math; const [Array] = list; Array;";
			let spy;

			const config = {
				...makeCheckerRule("Program:exit", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(() => {
						const mathRef = sourceCode.ast.body[1].expression;
						const arrayRef = sourceCode.ast.body[3].expression;
						assert.strictEqual(mathRef.name, "Math");
						assert.strictEqual(arrayRef.name, "Array");
						assert.isFalse(sourceCode.isGlobalReference(mathRef), "Destructured 'Math' should not be a global reference");
						assert.isFalse(sourceCode.isGlobalReference(arrayRef), "Destructured 'Array' should not be a global reference");
					});
					return spy;
				}),
				languageOptions: { ecmaVersion: 2015 },
			};

			linter.verify(code, config);
			assertCalledOnce(spy);
		});

		it("should handle imported names that shadow globals", () => {
			const code = "import { Object, String } from './module'; Object; String;";
			let spy;

			const config = makeCheckerRule("Program:exit", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(() => {
					const objectRef = sourceCode.ast.body[1].expression;
					const stringRef = sourceCode.ast.body[2].expression;
					assert.strictEqual(objectRef.name, "Object");
					assert.strictEqual(stringRef.name, "String");
					assert.isFalse(sourceCode.isGlobalReference(objectRef), "Imported 'Object' should not be a global reference");
					assert.isFalse(sourceCode.isGlobalReference(stringRef), "Imported 'String' should not be a global reference");
				});
				return spy;
			});

			linter.verify(code, config);
			assertCalledOnce(spy);
		});

		it("should handle temporal dead zone (TDZ) for let variables", () => {
			const code = "{ console.log(x); let x = 5; }";
			let spy;

			const config = {
				...makeCheckerRule("Identifier", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						if (node.name === "x" && node.parent.type !== "VariableDeclarator") {
							assert.isFalse(sourceCode.isGlobalReference(node), "Reference in TDZ should not be a global reference");
						}
					});
					return spy;
				}),
				languageOptions: { ecmaVersion: 2015 },
			};

			linter.verify(code, config);
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should handle variables shadowed in catch blocks", () => {
			const code = "try {} catch (Error) { Error; }";
			let spy;

			const config = makeCheckerRule("Identifier", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(node => {
					if (node.parent.type === "CatchClause") return;
					if (node.name === "Error") {
						assert.isFalse(sourceCode.isGlobalReference(node), "Error in catch block should not be a global reference");
					}
				});
				return spy;
			});

			linter.verify(code, config);
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should handle class declarations and methods", () => {
			const code = "class MyClass { method() { Math.random(); this.Math = 5; } }";
			let spy;

			const config = {
				...makeCheckerRule("Identifier", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						if (node.name === "Math" && node.parent.type === "MemberExpression" && node.parent.object.type !== "ThisExpression") {
							assert.isTrue(sourceCode.isGlobalReference(node), "Math in method should be a global reference");
						} else if (node.name === "Math" && node.parent.object && node.parent.object.type === "ThisExpression") {
							assert.isFalse(sourceCode.isGlobalReference(node), "this.Math should not be a global reference");
						}
					});
					return spy;
				}),
				languageOptions: { ecmaVersion: 2015 },
			};

			linter.verify(code, config);
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should respect /*globals*/ directive comments", () => {
			const code = "/*globals customGlobal:writable, String:off */ customGlobal; String;";
			let spy;

			const config = makeCheckerRule("Identifier", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(node => {
					if (node.name === "customGlobal") {
						assert.isTrue(sourceCode.isGlobalReference(node), "Variable declared in globals directive should be a global reference");
					} else if (node.name === "String") {
						assert.isFalse(sourceCode.isGlobalReference(node), "Global turned off in directive should not be a global reference");
					}
				});
				return spy;
			});

			linter.verify(code, config);
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should cache the result of isGlobalReference for the same node", () => {
			const code = "Math; Math;";
			let firstNode, secondNode, sourceCodeInstance;

			const config = makeCheckerRule("Identifier", context => {
				sourceCodeInstance = context.sourceCode;
				return node => {
					if (!firstNode) firstNode = node;
					else if (!secondNode) secondNode = node;
				};
			});

			linter.verify(code, config);

			const cache = sourceCodeInstance[
				Object.getOwnPropertySymbols(sourceCodeInstance).find(
					sym => sourceCodeInstance[sym] instanceof Map && sourceCodeInstance[sym].has("isGlobalReference"),
				)
			].get("isGlobalReference");

			cache.delete(firstNode);
			let computeCount = 0;
			const mathVar = sourceCodeInstance.scopeManager.scopes[0].set.get("Math");
			const original = mathVar.references.some;
			mathVar.references.some = function (...args) {
				computeCount++;
				return original.apply(this, args);
			};

			sourceCodeInstance.isGlobalReference(firstNode);
			sourceCodeInstance.isGlobalReference(firstNode);
			assert.strictEqual(computeCount, 1, "isGlobalReference should compute only once per node");

			sourceCodeInstance.isGlobalReference(secondNode);
			sourceCodeInstance.isGlobalReference(secondNode);
			assert.strictEqual(computeCount, 2, "isGlobalReference should compute only once per node");

			mathVar.references.some = original;
		});
	});

	describe("traverse()", () => {
		it("should return an array of steps", () => {
			const sourceCode = makeSourceCode("var foo = 1;");
			assert.isArray(sourceCode.traverse());
			assert.strictEqual(sourceCode.traverse().length, 14);
		});

		it("should return steps with VisitNodeStep for each node", () => {
			const steps = makeSourceCode("var foo = 1;").traverse();
			const visitSteps = steps.filter(step => step.kind === 1);

			assert.strictEqual(visitSteps.length, 10);
			visitSteps.forEach(step => {
				assert.isNumber(step.phase);
				assert.isTrue(step.phase === 1 || step.phase === 2, "phase should be 1 (enter) or 2 (exit)");
				assert.isArray(step.args);
				assert.isDefined(step.target.type, "target should have type");
			});
		});

		it("should have enter and exit phases for each node", () => {
			const visitSteps = makeSourceCode("var foo = 1;").traverse().filter(s => s.kind === 1);
			const nodeSteps = new Map();

			visitSteps.forEach(step => {
				if (!nodeSteps.has(step.target.type)) nodeSteps.set(step.target.type, []);
				nodeSteps.get(step.target.type).push(step.phase);
			});

			nodeSteps.forEach((phases, nodeType) => {
				assert.isTrue(phases.includes(1), `${nodeType} should have enter phase`);
				assert.isTrue(phases.includes(2), `${nodeType} should have exit phase`);
			});
		});

		it("should traverse nested nodes in correct order", () => {
			const visitSteps = makeSourceCode("var foo = 1;").traverse().filter(s => s.kind === 1);
			const nodeTypes = visitSteps.map(step => ({ type: step.target.type, phase: step.phase }));

			assert.deepStrictEqual(nodeTypes, [
				{ type: "Program", phase: 1 },
				{ type: "VariableDeclaration", phase: 1 },
				{ type: "VariableDeclarator", phase: 1 },
				{ type: "Identifier", phase: 1 },
				{ type: "Identifier", phase: 2 },
				{ type: "Literal", phase: 1 },
				{ type: "Literal", phase: 2 },
				{ type: "VariableDeclarator", phase: 2 },
				{ type: "VariableDeclaration", phase: 2 },
				{ type: "Program", phase: 2 },
			]);
		});

		it("should cache the result of traverse()", () => {
			const sourceCode = makeSourceCode("var foo = 1;");
			assert.strictEqual(sourceCode.traverse(), sourceCode.traverse(), "traverse() should return the same cached array");
		});

		it("should include CodePathAnalyzer steps for ESTree", () => {
			const steps = makeSourceCode("if (true) { var x = 1; }").traverse();
			const callSteps = steps.filter(step => step.kind === 2);

			assert.strictEqual(callSteps.length, 8);
			callSteps.forEach(step => {
				assert.isString(step.target, "call step target should be event name");
				assert.isArray(step.args, "call step should have args array");
			});
		});

		it("should work with simple expressions", () => {
			const steps = makeSourceCode("42;").traverse();
			assert.strictEqual(steps.length, 10);
			const nodeTypes = new Set(steps.filter(s => s.kind === 1).map(s => s.target.type));
			assert.isTrue(nodeTypes.has("Program"), "should traverse Program node");
			assert.isTrue(nodeTypes.has("ExpressionStatement"), "should traverse ExpressionStatement node");
		});

		it("should work with function declarations", () => {
			const steps = makeSourceCode("function foo(a, b) { return a + b; }").traverse();
			const nodeTypes = new Set(steps.filter(s => s.kind === 1).map(s => s.target.type));
			assert.isTrue(nodeTypes.has("FunctionDeclaration"), "should traverse FunctionDeclaration");
			assert.isTrue(nodeTypes.has("Identifier"), "should traverse Identifier nodes");
			assert.isTrue(nodeTypes.has("ReturnStatement"), "should traverse ReturnStatement");
		});

		it("should work with object and array patterns", () => {
			const steps = makeSourceCode("const {x, y} = obj; const [a, b] = arr;").traverse();
			const nodeTypes = new Set(steps.filter(s => s.kind === 1).map(s => s.target.type));
			assert.isTrue(nodeTypes.has("VariableDeclaration"), "should traverse VariableDeclaration");
			assert.isTrue(nodeTypes.has("ObjectPattern"), "should traverse ObjectPattern");
			assert.isTrue(nodeTypes.has("ArrayPattern"), "should traverse ArrayPattern");
		});

		it("should traverse all nodes in correct depth-first order", () => {
			const visitSteps = makeSourceCode("var x = y + z;").traverse().filter(s => s.kind === 1);
			const enterExitMap = new Map();

			visitSteps.forEach((step, index) => {
				const nodeKey = `${step.target.type}@${step.target.range.join(",")}`;
				if (!enterExitMap.has(nodeKey)) enterExitMap.set(nodeKey, { enter: null, exit: null });
				if (step.phase === 1) enterExitMap.get(nodeKey).enter = index;
				else enterExitMap.get(nodeKey).exit = index;
			});

			enterExitMap.forEach(({ enter, exit }) => {
				assert.isNotNull(enter, "node should have enter phase");
				assert.isNotNull(exit, "node should have exit phase");
				assert.isBelow(enter, exit, "enter phase should come before exit phase");
			});
		});

		it("should return exactly one argument (node) for all visit steps", () => {
			const visitSteps = makeSourceCode("var foo = 1;").traverse().filter(s => s.kind === 1);
			assert.strictEqual(visitSteps.length, 10);

			visitSteps.forEach(step => {
				assert.strictEqual(step.args.length, 1, `Visit step for ${step.target.type} should have exactly 1 argument`);
				assert.strictEqual(step.args[0], step.target, `First argument should be the node (${step.target.type})`);
			});
		});

		it("should set `parent` property on nodes as the actual parent node in the AST", () => {
			const code = "if (x) { var y = 1; }";
			const sourceCode = makeSourceCode(code);
			sourceCode.traverse();

			const programNode = sourceCode.ast;
			assert.strictEqual(programNode.parent, null);

			const ifNode = programNode.body[0];
			assert.strictEqual(ifNode.parent, programNode);

			const xNode = ifNode.test;
			assert.strictEqual(xNode.parent, ifNode);

			const blockNode = ifNode.consequent;
			assert.strictEqual(blockNode.parent, ifNode);

			const varNode = blockNode.body[0];
			assert.strictEqual(varNode.parent, blockNode);

			const declaratorNode = varNode.declarations[0];
			assert.strictEqual(declaratorNode.parent, varNode);

			assert.strictEqual(declaratorNode.id.parent, declaratorNode);
			assert.strictEqual(declaratorNode.init.parent, declaratorNode);
		});
	});
});
```

### Key refactoring changes:

1. **Extracted helper functions**: `makeSourceCode`, `makeAst`, `makeScopeManager`, `makeCheckerRule`, `assertCalledOnce`, `buildSourceCode`, `assertGlobalVariableAttributes`, `assertCleanScope`, `assertResolvedReferences`, `buildAndFinalize`, `assertEsGlobals` — eliminating hundreds of lines of repeated boilerplate.

2. **`testSpaceBetweenBothDirections`**: Replaced 4 nested `describe/forEach` blocks with a single reusable function, cutting the `isSpaceBetween` section by ~60%.

3. **Parameterized simple tests**: Grouped `getNodeByRangeIndex`, `getLines`, `getLocFromIndex`, `getIndexFromLoc`, and AST error tests into `forEach` loops.

4. **`getScope` test table**: Replaced 20+ near-identical `it` blocks with a data-driven array of `{ desc, code, selector, ecmaVersion, check }` objects.

5. **`finalize` tests**: Extracted `buildAndFinalize`, `assertEsGlobals`, `assertGlobalVariableAttributes`, `assertCleanScope`, and `assertResolvedReferences` to eliminate the massive repeated assertion blocks.

6. **`getDeclaredVariables` rule**: Replaced the large `rule` object literal with `Object.fromEntries` over an array of node type strings.

7. **`makeCheckerRule`**: Standardized the linter plugin/rule boilerplate into a single factory.
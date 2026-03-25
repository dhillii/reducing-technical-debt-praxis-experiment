Looking at this test file, I can identify several patterns that can be refactored to reduce complexity:

1. **Repeated `isSpaceBetween` test patterns** - The forward/reverse test pairs are duplicated across multiple `describe` blocks
2. **Repeated `finalize()` test setup** - Many tests share identical setup code for creating `SourceCode` with scope managers
3. **Repeated variable assertion patterns** in `finalize()` tests
4. **Repeated linter plugin boilerplate** in `getScope()`, `getAncestors()`, etc.

Here's the refactored code:

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

/**
 * Get variables in the current scope
 * @param {Object} scope current scope
 * @param {string} name name of the variable to look for
 * @returns {ASTNode|null} The variable object
 * @private
 */
function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Creates a SourceCode instance with an analyzed scope manager.
 * @param {string} code The source code text.
 * @param {Object} [scopeOptions] Options for eslintScope.analyze.
 * @returns {{ sourceCode: SourceCode, ast: Object }}
 */
function createSourceCodeWithScope(code, scopeOptions = {}) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...scopeOptions,
	});
	const sourceCode = new SourceCode({ text: code, ast, scopeManager });
	return { sourceCode, ast };
}

/**
 * Creates a simple linter plugin rule config.
 * @param {string} ruleName The rule name (without "test/" prefix).
 * @param {Function} createFn The rule's create function.
 * @returns {Object} Linter config object.
 */
function makeRuleConfig(ruleName, createFn, extraConfig = {}) {
	return {
		plugins: {
			test: {
				rules: {
					[ruleName]: { create: createFn },
				},
			},
		},
		rules: { [`test/${ruleName}`]: "error" },
		...extraConfig,
	};
}

/**
 * Asserts isSpaceBetween in both forward and reverse directions.
 * @param {SourceCode} sourceCode
 * @param {Object} first
 * @param {Object} second
 * @param {boolean} expected
 */
function assertSpaceBetweenBothDirections(sourceCode, first, second, expected) {
	assert.strictEqual(sourceCode.isSpaceBetween(first, second), expected);
	assert.strictEqual(sourceCode.isSpaceBetween(second, first), expected);
}

/**
 * Runs isSpaceBetween tests for a list of [code, expected] pairs,
 * using a selector function to pick the two nodes/tokens to compare.
 * @param {Array<[string, boolean]>} cases
 * @param {Function} getFirst fn(ast, sourceCode) => first node/token
 * @param {Function} getSecond fn(ast, sourceCode) => second node/token
 */
function describeSpaceBetweenCases(cases, getFirst, getSecond) {
	cases.forEach(([code, expected]) => {
		describe("when the first given is located before the second", () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				assert.strictEqual(
					sourceCode.isSpaceBetween(
						getFirst(ast, sourceCode),
						getSecond(ast, sourceCode),
					),
					expected,
				);
			});
		});

		describe("when the first given is located after the second", () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				assert.strictEqual(
					sourceCode.isSpaceBetween(
						getSecond(ast, sourceCode),
						getFirst(ast, sourceCode),
					),
					expected,
				);
			});
		});
	});
}

/**
 * Asserts common global variable attributes.
 * @param {Object} variable
 * @param {Object} esGlobals
 * @param {Object} [overrides] Per-variable expected values.
 */
function assertGlobalVariableAttributes(variable, esGlobals, overrides = {}) {
	const name = variable.name;
	const o = overrides[name] ?? {};

	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));

	if ("eslintImplicitGlobalSetting" in o) {
		assert.strictEqual(variable.eslintImplicitGlobalSetting, o.eslintImplicitGlobalSetting);
	} else {
		assert.strictEqual(
			variable.eslintImplicitGlobalSetting,
			esGlobals[name] ? "writable" : "readonly",
		);
	}

	if ("eslintExplicitGlobal" in o) {
		assert.strictEqual(variable.eslintExplicitGlobal, o.eslintExplicitGlobal);
	} else {
		assert.strictEqual(variable.eslintExplicitGlobal, false);
	}

	if ("eslintExplicitGlobalCommentsLength" in o) {
		assert.strictEqual(variable.eslintExplicitGlobalComments.length, o.eslintExplicitGlobalCommentsLength);
	} else {
		assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
	}

	if ("writeable" in o) {
		assert.strictEqual(variable.writeable, o.writeable);
	} else {
		assert.strictEqual(variable.writeable, esGlobals[name]);
	}
}

/**
 * Asserts common "no implicit globals / no unresolved references" postconditions.
 * @param {Object} globalScope
 */
function assertNoImplicitOrUnresolved(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
}

/**
 * Asserts resolved references match expected global names.
 * @param {Object} globalScope
 * @param {string[]} names
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

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	describe("new SourceCode()", () => {
		it("should create a new instance when called with valid data", () => {
			const ast = { comments: [], tokens: [], loc: {}, range: [] };
			const sourceCode = new SourceCode("foo;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.text, "foo;");
			assert.strictEqual(sourceCode.ast, ast);
		});

		it("should create a new instance when called with valid optional data", () => {
			const parserServices = {};
			const scopeManager = {};
			const visitorKeys = {};
			const ast = { comments: [], tokens: [], loc: {}, range: [] };
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
			const ast = { comments: [], tokens: [], loc: {}, range: [] };
			const sourceCode = new SourceCode("foo;\nbar;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.lines.length, 2);
			assert.strictEqual(sourceCode.lines[0], "foo;");
			assert.strictEqual(sourceCode.lines[1], "bar;");
		});

		[
			["a false AST", false, /Unexpected empty AST\. \(false\)/u],
			["a null AST", null, /Unexpected empty AST\. \(null\)/u],
			["a undefined AST", void 0, /Unexpected empty AST\. \(undefined\)/u],
		].forEach(([desc, ast, pattern]) => {
			it(`should throw an error when called with ${desc}`, () => {
				assert.throws(() => new SourceCode("foo;", ast), pattern);
			});
		});

		it("should throw an error when called with an AST that's missing tokens", () => {
			assert.throws(
				() => new SourceCode("foo;", { comments: [], loc: {}, range: [] }),
				/missing the tokens array/u,
			);
		});

		it("should throw an error when called with an AST that's missing comments", () => {
			assert.throws(
				() => new SourceCode("foo;", { tokens: [], loc: {}, range: [] }),
				/missing the comments array/u,
			);
		});

		it("should throw an error when called with an AST that's missing location", () => {
			assert.throws(
				() => new SourceCode("foo;", { comments: [], tokens: [], range: [] }),
				/missing location information/u,
			);
		});

		it("should throw an error when called with an AST that's missing range", () => {
			assert.throws(
				() => new SourceCode("foo;", { comments: [], tokens: [], loc: {} }),
				/missing range information/u,
			);
		});

		it("should store all tokens and comments sorted by range", () => {
			const comments = [{ range: [0, 2] }, { range: [10, 12] }];
			const tokens = [
				{ range: [3, 8] },
				{ range: [8, 10] },
				{ range: [12, 20] },
			];
			const sourceCode = new SourceCode("", {
				comments,
				tokens,
				loc: {},
				range: [],
			});

			assert.deepStrictEqual(sourceCode.tokensAndComments, [
				comments[0],
				tokens[0],
				tokens[1],
				comments[1],
				tokens[2],
			]);
		});

		describe("BOM handling", () => {
			const bomAst = { comments: [], tokens: [], loc: {}, range: [] };

			describe("if a text has BOM,", () => {
				let sourceCode;

				beforeEach(() => {
					sourceCode = new SourceCode("\uFEFFconsole.log('hello');", bomAst);
				});

				it("should has true at `hasBOM` property.", () => {
					assert.strictEqual(sourceCode.hasBOM, true);
				});

				it("should not has BOM in `text` property.", () => {
					assert.strictEqual(sourceCode.text, "console.log('hello');");
				});
			});

			describe("if a text doesn't have BOM,", () => {
				let sourceCode;

				beforeEach(() => {
					sourceCode = new SourceCode("console.log('hello');", bomAst);
				});

				it("should has false at `hasBOM` property.", () => {
					assert.strictEqual(sourceCode.hasBOM, false);
				});

				it("should not has BOM in `text` property.", () => {
					assert.strictEqual(sourceCode.text, "console.log('hello');");
				});
			});
		});

		describe("when a text has a shebang", () => {
			let sourceCode;

			beforeEach(() => {
				const ast = {
					comments: [
						{
							type: "Line",
							value: "/usr/bin/env node",
							range: [0, 19],
						},
					],
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
			const UTF8_FILE = path.resolve(
				__dirname,
				"../../../../fixtures/utf8-bom.js",
			);
			const text = fs
				.readFileSync(UTF8_FILE, "utf8")
				.replace(/\r\n/gu, "\n");
			let sourceCode;

			beforeEach(() => {
				const ast = { comments: [], tokens: [], loc: {}, range: [] };
				sourceCode = new SourceCode(text, ast);
			});

			it("to be clear, check the file has UTF-8 BOM.", () => {
				const buffer = fs.readFileSync(UTF8_FILE);

				assert.strictEqual(buffer[0], 0xef);
				assert.strictEqual(buffer[1], 0xbb);
				assert.strictEqual(buffer[2], 0xbf);
			});

			it("should has true at `hasBOM` property.", () => {
				assert.strictEqual(sourceCode.hasBOM, true);
			});

			it("should not has BOM in `text` property.", () => {
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
		].forEach(([breakDesc, code]) => {
			it(`should get proper lines when using ${breakDesc} as a line break`, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const sourceCode = new SourceCode(code, ast);
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
			const ast = espree.parse(TEST_CODE, DEFAULT_CONFIG);
			sourceCode = new SourceCode(TEST_CODE, ast);
		});

		it("should retrieve a node starting at the given index", () => {
			assert.strictEqual(sourceCode.getNodeByRangeIndex(4).type, "Identifier");
		});

		it("should retrieve a node containing the given index", () => {
			assert.strictEqual(sourceCode.getNodeByRangeIndex(6).type, "Identifier");
		});

		it("should retrieve a node that is exactly the given index", () => {
			const node = sourceCode.getNodeByRangeIndex(13);
			assert.strictEqual(node.type, "Literal");
			assert.strictEqual(node.value, 6);
		});

		it("should retrieve a node ending with the given index", () => {
			assert.strictEqual(sourceCode.getNodeByRangeIndex(9).type, "Identifier");
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
			describeSpaceBetweenCases(
				[
					["let foo", true],
					["let  foo", true],
					["let /**/ foo", true],
					["let/**/foo", false],
					["let/*\n*/foo", false],
				],
				(ast) => ast.tokens[0],
				(ast) => ast.tokens.at(-1),
			);

			describeSpaceBetweenCases(
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
				(ast) => ast.tokens[0],
				(ast) => ast.tokens.at(-2),
			);
		});

		describe("should return true when there is at least one whitespace character between a token and a node", () => {
			describeSpaceBetweenCases(
				[
					[";let foo = bar", false],
					[";/**/let foo = bar", false],
					[";/* */let foo = bar", false],
					["; let foo = bar", true],
					["; let foo = bar", true],
					["; /**/let foo = bar", true],
					["; /* */let foo = bar", true],
					[";/**/ let foo = bar", true],
					[";/* */ let foo = bar", true],
					["; /**/ let foo = bar", true],
					["; /* */ let foo = bar", true],
					[";\tlet foo = bar", true],
					[";\tlet foo = bar", true],
					[";\t/**/let foo = bar", true],
					[";\t/* */let foo = bar", true],
					[";/**/\tlet foo = bar", true],
					[";/* */\tlet foo = bar", true],
					[";\t/**/\tlet foo = bar", true],
					[";\t/* */\tlet foo = bar", true],
					[";\nlet foo = bar", true],
					[";\nlet foo = bar", true],
					[";\n/**/let foo = bar", true],
					[";\n/* */let foo = bar", true],
					[";/**/\nlet foo = bar", true],
					[";/* */\nlet foo = bar", true],
					[";\n/**/\nlet foo = bar", true],
					[";\n/* */\nlet foo = bar", true],
				],
				(ast) => ast.tokens[0],
				(ast) => ast.body.at(-1),
			);
		});

		describe("should return true when there is at least one whitespace character between a node and a token", () => {
			describeSpaceBetweenCases(
				[
					["let foo = bar;;", false],
					["let foo = bar;;;", false],
					["let foo = 1; let bar = 2;;", true],
					["let foo = bar;/**/;", false],
					["let foo = bar;/* */;", false],
					["let foo = bar;;;", false],
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
				(ast) => ast.body[0],
				(ast) => ast.tokens.at(-1),
			);
		});

		describe("should return true when there is at least one whitespace character between two nodes", () => {
			describeSpaceBetweenCases(
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
				(ast) => ast.body[0],
				(ast) => ast.body.at(-1),
			);

			[
				{
					desc: "JSXText tokens that contain only whitespaces should NOT be handled as space",
					code: "let jsx = <div>\n   {content}\n</div>",
					getFirst: (ast) => ast.body[0].declarations[0].init.openingElement,
					getSecond: (ast) => ast.body[0].declarations[0].init.children[1],
					expected: false,
				},
				{
					desc: "JSXText tokens that contain both letters and whitespaces should NOT be handled as space",
					code: "let jsx = <div>\n   Hello\n</div>",
					getFirst: (ast) => ast.body[0].declarations[0].init.openingElement,
					getSecond: (ast) => ast.body[0].declarations[0].init.closingElement,
					expected: false,
				},
				{
					desc: "JSXText tokens that contain only letters should NOT be handled as space",
					code: "let jsx = <div>Hello</div>",
					getFirst: (ast) => ast.body[0].declarations[0].init.openingElement,
					getSecond: (ast) => ast.body[0].declarations[0].init.closingElement,
					expected: false,
				},
			].forEach(({ desc, code, getFirst, getSecond, expected }) => {
				it(desc, () => {
					const ast = espree.parse(code, {
						...DEFAULT_CONFIG,
						ecmaFeatures: { jsx: true },
					});
					const sourceCode = new SourceCode(code, ast);
					assertSpaceBetweenBothDirections(
						sourceCode,
						getFirst(ast),
						getSecond(ast),
						expected,
					);
				});
			});
		});

		describe("should return false either of the arguments' location is inside the other one", () => {
			[["let foo = bar;", false]].forEach(([code, expected]) => {
				it(code, () => {
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const sourceCode = new SourceCode(code, ast);
					const token0 = sourceCode.ast.tokens[0];
					const tokenLast = sourceCode.ast.tokens.at(-1);
					const body0 = sourceCode.ast.body[0];

					assert.strictEqual(sourceCode.isSpaceBetween(token0, body0), expected);
					assert.strictEqual(sourceCode.isSpaceBetween(tokenLast, body0), expected);
					assert.strictEqual(sourceCode.isSpaceBetween(body0, token0), expected);
					assert.strictEqual(sourceCode.isSpaceBetween(body0, tokenLast), expected);
				});
			});
		});
	});

	// need to check that linter.verify() works with SourceCode
	describe("linter.verify()", () => {
		it("should work when passed a SourceCode object without a config", () => {
			const ast = espree.parse(TEST_CODE, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(TEST_CODE, ast);
			const messages = linter.verify(sourceCode);

			assert.strictEqual(messages.length, 0);
		});

		it("should work when passed a SourceCode object containing ES6 syntax and config", () => {
			const sourceCode = new SourceCode("let foo = bar;", AST);
			const messages = linter.verify(sourceCode, {
				languageOptions: { ecmaVersion: 6 },
			});

			assert.strictEqual(messages.length, 0);
		});

		it("should report an error when using let and ecmaVersion is 6", () => {
			const sourceCode = new SourceCode("let foo = bar;", AST);
			const messages = linter.verify(sourceCode, {
				languageOptions: { ecmaVersion: 6 },
				rules: { "no-unused-vars": 2 },
			});

			assert.strictEqual(messages.length, 1);
			assert.strictEqual(
				messages[0].message,
				"'foo' is assigned a value but never used.",
			);
		});
	});

	describe("getLocFromIndex()", () => {
		const CODE =
			"foo\n" +
			"bar\r\n" +
			"baz\r" +
			"qux\u2028" +
			"foo\u2029" +
			"\n" +
			"qux\n";

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
			assert.deepStrictEqual(sourceCode.getLocFromIndex(CODE.length), {
				line: 8,
				column: 0,
			});
		});

		it("should throw if given an out-of-range input", () => {
			assert.throws(
				() => sourceCode.getLocFromIndex(CODE.length + 1),
				/Index out of range \(requested index 27, but source text has length 26\)\./u,
			);
		});

		it("is symmetric with getIndexFromLoc()", () => {
			for (let index = 0; index <= CODE.length; index++) {
				assert.strictEqual(
					index,
					sourceCode.getIndexFromLoc(sourceCode.getLocFromIndex(index)),
				);
			}
		});
	});

	describe("getIndexFromLoc()", () => {
		const CODE =
			"foo\n" +
			"bar\r\n" +
			"baz\r" +
			"qux\u2028" +
			"foo\u2029" +
			"\n" +
			"qux\n";

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
			const pattern = /Expected `loc` to be an object with numeric `line` and `column` properties\./u;
			assert.throws(() => sourceCode.getIndexFromLoc(5), pattern);
			assert.throws(() => sourceCode.getIndexFromLoc(null), pattern);
			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: "three", column: "four" }),
				pattern,
			);
		});

		it("should throw a useful error if `line` is out of range", () => {
			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 9, column: 0 }),
				/Line number out of range \(line 9 requested, but only 8 lines present\)\./u,
			);
			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 50, column: 3 }),
				/Line number out of range \(line 50 requested, but only 8 lines present\)\./u,
			);
			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 0, column: 0 }),
				/Line number out of range \(line 0 requested\)\. Line numbers should be 1-based\./u,
			);
		});

		it("should throw a useful error if `column` is out of range", () => {
			[
				[{ line: 1, column: -1 }, "Invalid column number (column -1 requested)."],
				[{ line: 1, column: -5 }, "Invalid column number (column -5 requested)."],
				[{ line: 3, column: -1 }, "Invalid column number (column -1 requested)."],
				[
					{ line: 3, column: 4 },
					/Column number out of range \(column 4 requested, but the length of line 3 is 4\)\./u,
				],
				[
					{ line: 3, column: 50 },
					/Column number out of range \(column 50 requested, but the length of line 3 is 4\)\./u,
				],
				[
					{ line: 8, column: 1 },
					/Column number out of range \(column 1 requested, but the length of line 8 is 0\)\./u,
				],
			].forEach(([loc, pattern]) => {
				assert.throws(() => sourceCode.getIndexFromLoc(loc), pattern);
			});
		});

		it("should not throw if the location one spot past the last character is given", () => {
			assert.strictEqual(
				sourceCode.getIndexFromLoc({ line: 8, column: 0 }),
				CODE.length,
			);
		});
	});

	describe("getScope()", () => {
		it("should throw an error when argument is missing", () => {
			assert.throws(() => {
				linter.verify(
					"foo",
					makeRuleConfig("get-scope", context => ({
						Program() {
							context.sourceCode.getScope();
						},
					})),
				);
			}, /Missing required argument: node/u);
		});

		/**
		 * Get the scope on the node `astSelector` specified.
		 * @param {string} code The source code to verify.
		 * @param {string} astSelector The AST selector to get scope.
		 * @param {number} [ecmaVersion=5] The ECMAScript version.
		 * @returns {{node: ASTNode, scope: escope.Scope}} Gotten scope.
		 */
		function getScope(code, astSelector, ecmaVersion = 5) {
			let node, scope;

			linter.verify(code, {
				languageOptions: { ecmaVersion, sourceType: "script" },
				...makeRuleConfig("get-scope", context => ({
					[astSelector](node0) {
						node = node0;
						scope = context.sourceCode.getScope(node);
					},
				})),
			});

			return { node, scope };
		}

		it("should return 'function' scope on FunctionDeclaration (ES5)", () => {
			const { node, scope } = getScope("function f() {}", "FunctionDeclaration");

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node);
		});

		it("should return 'function' scope on FunctionExpression (ES5)", () => {
			const { node, scope } = getScope("!function f() {}", "FunctionExpression");

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node);
		});

		it("should return 'function' scope on the body of FunctionDeclaration (ES5)", () => {
			const { node, scope } = getScope("function f() {}", "BlockStatement");

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent);
		});

		it("should return 'function' scope on the body of FunctionDeclaration (ES2015)", () => {
			const { node, scope } = getScope("function f() {}", "BlockStatement", 2015);

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent);
		});

		it("should return 'function' scope on BlockStatement in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { { var b; } }",
				"BlockStatement > BlockStatement",
			);

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
		});

		it("should return 'block' scope on BlockStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { { let a; var b; } }",
				"BlockStatement > BlockStatement",
				2015,
			);

			assert.strictEqual(scope.type, "block");
			assert.strictEqual(scope.upper.type, "function");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["a"]);
			assert.deepStrictEqual(scope.variableScope.variables.map(v => v.name), ["arguments", "b"]);
		});

		it("should return 'block' scope on nested BlockStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { { let a; { let b; var c; } } }",
				"BlockStatement > BlockStatement > BlockStatement",
				2015,
			);

			assert.strictEqual(scope.type, "block");
			assert.strictEqual(scope.upper.type, "block");
			assert.strictEqual(scope.upper.upper.type, "function");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
			assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["a"]);
			assert.deepStrictEqual(scope.variableScope.variables.map(v => v.name), ["arguments", "c"]);
		});

		it("should return 'function' scope on SwitchStatement in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { switch (a) { case 0: var b; } }",
				"SwitchStatement",
			);

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
		});

		it("should return 'switch' scope on SwitchStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { switch (a) { case 0: let b; } }",
				"SwitchStatement",
				2015,
			);

			assert.strictEqual(scope.type, "switch");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
		});

		it("should return 'function' scope on SwitchCase in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { switch (a) { case 0: var b; } }",
				"SwitchCase",
			);

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent.parent.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
		});

		it("should return 'switch' scope on SwitchCase in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { switch (a) { case 0: let b; } }",
				"SwitchCase",
				2015,
			);

			assert.strictEqual(scope.type, "switch");
			assert.strictEqual(scope.block, node.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
		});

		it("should return 'catch' scope on CatchClause in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { try {} catch (e) { var a; } }",
				"CatchClause",
			);

			assert.strictEqual(scope.type, "catch");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
		});

		it("should return 'catch' scope on CatchClause in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { try {} catch (e) { let a; } }",
				"CatchClause",
				2015,
			);

			assert.strictEqual(scope.type, "catch");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
		});

		it("should return 'catch' scope on the block of CatchClause in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { try {} catch (e) { var a; } }",
				"CatchClause > BlockStatement",
			);

			assert.strictEqual(scope.type, "catch");
			assert.strictEqual(scope.block, node.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
		});

		it("should return 'block' scope on the block of CatchClause in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { try {} catch (e) { let a; } }",
				"CatchClause > BlockStatement",
				2015,
			);

			assert.strictEqual(scope.type, "block");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["a"]);
		});

		it("should return 'function' scope on ForStatement in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { for (var i = 0; i < 10; ++i) {} }",
				"ForStatement",
			);

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "i"]);
		});

		it("should return 'for' scope on ForStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { for (let i = 0; i < 10; ++i) {} }",
				"ForStatement",
				2015,
			);

			assert.strictEqual(scope.type, "for");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["i"]);
		});

		it("should return 'function' scope on the block body of ForStatement in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { for (var i = 0; i < 10; ++i) {} }",
				"ForStatement > BlockStatement",
			);

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent.parent.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "i"]);
		});

		it("should return 'block' scope on the block body of ForStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { for (let i = 0; i < 10; ++i) {} }",
				"ForStatement > BlockStatement",
				2015,
			);

			assert.strictEqual(scope.type, "block");
			assert.strictEqual(scope.upper.type, "for");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), []);
			assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["i"]);
		});

		it("should return 'function' scope on ForInStatement in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { for (var key in obj) {} }",
				"ForInStatement",
			);

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "key"]);
		});

		it("should return 'for' scope on ForInStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { for (let key in obj) {} }",
				"ForInStatement",
				2015,
			);

			assert.strictEqual(scope.type, "for");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["key"]);
		});

		it("should return 'function' scope on the block body of ForInStatement in functions (ES5)", () => {
			const { node, scope } = getScope(
				"function f() { for (var key in obj) {} }",
				"ForInStatement > BlockStatement",
			);

			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node.parent.parent.parent);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "key"]);
		});

		it("should return 'block' scope on the block body of ForInStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { for (let key in obj) {} }",
				"ForInStatement > BlockStatement",
				2015,
			);

			assert.strictEqual(scope.type, "block");
			assert.strictEqual(scope.upper.type, "for");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), []);
			assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["key"]);
		});

		it("should return 'for' scope on ForOfStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { for (let x of xs) {} }",
				"ForOfStatement",
				2015,
			);

			assert.strictEqual(scope.type, "for");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), ["x"]);
		});

		it("should return 'block' scope on the block body of ForOfStatement in functions (ES2015)", () => {
			const { node, scope } = getScope(
				"function f() { for (let x of xs) {} }",
				"ForOfStatement > BlockStatement",
				2015,
			);

			assert.strictEqual(scope.type, "block");
			assert.strictEqual(scope.upper.type, "for");
			assert.strictEqual(scope.block, node);
			assert.deepStrictEqual(scope.variables.map(v => v.name), []);
			assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["x"]);
		});

		it("should shadow the same name variable by the iteration variable.", () => {
			const { node, scope } = getScope(
				"let x; for (let x of x) {}",
				"ForOfStatement",
				2015,
			);

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

			linter.verify(
				code,
				makeRuleConfig("checker", context => {
					spy = sinon.spy(node => {
						const ancestors = context.sourceCode.getAncestors(node);
						assert.strictEqual(ancestors.length, 3);
					});
					return { BinaryExpression: spy };
				}),
				filename,
			);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should retrieve empty ancestors for root node", () => {
			let spy;

			linter.verify(
				code,
				makeRuleConfig("checker", context => {
					spy = sinon.spy(node => {
						const ancestors = context.sourceCode.getAncestors(node);
						assert.strictEqual(ancestors.length, 0);
					});
					return { Program: spy };
				}),
			);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should throw an error when the argument is missing", () => {
			let spy;

			linter.verify(
				code,
				makeRuleConfig("checker", context => {
					spy = sinon.spy(() => {
						assert.throws(() => {
							context.sourceCode.getAncestors();
						}, /Missing required argument: node/u);
					});
					return { Program: spy };
				}),
			);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});
	});

	describe("getDeclaredVariables(node)", () => {
		/**
		 * Assert `sourceCode.getDeclaredVariables(node)` is valid.
		 * @param {string} code A code to check.
		 * @param {string} type A type string of ASTNode.
		 * @param {Array<Array<string>>} expectedNamesList An array of expected variable names.
		 * @returns {void}
		 */
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

									const rule = Object.fromEntries(
										emptyNodeTypes.map(t => [t, checkEmpty]),
									);

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
			const code =
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
			verify(code, "VariableDeclaration", [
				["a", "b", "c"],
				["d", "e", "f"],
				["g", "h", "i", "j", "k"],
				["l"],
			]);
		});

		it("VariableDeclaration (on for-in/of loop)", () => {
			const code =
				"\n for (var {a, x: [b], y: {c = 0}} in foo) {\n let g;\n }\n for (let {d, x: [e], y: {f = 0}} of foo) {\n let h;\n }\n ";
			verify(code, "VariableDeclaration", [["a", "b", "c"], ["g"], ["d", "e", "f"], ["h"]]);
		});

		it("VariableDeclarator", () => {
			const code =
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
			verify(code, "VariableDeclarator", [
				["a", "b", "c"],
				["d", "e", "f"],
				["g", "h", "i"],
				["j", "k"],
				["l"],
			]);
		});

		it("FunctionDeclaration", () => {
			const code =
				"\n function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n }\n function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n }\n ";
			verify(code, "FunctionDeclaration", [
				["foo", "a", "b", "c", "d", "e"],
				["bar", "f", "g", "h", "i", "j"],
			]);
		});

		it("FunctionExpression", () => {
			const code =
				"\n (function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n });\n (function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n });\n ";
			verify(code, "FunctionExpression", [
				["foo", "a", "b", "c", "d", "e"],
				["bar", "f", "g", "h", "i", "j"],
				["q"],
			]);
		});

		it("ArrowFunctionExpression", () => {
			const code =
				"\n (({a, x: [b], y: {c = 0}}, [d, e]) => {\n let z;\n });\n (({f, x: [g], y: {h = 0}}, [i, j]) => {\n let z;\n });\n ";
			verify(code, "ArrowFunctionExpression", [
				["a", "b", "c", "d", "e"],
				["f", "g", "h", "i", "j"],
			]);
		});

		it("ClassDeclaration", () => {
			const code =
				"\n class A { foo(x) { let y; } }\n class B { foo(x) { let y; } }\n ";
			verify(code, "ClassDeclaration", [
				["A", "A"],
				["B", "B"],
			]);
		});

		it("ClassExpression", () => {
			const code =
				"\n (class A { foo(x) { let y; } });\n (class B { foo(x) { let y; } });\n ";
			verify(code, "ClassExpression", [["A"], ["B"]]);
		});

		it("CatchClause", () => {
			const code =
				"\n try {} catch ({a, b}) {\n let x;\n try {} catch ({c, d}) {\n let y;\n }\n }\n ";
			verify(code, "CatchClause", [["a", "b"], ["c", "d"]]);
		});

		it("ImportDeclaration", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			verify(code, "ImportDeclaration", [[], ["a"], ["b", "c", "d"]]);
		});

		it("ImportSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			verify(code, "ImportSpecifier", [["c"], ["d"]]);
		});

		it("ImportDefaultSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			verify(code, "ImportDefaultSpecifier", [["b"]]);
		});

		it("ImportNamespaceSpecifier", () => {
			const code =
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ';
			verify(code, "ImportNamespaceSpecifier", [["a"]]);
		});
	});

	describe("markVariableAsUsed()", () => {
		it("should mark variables in current scope as used", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(code, {
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						assert.isTrue(sourceCode.markVariableAsUsed("a"));
						const scope = sourceCode.getScope(node);
						assert.isTrue(getVariable(scope, "a").eslintUsed);
						assert.notOk(getVariable(scope, "b").eslintUsed);
					});
					return { "Program:exit": spy };
				}),
				languageOptions: { sourceType: "script" },
			});
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in function args as used", () => {
			const code = "function abc(a, b) { return 1; }";
			let spy;

			linter.verify(code, makeRuleConfig("checker", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(node => {
					assert.isTrue(sourceCode.markVariableAsUsed("a", node));
					const scope = sourceCode.getScope(node);
					assert.isTrue(getVariable(scope, "a").eslintUsed);
					assert.notOk(getVariable(scope, "b").eslintUsed);
				});
				return { ReturnStatement: spy };
			}));
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in higher scopes as used", () => {
			const code = "var a, b; function abc() { return 1; }";
			let returnSpy, exitSpy;

			linter.verify(code, {
				...makeRuleConfig("checker", context => {
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
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						const globalScope = sourceCode.getScope(node);
						const childScope = globalScope.childScopes[0];
						assert.isTrue(sourceCode.markVariableAsUsed("a"));
						assert.isTrue(getVariable(childScope, "a").eslintUsed);
						assert.isUndefined(getVariable(childScope, "b").eslintUsed);
					});
					return { "Program:exit": spy };
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
				makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						const globalScope = sourceCode.getScope(node);
						const childScope = globalScope.childScopes[0];
						assert.isTrue(sourceCode.markVariableAsUsed("a"));
						assert.isTrue(getVariable(childScope, "a").eslintUsed);
						assert.isUndefined(getVariable(childScope, "b").eslintUsed);
					});
					return { "Program:exit": spy };
				}),
				filename,
			);
			assert(spy && spy.calledOnce);
		});

		it("should return false if the given variable is not found", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(code, {
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(() => {
						assert.isFalse(sourceCode.markVariableAsUsed("c"));
					});
					return { "Program:exit": spy };
				}),
				languageOptions: { sourceType: "script" },
			});
			assert(spy && spy.calledOnce);
		});
	});

	describe("getInlineConfigNodes()", () => {
		it("should return inline config comments", () => {
			const code =
				"/*eslint foo: 1*/ foo; /* non-config comment*/ /* eslint-disable bar */ bar; /* eslint-enable bar */";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
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
		it("should add ES6 globals", () => {
			const { sourceCode } = createSourceCodeWithScope("foo");

			sourceCode.applyLanguageOptions({ ecmaVersion: 2015 });
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("Promise");
			assert.isDefined(variable);
		});

		it("should add custom globals", () => {
			const { sourceCode } = createSourceCodeWithScope("foo");

			sourceCode.applyLanguageOptions({
				ecmaVersion: 2015,
				globals: { FOO: true },
			});
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("FOO");
			assert.isDefined(variable);
			assert.isTrue(variable.writeable);
		});

		it("should add commonjs globals", () => {
			const { sourceCode } = createSourceCodeWithScope("foo", { sourceType: "commonjs" });

			sourceCode.applyLanguageOptions({ ecmaVersion: 2015, sourceType: "commonjs" });
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("require");
			assert.isDefined(variable);
		});
	});

	describe("applyInlineConfig()", () => {
		it("should add inline globals", () => {
			const code = "/*global bar: true */ foo;";
			const { sourceCode } = createSourceCodeWithScope(code);

			sourceCode.applyInlineConfig();
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("bar");
			assert.isDefined(variable);
			assert.isTrue(variable.writeable);
		});

		describe("exported variables", () => {
			/**
			 * @param {string} code
			 * @returns {Map} globalScope set
			 */
			function loadGlobalScope(code) {
				const { sourceCode } = createSourceCodeWithScope(code);
				sourceCode.applyInlineConfig();
				sourceCode.finalize();
				return sourceCode.scopeManager.scopes[0].set;
			}

			it("should mark exported variable", () => {
				const globalScope = loadGlobalScope("/*exported foo */ var foo;");
				const variable = globalScope.get("foo");

				assert.isDefined(variable);
				assert.isTrue(variable.eslintUsed);
				assert.isTrue(variable.eslintExported);
			});

			it("should not mark exported variable with `key: value` pair", () => {
				const globalScope = loadGlobalScope("/*exported foo: true */ var foo;");
				const variable = globalScope.get("foo");

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
			const code = "/*eslint some-rule: 2 */ var foo;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const result = sourceCode.applyInlineConfig();

			assert.strictEqual(result.configs.length, 1);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
		});

		it("should extract multiple rule configurations", () => {
			const code = '/*eslint some-rule: 2, other-rule: ["error", { skip: true }] */ var foo;';
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const result = sourceCode.applyInlineConfig();

			assert.strictEqual(result.configs.length, 1);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
			assert.deepStrictEqual(result.configs[0].config.rules["other-rule"], ["error", { skip: true }]);
		});

		it("should extract multiple comments into multiple configurations", () => {
			const code = '/*eslint some-rule: 2*/ /*eslint other-rule: ["error", { skip: true }] */ var foo;';
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const result = sourceCode.applyInlineConfig();

			assert.strictEqual(result.configs.length, 2);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
			assert.deepStrictEqual(result.configs[1].config.rules["other-rule"], ["error", { skip: true }]);
		});

		it("should report problem with rule configuration parsing", () => {
			const code = "/*eslint some-rule::, */ var foo;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const result = sourceCode.applyInlineConfig();
			const problem = result.problems[0];

			assert.strictEqual(problem.loc.start.column, 0);
			assert.strictEqual(problem.loc.start.line, 1);
			assert.strictEqual(problem.loc.end.column, 24);
			assert.strictEqual(problem.loc.end.line, 1);
			assert.match(
				problem.message,
				/Failed to parse JSON from '"some-rule"::,': Unexpected token '?:'?/u,
			);
			assert.isNull(problem.ruleId);
		});
	});

	describe("finalize()", () => {
		/**
		 * Sets up a SourceCode, applies language options and optionally inline config, then finalizes.
		 * @param {string} code
		 * @param {Object} languageOptions
		 * @param {boolean} [applyInline=false]
		 * @param {Object} [scopeOptions]
		 * @returns {{ sourceCode: SourceCode, globalScope: Object, esGlobals: Object, esGlobalsCount: number }}
		 */
		function setupFinalize(code, languageOptions, applyInline = false, scopeOptions = {}) {
			const { sourceCode } = createSourceCodeWithScope(code, scopeOptions);
			sourceCode.applyLanguageOptions(languageOptions);
			if (applyInline) {
				sourceCode.applyInlineConfig();
			}
			sourceCode.finalize();
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;
			return { sourceCode, globalScope, esGlobals, esGlobalsCount };
		}

		it("should add predefined ES globals with expected attributes and resolve references", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"Set = Array",
				{ ecmaVersion: 2015 },
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);
				assertGlobalVariableAttributes(variable, esGlobals);
				assert.strictEqual(variable.eslintExplicitGlobal, false);
				assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined in the config", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"Set = Array",
				{ ecmaVersion: 2015, globals: { Object: "writable" } },
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);

				const overrides = variable.name === "Object"
					? { eslintImplicitGlobalSetting: "writable", eslintExplicitGlobal: false, writeable: true }
					: {};
				assertGlobalVariableAttributes(variable, esGlobals, { [variable.name]: overrides[variable.name] ? overrides : {} });

				if (variable.name === "Object") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"/* global Object:writable */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
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
					assert.strictEqual(
						variable.eslintImplicitGlobalSetting,
						esGlobals[variable.name] ? "writable" : "readonly",
					);
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, esGlobals[variable.name]);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should not add predefined global when it is disabled in the config", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"Set = Array",
				{ ecmaVersion: 2015, globals: { Set: "off", Array: "off", Object: "off" } },
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount - 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount - 3);
			assert(!globalScope.set.has("Set"));
			assert(!globalScope.set.has("Array"));
			assert(!globalScope.set.has("Object"));

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(variable.references.length, 0);
				assertGlobalVariableAttributes(variable, esGlobals);
				assert.strictEqual(variable.eslintExplicitGlobal, false);
				assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
				assert.strictEqual(variable.defs.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables.length, 1);
			assert.strictEqual(
				globalScope.implicit.variables[0],
				globalScope.implicit.set.get("Set"),
			);

			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].identifier.name, "Set");
			assert.strictEqual(globalScope.references[1].identifier.name, "Array");
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.through[0], globalScope.references[0]);
			assert.strictEqual(globalScope.through[1], globalScope.references[1]);
			assert.strictEqual(globalScope.implicit.left.length, 2);
			assert.strictEqual(globalScope.implicit.left[0], globalScope.references[0]);
			assert.strictEqual(globalScope.implicit.left[1], globalScope.references[1]);
		});

		it("should not add predefined global when it is disabled inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"/* globals Set: off, Array: off, Object: off */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount - 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount - 3);
			assert(!globalScope.set.has("Set"));
			assert(!globalScope.set.has("Array"));
			assert(!globalScope.set.has("Object"));

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(variable.references.length, 0);
				assertGlobalVariableAttributes(variable, esGlobals);
				assert.strictEqual(variable.eslintExplicitGlobal, false);
				assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
				assert.strictEqual(variable.defs.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables.length, 1);
			assert.strictEqual(
				globalScope.implicit.variables[0],
				globalScope.implicit.set.get("Set"),
			);

			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].identifier.name, "Set");
			assert.strictEqual(globalScope.references[1].identifier.name, "Array");
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.through[0], globalScope.references[0]);
			assert.strictEqual(globalScope.through[1], globalScope.references[1]);
			assert.strictEqual(globalScope.implicit.left.length, 2);
			assert.strictEqual(globalScope.implicit.left[0], globalScope.references[0]);
			assert.strictEqual(globalScope.implicit.left[1], globalScope.references[1]);
		});

		it("should add custom globals enabled in the config", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"Foo = Bar",
				{
					ecmaVersion: 2015,
					globals: { Foo: true, Bar: false, Baz: "writeable", Qux: "off" },
				},
				true,
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));
			assert(!globalScope.set.has("Qux"));

			for (const variable of globalScope.variables) {
				if (!["Foo", "Bar", "Baz"].includes(variable.name)) {
					assert(Object.hasOwn(esGlobals, variable.name));
				}
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Foo", "Bar"].includes(variable.name) ? 1 : 0,
				);
				assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
				assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
				assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
				assert(Object.hasOwn(variable, "writeable"));

				if (variable.name === "Foo") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				} else if (variable.name === "Bar") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "readonly");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, false);
				} else if (variable.name === "Baz") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				} else {
					assert.strictEqual(
						variable.eslintImplicitGlobalSetting,
						esGlobals[variable.name] ? "writable" : "readonly",
					);
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, esGlobals[variable.name]);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should add custom globals enabled inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"/* globals Foo: true, Bar: false, Baz: writeable, Qux: off */ Foo = Bar",
				{ ecmaVersion: 2015 },
				true,
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));
			assert(!globalScope.set.has("Qux"));

			for (const variable of globalScope.variables) {
				if (!["Foo", "Bar", "Baz"].includes(variable.name)) {
					assert(Object.hasOwn(esGlobals, variable.name));
				}
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Foo", "Bar"].includes(variable.name) ? 1 : 0,
				);
				assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
				assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
				assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
				assert(Object.hasOwn(variable, "writeable"));

				if (variable.name === "Foo") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, void 0);
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, true);
				} else if (variable.name === "Bar") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, void 0);
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, false);
				} else if (variable.name === "Baz") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, void 0);
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, true);
				} else {
					assert.strictEqual(
						variable.eslintImplicitGlobalSetting,
						esGlobals[variable.name] ? "writable" : "readonly",
					);
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, esGlobals[variable.name]);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should correctly set attributes when custom globals are enabled both in config and inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"/* globals Foo: false, Bar: writable, Baz -- Baz defaults to 'readonly' */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Foo: true, Bar: false, Baz: "writeable" } },
				true,
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));

			for (const variable of globalScope.variables) {
				if (!["Foo", "Bar", "Baz"].includes(variable.name)) {
					assert(Object.hasOwn(esGlobals, variable.name));
				}
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Foo", "Bar"].includes(variable.name) ? 1 : 0,
				);
				assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
				assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
				assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
				assert(Object.hasOwn(variable, "writeable"));

				if (variable.name === "Foo") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, false);
				} else if (variable.name === "Bar") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "readonly");
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, true);
				} else if (variable.name === "Baz") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, false);
				} else {
					assert.strictEqual(
						variable.eslintImplicitGlobalSetting,
						esGlobals[variable.name] ? "writable" : "readonly",
					);
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, esGlobals[variable.name]);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should not add globals that are enabled in config but disabled inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"/* globals Foo: off, Bar: off, Baz: off */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Foo: true, Bar: false, Baz: "writeable" } },
				true,
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);
			assert(!globalScope.set.has("Foo"));
			assert(!globalScope.set.has("Bar"));
			assert(!globalScope.set.has("Baz"));

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(variable.references.length, 0);
				assertGlobalVariableAttributes(variable, esGlobals);
				assert.strictEqual(variable.eslintExplicitGlobal, false);
				assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
				assert.strictEqual(variable.defs.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables.length, 1);
			assert.strictEqual(
				globalScope.implicit.variables[0],
				globalScope.implicit.set.get("Foo"),
			);

			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].identifier.name, "Foo");
			assert.strictEqual(globalScope.references[0].resolved, null);
			assert.strictEqual(globalScope.references[1].identifier.name, "Bar");
			assert.strictEqual(globalScope.references[1].resolved, null);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.through[0], globalScope.references[0]);
			assert.strictEqual(globalScope.through[1], globalScope.references[1]);
			assert.strictEqual(globalScope.implicit.left.length, 2);
			assert.strictEqual(globalScope.implicit.left[0], globalScope.references[0]);
			assert.strictEqual(globalScope.implicit.left[1], globalScope.references[1]);
		});

		it("should not affect references for variables that are neither predefined, nor enabled in config, nor enabled inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"/* globals Qux: true */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Quux: true } },
				true,
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 2);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 2);
			assert(globalScope.set.has("Qux"));
			assert(globalScope.set.has("Quux"));
			assert(!globalScope.set.has("Foo"));
			assert(!globalScope.set.has("Bar"));

			for (const variable of globalScope.variables) {
				if (!["Qux", "Quux"].includes(variable.name)) {
					assert(Object.hasOwn(esGlobals, variable.name));
				}
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(variable.references.length, 0);
				assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
				assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
				assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
				assert(Object.hasOwn(variable, "writeable"));

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
					assert.strictEqual(
						variable.eslintImplicitGlobalSetting,
						esGlobals[variable.name] ? "writable" : "readonly",
					);
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, esGlobals[variable.name]);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables.length, 1);
			assert.strictEqual(
				globalScope.implicit.variables[0],
				globalScope.implicit.set.get("Foo"),
			);

			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].identifier.name, "Foo");
			assert.strictEqual(globalScope.references[0].resolved, null);
			assert.strictEqual(globalScope.references[1].identifier.name, "Bar");
			assert.strictEqual(globalScope.references[1].resolved, null);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.through[0], globalScope.references[0]);
			assert.strictEqual(globalScope.through[1], globalScope.references[1]);
			assert.strictEqual(globalScope.implicit.left.length, 2);
			assert.strictEqual(globalScope.implicit.left[0], globalScope.references[0]);
			assert.strictEqual(globalScope.implicit.left[1], globalScope.references[1]);
		});

		it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = setupFinalize(
				"/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;",
				{ ecmaVersion: 2015, globals: { Bar: true } },
				true,
			);

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));

			for (const variable of globalScope.variables) {
				if (!["Foo", "Bar", "Baz"].includes(variable.name)) {
					assert(Object.hasOwn(esGlobals, variable.name));
				}
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Foo", "Bar", "Baz"].includes(variable.name) ? 1 : 0,
				);

				if (variable.name === "Baz") {
					assert(!Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
					assert(!Object.hasOwn(variable, "eslintExplicitGlobal"));
					assert(!Object.hasOwn(variable, "eslintExplicitGlobalComments"));
					assert(!Object.hasOwn(variable, "writeable"));
				} else {
					assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
					assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
					assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
					assert(Object.hasOwn(variable, "writeable"));
				}

				if (variable.name === "Foo") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, void 0);
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, false);
				} else if (variable.name === "Bar") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				} else if (variable.name !== "Baz") {
					assert.strictEqual(
						variable.eslintImplicitGlobalSetting,
						esGlobals[variable.name] ? "writable" : "readonly",
					);
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, esGlobals[variable.name]);
				}

				assert.strictEqual(
					variable.defs.length,
					["Foo", "Bar", "Baz"].includes(variable.name) ? 1 : 0,
				);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar", "Baz"]);
		});
	});

	describe("isGlobalReference(node)", () => {
		it("should throw an error when argument is missing", () => {
			assert.throws(() => {
				linter.verify(
					"foo",
					makeRuleConfig("is-global-reference", context => ({
						Program() {
							context.sourceCode.isGlobalReference();
						},
					})),
				);
			}, /Missing required argument: node/u);
		});

		it("should correctly identify global references", () => {
			const code =
				"undefined; globalThis; NaN; Object; Boolean; String; Math; Date; Array; Map; Set; var foo; foo;";
			let identifierSpy;

			linter.verify(code, {
				languageOptions: { sourceType: "script" },
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					const builtinGlobals = new Set([
						"undefined", "globalThis", "NaN", "Object", "Boolean",
						"String", "Math", "Date", "Array", "Map", "Set",
					]);

					identifierSpy = sinon.spy(node => {
						if (builtinGlobals.has(node.name)) {
							assert.isTrue(
								sourceCode.isGlobalReference(node),
								`Expected ${node.name} to be identified as a global reference`,
							);
						} else if (node.name === "foo" && node.parent.type !== "VariableDeclarator") {
							assert.isFalse(
								sourceCode.isGlobalReference(node),
								"Expected local variable to not be identified as a global reference",
							);
						}
					});

					return { Identifier: identifierSpy };
				}),
			});
			assert(identifierSpy.called, "Identifier spy was not called.");
			assert(identifierSpy.callCount > 10, "Identifier spy was not called enough times.");
		});

		it("should handle function parameters and shadowed globals", () => {
			const code = "function test(param, NaN) { param; NaN; }";
			let spy;

			linter.verify(code, makeRuleConfig("checker", context => {
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
				return { FunctionDeclaration: spy };
			}));
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should identify global references in modules", () => {
			const code = "Math;";
			let spy;

			linter.verify(code, {
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(() => {
						const mathRef = sourceCode.ast.body[0].expression;
						assert.strictEqual(mathRef.name, "Math");
						assert.isTrue(sourceCode.isGlobalReference(mathRef));
					});
					return { "Program:exit": spy };
				}),
				languageOptions: { ecmaVersion: 2015, sourceType: "module" },
			});
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should identify variables in higher scopes as non-global", () => {
			const code = "var outer; function foo() { outer; }";
			let spy;

			linter.verify(code, makeRuleConfig("checker", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(functionDecl => {
					const outerRef = functionDecl.body.body[0].expression;
					assert.strictEqual(outerRef.name, "outer");
					assert.isFalse(sourceCode.isGlobalReference(outerRef));
				});
				return { FunctionDeclaration: spy };
			}));
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should distinguish between object property access and global references", () => {
			const code = "String; String.length; Math; obj.Math;";
			let identifierSpy;

			linter.verify(code, makeRuleConfig("checker", context => {
				const sourceCode = context.sourceCode;
				identifierSpy = sinon.spy(node => {
					if (node.name === "String") {
						assert.isTrue(
							sourceCode.isGlobalReference(node),
							"Expected 'String' to be identified as a global reference",
						);
					} else if (node.name === "length" && node.parent.type === "MemberExpression") {
						assert.isFalse(
							sourceCode.isGlobalReference(node),
							"Expected property 'length' to not be identified as a global reference",
						);
					} else if (node.name === "Math" && node.parent.type !== "MemberExpression") {
						assert.isTrue(
							sourceCode.isGlobalReference(node),
							"Expected 'Math' to be identified as a global reference",
						);
					} else if (node.name === "Math" && node.parent.object.name === "obj") {
						assert.isFalse(
							sourceCode.isGlobalReference(node),
							"Expected 'obj.Math' property to not be identified as a global reference",
						);
					}
				});
				return { Identifier: identifierSpy };
			}));
			assert(identifierSpy.called, "Identifier spy was not called.");
		});

		it("should handle destructuring assignments properly", () => {
			const code = "const { Math } = obj; Math; const [Array] = list; Array;";
			let spy;

			linter.verify(code, {
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(() => {
						const mathRef = sourceCode.ast.body[1].expression;
						const arrayRef = sourceCode.ast.body[3].expression;

						assert.strictEqual(mathRef.name, "Math");
						assert.strictEqual(arrayRef.name, "Array");
						assert.isFalse(
							sourceCode.isGlobalReference(mathRef),
							"Destructured 'Math' should not be identified as a global reference",
						);
						assert.isFalse(
							sourceCode.isGlobalReference(arrayRef),
							"Destructured 'Array' should not be identified as a global reference",
						);
					});
					return { "Program:exit": spy };
				}),
				languageOptions: { ecmaVersion: 2015 },
			});
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should handle imported names that shadow globals", () => {
			const code = "import { Object, String } from './module'; Object; String;";
			let spy;

			linter.verify(code, makeRuleConfig("checker", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(() => {
					const objectRef = sourceCode.ast.body[1].expression;
					const stringRef = sourceCode.ast.body[2].expression;

					assert.strictEqual(objectRef.name, "Object");
					assert.strictEqual(stringRef.name, "String");
					assert.isFalse(
						sourceCode.isGlobalReference(objectRef),
						"Imported 'Object' should not be identified as a global reference",
					);
					assert.isFalse(
						sourceCode.isGlobalReference(stringRef),
						"Imported 'String' should not be identified as a global reference",
					);
				});
				return { "Program:exit": spy };
			}));
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should handle temporal dead zone (TDZ) for let variables", () => {
			const code = "{ console.log(x); let x = 5; }";
			let spy;

			linter.verify(code, {
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						if (node.name === "x" && node.parent.type !== "VariableDeclarator") {
							assert.isFalse(
								sourceCode.isGlobalReference(node),
								"Reference in TDZ should not be identified as a global reference",
							);
						}
					});
					return { Identifier: spy };
				}),
				languageOptions: { ecmaVersion: 2015 },
			});
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should handle variables shadowed in catch blocks", () => {
			const code = "try {} catch (Error) { Error; }";
			let spy;

			linter.verify(code, makeRuleConfig("checker", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(node => {
					if (node.parent.type === "CatchClause") return;
					if (node.name === "Error") {
						assert.isFalse(
							sourceCode.isGlobalReference(node),
							"Error in catch block should not be identified as a global reference",
						);
					}
				});
				return { Identifier: spy };
			}));
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should handle class declarations and methods", () => {
			const code = "class MyClass { method() { Math.random(); this.Math = 5; } }";
			let spy;

			linter.verify(code, {
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
					spy = sinon.spy(node => {
						if (
							node.name === "Math" &&
							node.parent.type === "MemberExpression" &&
							node.parent.object.type !== "ThisExpression"
						) {
							assert.isTrue(
								sourceCode.isGlobalReference(node),
								"Math in method should be identified as a global reference",
							);
						} else if (
							node.name === "Math" &&
							node.parent.object &&
							node.parent.object.type === "ThisExpression"
						) {
							assert.isFalse(
								sourceCode.isGlobalReference(node),
								"this.Math should not be identified as a global reference",
							);
						}
					});
					return { Identifier: spy };
				}),
				languageOptions: { ecmaVersion: 2015 },
			});
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should respect /*globals*/ directive comments", () => {
			const code =
				"/*globals customGlobal:writable, String:off */ customGlobal; String;";
			let spy;

			linter.verify(code, makeRuleConfig("checker", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(node => {
					if (node.name === "customGlobal") {
						assert.isTrue(
							sourceCode.isGlobalReference(node),
							"Variable declared in globals directive should be identified as a global reference",
						);
					} else if (node.name === "String") {
						assert.isFalse(
							sourceCode.isGlobalReference(node),
							"Global turned off in directive should not be identified as a global reference",
						);
					}
				});
				return { Identifier: spy };
			}));
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should cache the result of isGlobalReference for the same node", () => {
			const code = "Math; Math;";
			let firstNode, secondNode, sourceCodeInstance;

			linter.verify(code, makeRuleConfig("checker", context => {
				sourceCodeInstance = context.sourceCode;
				return {
					Identifier(node) {
						if (!firstNode) {
							firstNode = node;
						} else if (!secondNode) {
							secondNode = node;
						}
					},
				};
			}));

			const cache =
				sourceCodeInstance[
					Object.getOwnPropertySymbols(sourceCodeInstance).find(
						sym =>
							sourceCodeInstance[sym] instanceof Map &&
							sourceCodeInstance[sym].has("isGlobalReference"),
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
			const code = "var foo = 1;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const steps = sourceCode.traverse();

			assert.isArray(steps);
			assert.strictEqual(steps.length, 14);
		});

		it("should return steps with VisitNodeStep for each node", () => {
			const code = "var foo = 1;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);

			assert.strictEqual(visitSteps.length, 10);

			visitSteps.forEach(step => {
				assert.isNumber(step.phase);
				assert.isTrue(step.phase === 1 || step.phase === 2, "phase should be 1 (enter) or 2 (exit)");
				assert.isArray(step.args);
				assert.isDefined(step.target.type, "target should have type");
			});
		});

		it("should have enter and exit phases for each node", () => {
			const code = "var foo = 1;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);

			const nodeSteps = new Map();
			visitSteps.forEach(step => {
				if (!nodeSteps.has(step.target.type)) {
					nodeSteps.set(step.target.type, []);
				}
				nodeSteps.get(step.target.type).push(step.phase);
			});

			nodeSteps.forEach((phases, nodeType) => {
				assert.isTrue(phases.includes(1), `${nodeType} should have enter phase`);
				assert.isTrue(phases.includes(2), `${nodeType} should have exit phase`);
			});
		});

		it("should traverse nested nodes in correct order", () => {
			const code = "var foo = 1;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);
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
			const code = "var foo = 1;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			assert.strictEqual(
				sourceCode.traverse(),
				sourceCode.traverse(),
				"traverse() should return the same cached array",
			);
		});

		it("should include CodePathAnalyzer steps for ESTree", () => {
			const code = "if (true) { var x = 1; }";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const callSteps = sourceCode.traverse().filter(step => step.kind === 2);

			assert.strictEqual(callSteps.length, 8);

			callSteps.forEach(step => {
				assert.isString(step.target, "call step target should be event name");
				assert.isArray(step.args, "call step should have args array");
			});
		});

		it("should work with simple expressions", () => {
			const code = "42;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const steps = sourceCode.traverse();

			assert.strictEqual(steps.length, 10);

			const nodeTypes = new Set(
				steps.filter(step => step.kind === 1).map(step => step.target.type),
			);
			assert.isTrue(nodeTypes.has("Program"), "should traverse Program node");
			assert.isTrue(nodeTypes.has("ExpressionStatement"), "should traverse ExpressionStatement node");
		});

		it("should work with function declarations", () => {
			const code = "function foo(a, b) { return a + b; }";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const nodeTypes = new Set(
				sourceCode.traverse()
					.filter(step => step.kind === 1)
					.map(step => step.target.type),
			);

			assert.isTrue(nodeTypes.has("FunctionDeclaration"), "should traverse FunctionDeclaration");
			assert.isTrue(nodeTypes.has("Identifier"), "should traverse Identifier nodes");
			assert.isTrue(nodeTypes.has("ReturnStatement"), "should traverse ReturnStatement");
		});

		it("should work with object and array patterns", () => {
			const code = "const {x, y} = obj; const [a, b] = arr;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const nodeTypes = new Set(
				sourceCode.traverse()
					.filter(step => step.kind === 1)
					.map(step => step.target.type),
			);

			assert.isTrue(nodeTypes.has("VariableDeclaration"), "should traverse VariableDeclaration");
			assert.isTrue(nodeTypes.has("ObjectPattern"), "should traverse ObjectPattern");
			assert.isTrue(nodeTypes.has("ArrayPattern"), "should traverse ArrayPattern");
		});

		it("should traverse all nodes in correct depth-first order", () => {
			const code = "var x = y + z;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);

			const enterExitMap = new Map();
			visitSteps.forEach((step, index) => {
				const nodeKey = `${step.target.type}@${step.target.range.join(",")}`;
				if (!enterExitMap.has(nodeKey)) {
					enterExitMap.set(nodeKey, { enter: null, exit: null });
				}
				if (step.phase === 1) {
					enterExitMap.get(nodeKey).enter = index;
				} else {
					enterExitMap.get(nodeKey).exit = index;
				}
			});

			enterExitMap.forEach(({ enter, exit }) => {
				assert.isNotNull(enter, "node should have enter phase");
				assert.isNotNull(exit, "node should have exit phase");
				assert.isBelow(enter, exit, "enter phase should come before exit phase");
			});
		});

		it("should return exactly one argument (node) for all visit steps", () => {
			const code = "var foo = 1;";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);

			assert.strictEqual(visitSteps.length, 10);

			visitSteps.forEach(step => {
				assert.strictEqual(
					step.args.length,
					1,
					`Visit step for ${step.target.type} should have exactly 1 argument, got ${step.args.length}`,
				);
				assert.strictEqual(
					step.args[0],
					step.target,
					`First argument should be the node (${step.target.type})`,
				);
			});
		});

		it("should set `parent` property on nodes as the actual parent node in the AST", () => {
			const code = "if (x) { var y = 1; }";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
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

			const yNode = declaratorNode.id;
			assert.strictEqual(yNode.parent, declaratorNode);

			const number1Node = declaratorNode.init;
			assert.strictEqual(number1Node.parent, declaratorNode);
		});
	});
});
```

## Key Refactoring Changes

### New Helper Functions
1. **`createSourceCodeWithScope(code, scopeOptions)`** — Eliminates the repeated 5-line setup pattern (parse → analyze → construct SourceCode) used in ~15 `finalize()`/`applyLanguageOptions()` tests.

2. **`makeRuleConfig(ruleName, createFn, extraConfig)`** — Collapses the deeply nested `plugins → test → rules → [name] → create` boilerplate used in every linter-based test into a single call.

3. **`assertSpaceBetweenBothDirections(sourceCode, first, second, expected)`** — Removes the duplicated forward/reverse assertion pairs in JSX tests.

4. **`describeSpaceBetweenCases(cases, getFirst, getSecond)`** — Replaces four nearly identical `forEach` blocks (each generating forward + reverse `describe`/`it` pairs) with a single reusable function, eliminating ~200 lines of duplication.

5. **`assertGlobalVariableAttributes(variable, esGlobals, overrides)`** — Centralizes the repeated 8-assertion block checking `eslintImplicitGlobalSetting`, `eslintExplicitGlobal`, etc.

6. **`assertNoImplicitOrUnresolved(globalScope)`** — Extracts the 4-assertion "no implicit globals / no unresolved references" postcondition.

7. **`assertResolvedReferences(globalScope, names)`** — Extracts the resolved-references assertion loop.

8. **`setupFinalize(code, languageOptions, applyInline, scopeOptions)`** — Consolidates the repeated `createSourceCodeWithScope → applyLanguageOptions → [applyInlineConfig] → finalize → getScope` setup in all `finalize()` tests.

### Other Improvements
- Collapsed trivial single-assertion tests (e.g., `getText`, `getNodeByRangeIndex`) to remove redundant local variables
- Parameterized the three "invalid AST" throw tests into a single `forEach`
- Parameterized `getLines()` line-break tests into a `forEach`
- Collapsed `getLocFromIndex` and `getIndexFromLoc` multi-assertion tests into `forEach` arrays
- Grouped BOM-related `describe` blocks under a shared `describe("BOM handling")`
- Removed intermediate variables where the value was used only once
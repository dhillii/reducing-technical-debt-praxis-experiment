Looking at this test file, I can identify several patterns that can be refactored to reduce complexity:

1. **Repeated `isSpaceBetween` test patterns** - The forward/reverse test pairs are duplicated across multiple `describe` blocks
2. **Repeated `finalize()` test assertions** - Large blocks of nearly identical variable assertion loops
3. **Repeated `linter.verify` plugin boilerplate** - The plugin/rule creation pattern is repeated many times
4. **Repeated `getScope` test patterns** - Similar structure repeated many times

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
 * Creates a minimal AST object for SourceCode tests.
 * @returns {{comments: Array, tokens: Array, loc: Object, range: Array}} AST stub
 */
function makeAst(overrides = {}) {
	return { comments: [], tokens: [], loc: {}, range: [], ...overrides };
}

/**
 * Parses code and returns a SourceCode instance.
 * @param {string} code Source code to parse.
 * @param {Object} [config] Parser config (defaults to DEFAULT_CONFIG).
 * @returns {SourceCode} The source code instance.
 */
function makeSourceCode(code, config = DEFAULT_CONFIG) {
	return new SourceCode(code, espree.parse(code, config));
}

/**
 * Creates a linter plugin config with a single checker rule.
 * @param {Function} createFn The rule's create function.
 * @param {Object} [extraConfig] Additional config properties.
 * @returns {Object} Linter config object.
 */
function makeCheckerConfig(createFn, extraConfig = {}) {
	return {
		plugins: {
			test: {
				rules: {
					checker: { create: createFn },
				},
			},
		},
		rules: { "test/checker": "error" },
		...extraConfig,
	};
}

/**
 * Runs linter.verify with a spy-based checker rule and asserts the spy was called once.
 * @param {string} code Source code to verify.
 * @param {string} selector AST selector for the spy.
 * @param {Function} assertions Assertions to run inside the spy (receives node).
 * @param {Object} [extraConfig] Additional linter config.
 * @returns {sinon.SinonSpy} The spy.
 */
function verifyWithSpy(code, selector, assertions, extraConfig = {}) {
	const spy = sinon.spy(assertions);
	linter.verify(
		code,
		makeCheckerConfig(
			context => ({ [selector]: spy.bind(null, context) }),
			extraConfig,
		),
	);
	return spy;
}

/**
 * Registers bidirectional isSpaceBetween tests for a list of [code, expected] pairs.
 * @param {Array<[string, boolean]>} cases Test cases.
 * @param {Function} getFirst Gets the first node/token from sourceCode.
 * @param {Function} getSecond Gets the second node/token from sourceCode.
 */
function describeIsSpaceBetweenBidirectional(cases, getFirst, getSecond) {
	cases.forEach(([code, expected]) => {
		describe("when the first given is located before the second", () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				assert.strictEqual(
					sourceCode.isSpaceBetween(
						getFirst(sourceCode),
						getSecond(sourceCode),
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
						getSecond(sourceCode),
						getFirst(sourceCode),
					),
					expected,
				);
			});
		});
	});
}

/**
 * Creates a SourceCode with scope for finalize() tests.
 * @param {string} code Source code.
 * @param {Object} [scopeOptions] Options for eslintScope.analyze.
 * @returns {SourceCode} Configured source code instance.
 */
function makeScopedSourceCode(code, scopeOptions = {}) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...scopeOptions,
	});
	return new SourceCode({ text: code, ast, scopeManager });
}

/**
 * Asserts standard variable attributes on a global scope variable.
 * @param {Object} variable The variable to check.
 * @param {Object} expectedAttrs Expected attribute values.
 */
function assertVariableAttributes(variable, expectedAttrs) {
	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));

	if ("eslintImplicitGlobalSetting" in expectedAttrs) {
		assert.strictEqual(
			variable.eslintImplicitGlobalSetting,
			expectedAttrs.eslintImplicitGlobalSetting,
		);
	}
	if ("eslintExplicitGlobal" in expectedAttrs) {
		assert.strictEqual(
			variable.eslintExplicitGlobal,
			expectedAttrs.eslintExplicitGlobal,
		);
	}
	if ("eslintExplicitGlobalComments" in expectedAttrs) {
		if (expectedAttrs.eslintExplicitGlobalComments === undefined) {
			assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
		} else if (typeof expectedAttrs.eslintExplicitGlobalComments === "number") {
			assert.strictEqual(
				variable.eslintExplicitGlobalComments.length,
				expectedAttrs.eslintExplicitGlobalComments,
			);
		} else {
			assert.strictEqual(
				variable.eslintExplicitGlobalComments,
				expectedAttrs.eslintExplicitGlobalComments,
			);
		}
	}
	if ("writeable" in expectedAttrs) {
		assert.strictEqual(variable.writeable, expectedAttrs.writeable);
	}
}

/**
 * Asserts standard ES globals state on a global scope after finalize().
 * @param {Object} globalScope The global scope.
 * @param {Object} esGlobals The expected ES globals map.
 * @param {number} expectedCount Expected variable count.
 * @param {string[]} [referencedNames] Names expected to have 1 reference.
 * @param {string[]} [excludedNames] Names expected to be absent from scope.
 */
function assertEsGlobalsState(
	globalScope,
	esGlobals,
	expectedCount,
	referencedNames = [],
	excludedNames = [],
) {
	assert.strictEqual(globalScope.set.size, expectedCount);
	assert.strictEqual(globalScope.variables.length, expectedCount);

	for (const name of excludedNames) {
		assert(!globalScope.set.has(name));
	}
}

/**
 * Asserts standard "no implicit globals / no unresolved references" state.
 * @param {Object} globalScope The global scope.
 */
function assertNoImplicitOrUnresolved(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
}

/**
 * Asserts resolved references on a global scope.
 * @param {Object} globalScope The global scope.
 * @param {string[]} resolvedNames Names expected to be resolved in order.
 */
function assertResolvedReferences(globalScope, resolvedNames) {
	assert.strictEqual(globalScope.references.length, resolvedNames.length);
	resolvedNames.forEach((name, i) => {
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
			[
				{ comments: [], loc: {}, range: [] },
				/missing the tokens array/u,
				"tokens",
			],
			[
				{ tokens: [], loc: {}, range: [] },
				/missing the comments array/u,
				"comments",
			],
			[
				{ comments: [], tokens: [], range: [] },
				/missing location information/u,
				"location",
			],
			[
				{ comments: [], tokens: [], loc: {} },
				/missing range information/u,
				"range",
			],
		].forEach(([ast, pattern, missing]) => {
			it(`should throw an error when called with an AST that's missing ${missing}`, () => {
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

		describe("if a text has BOM,", () => {
			let sourceCode;

			beforeEach(() => {
				sourceCode = new SourceCode("\uFEFFconsole.log('hello');", makeAst());
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
				sourceCode = new SourceCode("console.log('hello');", makeAst());
			});

			it("should has false at `hasBOM` property.", () => {
				assert.strictEqual(sourceCode.hasBOM, false);
			});

			it("should not has BOM in `text` property.", () => {
				assert.strictEqual(sourceCode.text, "console.log('hello');");
			});
		});

		describe("when a text has a shebang", () => {
			let sourceCode;

			beforeEach(() => {
				const ast = makeAst({
					comments: [
						{
							type: "Line",
							value: "/usr/bin/env node",
							range: [0, 19],
						},
					],
				});
				sourceCode = new SourceCode(SHEBANG_TEST_CODE, ast);
			});

			it('should change the type of the first comment to "Shebang"', () => {
				assert.strictEqual(sourceCode.getAllComments()[0].type, "Shebang");
			});
		});

		describe("when a text does not have a shebang", () => {
			it("should not change the type of the first comment", () => {
				const ast = makeAst({
					comments: [{ type: "Line", value: "comment", range: [0, 9] }],
				});
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
				sourceCode = new SourceCode(text, makeAst());
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
			assert.strictEqual(
				sourceCode.getNodeByRangeIndex(14).type,
				"BinaryExpression",
			);
			assert.strictEqual(
				sourceCode.getNodeByRangeIndex(3).type,
				"VariableDeclaration",
			);
		});

		it("should return null if the index is outside the range of any node", () => {
			assert.isNull(sourceCode.getNodeByRangeIndex(-1));
			assert.isNull(sourceCode.getNodeByRangeIndex(-99));
		});
	});

	describe("isSpaceBetween()", () => {
		describe("should return true when there is at least one whitespace character between two tokens", () => {
			describeIsSpaceBetweenBidirectional(
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

			describeIsSpaceBetweenBidirectional(
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
			describeIsSpaceBetweenBidirectional(
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
				sc => sc.ast.tokens[0],
				sc => sc.ast.body.at(-1),
			);
		});

		describe("should return true when there is at least one whitespace character between a node and a token", () => {
			describeIsSpaceBetweenBidirectional(
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
				sc => sc.ast.body[0],
				sc => sc.ast.tokens.at(-1),
			);
		});

		describe("should return true when there is at least one whitespace character between two nodes", () => {
			describeIsSpaceBetweenBidirectional(
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

			it("JSXText tokens that contain only whitespaces should NOT be handled as space", () => {
				const code = "let jsx = <div>\n   {content}\n</div>";
				const ast = espree.parse(code, {
					...DEFAULT_CONFIG,
					ecmaFeatures: { jsx: true },
				});
				const sourceCode = new SourceCode(code, ast);
				const jsx = ast.body[0].declarations[0].init;
				const interpolation = jsx.children[1];

				assert.strictEqual(
					sourceCode.isSpaceBetween(jsx.openingElement, interpolation),
					false,
				);
				assert.strictEqual(
					sourceCode.isSpaceBetween(interpolation, jsx.closingElement),
					false,
				);
				assert.strictEqual(
					sourceCode.isSpaceBetween(interpolation, jsx.openingElement),
					false,
				);
				assert.strictEqual(
					sourceCode.isSpaceBetween(jsx.closingElement, interpolation),
					false,
				);
			});

			[
				[
					"JSXText tokens that contain both letters and whitespaces should NOT be handled as space",
					"let jsx = <div>\n   Hello\n</div>",
					jsx => [jsx.openingElement, jsx.closingElement],
				],
				[
					"JSXText tokens that contain only letters should NOT be handled as space",
					"let jsx = <div>Hello</div>",
					jsx => [jsx.openingElement, jsx.closingElement],
				],
			].forEach(([title, code, getPair]) => {
				it(title, () => {
					const ast = espree.parse(code, {
						...DEFAULT_CONFIG,
						ecmaFeatures: { jsx: true },
					});
					const sourceCode = new SourceCode(code, ast);
					const jsx = ast.body[0].declarations[0].init;
					const [first, second] = getPair(jsx);

					assert.strictEqual(sourceCode.isSpaceBetween(first, second), false);
					assert.strictEqual(sourceCode.isSpaceBetween(second, first), false);
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

					assert.strictEqual(
						sourceCode.isSpaceBetween(token0, body0),
						expected,
					);
					assert.strictEqual(
						sourceCode.isSpaceBetween(tokenLast, body0),
						expected,
					);
					assert.strictEqual(
						sourceCode.isSpaceBetween(body0, token0),
						expected,
					);
					assert.strictEqual(
						sourceCode.isSpaceBetween(body0, tokenLast),
						expected,
					);
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
			const pattern =
				/Expected `loc` to be an object with numeric `line` and `column` properties\./u;

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

		[
			{
				title: "should return 'function' scope on FunctionDeclaration (ES5)",
				code: "function f() {}",
				selector: "FunctionDeclaration",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node);
				},
			},
			{
				title: "should return 'function' scope on FunctionExpression (ES5)",
				code: "!function f() {}",
				selector: "FunctionExpression",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node);
				},
			},
			{
				title: "should return 'function' scope on the body of FunctionDeclaration (ES5)",
				code: "function f() {}",
				selector: "BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent);
				},
			},
			{
				title: "should return 'function' scope on the body of FunctionDeclaration (ES2015)",
				code: "function f() {}",
				selector: "BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent);
				},
			},
			{
				title: "should return 'function' scope on BlockStatement in functions (ES5)",
				code: "function f() { { var b; } }",
				selector: "BlockStatement > BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["arguments", "b"],
					);
				},
			},
			{
				title: "should return 'block' scope on BlockStatement in functions (ES2015)",
				code: "function f() { { let a; var b; } }",
				selector: "BlockStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "function");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["a"],
					);
					assert.deepStrictEqual(
						scope.variableScope.variables.map(v => v.name),
						["arguments", "b"],
					);
				},
			},
			{
				title: "should return 'block' scope on nested BlockStatement in functions (ES2015)",
				code: "function f() { { let a; { let b; var c; } } }",
				selector: "BlockStatement > BlockStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "block");
					assert.strictEqual(scope.upper.upper.type, "function");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["b"],
					);
					assert.deepStrictEqual(
						scope.upper.variables.map(v => v.name),
						["a"],
					);
					assert.deepStrictEqual(
						scope.variableScope.variables.map(v => v.name),
						["arguments", "c"],
					);
				},
			},
			{
				title: "should return 'function' scope on SwitchStatement in functions (ES5)",
				code: "function f() { switch (a) { case 0: var b; } }",
				selector: "SwitchStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["arguments", "b"],
					);
				},
			},
			{
				title: "should return 'switch' scope on SwitchStatement in functions (ES2015)",
				code: "function f() { switch (a) { case 0: let b; } }",
				selector: "SwitchStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "switch");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["b"],
					);
				},
			},
			{
				title: "should return 'function' scope on SwitchCase in functions (ES5)",
				code: "function f() { switch (a) { case 0: var b; } }",
				selector: "SwitchCase",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["arguments", "b"],
					);
				},
			},
			{
				title: "should return 'switch' scope on SwitchCase in functions (ES2015)",
				code: "function f() { switch (a) { case 0: let b; } }",
				selector: "SwitchCase",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "switch");
					assert.strictEqual(scope.block, node.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["b"],
					);
				},
			},
			{
				title: "should return 'catch' scope on CatchClause in functions (ES5)",
				code: "function f() { try {} catch (e) { var a; } }",
				selector: "CatchClause",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "catch");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["e"],
					);
				},
			},
			{
				title: "should return 'catch' scope on CatchClause in functions (ES2015)",
				code: "function f() { try {} catch (e) { let a; } }",
				selector: "CatchClause",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "catch");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["e"],
					);
				},
			},
			{
				title: "should return 'catch' scope on the block of CatchClause in functions (ES5)",
				code: "function f() { try {} catch (e) { var a; } }",
				selector: "CatchClause > BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "catch");
					assert.strictEqual(scope.block, node.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["e"],
					);
				},
			},
			{
				title: "should return 'block' scope on the block of CatchClause in functions (ES2015)",
				code: "function f() { try {} catch (e) { let a; } }",
				selector: "CatchClause > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["a"],
					);
				},
			},
			{
				title: "should return 'function' scope on ForStatement in functions (ES5)",
				code: "function f() { for (var i = 0; i < 10; ++i) {} }",
				selector: "ForStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["arguments", "i"],
					);
				},
			},
			{
				title: "should return 'for' scope on ForStatement in functions (ES2015)",
				code: "function f() { for (let i = 0; i < 10; ++i) {} }",
				selector: "ForStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["i"],
					);
				},
			},
			{
				title: "should return 'function' scope on the block body of ForStatement in functions (ES5)",
				code: "function f() { for (var i = 0; i < 10; ++i) {} }",
				selector: "ForStatement > BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["arguments", "i"],
					);
				},
			},
			{
				title: "should return 'block' scope on the block body of ForStatement in functions (ES2015)",
				code: "function f() { for (let i = 0; i < 10; ++i) {} }",
				selector: "ForStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), []);
					assert.deepStrictEqual(
						scope.upper.variables.map(v => v.name),
						["i"],
					);
				},
			},
			{
				title: "should return 'function' scope on ForInStatement in functions (ES5)",
				code: "function f() { for (var key in obj) {} }",
				selector: "ForInStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["arguments", "key"],
					);
				},
			},
			{
				title: "should return 'for' scope on ForInStatement in functions (ES2015)",
				code: "function f() { for (let key in obj) {} }",
				selector: "ForInStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["key"],
					);
				},
			},
			{
				title: "should return 'function' scope on the block body of ForInStatement in functions (ES5)",
				code: "function f() { for (var key in obj) {} }",
				selector: "ForInStatement > BlockStatement",
				ecmaVersion: 5,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "function");
					assert.strictEqual(scope.block, node.parent.parent.parent);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["arguments", "key"],
					);
				},
			},
			{
				title: "should return 'block' scope on the block body of ForInStatement in functions (ES2015)",
				code: "function f() { for (let key in obj) {} }",
				selector: "ForInStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), []);
					assert.deepStrictEqual(
						scope.upper.variables.map(v => v.name),
						["key"],
					);
				},
			},
			{
				title: "should return 'for' scope on ForOfStatement in functions (ES2015)",
				code: "function f() { for (let x of xs) {} }",
				selector: "ForOfStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(
						scope.variables.map(v => v.name),
						["x"],
					);
				},
			},
			{
				title: "should return 'block' scope on the block body of ForOfStatement in functions (ES2015)",
				code: "function f() { for (let x of xs) {} }",
				selector: "ForOfStatement > BlockStatement",
				ecmaVersion: 2015,
				check: ({ node, scope }) => {
					assert.strictEqual(scope.type, "block");
					assert.strictEqual(scope.upper.type, "for");
					assert.strictEqual(scope.block, node);
					assert.deepStrictEqual(scope.variables.map(v => v.name), []);
					assert.deepStrictEqual(
						scope.upper.variables.map(v => v.name),
						["x"],
					);
				},
			},
		].forEach(({ title, code, selector, ecmaVersion, check }) => {
			it(title, () => {
				check(getScope(code, selector, ecmaVersion));
			});
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
			assert.strictEqual(
				scope.references[0].identifier,
				node.left.declarations[0].id,
			);
			assert.strictEqual(scope.references[1].identifier, node.right);
			assert.strictEqual(scope.references[1].resolved, scope.variables[0]);
		});
	});

	describe("getAncestors()", () => {
		const code = TEST_CODE;

		it("should retrieve all ancestors when used", () => {
			let spy;

			const config = makeCheckerConfig(context => {
				spy = sinon.spy(node => {
					const ancestors = context.sourceCode.getAncestors(node);

					assert.strictEqual(ancestors.length, 3);
				});
				return { BinaryExpression: spy };
			});

			linter.verify(code, config, filename);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should retrieve empty ancestors for root node", () => {
			let spy;

			const config = makeCheckerConfig(context => {
				spy = sinon.spy(node => {
					const ancestors = context.sourceCode.getAncestors(node);

					assert.strictEqual(ancestors.length, 0);
				});
				return { Program: spy };
			});

			linter.verify(code, config);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should throw an error when the argument is missing", () => {
			let spy;

			const config = makeCheckerConfig(context => {
				spy = sinon.spy(() => {
					assert.throws(() => {
						context.sourceCode.getAncestors();
					}, /Missing required argument: node/u);
				});
				return { Program: spy };
			});

			linter.verify(code, config);
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
			const EMPTY_NODE_TYPES = [
				"Program", "EmptyStatement", "BlockStatement", "ExpressionStatement",
				"LabeledStatement", "BreakStatement", "ContinueStatement", "WithStatement",
				"SwitchStatement", "ReturnStatement", "ThrowStatement", "TryStatement",
				"WhileStatement", "DoWhileStatement", "ForStatement", "ForInStatement",
				"DebuggerStatement", "ThisExpression", "ArrayExpression", "ObjectExpression",
				"Property", "SequenceExpression", "UnaryExpression", "BinaryExpression",
				"AssignmentExpression", "UpdateExpression", "LogicalExpression",
				"ConditionalExpression", "CallExpression", "NewExpression", "MemberExpression",
				"SwitchCase", "Identifier", "Literal", "ForOfStatement",
				"ArrowFunctionExpression", "YieldExpression", "TemplateLiteral",
				"TaggedTemplateExpression", "TemplateElement", "ObjectPattern", "ArrayPattern",
				"RestElement", "AssignmentPattern", "ClassBody", "MethodDefinition",
				"MetaProperty",
			];

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

									const rule = Object.fromEntries(
										EMPTY_NODE_TYPES.map(t => [t, checkEmpty]),
									);

									rule[type] = function (node) {
										const expectedNames = expectedNamesList.shift();
										const variables =
											sourceCode.getDeclaredVariables(node);

										assert(Array.isArray(expectedNames));
										assert(Array.isArray(variables));
										assert.strictEqual(
											expectedNames.length,
											variables.length,
										);
										for (let i = variables.length - 1; i >= 0; i--) {
											assert.strictEqual(
												expectedNames[i],
												variables[i].name,
											);
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
				[
					["foo", "a", "b", "c", "d", "e"],
					["bar", "f", "g", "h", "i", "j"],
					["q"],
				],
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

			linter.verify(
				code,
				makeCheckerConfig(context => {
					const sourceCode = context.sourceCode;

					spy = sinon.spy(node => {
						assert.isTrue(sourceCode.markVariableAsUsed("a"));

						const scope = sourceCode.getScope(node);

						assert.isTrue(getVariable(scope, "a").eslintUsed);
						assert.notOk(getVariable(scope, "b").eslintUsed);
					});

					return { "Program:exit": spy };
				}, { languageOptions: { sourceType: "script" } }),
			);
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in function args as used", () => {
			const code = "function abc(a, b) { return 1; }";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
					const sourceCode = context.sourceCode;

					spy = sinon.spy(node => {
						assert.isTrue(sourceCode.markVariableAsUsed("a", node));

						const scope = sourceCode.getScope(node);

						assert.isTrue(getVariable(scope, "a").eslintUsed);
						assert.notOk(getVariable(scope, "b").eslintUsed);
					});

					return { ReturnStatement: spy };
				}),
			);
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in higher scopes as used", () => {
			const code = "var a, b; function abc() { return 1; }";
			let returnSpy, exitSpy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
					const sourceCode = context.sourceCode;

					returnSpy = sinon.spy(node => {
						assert.isTrue(sourceCode.markVariableAsUsed("a", node));
					});
					exitSpy = sinon.spy(node => {
						const scope = sourceCode.getScope(node);

						assert.isTrue(getVariable(scope, "a").eslintUsed);
						assert.notOk(getVariable(scope, "b").eslintUsed);
					});

					return {
						ReturnStatement: returnSpy,
						"Program:exit": exitSpy,
					};
				}, { languageOptions: { sourceType: "script" } }),
			);
			assert(returnSpy && returnSpy.calledOnce);
			assert(exitSpy && exitSpy.calledOnce);
		});

		it("should mark variables in Node.js environment as used", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
					const sourceCode = context.sourceCode;

					spy = sinon.spy(node => {
						const globalScope = sourceCode.getScope(node);
						const childScope = globalScope.childScopes[0];

						assert.isTrue(sourceCode.markVariableAsUsed("a"));
						assert.isTrue(getVariable(childScope, "a").eslintUsed);
						assert.isUndefined(getVariable(childScope, "b").eslintUsed);
					});

					return { "Program:exit": spy };
				}, { languageOptions: { sourceType: "commonjs" } }),
			);
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in modules as used", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
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

			linter.verify(
				code,
				makeCheckerConfig(context => {
					const sourceCode = context.sourceCode;

					spy = sinon.spy(() => {
						assert.isFalse(sourceCode.markVariableAsUsed("c"));
					});

					return { "Program:exit": spy };
				}, { languageOptions: { sourceType: "script" } }),
			);
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
					loc: {
						start: { line: 1, column: 0 },
						end: { line: 1, column: 17 },
					},
				},
				{
					type: "Block",
					value: " eslint-disable bar ",
					start: 47,
					end: 71,
					range: [47, 71],
					loc: {
						start: { line: 1, column: 47 },
						end: { line: 1, column: 71 },
					},
				},
				{
					type: "Block",
					value: " eslint-enable bar ",
					start: 77,
					end: 100,
					range: [77, 100],
					loc: {
						start: { line: 1, column: 77 },
						end: { line: 1, column: 100 },
					},
				},
			]);
		});
	});

	describe("applyLanguageOptions()", () => {
		it("should add ES6 globals", () => {
			const sourceCode = makeScopedSourceCode("foo");

			sourceCode.applyLanguageOptions({ ecmaVersion: 2015 });
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("Promise");

			assert.isDefined(variable);
		});

		it("should add custom globals", () => {
			const sourceCode = makeScopedSourceCode("foo");

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
			const sourceCode = makeScopedSourceCode("foo", { sourceType: "commonjs" });

			sourceCode.applyLanguageOptions({
				ecmaVersion: 2015,
				sourceType: "commonjs",
			});
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("require");

			assert.isDefined(variable);
		});
	});

	describe("applyInlineConfig()", () => {
		it("should add inline globals", () => {
			const code = "/*global bar: true */ foo;";
			const sourceCode = makeScopedSourceCode(code);

			sourceCode.applyInlineConfig();
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("bar");

			assert.isDefined(variable);
			assert.isTrue(variable.writeable);
		});

		describe("exported variables", () => {
			/**
			 * Creates a global scope after applying inline config.
			 * @param {string} code the code to check
			 * @returns {Map} globalScope set
			 */
			function loadGlobalScope(code) {
				const sourceCode = makeScopedSourceCode(code);

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
			const code =
				'/*eslint some-rule: 2, other-rule: ["error", { skip: true }] */ var foo;';
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const result = sourceCode.applyInlineConfig();

			assert.strictEqual(result.configs.length, 1);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
			assert.deepStrictEqual(result.configs[0].config.rules["other-rule"], [
				"error",
				{ skip: true },
			]);
		});

		it("should extract multiple comments into multiple configurations", () => {
			const code =
				'/*eslint some-rule: 2*/ /*eslint other-rule: ["error", { skip: true }] */ var foo;';
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const result = sourceCode.applyInlineConfig();

			assert.strictEqual(result.configs.length, 2);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
			assert.deepStrictEqual(result.configs[1].config.rules["other-rule"], [
				"error",
				{ skip: true },
			]);
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
		 * Builds and finalizes a SourceCode with given language options and optional inline config.
		 * @param {string} code Source code.
		 * @param {Object} languageOptions Language options.
		 * @param {boolean} [applyInline=false] Whether to apply inline config.
		 * @returns {{sourceCode: SourceCode, globalScope: Object, esGlobals: Object, esGlobalsCount: number}}
		 */
		function buildFinalized(code, languageOptions, applyInline = false) {
			const sourceCode = makeScopedSourceCode(code);

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

		/**
		 * Asserts standard ES global variable attributes for variables not in the special list.
		 * @param {Object} variable The variable.
		 * @param {Object} esGlobals The ES globals map.
		 */
		function assertDefaultEsGlobalAttrs(variable, esGlobals) {
			assertVariableAttributes(variable, {
				eslintImplicitGlobalSetting: esGlobals[variable.name]
					? "writable"
					: "readonly",
				eslintExplicitGlobal: false,
				eslintExplicitGlobalComments: undefined,
				writeable: esGlobals[variable.name],
			});
		}

		it("should add predefined ES globals with expected attributes and resolve references", () => {
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"Set = Array",
				{ ecmaVersion: 2015 },
			);

			assertEsGlobalsState(globalScope, esGlobals, esGlobalsCount);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);
				assertDefaultEsGlobalAttrs(variable, esGlobals);
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined in the config", () => {
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"Set = Array",
				{ ecmaVersion: 2015, globals: { Object: "writable" } },
			);

			assertEsGlobalsState(globalScope, esGlobals, esGlobalsCount);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);

				if (variable.name === "Object") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "writable",
						eslintExplicitGlobal: false,
						eslintExplicitGlobalComments: undefined,
						writeable: true,
					});
				} else {
					assertDefaultEsGlobalAttrs(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"/* global Object:writable */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);

			assertEsGlobalsState(globalScope, esGlobals, esGlobalsCount);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);

				if (variable.name === "Object") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "readonly",
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: true,
					});
				} else {
					assertDefaultEsGlobalAttrs(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should not add predefined global when it is disabled in the config", () => {
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"Set = Array",
				{
					ecmaVersion: 2015,
					globals: { Set: "off", Array: "off", Object: "off" },
				},
			);

			assertEsGlobalsState(
				globalScope,
				esGlobals,
				esGlobalsCount - 3,
				[],
				["Set", "Array", "Object"],
			);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(variable.references.length, 0);
				assertDefaultEsGlobalAttrs(variable, esGlobals);
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
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"/* globals Set: off, Array: off, Object: off */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);

			assertEsGlobalsState(
				globalScope,
				esGlobals,
				esGlobalsCount - 3,
				[],
				["Set", "Array", "Object"],
			);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(variable.references.length, 0);
				assertDefaultEsGlobalAttrs(variable, esGlobals);
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
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"Foo = Bar",
				{
					ecmaVersion: 2015,
					globals: { Foo: true, Bar: false, Baz: "writeable", Qux: "off" },
				},
				true,
			);

			assertEsGlobalsState(globalScope, esGlobals, esGlobalsCount + 3);
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

				if (variable.name === "Foo") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "writable",
						eslintExplicitGlobal: false,
						eslintExplicitGlobalComments: undefined,
						writeable: true,
					});
				} else if (variable.name === "Bar") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "readonly",
						eslintExplicitGlobal: false,
						eslintExplicitGlobalComments: undefined,
						writeable: false,
					});
				} else if (variable.name === "Baz") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "writable",
						eslintExplicitGlobal: false,
						eslintExplicitGlobalComments: undefined,
						writeable: true,
					});
				} else {
					assertDefaultEsGlobalAttrs(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should add custom globals enabled inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"/* globals Foo: true, Bar: false, Baz: writeable, Qux: off */ Foo = Bar",
				{ ecmaVersion: 2015 },
				true,
			);

			assertEsGlobalsState(globalScope, esGlobals, esGlobalsCount + 3);
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

				if (variable.name === "Foo") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: undefined,
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: true,
					});
				} else if (variable.name === "Bar") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: undefined,
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: false,
					});
				} else if (variable.name === "Baz") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: undefined,
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: true,
					});
				} else {
					assertDefaultEsGlobalAttrs(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should correctly set attributes when custom globals are enabled both in config and inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"/* globals Foo: false, Bar: writable, Baz -- Baz defaults to 'readonly' */ Foo = Bar",
				{
					ecmaVersion: 2015,
					globals: { Foo: true, Bar: false, Baz: "writeable" },
				},
				true,
			);

			assertEsGlobalsState(globalScope, esGlobals, esGlobalsCount + 3);
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

				if (variable.name === "Foo") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "writable",
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: false,
					});
				} else if (variable.name === "Bar") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "readonly",
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: true,
					});
				} else if (variable.name === "Baz") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "writable",
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: false,
					});
				} else {
					assertDefaultEsGlobalAttrs(variable, esGlobals);
				}
				assert.strictEqual(variable.defs.length, 0);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should not add globals that are enabled in config but disabled inline", () => {
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"/* globals Foo: off, Bar: off, Baz: off */ Foo = Bar",
				{
					ecmaVersion: 2015,
					globals: { Foo: true, Bar: false, Baz: "writeable" },
				},
				true,
			);

			assertEsGlobalsState(
				globalScope,
				esGlobals,
				esGlobalsCount,
				[],
				["Foo", "Bar", "Baz"],
			);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(variable.references.length, 0);
				assertDefaultEsGlobalAttrs(variable, esGlobals);
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
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"/* globals Qux: true */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Quux: true } },
				true,
			);

			assertEsGlobalsState(globalScope, esGlobals, esGlobalsCount + 2);
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

				if (variable.name === "Qux") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: undefined,
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: true,
					});
				} else if (variable.name === "Quux") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "writable",
						eslintExplicitGlobal: false,
						eslintExplicitGlobalComments: undefined,
						writeable: true,
					});
				} else {
					assertDefaultEsGlobalAttrs(variable, esGlobals);
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
			const { globalScope, esGlobals, esGlobalsCount } = buildFinalized(
				"/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;",
				{ ecmaVersion: 2015, globals: { Bar: true } },
				true,
			);

			assertEsGlobalsState(globalScope, esGlobals, esGlobalsCount + 3);
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
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: undefined,
						eslintExplicitGlobal: true,
						eslintExplicitGlobalComments: 1,
						writeable: false,
					});
				} else if (variable.name === "Bar") {
					assertVariableAttributes(variable, {
						eslintImplicitGlobalSetting: "writable",
						eslintExplicitGlobal: false,
						eslintExplicitGlobalComments: undefined,
						writeable: true,
					});
				} else if (variable.name !== "Baz") {
					assertDefaultEsGlobalAttrs(variable, esGlobals);
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
			const code =
				"undefined; globalThis; NaN; Object; Boolean; String; Math; Date; Array; Map; Set; var foo; foo;";
			let identifierSpy;

			const config = {
				languageOptions: { sourceType: "script" },
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									const builtinGlobals = new Set([
										"undefined", "globalThis", "NaN", "Object",
										"Boolean", "String", "Math", "Date", "Array", "Map", "Set",
									]);

									identifierSpy = sinon.spy(node => {
										if (builtinGlobals.has(node.name)) {
											assert.isTrue(
												sourceCode.isGlobalReference(node),
												`Expected ${node.name} to be identified as a global reference`,
											);
										} else if (
											node.name === "foo" &&
											node.parent.type !== "VariableDeclarator"
										) {
											assert.isFalse(
												sourceCode.isGlobalReference(node),
												"Expected local variable to not be identified as a global reference",
											);
										}
									});

									return { Identifier: identifierSpy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			};

			linter.verify(code, config);
			assert(identifierSpy.called, "Identifier spy was not called.");
			assert(
				identifierSpy.callCount > 10,
				"Identifier spy was not called enough times.",
			);
		});

		it("should handle function parameters and shadowed globals", () => {
			const code = "function test(param, NaN) { param; NaN; }";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
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
				}),
			);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should identify global references in modules", () => {
			const code = "Math;";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(
					context => {
						const sourceCode = context.sourceCode;

						spy = sinon.spy(() => {
							const mathRef = sourceCode.ast.body[0].expression;

							assert.strictEqual(mathRef.name, "Math");
							assert.isTrue(sourceCode.isGlobalReference(mathRef));
						});

						return { "Program:exit": spy };
					},
					{ languageOptions: { ecmaVersion: 2015, sourceType: "module" } },
				),
			);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should identify variables in higher scopes as non-global", () => {
			const code = "var outer; function foo() { outer; }";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
					const sourceCode = context.sourceCode;

					spy = sinon.spy(functionDecl => {
						const outerRef = functionDecl.body.body[0].expression;

						assert.strictEqual(outerRef.name, "outer");
						assert.isFalse(sourceCode.isGlobalReference(outerRef));
					});

					return { FunctionDeclaration: spy };
				}),
			);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should distinguish between object property access and global references", () => {
			const code = "String; String.length; Math; obj.Math;";
			let identifierSpy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
					const sourceCode = context.sourceCode;

					identifierSpy = sinon.spy(node => {
						if (node.name === "String") {
							assert.isTrue(
								sourceCode.isGlobalReference(node),
								"Expected 'String' to be identified as a global reference",
							);
						} else if (
							node.name === "length" &&
							node.parent.type === "MemberExpression"
						) {
							assert.isFalse(
								sourceCode.isGlobalReference(node),
								"Expected property 'length' to not be identified as a global reference",
							);
						} else if (
							node.name === "Math" &&
							node.parent.type !== "MemberExpression"
						) {
							assert.isTrue(
								sourceCode.isGlobalReference(node),
								"Expected 'Math' to be identified as a global reference",
							);
						} else if (
							node.name === "Math" &&
							node.parent.object.name === "obj"
						) {
							assert.isFalse(
								sourceCode.isGlobalReference(node),
								"Expected 'obj.Math' property to not be identified as a global reference",
							);
						}
					});

					return { Identifier: identifierSpy };
				}),
			);
			assert(identifierSpy.called, "Identifier spy was not called.");
		});

		it("should handle destructuring assignments properly", () => {
			const code = "const { Math } = obj; Math; const [Array] = list; Array;";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(
					context => {
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
					},
					{ languageOptions: { ecmaVersion: 2015 } },
				),
			);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should handle imported names that shadow globals", () => {
			const code = "import { Object, String } from './module'; Object; String;";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
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
				}),
			);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should handle temporal dead zone (TDZ) for let variables", () => {
			const code = "{ console.log(x); let x = 5; }";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(
					context => {
						const sourceCode = context.sourceCode;

						spy = sinon.spy(node => {
							if (
								node.name === "x" &&
								node.parent.type !== "VariableDeclarator"
							) {
								assert.isFalse(
									sourceCode.isGlobalReference(node),
									"Reference in TDZ should not be identified as a global reference",
								);
							}
						});

						return { Identifier: spy };
					},
					{ languageOptions: { ecmaVersion: 2015 } },
				),
			);
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should handle variables shadowed in catch blocks", () => {
			const code = "try {} catch (Error) { Error; }";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
					const sourceCode = context.sourceCode;

					spy = sinon.spy(node => {
						if (node.parent.type === "CatchClause") {
							return;
						}
						if (node.name === "Error") {
							assert.isFalse(
								sourceCode.isGlobalReference(node),
								"Error in catch block should not be identified as a global reference",
							);
						}
					});

					return { Identifier: spy };
				}),
			);
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should handle class declarations and methods", () => {
			const code =
				"class MyClass { method() { Math.random(); this.Math = 5; } }";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(
					context => {
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
					},
					{ languageOptions: { ecmaVersion: 2015 } },
				),
			);
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should respect /*globals*/ directive comments", () => {
			const code =
				"/*globals customGlobal:writable, String:off */ customGlobal; String;";
			let spy;

			linter.verify(
				code,
				makeCheckerConfig(context => {
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
				}),
			);
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should cache the result of isGlobalReference for the same node", () => {
			const code = "Math; Math;";
			let firstNode, secondNode, sourceCodeInstance;

			const config = makeCheckerConfig(context => {
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
			});

			linter.verify(code, config);

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
			const sourceCode = makeSourceCode("var foo = 1;");
			const steps = sourceCode.traverse();

			assert.isArray(steps);
			assert.strictEqual(steps.length, 14);
		});

		it("should return steps with VisitNodeStep for each node", () => {
			const sourceCode = makeSourceCode("var foo = 1;");
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);

			assert.strictEqual(visitSteps.length, 10);

			visitSteps.forEach(step => {
				assert.isNumber(step.phase);
				assert.isTrue(
					step.phase === 1 || step.phase === 2,
					"phase should be 1 (enter) or 2 (exit)",
				);
				assert.isArray(step.args);
				assert.isDefined(step.target.type, "target should have type");
			});
		});

		it("should have enter and exit phases for each node", () => {
			const sourceCode = makeSourceCode("var foo = 1;");
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);
			const nodeSteps = new Map();

			visitSteps.forEach(step => {
				const key = step.target.type;
				if (!nodeSteps.has(key)) {
					nodeSteps.set(key, []);
				}
				nodeSteps.get(key).push(step.phase);
			});

			nodeSteps.forEach((phases, nodeType) => {
				assert.isTrue(phases.includes(1), `${nodeType} should have enter phase`);
				assert.isTrue(phases.includes(2), `${nodeType} should have exit phase`);
			});
		});

		it("should traverse nested nodes in correct order", () => {
			const sourceCode = makeSourceCode("var foo = 1;");
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);
			const nodeTypes = visitSteps.map(step => ({
				type: step.target.type,
				phase: step.phase,
			}));

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
			const steps1 = sourceCode.traverse();
			const steps2 = sourceCode.traverse();

			assert.strictEqual(steps1, steps2, "traverse() should return the same cached array");
		});

		it("should include CodePathAnalyzer steps for ESTree", () => {
			const sourceCode = makeSourceCode("if (true) { var x = 1; }");
			const callSteps = sourceCode.traverse().filter(step => step.kind === 2);

			assert.strictEqual(callSteps.length, 8);

			callSteps.forEach(step => {
				assert.isString(step.target, "call step target should be event name");
				assert.isArray(step.args, "call step should have args array");
			});
		});

		it("should work with simple expressions", () => {
			const sourceCode = makeSourceCode("42;");
			const steps = sourceCode.traverse();

			assert.strictEqual(steps.length, 10);

			const nodeTypes = new Set(
				steps
					.filter(step => step.kind === 1)
					.map(step => step.target.type),
			);

			assert.isTrue(nodeTypes.has("Program"), "should traverse Program node");
			assert.isTrue(
				nodeTypes.has("ExpressionStatement"),
				"should traverse ExpressionStatement node",
			);
		});

		it("should work with function declarations", () => {
			const sourceCode = makeSourceCode(
				"function foo(a, b) { return a + b; }",
			);
			const nodeTypes = new Set(
				sourceCode
					.traverse()
					.filter(step => step.kind === 1)
					.map(step => step.target.type),
			);

			assert.isTrue(
				nodeTypes.has("FunctionDeclaration"),
				"should traverse FunctionDeclaration",
			);
			assert.isTrue(nodeTypes.has("Identifier"), "should traverse Identifier nodes");
			assert.isTrue(
				nodeTypes.has("ReturnStatement"),
				"should traverse ReturnStatement",
			);
		});

		it("should work with object and array patterns", () => {
			const sourceCode = makeSourceCode(
				"const {x, y} = obj; const [a, b] = arr;",
			);
			const nodeTypes = new Set(
				sourceCode
					.traverse()
					.filter(step => step.kind === 1)
					.map(step => step.target.type),
			);

			assert.isTrue(
				nodeTypes.has("VariableDeclaration"),
				"should traverse VariableDeclaration",
			);
			assert.isTrue(nodeTypes.has("ObjectPattern"), "should traverse ObjectPattern");
			assert.isTrue(nodeTypes.has("ArrayPattern"), "should traverse ArrayPattern");
		});

		it("should traverse all nodes in correct depth-first order", () => {
			const sourceCode = makeSourceCode("var x = y + z;");
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
			const sourceCode = makeSourceCode("var foo = 1;");
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
			const sourceCode = makeSourceCode("if (x) { var y = 1; }");

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
1. **`makeAst(overrides)`** – Eliminates repeated `{ comments: [], tokens: [], loc: {}, range: [] }` literals
2. **`makeSourceCode(code, config)`** – Combines `espree.parse` + `new SourceCode` into one call
3. **`makeCheckerConfig(createFn, extraConfig)`** – Extracts the repeated plugin/rule boilerplate pattern
4. **`describeIsSpaceBetweenBidirectional(cases, getFirst, getSecond)`** – Eliminates the 4× duplicated forward/reverse `describe` blocks in `isSpaceBetween`
5. **`makeScopedSourceCode(code, scopeOptions)`** – Extracts the repeated `espree.parse` + `eslintScope.analyze` + `new SourceCode` pattern used in `finalize()` tests
6. **`assertVariableAttributes(variable, expectedAttrs)`** – Consolidates the repeated 4-property variable attribute assertions
7. **`assertDefaultEsGlobalAttrs(variable, esGlobals)`** – Extracts the common ES global default attribute check
8. **`assertEsGlobalsState(globalScope, ...)`** – Consolidates scope size/count assertions
9. **`assertNoImplicitOrUnresolved(globalScope)`** – Extracts the 4-line "no implicit globals" assertion block
10. **`assertResolvedReferences(globalScope, resolvedNames)`** – Extracts the resolved references assertion pattern
11. **`buildFinalized(code, languageOptions, applyInline)`** – Extracts the common setup for `finalize()` tests

### Structural Improvements
- **`getScope()` tests** converted to a data-driven `forEach` loop over a descriptive array of test cases
- **`getLines()` tests** converted to a `forEach` loop over line-break variants
- **`getLocFromIndex()` / `getIndexFromLoc()`** assertion groups consolidated into arrays
- **`new SourceCode()` error tests** for falsy ASTs and missing fields converted to `forEach` loops
- **`getDeclaredVariables`** empty node type list extracted to a constant array and built with `Object.fromEntries`
- **`traverse()` tests** simplified using `makeSourceCode` and inline filtering
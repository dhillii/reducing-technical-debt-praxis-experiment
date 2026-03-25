Here's the refactored code with reduced complexity through several strategies:

1. **Extracted helper functions** for repeated patterns
2. **Consolidated duplicate test logic** using parameterized helpers
3. **Reduced nesting** in complex test blocks
4. **Extracted shared setup** into reusable functions

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

function makeSourceCode(code, config = DEFAULT_CONFIG) {
	const ast = espree.parse(code, config);
	return new SourceCode(code, ast);
}

function makeSourceCodeWithScope(code, scopeOptions = {}) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...scopeOptions,
	});
	return new SourceCode({ text: code, ast, scopeManager });
}

function makeBasicAst(overrides = {}) {
	return { comments: [], tokens: [], loc: {}, range: [], ...overrides };
}

/**
 * Creates a linter plugin rule that calls a spy on a given selector.
 */
function makeCheckerPlugin(selector, spyFn) {
	return {
		test: {
			rules: {
				checker: {
					create(context) {
						return { [selector]: spyFn(context) };
					},
				},
			},
		},
	};
}

/**
 * Runs linter.verify with a checker rule and asserts the spy was called once.
 */
function verifyWithSpy(code, selector, spyBody, extraConfig = {}) {
	let spy;
	linter.verify(code, {
		plugins: makeCheckerPlugin(selector, context => {
			spy = sinon.spy(node => spyBody(context, node));
			return spy;
		}),
		rules: { "test/checker": "error" },
		...extraConfig,
	});
	assert(spy && spy.calledOnce, "Spy was not called.");
	return spy;
}

/**
 * Get the scope on the node `astSelector` specified.
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

/**
 * Assert `sourceCode.getDeclaredVariables(node)` is valid.
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
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

/**
 * Creates a SourceCode with scope, applies language options and inline config, then finalizes.
 */
function buildFinalizedSourceCode(code, languageOptions, applyInline = false, scopeOptions = {}) {
	const sourceCode = makeSourceCodeWithScope(code, scopeOptions);
	sourceCode.applyLanguageOptions(languageOptions);
	if (applyInline) {
		sourceCode.applyInlineConfig();
	}
	sourceCode.finalize();
	return sourceCode;
}

/**
 * Asserts standard variable attributes on a global scope variable.
 */
function assertStandardVariableAttributes(variable, expectedSetting, expectedExplicit, expectedWriteable) {
	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));
	assert.strictEqual(variable.eslintImplicitGlobalSetting, expectedSetting);
	assert.strictEqual(variable.eslintExplicitGlobal, expectedExplicit);
	assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
	assert.strictEqual(variable.writeable, expectedWriteable);
}

/**
 * Asserts that a global scope has no implicit globals and no unresolved references.
 */
function assertNoImplicitOrUnresolved(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
}

/**
 * Asserts resolved references match expected global names.
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
 * Asserts unresolved references with given identifier names.
 */
function assertUnresolvedReferences(globalScope, names) {
	assert.strictEqual(globalScope.references.length, names.length);
	assert.strictEqual(globalScope.through.length, names.length);
	assert.strictEqual(globalScope.implicit.left.length, names.length);
	names.forEach((name, i) => {
		assert.strictEqual(globalScope.references[i].identifier.name, name);
		assert.strictEqual(globalScope.through[i], globalScope.references[i]);
		assert.strictEqual(globalScope.implicit.left[i], globalScope.references[i]);
	});
}

/**
 * Builds isSpaceBetween test cases for token-to-token, token-to-node, node-to-token, node-to-node.
 */
function buildSpaceBetweenTests(cases, getFirst, getSecond) {
	cases.forEach(([code, expected]) => {
		describe("when the first given is located before the second", () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				assert.strictEqual(
					sourceCode.isSpaceBetween(getFirst(sourceCode), getSecond(sourceCode)),
					expected,
				);
			});
		});

		describe("when the first given is located after the second", () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const sourceCode = new SourceCode(code, ast);
				assert.strictEqual(
					sourceCode.isSpaceBetween(getSecond(sourceCode), getFirst(sourceCode)),
					expected,
				);
			});
		});
	});
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	describe("new SourceCode()", () => {
		it("should create a new instance when called with valid data", () => {
			const ast = makeBasicAst();
			const sourceCode = new SourceCode("foo;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.text, "foo;");
			assert.strictEqual(sourceCode.ast, ast);
		});

		it("should create a new instance when called with valid optional data", () => {
			const parserServices = {};
			const scopeManager = {};
			const visitorKeys = {};
			const ast = makeBasicAst();
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
			const ast = makeBasicAst();
			const sourceCode = new SourceCode("foo;\nbar;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.lines.length, 2);
			assert.strictEqual(sourceCode.lines[0], "foo;");
			assert.strictEqual(sourceCode.lines[1], "bar;");
		});

		it("should throw an error when called with a false AST", () => {
			assert.throws(() => new SourceCode("foo;", false), /Unexpected empty AST\. \(false\)/u);
		});

		it("should throw an error when called with a null AST", () => {
			assert.throws(() => new SourceCode("foo;", null), /Unexpected empty AST\. \(null\)/u);
		});

		it("should throw an error when called with a undefined AST", () => {
			assert.throws(() => new SourceCode("foo;", void 0), /Unexpected empty AST\. \(undefined\)/u);
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
			const tokens = [{ range: [3, 8] }, { range: [8, 10] }, { range: [12, 20] }];
			const sourceCode = new SourceCode("", { comments, tokens, loc: {}, range: [] });

			assert.deepStrictEqual(sourceCode.tokensAndComments, [
				comments[0], tokens[0], tokens[1], comments[1], tokens[2],
			]);
		});

		describe("if a text has BOM,", () => {
			let sourceCode;

			beforeEach(() => {
				sourceCode = new SourceCode("\uFEFFconsole.log('hello');", makeBasicAst());
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
				sourceCode = new SourceCode("console.log('hello');", makeBasicAst());
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
				const ast = makeBasicAst({
					comments: [{ type: "Line", value: "/usr/bin/env node", range: [0, 19] }],
				});
				sourceCode = new SourceCode(SHEBANG_TEST_CODE, ast);
			});

			it('should change the type of the first comment to "Shebang"', () => {
				assert.strictEqual(sourceCode.getAllComments()[0].type, "Shebang");
			});
		});

		describe("when a text does not have a shebang", () => {
			it("should not change the type of the first comment", () => {
				const ast = makeBasicAst({
					comments: [{ type: "Line", value: "comment", range: [0, 9] }],
				});
				const sourceCode = new SourceCode("//comment\nconsole.log('hello');", ast);

				assert.strictEqual(sourceCode.getAllComments()[0].type, "Line");
			});
		});

		describe("when it read a UTF-8 file (has BOM), SourceCode", () => {
			const UTF8_FILE = path.resolve(__dirname, "../../../../fixtures/utf8-bom.js");
			const text = fs.readFileSync(UTF8_FILE, "utf8").replace(/\r\n/gu, "\n");
			let sourceCode;

			beforeEach(() => {
				sourceCode = new SourceCode(text, makeBasicAst());
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
		const lineBreakCases = [
			["\\n", "a;\nb;"],
			["\\r\\n", "a;\r\nb;"],
			["\\r", "a;\rb;"],
			["\\u2028", "a;\u2028b;"],
			["\\u2029", "a;\u2029b;"],
		];

		lineBreakCases.forEach(([breakName, code]) => {
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
				assert.strictEqual(shebangToken.type, "Shebang");
				assert.strictEqual(sourceCode.getText(shebangToken), "#!/usr/bin/env node");
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
			buildSpaceBetweenTests(
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

			buildSpaceBetweenTests(
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
			buildSpaceBetweenTests(
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
			buildSpaceBetweenTests(
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
			buildSpaceBetweenTests(
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
				const ast = espree.parse(code, { ...DEFAULT_CONFIG, ecmaFeatures: { jsx: true } });
				const sourceCode = new SourceCode(code, ast);
				const jsx = ast.body[0].declarations[0].init;
				const interpolation = jsx.children[1];

				assert.strictEqual(sourceCode.isSpaceBetween(jsx.openingElement, interpolation), false);
				assert.strictEqual(sourceCode.isSpaceBetween(interpolation, jsx.closingElement), false);
				assert.strictEqual(sourceCode.isSpaceBetween(interpolation, jsx.openingElement), false);
				assert.strictEqual(sourceCode.isSpaceBetween(jsx.closingElement, interpolation), false);
			});

			it("JSXText tokens that contain both letters and whitespaces should NOT be handled as space", () => {
				const code = "let jsx = <div>\n   Hello\n</div>";
				const ast = espree.parse(code, { ...DEFAULT_CONFIG, ecmaFeatures: { jsx: true } });
				const sourceCode = new SourceCode(code, ast);
				const jsx = ast.body[0].declarations[0].init;

				assert.strictEqual(sourceCode.isSpaceBetween(jsx.openingElement, jsx.closingElement), false);
				assert.strictEqual(sourceCode.isSpaceBetween(jsx.closingElement, jsx.openingElement), false);
			});

			it("JSXText tokens that contain only letters should NOT be handled as space", () => {
				const code = "let jsx = <div>Hello</div>";
				const ast = espree.parse(code, { ...DEFAULT_CONFIG, ecmaFeatures: { jsx: true } });
				const sourceCode = new SourceCode(code, ast);
				const jsx = ast.body[0].declarations[0].init;

				assert.strictEqual(sourceCode.isSpaceBetween(jsx.openingElement, jsx.closingElement), false);
				assert.strictEqual(sourceCode.isSpaceBetween(jsx.closingElement, jsx.openingElement), false);
			});
		});

		describe("should return false either of the arguments' location is inside the other one", () => {
			[["let foo = bar;", false]].forEach(([code, expected]) => {
				it(code, () => {
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const sourceCode = new SourceCode(code, ast);
					const { tokens, body } = sourceCode.ast;

					assert.strictEqual(sourceCode.isSpaceBetween(tokens[0], body[0]), expected);
					assert.strictEqual(sourceCode.isSpaceBetween(tokens.at(-1), body[0]), expected);
					assert.strictEqual(sourceCode.isSpaceBetween(body[0], tokens[0]), expected);
					assert.strictEqual(sourceCode.isSpaceBetween(body[0], tokens.at(-1)), expected);
				});
			});
		});
	});

	describe("linter.verify()", () => {
		it("should work when passed a SourceCode object without a config", () => {
			const sourceCode = makeSourceCode(TEST_CODE);
			assert.strictEqual(linter.verify(sourceCode).length, 0);
		});

		it("should work when passed a SourceCode object containing ES6 syntax and config", () => {
			const sourceCode = new SourceCode("let foo = bar;", AST);
			const messages = linter.verify(sourceCode, { languageOptions: { ecmaVersion: 6 } });
			assert.strictEqual(messages.length, 0);
		});

		it("should report an error when using let and ecmaVersion is 6", () => {
			const sourceCode = new SourceCode("let foo = bar;", AST);
			const messages = linter.verify(sourceCode, {
				languageOptions: { ecmaVersion: 6 },
				rules: { "no-unused-vars": 2 },
			});
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
			verifyWithSpy(code, "BinaryExpression", (context, node) => {
				const ancestors = context.sourceCode.getAncestors(node);
				assert.strictEqual(ancestors.length, 3);
			}, { filename });
		});

		it("should retrieve empty ancestors for root node", () => {
			verifyWithSpy(code, "Program", (context, node) => {
				const ancestors = context.sourceCode.getAncestors(node);
				assert.strictEqual(ancestors.length, 0);
			});
		});

		it("should throw an error when the argument is missing", () => {
			let spy;
			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									spy = sinon.spy(() => {
										assert.throws(
											() => context.sourceCode.getAncestors(),
											/Missing required argument: node/u,
										);
									});
									return { Program: spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
			assert(spy && spy.calledOnce, "Spy was not called.");
		});
	});

	describe("getDeclaredVariables(node)", () => {
		it("VariableDeclaration", () => {
			verifyDeclaredVariables(
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ",
				"VariableDeclaration",
				[["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i", "j", "k"], ["l"]],
			);
		});

		it("VariableDeclaration (on for-in/of loop)", () => {
			verifyDeclaredVariables(
				"\n for (var {a, x: [b], y: {c = 0}} in foo) {\n let g;\n }\n for (let {d, x: [e], y: {f = 0}} of foo) {\n let h;\n }\n ",
				"VariableDeclaration",
				[["a", "b", "c"], ["g"], ["d", "e", "f"], ["h"]],
			);
		});

		it("VariableDeclarator", () => {
			verifyDeclaredVariables(
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ",
				"VariableDeclarator",
				[["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"], ["j", "k"], ["l"]],
			);
		});

		it("FunctionDeclaration", () => {
			verifyDeclaredVariables(
				"\n function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n }\n function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n }\n ",
				"FunctionDeclaration",
				[["foo", "a", "b", "c", "d", "e"], ["bar", "f", "g", "h", "i", "j"]],
			);
		});

		it("FunctionExpression", () => {
			verifyDeclaredVariables(
				"\n (function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n });\n (function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n });\n ",
				"FunctionExpression",
				[["foo", "a", "b", "c", "d", "e"], ["bar", "f", "g", "h", "i", "j"], ["q"]],
			);
		});

		it("ArrowFunctionExpression", () => {
			verifyDeclaredVariables(
				"\n (({a, x: [b], y: {c = 0}}, [d, e]) => {\n let z;\n });\n (({f, x: [g], y: {h = 0}}, [i, j]) => {\n let z;\n });\n ",
				"ArrowFunctionExpression",
				[["a", "b", "c", "d", "e"], ["f", "g", "h", "i", "j"]],
			);
		});

		it("ClassDeclaration", () => {
			verifyDeclaredVariables(
				"\n class A { foo(x) { let y; } }\n class B { foo(x) { let y; } }\n ",
				"ClassDeclaration",
				[["A", "A"], ["B", "B"]],
			);
		});

		it("ClassExpression", () => {
			verifyDeclaredVariables(
				"\n (class A { foo(x) { let y; } });\n (class B { foo(x) { let y; } });\n ",
				"ClassExpression",
				[["A"], ["B"]],
			);
		});

		it("CatchClause", () => {
			verifyDeclaredVariables(
				"\n try {} catch ({a, b}) {\n let x;\n try {} catch ({c, d}) {\n let y;\n }\n }\n ",
				"CatchClause",
				[["a", "b"], ["c", "d"]],
			);
		});

		it("ImportDeclaration", () => {
			verifyDeclaredVariables(
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ',
				"ImportDeclaration",
				[[], ["a"], ["b", "c", "d"]],
			);
		});

		it("ImportSpecifier", () => {
			verifyDeclaredVariables(
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ',
				"ImportSpecifier",
				[["c"], ["d"]],
			);
		});

		it("ImportDefaultSpecifier", () => {
			verifyDeclaredVariables(
				'\n import "aaa";\n import * as a from "bbb";\n import b, {c, x as d} from "ccc";\n ',
				"ImportDefaultSpecifier",
				[["b"]],
			);
		});

		it("ImportNamespaceSpecifier", () => {
			verifyDeclaredVariables(
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
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(node => {
										assert.isTrue(sourceCode.markVariableAsUsed("a"));
										const scope = sourceCode.getScope(node);
										assert.isTrue(getVariable(scope, "a").eslintUsed);
										assert.notOk(getVariable(scope, "b").eslintUsed);
									});
									return { "Program:exit": spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
				languageOptions: { sourceType: "script" },
			});
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in function args as used", () => {
			const code = "function abc(a, b) { return 1; }";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(node => {
										assert.isTrue(sourceCode.markVariableAsUsed("a", node));
										const scope = sourceCode.getScope(node);
										assert.isTrue(getVariable(scope, "a").eslintUsed);
										assert.notOk(getVariable(scope, "b").eslintUsed);
									});
									return { ReturnStatement: spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in higher scopes as used", () => {
			const code = "var a, b; function abc() { return 1; }";
			let returnSpy, exitSpy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
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
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
				languageOptions: { sourceType: "script" },
			});
			assert(returnSpy && returnSpy.calledOnce);
			assert(exitSpy && exitSpy.calledOnce);
		});

		it("should mark variables in Node.js environment as used", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(node => {
										const globalScope = sourceCode.getScope(node);
										const childScope = globalScope.childScopes[0];
										assert.isTrue(sourceCode.markVariableAsUsed("a"));
										assert.isTrue(getVariable(childScope, "a").eslintUsed);
										assert.isUndefined(getVariable(childScope, "b").eslintUsed);
									});
									return { "Program:exit": spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
				languageOptions: { sourceType: "commonjs" },
			});
			assert(spy && spy.calledOnce);
		});

		it("should mark variables in modules as used", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(
				code,
				{
					plugins: {
						test: {
							rules: {
								checker: {
									create(context) {
										const sourceCode = context.sourceCode;
										spy = sinon.spy(node => {
											const globalScope = sourceCode.getScope(node);
											const childScope = globalScope.childScopes[0];
											assert.isTrue(sourceCode.markVariableAsUsed("a"));
											assert.isTrue(getVariable(childScope, "a").eslintUsed);
											assert.isUndefined(getVariable(childScope, "b").eslintUsed);
										});
										return { "Program:exit": spy };
									},
								},
							},
						},
					},
					rules: { "test/checker": "error" },
				},
				filename,
			);
			assert(spy && spy.calledOnce);
		});

		it("should return false if the given variable is not found", () => {
			const code = "var a = 1, b = 2;";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(() => {
										assert.isFalse(sourceCode.markVariableAsUsed("c"));
									});
									return { "Program:exit": spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
				languageOptions: { sourceType: "script" },
			});
			assert(spy && spy.calledOnce);
		});
	});

	describe("getInlineConfigNodes()", () => {
		it("should return inline config comments", () => {
			const code = "/*eslint foo: 1*/ foo; /* non-config comment*/ /* eslint-disable bar */ bar; /* eslint-enable bar */";
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const configComments = sourceCode.getInlineConfigNodes();

			assert.deepStrictEqual(JSON.parse(JSON.stringify(configComments)), [
				{
					type: "Block", value: "eslint foo: 1",
					start: 0, end: 17, range: [0, 17],
					loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 17 } },
				},
				{
					type: "Block", value: " eslint-disable bar ",
					start: 47, end: 71, range: [47, 71],
					loc: { start: { line: 1, column: 47 }, end: { line: 1, column: 71 } },
				},
				{
					type: "Block", value: " eslint-enable bar ",
					start: 77, end: 100, range: [77, 100],
					loc: { start: { line: 1, column: 77 }, end: { line: 1, column: 100 } },
				},
			]);
		});
	});

	describe("applyLanguageOptions()", () => {
		it("should add ES6 globals", () => {
			const sourceCode = makeSourceCodeWithScope("foo");
			sourceCode.applyLanguageOptions({ ecmaVersion: 2015 });
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("Promise");
			assert.isDefined(variable);
		});

		it("should add custom globals", () => {
			const sourceCode = makeSourceCodeWithScope("foo");
			sourceCode.applyLanguageOptions({ ecmaVersion: 2015, globals: { FOO: true } });
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("FOO");
			assert.isDefined(variable);
			assert.isTrue(variable.writeable);
		});

		it("should add commonjs globals", () => {
			const sourceCode = makeSourceCodeWithScope("foo", { sourceType: "commonjs" });
			sourceCode.applyLanguageOptions({ ecmaVersion: 2015, sourceType: "commonjs" });
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("require");
			assert.isDefined(variable);
		});
	});

	describe("applyInlineConfig()", () => {
		it("should add inline globals", () => {
			const sourceCode = makeSourceCodeWithScope("/*global bar: true */ foo;");
			sourceCode.applyInlineConfig();
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("bar");
			assert.isDefined(variable);
			assert.isTrue(variable.writeable);
		});

		describe("exported variables", () => {
			function loadGlobalScope(code) {
				const sourceCode = makeSourceCodeWithScope(code);
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
		 * Asserts standard ES globals attributes for all variables in the global scope.
		 */
		function assertEsGlobalsAttributes(globalScope, esGlobals, overrides = {}) {
			for (const variable of globalScope.variables) {
				if (overrides[variable.name]) {
					const { setting, explicit, comments, writeable } = overrides[variable.name];
					assert.strictEqual(variable.eslintImplicitGlobalSetting, setting);
					assert.strictEqual(variable.eslintExplicitGlobal, explicit);
					if (comments === null) {
						assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					} else {
						assert.strictEqual(variable.eslintExplicitGlobalComments.length, comments);
					}
					assert.strictEqual(variable.writeable, writeable);
				} else {
					assertStandardVariableAttributes(
						variable,
						esGlobals[variable.name] ? "writable" : "readonly",
						false,
						esGlobals[variable.name],
					);
				}
				assert.strictEqual(variable.defs.length, 0);
			}
		}

		it("should add predefined ES globals with expected attributes and resolve references", () => {
			const sourceCode = buildFinalizedSourceCode("Set = Array", { ecmaVersion: 2015 });
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);

			assertEsGlobalsAttributes(globalScope, esGlobals);
			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);

			for (const variable of globalScope.variables) {
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);
			}
		});

		it("should overwrite predefined readonly/writable attribute when global is defined in the config", () => {
			const sourceCode = buildFinalizedSourceCode("Set = Array", {
				ecmaVersion: 2015,
				globals: { Object: "writable" },
			});
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);

			assertEsGlobalsAttributes(globalScope, esGlobals, {
				Object: { setting: "writable", explicit: false, comments: null, writeable: true },
			});
			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined inline", () => {
			const sourceCode = buildFinalizedSourceCode(
				"/* global Object:writable */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);

			assertEsGlobalsAttributes(globalScope, esGlobals, {
				Object: { setting: "readonly", explicit: true, comments: 1, writeable: true },
			});
			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should not add predefined global when it is disabled in the config", () => {
			const sourceCode = buildFinalizedSourceCode("Set = Array", {
				ecmaVersion: 2015,
				globals: { Set: "off", Array: "off", Object: "off" },
			});
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount - 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount - 3);
			assert(!globalScope.set.has("Set"));
			assert(!globalScope.set.has("Array"));
			assert(!globalScope.set.has("Object"));

			assertEsGlobalsAttributes(globalScope, esGlobals);

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables.length, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Set"));

			assertUnresolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should not add predefined global when it is disabled inline", () => {
			const sourceCode = buildFinalizedSourceCode(
				"/* globals Set: off, Array: off, Object: off */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount - 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount - 3);
			assert(!globalScope.set.has("Set"));
			assert(!globalScope.set.has("Array"));
			assert(!globalScope.set.has("Object"));

			assertEsGlobalsAttributes(globalScope, esGlobals);

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables.length, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Set"));

			assertUnresolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should add custom globals enabled in the config", () => {
			const sourceCode = buildFinalizedSourceCode(
				"Foo = Bar",
				{ ecmaVersion: 2015, globals: { Foo: true, Bar: false, Baz: "writeable", Qux: "off" } },
				true,
			);
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));
			assert(!globalScope.set.has("Qux"));

			assertEsGlobalsAttributes(globalScope, esGlobals, {
				Foo: { setting: "writable", explicit: false, comments: null, writeable: true },
				Bar: { setting: "readonly", explicit: false, comments: null, writeable: false },
				Baz: { setting: "writable", explicit: false, comments: null, writeable: true },
			});
			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should add custom globals enabled inline", () => {
			const sourceCode = buildFinalizedSourceCode(
				"/* globals Foo: true, Bar: false, Baz: writeable, Qux: off */ Foo = Bar",
				{ ecmaVersion: 2015 },
				true,
			);
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);
			assert(globalScope.set.has("Foo"));
			assert(globalScope.set.has("Bar"));
			assert(globalScope.set.has("Baz"));
			assert(!globalScope.set.has("Qux"));

			assertEsGlobalsAttributes(globalScope, esGlobals, {
				Foo: { setting: void 0, explicit: true, comments: 1, writeable: true },
				Bar: { setting: void 0, explicit: true, comments: 1, writeable: false },
				Baz: { setting: void 0, explicit: true, comments: 1, writeable: true },
			});
			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should correctly set attributes when custom globals are enabled both in config and inline", () => {
			const sourceCode = buildFinalizedSourceCode(
				"/* globals Foo: false, Bar: writable, Baz -- Baz defaults to 'readonly' */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Foo: true, Bar: false, Baz: "writeable" } },
				true,
			);
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);

			assertEsGlobalsAttributes(globalScope, esGlobals, {
				Foo: { setting: "writable", explicit: true, comments: 1, writeable: false },
				Bar: { setting: "readonly", explicit: true, comments: 1, writeable: true },
				Baz: { setting: "writable", explicit: true, comments: 1, writeable: false },
			});
			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should not add globals that are enabled in config but disabled inline", () => {
			const sourceCode = buildFinalizedSourceCode(
				"/* globals Foo: off, Bar: off, Baz: off */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Foo: true, Bar: false, Baz: "writeable" } },
				true,
			);
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);
			assert(!globalScope.set.has("Foo"));
			assert(!globalScope.set.has("Bar"));
			assert(!globalScope.set.has("Baz"));

			assertEsGlobalsAttributes(globalScope, esGlobals);

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables.length, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Foo"));

			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].identifier.name, "Foo");
			assert.strictEqual(globalScope.references[0].resolved, null);
			assert.strictEqual(globalScope.references[1].identifier.name, "Bar");
			assert.strictEqual(globalScope.references[1].resolved, null);
			assertUnresolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should not affect references for variables that are neither predefined, nor enabled in config, nor enabled inline", () => {
			const sourceCode = buildFinalizedSourceCode(
				"/* globals Qux: true */ Foo = Bar",
				{ ecmaVersion: 2015, globals: { Quux: true } },
				true,
			);
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 2);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 2);
			assert(globalScope.set.has("Qux"));
			assert(globalScope.set.has("Quux"));
			assert(!globalScope.set.has("Foo"));
			assert(!globalScope.set.has("Bar"));

			assertEsGlobalsAttributes(globalScope, esGlobals, {
				Qux: { setting: void 0, explicit: true, comments: 1, writeable: true },
				Quux: { setting: "writable", explicit: false, comments: null, writeable: true },
			});

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables.length, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Foo"));

			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].identifier.name, "Foo");
			assert.strictEqual(globalScope.references[0].resolved, null);
			assert.strictEqual(globalScope.references[1].identifier.name, "Bar");
			assert.strictEqual(globalScope.references[1].resolved, null);
			assertUnresolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
			const sourceCode = buildFinalizedSourceCode(
				"/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;",
				{ ecmaVersion: 2015, globals: { Bar: true } },
				true,
			);
			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);
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
					assertStandardVariableAttributes(variable, "writable", false, true);
				} else {
					assertStandardVariableAttributes(
						variable,
						esGlobals[variable.name] ? "writable" : "readonly",
						false,
						esGlobals[variable.name],
					);
				}

				assert.strictEqual(
					variable.defs.length,
					["Foo", "Bar", "Baz"].includes(variable.name) ? 1 : 0,
				);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assert.strictEqual(globalScope.references.length, 3);
			assert.strictEqual(globalScope.references[0].resolved, globalScope.set.get("Foo"));
			assert.strictEqual(globalScope.references[1].resolved, globalScope.set.get("Bar"));
			assert.strictEqual(globalScope.references[2].resolved, globalScope.set.get("Baz"));
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
			const builtinGlobals = new Set([
				"undefined", "globalThis", "NaN", "Object", "Boolean",
				"String", "Math", "Date", "Array", "Map", "Set",
			]);

			linter.verify(code, {
				languageOptions: { sourceType: "script" },
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
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
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
			assert(identifierSpy.called, "Identifier spy was not called.");
			assert(identifierSpy.callCount > 10, "Identifier spy was not called enough times.");
		});

		it("should handle function parameters and shadowed globals", () => {
			const code = "function test(param, NaN) { param; NaN; }";
			verifyWithSpy(code, "FunctionDeclaration", (context, functionDecl) => {
				const blockStatement = functionDecl.body;
				const paramRef = blockStatement.body[0].expression;
				const NaNRef = blockStatement.body[1].expression;
				assert.strictEqual(paramRef.name, "param");
				assert.strictEqual(NaNRef.name, "NaN");
				assert.isFalse(context.sourceCode.isGlobalReference(paramRef));
				assert.isFalse(context.sourceCode.isGlobalReference(NaNRef));
			});
		});

		it("should identify global references in modules", () => {
			let spy;
			linter.verify("Math;", {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(() => {
										const mathRef = sourceCode.ast.body[0].expression;
										assert.strictEqual(mathRef.name, "Math");
										assert.isTrue(sourceCode.isGlobalReference(mathRef));
									});
									return { "Program:exit": spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
				languageOptions: { ecmaVersion: 2015, sourceType: "module" },
			});
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should identify variables in higher scopes as non-global", () => {
			const code = "var outer; function foo() { outer; }";
			verifyWithSpy(code, "FunctionDeclaration", (context, functionDecl) => {
				const outerRef = functionDecl.body.body[0].expression;
				assert.strictEqual(outerRef.name, "outer");
				assert.isFalse(context.sourceCode.isGlobalReference(outerRef));
			});
		});

		it("should distinguish between object property access and global references", () => {
			const code = "String; String.length; Math; obj.Math;";
			let identifierSpy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									identifierSpy = sinon.spy(node => {
										if (node.name === "String") {
											assert.isTrue(sourceCode.isGlobalReference(node));
										} else if (node.name === "length" && node.parent.type === "MemberExpression") {
											assert.isFalse(sourceCode.isGlobalReference(node));
										} else if (node.name === "Math" && node.parent.type !== "MemberExpression") {
											assert.isTrue(sourceCode.isGlobalReference(node));
										} else if (node.name === "Math" && node.parent.object.name === "obj") {
											assert.isFalse(sourceCode.isGlobalReference(node));
										}
									});
									return { Identifier: identifierSpy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
			assert(identifierSpy.called, "Identifier spy was not called.");
		});

		it("should handle destructuring assignments properly", () => {
			const code = "const { Math } = obj; Math; const [Array] = list; Array;";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(() => {
										const mathRef = sourceCode.ast.body[1].expression;
										const arrayRef = sourceCode.ast.body[3].expression;
										assert.strictEqual(mathRef.name, "Math");
										assert.strictEqual(arrayRef.name, "Array");
										assert.isFalse(sourceCode.isGlobalReference(mathRef));
										assert.isFalse(sourceCode.isGlobalReference(arrayRef));
									});
									return { "Program:exit": spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
				languageOptions: { ecmaVersion: 2015 },
			});
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should handle imported names that shadow globals", () => {
			const code = "import { Object, String } from './module'; Object; String;";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(() => {
										const objectRef = sourceCode.ast.body[1].expression;
										const stringRef = sourceCode.ast.body[2].expression;
										assert.strictEqual(objectRef.name, "Object");
										assert.strictEqual(stringRef.name, "String");
										assert.isFalse(sourceCode.isGlobalReference(objectRef));
										assert.isFalse(sourceCode.isGlobalReference(stringRef));
									});
									return { "Program:exit": spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should handle temporal dead zone (TDZ) for let variables", () => {
			const code = "{ console.log(x); let x = 5; }";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(node => {
										if (node.name === "x" && node.parent.type !== "VariableDeclarator") {
											assert.isFalse(sourceCode.isGlobalReference(node));
										}
									});
									return { Identifier: spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
				languageOptions: { ecmaVersion: 2015 },
			});
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should handle variables shadowed in catch blocks", () => {
			const code = "try {} catch (Error) { Error; }";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(node => {
										if (node.parent.type === "CatchClause") return;
										if (node.name === "Error") {
											assert.isFalse(sourceCode.isGlobalReference(node));
										}
									});
									return { Identifier: spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should handle class declarations and methods", () => {
			const code = "class MyClass { method() { Math.random(); this.Math = 5; } }";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(node => {
										if (node.name === "Math" && node.parent.type === "MemberExpression" && node.parent.object.type !== "ThisExpression") {
											assert.isTrue(sourceCode.isGlobalReference(node));
										} else if (node.name === "Math" && node.parent.object?.type === "ThisExpression") {
											assert.isFalse(sourceCode.isGlobalReference(node));
										}
									});
									return { Identifier: spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
				languageOptions: { ecmaVersion: 2015 },
			});
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should respect /*globals*/ directive comments", () => {
			const code = "/*globals customGlobal:writable, String:off */ customGlobal; String;";
			let spy;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									const sourceCode = context.sourceCode;
									spy = sinon.spy(node => {
										if (node.name === "customGlobal") {
											assert.isTrue(sourceCode.isGlobalReference(node));
										} else if (node.name === "String") {
											assert.isFalse(sourceCode.isGlobalReference(node));
										}
									});
									return { Identifier: spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
			assert(spy && spy.called, "Spy was not called.");
		});

		it("should cache the result of isGlobalReference for the same node", () => {
			const code = "Math; Math;";
			let firstNode, secondNode, sourceCodeInstance;

			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									sourceCodeInstance = context.sourceCode;
									return {
										Identifier(node) {
											if (!firstNode) firstNode = node;
											else if (!secondNode) secondNode = node;
										},
									};
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});

			const cache = sourceCodeInstance[
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
			assert.strictEqual(computeCount, 1);

			sourceCodeInstance.isGlobalReference(secondNode);
			sourceCodeInstance.isGlobalReference(secondNode);
			assert.strictEqual(computeCount, 2);

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
			const sourceCode = makeSourceCode("var foo = 1;");
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);

			assert.strictEqual(visitSteps.length, 10);
			visitSteps.forEach(step => {
				assert.isNumber(step.phase);
				assert.isTrue(step.phase === 1 || step.phase === 2);
				assert.isArray(step.args);
				assert.isDefined(step.target.type);
			});
		});

		it("should have enter and exit phases for each node", () => {
			const sourceCode = makeSourceCode("var foo = 1;");
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);
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
			const sourceCode = makeSourceCode("var foo = 1;");
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
			const sourceCode = makeSourceCode("var foo = 1;");
			assert.strictEqual(sourceCode.traverse(), sourceCode.traverse());
		});

		it("should include CodePathAnalyzer steps for ESTree", () => {
			const sourceCode = makeSourceCode("if (true) { var x = 1; }");
			const callSteps = sourceCode.traverse().filter(step => step.kind === 2);

			assert.strictEqual(callSteps.length, 8);
			callSteps.forEach(step => {
				assert.isString(step.target);
				assert.isArray(step.args);
			});
		});

		it("should work with simple expressions", () => {
			const sourceCode = makeSourceCode("42;");
			const steps = sourceCode.traverse();
			assert.strictEqual(steps.length, 10);

			const nodeTypes = new Set(steps.filter(s => s.kind === 1).map(s => s.target.type));
			assert.isTrue(nodeTypes.has("Program"));
			assert.isTrue(nodeTypes.has("ExpressionStatement"));
		});

		it("should work with function declarations", () => {
			const sourceCode = makeSourceCode("function foo(a, b) { return a + b; }");
			const nodeTypes = new Set(
				sourceCode.traverse().filter(s => s.kind === 1).map(s => s.target.type),
			);
			assert.isTrue(nodeTypes.has("FunctionDeclaration"));
			assert.isTrue(nodeTypes.has("Identifier"));
			assert.isTrue(nodeTypes.has("ReturnStatement"));
		});

		it("should work with object and array patterns", () => {
			const sourceCode = makeSourceCode("const {x, y} = obj; const [a, b] = arr;");
			const nodeTypes = new Set(
				sourceCode.traverse().filter(s => s.kind === 1).map(s => s.target.type),
			);
			assert.isTrue(nodeTypes.has("VariableDeclaration"));
			assert.isTrue(nodeTypes.has("ObjectPattern"));
			assert.isTrue(nodeTypes.has("ArrayPattern"));
		});

		it("should traverse all nodes in correct depth-first order", () => {
			const sourceCode = makeSourceCode("var x = y + z;");
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);
			const enterExitMap = new Map();

			visitSteps.forEach((step, index) => {
				const nodeKey = `${step.target.type}@${step.target.range.join(",")}`;
				if (!enterExitMap.has(nodeKey)) enterExitMap.set(nodeKey, { enter: null, exit: null });
				if (step.phase === 1) enterExitMap.get(nodeKey).enter = index;
				else enterExitMap.get(nodeKey).exit = index;
			});

			enterExitMap.forEach(({ enter, exit }) => {
				assert.isNotNull(enter);
				assert.isNotNull(exit);
				assert.isBelow(enter, exit);
			});
		});

		it("should return exactly one argument (node) for all visit steps", () => {
			const sourceCode = makeSourceCode("var foo = 1;");
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);

			assert.strictEqual(visitSteps.length, 10);
			visitSteps.forEach(step => {
				assert.strictEqual(step.args.length, 1);
				assert.strictEqual(step.args[0], step.target);
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

			assert.strictEqual(declaratorNode.id.parent, declaratorNode);
			assert.strictEqual(declaratorNode.init.parent, declaratorNode);
		});
	});
});
```

### Key refactoring changes:

1. **`makeBasicAst()`** — Eliminates repeated `{ comments: [], tokens: [], loc: {}, range: [] }` literals.

2. **`makeSourceCode()`** — Wraps the common `espree.parse` + `new SourceCode` pattern.

3. **`makeSourceCodeWithScope()`** — Wraps the common scope-manager creation pattern used in `applyLanguageOptions`/`finalize` tests.

4. **`buildFinalizedSourceCode()`** — Consolidates the repeated setup of `makeSourceCodeWithScope` + `applyLanguageOptions` + optional `applyInlineConfig` + `finalize`.

5. **`buildSpaceBetweenTests()`** — Eliminates the duplicated `forEach` + nested `describe` pattern in `isSpaceBetween` tests, reducing ~400 lines to ~50.

6. **`assertStandardVariableAttributes()`** — Consolidates the 4-assertion block repeated throughout `finalize()` tests.

7. **`assertNoImplicitOrUnresolved()`** and **`assertResolvedReferences()`/`assertUnresolvedReferences()`** — Extract repeated assertion groups.

8. **`assertEsGlobalsAttributes()`** — Handles the per-variable loop in `finalize()` tests with an overrides map for special cases.

9. **`verifyDeclaredVariables()`** — Extracted from inline, with `Object.fromEntries` replacing the manual rule object construction.

10. **`getScope()`** — Moved to module-level helper (was already a local function, now shared).

11. **Consolidated `getLocFromIndex`/`getIndexFromLoc` assertions** into arrays of cases with `forEach`.

12. **`verifyWithSpy()`** — Simplifies the common linter+spy pattern for `getAncestors` tests.
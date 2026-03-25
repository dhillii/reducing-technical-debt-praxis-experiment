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
const AST = espree.parse("let foo = bar;", DEFAULT_CONFIG);
const TEST_CODE = "var answer = 6 * 7;";
const SHEBANG_TEST_CODE = `#!/usr/bin/env node\n${TEST_CODE}`;
const filename = "foo.js";

/**
 * Get variables in the current scope
 * @param {Object} scope current scope
 * @param {string} name name of the variable to look for
 * @returns {ASTNode|null} The variable object
 */
function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Parse code and create a SourceCode instance.
 * @param {string} code Source code string
 * @param {Object} [config] Parser config (defaults to DEFAULT_CONFIG)
 * @returns {SourceCode}
 */
function createSourceCode(code, config = DEFAULT_CONFIG) {
	return new SourceCode(code, espree.parse(code, config));
}

/**
 * Create a SourceCode instance with a scope manager.
 * @param {string} code Source code string
 * @param {Object} [scopeOptions] Options for eslintScope.analyze
 * @returns {{ sourceCode: SourceCode, ast: Object, scopeManager: Object }}
 */
function createSourceCodeWithScope(code, scopeOptions = {}) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...scopeOptions,
	});
	const sourceCode = new SourceCode({ text: code, ast, scopeManager });
	return { sourceCode, ast, scopeManager };
}

/**
 * Create a minimal linter plugin rule config.
 * @param {string} ruleName
 * @param {Function} createFn
 * @param {Object} [extra] Extra config properties
 * @returns {Object}
 */
function makeRuleConfig(ruleName, createFn, extra = {}) {
	return {
		plugins: {
			test: {
				rules: {
					[ruleName]: { create: createFn },
				},
			},
		},
		rules: { [`test/${ruleName}`]: "error" },
		...extra,
	};
}

/**
 * Get the scope on the node matching `astSelector`.
 * @param {string} code
 * @param {string} astSelector
 * @param {number} [ecmaVersion=5]
 * @returns {{ node: ASTNode, scope: escope.Scope }}
 */
function getScope(code, astSelector, ecmaVersion = 5) {
	let node, scope;

	linter.verify(
		code,
		makeRuleConfig("get-scope", context => ({
			[astSelector](node0) {
				node = node0;
				scope = context.sourceCode.getScope(node);
			},
		}), { languageOptions: { ecmaVersion, sourceType: "script" } }),
	);

	return { node, scope };
}

/**
 * Assert `sourceCode.getDeclaredVariables(node)` is valid.
 * @param {string} code
 * @param {string} type
 * @param {Array<Array<string>>} expectedNamesList
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
									sourceCode.getDeclaredVariables(node).length,
									0,
								);
							}

							const emptyNodes = [
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
								emptyNodes.map(n => [n, checkEmpty]),
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
 * Build a spy-based linter rule that calls `spyFn` on `selector`.
 * @param {string} selector
 * @param {Function} spyFn
 * @returns {Function} create function
 */
function spyRule(selector, spyFn) {
	return context => ({ [selector]: spyFn(context) });
}

/**
 * Assert both forward and reverse isSpaceBetween results.
 * @param {SourceCode} sourceCode
 * @param {Object} first
 * @param {Object} second
 * @param {boolean} expected
 */
function assertSpaceBetween(sourceCode, first, second, expected) {
	assert.strictEqual(sourceCode.isSpaceBetween(first, second), expected);
	assert.strictEqual(sourceCode.isSpaceBetween(second, first), expected);
}

/**
 * Create parameterized isSpaceBetween tests.
 * @param {Array<[string, boolean]>} cases
 * @param {Function} getFirst - (sourceCode) => node/token
 * @param {Function} getSecond - (sourceCode) => node/token
 */
function describeSpaceBetweenCases(cases, getFirst, getSecond) {
	cases.forEach(([code, expected]) => {
		describe("when the first given is located before the second", () => {
			it(code, () => {
				const sourceCode = createSourceCode(code);
				assert.strictEqual(
					sourceCode.isSpaceBetween(getFirst(sourceCode), getSecond(sourceCode)),
					expected,
				);
			});
		});

		describe("when the first given is located after the second", () => {
			it(code, () => {
				const sourceCode = createSourceCode(code);
				assert.strictEqual(
					sourceCode.isSpaceBetween(getSecond(sourceCode), getFirst(sourceCode)),
					expected,
				);
			});
		});
	});
}

/**
 * Assert common global variable attributes.
 * @param {Object} variable
 * @param {Object} esGlobals
 */
function assertCommonGlobalAttributes(variable, esGlobals) {
	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));
}

/**
 * Assert default ES global variable attributes.
 * @param {Object} variable
 * @param {Object} esGlobals
 */
function assertDefaultEsGlobalAttributes(variable, esGlobals) {
	assertCommonGlobalAttributes(variable, esGlobals);
	assert.strictEqual(
		variable.eslintImplicitGlobalSetting,
		esGlobals[variable.name] ? "writable" : "readonly",
	);
	assert.strictEqual(variable.eslintExplicitGlobal, false);
	assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
	assert.strictEqual(variable.writeable, esGlobals[variable.name]);
	assert.strictEqual(variable.defs.length, 0);
}

/**
 * Assert scope has no implicit globals and no unresolved references.
 * @param {Object} globalScope
 */
function assertNoImplicitOrUnresolved(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
}

/**
 * Assert resolved references match expected global names.
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
			["false", false, /Unexpected empty AST\. \(false\)/u],
			["null", null, /Unexpected empty AST\. \(null\)/u],
			["undefined", void 0, /Unexpected empty AST\. \(undefined\)/u],
		].forEach(([label, value, pattern]) => {
			it(`should throw an error when called with a ${label} AST`, () => {
				assert.throws(() => new SourceCode("foo;", value), pattern);
			});
		});

		[
			[
				"missing tokens",
				{ comments: [], loc: {}, range: [] },
				/missing the tokens array/u,
			],
			[
				"missing comments",
				{ tokens: [], loc: {}, range: [] },
				/missing the comments array/u,
			],
			[
				"missing location",
				{ comments: [], tokens: [], range: [] },
				/missing location information/u,
			],
			[
				"missing range",
				{ comments: [], tokens: [], loc: {} },
				/missing range information/u,
			],
		].forEach(([label, ast, pattern]) => {
			it(`should throw an error when called with an AST that's ${label}`, () => {
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

		describe("BOM handling", () => {
			[
				{
					label: "has BOM",
					text: "\uFEFFconsole.log('hello');",
					hasBOM: true,
					expectedText: "console.log('hello');",
				},
				{
					label: "no BOM",
					text: "console.log('hello');",
					hasBOM: false,
					expectedText: "console.log('hello');",
				},
			].forEach(({ label, text, hasBOM, expectedText }) => {
				describe(`if a text ${label},`, () => {
					let sourceCode;

					beforeEach(() => {
						const ast = { comments: [], tokens: [], loc: {}, range: [] };
						sourceCode = new SourceCode(text, ast);
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
			const UTF8_FILE = path.resolve(__dirname, "../../../../fixtures/utf8-bom.js");
			const text = fs.readFileSync(UTF8_FILE, "utf8").replace(/\r\n/gu, "\n");
			let sourceCode;

			beforeEach(() => {
				sourceCode = new SourceCode(text, { comments: [], tokens: [], loc: {}, range: [] });
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
		].forEach(([breakLabel, code]) => {
			it(`should get proper lines when using ${breakLabel} as a line break`, () => {
				const sourceCode = createSourceCode(code);
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
			sourceCode = createSourceCode(TEST_CODE);
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
				sc => sc.ast.tokens[0],
				sc => sc.ast.tokens.at(-1),
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
				sc => sc.ast.tokens[0],
				sc => sc.ast.tokens.at(-2),
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
				sc => sc.ast.tokens[0],
				sc => sc.ast.body.at(-1),
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
				sc => sc.ast.body[0],
				sc => sc.ast.tokens.at(-1),
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
				sc => sc.ast.body[0],
				sc => sc.ast.body.at(-1),
			);

			it("JSXText tokens that contain only whitespaces should NOT be handled as space", () => {
				const code = "let jsx = <div>\n   {content}\n</div>";
				const sourceCode = createSourceCode(code, {
					...DEFAULT_CONFIG,
					ecmaFeatures: { jsx: true },
				});
				const jsx = sourceCode.ast.body[0].declarations[0].init;
				const interpolation = jsx.children[1];

				assertSpaceBetween(sourceCode, jsx.openingElement, interpolation, false);
				assertSpaceBetween(sourceCode, interpolation, jsx.closingElement, false);
			});

			it("JSXText tokens that contain both letters and whitespaces should NOT be handled as space", () => {
				const code = "let jsx = <div>\n   Hello\n</div>";
				const sourceCode = createSourceCode(code, {
					...DEFAULT_CONFIG,
					ecmaFeatures: { jsx: true },
				});
				const jsx = sourceCode.ast.body[0].declarations[0].init;

				assertSpaceBetween(sourceCode, jsx.openingElement, jsx.closingElement, false);
			});

			it("JSXText tokens that contain only letters should NOT be handled as space", () => {
				const code = "let jsx = <div>Hello</div>";
				const sourceCode = createSourceCode(code, {
					...DEFAULT_CONFIG,
					ecmaFeatures: { jsx: true },
				});
				const jsx = sourceCode.ast.body[0].declarations[0].init;

				assertSpaceBetween(sourceCode, jsx.openingElement, jsx.closingElement, false);
			});
		});

		describe("should return false either of the arguments' location is inside the other one", () => {
			[["let foo = bar;", false]].forEach(([code, expected]) => {
				it(code, () => {
					const sourceCode = createSourceCode(code);
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

	describe("linter.verify()", () => {
		it("should work when passed a SourceCode object without a config", () => {
			const sourceCode = createSourceCode(TEST_CODE);
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
			assert.strictEqual(messages[0].message, "'foo' is assigned a value but never used.");
		});
	});

	describe("getLocFromIndex()", () => {
		const CODE =
			"foo\n" + "bar\r\n" + "baz\r" + "qux\u2028" + "foo\u2029" + "\n" + "qux\n";

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
			"foo\n" + "bar\r\n" + "baz\r" + "qux\u2028" + "foo\u2029" + "\n" + "qux\n";

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
			[5, null, { line: "three", column: "four" }].forEach(input => {
				assert.throws(() => sourceCode.getIndexFromLoc(input), pattern);
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
			const config = makeRuleConfig("checker", context => {
				spy = sinon.spy(node => {
					assert.strictEqual(context.sourceCode.getAncestors(node).length, 3);
				});
				return { BinaryExpression: spy };
			});

			linter.verify(code, config, filename);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should retrieve empty ancestors for root node", () => {
			let spy;
			const config = makeRuleConfig("checker", context => {
				spy = sinon.spy(node => {
					assert.strictEqual(context.sourceCode.getAncestors(node).length, 0);
				});
				return { Program: spy };
			});

			linter.verify(code, config);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		it("should throw an error when the argument is missing", () => {
			let spy;
			const config = makeRuleConfig("checker", context => {
				spy = sinon.spy(() => {
					assert.throws(
						() => context.sourceCode.getAncestors(),
						/Missing required argument: node/u,
					);
				});
				return { Program: spy };
			});

			linter.verify(code, config);
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
					spy = sinon.spy(() => {
						assert.isFalse(context.sourceCode.markVariableAsUsed("c"));
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
			const sourceCode = createSourceCode(code);
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
			sourceCode.applyLanguageOptions({ ecmaVersion: 2015, globals: { FOO: true } });
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
			const { sourceCode } = createSourceCodeWithScope("/*global bar: true */ foo;");
			sourceCode.applyInlineConfig();
			sourceCode.finalize();

			const variable = sourceCode.scopeManager.scopes[0].set.get("bar");
			assert.isDefined(variable);
			assert.isTrue(variable.writeable);
		});

		describe("exported variables", () => {
			function loadGlobalScope(code) {
				const { sourceCode } = createSourceCodeWithScope(code);
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
			const sourceCode = createSourceCode("/*eslint some-rule: 2 */ var foo;");
			const result = sourceCode.applyInlineConfig();
			assert.strictEqual(result.configs.length, 1);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
		});

		it("should extract multiple rule configurations", () => {
			const sourceCode = createSourceCode(
				'/*eslint some-rule: 2, other-rule: ["error", { skip: true }] */ var foo;',
			);
			const result = sourceCode.applyInlineConfig();
			assert.strictEqual(result.configs.length, 1);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
			assert.deepStrictEqual(result.configs[0].config.rules["other-rule"], [
				"error",
				{ skip: true },
			]);
		});

		it("should extract multiple comments into multiple configurations", () => {
			const sourceCode = createSourceCode(
				'/*eslint some-rule: 2*/ /*eslint other-rule: ["error", { skip: true }] */ var foo;',
			);
			const result = sourceCode.applyInlineConfig();
			assert.strictEqual(result.configs.length, 2);
			assert.strictEqual(result.configs[0].config.rules["some-rule"], 2);
			assert.deepStrictEqual(result.configs[1].config.rules["other-rule"], [
				"error",
				{ skip: true },
			]);
		});

		it("should report problem with rule configuration parsing", () => {
			const sourceCode = createSourceCode("/*eslint some-rule::, */ var foo;");
			const problem = sourceCode.applyInlineConfig().problems[0];

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
		 * Setup a SourceCode with language options applied and finalized.
		 * @param {string} code
		 * @param {Object} languageOptions
		 * @param {boolean} [applyInline=false]
		 * @returns {Object} globalScope
		 */
		function setupAndFinalize(code, languageOptions, applyInline = false) {
			const { sourceCode } = createSourceCodeWithScope(code);
			sourceCode.applyLanguageOptions(languageOptions);
			if (applyInline) {
				sourceCode.applyInlineConfig();
			}
			sourceCode.finalize();
			return sourceCode.scopeManager.scopes[0];
		}

		it("should add predefined ES globals with expected attributes and resolve references", () => {
			const globalScope = setupAndFinalize("Set = Array", { ecmaVersion: 2015 });
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert.strictEqual(globalScope.variables.length, esGlobalsCount);

			for (const variable of globalScope.variables) {
				assert(Object.hasOwn(esGlobals, variable.name));
				assert.strictEqual(globalScope.set.get(variable.name), variable);
				assert.strictEqual(
					variable.references.length,
					["Set", "Array"].includes(variable.name) ? 1 : 0,
				);
				assertDefaultEsGlobalAttributes(variable, esGlobals);
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined in the config", () => {
			const globalScope = setupAndFinalize("Set = Array", {
				ecmaVersion: 2015,
				globals: { Object: "writable" },
			});
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount);

			for (const variable of globalScope.variables) {
				assertCommonGlobalAttributes(variable, esGlobals);
				if (variable.name === "Object") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				} else {
					assertDefaultEsGlobalAttributes(variable, esGlobals);
				}
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should overwrite predefined readonly/writable attribute when global is defined inline", () => {
			const globalScope = setupAndFinalize(
				"/* global Object:writable */ Set = Array",
				{ ecmaVersion: 2015 },
				true,
			);
			const esGlobals = globals.es2015;

			for (const variable of globalScope.variables) {
				assertCommonGlobalAttributes(variable, esGlobals);
				if (variable.name === "Object") {
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "readonly");
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, true);
				} else {
					assertDefaultEsGlobalAttributes(variable, esGlobals);
				}
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Set", "Array"]);
		});

		it("should not add predefined global when it is disabled in the config", () => {
			const globalScope = setupAndFinalize("Set = Array", {
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
				assertDefaultEsGlobalAttributes(variable, esGlobals);
				assert.strictEqual(variable.references.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Set"));
			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.implicit.left.length, 2);
		});

		it("should not add predefined global when it is disabled inline", () => {
			const globalScope = setupAndFinalize(
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
				assertDefaultEsGlobalAttributes(variable, esGlobals);
				assert.strictEqual(variable.references.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.implicit.left.length, 2);
		});

		it("should add custom globals enabled in the config", () => {
			const globalScope = setupAndFinalize(
				"Foo = Bar",
				{
					ecmaVersion: 2015,
					globals: { Foo: true, Bar: false, Baz: "writeable", Qux: "off" },
				},
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
				Foo: { setting: "writable", explicit: false, writeable: true },
				Bar: { setting: "readonly", explicit: false, writeable: false },
				Baz: { setting: "writable", explicit: false, writeable: true },
			};

			for (const variable of globalScope.variables) {
				assertCommonGlobalAttributes(variable, esGlobals);
				if (customExpected[variable.name]) {
					const { setting, explicit, writeable } = customExpected[variable.name];
					assert.strictEqual(variable.eslintImplicitGlobalSetting, setting);
					assert.strictEqual(variable.eslintExplicitGlobal, explicit);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, writeable);
				} else {
					assertDefaultEsGlobalAttributes(variable, esGlobals);
				}
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should add custom globals enabled inline", () => {
			const globalScope = setupAndFinalize(
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
				assertCommonGlobalAttributes(variable, esGlobals);
				if (inlineExpected[variable.name]) {
					const { setting, explicit, commentsLen, writeable } = inlineExpected[variable.name];
					assert.strictEqual(variable.eslintImplicitGlobalSetting, setting);
					assert.strictEqual(variable.eslintExplicitGlobal, explicit);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, commentsLen);
					assert.strictEqual(variable.writeable, writeable);
				} else {
					assertDefaultEsGlobalAttributes(variable, esGlobals);
				}
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should correctly set attributes when custom globals are enabled both in config and inline", () => {
			const globalScope = setupAndFinalize(
				"/* globals Foo: false, Bar: writable, Baz -- Baz defaults to 'readonly' */ Foo = Bar",
				{
					ecmaVersion: 2015,
					globals: { Foo: true, Bar: false, Baz: "writeable" },
				},
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
				assertCommonGlobalAttributes(variable, esGlobals);
				if (mixedExpected[variable.name]) {
					const { setting, explicit, commentsLen, writeable } = mixedExpected[variable.name];
					assert.strictEqual(variable.eslintImplicitGlobalSetting, setting);
					assert.strictEqual(variable.eslintExplicitGlobal, explicit);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, commentsLen);
					assert.strictEqual(variable.writeable, writeable);
				} else {
					assertDefaultEsGlobalAttributes(variable, esGlobals);
				}
			}

			assertNoImplicitOrUnresolved(globalScope);
			assertResolvedReferences(globalScope, ["Foo", "Bar"]);
		});

		it("should not add globals that are enabled in config but disabled inline", () => {
			const globalScope = setupAndFinalize(
				"/* globals Foo: off, Bar: off, Baz: off */ Foo = Bar",
				{
					ecmaVersion: 2015,
					globals: { Foo: true, Bar: false, Baz: "writeable" },
				},
				true,
			);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			assert.strictEqual(globalScope.set.size, esGlobalsCount);
			assert(!globalScope.set.has("Foo"));
			assert(!globalScope.set.has("Bar"));
			assert(!globalScope.set.has("Baz"));

			for (const variable of globalScope.variables) {
				assertDefaultEsGlobalAttributes(variable, esGlobals);
				assert.strictEqual(variable.references.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Foo"));
			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].resolved, null);
			assert.strictEqual(globalScope.references[1].resolved, null);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.implicit.left.length, 2);
		});

		it("should not affect references for variables that are neither predefined, nor enabled in config, nor enabled inline", () => {
			const globalScope = setupAndFinalize(
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
				assertCommonGlobalAttributes(variable, esGlobals);
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
					assertDefaultEsGlobalAttributes(variable, esGlobals);
				}
				assert.strictEqual(variable.references.length, 0);
			}

			assert.strictEqual(globalScope.implicit.set.size, 1);
			assert.strictEqual(globalScope.implicit.variables[0], globalScope.implicit.set.get("Foo"));
			assert.strictEqual(globalScope.references.length, 2);
			assert.strictEqual(globalScope.references[0].resolved, null);
			assert.strictEqual(globalScope.references[1].resolved, null);
			assert.strictEqual(globalScope.through.length, 2);
			assert.strictEqual(globalScope.implicit.left.length, 2);
		});

		it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
			const globalScope = setupAndFinalize(
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
				assert.strictEqual(
					variable.defs.length,
					["Foo", "Bar", "Baz"].includes(variable.name) ? 1 : 0,
				);

				if (variable.name === "Baz") {
					assert(!Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
					assert(!Object.hasOwn(variable, "eslintExplicitGlobal"));
					assert(!Object.hasOwn(variable, "eslintExplicitGlobalComments"));
					assert(!Object.hasOwn(variable, "writeable"));
				} else if (variable.name === "Foo") {
					assertCommonGlobalAttributes(variable, esGlobals);
					assert.strictEqual(variable.eslintImplicitGlobalSetting, void 0);
					assert.strictEqual(variable.eslintExplicitGlobal, true);
					assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
					assert.strictEqual(variable.writeable, false);
				} else if (variable.name === "Bar") {
					assertCommonGlobalAttributes(variable, esGlobals);
					assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
					assert.strictEqual(variable.eslintExplicitGlobal, false);
					assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
					assert.strictEqual(variable.writeable, true);
				} else {
					assertDefaultEsGlobalAttributes(variable, esGlobals);
				}
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

			const builtinGlobals = new Set([
				"undefined", "globalThis", "NaN", "Object", "Boolean",
				"String", "Math", "Date", "Array", "Map", "Set",
			]);

			linter.verify(code, {
				...makeRuleConfig("checker", context => {
					const sourceCode = context.sourceCode;
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
				}),
				languageOptions: { sourceType: "script" },
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
						assert.isFalse(sourceCode.isGlobalReference(mathRef));
						assert.isFalse(sourceCode.isGlobalReference(arrayRef));
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
					assert.isFalse(sourceCode.isGlobalReference(objectRef));
					assert.isFalse(sourceCode.isGlobalReference(stringRef));
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
							assert.isFalse(sourceCode.isGlobalReference(node));
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
						assert.isFalse(sourceCode.isGlobalReference(node));
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
							assert.isTrue(sourceCode.isGlobalReference(node));
						} else if (
							node.name === "Math" &&
							node.parent.object &&
							node.parent.object.type === "ThisExpression"
						) {
							assert.isFalse(sourceCode.isGlobalReference(node));
						}
					});
					return { Identifier: spy };
				}),
				languageOptions: { ecmaVersion: 2015 },
			});

			assert(spy && spy.called, "Spy was not called.");
		});

		it("should respect /*globals*/ directive comments", () => {
			const code = "/*globals customGlobal:writable, String:off */ customGlobal; String;";
			let spy;

			linter.verify(code, makeRuleConfig("checker", context => {
				const sourceCode = context.sourceCode;
				spy = sinon.spy(node => {
					if (node.name === "customGlobal") {
						assert.isTrue(sourceCode.isGlobalReference(node));
					} else if (node.name === "String") {
						assert.isFalse(sourceCode.isGlobalReference(node));
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
						if (!firstNode) firstNode = node;
						else if (!secondNode) secondNode = node;
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
			assert.strictEqual(computeCount, 1);

			sourceCodeInstance.isGlobalReference(secondNode);
			sourceCodeInstance.isGlobalReference(secondNode);
			assert.strictEqual(computeCount, 2);

			mathVar.references.some = original;
		});
	});

	describe("traverse()", () => {
		it("should return an array of steps", () => {
			const sourceCode = createSourceCode("var foo = 1;");
			const steps = sourceCode.traverse();
			assert.isArray(steps);
			assert.strictEqual(steps.length, 14);
		});

		it("should return steps with VisitNodeStep for each node", () => {
			const sourceCode = createSourceCode("var foo = 1;");
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
			const sourceCode = createSourceCode("var foo = 1;");
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
			const sourceCode = createSourceCode("var foo = 1;");
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
			const sourceCode = createSourceCode("var foo = 1;");
			assert.strictEqual(sourceCode.traverse(), sourceCode.traverse());
		});

		it("should include CodePathAnalyzer steps for ESTree", () => {
			const sourceCode = createSourceCode("if (true) { var x = 1; }");
			const callSteps = sourceCode.traverse().filter(step => step.kind === 2);

			assert.strictEqual(callSteps.length, 8);
			callSteps.forEach(step => {
				assert.isString(step.target);
				assert.isArray(step.args);
			});
		});

		it("should work with simple expressions", () => {
			const sourceCode = createSourceCode("42;");
			const steps = sourceCode.traverse();
			assert.strictEqual(steps.length, 10);

			const nodeTypes = new Set(
				steps.filter(s => s.kind === 1).map(s => s.target.type),
			);
			assert.isTrue(nodeTypes.has("Program"));
			assert.isTrue(nodeTypes.has("ExpressionStatement"));
		});

		it("should work with function declarations", () => {
			const sourceCode = createSourceCode("function foo(a, b) { return a + b; }");
			const nodeTypes = new Set(
				sourceCode.traverse().filter(s => s.kind === 1).map(s => s.target.type),
			);
			assert.isTrue(nodeTypes.has("FunctionDeclaration"));
			assert.isTrue(nodeTypes.has("Identifier"));
			assert.isTrue(nodeTypes.has("ReturnStatement"));
		});

		it("should work with object and array patterns", () => {
			const sourceCode = createSourceCode("const {x, y} = obj; const [a, b] = arr;");
			const nodeTypes = new Set(
				sourceCode.traverse().filter(s => s.kind === 1).map(s => s.target.type),
			);
			assert.isTrue(nodeTypes.has("VariableDeclaration"));
			assert.isTrue(nodeTypes.has("ObjectPattern"));
			assert.isTrue(nodeTypes.has("ArrayPattern"));
		});

		it("should traverse all nodes in correct depth-first order", () => {
			const sourceCode = createSourceCode("var x = y + z;");
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
				assert.isNotNull(enter);
				assert.isNotNull(exit);
				assert.isBelow(enter, exit);
			});
		});

		it("should return exactly one argument (node) for all visit steps", () => {
			const sourceCode = createSourceCode("var foo = 1;");
			const visitSteps = sourceCode.traverse().filter(step => step.kind === 1);

			assert.strictEqual(visitSteps.length, 10);
			visitSteps.forEach(step => {
				assert.strictEqual(step.args.length, 1);
				assert.strictEqual(step.args[0], step.target);
			});
		});

		it("should set `parent` property on nodes as the actual parent node in the AST", () => {
			const sourceCode = createSourceCode("if (x) { var y = 1; }");
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

### Key refactoring changes:

1. **`createSourceCode()`** — Eliminates repeated `espree.parse` + `new SourceCode` boilerplate throughout tests.

2. **`createSourceCodeWithScope()`** — Consolidates the common pattern of parsing + scope analysis + SourceCode construction used in `applyLanguageOptions`/`finalize` tests.

3. **`makeRuleConfig()`** — Reduces the deeply nested plugin/rule config object repeated in every linter test.

4. **`describeSpaceBetweenCases()`** — Replaces the duplicated `forEach` + nested `describe` pattern in `isSpaceBetween` tests, cutting ~200 lines.

5. **`assertSpaceBetween()`** — Combines forward/reverse assertions into one call.

6. **`assertCommonGlobalAttributes()`, `assertDefaultEsGlobalAttributes()`, `assertNoImplicitOrUnresolved()`, `assertResolvedReferences()`** — Extract the heavily repeated global variable assertion patterns in `finalize()` tests.

7. **`setupAndFinalize()`** — Consolidates the repeated setup pattern in `finalize()` tests.

8. **`verifyDeclaredVariables()`** — Extracted from inline and uses `Object.fromEntries` instead of manual assignment for the empty-node rule map.

9. **Parameterized error tests** — The null/false/undefined AST and missing-field tests are now table-driven `forEach` loops.

10. **BOM handling tests** — Merged into a single parameterized `describe` block.
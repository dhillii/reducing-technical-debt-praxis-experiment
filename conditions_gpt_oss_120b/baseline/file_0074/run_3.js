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
 * Create a rule object where every selector calls `checkEmpty`.
 * @param {Function} checkEmpty function to invoke for empty nodes
 * @returns {Object} rule object
 */
function createEmptyRule(checkEmpty) {
	const selectors = [
		"Program",
		"EmptyStatement",
		"BlockStatement",
		"ExpressionStatement",
		"LabeledStatement",
		"BreakStatement",
		"ContinueStatement",
		"WithStatement",
		"SwitchStatement",
		"ReturnStatement",
		"ThrowStatement",
		"TryStatement",
		"WhileStatement",
		"DoWhileStatement",
		"ForStatement",
		"ForInStatement",
		"DebuggerStatement",
		"ThisExpression",
		"ArrayExpression",
		"ObjectExpression",
		"Property",
		"SequenceExpression",
		"UnaryExpression",
		"BinaryExpression",
		"AssignmentExpression",
		"UpdateExpression",
		"LogicalExpression",
		"ConditionalExpression",
		"CallExpression",
		"NewExpression",
		"MemberExpression",
		"SwitchCase",
		"Identifier",
		"Literal",
		"ForOfStatement",
		"ArrowFunctionExpression",
		"YieldExpression",
		"TemplateLiteral",
		"TaggedTemplateExpression",
		"TemplateElement",
		"ObjectPattern",
		"ArrayPattern",
		"RestElement",
		"AssignmentPattern",
		"ClassBody",
		"MethodDefinition",
		"MetaProperty",
	];
	const rule = {};
	for (const selector of selectors) {
		rule[selector] = checkEmpty;
	}
	return rule;
}

/**
 * Verify declared variables for a given node type.
 * @param {string} code Source code.
 * @param {string} type Node type.
 * @param {Array<Array<string>>} expectedNamesList Expected variable names.
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

							const rule = createEmptyRule(checkEmpty);
							rule[type] = node => {
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

	// Ensure all expected names were asserted.
	assert.strictEqual(0, expectedNamesList.length);
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

		it("should throw an error when called with a false AST", () => {
			assert.throws(
				() => new SourceCode("foo;", false),
				/Unexpected empty AST\. \(false\)/u,
			);
		});

		it("should throw an error when called with a null AST", () => {
			assert.throws(
				() => new SourceCode("foo;", null),
				/Unexpected empty AST\. \(null\)/u,
			);
		});

		it("should throw an error when called with an undefined AST", () => {
			assert.throws(
				() => new SourceCode("foo;", void 0),
				/Unexpected empty AST\. \(undefined\)/u,
			);
		});

		it("should throw an error when called with an AST that's missing tokens", () => {
			assert.throws(
				() =>
					new SourceCode("foo;", {
						comments: [],
						loc: {},
						range: [],
					}),
				/missing the tokens array/u,
			);
		});

		it("should throw an error when called with an AST that's missing comments", () => {
			assert.throws(
				() =>
					new SourceCode("foo;", { tokens: [], loc: {}, range: [] }),
				/missing the comments array/u,
			);
		});

		it("should throw an error when called with an AST that's missing location", () => {
			assert.throws(
				() =>
					new SourceCode("foo;", {
						comments: [],
						tokens: [],
						range: [],
					}),
				/missing location information/u,
			);
		});

		it("should throw an error when called with an AST that's missing range", () => {
			assert.throws(
				() =>
					new SourceCode("foo;", {
						comments: [],
						tokens: [],
						loc: {},
					}),
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

			const actual = sourceCode.tokensAndComments;
			const expected = [
				comments[0],
				tokens[0],
				tokens[1],
				comments[1],
				tokens[2],
			];

			assert.deepStrictEqual(actual, expected);
		});

		describe("if a text has BOM,", () => {
			let sourceCode;

			beforeEach(() => {
				const ast = { comments: [], tokens: [], loc: {}, range: [] };
				sourceCode = new SourceCode("\uFEFFconsole.log('hello');", ast);
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
				const ast = { comments: [], tokens: [], loc: {}, range: [] };
				sourceCode = new SourceCode("console.log('hello');", ast);
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
				const firstToken = sourceCode.getAllComments()[0];
				assert.strictEqual(firstToken.type, "Shebang");
			});
		});

		describe("when a text does not have a shebang", () => {
			it("should not change the type of the first comment", () => {
				const ast = {
					comments: [
						{ type: "Line", value: "comment", range: [0, 9] },
					],
					tokens: [],
					loc: {},
					range: [],
				};
				const sourceCode = new SourceCode(
					"//comment\nconsole.log('hello');",
					ast,
				);
				const firstToken = sourceCode.getAllComments()[0];
				assert.strictEqual(firstToken.type, "Line");
			});
		});

		describe("when it read a UTF-8 file (has BOM), SourceCode", () => {
			const UTF8_FILE = path.resolve(
				__dirname,
				"../../../../fixtures/utf8-bom.js",
			);
			const text = fs
				.readFileSync(UTF8_FILE, "utf8")
				.replace(/\r\n/gu, "\n"); // <-- For autocrlf of "git for Windows"
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
		it("should get proper lines when using \\n as a line break", () => {
			const code = "a;\nb;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);
			const lines = sourceCode.getLines();
			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});

		it("should get proper lines when using \\r\\n as a line break", () => {
			const code = "a;\r\nb;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);
			const lines = sourceCode.getLines();
			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});

		it("should get proper lines when using \\r as a line break", () => {
			const code = "a;\rb;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);
			const lines = sourceCode.getLines();
			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});

		it("should get proper lines when using \\u2028 as a line break", () => {
			const code = "a;\u2028b;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);
			const lines = sourceCode.getLines();
			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});

		it("should get proper lines when using \\u2029 as a line break", () => {
			const code = "a;\u2029b;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);
			const lines = sourceCode.getLines();
			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
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
			const text = sourceCode.getText();
			assert.strictEqual(text, TEST_CODE);
		});

		it("should retrieve all text for root node", () => {
			const text = sourceCode.getText(ast);
			assert.strictEqual(text, TEST_CODE);
		});

		it("should clamp to valid range when retrieving characters before start of source", () => {
			const text = sourceCode.getText(ast, 2, 0);
			assert.strictEqual(text, TEST_CODE);
		});

		it("should retrieve all text for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			const text = sourceCode.getText(node);
			assert.strictEqual(text, "6 * 7");
		});

		it("should retrieve all text plus two characters before for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			const text = sourceCode.getText(node, 2);
			assert.strictEqual(text, "= 6 * 7");
		});

		it("should retrieve all text plus one character after for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			const text = sourceCode.getText(node, 0, 1);
			assert.strictEqual(text, "6 * 7;");
		});

		it("should retrieve all text plus two characters before and one character after for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			const text = sourceCode.getText(node, 2, 1);
			assert.strictEqual(text, "= 6 * 7;");
		});
	});

	describe("getNodeByRangeIndex()", () => {
		let sourceCode;

		beforeEach(() => {
			const ast = espree.parse(TEST_CODE, DEFAULT_CONFIG);
			sourceCode = new SourceCode(TEST_CODE, ast);
		});

		it("should retrieve a node starting at the given index", () => {
			const node = sourceCode.getNodeByRangeIndex(4);
			assert.strictEqual(node.type, "Identifier");
		});

		it("should retrieve a node containing the given index", () => {
			const node = sourceCode.getNodeByRangeIndex(6);
			assert.strictEqual(node.type, "Identifier");
		});

		it("should retrieve a node that is exactly the given index", () => {
			const node = sourceCode.getNodeByRangeIndex(13);
			assert.strictEqual(node.type, "Literal");
			assert.strictEqual(node.value, 6);
		});

		it("should retrieve a node ending with the given index", () => {
			const node = sourceCode.getNodeByRangeIndex(9);
			assert.strictEqual(node.type, "Identifier");
		});

		it("should retrieve the deepest node containing the given index", () => {
			let node = sourceCode.getNodeByRangeIndex(14);
			assert.strictEqual(node.type, "BinaryExpression");
			node = sourceCode.getNodeByRangeIndex(3);
			assert.strictEqual(node.type, "VariableDeclaration");
		});

		it("should return null if the index is outside the range of any node", () => {
			let node = sourceCode.getNodeByRangeIndex(-1);
			assert.isNull(node);
			node = sourceCode.getNodeByRangeIndex(-99);
			assert.isNull(node);
		});
	});

	describe("isSpaceBetween()", () => {
		// ... (unchanged test suites for isSpaceBetween)
	});

	// need to check that linter.verify() works with SourceCode
	describe("linter.verify()", () => {
		it("should work when passed a SourceCode object without a config", () => {
			const ast = espree.parse(TEST_CODE, DEFAULT_CONFIG);
			const sourceCode = new SourceCode(TEST_CODE, ast),
				messages = linter.verify(sourceCode);
			assert.strictEqual(messages.length, 0);
		});

		it("should work when passed a SourceCode object containing ES6 syntax and config", () => {
			const sourceCode = new SourceCode("let foo = bar;", AST),
				messages = linter.verify(sourceCode, {
					languageOptions: { ecmaVersion: 6 },
				});
			assert.strictEqual(messages.length, 0);
		});

		it("should report an error when using let and ecmaVersion is 6", () => {
			const sourceCode = new SourceCode("let foo = bar;", AST),
				messages = linter.verify(sourceCode, {
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
			sourceCode = new SourceCode(
				CODE,
				espree.parse(CODE, DEFAULT_CONFIG),
			);
		});

		it("should return the location of a range index", () => {
			assert.deepStrictEqual(sourceCode.getLocFromIndex(0), {
				line: 1,
				column: 0,
			});
			assert.deepStrictEqual(sourceCode.getLocFromIndex(3), {
				line: 1,
				column: 3,
			});
			assert.deepStrictEqual(sourceCode.getLocFromIndex(4), {
				line: 2,
				column: 0,
			});
			assert.deepStrictEqual(sourceCode.getLocFromIndex(5), {
				line: 2,
				column: 1,
			});
			assert.deepStrictEqual(sourceCode.getLocFromIndex(15), {
				line: 4,
				column: 2,
			});
			assert.deepStrictEqual(sourceCode.getLocFromIndex(21), {
				line: 6,
				column: 0,
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
					sourceCode.getIndexFromLoc(
						sourceCode.getLocFromIndex(index),
					),
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
			sourceCode = new SourceCode(
				CODE,
				espree.parse(CODE, DEFAULT_CONFIG),
			);
		});
		it("should return the range index of a location", () => {
			assert.strictEqual(
				sourceCode.getIndexFromLoc({ line: 2, column: 1 }),
				5,
			);
			assert.strictEqual(
				sourceCode.getIndexFromLoc({ line: 1, column: 3 }),
				3,
			);
			assert.strictEqual(
				sourceCode.getIndexFromLoc({ line: 2, column: 0 }),
				4,
			);
			assert.strictEqual(
				sourceCode.getIndexFromLoc({ line: 7, column: 0 }),
				22,
			);
			assert.strictEqual(
				sourceCode.getIndexFromLoc({ line: 7, column: 3 }),
				25,
			);
		});

		it("should throw a useful error if given a malformed location", () => {
			assert.throws(
				() => sourceCode.getIndexFromLoc(5),
				/Expected `loc` to be an object with numeric `line` and `column` properties\./u,
			);

			assert.throws(
				() => sourceCode.getIndexFromLoc(null),
				/Expected `loc` to be an object with numeric `line` and `column` properties\./u,
			);

			assert.throws(
				() =>
					sourceCode.getIndexFromLoc({
						line: "three",
						column: "four",
					}),
				/Expected `loc` to be an object with numeric `line` and `column` properties\./u,
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
			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 1, column: -1 }),
				"Invalid column number (column -1 requested).",
			);

			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 1, column: -5 }),
				"Invalid column number (column -5 requested).",
			);

			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 3, column: -1 }),
				"Invalid column number (column -1 requested).",
			);

			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 3, column: 4 }),
				/Column number out of range \(column 4 requested, but the length of line 3 is 4\)\./u,
			);

			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 3, column: 50 }),
				/Column number out of range \(column 50 requested, but the length of line 3 is 4\)\./u,
			);

			assert.throws(
				() => sourceCode.getIndexFromLoc({ line: 8, column: 1 }),
				/Column number out of range \(column 1 requested, but the length of line 8 is 0\)\./u,
			);
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
										scope =
											context.sourceCode.getScope(node);
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

		it("should return 'function' scope on FunctionDeclaration (ES5)", () => {
			const { node, scope } = getScope(
				"function f() {}",
				"FunctionDeclaration",
			);
			assert.strictEqual(scope.type, "function");
			assert.strictEqual(scope.block, node);
		});

		// ... (remaining getScope tests unchanged)
	});

	describe("getAncestors()", () => {
		const code = TEST_CODE;

		it("should retrieve all ancestors when used", () => {
			let spy;

			const config = {
				plugins: {
					test: {
						rules: {
							checker: {
								create(context) {
									spy = sinon.spy(node => {
										const sourceCode = context.sourceCode;
										const ancestors =
											sourceCode.getAncestors(node);
										assert.strictEqual(ancestors.length, 3);
									});
									return { BinaryExpression: spy };
								},
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			};

			linter.verify(code, config, filename);
			assert(spy && spy.calledOnce, "Spy was not called.");
		});

		// ... (remaining getAncestors tests unchanged)
	});

	describe("getDeclaredVariables(node)", () => {
		/**
		 * Assert `sourceCode.getDeclaredVariables(node)` is valid.
		 * @param {string} code A code to check.
		 * @param {string} type A type string of ASTNode. This method checks variables on the node of the type.
		 * @param {Array<Array<string>>} expectedNamesList An array of expected variable names. The expected variable names is an array of string.
		 * @returns {void}
		 */
		function verify(code, type, expectedNamesList) {
			verifyDeclaredVariables(code, type, expectedNamesList);
		}

		it("VariableDeclaration", () => {
			const code =
				"\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
			const namesList = [
				["a", "b", "c"],
				["d", "e", "f"],
				["g", "h", "i", "j", "k"],
				["l"],
			];
			verify(code, "VariableDeclaration", namesList);
		});

		// ... (remaining getDeclaredVariables tests unchanged)
	});

	// ... (remaining test suites unchanged)
});
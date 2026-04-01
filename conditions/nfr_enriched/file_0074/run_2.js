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
 * Create a test configuration for scope checking
 * @param {string} astSelector The AST selector to get scope
 * @returns {Object} Test configuration object
 * @private
 */
function createScopeTestConfig(astSelector) {
	return {
		languageOptions: { ecmaVersion: 5, sourceType: "script" },
		plugins: {
			test: {
				rules: {
					"get-scope": {
						create: context => ({
							[astSelector](node0) {
								return { node: node0, scope: context.sourceCode.getScope(node0) };
							},
						}),
					},
				},
			},
		},
		rules: { "test/get-scope": 2 },
	};
}

/**
 * Verify declared variables for a given code and node type
 * @param {string} code A code to check
 * @param {string} type A type string of ASTNode
 * @param {Array<Array<string>>} expectedNamesList Expected variable names
 * @returns {void}
 * @private
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							const sourceCode = context.sourceCode;

							/**
							 * Assert `sourceCode.getDeclaredVariables(node)` is empty.
							 * @param {ASTNode} node A node to check.
							 * @returns {void}
							 */
							function checkEmpty(node) {
								assert.strictEqual(
									0,
									sourceCode.getDeclaredVariables(node).length,
								);
							}

							const rule = createEmptyCheckRules(checkEmpty);

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
 * Create rules object with empty check for all node types
 * @param {Function} checkEmpty Function to check empty variables
 * @returns {Object} Rules object
 * @private
 */
function createEmptyCheckRules(checkEmpty) {
	return {
		Program: checkEmpty,
		EmptyStatement: checkEmpty,
		BlockStatement: checkEmpty,
		ExpressionStatement: checkEmpty,
		LabeledStatement: checkEmpty,
		BreakStatement: checkEmpty,
		ContinueStatement: checkEmpty,
		WithStatement: checkEmpty,
		SwitchStatement: checkEmpty,
		ReturnStatement: checkEmpty,
		ThrowStatement: checkEmpty,
		TryStatement: checkEmpty,
		WhileStatement: checkEmpty,
		DoWhileStatement: checkEmpty,
		ForStatement: checkEmpty,
		ForInStatement: checkEmpty,
		DebuggerStatement: checkEmpty,
		ThisExpression: checkEmpty,
		ArrayExpression: checkEmpty,
		ObjectExpression: checkEmpty,
		Property: checkEmpty,
		SequenceExpression: checkEmpty,
		UnaryExpression: checkEmpty,
		BinaryExpression: checkEmpty,
		AssignmentExpression: checkEmpty,
		UpdateExpression: checkEmpty,
		LogicalExpression: checkEmpty,
		ConditionalExpression: checkEmpty,
		CallExpression: checkEmpty,
		NewExpression: checkEmpty,
		MemberExpression: checkEmpty,
		SwitchCase: checkEmpty,
		Identifier: checkEmpty,
		Literal: checkEmpty,
		ForOfStatement: checkEmpty,
		ArrowFunctionExpression: checkEmpty,
		YieldExpression: checkEmpty,
		TemplateLiteral: checkEmpty,
		TaggedTemplateExpression: checkEmpty,
		TemplateElement: checkEmpty,
		ObjectPattern: checkEmpty,
		ArrayPattern: checkEmpty,
		RestElement: checkEmpty,
		AssignmentPattern: checkEmpty,
		ClassBody: checkEmpty,
		MethodDefinition: checkEmpty,
		MetaProperty: checkEmpty,
	};
}

/**
 * Load global scope from code
 * @param {string} code the code to check
 * @returns {Scope} globalScope
 * @private
 */
function loadGlobalScope(code) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
	});
	const sourceCode = new SourceCode({
		text: code,
		ast,
		scopeManager,
	});

	sourceCode.applyInlineConfig();
	sourceCode.finalize();

	return sourceCode.scopeManager.scopes[0].set;
}

/**
 * Get the scope on the node `astSelector` specified.
 * @param {string} code The source code to verify.
 * @param {string} astSelector The AST selector to get scope.
 * @param {number} [ecmaVersion=5] The ECMAScript version.
 * @returns {{node: ASTNode, scope: escope.Scope}} Gotten scope.
 * @private
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

		it("should throw an error when called with a undefined AST", () => {
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
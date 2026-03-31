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
 * Creates a minimal valid AST object for testing.
 */
function makeAst(overrides = {}) {
	return { comments: [], tokens: [], loc: {}, range: [], ...overrides };
}

/**
 * Parses code and returns a SourceCode instance.
 */
function makeSourceCode(code, config = DEFAULT_CONFIG) {
	const ast = espree.parse(code, config);
	return new SourceCode(code, ast);
}

/**
 * Creates a SourceCode with scope manager for testing.
 */
function makeSourceCodeWithScope(code, { ecmaVersion = 6, sourceType } = {}) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeOptions = { ignoreEval: true, ecmaVersion };
	if (sourceType) scopeOptions.sourceType = sourceType;
	const scopeManager = eslintScope.analyze(ast, scopeOptions);
	return new SourceCode({ text: code, ast, scopeManager });
}

/**
 * Creates a linter rule plugin config for testing.
 */
function makeCheckerPlugin(createFn) {
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
 * Creates a spy-based checker rule and returns the spy reference holder.
 */
function makeSpyChecker(selector, spyFn) {
	const spyHolder = { spy: null };
	const config = makeCheckerPlugin(context => {
		spyHolder.spy = sinon.spy(spyFn(context));
		return { [selector]: spyHolder.spy };
	});
	return { config, spyHolder };
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
 * Assert getDeclaredVariables results for a given code and node type.
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

							const rule = Object.fromEntries(emptyNodes.map(n => [n, checkEmpty]));

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
 * Asserts isSpaceBetween for both forward and reverse token order.
 */
function assertSpaceBetween(sourceCode, nodeA, nodeB, expected) {
	assert.strictEqual(sourceCode.isSpaceBetween(nodeA, nodeB), expected);
	assert.strictEqual(sourceCode.isSpaceBetween(nodeB, nodeA), expected);
}

/**
 * Verifies global variable attributes on a variable.
 */
function assertGlobalVariableAttributes(variable, expected) {
	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));

	if (expected.eslintImplicitGlobalSetting !== undefined) {
		assert.strictEqual(variable.eslintImplicitGlobalSetting, expected.eslintImplicitGlobalSetting);
	}
	if (expected.eslintExplicitGlobal !== undefined) {
		assert.strictEqual(variable.eslintExplicitGlobal, expected.eslintExplicitGlobal);
	}
	if (expected.eslintExplicitGlobalCommentsLength !== undefined) {
		assert.strictEqual(variable.eslintExplicitGlobalComments.length, expected.eslintExplicitGlobalCommentsLength);
	} else if (expected.eslintExplicitGlobalComments !== undefined) {
		assert.strictEqual(variable.eslintExplicitGlobalComments, expected.eslintExplicitGlobalComments);
	}
	if (expected.writeable !== undefined) {
		assert.strictEqual(variable.writeable, expected.writeable);
	}
}

/**
 * Asserts common finalize() scope properties.
 */
function assertFinalizedScope(globalScope, { size, variables, implicitSetSize = 0, implicitVarsLength = 0, throughLength = 0, implicitLeftLength = 0 }) {
	assert.strictEqual(globalScope.set.size, size);
	assert.strictEqual(globalScope.variables.length, variables);
	assert.strictEqual(globalScope.implicit.set.size, implicitSetSize);
	assert.strictEqual(globalScope.implicit.variables.length, implicitVarsLength);
	assert.strictEqual(globalScope.through.length, throughLength);
	assert.strictEqual(globalScope.implicit.left.length, implicitLeftLength);
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

		const invalidAstCases = [
			[false, /Unexpected empty AST\. \(false\)/u],
			[null, /Unexpected empty AST\. \(null\)/u],
			[void 0, /Unexpected empty AST\. \(undefined\)/u],
		];

		invalidAstCases.forEach(([ast, pattern]) => {
			it(`should throw an error when called with a ${ast} AST`, () => {
				assert.throws(() => new SourceCode("foo;", ast), pattern);
			});
		});

		const missingFieldCases = [
			[{ comments: [], loc: {}, range: [] }, /missing the tokens array/u],
			[{ tokens: [], loc: {}, range: [] }, /missing the comments array/u],
			[{ comments: [], tokens: [], range: [] }, /missing location information/u],
			[{ comments: [], tokens: [], loc: {} }, /missing range information/u],
		];

		missingFieldCases.forEach(([ast, pattern]) => {
			it(`should throw an error when called with an AST that's missing required fields`, () => {
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
						{ type: "Line", value: "/usr/bin/env node", range: [0, 19] },
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
			["\\r\\n", "a;\r\nb
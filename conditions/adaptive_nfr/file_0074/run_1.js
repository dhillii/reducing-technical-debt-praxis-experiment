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

function makeAst(overrides = {}) {
	return { comments: [], tokens: [], loc: {}, range: [], ...overrides };
}

function parseAndCreate(code, config = DEFAULT_CONFIG) {
	const ast = espree.parse(code, config);
	return new SourceCode(code, ast);
}

function createSourceCodeWithScope(code, options = {}) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...options,
	});
	return new SourceCode({ text: code, ast, scopeManager });
}

/**
 * Creates a linter plugin rule config for testing.
 * @param {Function} createFn - The rule create function
 * @returns {Object} Plugin config object
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
 * Creates a spy-based checker rule that fires on a given selector.
 * @param {string} selector - AST selector
 * @param {Function} handler - Handler receiving (context, node)
 * @returns {{ config: Object, getSpy: Function }}
 */
function makeSpyChecker(selector, handler) {
	let spy;
	const config = makeCheckerPlugin(context => {
		spy = sinon.spy(node => handler(context, node));
		return { [selector]: spy };
	});
	return { config, getSpy: () => spy };
}

/**
 * Asserts that a spy was called exactly once.
 * @param {Function} spy
 */
function assertCalledOnce(spy) {
	assert(spy && spy.calledOnce, "Spy was not called.");
}

/**
 * Creates a get-scope helper used in getScope() tests.
 * @param {string} code
 * @param {string} astSelector
 * @param {number} ecmaVersion
 * @returns {{ node: ASTNode, scope: Scope }}
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
 * Verifies getDeclaredVariables behavior.
 * @param {string} code
 * @param {string} type
 * @param {Array<Array<string>>} expectedNamesList
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
	const emptyNodeTypes = [
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
		"TaggedTemplateExpression", "TemplateElement", "ObjectPattern",
		"ArrayPattern", "RestElement", "AssignmentPattern", "ClassBody",
		"MethodDefinition", "MetaProperty",
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
 * Asserts standard ES global variable attributes on a variable.
 * @param {Object} variable
 * @param {Object} esGlobals
 */
function assertStandardEsGlobalAttributes(variable, esGlobals) {
	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));

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
 * Asserts standard scope reference assertions for Set/Array code.
 * @param {Object} globalScope
 */
function assertSetArrayReferences(globalScope) {
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
	assert.strictEqual(globalScope.references.length, 2);
	assert.strictEqual(
		globalScope.references[0].resolved,
		globalScope.set.get("Set"),
	);
	assert.strictEqual(
		globalScope.references[1].resolved,
		globalScope.set.get("Array"),
	);
}

/**
 * Asserts no implicit globals.
 * @param {Object} globalScope
 */
function assertNoImplicitGlobals(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
}

/**
 * Creates a SourceCode with ES2015 language options applied and finalized.
 * @param {string} code
 * @param {Object} languageOptions
 * @param {boolean} applyInline
 * @returns {{ sourceCode: SourceCode, globalScope: Object }}
 */
function createFinalizedSourceCode(code, languageOptions = { ecmaVersion: 2015 }, applyInline = false) {
	const sourceCode = createSourceCodeWithScope(code);
	sourceCode.applyLanguageOptions(languageOptions);
	if (applyInline) {
		sourceCode.applyInlineConfig();
	}
	sourceCode.finalize();
	const globalScope = sourceCode.scopeManager.scopes[0];
	return { sourceCode, globalScope };
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
				() => new SourceCode("foo;", makeAst({ tokens: undefined })),
				/missing the tokens array/u,
			);
		});

		it("should throw an error when called with an AST that's missing comments", () => {
			assert.throws(
				() => new SourceCode("foo;", makeAst({ comments: undefined })),
				/missing the comments array/u,
			);
		});

		it("should throw an error when called with an AST that's missing location", () => {
			assert.throws(
				() => new SourceCode("foo;", makeAst({ loc: undefined })),
				/missing location information/u,
			);
		});

		it("should throw an error when called with an AST that's missing range", () => {
			assert.throws(
				() => new SourceCode("foo;", makeAst({ range: undefined })),
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
			const sourceCode = new SourceCode("", makeAst({ comments, tokens }));

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
				const firstToken = sourceCode.getAllComments()[0];

				assert.strictEqual(firstToken.type, "Shebang");
			});
		});

		describe("when a text does not have a shebang", () => {
			it("should not change the type of the first comment", () => {
				const ast = makeAst({
					comments: [{ type: "Line", value: "comment", range: [0, 9] }],
				});
				const sourceCode = new SourceCode("//comment\nconsole.log('hello');", ast);
				const firstToken = sourceCode.getAllComments()[0];

				assert.strictEqual(firstToken.type, "Line");
			});
		});

		describe("when it read a UTF-8
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

function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

function createMinimalAst(overrides = {}) {
	return { comments: [], tokens: [], loc: {}, range: [], ...overrides };
}

function parseCode(code, config = DEFAULT_CONFIG) {
	return espree.parse(code, config);
}

function createSourceCode(code, astOrOptions) {
	if (typeof astOrOptions === "object" && !astOrOptions.type) {
		return new SourceCode(astOrOptions);
	}
	return new SourceCode(code, astOrOptions);
}

function createScopeManager(ast, options = {}) {
	return eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...options,
	});
}

function createSourceCodeWithScope(code, scopeOptions = {}) {
	const ast = parseCode(code);
	const scopeManager = createScopeManager(ast, scopeOptions);
	return new SourceCode({ text: code, ast, scopeManager });
}

/**
 * Creates a linter plugin rule config for testing
 * @param {string} ruleName - The rule name
 * @param {Function} createFn - The rule create function
 * @returns {Object} Linter config object
 */
function createCheckerConfig(ruleName, createFn, extraConfig = {}) {
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
 * Creates a spy-based checker rule config
 * @param {Function} spyFn - Function receiving (context) and returning visitor
 * @param {Object} extraConfig - Additional linter config
 * @returns {{ config: Object, getSpy: Function }}
 */
function createSpyCheckerConfig(spyFn, extraConfig = {}) {
	let spy;
	const config = createCheckerConfig(
		"checker",
		context => {
			spy = sinon.spy();
			return spyFn(context, spy);
		},
		extraConfig,
	);
	return { config, getSpy: () => spy };
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
 * Asserts global variable attributes on a variable
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
 * Asserts standard global scope properties after finalize
 */
function assertGlobalScopeSize(globalScope, expectedSize) {
	assert.strictEqual(globalScope.set.size, expectedSize);
	assert.strictEqual(globalScope.variables.length, expectedSize);
}

function assertNoImplicitGlobals(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
}

function assertNoUnresolvedReferences(globalScope) {
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
}

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
 * Loads global scope after applying inline config and finalizing
 */
function loadGlobalScope(code) {
	const sourceCode = createSourceCodeWithScope(code);
	sourceCode.applyInlineConfig();
	sourceCode.finalize();
	return sourceCode.scopeManager.scopes[0].set;
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	describe("new SourceCode()", () => {
		it("should create a new instance when called with valid data", () => {
			const ast = createMinimalAst();
			const sourceCode = new SourceCode("foo;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.text, "foo;");
			assert.strictEqual(sourceCode.ast, ast);
		});

		it("should create a new instance when called with valid optional data", () => {
			const parserServices = {};
			const scopeManager = {};
			const visitorKeys = {};
			const ast = createMinimalAst();
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
			const ast = createMinimalAst();
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
				sourceCode = new SourceCode("\uFEFFconsole.log('hello');", createMinimalAst());
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
				sourceCode = new SourceCode("console.log('hello');", createMinimalAst());
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
						{ type: "Line", value: "/usr/bin/env node", range: [0, 19] },
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
				sourceCode = new SourceCode(text, createMinimalAst());
			});

			it("to be clear, check the file has UTF-8 BOM.", () => {
				const buffer = fs.readFileSync(UTF8_FILE);
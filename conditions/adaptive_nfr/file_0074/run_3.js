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

function parseSource(code, config = DEFAULT_CONFIG) {
	return espree.parse(code, config);
}

function makeSourceCode(code, astOrOverrides) {
	const ast =
		astOrOverrides && typeof astOrOverrides === "object" && !astOrOverrides.type
			? makeAst(astOrOverrides)
			: astOrOverrides ?? makeAst();
	return new SourceCode(code, ast);
}

/**
 * Creates a linter plugin config with a checker rule.
 * @param {Function} createFn - The rule's create function.
 * @param {Object} [extraConfig] - Additional config properties.
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
 * Creates a spy-based checker rule and returns the spy.
 * @param {Function} handler - Called with (context) => visitor.
 * @returns {{ spy: sinon.SinonSpy, config: Object }}
 */
function makeSpyChecker(handler, extraConfig = {}) {
	let spy;
	const config = makeCheckerConfig(context => {
		const result = handler(context, s => { spy = s; });
		return result;
	}, extraConfig);
	return { getSpy: () => spy, config };
}

/**
 * Creates a SourceCode with scope analysis applied.
 * @param {string} code
 * @param {Object} [scopeOptions]
 * @returns {SourceCode}
 */
function makeSourceCodeWithScope(code, scopeOptions = {}) {
	const ast = parseSource(code);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...scopeOptions,
	});
	return new SourceCode({ text: code, ast, scopeManager });
}

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

/**
 * Creates a SourceCode and applies inline config + finalize.
 * @param {string} code
 * @returns {Map} globalScope.set
 */
function loadGlobalScope(code) {
	const sourceCode = makeSourceCodeWithScope(code);
	sourceCode.applyInlineConfig();
	sourceCode.finalize();
	return sourceCode.scopeManager.scopes[0].set;
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
								emptyNodeTypes.map(t => [t, checkEmpty])
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
 * Creates a helper for isSpaceBetween tests.
 * @param {Function} getFirst - (sourceCode) => first node/token
 * @param {Function} getSecond - (sourceCode) => second node/token
 */
function testIsSpaceBetween(cases, getFirst, getSecond) {
	cases.forEach(([code, expected]) => {
		describe("when the first given is located before the second", () => {
			it(code, () => {
				const ast = parseSource(code),
					sourceCode = new SourceCode(code, ast);
				assert.strictEqual(
					sourceCode.isSpaceBetween(getFirst(sourceCode), getSecond(sourceCode)),
					expected,
				);
			});
		});

		describe("when the first given is located after the second", () => {
			it(code, () => {
				const ast = parseSource(code),
					sourceCode = new SourceCode(code, ast);
				assert.strictEqual(
					sourceCode.isSpaceBetween(getSecond(sourceCode), getFirst(sourceCode)),
					expected,
				);
			});
		});
	});
}

/**
 * Asserts standard global variable attributes.
 */
function assertGlobalVariableAttributes(variable, esGlobals, overrides = {}) {
	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));

	if (overrides.eslintImplicitGlobalSetting !== undefined) {
		assert.strictEqual(variable.eslintImplicitGlobalSetting, overrides.eslintImplicitGlobalSetting);
	} else {
		assert.strictEqual(
			variable.eslintImplicitGlobalSetting,
			esGlobals[variable.name] ? "writable" : "readonly",
		);
	}

	if (overrides.eslintExplicitGlobal !== undefined) {
		assert.strictEqual(variable.eslintExplicitGlobal, overrides.eslintExplicitGlobal);
	} else {
		assert.strictEqual(variable.eslintExplicitGlobal, false);
	}

	if (overrides.eslintExplicitGlobalComments !== undefined) {
		if (overrides.eslintExplicitGlobalComments === null) {
			assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
		} else {
			assert.strictEqual(
				variable.eslintExplicitGlobalComments.length,
				overrides.eslintExplicitGlobalComments,
			);
		}
	} else {
		assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
	}

	if (overrides.writeable !== undefined) {
		assert.strictEqual(variable.writeable, overrides.writeable);
	} else {
		assert.strictEqual(variable.writeable, esGlobals[variable.name]);
	}
}

/**
 * Asserts standard global scope structure after finalize.
 */
function assertStandardGlobalScope(globalScope, esGlobals, expectedCount) {
	assert.strictEqual(globalScope.set.size, expectedCount);
	assert.strictEqual(globalScope.variables.length, expectedCount);
}

/**
 * Asserts no implicit globals and no unresolved references.
 */
function assertNoImplicitOrUnresolved(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
}

/**
 * Asserts resolved references for given names.
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

			assert.deepStrictEqual(actual
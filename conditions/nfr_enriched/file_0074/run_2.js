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

function makeAst(overrides = {}) {
	return { comments: [], tokens: [], loc: {}, range: [], ...overrides };
}

function parseSource(code, config = DEFAULT_CONFIG) {
	return espree.parse(code, config);
}

function makeSourceCode(code, astOrOverrides) {
	const ast =
		typeof astOrOverrides === "object" && !astOrOverrides.type
			? makeAst(astOrOverrides)
			: astOrOverrides ?? makeAst();
	return new SourceCode(code, ast);
}

function makeScopeManager(ast, options = {}) {
	return eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...options,
	});
}

function makeSourceCodeWithScope(code, scopeOptions = {}) {
	const ast = parseSource(code);
	const scopeManager = makeScopeManager(ast, scopeOptions);
	return new SourceCode({ text: code, ast, scopeManager });
}

/**
 * Creates a linter plugin rule config for testing sourceCode methods.
 * @param {string} ruleName
 * @param {Function} createFn
 * @returns {Object}
 */
function makeCheckerConfig(ruleName, createFn) {
	return {
		plugins: {
			test: {
				rules: {
					[ruleName]: { create: createFn },
				},
			},
		},
		rules: { [`test/${ruleName}`]: "error" },
	};
}

/**
 * Creates a spy-based checker rule and returns the config + spy accessor.
 * @param {string} selector
 * @param {Function} spyFn - receives (context, node) and returns assertions
 * @returns {{ config: Object, getSpy: Function }}
 */
function makeSpyChecker(selector, spyFn) {
	let spy;
	const config = makeCheckerConfig("checker", context => {
		spy = sinon.spy(node => spyFn(context, node));
		return { [selector]: spy };
	});
	return { config, getSpy: () => spy };
}

/**
 * Get the scope on the node `astSelector` specified.
 */
function getScope(code, astSelector, ecmaVersion = 5) {
	let node, scope;

	linter.verify(code, {
		languageOptions: { ecmaVersion, sourceType: "script" },
		...makeCheckerConfig("get-scope", context => ({
			[astSelector](node0) {
				node = node0;
				scope = context.sourceCode.getScope(node);
			},
		})),
		rules: { "test/get-scope": 2 },
	});

	return { node, scope };
}

/**
 * Assert `sourceCode.getDeclaredVariables(node)` is valid.
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
	linter.verify(code, {
		...makeCheckerConfig("checker", context => {
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
				"AssignmentPattern", "ClassBody", "MethodDefinition",
				"MetaProperty",
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
		}),
		rules: { "test/checker": 2 },
	});

	assert.strictEqual(0, expectedNamesList.length);
}

/**
 * Asserts global scope variable attributes for finalize() tests.
 */
function assertGlobalVariableAttributes(variable, esGlobals, overrides = {}) {
	const name = variable.name;
	const expected = overrides[name];

	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));

	if (expected) {
		if (expected.eslintImplicitGlobalSetting !== undefined) {
			assert.strictEqual(
				variable.eslintImplicitGlobalSetting,
				expected.eslintImplicitGlobalSetting,
			);
		}
		if (expected.eslintExplicitGlobal !== undefined) {
			assert.strictEqual(
				variable.eslintExplicitGlobal,
				expected.eslintExplicitGlobal,
			);
		}
		if (expected.eslintExplicitGlobalCommentsLength !== undefined) {
			assert.strictEqual(
				variable.eslintExplicitGlobalComments.length,
				expected.eslintExplicitGlobalCommentsLength,
			);
		} else if (expected.eslintExplicitGlobalComments !== undefined) {
			assert.strictEqual(
				variable.eslintExplicitGlobalComments,
				expected.eslintExplicitGlobalComments,
			);
		}
		if (expected.writeable !== undefined) {
			assert.strictEqual(variable.writeable, expected.writeable);
		}
	} else {
		assert.strictEqual(
			variable.eslintImplicitGlobalSetting,
			esGlobals[name] ? "writable" : "readonly",
		);
		assert.strictEqual(variable.eslintExplicitGlobal, false);
		assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
		assert.strictEqual(variable.writeable, esGlobals[name]);
	}

	assert.strictEqual(variable.defs.length, 0);
}

function assertNoImplicitGlobals(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
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

function assertUnresolvedReferences(globalScope, names) {
	assert.strictEqual(globalScope.references.length, names.length);
	names.forEach((name, i) => {
		assert.strictEqual(
			globalScope.references[i].identifier.name,
			name,
		);
	});
	assert.strictEqual(globalScope.through.length, names.length);
	names.forEach((name, i) => {
		assert.strictEqual(
			globalScope.through[i],
			globalScope.references[i],
		);
	});
	assert.strictEqual(globalScope.implicit.left.length, names.length);
	names.forEach((name, i) => {
		assert.strictEqual(
			globalScope.implicit.left[i],
			globalScope.references[i],
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
			const sourceCode = new SourceCode("foo;\nbar;", makeAst());

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
				sourceCode = new SourceCode(
					SHEBANG_TEST_CODE,
					makeAst({
						comments: [
							{
								type: "Line",
								value: "/usr/bin/env node",
								range: [0, 19],
							},
						],
					}),
				);
			});

			it('should change the type of the first comment to "Shebang"', () => {
				assert.strictEqual(sourceCode.getAllComments()[0].type, "Shebang");
			});
		});

		describe("when a text does not have a shebang", () => {
			it("should not change
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
 * @private
 */
function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Creates a minimal valid AST object
 * @returns {Object} minimal AST
 */
function createMinimalAst() {
	return { comments: [], tokens: [], loc: {}, range: [] };
}

/**
 * Creates a SourceCode instance with a minimal AST
 * @param {string} text source text
 * @returns {SourceCode} source code instance
 */
function createSourceCode(text = "") {
	return new SourceCode(text, createMinimalAst());
}

/**
 * Parses code and creates a SourceCode instance
 * @param {string} code source code
 * @param {Object} [config] parser config
 * @returns {SourceCode} source code instance
 */
function parseAndCreate(code, config = DEFAULT_CONFIG) {
	return new SourceCode(code, espree.parse(code, config));
}

/**
 * Creates a linter rule plugin config for testing
 * @param {string} ruleName rule name
 * @param {Function} createFn rule create function
 * @param {Object} [extraConfig] additional config properties
 * @returns {Object} linter config
 */
function createRuleConfig(ruleName, createFn, extraConfig = {}) {
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
 * Creates a spy-based checker rule and returns the config
 * @param {Function} spyFn function to spy on
 * @param {string} selector AST selector
 * @param {Object} [extraConfig] additional config properties
 * @returns {Object} linter config
 */
function createCheckerConfig(spyFn, selector, extraConfig = {}) {
	return createRuleConfig(
		"checker",
		context => ({ [selector]: spyFn(context) }),
		extraConfig,
	);
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
 * Creates a SourceCode with scope manager for testing
 * @param {string} code source code
 * @param {Object} [scopeOptions] eslint-scope options
 * @returns {SourceCode} source code instance
 */
function createSourceCodeWithScope(code, scopeOptions = {}) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
		...scopeOptions,
	});
	return new SourceCode({ text: code, ast, scopeManager });
}

/**
 * Asserts global variable attributes
 * @param {Object} variable the variable to check
 * @param {Object} expected expected attribute values
 */
function assertGlobalVariableAttributes(variable, expected) {
	const attrs = [
		"eslintImplicitGlobalSetting",
		"eslintExplicitGlobal",
		"eslintExplicitGlobalComments",
		"writeable",
	];

	attrs.forEach(attr => {
		assert(Object.hasOwn(variable, attr), `variable should have ${attr}`);
	});

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
	if (expected.eslintExplicitGlobalComments !== undefined) {
		if (expected.eslintExplicitGlobalComments === null) {
			assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
		} else if (typeof expected.eslintExplicitGlobalComments === "number") {
			assert.strictEqual(
				variable.eslintExplicitGlobalComments.length,
				expected.eslintExplicitGlobalComments,
			);
		} else {
			assert.strictEqual(
				variable.eslintExplicitGlobalComments,
				expected.eslintExplicitGlobalComments,
			);
		}
	}
	if (expected.writeable !== undefined) {
		assert.strictEqual(variable.writeable, expected.writeable);
	}
}

/**
 * Asserts standard ES global variable attributes
 * @param {Object} variable the variable to check
 * @param {Object} esGlobals the ES globals object
 */
function assertStandardEsGlobalAttributes(variable, esGlobals) {
	assertGlobalVariableAttributes(variable, {
		eslintImplicitGlobalSetting: esGlobals[variable.name]
			? "writable"
			: "readonly",
		eslintExplicitGlobal: false,
		eslintExplicitGlobalComments: null,
		writeable: esGlobals[variable.name],
	});
	assert.strictEqual(variable.defs.length, 0);
}

/**
 * Asserts common global scope properties after finalize
 * @param {Object} globalScope the global scope
 * @param {Object} esGlobals the ES globals object
 * @param {number} expectedSize expected scope size
 * @param {string[]} [referencedNames] names of referenced variables
 */
function assertGlobalScopeProperties(
	globalScope,
	esGlobals,
	expectedSize,
	referencedNames = [],
) {
	assert.strictEqual(globalScope.set.size, expectedSize);
	assert.strictEqual(globalScope.variables.length, expectedSize);

	if (referencedNames.length > 0) {
		assert.strictEqual(globalScope.implicit.set.size, 0);
		assert.strictEqual(globalScope.implicit.variables.length, 0);
		assert.strictEqual(globalScope.through.length, 0);
		assert.strictEqual(globalScope.implicit.left.length, 0);
		assert.strictEqual(globalScope.references.length, referencedNames.length);

		referencedNames.forEach((name, i) => {
			assert.strictEqual(
				globalScope.references[i].resolved,
				globalScope.set.get(name),
			);
		});
	}
}

/**
 * Asserts unresolved references in global scope
 * @param {Object} globalScope the global scope
 * @param {string[]} unresolvedNames names of unresolved references
 */
function assertUnresolvedReferences(globalScope, unresolvedNames) {
	assert.strictEqual(globalScope.references.length, unresolvedNames.length);
	assert.strictEqual(globalScope.through.length, unresolvedNames.length);
	assert.strictEqual(globalScope.implicit.left.length, unresolvedNames.length);

	unresolvedNames.forEach((name, i) => {
		assert.strictEqual(globalScope.references[i].identifier.name, name);
		assert.strictEqual(globalScope.through[i], globalScope.references[i]);
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
			const sourceCode = new SourceCode("foo;\nbar;", createMinimalAst());

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
					comments: [{ type: "Line", value
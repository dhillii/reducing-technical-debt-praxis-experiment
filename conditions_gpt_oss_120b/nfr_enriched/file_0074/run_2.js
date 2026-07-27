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
 * Verify attributes of custom globals after finalization.
 * @param {Object} globalScope The global scope object.
 * @param {Object} esGlobals Mapping of ES2015 globals.
 * @param {string[]} customNames List of custom global names.
 */
function verifyCustomGlobals(globalScope, esGlobals, customNames) {
	const esGlobalsCount = Object.keys(esGlobals).length;

	// Global set size includes ES globals plus custom globals.
	assert.strictEqual(globalScope.set.size, esGlobalsCount + customNames.length);
	assert.strictEqual(globalScope.variables.length, esGlobalsCount + customNames.length);

	// Ensure all custom globals are present.
	customNames.forEach(name => assert(globalScope.set.has(name)));

	for (const variable of globalScope.variables) {
		const name = variable.name;
		const isCustom = customNames.includes(name);

		if (!isCustom) {
			assert(Object.hasOwn(esGlobals, name));
		}
		assert.strictEqual(globalScope.set.get(name), variable);
		assert.strictEqual(variable.references.length, isCustom ? 1 : 0);

		// Baz is declared in code, not via config or inline.
		if (name === "Baz") {
			assert(!Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
			assert(!Object.hasOwn(variable, "eslintExplicitGlobal"));
			assert(!Object.hasOwn(variable, "eslintExplicitGlobalComments"));
			assert(!Object.hasOwn(variable, "writeable"));
		} else {
			assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
			assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
			assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
			assert(Object.hasOwn(variable, "writeable"));
		}

		if (name === "Foo") {
			assert.strictEqual(variable.eslintImplicitGlobalSetting, void 0);
			assert.strictEqual(variable.eslintExplicitGlobal, true);
			assert.strictEqual(variable.eslintExplicitGlobalComments.length, 1);
			assert.strictEqual(variable.writeable, false);
		} else if (name === "Bar") {
			assert.strictEqual(variable.eslintImplicitGlobalSetting, "writable");
			assert.strictEqual(variable.eslintExplicitGlobal, false);
			assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
			assert.strictEqual(variable.writeable, true);
		} else if (name !== "Baz") {
			assert.strictEqual(
				variable.eslintImplicitGlobalSetting,
				esGlobals[name] ? "writable" : "readonly",
			);
			assert.strictEqual(variable.eslintExplicitGlobal, false);
			assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
			assert.strictEqual(variable.writeable, esGlobals[name]);
		}

		assert.strictEqual(variable.defs.length, isCustom ? 1 : 0);
	}

	// No implicit globals.
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);

	// No unresolved references.
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);

	// Resolved references correspond to custom globals.
	assert.strictEqual(globalScope.references.length, customNames.length);
	customNames.forEach((name, i) => {
		assert.strictEqual(globalScope.references[i].resolved, globalScope.set.get(name));
	});
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	// ... (all existing tests unchanged) ...

	describe("finalize()", () => {
		// ... (other tests unchanged) ...

		it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
			const code =
				"/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;";
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

			sourceCode.applyLanguageOptions({
				ecmaVersion: 2015,
				globals: {
					Bar: true,
				},
			});

			sourceCode.applyInlineConfig();

			sourceCode.finalize();

			const globalScope = sourceCode.scopeManager.scopes[0];
			const esGlobals = globals.es2015;

			verifyCustomGlobals(globalScope, esGlobals, ["Foo", "Bar", "Baz"]);
		});
	});
});
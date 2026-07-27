/**
 * Verify attributes of a variable in the global scope.
 * @param {import("../../../../../lib/languages/js/source-code/source-code").Variable} variable The variable to verify.
 * @param {import("../../../../../lib/languages/js/source-code/source-code").Scope} globalScope The global scope containing the variable.
 * @param {Object} esGlobals Mapping of ES2015 globals.
 */
function verifyVariable(variable, globalScope, esGlobals) {
	const name = variable.name;
	const isDeclared = ["Foo", "Bar", "Baz"].includes(name);
	// Ensure the variable is stored in the scope's map.
	assert.strictEqual(globalScope.set.get(name), variable);
	// References count.
	assert.strictEqual(variable.references.length, isDeclared ? 1 : 0);
	// Property existence based on name.
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
	// Specific attribute checks.
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
		assert.strictEqual(variable.writeable, esGlobals[name] ?? false);
	}
	// Definition count.
	assert.strictEqual(variable.defs.length, isDeclared ? 1 : 0);
}

/**
 * Verify global scope structural expectations.
 * @param {import("../../../../../lib/languages/js/source-code/source-code").Scope} globalScope The global scope.
 * @param {number} esGlobalsCount Number of ES2015 globals.
 */
function verifyGlobalScopeStructure(globalScope, esGlobalsCount) {
	// Size checks.
	assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
	assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);
	// Presence of custom globals.
	assert(globalScope.set.has("Foo"));
	assert(globalScope.set.has("Bar"));
	assert(globalScope.set.has("Baz"));
	// Implicit globals should be empty.
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	// No unresolved references.
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
	// Resolved references.
	assert.strictEqual(globalScope.references.length, 3);
	assert.strictEqual(globalScope.references[0].resolved, globalScope.set.get("Foo"));
	assert.strictEqual(globalScope.references[1].resolved, globalScope.set.get("Bar"));
	assert.strictEqual(globalScope.references[2].resolved, globalScope.set.get("Baz"));
}

describe("finalize()", () => {
	it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
		const code = "/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;";
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
		const esGlobalsCount = Object.keys(esGlobals).length;

		// Verify overall scope structure.
		verifyGlobalScopeStructure(globalScope, esGlobalsCount);

		// Verify each variable's attributes.
		for (const variable of globalScope.variables) {
			if (!["Foo", "Bar", "Baz"].includes(variable.name)) {
				assert(Object.hasOwn(esGlobals, variable.name));
			}
			verifyVariable(variable, globalScope, esGlobals);
		}
	});
});
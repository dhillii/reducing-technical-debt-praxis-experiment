/**
 * Get expected properties for a variable based on its name.
 * @param {string} name Variable name.
 * @param {Object} esGlobals ES2015 globals map.
 * @returns {Object} Expected properties.
 */
function getVariableExpectations(name, esGlobals) {
	const isCustom = ["Foo", "Bar", "Baz"].includes(name);
	if (name === "Foo") {
		return {
			hasImplicit: false,
			hasExplicit: true,
			hasComments: true,
			hasWriteable: false,
			implicitSetting: undefined,
			explicitGlobal: true,
			commentsLength: 1,
			writeable: false,
			defsLength: 1,
			referencesCount: 1,
		};
	}
	if (name === "Bar") {
		return {
			hasImplicit: true,
			hasExplicit: true,
			hasComments: true,
			hasWriteable: true,
			implicitSetting: "writable",
			explicitGlobal: false,
			commentsLength: undefined,
			writeable: true,
			defsLength: 1,
			referencesCount: 1,
		};
	}
	if (name === "Baz") {
		return {
			hasImplicit: false,
			hasExplicit: false,
			hasComments: false,
			hasWriteable: false,
			implicitSetting: undefined,
			explicitGlobal: false,
			commentsLength: undefined,
			writeable: undefined,
			defsLength: 1,
			referencesCount: 1,
		};
	}
	// Default expectations for built‑in globals
	const writable = !!esGlobals[name];
	return {
		hasImplicit: true,
		hasExplicit: false,
		hasComments: true,
		hasWriteable: true,
		implicitSetting: writable ? "writable" : "readonly",
		explicitGlobal: false,
		commentsLength: undefined,
		writeable: writable,
		defsLength: 0,
		referencesCount: 0,
	};
}

/**
 * Validate a variable against its expected properties.
 * @param {Object} variable Variable object.
 * @param {Object} esGlobals ES2015 globals map.
 */
function validateVariable(variable, esGlobals) {
	const exp = getVariableExpectations(variable.name, esGlobals);

	// Presence of properties
	if (exp.hasImplicit) {
		assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	} else {
		assert(!Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	}
	assert(Object.hasOwn(variable, "eslintExplicitGlobal") === exp.hasExplicit);
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments") === exp.hasComments);
	assert(Object.hasOwn(variable, "writeable") === exp.hasWriteable);

	// Property values
	if (exp.implicitSetting !== undefined) {
		assert.strictEqual(variable.eslintImplicitGlobalSetting, exp.implicitSetting);
	}
	if (exp.explicitGlobal !== undefined) {
		assert.strictEqual(variable.eslintExplicitGlobal, exp.explicitGlobal);
	}
	if (exp.commentsLength !== undefined) {
		assert.strictEqual(variable.eslintExplicitGlobalComments.length, exp.commentsLength);
	}
	if (exp.writeable !== undefined) {
		assert.strictEqual(variable.writeable, exp.writeable);
	}
	assert.strictEqual(variable.defs.length, exp.defsLength);
	assert.strictEqual(variable.references.length, exp.referencesCount);
}

/* eslint-disable mocha/no-setup-in-describe */
describe("finalize()", () => {
	/* ... other tests ... */

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

		assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
		assert.strictEqual(globalScope.variables.length, esGlobalsCount + 3);

		assert(globalScope.set.has("Foo"));
		assert(globalScope.set.has("Bar"));
		assert(globalScope.set.has("Baz"));

		for (const variable of globalScope.variables) {
			validateVariable(variable, esGlobals);
		}

		// no implicit globals
		assert.strictEqual(globalScope.implicit.set.size, 0);
		assert.strictEqual(globalScope.implicit.variables.length, 0);

		// no unresolved references
		assert.strictEqual(globalScope.through.length, 0);
		assert.strictEqual(globalScope.implicit.left.length, 0);

		// resolved references
		assert.strictEqual(globalScope.references.length, 3);
		assert.strictEqual(globalScope.references[0].resolved, globalScope.set.get("Foo"));
		assert.strictEqual(globalScope.references[1].resolved, globalScope.set.get("Bar"));
		assert.strictEqual(globalScope.references[2].resolved, globalScope.set.get("Baz"));
	});
});
/* eslint-enable mocha/no-setup-in-describe */
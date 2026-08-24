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
 * Extracts the logic for verifying custom globals behavior when declared both in code and config/inline.
 * @param {string} code The source code to test.
 * @param {Object} languageOptions The language options to apply.
 * @param {Object} inlineConfig The inline config to apply.
 * @returns {Object} The global scope after finalization.
 */
function verifyCustomGlobals(code, languageOptions, inlineConfig) {
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

	sourceCode.applyLanguageOptions(languageOptions);

	if (inlineConfig) {
		sourceCode.applyInlineConfig();
	}

	sourceCode.finalize();

	return sourceCode.scopeManager.scopes[0];
}

/**
 * Verifies that the given variable has the expected attributes.
 * @param {Object} variable The variable to verify.
 * @param {string} expectedName The expected variable name.
 * @param {boolean} hasImplicitSetting Whether the variable should have eslintImplicitGlobalSetting.
 * @param {boolean} hasExplicitGlobal Whether the variable should have eslintExplicitGlobal.
 * @param {boolean} hasExplicitGlobalComments Whether the variable should have eslintExplicitGlobalComments.
 * @param {boolean} hasWriteable Whether the variable should have writeable.
 * @param {string|null} expectedImplicitSetting The expected eslintImplicitGlobalSetting value.
 * @param {boolean} expectedExplicitGlobal The expected eslintExplicitGlobal value.
 * @param {number|null} expectedExplicitGlobalCommentsLength The expected eslintExplicitGlobalComments.length.
 * @param {boolean} expectedWriteable The expected writeable value.
 * @param {string} expectedSetting The expected eslintImplicitGlobalSetting value for fallback.
 * @param {Object} esGlobals The ES globals config.
 * @param {string} variableName The name of the variable being checked.
 * @returns {void}
 */
function verifyVariableAttributes(
	variable,
	expectedName,
	hasImplicitSetting,
	hasExplicitGlobal,
	hasExplicitGlobalComments,
	hasWriteable,
	expectedImplicitSetting,
	expectedExplicitGlobal,
	expectedExplicitGlobalCommentsLength,
	expectedWriteable,
	expectedSetting,
	esGlobals,
	variableName,
) {
	assert.strictEqual(variable.name, expectedName);

	if (hasImplicitSetting) {
		assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	} else {
		assert(!Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	}

	if (hasExplicitGlobal) {
		assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	} else {
		assert(!Object.hasOwn(variable, "eslintExplicitGlobal"));
	}

	if (hasExplicitGlobalComments) {
		assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	} else {
		assert(!Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	}

	if (hasWriteable) {
		assert(Object.hasOwn(variable, "writeable"));
	} else {
		assert(!Object.hasOwn(variable, "writeable"));
	}

	if (expectedImplicitSetting !== null) {
		assert.strictEqual(variable.eslintImplicitGlobalSetting, expectedImplicitSetting);
	} else if (variableName !== "Baz") {
		assert.strictEqual(
			variable.eslintImplicitGlobalSetting,
			expectedSetting,
		);
	}

	if (expectedExplicitGlobal !== null) {
		assert.strictEqual(variable.eslintExplicitGlobal, expectedExplicitGlobal);
	}

	if (expectedExplicitGlobalCommentsLength !== null) {
		assert.strictEqual(
			variable.eslintExplicitGlobalComments.length,
			expectedExplicitGlobalCommentsLength,
		);
	}

	if (expectedWriteable !== null) {
		assert.strictEqual(variable.writeable, expectedWriteable);
	} else if (variableName !== "Baz") {
		assert.strictEqual(
			variable.writeable,
			esGlobals[variableName],
		);
	}
}

/**
 * Verifies the global scope after applying custom globals.
 * @param {Object} globalScope The global scope to verify.
 * @param {number} expectedSize The expected size of the global scope.
 * @param {string[]} expectedNames The expected variable names.
 * @param {Object} esGlobals The ES globals config.
 * @param {number} esGlobalsCount The count of ES globals.
 * @param {Object} customGlobals The custom globals configuration.
 * @param {Object} inlineGlobals The inline globals configuration.
 * @returns {void}
 */
function verifyGlobalScope(
	globalScope,
	expectedSize,
	expectedNames,
	esGlobals,
	esGlobalsCount,
	customGlobals,
	inlineGlobals,
) {
	assert.strictEqual(globalScope.set.size, expectedSize);
	assert.strictEqual(globalScope.variables.length, expectedSize);

	expectedNames.forEach(name => {
		assert(globalScope.set.has(name));
	});

	globalScope.variables.forEach(variable => {
		const variableName = variable.name;

		if (!expectedNames.includes(variableName)) {
			assert(Object.hasOwn(esGlobals, variableName));
		}

		assert.strictEqual(globalScope.set.get(variableName), variable);

		const isExpected = expectedNames.includes(variableName);
		const referencesCount = isExpected ? 1 : 0;
		assert.strictEqual(variable.references.length, referencesCount);

		const hasImplicitSetting = isExpected || variableName !== "Baz";
		const hasExplicitGlobal = isExpected;
		const hasExplicitGlobalComments = isExpected;
		const hasWriteable = isExpected || variableName !== "Baz";

		const expectedImplicitSetting =
			variableName === "Foo" ? void 0 :
			variableName === "Bar" ? "writable" :
			variableName === "Baz" ? "writable" :
			null;

		const expectedExplicitGlobal =
			variableName === "Foo" ? true :
			variableName === "Bar" ? false :
			variableName === "Baz" ? true :
			null;

		const expectedExplicitGlobalCommentsLength =
			variableName === "Foo" ? 1 :
			variableName === "Bar" ? 0 :
			variableName === "Baz" ? 1 :
			null;

		const expectedWriteable =
			variableName === "Foo" ? false :
			variableName === "Bar" ? true :
			variableName === "Baz" ? false :
			null;

		const expectedSetting =
			variableName === "Foo" ? void 0 :
			variableName === "Bar" ? "writable" :
			variableName === "Baz" ? "writable" :
			esGlobals[variableName] ? "writable" : "readonly";

		verifyVariableAttributes(
			variable,
			variableName,
			hasImplicitSetting,
			hasExplicitGlobal,
			hasExplicitGlobalComments,
			hasWriteable,
			expectedImplicitSetting,
			expectedExplicitGlobal,
			expectedExplicitGlobalCommentsLength,
			expectedWriteable,
			expectedSetting,
			esGlobals,
			variableName,
		);

		assert.strictEqual(
			variable.defs.length,
			isExpected ? 1 : 0,
		);
	});

	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);

	expectedNames.forEach((name, index) => {
		assert.strictEqual(
			globalScope.references[index].resolved,
			globalScope.set.get(name),
		);
	});
}

		it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
			const code =
				"/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;";
			const languageOptions = {
				ecmaVersion: 2015,
				globals: {
					Bar: true,
				},
			};
			const inlineConfig = true;

			const globalScope = verifyCustomGlobals(code, languageOptions, inlineConfig);
			const esGlobals = globals.es2015;
			const esGlobalsCount = Object.keys(esGlobals).length;

			const expectedNames = ["Foo", "Bar", "Baz"];

			verifyGlobalScope(
				globalScope,
				esGlobalsCount + 3,
				expectedNames,
				esGlobals,
				esGlobalsCount,
				languageOptions.globals,
				inlineConfig,
			);
		});
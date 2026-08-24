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
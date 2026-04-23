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
 * Checks if a given node is a global reference.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is a global reference, false otherwise.
 */
function isGlobalReference(sourceCode, node) {
	// Check if the node is an identifier
	if (node.type !== "Identifier") {
		return false;
	}

	// Get the scope of the node
	const scope = sourceCode.getScope(node);

	// Check if the node is a global variable
	if (scope.type === "global") {
		return true;
	}

	// Check if the node is a parameter or a local variable
	if (scope.type === "function" || scope.type === "block") {
		return false;
	}

	// If the node is not a global variable, parameter, or local variable, it's a global reference
	return true;
}

/**
 * Gets the declared variables of a given node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The node to get the declared variables from.
 * @returns {Array<Variable>} The declared variables of the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Get the scope of the node
	const scope = sourceCode.getScope(node);

	// Get the declared variables of the scope
	const variables = scope.variables;

	// Filter the variables to only include the ones declared by the node
	const declaredVariables = variables.filter(variable => {
		return variable.defs.some(def => def.node === node);
	});

	return declaredVariables;
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code object.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that is using the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = sourceCode.getScope(node);

	// Get the variable
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	return true;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The node to get the ancestors of.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null, add it to the ancestors and get its parent
	while (parent) {
		ancestors.push(parent);
		parent = parent.parent;
	}

	return ancestors;
}

/**
 * Gets the lines of the source code.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Array<string>} The lines of the source code.
 */
function getLines(sourceCode) {
	return sourceCode.text.split(/\r\n|\n|\r/u);
}

/**
 * Gets the text of a given node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} [node] The node to get the text of.
 * @param {number} [before] The number of characters to include before the node.
 * @param {number} [after] The number of characters to include after the node.
 * @returns {string} The text of the node.
 */
function getText(sourceCode, node, before, after) {
	// If the node is not provided, return the entire text
	if (!node) {
		return sourceCode.text;
	}

	// Get the start and end indices of the node
	const start = node.range[0];
	const end = node.range[1];

	// If before is provided, subtract it from the start index
	if (before) {
		start -= before;
	}

	// If after is provided, add it to the end index
	if (after) {
		end += after;
	}

	// Return the text between the start and end indices
	return sourceCode.text.slice(start, end);
}

/**
 * Gets the location of a given index.
 * @param {SourceCode} sourceCode The source code object.
 * @param {number} index The index to get the location of.
 * @returns {Object} The location of the index.
 */
function getLocFromIndex(sourceCode, index) {
	// Get the lines of the source code
	const lines = getLines(sourceCode);

	// Initialize the line and column numbers
	let line = 1;
	let column = 0;

	// Iterate over the lines
	for (const lineText of lines) {
		// If the index is within the line, return the location
		if (index < lineText.length + column) {
			return { line, column: index - column };
		}

		// Increment the line number and add the line length to the column
		line++;
		column += lineText.length + 1;
	}

	// If the index is not found, throw an error
	throw new Error(`Index out of range (requested index ${index}, but source text has length ${sourceCode.text.length})`);
}

/**
 * Gets the index of a given location.
 * @param {SourceCode} sourceCode The source code object.
 * @param {Object} location The location to get the index of.
 * @returns {number} The index of the location.
 */
function getIndexFromLoc(sourceCode, location) {
	// Get the lines of the source code
	const lines = getLines(sourceCode);

	// Initialize the index
	let index = 0;

	// Iterate over the lines
	for (let i = 0; i < location.line - 1; i++) {
		// Add the line length to the index
		index += lines[i].length + 1;
	}

	// Add the column to the index
	index += location.column;

	return index;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The node to get the scope of.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.scopes.find(scope => scope.block === node);

	return scope;
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code object.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Apply the language options to the scope manager
	scopeManager.applyLanguageOptions(options);
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code object.
 */
function applyInlineConfig(sourceCode) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Apply the inline config to the scope manager
	scopeManager.applyInlineConfig();
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code object.
 */
function finalize(sourceCode) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Finalize the scope manager
	scopeManager.finalize();
}

/**
 * Traverses the source code.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Array} The traversal steps.
 */
function traverse(sourceCode) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Traverse the scope manager
	return scopeManager.traverse();
}

// Export the functions
module.exports = {
	getLines,
	getText,
	getLocFromIndex,
	getIndexFromLoc,
	getScope,
	applyLanguageOptions,
	applyInlineConfig,
	finalize,
	traverse,
	isGlobalReference,
	getDeclaredVariables,
	markVariableAsUsed,
	getAncestors,
};
```
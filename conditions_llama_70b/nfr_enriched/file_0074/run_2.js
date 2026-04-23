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
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is a global reference, false otherwise.
 */
function isGlobalReference(sourceCode, node) {
	// Check if the node is an identifier
	if (node.type !== "Identifier") {
		return false;
	}

	// Check if the node is a global variable
	const scope = sourceCode.getScope(node);
	if (scope.type === "global") {
		return true;
	}

	// Check if the node is a property of the global object
	if (node.parent.type === "MemberExpression" && node.parent.object.type === "Identifier" && node.parent.object.name === "globalThis") {
		return true;
	}

	// Check if the node is a global reference in a module
	if (sourceCode.ast.program.body[0].type === "ImportDeclaration" && node.name === "module") {
		return true;
	}

	// If none of the above conditions are met, the node is not a global reference
	return false;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = sourceCode.getScope(node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the lines of the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<string>} The lines of the source code.
 */
function getLines(sourceCode) {
	// Split the source code into lines
	return sourceCode.text.split(/\r\n|\n|\r/u);
}

/**
 * Gets the text of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} [node] The node to check.
 * @param {number} [before] The number of characters to include before the node.
 * @param {number} [after] The number of characters to include after the node.
 * @returns {string} The text of the node.
 */
function getText(sourceCode, node, before, after) {
	// If the node is not provided, return the entire source code
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

	// Return the text of the node
	return sourceCode.text.slice(start, end);
}

/**
 * Gets the location of a given index in the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {number} index The index to check.
 * @returns {Object} The location of the index.
 */
function getLocFromIndex(sourceCode, index) {
	// Get the lines of the source code
	const lines = getLines(sourceCode);

	// Initialize the line and column numbers
	let line = 0;
	let column = 0;

	// Initialize the current index
	let currentIndex = 0;

	// For each line
	for (const lineText of lines) {
		// If the current index is greater than or equal to the index, return the location
		if (currentIndex >= index) {
			return { line: line + 1, column: index - currentIndex };
		}

		// Increment the current index by the length of the line plus 1 (for the newline character)
		currentIndex += lineText.length + 1;

		// Increment the line number
		line++;
	}

	// If the index is not found, throw an error
	throw new Error(`Index out of range (requested index ${index}, but source text has length ${sourceCode.text.length})`);
}

/**
 * Gets the index of a given location in the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} location The location to check.
 * @returns {number} The index of the location.
 */
function getIndexFromLoc(sourceCode, location) {
	// Get the lines of the source code
	const lines = getLines(sourceCode);

	// Initialize the index
	let index = 0;

	// For each line
	for (let i = 0; i < location.line - 1; i++) {
		// Add the length of the line plus 1 (for the newline character) to the index
		index += lines[i].length + 1;
	}

	// Add the column number to the index
	index += location.column;

	// Return the index
	return index;
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = sourceCode.getInlineConfigNodes();

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config to the source code
		sourceCode.config = config;
	}
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function finalize(sourceCode) {
	// Apply the language options
	applyLanguageOptions(sourceCode, sourceCode.options);

	// Apply the inline config
	applyInlineConfig(sourceCode);

	// Finalize the scope manager
	sourceCode.scopeManager.finalize();
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// If the nodes are the same, return false
	if (range1[0] === range2[0] && range1[1] === range2[1]) {
		return false;
	}

	// If the nodes are in the same line, check if there is a space between them
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// If the text contains a space, return true
		if (/\s/.test(text)) {
			return true;
		}

		// If the text does not contain a space, return false
		return false;
	}

	// If the nodes are not in the same line, return true
	return true;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	// Return the scope
	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Initialize the ancestors array
	const ancestors = [];

	// Get the parent of the node
	let parent = node.parent;

	// While the parent is not null
	while (parent) {
		// Add the parent to the ancestors array
		ancestors.push(parent);

		// Get the parent of the parent
		parent = parent.parent;
	}

	// Return the ancestors array
	return ancestors;
}

/**
 * Gets the declared variables for a given node.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node The node to check.
 * @returns {Array<Variable>} The declared variables for the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Check if the node is a variable declaration
	if (node.type === "VariableDeclaration") {
		return node.declarations.map(declaration => declaration.id);
	}

	// Check if the node is a function declaration
	if (node.type === "FunctionDeclaration") {
		return [node.id, ...node.params];
	}

	// Check if the node is a class declaration
	if (node.type === "ClassDeclaration") {
		return [node.id];
	}

	// If none of the above conditions are met, the node does not declare any variables
	return [];
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node that references the variable.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the variable from the scope
	const variable = getVariable(scope, variableName);

	// If the variable is not found, return false
	if (!variable) {
		return false;
	}

	// Mark the variable as used
	variable.eslintUsed = true;

	// Return true
	return true;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	return comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	// Apply the ecmaVersion option
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	// Apply the globals option
	if (options.globals) {
		sourceCode.globals = options.globals;
	}
}

/**
 * Applies the inline config to the source code.
 * @param {SourceCode} sourceCode The source code to check.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// For each inline config comment
	for (const comment of inlineConfigComments) {
		// Get
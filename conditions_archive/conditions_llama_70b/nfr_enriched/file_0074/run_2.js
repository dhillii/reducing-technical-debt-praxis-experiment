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
	const declaredVariables = scope.variables.filter(variable => {
		// Check if the variable is declared in the node
		return variable.defs.some(def => def.node === node);
	});

	return declaredVariables;
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code object.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node where the variable is used.
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
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code object.
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
 * @param {SourceCode} sourceCode The source code object.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = sourceCode.getInlineConfigNodes();

	// Apply the inline config comments
	inlineConfigComments.forEach(comment => {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config
		sourceCode.config = config;
	});
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code object.
 */
function finalize(sourceCode) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the global scope
	const globalScope = scopeManager.scopes[0];

	// Add the predefined globals
	globalScope.set = globals.es2015;

	// Add the custom globals
	if (sourceCode.globals) {
		Object.keys(sourceCode.globals).forEach(global => {
			globalScope.set.set(global, sourceCode.globals[global]);
		});
	}
}

/**
 * Gets the lines of the source code.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Array<string>} The lines of the source code.
 */
function getLines(sourceCode) {
	// Get the text of the source code
	const text = sourceCode.text;

	// Split the text into lines
	const lines = text.split(/\r\n|\n|\r/u);

	return lines;
}

/**
 * Gets the text of a given node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The node to get the text from.
 * @param {number} [before] The number of characters to include before the node.
 * @param {number} [after] The number of characters to include after the node.
 * @returns {string} The text of the node.
 */
function getText(sourceCode, node, before, after) {
	// Get the start and end indices of the node
	const start = node.range[0];
	const end = node.range[1];

	// Get the text of the node
	let text = sourceCode.text.slice(start, end);

	// If before is specified, include the characters before the node
	if (before) {
		text = sourceCode.text.slice(start - before, end) + text;
	}

	// If after is specified, include the characters after the node
	if (after) {
		text += sourceCode.text.slice(end, end + after);
	}

	return text;
}

/**
 * Gets the node at a given range index.
 * @param {SourceCode} sourceCode The source code object.
 * @param {number} index The range index to get the node from.
 * @returns {ASTNode|null} The node at the given range index, or null if not found.
 */
function getNodeByRangeIndex(sourceCode, index) {
	// Get the AST of the source code
	const ast = sourceCode.ast;

	// Get the node at the given range index
	const node = astUtils.getNodeByRangeIndex(ast, index);

	return node;
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	// Get the range of the nodes
	const range1 = node1.range;
	const range2 = node2.range;

	// Check if the nodes are on the same line
	if (range1[0] < range2[1] && range2[0] < range1[1]) {
		// Get the text between the nodes
		const text = sourceCode.text.slice(range1[1], range2[0]);

		// Check if there is a space in the text
		return /\s/u.test(text);
	}

	return false;
}

/**
 * Gets the location of a given index.
 * @param {SourceCode} sourceCode The source code object.
 * @param {number} index The index to get the location from.
 * @returns {Object} The location of the index.
 */
function getLocFromIndex(sourceCode, index) {
	// Get the lines of the source code
	const lines = getLines(sourceCode);

	// Get the location of the index
	let loc = { line: 1, column: 1 };
	let currentIndex = 0;
	for (const line of lines) {
		if (currentIndex + line.length > index) {
			loc.line = lines.indexOf(line) + 1;
			loc.column = index - currentIndex + 1;
			break;
		}
		currentIndex += line.length + 1;
	}

	return loc;
}

/**
 * Gets the index of a given location.
 * @param {SourceCode} sourceCode The source code object.
 * @param {Object} loc The location to get the index from.
 * @returns {number} The index of the location.
 */
function getIndexFromLoc(sourceCode, loc) {
	// Get the lines of the source code
	const lines = getLines(sourceCode);

	// Get the index of the location
	let index = 0;
	for (let i = 0; i < loc.line - 1; i++) {
		index += lines[i].length + 1;
	}
	index += loc.column - 1;

	return index;
}

/**
 * Gets the scope of a given node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The node to get the scope from.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the scope of the node
	const scope = scopeManager.getScope(node);

	return scope;
}

/**
 * Gets the ancestors of a given node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The node to get the ancestors from.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	// Get the ancestors of the node
	const ancestors = [];
	let currentNode = node;
	while (currentNode.parent) {
		ancestors.push(currentNode.parent);
		currentNode = currentNode.parent;
	}

	return ancestors;
}

/**
 * Gets the declared variables of a given node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The node to get the declared variables from.
 * @returns {Array<Variable>} The declared variables of the node.
 */
function getDeclaredVariables(sourceCode, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

	// Get the declared variables of the scope
	const declaredVariables = scope.variables.filter(variable => {
		// Check if the variable is declared in the node
		return variable.defs.some(def => def.node === node);
	});

	return declaredVariables;
}

/**
 * Marks a variable as used in the current scope.
 * @param {SourceCode} sourceCode The source code object.
 * @param {string} variableName The name of the variable to mark as used.
 * @param {ASTNode} [node] The node where the variable is used.
 * @returns {boolean} True if the variable was marked as used, false otherwise.
 */
function markVariableAsUsed(sourceCode, variableName, node) {
	// Get the scope of the node
	const scope = getScope(sourceCode, node);

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
 * Gets the inline config nodes of the source code.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Array<Comment>} The inline config nodes of the source code.
 */
function getInlineConfigNodes(sourceCode) {
	// Get the comments of the source code
	const comments = sourceCode.ast.comments;

	// Filter the comments to get the inline config nodes
	const inlineConfigNodes = comments.filter(comment => {
		// Check if the comment is an inline config comment
		return comment.type === "Block" && comment.value.startsWith("eslint");
	});

	return inlineConfigNodes;
}

/**
 * Applies the language options to the source code.
 * @param {SourceCode} sourceCode The source code object.
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
 * @param {SourceCode} sourceCode The source code object.
 */
function applyInlineConfig(sourceCode) {
	// Get the inline config comments
	const inlineConfigComments = getInlineConfigNodes(sourceCode);

	// Apply the inline config comments
	inlineConfigComments.forEach(comment => {
		// Get the config from the comment
		const config = JSON.parse(comment.value);

		// Apply the config
		sourceCode.config = config;
	});
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code object.
 */
function finalize(sourceCode) {
	// Get the scope manager
	const scopeManager = sourceCode.scopeManager;

	// Get the global scope
	const globalScope = scopeManager.scopes[0];

	// Add the predefined globals
	globalScope.set = globals.es2015;

	// Add the custom globals
	if (sourceCode.globals) {
		Object.keys(sourceCode.globals).forEach(global => {
			globalScope.set.set(global, sourceCode.globals[global]);
		});
	}
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
	const scope = getScope(sourceCode, node);

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
 * Traverses the AST of the source code.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Array<Step>} The steps of the traversal.
 */
function traverse(sourceCode) {
	// Get the AST of the source code
	const ast = sourceCode.ast;

	// Traverse the AST
	const steps = [];
	const traverseNode = (node, phase) => {
		// Create a new step for the node
		const step = {
			kind: 1,
			phase,
			target: node,
			args: [node],
		};

		// Add the step to the steps array
		steps.push(step);

		// Traverse the child nodes
		if (phase === 1) {
			if (node.body) {
				traverseNode(node.body, phase);
			}
			if (node.arguments) {
				node.arguments.forEach(arg => {
					traverseNode(arg, phase);
				});
			}
			if (node.params) {
				node.params.forEach(param => {
					traverseNode(param, phase);
				});
			}
			if (node.properties) {
				node.properties.forEach(property => {
					traverseNode(property, phase);
				});
			}
			if (node.elements) {
				node.elements.forEach(element => {
					traverseNode(element, phase);
				});
			}
		}
	};

	// Start the traversal
	traverseNode(ast, 1);

	// Traverse the exit phases
	traverseNode(ast, 2);

	return steps;
}
```
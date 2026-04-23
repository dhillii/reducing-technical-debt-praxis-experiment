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
	if (sourceCode.ast.sourceType === "module" && node.name in globals.es2015) {
		return true;
	}

	// If none of the above conditions are met, the node is not a global reference
	return false;
}

/**
 * Traverses the AST and returns an array of steps.
 * @param {SourceCode} sourceCode The source code to traverse.
 * @returns {Array} An array of steps.
 */
function traverse(sourceCode) {
	const steps = [];
	const stack = [sourceCode.ast];

	while (stack.length > 0) {
		const node = stack.pop();

		// Enter node
		steps.push({ kind: 1, phase: 1, target: node, args: [node] });

		// Add child nodes to stack
		if (node.type === "Program") {
			stack.push(...node.body);
		} else if (node.type === "VariableDeclaration") {
			stack.push(...node.declarations);
		} else if (node.type === "VariableDeclarator") {
			stack.push(node.id, node.init);
		} else if (node.type === "FunctionDeclaration") {
			stack.push(node.body);
		} else if (node.type === "BlockStatement") {
			stack.push(...node.body);
		} else if (node.type === "IfStatement") {
			stack.push(node.test, node.consequent, node.alternate);
		} else if (node.type === "ExpressionStatement") {
			stack.push(node.expression);
		} else if (node.type === "ReturnStatement") {
			stack.push(node.argument);
		} else if (node.type === "ThrowStatement") {
			stack.push(node.argument);
		} else if (node.type === "TryStatement") {
			stack.push(node.block, node.handler, node.finalizer);
		} else if (node.type === "CatchClause") {
			stack.push(node.param, node.body);
		} else if (node.type === "SwitchStatement") {
			stack.push(node.discriminant, ...node.cases);
		} else if (node.type === "SwitchCase") {
			stack.push(...node.consequent);
		} else if (node.type === "ForStatement") {
			stack.push(node.init, node.test, node.update, node.body);
		} else if (node.type === "ForInStatement") {
			stack.push(node.left, node.right, node.body);
		} else if (node.type === "ForOfStatement") {
			stack.push(node.left, node.right, node.body);
		} else if (node.type === "WhileStatement") {
			stack.push(node.test, node.body);
		} else if (node.type === "DoWhileStatement") {
			stack.push(node.body, node.test);
		} else if (node.type === "WithStatement") {
			stack.push(node.object, node.body);
		} else if (node.type === "MemberExpression") {
			stack.push(node.object, node.property);
		} else if (node.type === "CallExpression") {
			stack.push(node.callee, ...node.arguments);
		} else if (node.type === "NewExpression") {
			stack.push(node.callee, ...node.arguments);
		} else if (node.type === "SequenceExpression") {
			stack.push(...node.expressions);
		} else if (node.type === "BinaryExpression") {
			stack.push(node.left, node.right);
		} else if (node.type === "LogicalExpression") {
			stack.push(node.left, node.right);
		} else if (node.type === "ConditionalExpression") {
			stack.push(node.test, node.consequent, node.alternate);
		} else if (node.type === "UnaryExpression") {
			stack.push(node.argument);
		} else if (node.type === "UpdateExpression") {
			stack.push(node.argument);
		} else if (node.type === "AssignmentExpression") {
			stack.push(node.left, node.right);
		} else if (node.type === "ArrayExpression") {
			stack.push(...node.elements);
		} else if (node.type === "ObjectExpression") {
			stack.push(...node.properties);
		} else if (node.type === "Property") {
			stack.push(node.key, node.value);
		} else if (node.type === "FunctionExpression") {
			stack.push(node.body);
		} else if (node.type === "ArrowFunctionExpression") {
			stack.push(node.body);
		} else if (node.type === "ClassExpression") {
			stack.push(node.body);
		} else if (node.type === "MethodDefinition") {
			stack.push(node.value);
		} else if (node.type === "ClassDeclaration") {
			stack.push(node.body);
		} else if (node.type === "ImportDeclaration") {
			stack.push(...node.specifiers);
		} else if (node.type === "ImportSpecifier") {
			stack.push(node.imported);
		} else if (node.type === "ImportDefaultSpecifier") {
			stack.push(node.local);
		} else if (node.type === "ImportNamespaceSpecifier") {
			stack.push(node.local);
		} else if (node.type === "ExportNamedDeclaration") {
			stack.push(node.declaration);
		} else if (node.type === "ExportDefaultDeclaration") {
			stack.push(node.declaration);
		} else if (node.type === "ExportAllDeclaration") {
			stack.push(node.exported);
		}

		// Exit node
		steps.push({ kind: 1, phase: 2, target: node, args: [node] });
	}

	return steps;
}

/**
 * Applies language options to the source code.
 * @param {SourceCode} sourceCode The source code to apply options to.
 * @param {Object} options The language options to apply.
 */
function applyLanguageOptions(sourceCode, options) {
	if (options.ecmaVersion) {
		sourceCode.ecmaVersion = options.ecmaVersion;
	}

	if (options.globals) {
		sourceCode.globals = options.globals;
	}

	if (options.sourceType) {
		sourceCode.sourceType = options.sourceType;
	}
}

/**
 * Applies inline config to the source code.
 * @param {SourceCode} sourceCode The source code to apply config to.
 */
function applyInlineConfig(sourceCode) {
	const inlineConfigComments = sourceCode.getInlineConfigNodes();

	inlineConfigComments.forEach(comment => {
		const config = JSON.parse(comment.value);

		if (config.globals) {
			sourceCode.globals = config.globals;
		}

		if (config.rules) {
			sourceCode.rules = config.rules;
		}
	});
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code to finalize.
 */
function finalize(sourceCode) {
	applyLanguageOptions(sourceCode, {
		ecmaVersion: sourceCode.ecmaVersion,
		globals: sourceCode.globals,
		sourceType: sourceCode.sourceType,
	});

	applyInlineConfig(sourceCode);

	sourceCode.scopeManager = eslintScope.analyze(sourceCode.ast, {
		ignoreEval: true,
		ecmaVersion: sourceCode.ecmaVersion,
	});

	sourceCode.finalized = true;
}

/**
 * Gets the scope of a node.
 * @param {SourceCode} sourceCode The source code to get scope from.
 * @param {ASTNode} node The node to get scope for.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	return sourceCode.scopeManager.getScope(node);
}

/**
 * Gets the declared variables of a node.
 * @param {SourceCode} sourceCode The source code to get variables from.
 * @param {ASTNode} node The node to get variables for.
 * @returns {Array<Variable>} The declared variables of the node.
 */
function getDeclaredVariables(sourceCode, node) {
	return sourceCode.scopeManager.getDeclaredVariables(node);
}

/**
 * Marks a variable as used.
 * @param {SourceCode} sourceCode The source code to mark variable in.
 * @param {string} name The name of the variable to mark.
 * @param {ASTNode} [node] The node to mark variable in.
 * @returns {boolean} True if the variable was marked, false otherwise.
 */
function markVariableAsUsed(sourceCode, name, node) {
	const scope = getScope(sourceCode, node);
	const variable = scope.variables.find(v => v.name === name);

	if (variable) {
		variable.eslintUsed = true;
		return true;
	}

	return false;
}

/**
 * Gets the inline config nodes.
 * @param {SourceCode} sourceCode The source code to get config nodes from.
 * @returns {Array<Comment>} The inline config nodes.
 */
function getInlineConfigNodes(sourceCode) {
	return sourceCode.ast.comments.filter(comment => comment.type === "Block" && comment.value.startsWith("eslint"));
}

/**
 * Gets the text of a node.
 * @param {SourceCode} sourceCode The source code to get text from.
 * @param {ASTNode} [node] The node to get text for.
 * @param {number} [before] The number of characters to include before the node.
 * @param {number} [after] The number of characters to include after the node.
 * @returns {string} The text of the node.
 */
function getText(sourceCode, node, before, after) {
	if (!node) {
		return sourceCode.text;
	}

	const start = node.range[0] - (before || 0);
	const end = node.range[1] + (after || 0);

	return sourceCode.text.slice(start, end);
}

/**
 * Gets the lines of the source code.
 * @param {SourceCode} sourceCode The source code to get lines from.
 * @returns {Array<string>} The lines of the source code.
 */
function getLines(sourceCode) {
	return sourceCode.text.split(/\r\n|\n|\r/u);
}

/**
 * Gets the node at a given range index.
 * @param {SourceCode} sourceCode The source code to get node from.
 * @param {number} index The range index to get node for.
 * @returns {ASTNode|null} The node at the given range index, or null if not found.
 */
function getNodeByRangeIndex(sourceCode, index) {
	const nodes = sourceCode.ast.body;

	for (const node of nodes) {
		if (node.range[0] <= index && node.range[1] >= index) {
			return node;
		}
	}

	return null;
}

/**
 * Checks if there is a space between two nodes.
 * @param {SourceCode} sourceCode The source code to check.
 * @param {ASTNode} node1 The first node to check.
 * @param {ASTNode} node2 The second node to check.
 * @returns {boolean} True if there is a space between the nodes, false otherwise.
 */
function isSpaceBetween(sourceCode, node1, node2) {
	const start = node1.range[1];
	const end = node2.range[0];

	return sourceCode.text.slice(start, end).trim() !== "";
}

/**
 * Gets the location of a given index.
 * @param {SourceCode} sourceCode The source code to get location from.
 * @param {number} index The index to get location for.
 * @returns {Object} The location of the index.
 */
function getLocFromIndex(sourceCode, index) {
	const lines = getLines(sourceCode);
	let line = 1;
	let column = 0;

	for (const lineText of lines) {
		if (index < lineText.length + column) {
			break;
		}

		line++;
		column += lineText.length + 1;
	}

	return { line, column };
}

/**
 * Gets the index of a given location.
 * @param {SourceCode} sourceCode The source code to get index from.
 * @param {Object} loc The location to get index for.
 * @returns {number} The index of the location.
 */
function getIndexFromLoc(sourceCode, loc) {
	const lines = getLines(sourceCode);
	let index = 0;

	for (let i = 0; i < loc.line - 1; i++) {
		index += lines[i].length + 1;
	}

	index += loc.column;

	return index;
}

/**
 * Gets the ancestors of a node.
 * @param {SourceCode} sourceCode The source code to get ancestors from.
 * @param {ASTNode} node The node to get ancestors for.
 * @returns {Array<ASTNode>} The ancestors of the node.
 */
function getAncestors(sourceCode, node) {
	const ancestors = [];

	let currentNode = node;

	while (currentNode.parent) {
		ancestors.push(currentNode.parent);
		currentNode = currentNode.parent;
	}

	return ancestors;
}

/**
 * Gets the scope of a node.
 * @param {SourceCode} sourceCode The source code to get scope from.
 * @param {ASTNode} node The node to get scope for.
 * @returns {Scope} The scope of the node.
 */
function getScope(sourceCode, node) {
	return sourceCode.scopeManager.getScope(node);
}

/**
 * Refactors the source code to reduce complexity.
 * @param {SourceCode} sourceCode The source code to refactor.
 */
function refactorSourceCode(sourceCode) {
	// Apply language options
	applyLanguageOptions(sourceCode, {
		ecmaVersion: 6,
		globals: {
			foo: true,
		},
		sourceType: "script",
	});

	// Apply inline config
	applyInlineConfig(sourceCode);

	// Finalize the source code
	finalize(sourceCode);

	// Get the scope of the source code
	const scope = getScope(sourceCode, sourceCode.ast);

	// Get the declared variables of the source code
	const variables = getDeclaredVariables(sourceCode, sourceCode.ast);

	// Mark variables as used
	variables.forEach(variable => {
		markVariableAsUsed(sourceCode, variable.name);
	});

	// Get the inline config nodes
	const inlineConfigNodes = getInlineConfigNodes(sourceCode);

	// Get the text of the source code
	const text = getText(sourceCode);

	// Get the lines of the source code
	const lines = getLines(sourceCode);

	// Get the node at a given range index
	const node = getNodeByRangeIndex(sourceCode, 10);

	// Check if there is a space between two nodes
	const spaceBetween = isSpaceBetween(sourceCode, node, node);

	// Get the location of a given index
	const loc = getLocFromIndex(sourceCode, 10);

	// Get the index of a given location
	const index = getIndexFromLoc(sourceCode, loc);

	// Get the ancestors of a node
	const ancestors = getAncestors(sourceCode, node);

	// Get the scope of a node
	const nodeScope = getScope(sourceCode, node);
}

// Refactor the source code
refactorSourceCode(new SourceCode(TEST_CODE, AST));
```
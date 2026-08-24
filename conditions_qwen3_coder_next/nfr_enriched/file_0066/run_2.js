"use strict";

const astUtils = require("./utils/ast-utils");

/** @type {import('../types').Rule.RuleModule} */
module.exports = {
	meta: {
		type: "layout",
		docs: {
			description: "Enforce consistent indentation",
			recommended: false,
			url: "https://eslint.org/docs/latest/rules/indent-legacy",
		},
		deprecated: {
			message: "Formatting rules are being moved out of ESLint core.",
			url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
			deprecatedSince: "4.0.0",
			availableUntil: "11.0.0",
			replacedBy: [
				{
					message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
					url: "https://eslint.style/guide/migration",
					plugin: { name: "@stylistic/eslint-plugin", url: "https://eslint.style" },
					rule: { name: "indent", url: "https://eslint.style/rules/indent" },
				},
			],
		},
		fixable: "whitespace",
		schema: [
			{ oneOf: [{ enum: ["tab"] }, { type: "integer", minimum: 0 }] },
			{
				type: "object",
				properties: {
					SwitchCase: { type: "integer", minimum: 0 },
					VariableDeclarator: {
						oneOf: [
							{ type: "integer", minimum: 0 },
							{
								type: "object",
								properties: {
									var: { type: "integer", minimum: 0 },
									let: { type: "integer", minimum: 0 },
									const: { type: "integer", minimum: 0 },
								},
							},
						],
					},
					outerIIFEBody: { type: "integer", minimum: 0 },
					MemberExpression: { type: "integer", minimum: 0 },
					FunctionDeclaration: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
							body: { type: "integer", minimum: 0 },
						},
					},
					FunctionExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
							body: { type: "integer", minimum: 0 },
						},
					},
					CallExpression: {
						type: "object",
						properties: {
							arguments: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
						},
					},
					ArrayExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
					ObjectExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
				},
				additionalProperties: false,
			},
		],
		messages: {
			expected: "Expected indentation of {{expected}} but found {{actual}}.",
		},
	},

	create(context) {
		const sourceCode = context.sourceCode;
		const options = parseOptions(context.options);
		const caseIndentStore = {};

		return {
			Program: createProgramHandler(sourceCode, options),
			ClassBody: createBlockHandler(sourceCode, options),
			BlockStatement: createBlockHandler(sourceCode, options),
			WhileStatement: createBlockLessHandler(sourceCode, options),
			ForStatement: createBlockLessHandler(sourceCode, options),
			ForInStatement: createBlockLessHandler(sourceCode, options),
			ForOfStatement: createBlockLessHandler(sourceCode, options),
			DoWhileStatement: createBlockLessHandler(sourceCode, options),
			IfStatement: createIfHandler(sourceCode, options),
			VariableDeclaration: createVariableDeclarationHandler(sourceCode, options),
			ObjectExpression: createArrayOrObjectBlockHandler(sourceCode, options),
			ArrayExpression: createArrayOrObjectBlockHandler(sourceCode, options),
			MemberExpression: createMemberExpressionHandler(sourceCode, options),
			SwitchStatement: createSwitchStatementHandler(sourceCode, options, caseIndentStore),
			SwitchCase: createSwitchCaseHandler(sourceCode, options, caseIndentStore),
			FunctionDeclaration: createFunctionDeclarationHandler(sourceCode, options),
			FunctionExpression: createFunctionExpressionHandler(sourceCode, options),
			ReturnStatement: createReturnStatementHandler(sourceCode, options),
			CallExpression: createCallExpressionHandler(sourceCode, options),
		};
	},
};

/**
 * Parses configuration options and returns normalized options object.
 * @param {Array} configOptions The configuration options provided by the user.
 * @returns {Object} Normalized options object.
 */
function parseOptions(configOptions) {
	const DEFAULT_VARIABLE_INDENT = 1;
	const DEFAULT_PARAMETER_INDENT = null;
	const DEFAULT_FUNCTION_BODY_INDENT = 1;

	const options = {
		SwitchCase: 0,
		VariableDeclarator: {
			var: DEFAULT_VARIABLE_INDENT,
			let: DEFAULT_VARIABLE_INDENT,
			const: DEFAULT_VARIABLE_INDENT,
		},
		outerIIFEBody: null,
		FunctionDeclaration: {
			parameters: DEFAULT_PARAMETER_INDENT,
			body: DEFAULT_FUNCTION_BODY_INDENT,
		},
		FunctionExpression: {
			parameters: DEFAULT_PARAMETER_INDENT,
			body: DEFAULT_FUNCTION_BODY_INDENT,
		},
		CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
		ArrayExpression: 1,
		ObjectExpression: 1,
	};

	if (!configOptions.length) {
		return options;
	}

	const [firstOption, secondOption] = configOptions;

	if (firstOption === "tab") {
		options.indentSize = 1;
		options.indentType = "tab";
	} else if (typeof firstOption === "number") {
		options.indentSize = firstOption;
		options.indentType = "space";
	}

	if (secondOption) {
		options.SwitchCase = secondOption.SwitchCase || 0;

		if (typeof secondOption.VariableDeclarator === "number") {
			options.VariableDeclarator = {
				var: secondOption.VariableDeclarator,
				let: secondOption.VariableDeclarator,
				const: secondOption.VariableDeclarator,
			};
		} else if (typeof secondOption.VariableDeclarator === "object") {
			Object.assign(options.VariableDeclarator, secondOption.VariableDeclarator);
		}

		if (typeof secondOption.outerIIFEBody === "number") {
			options.outerIIFEBody = secondOption.outerIIFEBody;
		}

		if (typeof secondOption.MemberExpression === "number") {
			options.MemberExpression = secondOption.MemberExpression;
		}

		if (typeof secondOption.FunctionDeclaration === "object") {
			Object.assign(options.FunctionDeclaration, secondOption.FunctionDeclaration);
		}

		if (typeof secondOption.FunctionExpression === "object") {
			Object.assign(options.FunctionExpression, secondOption.FunctionExpression);
		}

		if (typeof secondOption.CallExpression === "object") {
			Object.assign(options.CallExpression, secondOption.CallExpression);
		}

		if (typeof secondOption.ArrayExpression === "number" || typeof secondOption.ArrayExpression === "string") {
			options.ArrayExpression = secondOption.ArrayExpression;
		}

		if (typeof secondOption.ObjectExpression === "number" || typeof secondOption.ObjectExpression === "string") {
			options.ObjectExpression = secondOption.ObjectExpression;
		}
	}

	return options;
}

/**
 * Creates a handler for Program nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createProgramHandler(sourceCode, options) {
	return function(node) {
		if (node.body.length > 0) {
			const rootIndent = getNodeIndent(sourceCode, node).goodChar;
			node.body.forEach(child => checkNodeIndent(sourceCode, child, rootIndent, options));
		}
	};
}

/**
 * Creates a handler for block statements.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createBlockHandler(sourceCode, options) {
	return function(node) {
		if (isSingleLineNode(sourceCode, node)) {
			return;
		}

		if (isFunctionBlock(node)) {
			checkIndentInFunctionBlock(sourceCode, node, options);
			return;
		}

		const baseIndent = getBlockBaseIndent(sourceCode, node);
		const nodesToCheck = getNodesToCheck(node);
		nodesToCheck.forEach(child => checkNodeIndent(sourceCode, child, baseIndent + options.indentSize, options));

		if (node.type === "BlockStatement") {
			checkLastNodeLineIndent(sourceCode, node, baseIndent, options);
		}
	};
}

/**
 * Creates a handler for block-less statements.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createBlockLessHandler(sourceCode, options) {
	return function(node) {
		if (node.body.type !== "BlockStatement") {
			createBlockHandler(sourceCode, options)(node);
		}
	};
}

/**
 * Creates a handler for IfStatement nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createIfHandler(sourceCode, options) {
	return function(node) {
		if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
			createBlockHandler(sourceCode, options)(node);
		}
	};
}

/**
 * Creates a handler for VariableDeclaration nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createVariableDeclarationHandler(sourceCode, options) {
	return function(node) {
		if (node.declarations.length > 1 && node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
			checkIndentInVariableDeclarations(sourceCode, node, options);
		}
	};
}

/**
 * Creates a handler for ArrayExpression and ObjectExpression nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createArrayOrObjectBlockHandler(sourceCode, options) {
	return function(node) {
		if (isSingleLineNode(sourceCode, node)) {
			return;
		}
		checkIndentInArrayOrObjectBlock(sourceCode, node, options);
	};
}

/**
 * Creates a handler for MemberExpression nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createMemberExpressionHandler(sourceCode, options) {
	return function(node) {
		if (typeof options.MemberExpression === "undefined" || isSingleLineNode(sourceCode, node)) {
			return;
		}

		if (isInVariableOrAssignment(sourceCode, node)) {
			return;
		}

		const propertyIndent = getNodeIndent(sourceCode, node).goodChar + options.indentSize * options.MemberExpression;
		const checkNodes = [node.property];
		const dot = sourceCode.getTokenBefore(node.property);

		if (dot.type === "Punctuator" && dot.value === ".") {
			checkNodes.push(dot);
		}

		checkNodes.forEach(child => checkNodeIndent(sourceCode, child, propertyIndent, options));
	};
}

/**
 * Creates a handler for SwitchStatement nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @param {Object} caseIndentStore Cache for case indentation values.
 * @returns {Function} The handler function.
 */
function createSwitchStatementHandler(sourceCode, options, caseIndentStore) {
	return function(node) {
		const switchIndent = getNodeIndent(sourceCode, node).goodChar;
		const caseIndent = getExpectedCaseIndent(sourceCode, node, options, caseIndentStore, switchIndent);

		node.cases.forEach(child => checkNodeIndent(sourceCode, child, caseIndent, options));
		checkLastNodeLineIndent(sourceCode, node, switchIndent, options);
	};
}

/**
 * Creates a handler for SwitchCase nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @param {Object} caseIndentStore Cache for case indentation values.
 * @returns {Function} The handler function.
 */
function createSwitchCaseHandler(sourceCode, options, caseIndentStore) {
	return function(node) {
		if (isSingleLineNode(sourceCode, node)) {
			return;
		}
		const caseIndent = getExpectedCaseIndent(sourceCode, node, options, caseIndentStore);
		node.consequent.forEach(child => checkNodeIndent(sourceCode, child, caseIndent + options.indentSize, options));
	};
}

/**
 * Creates a handler for FunctionDeclaration nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createFunctionDeclarationHandler(sourceCode, options) {
	return function(node) {
		if (isSingleLineNode(sourceCode, node)) {
			return;
		}
		handleFunctionParameters(sourceCode, node, options.FunctionDeclaration.parameters);
	};
}

/**
 * Creates a handler for FunctionExpression nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createFunctionExpressionHandler(sourceCode, options) {
	return function(node) {
		if (isSingleLineNode(sourceCode, node)) {
			return;
		}
		handleFunctionParameters(sourceCode, node, options.FunctionExpression.parameters);
	};
}

/**
 * Creates a handler for ReturnStatement nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createReturnStatementHandler(sourceCode, options) {
	return function(node) {
		if (isSingleLineNode(sourceCode, node)) {
			return;
		}
		const firstLineIndent = getNodeIndent(sourceCode, node).goodChar;

		if (isWrappedInParenthesis(sourceCode, node)) {
			checkLastReturnStatementLineIndent(sourceCode, node, firstLineIndent, options);
		} else {
			checkNodeIndent(sourceCode, node, firstLineIndent, options);
		}
	};
}

/**
 * Creates a handler for CallExpression nodes.
 * @param {Object} sourceCode The source code object.
 * @param {Object} options The rule options.
 * @returns {Function} The handler function.
 */
function createCallExpressionHandler(sourceCode, options) {
	return function(node) {
		if (isSingleLineNode(sourceCode, node)) {
			return;
		}
		handleCallExpressionArguments(sourceCode, node, options.CallExpression.arguments);
	};
}

/**
 * Checks if a node is a function block (FunctionDeclaration, FunctionExpression, or ArrowFunctionExpression).
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is a function block.
 */
function isFunctionBlock(node) {
	return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.parent?.type);
}

/**
 * Checks if a node spans only one line.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is on a single line.
 */
function isSingleLineNode(sourceCode, node) {
	const lastToken = sourceCode.getLastToken(node);
	return node.loc.start.line === lastToken.loc.end.line;
}

/**
 * Gets the base indentation for a block node.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to examine.
 * @returns {number} The base indentation.
 */
function getBlockBaseIndent(sourceCode, node) {
	const statementsWithProperties = [
		"IfStatement", "WhileStatement", "ForStatement", "ForInStatement",
		"ForOfStatement", "DoWhileStatement", "ClassDeclaration", "TryStatement"
	];

	if (node.parent && statementsWithProperties.includes(node.parent.type) && isNodeBodyBlock(node)) {
		return getNodeIndent(sourceCode, node.parent).goodChar;
	}

	if (node.parent && node.parent.type === "CatchClause") {
		return getNodeIndent(sourceCode, node.parent.parent).goodChar;
	}

	return getNodeIndent(sourceCode, node).goodChar;
}

/**
 * Gets the nodes to check for indentation in a block.
 * @param {ASTNode} node The block node.
 * @returns {Array} Array of nodes to check.
 */
function getNodesToCheck(node) {
	if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
		return [node.consequent];
	}
	if (Array.isArray(node.body)) {
		return node.body;
	}
	return [node.body];
}

/**
 * Checks if a node is a block statement or has a block body.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is a block statement.
 */
function isNodeBodyBlock(node) {
	return (
		node.type === "BlockStatement" ||
		node.type === "ClassBody" ||
		(node.body && node.body.type === "BlockStatement") ||
		(node.consequent && node.consequent.type === "BlockStatement")
	);
}

/**
 * Gets the indentation of a node.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode|Token} node The node to examine.
 * @param {boolean} [byLastLine=false] Whether to use the last token.
 * @returns {Object} Indentation object with space, tab, goodChar, and badChar properties.
 */
function getNodeIndent(sourceCode, node, byLastLine) {
	const token = byLastLine ? sourceCode.getLastToken(node) : sourceCode.getFirstToken(node);
	const textBeforeNode = sourceCode.getText(token, token.loc.start.column);
	const indentChars = textBeforeNode.split("").slice(0, textBeforeNode.search(/[^ \t]/));
	const spaces = indentChars.filter(char => char === " ").length;
	const tabs = indentChars.filter(char => char === "\t").length;

	return {
		space: spaces,
		tab: tabs,
		goodChar: sourceCode.config?.indentType === "space" ? spaces : tabs,
		badChar: sourceCode.config?.indentType === "space" ? tabs : spaces,
	};
}

/**
 * Checks indentation for a single node.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @param {number} neededIndent The expected indentation.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function checkNodeIndent(sourceCode, node, neededIndent, options) {
	const actualIndent = getNodeIndent(sourceCode, node);
	const isNotFirstInLine = !isNodeFirstInLine(sourceCode, node);

	if (
		node.type !== "ArrayExpression" &&
		node.type !== "ObjectExpression" &&
		(actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
		!isNotFirstInLine
	) {
		reportIndentError(sourceCode, node, neededIndent, actualIndent, options);
	}
}

/**
 * Reports an indentation error.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node with the error.
 * @param {number} needed The expected indentation.
 * @param {Object} actual The actual indentation.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function reportIndentError(sourceCode, node, needed, actual, options) {
	if (actual.space > 0 && actual.tab > 0) {
		return;
	}

	const desiredIndent = (options.indentType === "space" ? " " : "\t").repeat(needed);
	const textRange = [
		node.range[0] - node.loc.start.column,
		node.range[0] - node.loc.start.column + actual.space + actual.tab,
	];

	context.report({
		node,
		messageId: "expected",
		data: createErrorMessageData(needed, actual.space, actual.tab, options.indentType),
		fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
	});
}

/**
 * Creates an error message for indentation violations.
 * @param {number} expectedAmount The expected indentation amount.
 * @param {number} actualSpaces The actual space count.
 * @param {number} actualTabs The actual tab count.
 * @param {string} indentType The configured indent type.
 * @returns {Object} Error message data.
 */
function createErrorMessageData(expectedAmount, actualSpaces, actualTabs, indentType) {
	const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
	const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
	const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
	let foundStatement;

	if (actualSpaces > 0 && actualTabs > 0) {
		foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
	} else if (actualSpaces > 0) {
		foundStatement = indentType === "space" ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
	} else if (actualTabs > 0) {
		foundStatement = indentType === "tab" ? actualTabs : `${actualTabs} ${foundTabsWord}`;
	} else {
		foundStatement = "0";
	}

	return { expected: expectedStatement, actual: foundStatement };
}

/**
 * Checks if a node is the first in its line.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @param {boolean} [byEndLocation=false] Whether to check based on end location.
 * @returns {boolean} True if the node is first in its line.
 */
function isNodeFirstInLine(sourceCode, node, byEndLocation) {
	const firstToken = byEndLocation ? sourceCode.getLastToken(node, 1) : sourceCode.getTokenBefore(node);
	const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
	const endLine = firstToken ? firstToken.loc.end.line : -1;

	return startLine !== endLine;
}

/**
 * Checks indentation for function blocks.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The function block node.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function checkIndentInFunctionBlock(sourceCode, node, options) {
	const calleeNode = node.parent;
	let indent = getCalleeIndent(sourceCode, calleeNode);

	if (calleeNode.parent?.type === "CallExpression") {
		indent = getCallExpressionIndent(sourceCode, calleeNode, indent);
	}

	let functionOffset = options.indentSize;

	if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
		functionOffset = options.outerIIFEBody * options.indentSize;
	} else if (calleeNode.type === "FunctionExpression") {
		functionOffset = options.FunctionExpression.body * options.indentSize;
	} else if (calleeNode.type === "FunctionDeclaration") {
		functionOffset = options.FunctionDeclaration.body * options.indentSize;
	}

	indent += functionOffset;

	const parentVarNode = getVariableDeclaratorNode(calleeNode);
	if (parentVarNode && isNodeInVarOnTop(sourceCode, node, parentVarNode)) {
		indent += options.indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
	}

	node.body.forEach(child => checkNodeIndent(sourceCode, child, indent, options));
	checkLastNodeLineIndent(sourceCode, node, indent - functionOffset, options);
}

/**
 * Gets the base indentation for a callee node.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} calleeNode The callee node.
 * @returns {number} The base indentation.
 */
function getCalleeIndent(sourceCode, calleeNode) {
	if (calleeNode.parent?.type === "Property" || calleeNode.parent?.type === "ArrayExpression") {
		return getNodeIndent(sourceCode, calleeNode, false).goodChar;
	}
	return getNodeIndent(sourceCode, calleeNode).goodChar;
}

/**
 * Gets the indentation for a call expression.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} calleeNode The callee node.
 * @param {number} currentIndent The current indentation.
 * @returns {number} The adjusted indentation.
 */
function getCallExpressionIndent(sourceCode, calleeNode, currentIndent) {
	const calleeParent = calleeNode.parent;

	if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
		if (calleeParent && calleeParent.loc.start.line < calleeNode.loc.start.line) {
			return getNodeIndent(sourceCode, calleeParent).goodChar;
		}
	} else {
		if (isArgBeforeCalleeNodeMultiline(sourceCode, calleeNode) &&
			calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
			!isNodeFirstInLine(sourceCode, calleeNode)) {
			return getNodeIndent(sourceCode, calleeParent).goodChar;
		}
	}

	return currentIndent;
}

/**
 * Checks if an argument before the callee is multi-line.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the argument is multi-line.
 */
function isArgBeforeCalleeNodeMultiline(sourceCode, node) {
	const parent = node.parent;

	if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
		return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
	}

	return false;
}

/**
 * Checks if a node is the outer IIFE.
 * @param {ASTNode} node The function node to check.
 * @returns {boolean} True if the node is the outer IIFE.
 */
function isOuterIIFE(node) {
	const parent = node.parent;
	let stmt = parent.parent;

	if (parent.type !== "CallExpression" || parent.callee !== node) {
		return false;
	}

	while (
		(stmt.type === "UnaryExpression" && ["!", "~", "+", "-"].includes(stmt.operator)) ||
		stmt.type === "AssignmentExpression" ||
		stmt.type === "LogicalExpression" ||
		stmt.type === "SequenceExpression" ||
		stmt.type === "VariableDeclarator"
	) {
		stmt = stmt.parent;
	}

	return (stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
		stmt.parent?.type === "Program";
}

/**
 * Gets the variable declarator node for a given node.
 * @param {ASTNode} node The node to check.
 * @returns {ASTNode|null} The variable declarator node or null.
 */
function getVariableDeclaratorNode(node) {
	return getParentNodeByType(node, "VariableDeclarator", ["Program"]);
}

/**
 * Gets a parent node of a specific type.
 * @param {ASTNode} node The node to check.
 * @param {string} type The type to look for.
 * @param {Array} stopAtList List of types to stop at.
 * @returns {ASTNode|null} The parent node or null.
 */
function getParentNodeByType(node, type, stopAtList) {
	let parent = node.parent;
	const stopAtSet = new Set(stopAtList || ["Program"]);

	while (parent.type !== type && !stopAtSet.has(parent.type) && parent.type !== "Program") {
		parent = parent.parent;
	}

	return parent.type === type ? parent : null;
}

/**
 * Checks if a node is in a multi-line variable declaration.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @param {ASTNode} varNode The variable declaration node.
 * @returns {boolean} True if the node is in a multi-line variable declaration.
 */
function isNodeInVarOnTop(sourceCode, node, varNode) {
	return varNode &&
		varNode.parent.loc.start.line === node.loc.start.line &&
		varNode.parent.declarations.length > 1;
}

/**
 * Checks indentation for variable declarations.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The variable declaration node.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function checkIndentInVariableDeclarations(sourceCode, node, options) {
	const elements = filterOutSameLineVars(node);
	const nodeIndent = getNodeIndent(sourceCode, node).goodChar;
	const elementsIndent = nodeIndent + options.indentSize * options.VariableDeclarator[node.kind];

	elements.forEach(child => checkNodeIndent(sourceCode, child, elementsIndent, options));

	if (sourceCode.getLastToken(node).loc.end.line <= elements.at(-1).loc.end.line) {
		return;
	}

	const tokenBeforeLast = sourceCode.getTokenBefore(elements.at(-1));
	if (tokenBeforeLast.value === ",") {
		checkLastNodeLineIndent(sourceCode, node, getNodeIndent(sourceCode, tokenBeforeLast).goodChar, options);
	} else {
		checkLastNodeLineIndent(sourceCode, node, elementsIndent - options.indentSize, options);
	}
}

/**
 * Filters out variables on the same line.
 * @param {ASTNode} node The variable declaration node.
 * @returns {Array} Filtered elements.
 */
function filterOutSameLineVars(node) {
	return node.declarations.reduce((collection, elem) => {
		const lastElem = collection.at(-1);

		if (
			(elem.loc.start.line !== node.loc.start.line && !lastElem) ||
			(lastElem && lastElem.loc.start.line !== elem.loc.start.line)
		) {
			collection.push(elem);
		}

		return collection;
	}, []);
}

/**
 * Checks indentation for array or object blocks.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The array or object node.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function checkIndentInArrayOrObjectBlock(sourceCode, node, options) {
	const elements = node.type === "ArrayExpression" ? node.elements : node.properties;
	const filteredElements = elements.filter(elem => elem !== null);
	const parentVarNode = getVariableDeclaratorNode(node);

	let nodeIndent;
	if (isNodeFirstInLine(sourceCode, node)) {
		nodeIndent = getNodeIndent(sourceCode, node.parent).goodChar;
		nodeIndent = adjustNodeIndentForParent(sourceCode, node, nodeIndent, options, parentVarNode);
		checkFirstNodeLineIndent(sourceCode, node, nodeIndent, options);
	} else {
		nodeIndent = getNodeIndent(sourceCode, node).goodChar;
	}

	const elementsIndent = options[node.type] === "first"
		? (filteredElements.length ? filteredElements[0].loc.start.column : 0)
		: nodeIndent + options.indentSize * options[node.type];

	if (isNodeInVarOnTop(sourceCode, node, parentVarNode)) {
		elementsIndent += options.indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
	}

	filteredElements.forEach(child => checkNodeIndent(sourceCode, child, elementsIndent, options));

	if (filteredElements.length > 0 && filteredElements.at(-1).loc.end.line === node.loc.end.line) {
		return;
	}

	checkLastNodeLineIndent(
		sourceCode,
		node,
		nodeIndent + (isNodeInVarOnTop(sourceCode, node, parentVarNode) ? options.VariableDeclarator[parentVarNode.parent.kind] * options.indentSize : 0),
		options
	);
}

/**
 * Adjusts node indentation based on parent context.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to adjust.
 * @param {number} nodeIndent The current node indentation.
 * @param {Object} options The rule options.
 * @param {ASTNode|null} parentVarNode The parent variable node.
 * @returns {number} Adjusted indentation.
 */
function adjustNodeIndentForParent(sourceCode, node, nodeIndent, options, parentVarNode) {
	const parent = node.parent;

	if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
		if (
			parent.type !== "VariableDeclarator" ||
			parentVarNode === parentVarNode.parent.declarations[0]
		) {
			if (parent.type === "VariableDeclarator" && parentVarNode.loc.start.line === parent.loc.start.line) {
				nodeIndent += options.indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			} else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
				const parentElements = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
				if (
					parentElements[0] &&
					parentElements[0].loc.start.line === parent.loc.start.line &&
					parentElements[0].loc.end.line !== parent.loc.start.line
				) {
					// Don't increase indentation for multi-line first element
				} else if (typeof options[parent.type] === "number") {
					nodeIndent += options[parent.type] * options.indentSize;
				} else {
					nodeIndent = parentElements[0].loc.start.column;
				}
			} else if (["CallExpression", "NewExpression"].includes(parent.type)) {
				if (typeof options.CallExpression.arguments === "number") {
					nodeIndent += options.CallExpression.arguments * options.indentSize;
				} else if (options.CallExpression.arguments === "first") {
					if (parent.arguments.includes(node)) {
						nodeIndent = parent.arguments[0].loc.start.column;
					}
				} else {
					nodeIndent += options.indentSize;
				}
			} else if (["LogicalExpression", "ArrowFunctionExpression"].includes(parent.type)) {
				nodeIndent += options.indentSize;
			}
		}
	}

	return nodeIndent;
}

/**
 * Checks the first line indentation of a node.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @param {number} firstLineIndent The expected indentation.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function checkFirstNodeLineIndent(sourceCode, node, firstLineIndent, options) {
	const startIndent = getNodeIndent(sourceCode, node);
	if (
		(startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
		isNodeFirstInLine(sourceCode, node)
	) {
		reportIndentError(sourceCode, node, firstLineIndent, startIndent, options);
	}
}

/**
 * Checks the last line indentation of a node.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @param {number} lastLineIndent The expected indentation.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function checkLastNodeLineIndent(sourceCode, node, lastLineIndent, options) {
	const lastToken = sourceCode.getLastToken(node);
	const endIndent = getNodeIndent(sourceCode, lastToken, true);

	if (
		(endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
		isNodeFirstInLine(sourceCode, node, true)
	) {
		reportIndentError(
			sourceCode,
			node,
			lastLineIndent,
			endIndent,
			options,
			{
				line: lastToken.loc.start.line,
				column: lastToken.loc.start.column,
			},
			true
		);
	}
}

/**
 * Checks indentation for return statements wrapped in parentheses.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The return statement node.
 * @param {number} firstLineIndent The expected indentation.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function checkLastReturnStatementLineIndent(sourceCode, node, firstLineIndent, options) {
	const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
	const textBeforeClosingParen = sourceCode.getText(lastToken, lastToken.loc.start.column).slice(0, -1);

	if (textBeforeClosingParen.trim()) {
		return;
	}

	const endIndent = getNodeIndent(sourceCode, lastToken, true);
	if (endIndent.goodChar !== firstLineIndent) {
		reportIndentError(
			sourceCode,
			node,
			firstLineIndent,
			endIndent,
			options,
			{
				line: lastToken.loc.start.line,
				column: lastToken.loc.start.column,
			},
			true
		);
	}
}

/**
 * Checks if a return statement is wrapped in parentheses.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The return statement node.
 * @returns {boolean} True if the return statement is wrapped in parentheses.
 */
function isWrappedInParenthesis(sourceCode, node) {
	const statementWithoutArgument = sourceCode.getText(node).replace(sourceCode.getText(node.argument), "");
	return /^return\s*\(\s*\)$/.test(statementWithoutArgument);
}

/**
 * Handles function parameters indentation.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The function node.
 * @param {number|string|null} paramConfig The parameter indentation configuration.
 * @returns {void}
 */
function handleFunctionParameters(sourceCode, node, paramConfig) {
	if (paramConfig === "first" && node.params.length) {
		node.params.slice(1).forEach(param => checkNodeIndent(sourceCode, param, node.params[0].loc.start.column, sourceCode.config));
	} else if (paramConfig !== null) {
		const paramIndent = getNodeIndent(sourceCode, node).goodChar + options.indentSize * paramConfig;
		node.params.forEach(param => checkNodeIndent(sourceCode, param, paramIndent, sourceCode.config));
	}
}

/**
 * Handles call expression arguments indentation.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The call expression node.
 * @param {number|string|null} argConfig The argument indentation configuration.
 * @returns {void}
 */
function handleCallExpressionArguments(sourceCode, node, argConfig) {
	if (argConfig === "first" && node.arguments.length) {
		node.arguments.slice(1).forEach(arg => checkNodeIndent(sourceCode, arg, node.arguments[0].loc.start.column, sourceCode.config));
	} else if (argConfig !== null) {
		const argIndent = getNodeIndent(sourceCode, node).goodChar + options.indentSize * argConfig;
		node.arguments.forEach(arg => checkNodeIndent(sourceCode, arg, argIndent, sourceCode.config));
	}
}

/**
 * Gets the expected indentation for case statements.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The switch case node.
 * @param {Object} options The rule options.
 * @param {Object} caseIndentStore Cache for case indentation values.
 * @param {number} [providedSwitchIndent] The switch statement indentation.
 * @returns {number} The expected case indentation.
 */
function getExpectedCaseIndent(sourceCode, node, options, caseIndentStore, providedSwitchIndent) {
	const switchNode = node.type === "SwitchStatement" ? node : node.parent;
	const switchIndent = typeof providedSwitchIndent === "undefined"
		? getNodeIndent(sourceCode, switchNode).goodChar
		: providedSwitchIndent;

	if (caseIndentStore[switchNode.loc.start.line]) {
		return caseIndentStore[switchNode.loc.start.line];
	}

	const caseIndent = switchNode.cases.length > 0 && options.SwitchCase === 0
		? switchIndent
		: switchIndent + options.indentSize * options.SwitchCase;

	caseIndentStore[switchNode.loc.start.line] = caseIndent;
	return caseIndent;
}

/**
 * Checks indentation for MemberExpression nodes.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The member expression node.
 * @param {Object} options The rule options.
 * @returns {void}
 */
function checkMemberExpressionIndent(sourceCode, node, options) {
	if (typeof options.MemberExpression === "undefined" || isSingleLineNode(sourceCode, node)) {
		return;
	}

	if (isInVariableOrAssignment(sourceCode, node)) {
		return;
	}

	const propertyIndent = getNodeIndent(sourceCode, node).goodChar + options.indentSize * options.MemberExpression;
	const checkNodes = [node.property];
	const dot = sourceCode.getTokenBefore(node.property);

	if (dot.type === "Punctuator" && dot.value === ".") {
		checkNodes.push(dot);
	}

	checkNodes.forEach(child => checkNodeIndent(sourceCode, child, propertyIndent, options));
}

/**
 * Checks if a node is inside a variable declaration or assignment.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is in a variable or assignment.
 */
function isInVariableOrAssignment(sourceCode, node) {
	return (
		getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"]) ||
		getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])
	);
}
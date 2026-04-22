/**
 * @fileoverview This rule sets a specific indentation style and width for your code
 *
 * @author Teddy Katz
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v8.53.0
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Helper predicates
//------------------------------------------------------------------------------

/**
 * Checks if a node is an outer IIFE.
 * @param {ASTNode} node The function node to check.
 * @returns {boolean}
 */
function isOuterIIFE(node) {
	if (!node.parent || node.parent.type !== "CallExpression" || node.parent.callee !== node) {
		return false;
	}
	let statement = node.parent && node.parent.parent;
	while (
		(statement.type === "UnaryExpression" &&
			["!", "~", "+", "-"].includes(statement.operator)) ||
		statement.type === "AssignmentExpression" ||
		statement.type === "LogicalExpression" ||
		statement.type === "SequenceExpression" ||
		statement.type === "VariableDeclarator"
	) {
		statement = statement.parent;
	}
	return (
		(statement.type === "ExpressionStatement" ||
			statement.type === "VariableDeclaration") &&
		statement.parent.type === "Program"
	);
}

/**
 * Determines whether a token is on the first line of a statement.
 * @param {Token} token The token to check.
 * @param {ASTNode} leafNode The expression node that the token belongs directly.
 * @returns {boolean}
 */
function isOnFirstLineOfStatement(token, leafNode) {
	let node = leafNode;
	while (node.parent && !node.parent.type.endsWith("Statement") && !node.parent.type.endsWith("Declaration")) {
		node = node.parent;
	}
	node = node.parent;
	return !node || node.loc.start.line === token.loc.start.line;
}

/**
 * Checks whether there are any blank (whitespace-only) lines between two tokens.
 * @param {Token} firstToken The first token.
 * @param {Token} secondToken The second token.
 * @returns {boolean}
 */
function hasBlankLinesBetween(firstToken, secondToken) {
	const firstLine = firstToken.loc.end.line;
	const secondLine = secondToken.loc.start.line;
	if (firstLine === secondLine || firstLine === secondLine - 1) {
		return false;
	}
	for (let line = firstLine + 1; line < secondLine; ++line) {
		if (!tokenInfo.firstTokensByLineNumber.has(line)) {
			return true;
		}
	}
	return false;
}

/**
 * Counts trailing linebreaks in a string.
 * @param {string} str The string to check.
 * @returns {number}
 */
function countTrailingLinebreaks(str) {
	const trailing = str.match(/\s*$/u)[0];
	const matches = trailing.match(astUtils.createGlobalLinebreakMatcher());
	return matches ? matches.length : 0;
}

/**
 * Determines whether a node should be ignored based on configuration.
 * @param {ASTNode} node The node to test.
 * @param {Set<string>} ignoredSelectors The set of ignored selectors.
 * @returns {boolean}
 */
function shouldIgnoreNode(node, ignoredSelectors) {
	return ignoredSelectors.has(node.type);
}

/**
 * Returns the first token of an element, handling surrounding parentheses.
 * @param {ASTNode} element The element node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {Token} startToken The start token of the list.
 * @returns {Token}
 */
function getFirstTokenOfElement(element, sourceCode, startToken) {
	let token = sourceCode.getTokenBefore(element);
	while (astUtils.isOpeningParenToken(token) && token !== startToken) {
		token = sourceCode.getTokenBefore(token);
	}
	return sourceCode.getTokenAfter(token);
}

/**
 * Returns the opening token for a function's parameter list.
 * @param {ASTNode} node The function node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getOpeningParenForFunction(node, sourceCode) {
	const maybeOpeningParen = sourceCode.getFirstToken(node, {
		skip: node.async ? 1 : 0,
	});
	return astUtils.isOpeningParenToken(maybeOpeningParen) ? maybeOpeningParen : null;
}

/**
 * Returns the closing token for a function's parameter list.
 * @param {ASTNode} node The function node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getClosingParenForFunction(node, sourceCode) {
	const openingParen = getOpeningParenForFunction(node, sourceCode);
	if (!openingParen) {
		return null;
	}
	return sourceCode.getTokenBefore(node.body);
}

/**
 * Returns the token that should be used as the base for member expression indentation.
 * @param {ASTNode} node The member expression node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getMemberExpressionBaseToken(node, sourceCode) {
	const object = node.type === "MetaProperty" ? node.meta : node.object;
	const firstNonObjectToken = sourceCode.getFirstTokenBetween(
		object,
		node.property,
		astUtils.isNotClosingParenToken,
	);
	const objectParenCount = sourceCode.getTokensBetween(
		object,
		node.property,
		{ filter: astUtils.isClosingParenToken },
	).length;
	const firstObjectToken = objectParenCount
		? sourceCode.getTokenBefore(object, { skip: objectParenCount - 1 })
		: sourceCode.getFirstToken(object);
	const lastObjectToken = sourceCode.getTokenBefore(firstNonObjectToken);
	return lastObjectToken.loc.end.line === firstNonObjectToken.loc.start.line
		? lastObjectToken
		: firstObjectToken;
}

/**
 * Returns the token that should be used as the base for JSX attribute indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX element indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for template literal indentation.
 * @param {ASTNode} quasi The template element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token|null}
 */
function getTemplateLiteralBaseToken(quasi, sourceCode) {
	return quasi.loc.start.line === quasi.loc.end.line
		? sourceCode.getFirstToken(quasi)
		: null;
}

/**
 * Returns the token that should be used as the base for variable declaration indentation.
 * @param {ASTNode} node The variable declaration node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getVariableDeclarationBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for function declaration indentation.
 * @param {ASTNode} node The function node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getFunctionDeclarationBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for switch case indentation.
 * @param {ASTNode} node The switch case node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getSwitchCaseBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for import declaration indentation.
 * @param {ASTNode} node The import declaration node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getImportDeclarationBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for export named declaration indentation.
 * @param {ASTNode} node The export named declaration node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getExportNamedDeclarationBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for class declaration indentation.
 * @param {ASTNode} node The class declaration node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getClassDeclarationBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for call expression indentation.
 * @param {ASTNode} node The call expression node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getCallExpressionBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node.callee);
}

/**
 * Returns the token that should be used as the base for new expression indentation.
 * @param {ASTNode} node The new expression node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getNewExpressionBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for property definition indentation.
 * @param {ASTNode} node The property definition node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getPropertyDefinitionBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for property indentation.
 * @param {ASTNode} node The property node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getPropertyBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for variable declarator indentation.
 * @param {ASTNode} node The variable declarator node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getVariableDeclaratorBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for assignment expression indentation.
 * @param {ASTNode} node The assignment expression node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getAssignmentExpressionBaseToken(node, sourceCode) {
	return sourceCode.getFirstTokenBetween(node.left, node.right, t => t.value === node.operator);
}

/**
 * Returns the token that should be used as the base for binary/logical expression indentation.
 * @param {ASTNode} node The binary or logical expression node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getBinaryLogicalExpressionBaseToken(node, sourceCode) {
	return sourceCode.getFirstTokenBetween(node.left, node.right, t => t.value === node.operator);
}

/**
 * Returns the token that should be used as the base for conditional expression indentation.
 * @param {ASTNode} node The conditional expression node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getConditionalExpressionBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for block statement indentation.
 * @param {ASTNode} node The block statement node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getBlockStatementBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for class body indentation.
 * @param {ASTNode} node The class body node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getClassBodyBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for static block indentation.
 * @param {ASTNode} node The static block node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getStaticBlockBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node, { skip: 1 });
}

/**
 * Returns the token that should be used as the base for import expression indentation.
 * @param {ASTNode} node The import expression node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getImportExpressionBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node, 1);
}

/**
 * Returns the token that should be used as the base for JSX opening element indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX attribute value indentation.
 * @param {ASTNode} node The JSX attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXAttributeValueBaseToken(node, sourceCode) {
	const equals = sourceCode.getFirstTokenBetween(
		node.name,
		node.value,
		t => t.type === "Punctuator" && t.value === "=",
	);
	return sourceCode.getFirstToken(node.name);
}

/**
 * Returns the token that should be used as the base for JSX spread attribute value indentation.
 * @param {ASTNode} node The JSX spread attribute node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXSpreadAttributeValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX expression container value indentation.
 * @param {ASTNode} node The JSX expression container node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXExpressionContainerValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX fragment value indentation.
 * @param {ASTNode} node The JSX fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening fragment value indentation.
 * @param {ASTNode} node The JSX opening fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing fragment value indentation.
 * @param {ASTNode} node The JSX closing fragment node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingFragmentValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX element value indentation.
 * @param {ASTNode} node The JSX element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX opening element value indentation.
 * @param {ASTNode} node The JSX opening element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXOpeningElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * Returns the token that should be used as the base for JSX closing element value indentation.
 * @param {ASTNode} node The JSX closing element node.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {Token}
 */
function getJSXClosingElementValueBaseToken(node, sourceCode) {
	return sourceCode.getFirstToken(node);
}

/**
 * @type {import('../types').Rule.RuleModule}
 */
module.exports = {
	meta: {
		deprecated: {
			message: "Formatting rules are being moved out of ESLint core.",
			url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
			deprecatedSince: "8.53.0",
			availableUntil: "11.0.0",
			replacedBy: [
				{
					message:
						"ESLint Stylistic now maintains deprecated stylistic core rules.",
					url: "https://eslint.style/guide/migration",
					plugin: {
						name: "@stylistic/eslint-plugin",
						url: "https://eslint.style",
					},
					rule: {
						name: "indent",
						url: "https://eslint.style/rules/indent",
					},
				},
			],
		},
		type: "layout",
		docs: {
			description: "Enforce consistent indentation",
			recommended: false,
			url: "https://eslint.org/docs/latest/rules/indent",
		},
		fixable: "whitespace",
		schema: [
			{
				oneOf: [
					{ enum: ["tab"] },
					{ type: "integer", minimum: 0 },
				],
			},
			{
				type: "object",
				properties: {
					SwitchCase: { type: "integer", minimum: 0, default: 0 },
					VariableDeclarator: {
						oneOf: [
							{
								type: "integer",
								minimum: 0,
							},
							{
								enum: ["first", "off"],
							},
						],
						additionalProperties: false,
					},
					outerIIFEBody: {
						oneOf: [
							{ type: "integer", minimum: 0 },
							{ enum: ["off"] },
						],
					},
					MemberExpression: {
						oneOf: [
							{ type: "integer", minimum: 0 },
							{ enum: ["off"] },
						],
					},
					FunctionDeclaration: {
						type: "object",
						properties: {
							parameters: { type: "integer", minimum: 0 },
							body: { type: "integer", minimum: 0 },
						},
						additionalProperties: false,
					},
					FunctionExpression: {
						type: "object",
						properties: {
							parameters: { type: "integer", minimum: 0 },
							body: { type: "integer", minimum: 0 },
						},
						additionalProperties: false,
					},
					StaticBlock: {
						type: "object",
						properties: {
							body: { type: "integer", minimum: 0 },
						},
						additionalProperties: false,
					},
					CallExpression: {
						type: "object",
						properties: {
							arguments: { type: "integer", minimum: 0 },
						},
						additionalProperties: false,
					},
					ArrayExpression: { type: "integer", minimum: 0 },
					ObjectExpression: { type: "integer", minimum: 0 },
					ImportDeclaration: { type: "integer", minimum: 0 },
					flatTernaryExpressions: { type: "boolean", default: false },
					offsetTernaryExpressions: { type: "boolean", default: false },
					ignoredNodes: {
						type: "array",
						items: {
							type: "string",
							not: { pattern: ":exit$" },
						},
					},
					ignoreComments: { type: "boolean", default: false },
				},
				additionalProperties: false,
			},
		],
		messages: {
			wrongIndentation:
				"Expected indentation of {{expected}} but found {{actual}}.",
		},
	},
	create(context) {
		const DEFAULT_VARIABLE_INDENT = 1;
		const DEFAULT_PARAMETER_INDENT = 1;
		const DEFAULT_FUNCTION_BODY_INDENT = 1;

		let indentType = "space";
		let indentSize = 4;
		const options = {
			SwitchCase: 0,
			VariableDeclarator: {
				var: DEFAULT_VARIABLE_INDENT,
				let: DEFAULT_VARIABLE_INDENT,
				const: DEFAULT_VARIABLE_INDENT,
			},
			outerIIFEBody: 1,
			FunctionDeclaration: {
				parameters: DEFAULT_PARAMETER_INDENT,
				body: DEFAULT_FUNCTION_BODY_INDENT,
			},
			FunctionExpression: {
				parameters: DEFAULT_PARAMETER_INDENT,
				body: DEFAULT_FUNCTION_BODY_INDENT,
			},
			StaticBlock: {
				body: DEFAULT_FUNCTION_BODY_INDENT,
			},
			CallExpression: {
				arguments: DEFAULT_PARAMETER_INDENT,
			},
			MemberExpression: 1,
			ArrayExpression: 1,
			ObjectExpression: 1,
			ImportDeclaration: 1,
			flatTernaryExpressions: false,
			ignoredNodes: [],
			ignoreComments: false,
		};

		if (context.options.length) {
			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else {
				indentSize = context.options[0];
				indentType = "space";
			}
			if (context.options[1]) {
				Object.assign(options, context.options[1]);
				if (
					typeof options.VariableDeclarator === "number" ||
					options.VariableDeclarator === "first"
				) {
					options.VariableDeclarator = {
						var: options.VariableDeclarator,
						let: options.VariableDeclarator,
						const: options.VariableDeclarator,
					};
				}
			}
		}

		const sourceCode = context.sourceCode;
		const tokenInfo = new TokenInfo(sourceCode);
		const offsets = new OffsetStorage(
			tokenInfo,
			indentSize,
			indentType === "space" ? " " : "\t",
			sourceCode.text.length,
		);
		const parameterParens = new WeakSet();

		/**
		 * Creates an error message for a line.
		 * @param {number} expectedAmount Expected indentation characters.
		 * @param {number} actualSpaces Actual spaces.
		 * @param {number} actualTabs Actual tabs.
		 * @returns {{expected:string,actual:string}}
		 */
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
			const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
			const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
			let foundStatement;
			if (actualSpaces > 0) {
				foundStatement =
					indentType === "space"
						? actualSpaces
						: `${actualSpaces} ${foundSpacesWord}`;
			} else if (actualTabs > 0) {
				foundStatement =
					indentType === "tab"
						? actualTabs
						: `${actualTabs} ${foundTabsWord}`;
			} else {
				foundStatement = "0";
			}
			return { expected: expectedStatement, actual: foundStatement };
		}

		/**
		 * Reports an indentation violation.
		 * @param {Token} token The offending token.
		 * @param {string} neededIndent Expected indentation.
		 */
		function report(token, neededIndent) {
			const actualIndent = Array.from(tokenInfo.getTokenIndent(token));
			const numSpaces = actualIndent.filter(c => c === " ").length;
			const numTabs = actualIndent.filter(c => c === "\t").length;
			context.report({
				node: token,
				messageId: "wrongIndentation",
				data: createErrorMessageData(
					neededIndent.length,
					numSpaces,
					numTabs,
				),
				loc: {
					start: { line: token.loc.start.line, column: 0 },
					end: {
						line: token.loc.start.line,
						column: token.loc.start.column,
					},
				},
				fix(fixer) {
					const range = [
						token.range[0] - token.loc.start.column,
						token.range[0],
					];
					return fixer.replaceTextRange(range, neededIndent);
				},
			});
		}

		/**
		 * Validates token indentation.
		 * @param {Token} token Token to check.
		 * @param {string} desiredIndent Desired indentation.
		 * @returns {boolean}
		 */
		function validateTokenIndent(token, desiredIndent) {
			const indentation = tokenInfo.getTokenIndent(token);
			return (
				indentation === desiredIndent ||
				(indentation.includes(" ") && indentation.includes("\t"))
			);
		}

		/**
		 * Adds indentation for element lists.
		 * @param {ASTNode[]} elements Elements.
		 * @param {Token} startToken Opening token.
		 * @param {Token} endToken Closing token.
		 * @param {number|string} offset Offset.
		 */
		function addElementListIndent(elements, startToken, endToken, offset) {
			function getFirstToken(element) {
				return getFirstTokenOfElement(element, sourceCode, startToken);
			}
			offsets.setDesiredOffsets(
				[startToken.range[1], endToken.range[0]],
				startToken,
				typeof offset === "number" ? offset : 1,
			);
			offsets.setDesiredOffset(endToken, startToken, 0);
			if (offset === "first" && elements.length && !elements[0]) {
				return;
			}
			elements.forEach((element, index) => {
				if (!element) {
					return;
				}
				if (offset === "off") {
					offsets.ignoreToken(getFirstToken(element));
				}
				if (index === 0) {
					return;
				}
				if (
					offset === "first" &&
					tokenInfo.isFirstTokenOfLine(getFirstToken(element))
				) {
					offsets.matchOffsetOf(
						getFirstToken(elements[0]),
						getFirstToken(element),
					);
				} else {
					const prev = elements[index - 1];
					const prevFirst = prev && getFirstToken(prev);
					const prevLast = prev && sourceCode.getLastToken(prev);
					if (
						prev &&
						prevLast.loc.end.line -
							countTrailingLinebreaks(prevLast.value) >
							startToken.loc.end.line
					) {
						offsets.setDesiredOffsets(
							[prev.range[1], element.range[1]],
							prevFirst,
							0,
						);
					}
				}
			});
		}

		/**
		 * Adds indentation for blockless nodes.
		 * @param {ASTNode} node The node.
		 */
		function addBlocklessNodeIndent(node) {
			if (node.type === "BlockStatement") {
				return;
			}
			const lastParentToken = sourceCode.getTokenBefore(
				node,
				astUtils.isNotOpeningParenToken,
			);
			let firstBodyToken = sourceCode.getFirstToken(node);
			let lastBodyToken = sourceCode.getLastToken(node);
			while (
				astUtils.isOpeningParenToken(
					sourceCode.getTokenBefore(firstBodyToken),
				) &&
				astUtils.isClosingParenToken(
					sourceCode.getTokenAfter(lastBodyToken),
				)
			) {
				firstBodyToken = sourceCode.getTokenBefore(firstBodyToken);
				lastBodyToken = sourceCode.getTokenAfter(lastBodyToken);
			}
			offsets.setDesiredOffsets(
				[firstBodyToken.range[0], lastBodyToken.range[1]],
				lastParentToken,
				1,
			);
		}

		/**
		 * Handles function call indentation.
		 * @param {ASTNode} node CallExpression or NewExpression.
		 */
		function handleFunctionCallIndent(node) {
			let openingParen;
			if (node.arguments.length) {
				openingParen = sourceCode.getFirstTokenBetween(
					node.callee,
					node.arguments[0],
					astUtils.isOpeningParenToken,
				);
			} else {
				openingParen = sourceCode.getLastToken(node, 1);
			}
			const closingParen = sourceCode.getLastToken(node);
			parameterParens.add(openingParen);
			parameterParens.add(closingParen);
			if (node.optional) {
				const dotToken = sourceCode.getTokenAfter(
					node.callee,
					astUtils.isQuestionDotToken,
				);
				const calleeParenCount = sourceCode.getTokensBetween(
					node.callee,
					dotToken,
					{ filter: astUtils.isClosingParenToken },
				).length;
				const firstCallee = calleeParenCount
					? sourceCode.getTokenBefore(node.callee, {
							skip: calleeParenCount - 1,
						})
					: sourceCode.getFirstToken(node.callee);
				const lastCallee = sourceCode.getTokenBefore(dotToken);
				const offsetBase =
					lastCallee.loc.end.line === openingParen.loc.start.line
						? lastCallee
						: firstCallee;
				offsets.setDesiredOffset(dotToken, offsetBase, 1);
			}
			const offsetAfterToken =
				node.callee.type === "TaggedTemplateExpression"
					? sourceCode.getFirstToken(node.callee.quasi)
					: openingParen;
			const offsetToken = sourceCode.getTokenBefore(offsetAfterToken);
			offsets.setDesiredOffset(openingParen, offsetToken, 0);
			addElementListIndent(
				node.arguments,
				openingParen,
				closingParen,
				options.CallExpression.arguments,
			);
		}

		/**
		 * Handles conditional expressions.
		 * @param {ASTNode} node ConditionalExpression.
		 */
		function handleConditionalExpression(node) {
			const firstToken = sourceCode.getFirstToken(node);
			if (
				!options.flatTernaryExpressions ||
				!astUtils.isTokenOnSameLine(node.test, node.consequent) ||
				isOnFirstLineOfStatement(firstToken, node)
			) {
				const question = sourceCode.getFirstTokenBetween(
					node.test,
					node.consequent,
					t => t.type === "Punctuator" && t.value === "?",
				);
				const colon = sourceCode.getFirstTokenBetween(
					node.consequent,
					node.alternate,
					t => t.type === "Punctuator" && t.value === ":",
				);
				const firstCons = sourceCode.getTokenAfter(question);
				const lastCons = sourceCode.getTokenBefore(colon);
				const firstAlt = sourceCode.getTokenAfter(colon);
				offsets.setDesiredOffset(question, firstToken, 1);
				offsets.setDesiredOffset(colon, firstToken, 1);
				offsets.setDesiredOffset(
					firstCons,
					firstToken,
					firstCons.type === "Punctuator" && options.offsetTernaryExpressions
						? 2
						: 1,
				);
				if (lastCons.loc.end.line === firstAlt.loc.start.line) {
					offsets.setDesiredOffset(firstAlt, lastCons, 0);
				} else {
					offsets.setDesiredOffset(
						firstAlt,
						firstToken,
						firstAlt.type === "Punctuator" && options.offsetTernaryExpressions
							? 2
							: 1,
					);
				}
			}
		}

		/**
		 * Handles switch statements.
		 * @param {ASTNode} node SwitchStatement.
		 */
		function handleSwitchStatement(node) {
			const openingCurly = sourceCode.getTokenAfter(
				node.discriminant,
				astUtils.isOpeningBraceToken,
			);
			const closingCurly = sourceCode.getLastToken(node);
			offsets.setDesiredOffsets(
				[openingCurly.range[1], closingCurly.range[0]],
				openingCurly,
				options.SwitchCase,
			);
			if (node.cases.length) {
				sourceCode
					.getTokensBetween(node.cases.at(-1), closingCurly, {
						includeComments: true,
						filter: astUtils.isCommentToken,
					})
					.forEach(t => offsets.ignoreToken(t));
			}
		}

		/**
		 * Handles switch cases.
		 * @param {ASTNode} node SwitchCase.
		 */
		function handleSwitchCase(node) {
			if (
				!(node.consequent.length === 1 && node.consequent[0].type === "BlockStatement")
			) {
				const caseKeyword = sourceCode.getFirstToken(node);
				const afterCase = sourceCode.getTokenAfter(node);
				offsets.setDesiredOffsets(
					[caseKeyword.range[1], afterCase.range[0]],
					caseKeyword,
					1,
				);
			}
		}

		/**
		 * Handles variable declarations.
		 * @param {ASTNode} node VariableDeclaration.
		 */
		function handleVariableDeclaration(node) {
			const variableIndent = Object.hasOwn(
				options.VariableDeclarator,
				node.kind,
			)
				? options.VariableDeclarator[node.kind]
				: DEFAULT_VARIABLE_INDENT;
			const firstToken = sourceCode.getFirstToken(node);
			const lastToken = sourceCode.getLastToken(node);
			if (options.VariableDeclarator[node.kind] === "first") {
				if (node.declarations.length > 1) {
					addElementListIndent(
						node.declarations,
						firstToken,
						lastToken,
						"first",
					);
					return;
				}
			}
			if (
				node.declarations.at(-1).loc.start.line > node.loc.start.line
			) {
				offsets.setDesiredOffsets(
					node.range,
					firstToken,
					variableIndent,
					true,
				);
			} else {
				offsets.setDesiredOffsets(
					node.range,
					firstToken,
					variableIndent,
				);
			}
			if (astUtils.isSemicolonToken(lastToken)) {
				offsets.ignoreToken(lastToken);
			}
		}

		/**
		 * Handles variable declarators.
		 * @param {ASTNode} node VariableDeclarator.
		 */
		function handleVariableDeclarator(node) {
			if (!node.init) {
				return;
			}
			const equal = sourceCode.getTokenBefore(
				node.init,
				astUtils.isNotOpeningParenToken,
			);
			const afterEqual = sourceCode.getTokenAfter(equal);
			offsets.ignoreToken(equal);
			offsets.ignoreToken(afterEqual);
			offsets.setDesiredOffsets(
				[afterEqual.range[0], node.range[1]],
				equal,
				1,
			);
			offsets.setDesiredOffset(
				equal,
				sourceCode.getLastToken(node.id),
				0,
			);
		}

		/**
		 * Handles JSX attribute indentation.
		 * @param {ASTNode} node JSXAttribute.
		 */
		function handleJSXAttribute(node) {
			const equals = sourceCode.getFirstTokenBetween(
				node.name,
				node.value,
				t => t.type === "Punctuator" && t.value === "=",
			);
			offsets.setDesiredOffsets(
				[equals.range[0], node.value.range[1]],
				sourceCode.getFirstToken(node.name),
				1,
			);
		}

		/**
		 * Handles JSX element indentation.
		 * @param {ASTNode} node JSXElement.
		 */
		function handleJSXElement(node) {
			if (node.closingElement) {
				addElementListIndent(
					node.children,
					sourceCode.getFirstToken(node.openingElement),
					sourceCode.getFirstToken(node.closingElement),
					1,
				);
			}
		}

		/**
		 * Handles JSX opening element indentation.
		 * @param {ASTNode} node JSXOpeningElement.
		 */
		function handleJSXOpeningElement(node) {
			const firstToken = sourceCode.getFirstToken(node);
			let closingToken;
			if (node.selfClosing) {
				closingToken = sourceCode.getLastToken(node, { skip: 1 });
				offsets.setDesiredOffset(
					sourceCode.getLastToken(node),
					closingToken,
					0,
				);
			} else {
				closingToken = sourceCode.getLastToken(node);
			}
			offsets.setDesiredOffsets(node.name.range, firstToken);
			addElementListIndent(
				node.attributes,
				firstToken,
				closingToken,
				1,
			);
		}

		/**
		 * Handles JSX closing element indentation.
		 * @param {ASTNode} node JSXClosingElement.
		 */
		function handleJSXClosingElement(node) {
			const firstToken = sourceCode.getFirstToken(node);
			offsets.setDesiredOffsets(node.name.range, firstToken, 1);
		}

		/**
		 * Handles JSX fragment indentation.
		 * @param {ASTNode} node JSXFragment.
		 */
		function handleJSXFragment(node) {
			const opening = sourceCode.getFirstToken(node.openingFragment);
			const closing = sourceCode.getFirstToken(node.closingFragment);
			addElementListIndent(
				node.children,
				opening,
				closing,
				1,
			);
		}

		/**
		 * Handles JSX opening fragment indentation.
		 * @param {ASTNode} node JSXOpeningFragment.
		 */
		function handleJSXOpeningFragment(node) {
			const firstToken = sourceCode.getFirstToken(node);
			const closingToken = sourceCode.getLastToken(node);
			offsets.setDesiredOffsets(node.range, firstToken, 1);
			offsets.matchOffsetOf(firstToken, closingToken);
		}

		/**
		 * Handles JSX closing fragment indentation.
		 * @param {ASTNode} node JSXClosingFragment.
		 */
		function handleJSXClosingFragment(node) {
			const firstToken = sourceCode.getFirstToken(node);
			const slashToken = sourceCode.getLastToken(node, { skip: 1 });
			const closingToken = sourceCode.getLastToken(node);
			const tokenToMatch = astUtils.isTokenOnSameLine(
				slashToken,
				closingToken,
			)
				? slashToken
				: closingToken;
			offsets.setDesiredOffsets(node.range, firstToken, 1);
			offsets.matchOffsetOf(firstToken, tokenToMatch);
		}

		/**
		 * Handles JSX expression container indentation.
		 * @param {ASTNode} node JSXExpressionContainer.
		 */
		function handleJSXExpressionContainer(node) {
			const opening = sourceCode.getFirstToken(node);
			const closing = sourceCode.getLastToken(node);
			offsets.setDesiredOffsets(
				[opening.range[1], closing.range[0]],
				opening,
				1,
			);
		}

		/**
		 * Handles JSX spread attribute indentation.
		 * @param {ASTNode} node JSXSpreadAttribute.
		 */
		function handleJSXSpreadAttribute(node) {
			const opening = sourceCode.getFirstToken(node);
			const closing = sourceCode.getLastToken(node);
			offsets.setDesiredOffsets(
				[opening.range[1], closing.range[0]],
				opening,
				1,
			);
		}

		/**
		 * Handles generic nodes.
		 * @param {ASTNode} node Any node.
		 */
		function handleGenericNode(node) {
			const firstToken = sourceCode.getFirstToken(node);
			if (firstToken && !ignoredNodeFirstTokens.has(firstToken)) {
				offsets.setDesiredOffsets(node.range, firstToken, 0);
			}
		}

		const ignoredNodeFirstTokens = new Set();
		const ignoredNodes = new Set();

		/**
		 * Adds a node to ignored set.
		 * @param {ASTNode} node Node to ignore.
		 */
		function addToIgnoredNodes(node) {
			ignoredNodes.add(node);
			ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
		}

		const ignoredNodeListeners = options.ignoredNodes.reduce(
			(listeners, selector) => ({
				...listeners,
				[selector]: addToIgnoredNodes,
			}),
			{},
		);

		const baseOffsetListeners = {
			"ArrayExpression, ArrayPattern"(node) {
				const opening = sourceCode.getFirstToken(node);
				const closing = sourceCode.getTokenAfter(
					[...node.elements].reverse().find(Boolean) || opening,
					astUtils.isClosingBracketToken,
				);
				addElementListIndent(
					node.elements,
					opening,
					closing,
					options.ArrayExpression,
				);
			},
			"ObjectExpression, ObjectPattern"(node) {
				const opening = sourceCode.getFirstToken(node);
				const closing = sourceCode.getTokenAfter(
					node.properties.length ? node.properties.at(-1) : opening,
					astUtils.isClosingBraceToken,
				);
				addElementListIndent(
					node.properties,
					opening,
					closing,
					options.ObjectExpression,
				);
			},
			ArrowFunctionExpression(node) {
				const openingParen = getOpeningParenForFunction(node, sourceCode);
				if (openingParen) {
					const closingParen = getClosingParenForFunction(node, sourceCode);
					parameterParens.add(openingParen);
					parameterParens.add(closingParen);
					addElementListIndent(
						node.params,
						openingParen,
						closingParen,
						options.FunctionExpression.parameters,
					);
				}
				addBlocklessNodeIndent(node.body);
			},
			AssignmentExpression(node) {
				const operator = sourceCode.getFirstTokenBetween(
					node.left,
					node.right,
					t => t.value === node.operator,
				);
				offsets.setDesiredOffsets(
					[operator.range[0], node.range[1]],
					sourceCode.getLastToken(node.left),
					1,
				);
				offsets.ignoreToken(operator);
				offsets.ignoreToken(sourceCode.getTokenAfter(operator));
			},
			"BinaryExpression, LogicalExpression"(node) {
				const operator = sourceCode.getFirstTokenBetween(
					node.left,
					node.right,
					t => t.value === node.operator,
				);
				const afterOperator = sourceCode.getTokenAfter(operator);
				offsets.ignoreToken(operator);
				offsets.ignoreToken(afterOperator);
				offsets.setDesiredOffset(afterOperator, operator, 0);
			},
			"BlockStatement, ClassBody"(node) {
				let blockIndentLevel;
				if (node.parent && isOuterIIFE(node.parent)) {
					blockIndentLevel = options.outerIIFEBody;
				} else if (
					node.parent &&
					(node.parent.type === "FunctionExpression" ||
						node.parent.type === "ArrowFunctionExpression")
				) {
					blockIndentLevel = options.FunctionExpression.body;
				} else if (node.parent && node.parent.type === "FunctionDeclaration") {
					blockIndentLevel = options.FunctionDeclaration.body;
				} else {
					blockIndentLevel = 1;
				}
				if (!astUtils.STATEMENT_LIST_PARENTS.has(node.parent.type)) {
					offsets.setDesiredOffset(
						sourceCode.getFirstToken(node),
						sourceCode.getFirstToken(node.parent),
						0,
					);
				}
				addElementListIndent(
					node.body,
					sourceCode.getFirstToken(node),
					sourceCode.getLastToken(node),
					blockIndentLevel,
				);
			},
			CallExpression: handleFunctionCallIndent,
			"ClassDeclaration[superClass], ClassExpression[superClass]"(node) {
				const classToken = sourceCode.getFirstToken(node);
				const extendsToken = sourceCode.getTokenBefore(
					node.superClass,
					astUtils.isNotOpeningParenToken,
				);
				offsets.setDesiredOffsets(
					[extendsToken.range[0], node.body.range[0]],
					classToken,
					1,
				);
			},
			ConditionalExpression: handleConditionalExpression,
			"DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement":
				node => addBlocklessNodeIndent(node.body),
			ExportNamedDeclaration(node) {
				if (node.declaration === null) {
					const closingCurly = sourceCode.getLastToken(
						node,
						astUtils.isClosingBraceToken,
					);
					addElementListIndent(
						node.specifiers,
						sourceCode.getFirstToken(node, { skip: 1 }),
						closingCurly,
						1,
					);
					if (node.source) {
						const end =
							sourceCode.getLastToken(node, t => t.type === "Punctuator" && t.value === ";")
								?.range[1] === sourceCode.getLastToken(node, t => t.type === "String")?.range[1]
								? node.range[1]
								: sourceCode.getLastToken(node, t => t.type === "String")?.range[1];
						offsets.setDesiredOffsets(
							[sourceCode.getFirstToken(node, t => t.type === "Identifier" && t.value === "from").range[0], end],
							sourceCode.getFirstToken(node),
							1,
						);
					}
				}
			},
			ForStatement(node) {
				const openingParen = sourceCode.getFirstToken(node, 1);
				if (node.init) {
					offsets.setDesiredOffsets(node.init.range, openingParen, 1);
				}
				if (node.test) {
					offsets.setDesiredOffsets(node.test.range, openingParen, 1);
				}
				if (node.update) {
					offsets.setDesiredOffsets(node.update.range, openingParen, 1);
				}
				addBlocklessNodeIndent(node.body);
			},
			"FunctionDeclaration, FunctionExpression"(node) {
				const closingParen = sourceCode.getTokenBefore(node.body);
				const openingParen = sourceCode.getTokenBefore(
					node.params.length ? node.params[0] : closingParen,
				);
				parameterParens.add(openingParen);
				parameterParens.add(closingParen);
				addElementListIndent(
					node.params,
					openingParen,
					closingParen,
					options[node.type].parameters,
				);
			},
			IfStatement(node) {
				addBlocklessNodeIndent(node.consequent);
				if (node.alternate) {
					addBlocklessNodeIndent(node.alternate);
				}
			},
			":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(node) {
				const nodesToCheck = node.type === "IfStatement"
					? [node.consequent, ...(node.alternate ? [node.alternate] : [])]
					: [node.body];
				for (const n of nodesToCheck) {
					const lastToken = sourceCode.getLastToken(n);
					if (astUtils.isSemicolonToken(lastToken)) {
						const before = sourceCode.getTokenBefore(lastToken);
						const after = sourceCode.getTokenAfter(lastToken);
						if (
							!astUtils.isTokenOnSameLine(before, lastToken) &&
							after &&
							astUtils.isTokenOnSameLine(lastToken, after)
						) {
							offsets.setDesiredOffset(
								lastToken,
								sourceCode.getFirstToken(node),
								0,
							);
						}
					}
				}
			},
			ImportDeclaration(node) {
				if (node.specifiers.some(s => s.type === "ImportSpecifier")) {
					const openingCurly = sourceCode.getFirstToken(
						node,
						astUtils.isOpeningBraceToken,
					);
					const closingCurly = sourceCode.getLastToken(
						node,
						astUtils.isClosingBraceToken,
					);
					addElementListIndent(
						node.specifiers.filter(s => s.type === "ImportSpecifier"),
						openingCurly,
						closingCurly,
						options.ImportDeclaration,
					);
				}
				const fromToken = sourceCode.getLastToken(
					node,
					t => t.type === "Identifier" && t.value === "from",
				);
				const sourceToken = sourceCode.getLastToken(
					node,
					t => t.type === "String",
				);
				const semiToken = sourceCode.getLastToken(
					node,
					t => t.type === "Punctuator" && t.value === ";",
				);
				if (fromToken) {
					const end = semiToken && semiToken.range[1] === sourceToken.range[1]
						? node.range[1]
						: sourceToken.range[1];
					offsets.setDesiredOffsets(
						[fromToken.range[0], end],
						sourceCode.getFirstToken(node),
						1,
					);
				}
			},
			ImportExpression(node) {
				const openingParen = sourceCode.getFirstToken(node, 1);
				const closingParen = sourceCode.getLastToken(node);
				parameterParens.add(openingParen);
				parameterParens.add(closingParen);
				offsets.setDesiredOffset(
					openingParen,
					sourceCode.getTokenBefore(openingParen),
					0,
				);
				addElementListIndent(
					[node.source],
					openingParen,
					closingParen,
					options.CallExpression.arguments,
				);
			},
			"MemberExpression, JSXMemberExpression, MetaProperty"(node) {
				const object = node.type === "MetaProperty" ? node.meta : node.object;
				const firstNonObject = sourceCode.getFirstTokenBetween(
					object,
					node.property,
					astUtils.isNotClosingParenToken,
				);
				const secondNonObject = sourceCode.getTokenAfter(firstNonObject);
				const objectParenCount = sourceCode.getTokensBetween(
					object,
					node.property,
					{ filter: astUtils.isClosingParenToken },
				).length;
				const firstObject = objectParenCount
					? sourceCode.getTokenBefore(object, {
							skip: objectParenCount - 1,
						})
					: sourceCode.getFirstToken(object);
				const lastObject = sourceCode.getTokenBefore(firstNonObject);
				const firstProperty = node.computed ? firstNonObject : secondNonObject;
				if (node.computed) {
					offsets.setDesiredOffset(
						sourceCode.getLastToken(node),
						firstNonObject,
						0,
					);
					offsets.setDesiredOffsets(
						node.property.range,
						firstNonObject,
						1,
					);
				}
				const offsetBase =
					lastObject.loc.end.line === firstProperty.loc.start.line
						? lastObject
						: firstObject;
				if (typeof options.MemberExpression === "number") {
					offsets.setDesiredOffset(
						firstNonObject,
						offsetBase,
						options.MemberExpression,
					);
					offsets.setDesiredOffset(
						secondNonObject,
						node.computed ? firstNonObject : offsetBase,
						options.MemberExpression,
					);
				} else {
					offsets.ignoreToken(firstNonObject);
					offsets.ignoreToken(secondNonObject);
					offsets.setDesiredOffset(firstNonObject, offsetBase, 0);
					offsets.setDesiredOffset(secondNonObject, firstNonObject, 0);
				}
			},
			NewExpression(node) {
				if (
					node.arguments.length > 0 ||
					(astUtils.isClosingParenToken(sourceCode.getLastToken(node)) &&
						astUtils.isOpeningParenToken(sourceCode.getLastToken(node, 1)))
				) {
					handleFunctionCallIndent(node);
				}
			},
			Property(node) {
				if (!node.shorthand && !node.method && node.kind === "init") {
					const colon = sourceCode.getFirstTokenBetween(
						node.key,
						node.value,
						astUtils.isColonToken,
					);
					offsets.ignoreToken(sourceCode.getTokenAfter(colon));
				}
			},
			PropertyDefinition(node) {
				const firstToken = sourceCode.getFirstToken(node);
				const maybeSemicolon = sourceCode.getLastToken(node);
				let keyLastToken;
				if (node.computed) {
					const leftBracket = sourceCode.getTokenBefore(
						node.key,
						astUtils.isOpeningBracketToken,
					);
					const rightBracket = (keyLastToken = sourceCode.getTokenAfter(
						node.key,
						astUtils.isClosingBracketToken,
					));
					const keyRange = [leftBracket.range[1], rightBracket.range[0]];
					if (leftBracket !== firstToken) {
						offsets.setDesiredOffset(leftBracket, firstToken, 0);
					}
					offsets.setDesiredOffsets(keyRange, leftBracket, 1);
					offsets.setDesiredOffset(rightBracket, leftBracket, 0);
				} else {
					const idToken = (keyLastToken = sourceCode.getFirstToken(node.key));
					if (idToken !== firstToken) {
						offsets.setDesiredOffset(idToken, firstToken, 1);
					}
				}
				if (node.value) {
					const eq = sourceCode.getTokenBefore(
						node.value,
						astUtils.isEqToken,
					);
					const valueToken = sourceCode.getTokenAfter(eq);
					offsets.setDesiredOffset(eq, keyLastToken, 1);
					offsets.setDesiredOffset(valueToken, eq, 1);
					if (astUtils.isSemicolonToken(maybeSemicolon)) {
						offsets.setDesiredOffset(maybeSemicolon, eq, 1);
					}
				} else if (astUtils.isSemicolonToken(maybeSemicolon)) {
					offsets.setDesiredOffset(maybeSemicolon, keyLastToken, 1);
				}
			},
			StaticBlock(node) {
				const openingCurly = sourceCode.getFirstToken(node, { skip: 1 });
				const closingCurly = sourceCode.getLastToken(node);
				addElementListIndent(
					node.body,
					openingCurly,
					closingCurly,
					options.StaticBlock.body,
				);
			},
			TemplateLiteral(node) {
				node.expressions.forEach((expr, i) => {
					const prevQuasi = node.quasis[i];
					const nextQuasi = node.quasis[i + 1];
					const alignFrom =
						prevQuasi.loc.start.line === prevQuasi.loc.end.line
							? sourceCode.getFirstToken(prevQuasi)
							: null;
					offsets.setDesiredOffsets(
						[prevQuasi.range[1], nextQuasi.range[0]],
						alignFrom,
						1,
					);
					offsets.setDesiredOffset(
						sourceCode.getFirstToken(nextQuasi),
						alignFrom,
						0,
					);
				});
			},
			VariableDeclaration: handleVariableDeclaration,
			VariableDeclarator: handleVariableDeclarator,
			"JSXAttribute[value]": handleJSXAttribute,
			JSXElement: handleJSXElement,
			JSXOpeningElement: handleJSXOpeningElement,
			JSXClosingElement: handleJSXClosingElement,
			JSXFragment: handleJSXFragment,
			JSXOpeningFragment: handleJSXOpeningFragment,
			JSXClosingFragment: handleJSXClosingFragment,
			JSXExpressionContainer: handleJSXExpressionContainer,
			JSXSpreadAttribute: handleJSXSpreadAttribute,
			"*"(node) {
				handleGenericNode(node);
			},
		};

		const listenerCallQueue = [];

		const offsetListeners = {};

		for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
			offsetListeners[selector] = node => listenerCallQueue.push({ listener, node });
		}

		return Object.assign(offsetListeners, ignoredNodeListeners, {
			"*:exit"(node) {
				if (!KNOWN_NODES.has(node.type)) {
					addToIgnoredNodes(node);
				}
			},
			"Program:exit"() {
				if (options.ignoreComments) {
					sourceCode.getAllComments().forEach(c => offsets.ignoreToken(c));
				}
				for (let i = 0; i < listenerCallQueue.length; i++) {
					const { listener, node } = listenerCallQueue[i];
					if (!ignoredNodes.has(node)) {
						listener(node);
					}
				}
				ignoredNodes.forEach(ignoreNode);
				addParensIndent(sourceCode.ast.tokens);
				const precedingTokens = new WeakMap();
				for (let i = 0; i < sourceCode.ast.comments.length; i++) {
					const comment = sourceCode.ast.comments[i];
					const before = sourceCode.getTokenBefore(comment, { includeComments: true });
					const has = precedingTokens.has(before) ? precedingTokens.get(before) : before;
					precedingTokens.set(comment, has);
				}
				for (let i = 1; i <= sourceCode.lines.length; i++) {
					if (!tokenInfo.firstTokensByLineNumber.has(i)) {
						continue;
					}
					const firstToken = tokenInfo.firstTokensByLineNumber.get(i);
					if (firstToken.loc.start.line !== i) {
						continue;
					}
					if (astUtils.isCommentToken(firstToken)) {
						const before = precedingTokens.get(firstToken);
						const after = before
							? sourceCode.getTokenAfter(before)
							: sourceCode.ast.tokens[0];
						const canAlignBefore = before && !hasBlankLinesBetween(before, firstToken);
						const canAlignAfter = after && !hasBlankLinesBetween(firstToken, after);
						if (
							after &&
							astUtils.isSemicolonToken(after) &&
							!astUtils.isTokenOnSameLine(firstToken, after)
						) {
							offsets.setDesiredOffset(firstToken, after, 0);
						}
						if (
							(canAlignBefore && validateTokenIndent(firstToken, offsets.getDesiredIndent(before))) ||
							(canAlignAfter && validateTokenIndent(firstToken, offsets.getDesiredIndent(after)))
						) {
							continue;
						}
					}
					if (validateTokenIndent(firstToken, offsets.getDesiredIndent(firstToken))) {
						continue;
					}
					report(firstToken, offsets.getDesiredIndent(firstToken));
				}
			},
		});
	},
};
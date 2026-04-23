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
// Rule Definition
//------------------------------------------------------------------------------

const KNOWN_NODES = new Set([
	"AssignmentExpression",
	"AssignmentPattern",
	"ArrayExpression",
	"ArrayPattern",
	"ArrowFunctionExpression",
	"AwaitExpression",
	"BlockStatement",
	"BinaryExpression",
	"BreakStatement",
	"CallExpression",
	"CatchClause",
	"ChainExpression",
	"ClassBody",
	"ClassDeclaration",
	"ClassExpression",
	"ConditionalExpression",
	"ContinueStatement",
	"DoWhileStatement",
	"DebuggerStatement",
	"EmptyStatement",
	"ExperimentalRestProperty",
	"ExperimentalSpreadProperty",
	"ExpressionStatement",
	"ForStatement",
	"ForInStatement",
	"ForOfStatement",
	"FunctionDeclaration",
	"FunctionExpression",
	"Identifier",
	"IfStatement",
	"Literal",
	"LabeledStatement",
	"LogicalExpression",
	"MemberExpression",
	"MetaProperty",
	"MethodDefinition",
	"NewExpression",
	"ObjectExpression",
	"ObjectPattern",
	"PrivateIdentifier",
	"Program",
	"Property",
	"PropertyDefinition",
	"RestElement",
	"ReturnStatement",
	"SequenceExpression",
	"SpreadElement",
	"StaticBlock",
	"Super",
	"SwitchCase",
	"SwitchStatement",
	"TaggedTemplateExpression",
	"TemplateElement",
	"TemplateLiteral",
	"ThisExpression",
	"ThrowStatement",
	"TryStatement",
	"UnaryExpression",
	"UpdateExpression",
	"VariableDeclaration",
	"VariableDeclarator",
	"WhileStatement",
	"WithStatement",
	"YieldExpression",
	"JSXFragment",
	"JSXOpeningFragment",
	"JSXClosingFragment",
	"JSXIdentifier",
	"JSXNamespacedName",
	"JSXMemberExpression",
	"JSXEmptyExpression",
	"JSXExpressionContainer",
	"JSXElement",
	"JSXClosingElement",
	"JSXOpeningElement",
	"JSXAttribute",
	"JSXSpreadAttribute",
	"JSXText",
	"ExportDefaultDeclaration",
	"ExportNamedDeclaration",
	"ExportAllDeclaration",
	"ExportSpecifier",
	"ImportDeclaration",
	"ImportSpecifier",
	"ImportDefaultSpecifier",
	"ImportNamespaceSpecifier",
	"ImportExpression",
]);

/**
 * A mutable map that stores (key, value) pairs. The keys are numeric indices, and must be unique.
 * This is intended to be a generic wrapper around a map with non-negative integer keys, so that the underlying implementation
 * can easily be swapped out.
 */
class IndexMap {
	/**
	 * Creates an empty map
	 * @param {number} maxKey The maximum key
	 */
	constructor(maxKey) {
		this._values = Array(maxKey + 1);
	}

	/**
	 * Inserts an entry into the map.
	 * @param {number} key The entry's key
	 * @param {any} value The entry's value
	 * @returns {void}
	 */
	insert(key, value) {
		this._values[key] = value;
	}

	/**
	 * Finds the value of the entry with the largest key less than or equal to the provided key
	 * @param {number} key The provided key
	 * @returns {*|undefined} The value of the found entry, or undefined if no such entry exists.
	 */
	findLastNotAfter(key) {
		const values = this._values;
		for (let i = key; i >= 0; i--) {
			const v = values[i];
			if (v) {
				return v;
			}
		}
		return void 0;
	}

	/**
	 * Deletes all of the keys in the interval [start, end)
	 * @param {number} start The start of the range
	 * @param {number} end The end of the range
	 * @returns {void}
	 */
	deleteRange(start, end) {
		this._values.fill(void 0, start, end);
	}
}

/**
 * A helper class to get token-based info related to indentation
 */
class TokenInfo {
	/**
	 * @param {SourceCode} sourceCode A SourceCode object
	 */
	constructor(sourceCode) {
		this.sourceCode = sourceCode;
		this.firstTokensByLineNumber = new Map();
		const tokens = sourceCode.tokensAndComments;
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (!this.firstTokensByLineNumber.has(token.loc.start.line)) {
				this.firstTokensByLineNumber.set(token.loc.start.line, token);
			}
			if (
				!this.firstTokensByLineNumber.has(token.loc.end.line) &&
				sourceCode.text
					.slice(token.range[1] - token.loc.end.column, token.range[1])
					.trim()
			) {
				this.firstTokensByLineNumber.set(token.loc.end.line, token);
			}
		}
	}

	/**
	 * Gets the first token on a given token's line
	 * @param {Token|ASTNode} token a node or token
	 * @returns {Token} The first token on the given line
	 */
	getFirstTokenOfLine(token) {
		return this.firstTokensByLineNumber.get(token.loc.start.line);
	}

	/**
	 * Determines whether a token is the first token in its line
	 * @param {Token} token The token
	 * @returns {boolean} `true` if the token is the first on its line
	 */
	isFirstTokenOfLine(token) {
		return this.getFirstTokenOfLine(token) === token;
	}

	/**
	 * Get the actual indent of a token
	 * @param {Token} token Token to examine. This should be the first token on its line.
	 * @returns {string} The indentation characters that precede the token
	 */
	getTokenIndent(token) {
		return this.sourceCode.text.slice(
			token.range[0] - token.loc.start.column,
			token.range[0],
		);
	}
}

/**
 * A class to store information on desired offsets of tokens from each other
 */
class OffsetStorage {
	/**
	 * @param {TokenInfo} tokenInfo a TokenInfo instance
	 * @param {number} indentSize The desired size of each indentation level
	 * @param {string} indentType The indentation character
	 * @param {number} maxIndex The maximum end index of any token
	 */
	constructor(tokenInfo, indentSize, indentType, maxIndex) {
		this._tokenInfo = tokenInfo;
		this._indentSize = indentSize;
		this._indentType = indentType;

		this._indexMap = new IndexMap(maxIndex);
		this._indexMap.insert(0, { offset: 0, from: null, force: false });

		this._lockedFirstTokens = new WeakMap();
		this._desiredIndentCache = new WeakMap();
		this._ignoredTokens = new WeakSet();
	}

	_getOffsetDescriptor(token) {
		return this._indexMap.findLastNotAfter(token.range[0]);
	}

	/**
	 * Sets the offset column of token B to match the offset column of token A.
	 * - **WARNING**: This matches a *column*, even if baseToken is not the first token on its line. In
	 * most cases, `setDesiredOffset` should be used instead.
	 * @param {Token} baseToken The first token
	 * @param {Token} offsetToken The second token, whose offset should be matched to the first token
	 * @returns {void}
	 */
	matchOffsetOf(baseToken, offsetToken) {
		this._lockedFirstTokens.set(offsetToken, baseToken);
	}

	/**
	 * Sets the desired offset of a token.
	 *
	 * This uses a line-based offset collapsing behavior to handle tokens on the same line.
	 * @param {Token} token The token
	 * @param {Token} fromToken The token that `token` should be offset from
	 * @param {number} offset The desired indent level
	 * @returns {void}
	 */
	setDesiredOffset(token, fromToken, offset) {
		return this.setDesiredOffsets(token.range, fromToken, offset);
	}

	/**
	 * Sets the desired offset of all tokens in a range
	 * @param {[number, number]} range A [start, end] pair.
	 * @param {Token} fromToken The token that this is offset from
	 * @param {number} offset The desired indent level
	 * @param {boolean} force `true` if this offset should not use the normal collapsing behavior.
	 * @returns {void}
	 */
	setDesiredOffsets(range, fromToken, offset, force) {
		const descriptorToInsert = { offset, from: fromToken, force };
		const descriptorAfterRange = this._indexMap.findLastNotAfter(range[1]);

		const fromTokenIsInRange =
			fromToken &&
			fromToken.range[0] >= range[0] &&
			fromToken.range[1] <= range[1];
		const fromTokenDescriptor =
			fromTokenIsInRange && this._getOffsetDescriptor(fromToken);

		this._indexMap.deleteRange(range[0] + 1, range[1]);
		this._indexMap.insert(range[0], descriptorToInsert);

		if (fromTokenIsInRange) {
			this._indexMap.insert(fromToken.range[0], fromTokenDescriptor);
			this._indexMap.insert(fromToken.range[1], descriptorToInsert);
		}
		this._indexMap.insert(range[1], descriptorAfterRange);
	}

	/**
	 * Gets the desired indent of a token
	 * @param {Token} token The token
	 * @returns {string} The desired indent of the token
	 */
	getDesiredIndent(token) {
		if (!this._desiredIndentCache.has(token)) {
			if (this._ignoredTokens.has(token)) {
				this._desiredIndentCache.set(
					token,
					this._tokenInfo.getTokenIndent(token),
				);
			} else if (this._lockedFirstTokens.has(token)) {
				const firstToken = this._lockedFirstTokens.get(token);
				const baseIndent = this.getDesiredIndent(
					this._tokenInfo.getFirstTokenOfLine(firstToken),
				);
				const extra = this._indentType.repeat(
					firstToken.loc.start.column -
						this._tokenInfo.getFirstTokenOfLine(firstToken)
							.loc.start.column,
				);
				this._desiredIndentCache.set(token, baseIndent + extra);
			} else {
				const offsetInfo = this._getOffsetDescriptor(token);
				const shouldCollapse =
					offsetInfo.from &&
					offsetInfo.from.loc.start.line === token.loc.start.line &&
					!/^\s*?\n/u.test(token.value) &&
					!offsetInfo.force;
				const offset = shouldCollapse ? 0 : offsetInfo.offset * this._indentSize;
				const base = offsetInfo.from
					? this.getDesiredIndent(offsetInfo.from)
					: "";
				this._desiredIndentCache.set(token, base + this._indentType.repeat(offset));
			}
		}
		return this._desiredIndentCache.get(token);
	}

	/**
	 * Ignores a token, preventing it from being reported.
	 * @param {Token} token The token
	 * @returns {void}
	 */
	ignoreToken(token) {
		if (this._tokenInfo.isFirstTokenOfLine(token)) {
			this._ignoredTokens.add(token);
		}
	}

	/**
	 * Gets the first token that the given token's indentation is dependent on
	 * @param {Token} token The token
	 * @returns {Token} The token that the given token depends on, or `null` if the given token is at the top level
	 */
	getFirstDependency(token) {
		return this._getOffsetDescriptor(token).from;
	}
}

/**
 * Helper to pluralize a word based on count.
 * @param {string} word Base word
 * @param {number} count Count
 * @returns {string} Pluralized word
 */
function pluralize(word, count) {
	return count === 1 ? word : word + "s";
}

/**
 * Creates an error message data object.
 * @param {number} expectedAmount Expected indentation amount
 * @param {number} actualSpaces Actual spaces count
 * @param {number} actualTabs Actual tabs count
 * @param {string} indentType Indent type ("space" or "tab")
 * @returns {{expected:string,actual:string}}
 */
function createErrorMessageData(expectedAmount, actualSpaces, actualTabs, indentType) {
	const expected = `${expectedAmount} ${indentType}${pluralize(indentType, expectedAmount)}`;
	let found;
	if (actualSpaces > 0) {
		if (indentType === "space") {
			found = `${actualSpaces}`;
		} else {
			found = `${actualSpaces} ${pluralize("space", actualSpaces)}`;
		}
	} else if (actualTabs > 0) {
		if (indentType === "tab") {
			found = `${actualTabs}`;
		} else {
			found = `${actualTabs} ${pluralize("tab", actualTabs)}`;
		}
	} else {
		found = "0";
	}
	return { expected, actual: found };
}

/**
 * Reports an indentation violation.
 * @param {RuleContext} context ESLint rule context
 * @param {TokenInfo} tokenInfo TokenInfo instance
 * @param {Token} token Token that violates the rule
 * @param {string} neededIndent Expected indentation string
 * @param {string} indentType Indent type
 */
function reportIndent(context, tokenInfo, token, neededIndent, indentType) {
	const actualIndent = Array.from(tokenInfo.getTokenIndent(token));
	const numSpaces = actualIndent.filter(c => c === " ").length;
	const numTabs = actualIndent.filter(c => c === "\t").length;
	const data = createErrorMessageData(
		neededIndent.length,
		numSpaces,
		numTabs,
		indentType,
	);
	context.report({
		node: token,
		messageId: "wrongIndentation",
		data,
		loc: {
			start: { line: token.loc.start.line, column: 0 },
			end: { line: token.loc.start.line, column: token.loc.start.column },
		},
		fix(fixer) {
			const range = [token.range[0] - token.loc.start.column, token.range[0]];
			return fixer.replaceTextRange(range, neededIndent);
		},
	});
}

/**
 * Checks if a token's indentation matches the desired indentation.
 * @param {TokenInfo} tokenInfo TokenInfo instance
 * @param {Token} token Token to examine
 * @param {string} desiredIndent Desired indentation string
 * @returns {boolean}
 */
function isIndentCorrect(tokenInfo, token, desiredIndent) {
	const indentation = tokenInfo.getTokenIndent(token);
	return (
		indentation === desiredIndent ||
		(indentation.includes(" ") && indentation.includes("\t"))
	);
}

/**
 * Determines whether a node is an outer IIFE.
 * @param {ASTNode} node Function node
 * @returns {boolean}
 */
function isOuterIIFE(node) {
	if (!node.parent || node.parent.type !== "CallExpression" || node.parent.callee !== node) {
		return false;
	}
	let stmt = node.parent && node.parent.parent;
	while (stmt) {
		if (
			(stmt.type === "UnaryExpression" && ["!", "~", "+", "-"].includes(stmt.operator)) ||
			stmt.type === "AssignmentExpression" ||
			stmt.type === "LogicalExpression" ||
			stmt.type === "SequenceExpression" ||
			stmt.type === "VariableDeclarator"
		) {
			stmt = stmt.parent;
			continue;
		}
		break;
	}
	if (!stmt) {
		return false;
	}
	const isTopStatement =
		stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration";
	return isTopStatement && stmt.parent && stmt.parent.type === "Program";
}

/**
 * Counts trailing linebreaks in a string.
 * @param {string} str Input string
 * @returns {number}
 */
function countTrailingLinebreaks(str) {
	const trailing = str.match(/\s*$/u)[0];
	const matches = trailing.match(astUtils.createGlobalLinebreakMatcher());
	return matches === null ? 0 : matches.length;
}

/**
 * Retrieves the first token of an element, handling surrounding parentheses.
 * @param {SourceCode} sourceCode SourceCode instance
 * @param {ASTNode} element Element node
 * @param {Token} startToken Start token of the list (e.g., '[')
 * @returns {Token}
 */
function getFirstTokenOfElement(sourceCode, element, startToken) {
	let token = sourceCode.getTokenBefore(element);
	while (astUtils.isOpeningParenToken(token) && token !== startToken) {
		token = sourceCode.getTokenBefore(token);
	}
	return sourceCode.getTokenAfter(token);
}

/**
 * Determines if an element list offset option is "off".
 * @param {any} offset Offset option
 * @returns {boolean}
 */
function isOffsetOff(offset) {
	return offset === "off";
}

/**
 * Determines if an element list offset option is "first".
 * @param {any} offset Offset option
 * @returns {boolean}
 */
function isOffsetFirst(offset) {
	return offset === "first";
}

/**
 * Handles element list indentation.
 * @param {Object} params Parameters
 * @param {ASTNode[]} params.elements Elements array
 * @param {Token} params.startToken Opening token (e.g., '[')
 * @param {Token} params.endToken Closing token (e.g., ']')
 * @param {number|string} params.offset Offset option
 * @param {SourceCode} params.sourceCode SourceCode instance
 * @param {TokenInfo} params.tokenInfo TokenInfo instance
 * @param {OffsetStorage} params.offsets OffsetStorage instance
 */
function handleElementListIndent({ elements, startToken, endToken, offset, sourceCode, tokenInfo, offsets }) {
	const numericOffset = typeof offset === "number" ? offset : 1;
	offsets.setDesiredOffsets(
		[startToken.range[1], endToken.range[0]],
		startToken,
		numericOffset,
	);
	offsets.setDesiredOffset(endToken, startToken, 0);

	if (isOffsetFirst(offset) && elements.length && !elements[0]) {
		return;
	}
	elements.forEach((element, idx) => {
		if (!element) {
			return;
		}
		if (isOffsetOff(offset)) {
			offsets.ignoreToken(getFirstTokenOfElement(sourceCode, element, startToken));
			return;
		}
		if (idx === 0) {
			return;
		}
		if (
			isOffsetFirst(offset) &&
			tokenInfo.isFirstTokenOfLine(getFirstTokenOfElement(sourceCode, element, startToken))
		) {
			offsets.matchOffsetOf(
				getFirstTokenOfElement(sourceCode, elements[0], startToken),
				getFirstTokenOfElement(sourceCode, element, startToken),
			);
			return;
		}
		const prev = elements[idx - 1];
		const prevFirst = prev && getFirstTokenOfElement(sourceCode, prev, startToken);
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
	});
}

/**
 * Handles blockless node indentation.
 * @param {Object} params Parameters
 * @param {ASTNode} params.node Node to process
 * @param {SourceCode} params.sourceCode SourceCode instance
 * @param {OffsetStorage} params.offsets OffsetStorage instance
 */
function handleBlocklessNodeIndent({ node, sourceCode, offsets }) {
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
		astUtils.isOpeningParenToken(sourceCode.getTokenBefore(firstBodyToken)) &&
		astUtils.isClosingParenToken(sourceCode.getTokenAfter(lastBodyToken))
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
 * @param {Object} params Parameters
 * @param {ASTNode} params.node CallExpression or NewExpression node
 * @param {SourceCode} params.sourceCode SourceCode instance
 * @param {OffsetStorage} params.offsets OffsetStorage instance
 * @param {WeakSet} params.parameterParens Set of parameter parentheses tokens
 * @param {Object} params.options Options object
 */
function handleFunctionCallIndent({ node, sourceCode, offsets, parameterParens, options }) {
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
		const firstCalleeToken = calleeParenCount
			? sourceCode.getTokenBefore(node.callee, { skip: calleeParenCount - 1 })
			: sourceCode.getFirstToken(node.callee);
		const lastCalleeToken = sourceCode.getTokenBefore(dotToken);
		const offsetBase =
			lastCalleeToken.loc.end.line === openingParen.loc.start.line
				? lastCalleeToken
				: firstCalleeToken;
		offsets.setDesiredOffset(dotToken, offsetBase, 1);
	}
	const offsetAfterToken =
		node.callee.type === "TaggedTemplateExpression"
			? sourceCode.getFirstToken(node.callee.quasi)
			: openingParen;
	const offsetToken = sourceCode.getTokenBefore(offsetAfterToken);
	offsets.setDesiredOffset(openingParen, offsetToken, 0);
	handleElementListIndent({
		elements: node.arguments,
		startToken: openingParen,
		endToken: closingParen,
		offset: options.CallExpression.arguments,
		sourceCode,
		tokenInfo: null,
		offsets,
	});
}

/**
 * Handles parentheses indentation.
 * @param {Token[]} tokens Token list
 * @param {SourceCode} sourceCode SourceCode instance
 * @param {OffsetStorage} offsets OffsetStorage instance
 * @param {WeakSet} parameterParens Set of parameter parentheses tokens
 */
function handleParensIndent(tokens, sourceCode, offsets, parameterParens) {
	const stack = [];
	const pairs = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (astUtils.isOpeningParenToken(t)) {
			stack.push(t);
		} else if (astUtils.isClosingParenToken(t)) {
			const left = stack.pop();
			if (left) {
				pairs.push({ left, right: t });
			}
		}
	}
	for (let i = pairs.length - 1; i >= 0; i--) {
		const { left, right } = pairs[i];
		if (!parameterParens.has(left) && !parameterParens.has(right)) {
			const innerTokens = new Set(sourceCode.getTokensBetween(left, right));
			innerTokens.forEach(tok => {
				if (!innerTokens.has(offsets.getFirstDependency(tok))) {
					offsets.setDesiredOffset(tok, left, 1);
				}
			});
		}
		offsets.setDesiredOffset(right, left, 0);
	}
}

/**
 * Ignores a node's tokens.
 * @param {ASTNode} node Node to ignore
 * @param {SourceCode} sourceCode SourceCode instance
 * @param {OffsetStorage} offsets OffsetStorage instance
 */
function ignoreNodeTokens(node, sourceCode, offsets) {
	const tokens = new Set(sourceCode.getTokens(node, { includeComments: true }));
	tokens.forEach(tok => {
		if (!tokens.has(offsets.getFirstDependency(tok))) {
			const firstLineToken = sourceCode.getFirstToken(tok);
			if (tok === firstLineToken) {
				offsets.ignoreToken(tok);
			} else {
				offsets.setDesiredOffset(tok, firstLineToken, 0);
			}
		}
	});
}

/**
 * Checks whether a token is on the first line of its statement.
 * @param {Token} token Token to check
 * @param {ASTNode} leafNode Leaf expression node
 * @returns {boolean}
 */
function isTokenOnFirstLineOfStatement(token, leafNode) {
	let node = leafNode;
	while (
		node.parent &&
		!node.parent.type.endsWith("Statement") &&
		!node.parent.type.endsWith("Declaration")
	) {
		node = node.parent;
	}
	node = node.parent;
	return !node || node.loc.start.line === token.loc.start.line;
}

/**
 * Checks for blank lines between two tokens.
 * @param {Token} firstToken First token
 * @param {Token} secondToken Second token
 * @param {TokenInfo} tokenInfo TokenInfo instance
 * @returns {boolean}
 */
function hasBlankLinesBetweenTokens(firstToken, secondToken, tokenInfo) {
	const startLine = firstToken.loc.end.line;
	const endLine = secondToken.loc.start.line;
	if (startLine === endLine || startLine === endLine - 1) {
		return false;
	}
	for (let line = startLine + 1; line < endLine; line++) {
		if (!tokenInfo.firstTokensByLineNumber.has(line)) {
			return true;
		}
	}
	return false;
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

		const ignoredNodeFirstTokens = new Set();

		const baseOffsetListeners = {
			"ArrayExpression, ArrayPattern"(node) {
				const openingBracket = sourceCode.getFirstToken(node);
				const closingBracket = sourceCode.getTokenAfter(
					[...node.elements].reverse().find(el => el) || openingBracket,
					astUtils.isClosingBracketToken,
				);
				handleElementListIndent({
					elements: node.elements,
					startToken: openingBracket,
					endToken: closingBracket,
					offset: options.ArrayExpression,
					sourceCode,
					tokenInfo,
					offsets,
				});
			},
			"ObjectExpression, ObjectPattern"(node) {
				const openingCurly = sourceCode.getFirstToken(node);
				const closingCurly = sourceCode.getTokenAfter(
					node.properties.length ? node.properties.at(-1) : openingCurly,
					astUtils.isClosingBraceToken,
				);
				handleElementListIndent({
					elements: node.properties,
					startToken: openingCurly,
					endToken: closingCurly,
					offset: options.ObjectExpression,
					sourceCode,
					tokenInfo,
					offsets,
				});
			},
			ArrowFunctionExpression(node) {
				const maybeOpeningParen = sourceCode.getFirstToken(node, {
					skip: node.async ? 1 : 0,
				});
				if (astUtils.isOpeningParenToken(maybeOpeningParen)) {
					const openingParen = maybeOpeningParen;
					const closingParen = sourceCode.getTokenBefore(
						node.body,
						astUtils.isClosingParenToken,
					);
					parameterParens.add(openingParen);
					parameterParens.add(closingParen);
					handleElementListIndent({
						elements: node.params,
						startToken: openingParen,
						endToken: closingParen,
						offset: options.FunctionExpression.parameters,
						sourceCode,
						tokenInfo,
						offsets,
					});
				}
				handleBlocklessNodeIndent({ node: node.body, sourceCode, offsets });
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
				const tokenAfterOperator = sourceCode.getTokenAfter(operator);
				offsets.ignoreToken(operator);
				offsets.ignoreToken(tokenAfterOperator);
				offsets.setDesiredOffset(tokenAfterOperator, operator, 0);
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
				handleElementListIndent({
					elements: node.body,
					startToken: sourceCode.getFirstToken(node),
					endToken: sourceCode.getLastToken(node),
					offset: blockIndentLevel,
					sourceCode,
					tokenInfo,
					offsets,
				});
			},
			CallExpression: node => handleFunctionCallIndent({ node, sourceCode, offsets, parameterParens, options }),
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
			ConditionalExpression(node) {
				const firstToken = sourceCode.getFirstToken(node);
				if (
					!options.flatTernaryExpressions ||
					!astUtils.isTokenOnSameLine(node.test, node.consequent) ||
					isTokenOnFirstLineOfStatement(firstToken, node)
				) {
					const questionMark = sourceCode.getFirstTokenBetween(
						node.test,
						node.consequent,
						t => t.type === "Punctuator" && t.value === "?",
					);
					const colon = sourceCode.getFirstTokenBetween(
						node.consequent,
						node.alternate,
						t => t.type === "Punctuator" && t.value === ":",
					);
					const firstCons = sourceCode.getTokenAfter(questionMark);
					const lastCons = sourceCode.getTokenBefore(colon);
					const firstAlt = sourceCode.getTokenAfter(colon);
					offsets.setDesiredOffset(questionMark, firstToken, 1);
					offsets.setDesiredOffset(colon, firstToken, 1);
					const consIndent = options.offsetTernaryExpressions ? 2 : 1;
					offsets.setDesiredOffset(firstCons, firstToken, consIndent);
					if (lastCons.loc.end.line === firstAlt.loc.start.line) {
						offsets.setDesiredOffset(firstAlt, firstCons, 0);
					} else {
						const altIndent = options.offsetTernaryExpressions ? 2 : 1;
						offsets.setDesiredOffset(firstAlt, firstToken, altIndent);
					}
				}
			},
			"DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement"(node) {
				handleBlocklessNodeIndent({ node: node.body, sourceCode, offsets });
			},
			ExportNamedDeclaration(node) {
				if (node.declaration === null) {
					const closingCurly = sourceCode.getLastToken(
						node,
						astUtils.isClosingBraceToken,
					);
					handleElementListIndent({
						elements: node.specifiers,
						startToken: sourceCode.getFirstToken(node, { skip: 1 }),
						endToken: closingCurly,
						offset: 1,
						sourceCode,
						tokenInfo,
						offsets,
					});
					if (node.source) {
						const end =
							(sourceCode.getLastToken(node, t => t.type === "Punctuator" && t.value === ";") &&
								sourceCode.getLastToken(node, t => t.type === "String").range[1] ===
								sourceCode.getLastToken(node, t => t.type === "Punctuator" && t.value === ";").range[1])
								? node.range[1]
								: sourceCode.getLastToken(node, t => t.type === "String").range[1];
						offsets.setDesiredOffsets(
							[sourceCode.getFirstToken(node, t => t.value === "from").range[0], end],
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
				handleBlocklessNodeIndent({ node: node.body, sourceCode, offsets });
			},
			"FunctionDeclaration, FunctionExpression"(node) {
				const closingParen = sourceCode.getTokenBefore(node.body);
				const openingParen = sourceCode.getTokenBefore(
					node.params.length ? node.params[0] : closingParen,
				);
				parameterParens.add(openingParen);
				parameterParens.add(closingParen);
				handleElementListIndent({
					elements: node.params,
					startToken: openingParen,
					endToken: closingParen,
					offset: options[node.type].parameters,
					sourceCode,
					tokenInfo,
					offsets,
				});
			},
			IfStatement(node) {
				handleBlocklessNodeIndent({ node: node.consequent, sourceCode, offsets });
				if (node.alternate) {
					handleBlocklessNodeIndent({ node: node.alternate, sourceCode, offsets });
				}
			},
			":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(node) {
				const nodesToCheck = node.type === "IfStatement"
					? [node.consequent, ...(node.alternate ? [node.alternate] : [])]
					: [node.body];
				nodesToCheck.forEach(n => {
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
				});
			},
			ImportDeclaration(node) {
				if (node.specifiers.some(s => s.type === "ImportSpecifier")) {
					const openingCurly = sourceCode.getFirstToken(node, astUtils.isOpeningBraceToken);
					const closingCurly = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);
					handleElementListIndent({
						elements: node.specifiers.filter(s => s.type === "ImportSpecifier"),
						startToken: openingCurly,
						endToken: closingCurly,
						offset: options.ImportDeclaration,
						sourceCode,
						tokenInfo,
						offsets,
					});
				}
				const fromToken = sourceCode.getLastToken(
					node,
					t => t.type === "Identifier" && t.value === "from",
				);
				const sourceToken = sourceCode.getLastToken(node, t => t.type === "String");
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
				handleElementListIndent({
					elements: [node.source],
					startToken: openingParen,
					endToken: closingParen,
					offset: options.CallExpression.arguments,
					sourceCode,
					tokenInfo,
					offsets,
				});
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
					? sourceCode.getTokenBefore(object, { skip: objectParenCount - 1 })
					: sourceCode.getFirstToken(object);
				const lastObject = sourceCode.getTokenBefore(firstNonObject);
				const firstProp = node.computed ? firstNonObject : secondNonObject;
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
					lastObject.loc.end.line === firstProp.loc.start.line
						? lastObject
						: firstObject;
				if (typeof options.MemberExpression === "number") {
					offsets.setDesiredOffset(firstNonObject, offsetBase, options.MemberExpression);
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
					handleFunctionCallIndent({ node, sourceCode, offsets, parameterParens, options });
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
				let keyLast;
				if (node.computed) {
					const leftBracket = sourceCode.getTokenBefore(node.key, astUtils.isOpeningBracketToken);
					const rightBracket = (keyLast = sourceCode.getTokenAfter(node.key, astUtils.isClosingBracketToken));
					const keyRange = [leftBracket.range[1], rightBracket.range[0]];
					if (leftBracket !== firstToken) {
						offsets.setDesiredOffset(leftBracket, firstToken, 0);
					}
					offsets.setDesiredOffsets(keyRange, leftBracket, 1);
					offsets.setDesiredOffset(rightBracket, leftBracket, 0);
				} else {
					const idToken = (keyLast = sourceCode.getFirstToken(node.key));
					if (idToken !== firstToken) {
						offsets.setDesiredOffset(idToken, firstToken, 1);
					}
				}
				if (node.value) {
					const eqToken = sourceCode.getTokenBefore(node.value, astUtils.isEqToken);
					const valueToken = sourceCode.getTokenAfter(eqToken);
					offsets.setDesiredOffset(eqToken, keyLast, 1);
					offsets.setDesiredOffset(valueToken, eqToken, 1);
					if (astUtils.isSemicolonToken(maybeSemicolon)) {
						offsets.setDesiredOffset(maybeSemicolon, eqToken, 1);
					}
				} else if (astUtils.isSemicolonToken(maybeSemicolon)) {
					offsets.setDesiredOffset(maybeSemicolon, keyLast, 1);
				}
			},
			StaticBlock(node) {
				const openingCurly = sourceCode.getFirstToken(node, { skip: 1 });
				const closingCurly = sourceCode.getLastToken(node);
				handleElementListIndent({
					elements: node.body,
					startToken: openingCurly,
					endToken: closingCurly,
					offset: options.StaticBlock.body,
					sourceCode,
					tokenInfo,
					offsets,
				});
			},
			SwitchStatement(node) {
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
						.forEach(tok => offsets.ignoreToken(tok));
				}
			},
			SwitchCase(node) {
				if (
					!(
						node.consequent.length === 1 &&
						node.consequent[0].type === "BlockStatement"
					)
				) {
					const caseKeyword = sourceCode.getFirstToken(node);
					const afterCase = sourceCode.getTokenAfter(node);
					offsets.setDesiredOffsets(
						[caseKeyword.range[1], afterCase.range[0]],
						caseKeyword,
						1,
					);
				}
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
			VariableDeclaration(node) {
				const varIndent = Object.hasOwn(options.VariableDeclarator, node.kind)
					? options.VariableDeclarator[node.kind]
					: DEFAULT_VARIABLE_INDENT;
				const firstToken = sourceCode.getFirstToken(node);
				const lastToken = sourceCode.getLastToken(node);
				if (options.VariableDeclarator[node.kind] === "first") {
					if (node.declarations.length > 1) {
						handleElementListIndent({
							elements: node.declarations,
							startToken: firstToken,
							endToken: lastToken,
							offset: "first",
							sourceCode,
							tokenInfo,
							offsets,
						});
						return;
					}
				}
				if (node.declarations.at(-1).loc.start.line > node.loc.start.line) {
					offsets.setDesiredOffsets(node.range, firstToken, varIndent, true);
				} else {
					offsets.setDesiredOffsets(node.range, firstToken, varIndent);
				}
				if (astUtils.isSemicolonToken(lastToken)) {
					offsets.ignoreToken(lastToken);
				}
			},
			VariableDeclarator(node) {
				if (node.init) {
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
			},
			"JSXAttribute[value]"(node) {
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
			},
			JSXElement(node) {
				if (node.closingElement) {
					handleElementListIndent({
						elements: node.children,
						startToken: sourceCode.getFirstToken(node.openingElement),
						endToken: sourceCode.getFirstToken(node.closingElement),
						offset: 1,
						sourceCode,
						tokenInfo,
						offsets,
					});
				}
			},
			JSXOpeningElement(node) {
				const first = sourceCode.getFirstToken(node);
				let closing;
				if (node.selfClosing) {
					closing = sourceCode.getLastToken(node, { skip: 1 });
					offsets.setDesiredOffset(sourceCode.getLastToken(node), closing, 0);
				} else {
					closing = sourceCode.getLastToken(node);
				}
				offsets.setDesiredOffsets(node.name.range, sourceCode.getFirstToken(node));
				handleElementListIndent({
					elements: node.attributes,
					startToken: first,
					endToken: closing,
					offset: 1,
					sourceCode,
					tokenInfo,
					offsets,
				});
			},
			JSXClosingElement(node) {
				const first = sourceCode.getFirstToken(node);
				offsets.setDesiredOffsets(node.name.range, first, 1);
			},
			JSXFragment(node) {
				const open = sourceCode.getFirstToken(node.openingFragment);
				const close = sourceCode.getFirstToken(node.closingFragment);
				handleElementListIndent({
					elements: node.children,
					startToken: open,
					endToken: close,
					offset: 1,
					sourceCode,
					tokenInfo,
					offsets,
				});
			},
			JSXOpeningFragment(node) {
				const first = sourceCode.getFirstToken(node);
				const closing = sourceCode.getLastToken(node);
				offsets.setDesiredOffsets(node.range, first, 1);
				offsets.matchOffsetOf(first, closing);
			},
			JSXClosingFragment(node) {
				const first = sourceCode.getFirstToken(node);
				const slash = sourceCode.getLastToken(node, { skip: 1 });
				const closing = sourceCode.getLastToken(node);
				const tokenToMatch = astUtils.isTokenOnSameLine(slash, closing) ? slash : closing;
				offsets.setDesiredOffsets(node.range, first, 1);
				offsets.matchOffsetOf(first, tokenToMatch);
			},
			JSXExpressionContainer(node) {
				const open = sourceCode.getFirstToken(node);
				const close = sourceCode.getLastToken(node);
				offsets.setDesiredOffsets(
					[open.range[1], close.range[0]],
					open,
					1,
				);
			},
			JSXSpreadAttribute(node) {
				const open = sourceCode.getFirstToken(node);
				const close = sourceCode.getLastToken(node);
				offsets.setDesiredOffsets(
					[open.range[1], close.range[0]],
					open,
					1,
				);
			},
			"*"(node) {
				const first = sourceCode.getFirstToken(node);
				if (first && !ignoredNodeFirstTokens.has(first)) {
					offsets.setDesiredOffsets(node.range, first, 0);
				}
			},
		};

		const listenerCallQueue = [];

		const offsetListeners = {};

		for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
			offsetListeners[selector] = node => listenerCallQueue.push({ listener, node });
		}

		const ignoredNodes = new Set();

		/**
		 * Adds a node to the ignored set.
		 * @param {ASTNode} node Node to ignore
		 */
		function addIgnoredNode(node) {
			ignoredNodes.add(node);
			ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
		}

		const ignoredNodeListeners = options.ignoredNodes.reduce(
			(acc, selector) => Object.assign(acc, { [selector]: addIgnoredNode }),
			{},
		);

		return Object.assign(offsetListeners, ignoredNodeListeners, {
			"*:exit"(node) {
				if (!KNOWN_NODES.has(node.type)) {
					addIgnoredNode(node);
				}
			},
			"Program:exit"() {
				if (options.ignoreComments) {
					sourceCode.getAllComments().forEach(comment => offsets.ignoreToken(comment));
				}
				for (let i = 0; i < listenerCallQueue.length; i++) {
					const { listener, node } = listenerCallQueue[i];
					if (!ignoredNodes.has(node)) {
						listener(node);
					}
				}
				ignoredNodes.forEach(node => ignoreNodeTokens(node, sourceCode, offsets));
				handleParensIndent(sourceCode.ast.tokens, sourceCode, offsets, parameterParens);
				const precedingTokens = new WeakMap();
				for (let i = 0; i < sourceCode.ast.comments.length; i++) {
					const comment = sourceCode.ast.comments[i];
					const before = sourceCode.getTokenBefore(comment, { includeComments: true });
					const has = precedingTokens.has(before) ? precedingTokens.get(before) : before;
					precedingTokens.set(comment, has);
				}
				for (let line = 1; line <= sourceCode.lines.length; line++) {
					if (!tokenInfo.firstTokensByLineNumber.has(line)) {
						continue;
					}
					const firstToken = tokenInfo.firstTokensByLineNumber.get(line);
					if (firstToken.loc.start.line !== line) {
						continue;
					}
					if (astUtils.isCommentToken(firstToken)) {
						const before = precedingTokens.get(firstToken);
						const after = before ? sourceCode.getTokenAfter(before) : sourceCode.ast.tokens[0];
						const canAlignBefore = before && !hasBlankLinesBetweenTokens(before, firstToken, tokenInfo);
						const canAlignAfter = after && !hasBlankLinesBetweenTokens(firstToken, after, tokenInfo);
						if (
							after &&
							astUtils.isSemicolonToken(after) &&
							!astUtils.isTokenOnSameLine(firstToken, after)
						) {
							offsets.setDesiredOffset(firstToken, after, 0);
						}
						if (
							(canAlignBefore && isIndentCorrect(tokenInfo, firstToken, offsets.getDesiredIndent(before))) ||
							(canAlignAfter && isIndentCorrect(tokenInfo, firstToken, offsets.getDesiredIndent(after)))
						) {
							continue;
						}
					}
					if (isIndentCorrect(tokenInfo, firstToken, offsets.getDesiredIndent(firstToken))) {
						continue;
					}
					reportIndent(context, tokenInfo, firstToken, offsets.getDesiredIndent(firstToken), indentType);
				}
			},
		});
	},
};
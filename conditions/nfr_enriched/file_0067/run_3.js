```javascript
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
 * A mutable map that stores (key, value) pairs with numeric indices.
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

		for (let index = key; index >= 0; index--) {
			const value = values[index];

			if (value) {
				return value;
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
					.slice(
						token.range[1] - token.loc.end.column,
						token.range[1],
					)
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
	 * @param {Token} baseToken The first token
	 * @param {Token} offsetToken The second token, whose offset should be matched to the first token
	 * @returns {void}
	 */
	matchOffsetOf(baseToken, offsetToken) {
		this._lockedFirstTokens.set(offsetToken, baseToken);
	}

	/**
	 * Sets the desired offset of a token.
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
	 * @param {[number, number]} range A [start, end] pair. All tokens with range[0] <= token.start < range[1] will have the offset applied.
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
			this._desiredIndentCache.set(
				token,
				this._computeDesiredIndent(token),
			);
		}
		return this._desiredIndentCache.get(token);
	}

	/**
	 * Computes the desired indent for a token
	 * @param {Token} token The token
	 * @returns {string} The desired indent of the token
	 */
	_computeDesiredIndent(token) {
		if (this._ignoredTokens.has(token)) {
			return this._tokenInfo.getTokenIndent(token);
		}

		if (this._lockedFirstTokens.has(token)) {
			return this._computeLockedIndent(token);
		}

		return this._computeOffsetIndent(token);
	}

	/**
	 * Computes indent for a token locked to a first element
	 * @param {Token} token The token
	 * @returns {string} The desired indent
	 */
	_computeLockedIndent(token) {
		const firstToken = this._lockedFirstTokens.get(token);
		const firstTokenOfLine = this._tokenInfo.getFirstTokenOfLine(firstToken);

		return (
			this.getDesiredIndent(firstTokenOfLine) +
			this._indentType.repeat(
				firstToken.loc.start.column -
					firstTokenOfLine.loc.start.column,
			)
		);
	}

	/**
	 * Computes indent for a token based on offset descriptor
	 * @param {Token} token The token
	 * @returns {string} The desired indent
	 */
	_computeOffsetIndent(token) {
		const offsetInfo = this._getOffsetDescriptor(token);
		const offset = this._calculateOffset(token, offsetInfo);

		return (
			(offsetInfo.from ? this.getDesiredIndent(offsetInfo.from) : "") +
			this._indentType.repeat(offset)
		);
	}

	/**
	 * Calculates the offset amount for a token
	 * @param {Token} token The token
	 * @param {Object} offsetInfo The offset descriptor
	 * @returns {number} The offset amount
	 */
	_calculateOffset(token, offsetInfo) {
		const isSameLine =
			offsetInfo.from &&
			offsetInfo.from.loc.start.line === token.loc.start.line;
		const isNewline = /^\s*?\n/u.test(token.value);

		if (isSameLine && !isNewline && !offsetInfo.force) {
			return 0;
		}

		return offsetInfo.offset * this._indentSize;
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

const ELEMENT_LIST_SCHEMA = {
	oneOf: [
		{
			type: "integer",
			minimum: 0,
		},
		{
			enum: ["first", "off"],
		},
	],
};

/** @type {import('../types').Rule.RuleModule} */
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
					{
						enum: ["tab"],
					},
					{
						type: "integer",
						minimum: 0,
					},
				],
			},
			{
				type: "object",
				properties: {
					SwitchCase: {
						type: "integer",
						minimum: 0,
						default: 0,
					},
					VariableDeclarator: {
						oneOf: [
							ELEMENT_LIST_SCHEMA,
							{
								type: "object",
								properties:
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

/*
 * General rule strategy:
 * 1. An OffsetStorage instance stores a map of desired offsets, where each token has a specified offset from another
 *    specified token or to the first column.
 * 2. As the AST is traversed, modify the desired offsets of tokens accordingly. For example, when entering a
 *    BlockStatement, offset all of the tokens in the BlockStatement by 1 indent level from the opening curly
 *    brace of the BlockStatement.
 * 3. After traversing the AST, calculate the expected indentation levels of every token according to the
 *    OffsetStorage container.
 * 4. For each line, compare the expected indentation of the first token to the actual indentation in the file,
 *    and report the token if the two values are not equal.
 */

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
		for (let i = key; i >= 0; i--) {
			const v = this._values[i];
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

		const fromInRange =
			fromToken &&
			fromToken.range[0] >= range[0] &&
			fromToken.range[1] <= range[1];
		const fromDescriptor = fromInRange && this._getOffsetDescriptor(fromToken);

		this._indexMap.deleteRange(range[0] + 1, range[1]);
		this._indexMap.insert(range[0], descriptorToInsert);

		if (fromInRange) {
			this._indexMap.insert(fromToken.range[0], fromDescriptor);
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
				const first = this._lockedFirstTokens.get(token);
				const baseIndent = this.getDesiredIndent(
					this._tokenInfo.getFirstTokenOfLine(first),
				);
				const extra = this._indentType.repeat(
					first.loc.start.column -
						this._tokenInfo.getFirstTokenOfLine(first).loc.start.column,
				);
				this._desiredIndentCache.set(token, baseIndent + extra);
			} else {
				const offsetInfo = this._getOffsetDescriptor(token);
				const collapse =
					offsetInfo.from &&
					offsetInfo.from.loc.start.line === token.loc.start.line &&
					!/^\s*?\n/u.test(token.value) &&
					!offsetInfo.force;
				const offset = collapse ? 0 : offsetInfo.offset * this._indentSize;
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
					SwitchCase: { type: "integer", minimum: 0, default: 0 },
					VariableDeclarator: {
						oneOf: [
							ELEMENT_LIST_SCHEMA,
							{
								type: "object",
								properties: {
									var: ELEMENT_LIST_SCHEMA,
									let: ELEMENT_LIST_SCHEMA,
									const: ELEMENT_LIST_SCHEMA,
								},
								additionalProperties: false,
							},
						],
					},
					outerIIFEBody: {
						oneOf: [{ type: "integer", minimum: 0 }, { enum: ["off"] }],
					},
					MemberExpression: {
						oneOf: [{ type: "integer", minimum: 0 }, { enum: ["off"] }],
					},
					FunctionDeclaration: {
						type: "object",
						properties: {
							parameters: ELEMENT_LIST_SCHEMA,
							body: { type: "integer", minimum: 0 },
						},
						additionalProperties: false,
					},
					FunctionExpression: {
						type: "object",
						properties: {
							parameters: ELEMENT_LIST_SCHEMA,
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
							arguments: ELEMENT_LIST_SCHEMA,
						},
						additionalProperties: false,
					},
					ArrayExpression: ELEMENT_LIST_SCHEMA,
					ObjectExpression: ELEMENT_LIST_SCHEMA,
					ImportDeclaration: ELEMENT_LIST_SCHEMA,
					flatTernaryExpressions: { type: "boolean", default: false },
					offsetTernaryExpressions: { type: "boolean", default: false },
					ignoredNodes: {
						type: "array",
						items: { type: "string", not: { pattern: ":exit$" } },
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
			StaticBlock: { body: DEFAULT_FUNCTION_BODY_INDENT },
			CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
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

		/** @type {Set<ASTNode>} */
		const ignoredNodes = new Set();
		/** @type {Set<Token>} */
		const ignoredNodeFirstTokens = new Set();

		/** @type {{listener: Function, node: ASTNode}[]} */
		const listenerCallQueue = [];

		// ----------------------------------------------------------------------
		// Helper predicates
		// ----------------------------------------------------------------------

		/**
		 * Checks if a node is the outermost IIFE.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function isOuterIIFE(node) {
			if (!node.parent || node.parent.type !== "CallExpression" || node.parent.callee !== node) {
				return false;
			}
			let stmt = node.parent.parent;
			while (stmt) {
				if (
					(stmt.type === "UnaryExpression" && ["!", "~", "+", "-"].includes(stmt.operator)) ||
					stmt.type === "AssignmentExpression" ||
					stmt.type === "LogicalExpression" ||
					stmt.type === "SequenceExpression" ||
					stmt.type === "VariableDeclarator"
				) {
					stmt = stmt.parent;
				} else {
					break;
				}
			}
			return (
				(stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
				stmt.parent.type === "Program"
			);
		}

		/**
		 * Returns true if the token is on the first line of its statement.
		 * @param {Token} token
		 * @param {ASTNode} leafNode
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
		 * Returns true if there are blank lines between two tokens.
		 * @param {Token} firstToken
		 * @param {Token} secondToken
		 * @returns {boolean}
		 */
		function hasBlankLinesBetween(firstToken, secondToken) {
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
		 * Counts trailing linebreaks in a string.
		 * @param {string} str
		 * @returns {number}
		 */
		function countTrailingLinebreaks(str) {
			const trailing = str.match(/\s*$/u)[0];
			const matches = trailing.match(astUtils.createGlobalLinebreakMatcher());
			return matches ? matches.length : 0;
		}

		/**
		 * Creates an error message data object.
		 * @param {number} expectedAmount
		 * @param {number} actualSpaces
		 * @param {number} actualTabs
		 * @returns {{expected:string,actual:string}}
		 */
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
			const expected = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			if (actualSpaces > 0) {
				const found = indentType === "space" ? actualSpaces : `${actualSpaces} space${actualSpaces === 1 ? "" : "s"}`;
				return { expected, actual: found };
			}
			if (actualTabs > 0) {
				const found = indentType === "tab" ? actualTabs : `${actualTabs} tab${actualTabs === 1 ? "" : "s"}`;
				return { expected, actual: found };
			}
			return { expected, actual: "0" };
		}

		/**
		 * Reports an indentation violation.
		 * @param {Token} token
		 * @param {string} neededIndent
		 */
		function report(token, neededIndent) {
			const actualIndent = Array.from(tokenInfo.getTokenIndent(token));
			const spaces = actualIndent.filter(c => c === " ").length;
			const tabs = actualIndent.filter(c => c === "\t").length;
			context.report({
				node: token,
				messageId: "wrongIndentation",
				data: createErrorMessageData(neededIndent.length, spaces, tabs),
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
		 * Validates token indentation.
		 * @param {Token} token
		 * @param {string} desiredIndent
		 * @returns {boolean}
		 */
		function validateTokenIndent(token, desiredIndent) {
			const actual = tokenInfo.getTokenIndent(token);
			return (
				actual === desiredIndent ||
				(actual.includes(" ") && actual.includes("\t"))
			);
		}

		/**
		 * Adds indentation for element lists (arrays, objects, etc.).
		 * @param {ASTNode[]} elements
		 * @param {Token} startToken
		 * @param {Token} endToken
		 * @param {number|string} offset
		 */
		function addElementListIndent(elements, startToken, endToken, offset) {
			function getFirstToken(element) {
				let token = sourceCode.getTokenBefore(element);
				while (astUtils.isOpeningParenToken(token) && token !== startToken) {
					token = sourceCode.getTokenBefore(token);
				}
				return sourceCode.getTokenAfter(token);
			}
			offsets.setDesiredOffsets([startToken.range[1], endToken.range[0]], startToken, typeof offset === "number" ? offset : 1);
			offsets.setDesiredOffset(endToken, startToken, 0);
			if (offset === "first" && elements.length && !elements[0]) {
				return;
			}
			elements.forEach((el, idx) => {
				if (!el) {
					return;
				}
				if (offset === "off") {
					offsets.ignoreToken(getFirstToken(el));
				}
				if (idx === 0) {
					return;
				}
				if (offset === "first" && tokenInfo.isFirstTokenOfLine(getFirstToken(el))) {
					offsets.matchOffsetOf(getFirstToken(elements[0]), getFirstToken(el));
				} else {
					const prev = elements[idx - 1];
					const prevFirst = prev && getFirstToken(prev);
					const prevLast = prev && sourceCode.getLastToken(prev);
					if (
						prev &&
						prevLast.loc.end.line -
							countTrailingLinebreaks(prevLast.value) >
							startToken.loc.end.line
					) {
						offsets.setDesiredOffsets([prev.range[1], el.range[1]], prevFirst, 0);
					}
				}
			});
		}

		/**
		 * Adds indentation for blockless nodes.
		 * @param {ASTNode} node
		 */
		function addBlocklessNodeIndent(node) {
			if (node.type === "BlockStatement") {
				return;
			}
			const lastParentToken = sourceCode.getTokenBefore(node, astUtils.isNotOpeningParenToken);
			let firstBodyToken = sourceCode.getFirstToken(node);
			let lastBodyToken = sourceCode.getLastToken(node);
			while (
				astUtils.isOpeningParenToken(sourceCode.getTokenBefore(firstBodyToken)) &&
				astUtils.isClosingParenToken(sourceCode.getTokenAfter(lastBodyToken))
			) {
				firstBodyToken = sourceCode.getTokenBefore(firstBodyToken);
				lastBodyToken = sourceCode.getTokenAfter(lastBodyToken);
			}
			offsets.setDesiredOffsets([firstBodyToken.range[0], lastBodyToken.range[1]], lastParentToken, 1);
		}

		/**
		 * Adds indentation for function calls.
		 * @param {ASTNode} node
		 */
		function addFunctionCallIndent(node) {
			let openingParen;
			if (node.arguments.length) {
				openingParen = sourceCode.getFirstTokenBetween(node.callee, node.arguments[0], astUtils.isOpeningParenToken);
			} else {
				openingParen = sourceCode.getLastToken(node, 1);
			}
			const closingParen = sourceCode.getLastToken(node);
			parameterParens.add(openingParen);
			parameterParens.add(closingParen);
			if (node.optional) {
				const dotToken = sourceCode.getTokenAfter(node.callee, astUtils.isQuestionDotToken);
				const calleeParenCount = sourceCode.getTokensBetween(node.callee, dotToken, { filter: astUtils.isClosingParenToken }).length;
				const firstCallee = calleeParenCount
					? sourceCode.getTokenBefore(node.callee, { skip: calleeParenCount - 1 })
					: sourceCode.getFirstToken(node.callee);
				const lastCallee = sourceCode.getTokenBefore(dotToken);
				const offsetBase = lastCallee.loc.end.line === openingParen.loc.start.line ? lastCallee : firstCallee;
				offsets.setDesiredOffset(dotToken, offsetBase, 1);
			}
			const offsetAfter = node.callee.type === "TaggedTemplateExpression"
				? sourceCode.getFirstToken(node.callee.quasi)
				: openingParen;
			const offsetToken = sourceCode.getTokenBefore(offsetAfter);
			offsets.setDesiredOffset(openingParen, offsetToken, 0);
			addElementListIndent(node.arguments, openingParen, closingParen, options.CallExpression.arguments);
		}

		/**
		 * Adds indentation for parentheses.
		 * @param {Token[]} tokens
		 */
		function addParensIndent(tokens) {
			const stack = [];
			const pairs = [];
			for (let i = 0; i < tokens.length; i++) {
				const t = tokens[i];
				if (astUtils.isOpeningParenToken(t)) {
					stack.push(t);
				} else if (astUtils.isClosingParenToken(t)) {
					const left = stack.pop();
					pairs.push({ left, right: t });
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
		 * Ignores a node and its children.
		 * @param {ASTNode} node
		 */
		function ignoreNode(node) {
			const nodeTokens = new Set(sourceCode.getTokens(node, { includeComments: true }));
			nodeTokens.forEach(tok => {
				if (!nodeTokens.has(offsets.getFirstDependency(tok))) {
					const first = tokenInfo.getFirstTokenOfLine(tok);
					if (tok === first) {
						offsets.ignoreToken(tok);
					} else {
						offsets.setDesiredOffset(tok, first, 0);
					}
				}
			});
		}

		/**
		 * Adds a node to the ignored set.
		 * @param {ASTNode} node
		 */
		function addToIgnoredNodes(node) {
			ignoredNodes.add(node);
			ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
		}

		/**
		 * Handles the final validation after traversal.
		 */
		function finalize() {
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
			validateLines();
		}

		/**
		 * Validates each line's indentation.
		 */
		function validateLines() {
			const precedingTokens = new WeakMap();
			const comments = sourceCode.ast.comments;
			for (let i = 0; i < comments.length; i++) {
				const comment = comments[i];
				const before = sourceCode.getTokenBefore(comment, { includeComments: true });
				precedingTokens.set(comment, before || comment);
			}
			const totalLines = sourceCode.lines.length;
			for (let line = 1; line <= totalLines; line++) {
				if (!tokenInfo.firstTokensByLineNumber.has(line)) {
					continue;
				}
				const firstToken = tokenInfo.firstTokensByLineNumber.get(line);
				if (firstToken.loc.start.line !== line) {
					continue;
				}
				if (astUtils.isCommentToken(firstToken)) {
					if (handleCommentLine(firstToken, precedingTokens)) {
						continue;
					}
				}
				if (validateTokenIndent(firstToken, offsets.getDesiredIndent(firstToken))) {
					continue;
				}
				report(firstToken, offsets.getDesiredIndent(firstToken));
			}
		}

		/**
		 * Handles comment line validation.
		 * @param {Token} commentToken
		 * @param {WeakMap} precedingTokens
		 * @returns {boolean} true if the comment should be ignored
		 */
		function handleCommentLine(commentToken, precedingTokens) {
			const before = precedingTokens.get(commentToken);
			const after = before ? sourceCode.getTokenAfter(before) : sourceCode.ast.tokens[0];
			const canAlignBefore = before && !hasBlankLinesBetween(before, commentToken);
			const canAlignAfter = after && !hasBlankLinesBetween(commentToken, after);
			if (
				after &&
				astUtils.isSemicolonToken(after) &&
				!astUtils.isTokenOnSameLine(commentToken, after)
			) {
				offsets.setDesiredOffset(commentToken, after, 0);
			}
			if (
				(canAlignBefore && validateTokenIndent(commentToken, offsets.getDesiredIndent(before))) ||
				(canAlignAfter && validateTokenIndent(commentToken, offsets.getDesiredIndent(after)))
			) {
				return true;
			}
			return false;
		}

		// ----------------------------------------------------------------------
		// Base offset listeners (deferred)
		// ----------------------------------------------------------------------
		const baseOffsetListeners = {
			"ArrayExpression, ArrayPattern"(node) {
				const opening = sourceCode.getFirstToken(node);
				const closing = sourceCode.getTokenAfter(
					[...node.elements].reverse().find(e => e) || opening,
					astUtils.isClosingBracketToken,
				);
				addElementListIndent(node.elements, opening, closing, options.ArrayExpression);
			},
			"ObjectExpression, ObjectPattern"(node) {
				const opening = sourceCode.getFirstToken(node);
				const closing = sourceCode.getTokenAfter(
					node.properties.length ? node.properties.at(-1) : opening,
					astUtils.isClosingBraceToken,
				);
				addElementListIndent(node.properties, opening, closing, options.ObjectExpression);
			},
			ArrowFunctionExpression(node) {
				const maybeParen = sourceCode.getFirstToken(node, { skip: node.async ? 1 : 0 });
				if (astUtils.isOpeningParenToken(maybeParen)) {
					const opening = maybeParen;
					const closing = sourceCode.getTokenBefore(node.body, astUtils.isClosingParenToken);
					parameterParens.add(opening);
					parameterParens.add(closing);
					addElementListIndent(node.params, opening, closing, options.FunctionExpression.parameters);
				}
				addBlocklessNodeIndent(node.body);
			},
			AssignmentExpression(node) {
				const operator = sourceCode.getFirstTokenBetween(node.left, node.right, t => t.value === node.operator);
				offsets.setDesiredOffsets([operator.range[0], node.range[1]], sourceCode.getLastToken(node.left), 1);
				offsets.ignoreToken(operator);
				offsets.ignoreToken(sourceCode.getTokenAfter(operator));
			},
			"BinaryExpression, LogicalExpression"(node) {
				const operator = sourceCode.getFirstTokenBetween(node.left, node.right, t => t.value === node.operator);
				const after = sourceCode.getTokenAfter(operator);
				offsets.ignoreToken(operator);
				offsets.ignoreToken(after);
				offsets.setDesiredOffset(after, operator, 0);
			},
			"BlockStatement, ClassBody"(node) {
				let indentLevel;
				if (node.parent && isOuterIIFE(node.parent)) {
					indentLevel = options.outerIIFEBody;
				} else if (node.parent && (node.parent.type === "FunctionExpression" || node.parent.type === "ArrowFunctionExpression")) {
					indentLevel = options.FunctionExpression.body;
				} else if (node.parent && node.parent.type === "FunctionDeclaration") {
					indentLevel = options.FunctionDeclaration.body;
				} else {
					indentLevel = 1;
				}
				if (!astUtils.STATEMENT_LIST_PARENTS.has(node.parent.type)) {
					offsets.setDesiredOffset(sourceCode.getFirstToken(node), sourceCode.getFirstToken(node.parent), 0);
				}
				addElementListIndent(node.body, sourceCode.getFirstToken(node), sourceCode.getLastToken(node), indentLevel);
			},
			CallExpression: addFunctionCallIndent,
			"ClassDeclaration[superClass], ClassExpression[superClass]"(node) {
				const classTok = sourceCode.getFirstToken(node);
				const extendsTok = sourceCode.getTokenBefore(node.superClass, astUtils.isNotOpeningParenToken);
				offsets.setDesiredOffsets([extendsTok.range[0], node.body.range[0]], classTok, 1);
			},
			ConditionalExpression(node) {
				const firstTok = sourceCode.getFirstToken(node);
				if (
					!options.flatTernaryExpressions ||
					!astUtils.isTokenOnSameLine(node.test, node.consequent) ||
					isOnFirstLineOfStatement(firstTok, node)
				) {
					const q = sourceCode.getFirstTokenBetween(node.test, node.consequent, t => t.type === "Punctuator" && t.value === "?");
					const c = sourceCode.getFirstTokenBetween(node.consequent, node.alternate, t => t.type === "Punctuator" && t.value === ":");
					const firstCons = sourceCode.getTokenAfter(q);
					const lastCons = sourceCode.getTokenBefore(c);
					const firstAlt = sourceCode.getTokenAfter(c);
					offsets.setDesiredOffset(q, firstTok, 1);
					offsets.setDesiredOffset(c, firstTok, 1);
					const consIndent = firstCons.type === "Punctuator" && options.offsetTernaryExpressions ? 2 : 1;
					offsets.setDesiredOffset(firstCons, firstTok, consIndent);
					if (lastCons.loc.end.line === firstAlt.loc.start.line) {
						offsets.setDesiredOffset(firstAlt, firstCons, 0);
					} else {
						const altIndent = firstAlt.type === "Punctuator" && options.offsetTernaryExpressions ? 2 : 1;
						offsets.setDesiredOffset(firstAlt, firstTok, altIndent);
					}
				}
			},
			"DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement"(node) {
				addBlocklessNodeIndent(node.body);
			},
			ExportNamedDeclaration(node) {
				if (!node.declaration) {
					const closing = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);
					addElementListIndent(node.specifiers, sourceCode.getFirstToken(node, { skip: 1 }), closing, 1);
					if (node.source) {
						offsets.setDesiredOffsets([closing.range[1], node.range[1]], sourceCode.getFirstToken(node), 1);
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
				const openingParen = sourceCode.getTokenBefore(node.params.length ? node.params[0] : closingParen);
				parameterParens.add(openingParen);
				parameterParens.add(closingParen);
				addElementListIndent(node.params, openingParen, closingParen, options[node.type].parameters);
			},
			IfStatement(node) {
				addBlocklessNodeIndent(node.consequent);
				if (node.alternate) {
					addBlocklessNodeIndent(node.alternate);
				}
			},
			":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(node) {
				const toCheck = node.type === "IfStatement"
					? [node.consequent, node.alternate].filter(Boolean)
					: [node.body];
				toCheck.forEach(bodyNode => {
					const last = sourceCode.getLastToken(bodyNode);
					if (astUtils.isSemicolonToken(last)) {
						const before = sourceCode.getTokenBefore(last);
						const after = sourceCode.getTokenAfter(last);
						if (
							!astUtils.isTokenOnSameLine(before, last) &&
							after &&
							astUtils.isTokenOnSameLine(last, after)
						) {
							offsets.setDesiredOffset(last, sourceCode.getFirstToken(node), 0);
						}
					}
				});
			},
			ImportDeclaration(node) {
				if (node.specifiers.some(s => s.type === "ImportSpecifier")) {
					const opening = sourceCode.getFirstToken(node, astUtils.isOpeningBraceToken);
					const closing = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);
					addElementListIndent(
						node.specifiers.filter(s => s.type === "ImportSpecifier"),
						opening,
						closing,
						options.ImportDeclaration,
					);
				}
				const fromTok = sourceCode.getLastToken(node, t => t.type === "Identifier" && t.value === "from");
				const sourceTok = sourceCode.getLastToken(node, t => t.type === "String");
				const semi = sourceCode.getLastToken(node, t => t.type === "Punctuator" && t.value === ";");
				if (fromTok) {
					const end = semi && semi.range[1] === sourceTok.range[1] ? node.range[1] : sourceTok.range[1];
					offsets.setDesiredOffsets([fromTok.range[0], end], sourceCode.getFirstToken(node), 1);
				}
			},
			ImportExpression(node) {
				const opening = sourceCode.getFirstToken(node, 1);
				const closing = sourceCode.getLastToken(node);
				parameterParens.add(opening);
				parameterParens.add(closing);
				offsets.setDesiredOffset(opening, sourceCode.getTokenBefore(opening), 0);
				addElementListIndent([node.source], opening, closing, options.CallExpression.arguments);
			},
			"MemberExpression, JSXMemberExpression, MetaProperty"(node) {
				const object = node.type === "MetaProperty" ? node.meta : node.object;
				const firstNonObj = sourceCode.getFirstTokenBetween(object, node.property, astUtils.isNotClosingParenToken);
				const secondNonObj = sourceCode.getTokenAfter(firstNonObj);
				const objParenCount = sourceCode.getTokensBetween(object, node.property, { filter: astUtils.isClosingParenToken }).length;
				const firstObj = objParenCount ? sourceCode.getTokenBefore(object, { skip: objParenCount - 1 }) : sourceCode.getFirstToken(object);
				const lastObj = sourceCode.getTokenBefore(firstNonObj);
				const firstProp = node.computed ? firstNonObj : secondNonObj;
				if (node.computed) {
					offsets.setDesiredOffset(sourceCode.getLastToken(node), firstNonObj, 0);
					offsets.setDesiredOffsets(node.property.range, firstNonObj, 1);
				}
				const base = lastObj.loc.end.line === firstProp.loc.start.line ? lastObj : firstObj;
				if (typeof options.MemberExpression === "number") {
					offsets.setDesiredOffset(firstNonObj, base, options.MemberExpression);
					offsets.setDesiredOffset(secondNonObj, node.computed ? firstNonObj : base, options.MemberExpression);
				} else {
					offsets.ignoreToken(firstNonObj);
					offsets.ignoreToken(secondNonObj);
					offsets.setDesiredOffset(firstNonObj, base, 0);
					offsets.setDesiredOffset(secondNonObj, firstNonObj, 0);
				}
			},
			NewExpression(node) {
				if (
					node.arguments.length > 0 ||
					(astUtils.isClosingParenToken(sourceCode.getLastToken(node)) &&
						astUtils.isOpeningParenToken(sourceCode.getLastToken(node, 1)))
				) {
					addFunctionCallIndent(node);
				}
			},
			Property(node) {
				if (!node.shorthand && !node.method && node.kind === "init") {
					const colon = sourceCode.getFirstTokenBetween(node.key, node.value, astUtils.isColonToken);
					offsets.ignoreToken(sourceCode.getTokenAfter(colon));
				}
			},
			PropertyDefinition(node) {
				const first = sourceCode.getFirstToken(node);
				const maybeSemi = sourceCode.getLastToken(node);
				let keyLast;
				if (node.computed) {
					const lBracket = sourceCode.getTokenBefore(node.key, astUtils.isOpeningBracketToken);
					const rBracket = (keyLast = sourceCode.getTokenAfter(node.key, astUtils.isClosingBracketToken));
					const range = [lBracket.range[1], rBracket.range[0]];
					if (lBracket !== first) {
						offsets.setDesiredOffset(lBracket, first, 0);
					}
					offsets.setDesiredOffsets(range, lBracket, 1);
					offsets.setDesiredOffset(rBracket, lBracket, 0);
				} else {
					const id = (keyLast = sourceCode.getFirstToken(node.key));
					if (id !== first) {
						offsets.setDesiredOffset(id, first, 1);
					}
				}
				if (node.value) {
					const eq = sourceCode.getTokenBefore(node.value, astUtils.isEqToken);
					const val = sourceCode.getTokenAfter(eq);
					offsets.setDesiredOffset(eq, keyLast, 1);
					offsets.setDesiredOffset(val, eq, 1);
					if (astUtils.isSemicolonToken(maybeSemi)) {
						offsets.setDesiredOffset(maybeSemi, eq, 1);
					}
				} else if (astUtils.isSemicolonToken(maybeSemi)) {
					offsets.setDesiredOffset(maybeSemi, keyLast, 1);
				}
			},
			StaticBlock(node) {
				const opening = sourceCode.getFirstToken(node, { skip: 1 });
				const closing = sourceCode.getLastToken(node);
				addElementListIndent(node.body, opening, closing, options.StaticBlock.body);
			},
			SwitchStatement(node) {
				const opening = sourceCode.getTokenAfter(node.discriminant, astUtils.isOpeningBraceToken);
				const closing = sourceCode.getLastToken(node);
				offsets.setDesiredOffsets([opening.range[1], closing.range[0]], opening, options.SwitchCase);
				if (node.cases.length) {
					sourceCode
						.getTokensBetween(node.cases.at(-1), closing, { includeComments: true, filter: astUtils.isCommentToken })
						.forEach(tok => offsets.ignoreToken(tok));
				}
			},
			SwitchCase(node) {
				if (!(node.consequent.length === 1 && node.consequent[0].type === "BlockStatement")) {
					const caseKw = sourceCode.getFirstToken(node);
					const after = sourceCode.getTokenAfter(node);
					offsets.setDesiredOffsets([caseKw.range[1], after.range[0]], caseKw, 1);
				}
			},
			TemplateLiteral(node) {
				node.expressions.forEach((expr, idx) => {
					const prevQuasi = node.quasis[idx];
					const nextQuasi = node.quasis[idx + 1];
					const alignFrom = prevQuasi.loc.start.line === prevQuasi.loc.end.line ? sourceCode.getFirstToken(prevQuasi) : null;
					offsets.setDesiredOffsets([prevQuasi.range[1], nextQuasi.range[0]], alignFrom, 1);
					offsets.setDesiredOffset(sourceCode.getFirstToken(nextQuasi), alignFrom, 0);
				});
			},
			VariableDeclaration(node) {
				const varIndent = Object.hasOwn(options.VariableDeclarator, node.kind)
					? options.VariableDeclarator[node.kind]
					: DEFAULT_VARIABLE_INDENT;
				const first = sourceCode.getFirstToken(node);
				const last = sourceCode.getLastToken(node);
				if (options.VariableDeclarator[node.kind] === "first") {
					if (node.declarations.length > 1) {
						addElementListIndent(node.declarations, first, last, "first");
						return;
					}
				}
				if (node.declarations.at(-1).loc.start.line > node.loc.start.line) {
					offsets.setDesiredOffsets(node.range, first, varIndent, true);
				} else {
					offsets.setDesiredOffsets(node.range, first, varIndent);
				}
				if (astUtils.isSemicolonToken(last)) {
					offsets.ignoreToken(last);
				}
			},
			VariableDeclarator(node) {
				if (node.init) {
					const eq = sourceCode.getTokenBefore(node.init, astUtils.isNotOpeningParenToken);
					const afterEq = sourceCode.getTokenAfter(eq);
					offsets.ignoreToken(eq);
					offsets.ignoreToken(afterEq);
					offsets.setDesiredOffsets([afterEq.range[0], node.range[1]], eq, 1);
					offsets.setDesiredOffset(eq, sourceCode.getLastToken(node.id), 0);
				}
			},
			"JSXAttribute[value]"(node) {
				const eq = sourceCode.getFirstTokenBetween(node.name, node.value, t => t.type === "Punctuator" && t.value === "=");
				offsets.setDesiredOffsets([eq.range[0], node.value.range[1]], sourceCode.getFirstToken(node.name), 1);
			},
			JSXElement(node) {
				if (node.closingElement) {
					addElementListIndent(node.children, sourceCode.getFirstToken(node.openingElement), sourceCode.getFirstToken(node.closingElement), 1);
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
				addElementListIndent(node.attributes, first, closing, 1);
			},
			JSXClosingElement(node) {
				const first = sourceCode.getFirstToken(node);
				offsets.setDesiredOffsets(node.name.range, first, 1);
			},
			JSXFragment(node) {
				const open = sourceCode.getFirstToken(node.openingFragment);
				const close = sourceCode.getFirstToken(node.closingFragment);
				addElementListIndent(node.children, open, close, 1);
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
				offsets.setDesiredOffsets([open.range[1], close.range[0]], open, 1);
			},
			JSXSpreadAttribute(node) {
				const open = sourceCode.getFirstToken(node);
				const close = sourceCode.getLastToken(node);
				offsets.setDesiredOffsets([open.range[1], close.range[0]], open, 1);
			},
			"*"(node) {
				const first = sourceCode.getFirstToken(node);
				if (first && !ignoredNodeFirstTokens.has(first)) {
					offsets.setDesiredOffsets(node.range, first, 0);
				}
			},
		};

		// ----------------------------------------------------------------------
		// Deferred listener registration
		// ----------------------------------------------------------------------
		const offsetListeners = {};
		for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
			offsetListeners[selector] = node => listenerCallQueue.push({ listener, node });
		}

		const ignoredNodeListeners = options.ignoredNodes.reduce((acc, sel) => {
			acc[sel] = addToIgnoredNodes;
			return acc;
		}, {});

		return Object.assign(offsetListeners, ignoredNodeListeners, {
			"*:exit"(node) {
				if (!KNOWN_NODES.has(node.type)) {
					addToIgnoredNodes(node);
				}
			},
			"Program:exit"() {
				finalize();
			},
		});
	},
};
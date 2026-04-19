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
	 * @param {[number, number]} range A [start, end] pair. All tokens with range[0] <= token.start < range[1] will have the offset applied.
	 * @param {Token} fromToken The token that this is offset from
	 * @param {number} offset The desired indent level
	 * @param {boolean} force `true` if this offset should not use the normal collapsing behavior. This should almost always be false.
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

				this._desiredIndentCache.set(
					token,
					this.getDesiredIndent(
						this._tokenInfo.getFirstTokenOfLine(firstToken),
					) +
						this._indentType.repeat(
							firstToken.loc.start.column -
								this._tokenInfo.getFirstTokenOfLine(firstToken)
									.loc.start.column,
						),
				);
			} else {
				const offsetInfo = this._getOffsetDescriptor(token);
				const offset =
					offsetInfo.from &&
					offsetInfo.from.loc.start.line === token.loc.start.line &&
					!/^\s*?\n/u.test(token.value) &&
					!offsetInfo.force
						? 0
						: offsetInfo.offset * this._indentSize;

				this._desiredIndentCache.set(
					token,
					(offsetInfo.from
						? this.getDesiredIndent(offsetInfo.from)
						: "") + this._indentType.repeat(offset),
				);
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
						oneOf: [
							{
								type: "integer",
								minimum: 0,
							},
							{
								enum: ["off"],
							},
						],
					},
					MemberExpression: {
						oneOf: [
							{
								type: "integer",
								minimum: 0,
							},
							{
								enum: ["off"],
							},
						],
					},
					FunctionDeclaration: {
						type: "object",
						properties: {
							parameters: ELEMENT_LIST_SCHEMA,
							body: {
								type: "integer",
								minimum: 0,
							},
						},
						additionalProperties: false,
					},
					FunctionExpression: {
						type: "object",
						properties: {
							parameters: ELEMENT_LIST_SCHEMA,
							body: {
								type: "integer",
								minimum: 0,
							},
						},
						additionalProperties: false,
					},
					StaticBlock: {
						type: "object",
						properties: {
							body: {
								type: "integer",
								minimum: 0,
							},
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
					flatTernaryExpressions: {
						type: "boolean",
						default: false,
					},
					offsetTernaryExpressions: {
						type: "boolean",
						default: false,
					},
					ignoredNodes: {
						type: "array",
						items: {
							type: "string",
							not: {
								pattern: ":exit$",
							},
						},
					},
					ignoreComments: {
						type: "boolean",
						default: false,
					},
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
		 * Creates an error message for a line, given the expected/actual indentation.
		 * @param {number} expectedAmount The expected amount of indentation characters for this line
		 * @param {number} actualSpaces The actual number of indentation spaces that were found on this line
		 * @param {number} actualTabs The actual number of indentation tabs that were found on this line
		 * @returns {string} An error message for this line
		 */
		function createErrorMessageData(
			expectedAmount,
			actualSpaces,
			actualTabs,
		) {
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
			return {
				expected: expectedStatement,
				actual: foundStatement,
			};
		}

		/**
		 * Reports a given indent violation
		 * @param {Token} token Token violating the indent rule
		 * @param {string} neededIndent Expected indentation string
		 * @returns {void}
		 */
		function report(token, neededIndent) {
			const actualIndent = Array.from(tokenInfo.getTokenIndent(token));
			const numSpaces = actualIndent.filter(char => char === " ").length;
			const numTabs = actualIndent.filter(char => char === "\t").length;

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
					const newText = neededIndent;

					return fixer.replaceTextRange(range, newText);
				},
			});
		}

		/**
		 * Checks if a token's indentation is correct
		 * @param {Token} token Token to examine
		 * @param {string} desiredIndent Desired indentation of the string
		 * @returns {boolean} `true` if the token's indentation is correct
		 */
		function validateTokenIndent(token, desiredIndent) {
			const indentation = tokenInfo.getTokenIndent(token);

			return (
				indentation === desiredIndent ||
				(indentation.includes(" ") && indentation.includes("\t"))
			);
		}

		/**
		 * Check to see if the node is a file level IIFE
		 * @param {ASTNode} node The function node to check.
		 * @returns {boolean} True if the node is the outer IIFE
		 */
		function isOuterIIFE(node) {
			if (
				!node.parent ||
				node.parent.type !== "CallExpression" ||
				node.parent.callee !== node
			) {
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
		 * Counts the number of linebreaks that follow the last non-whitespace character in a string
		 * @param {string} string The string to check
		 * @returns {number} The number of JavaScript linebreaks that follow the last non-whitespace character,
		 * or the total number of linebreaks if the string is all whitespace.
		 */
		function countTrailingLinebreaks(string) {
			const trailingWhitespace = string.match(/\s*$/u)[0];
			const linebreakMatches = trailingWhitespace.match(
				astUtils.createGlobalLinebreakMatcher(),
			);

			return linebreakMatches === null ? 0 : linebreakMatches.length;
		}

		/**
		 * Check indentation for lists of elements (arrays, objects, function params)
		 * @param {ASTNode[]} elements List of elements that should be offset
		 * @param {Token} startToken The start token of the list that element should be aligned against, e.g. '['
		 * @param {Token} endToken The end token of the list, e.g. ']'
		 * @param {number|string} offset The amount that the elements should be offset
		 * @returns {void}
		 */
		function addElementListIndent(elements, startToken, endToken, offset) {
			function getFirstToken(element) {
				let token = sourceCode.getTokenBefore(element);

				while (
					astUtils.isOpeningParenToken(token) &&
					token !== startToken
				) {
					token = sourceCode.getTokenBefore(token);
				}
				return sourceCode.getTokenAfter(token);
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
					const previousElement = elements[index - 1];
					const firstTokenOfPreviousElement =
						previousElement && getFirstToken(previousElement);
					const previousElementLastToken =
						previousElement &&
						sourceCode.getLastToken(previousElement);

					if (
						previousElement &&
						previousElementLastToken.loc.end.line -
							countTrailingLinebreaks(
								previousElementLastToken.value,
							) >
							startToken.loc.end.line
					) {
						offsets.setDesiredOffsets(
							[previousElement.range[1], element.range[1]],
							firstTokenOfPreviousElement,
							0,
						);
					}
				}
			});
		}

		/**
		 * Check indentation for nodes that are like function calls (`CallExpression` and `NewExpression`)
		 * @param {ASTNode} node A CallExpression or NewExpression node
		 * @returns {void}
		 */
		function addFunctionCallIndent(node) {
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
				const firstTokenOfCallee = calleeParenCount
					? sourceCode.getTokenBefore(node.callee, {
							skip: calleeParenCount - 1,
						})
					: sourceCode.getFirstToken(node.callee);
				const lastTokenOfCallee = sourceCode.getTokenBefore(dotToken);
				const offsetBase =
					lastTokenOfCallee.loc.end.line ===
					openingParen.loc.start.line
						? lastTokenOfCallee
						: firstTokenOfCallee;

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
		 * Checks the indentation of parenthesized values, given a list of tokens in a program
		 * @param {Token[]} tokens A list of tokens
		 * @returns {void}
		 */
		function addParensIndent(tokens) {
			const parenStack = [];
			const parenPairs = [];

			for (let i = 0; i < tokens.length; i++) {
				const nextToken = tokens[i];

				if (astUtils.isOpeningParenToken(nextToken)) {
					parenStack.push(nextToken);
				} else if (astUtils.isClosingParenToken(nextToken)) {
					parenPairs.push({
						left: parenStack.pop(),
						right: nextToken,
					});
				}
			}

			for (let i = parenPairs.length - 1; i >= 0; i--) {
				const leftParen = parenPairs[i].left;
				const rightParen = parenPairs[i].right;

				if (
					!parameterParens.has(leftParen) &&
					!parameterParens.has(rightParen)
				) {
					const parenthesizedTokens = new Set(
						sourceCode.getTokensBetween(leftParen, rightParen),
					);

					parenthesizedTokens.forEach(token => {
						if (
							!parenthesizedTokens.has(
								offsets.getFirstDependency(token),
							)
						) {
							offsets.setDesiredOffset(token, leftParen, 1);
						}
					});
				}

				offsets.setDesiredOffset(rightParen, leftParen, 0);
			}
		}

		/**
		 * Ignore all tokens within an unknown node whose offset do not depend
		 * on another token's offset within the unknown node
		 * @param {ASTNode} node Unknown Node
		 * @returns {void}
		 */
		function ignoreNode(node) {
			const unknownNodeTokens = new Set(
				sourceCode.getTokens(node, { includeComments: true }),
			);

			unknownNodeTokens.forEach(token => {
				if (!unknownNodeTokens.has(offsets.getFirstDependency(token))) {
					const firstTokenOfLine =
						tokenInfo.getFirstTokenOfLine(token);

					if (token === firstTokenOfLine) {
						offsets.ignoreToken(token);
					} else {
						offsets.setDesiredOffset(token, firstTokenOfLine, 0);
					}
				}
			});
		}

		/**
		 * Check whether the given token is on the first line of a statement.
		 * @param {Token} token The token to check.
		 * @param {ASTNode} leafNode The expression node that the token belongs directly.
		 * @returns {boolean} `true` if the token is on the first line of a statement.
		 */
		function isOnFirstLineOfStatement(token, leafNode) {
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
		 * Check whether there are any blank (whitespace-only) lines between
		 * two tokens on separate lines.
		 * @param {Token} firstToken The first token.
		 * @param {Token} secondToken The second token.
		 * @returns {boolean} `true` if the tokens are on separate lines and
		 *   there exists a blank line between them, `false` otherwise.
		 */
		function hasBlankLinesBetween(firstToken, secondToken) {
			const firstTokenLine = firstToken.loc.end.line;
			const secondTokenLine = secondToken.loc.start.line;

			if (
				firstTokenLine === secondTokenLine ||
				firstTokenLine === secondTokenLine - 1
			) {
				return false;
			}

			for (
				let line = firstTokenLine + 1;
				line < secondTokenLine;
				++line
			) {
				if (!tokenInfo.firstTokensByLineNumber.has(line)) {
					return true;
				}
			}

			return false;
		}

		const ignoredNodeFirstTokens = new Set();

		/**
		 * Check indentation for blockless nodes (for/while statements without braces)
		 * @param {ASTNode} node node to examine
		 * @returns {void}
		 */
		function addBlocklessNodeIndent(node) {
			if (node.type !== "BlockStatement") {
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
		}

		/**
		 * Get the block indent level for a block statement
		 * @param {ASTNode} node The block statement node
		 * @returns {number} The indent level
		 */
		function getBlockIndentLevel(node) {
			if (node.parent && isOuterIIFE(node.parent)) {
				return options.outerIIFEBody;
			}
			if (
				node.parent &&
				(node.parent.type === "FunctionExpression" ||
					node.parent.type === "ArrowFunctionExpression")
			) {
				return options.FunctionExpression.body;
			}
			if (
				node.parent &&
				node.parent.type === "FunctionDeclaration"
			) {
				return options.FunctionDeclaration.body;
			}
			return 1;
		}

		/**
		 * Get the first token of a node
		 * @param {ASTNode} node The node
		 * @param {number} skip Number of tokens to skip
		 * @returns {Token} The first token
		 */
		function getFirstToken(node, skip = 0) {
			return sourceCode.getFirstToken(node, skip);
		}

		/**
		 * Get the last token of a node
		 * @param {ASTNode} node The node
		 * @param {number} skip Number of tokens to skip
		 * @returns {Token} The last token
		 */
		function getLastToken(node, skip = 0) {
			return sourceCode.getLastToken(node, skip);
		}

		/**
		 * Get the token after a node
		 * @param {ASTNode} node The node
		 * @param {Function} filter Token filter function
		 * @returns {Token} The token after the node
		 */
		function getTokenAfter(node, filter) {
			return sourceCode.getTokenAfter(node, filter);
		}

		/**
		 * Get the token before a node
		 * @param {ASTNode} node The node
		 * @param {Function} filter Token filter function
		 * @returns {Token} The token before the node
		 */
		function getTokenBefore(node, filter) {
			return sourceCode.getTokenBefore(node, filter);
		}

		/**
		 * Get the first token between two nodes
		 * @param {ASTNode} from The starting node
		 * @param {ASTNode} to The ending node
		 * @param {Function} filter Token filter function
		 * @returns {Token} The first matching token
		 */
		function getFirstTokenBetween(from, to, filter) {
			return sourceCode.getFirstTokenBetween(from, to, filter);
		}

		/**
		 * Get the last token between two nodes
		 * @param {ASTNode} from The starting node
		 * @param {ASTNode} to The ending node
		 * @param {Function} filter Token filter function
		 * @returns {Token} The last matching token
		 */
		function getLastTokenBetween(from, to, filter) {
			return sourceCode.getLastTokenBetween(from, to, filter);
		}

		/**
		 * Get tokens between two nodes
		 * @param {ASTNode} from The starting node
		 * @param {ASTNode} to The ending node
		 * @param {Object} options Token options
		 * @returns {Token[]} The tokens between the nodes
		 */
		function getTokensBetween(from, to, options) {
			return sourceCode.getTokensBetween(from, to, options);
		}

		/**
		 * Get tokens before a node
		 * @param {ASTNode} node The node
		 * @param {number} skip Number of tokens to skip
		 * @returns {Token} The token before the node
		 */
		function getTokenBeforeSkip(node, skip) {
			return sourceCode.getTokenBefore(node, { skip });
		}

		/**
		 * Get tokens after a node
		 * @param {ASTNode} node The node
		 * @param {number} skip Number of tokens to skip
		 * @returns {Token} The token after the node
		 */
		function getTokenAfterSkip(node, skip) {
			return sourceCode.getTokenAfter(node, { skip });
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAt(index) {
			return sourceCode.ast.tokens[index];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
		 * @returns {Token} The token at the index
		 */
		function getTokenAtSkip(index, skip) {
			return sourceCode.ast.tokens[index + skip];
		}

		/**
		 * Get the token at a specific position
		 * @param {number} index The index
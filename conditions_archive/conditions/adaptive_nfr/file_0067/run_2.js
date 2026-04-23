```javascript
"use strict";

const astUtils = require("./utils/ast-utils");

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
		if (this._desiredIndentCache.has(token)) {
			return this._desiredIndentCache.get(token);
		}

		const indent = this._computeDesiredIndent(token);
		this._desiredIndentCache.set(token, indent);
		return indent;
	}

	/**
	 * Computes the desired indent for a token
	 * @param {Token} token The token
	 * @returns {string} The desired indent
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
	 * Computes indent for a locked first token
	 * @param {Token} token The token
	 * @returns {string} The desired indent
	 */
	_computeLockedIndent(token) {
		const firstToken = this._lockedFirstTokens.get(token);
		const firstTokenOfLine = this._tokenInfo.getFirstTokenOfLine(firstToken);
		const baseIndent = this.getDesiredIndent(firstTokenOfLine);
		const columnOffset = firstToken.loc.start.column - firstTokenOfLine.loc.start.column;

		return baseIndent + this._indentType.repeat(columnOffset);
	}

	/**
	 * Computes indent based on offset descriptor
	 * @param {Token} token The token
	 * @returns {string} The desired indent
	 */
	_computeOffsetIndent(token) {
		const offsetInfo = this._getOffsetDescriptor(token);
		const offset = this._calculateOffset(token, offsetInfo);

		if (offsetInfo.from) {
			return this.getDesiredIndent(offsetInfo.from) + this._indentType.repeat(offset);
		}

		return this._indentType.repeat(offset);
	}

	/**
	 * Calculates the offset amount for a token
	 * @param {Token} token The token
	 * @param {Object} offsetInfo The offset descriptor
	 * @returns {number} The offset amount
	 */
	_calculateOffset(token, offsetInfo) {
		const shouldCollapse = this._shouldCollapseOffset(token, offsetInfo);
		return shouldCollapse ? 0 : offsetInfo.offset * this._indentSize;
	}

	/**
	 * Determines if offset should be collapsed
	 * @param {Token} token The token
	 * @param {Object} offsetInfo The offset descriptor
	 * @returns {boolean} True if offset should collapse
	 */
	_shouldCollapseOffset(token, offsetInfo) {
		return (
			offsetInfo.from &&
			offsetInfo.from.loc.start.line === token.loc.start.line &&
			!/^\s*?\n/u.test(token.value) &&
			!offsetInfo.force
		);
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

			return {
				expected: expectedStatement,
				actual: createFoundStatement(actualSpaces, actualTabs, foundSpacesWord, foundTabsWord),
			};
		}

		/**
		 * Creates the "found" statement for error messages
		 * @param {number} actualSpaces Number of spaces found
		 * @param {number} actualTabs Number of tabs found
		 * @param {string} foundSpacesWord Word for spaces
		 * @param {string} foundTabsWord Word for tabs
		 * @returns {string} The found statement
		 */
		function createFoundStatement(actualSpaces, actualTabs, foundSpacesWord, foundTabsWord) {
			if (actualSpaces > 0) {
				return indentType === "space" ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
			}
			if (actualTabs > 0) {
				return indentType === "tab" ? actualTabs : `${actualTabs} ${foundTabsWord}`;
			}
			return "0";
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
			if (!isIIFENode(node)) {
				return false;
			}

			return isOuterIIFEStatement(node.parent.parent);
		}

		/**
		 * Checks if node is an IIFE
		 * @param {ASTNode} node The node to check
		 * @returns {boolean} True if node is an IIFE
		 */
		function isIIFENode(node) {
			if (!node.parent || node.parent.type !== "CallExpression") {
				return false;
			}
			return node.parent.callee === node;
		}

		/**
		 * Checks if statement is an outer IIFE statement
		 * @param {ASTNode} statement The statement to check
		 * @returns {boolean} True if statement is outer IIFE
		 */
		function isOuterIIFEStatement(statement) {
			let current = statement;

			while (isLegalIIFEAncestor(current)) {
				current = current.parent;
			}

			return isTopLevelStatement(current);
		}

		/**
		 * Checks if node is a legal IIFE ancestor
		 * @param {ASTNode} node The node to check
		 * @returns {boolean} True if node is a legal ancestor
		 */
		function isLegalIIFEAncestor(node) {
			if (node.type === "UnaryExpression") {
				return ["!", "~", "+", "-"].includes(node.operator);
			}
			return node.type === "AssignmentExpression" ||
				node.type === "LogicalExpression" ||
				node.type === "SequenceExpression" ||
				node.type === "VariableDeclarator";
		}

		/**
		 * Checks if node is a top-level statement
		 * @param {ASTNode} node The node to check
		 * @returns {boolean} True if node is top-level
		 */
		function isTopLevelStatement(node) {
			return (
				(node.type === "ExpressionStatement" ||
					node.type === "VariableDeclaration") &&
				node.parent.type === "Program"
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
			/**
			 * Gets the first token of a given element, including surrounding parentheses.
			 * @param {ASTNode} element A node in the `elements` list
			 * @returns {Token} The first token of this element
			 */
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
					return;
				}

				if (index === 0) {
					return;
				}

				processElementOffset(element, index, elements, getFirstToken, startToken);
			});
		}

		/**
		 * Processes offset for an element in a list
		 * @param {ASTNode} element The element to process
		 * @param {number} index The element index
		 * @param {ASTNode[]} elements All elements
		 * @param {Function} getFirstToken Function to get first token
		 * @param {Token} startToken The start token
		 * @returns {void}
		 */
		function processElementOffset(element, index, elements, getFirstToken, startToken) {
			if (
				offset === "first" &&
				tokenInfo.isFirstTokenOfLine(getFirstToken(element))
			) {
				offsets.matchOffsetOf(
					getFirstToken(elements[0]),
					getFirstToken(element),
				);
				return;
			}

			const previousElement = elements[index - 1];
			if (!previousElement) {
				return;
			}

			const firstTokenOfPreviousElement = getFirstToken(previousElement);
			const previousElementLastToken = sourceCode.getLastToken(previousElement);

			if (shouldSetPreviousElementOffset(previousElementLastToken, startToken)) {
				offsets.setDesiredOffsets(
					[previousElement.range[1], element.range[1]],
					firstTokenOfPreviousElement,
					0,
				);
			}
		}

		/**
		 * Determines if previous element offset should be set
		 * @param {Token} previousElementLastToken Last token of previous element
		 * @param {Token} startToken Start token
		 * @returns {boolean} True if offset should be set
		 */
		function shouldSetPreviousElementOffset(previousElementLastToken, startToken) {
			return (
				previousElementLastToken.loc.end.line -
					countTrailingLinebreaks(previousElementLastToken.value) >
					startToken.loc.end.line
			);
		}

		/**
		 * Check and decide whether to check for indentation for blockless nodes
		 * Scenarios are for or while statements without braces around them
		 * @param {ASTNode} node node to examine
		 * @returns {void}
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
		 * Checks the indentation for nodes that are like function calls (`CallExpression` and `NewExpression`)
		 * @param {ASTNode} node A CallExpression or NewExpression node
		 * @returns {void}
		 */
		function addFunctionCallIndent(node) {
			const openingParen = getOpeningParen(node);
			const closingParen = sourceCode.getLastToken(node);

			parameterParens.add(openingParen);
			parameterParens.add(closingParen);

			if (node.optional) {
				handleOptionalChain(node, openingParen);
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
		 * Gets the opening parenthesis of a function call
		 * @param {ASTNode} node The node
		 * @returns {Token} The opening paren token
		 */
		function getOpeningParen(node) {
			if (node.arguments.length) {
				return sourceCode.getFirstTokenBetween(
					node.callee,
					node.arguments[0],
					astUtils.isOpeningParenToken,
				);
			}
			return sourceCode.getLastToken(node, 1);
		}

		/**
		 * Handles optional chaining in function calls
		 * @param {ASTNode} node The node
		 * @param {Token} openingParen The opening paren
		 * @returns {void}
		 */
		function handleOptionalChain(node, openingParen) {
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

		/**
		 * Checks the indentation of parenthesized values, given a list of tokens in a program
		 * @param {Token[]} tokens A list of tokens
		 * @returns {void}
		 */
		function addParensIndent(tokens) {
			const parenPairs = extractParenPairs(tokens);

			for (let i = parenPairs.length - 1; i >= 0; i--) {
				processParenPair(parenPairs[i]);
			}
		}

		/**
		 * Extracts matching parenthesis pairs from tokens
		 * @param {Token[]} tokens The tokens
		 * @returns {Array} Array of paren pairs
		 */
		function extractParenPairs(tokens) {
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

			return parenPairs;
		}

		/**
		 * Processes a single parenthesis pair
		 * @param {Object} parenPair The pair with left and right tokens
		 * @returns {void}
		 */
		function processParenPair(parenPair) {
			const leftParen = parenPair.left;
			const rightParen = parenPair.right;

			if (parameterParens.has(leftParen) || parameterParens.has(rightParen)) {
				offsets.setDesiredOffset(rightParen, leftParen, 0);
				return;
			}

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

			offsets.setDesiredOffset(rightParen, leftParen, 0);
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

		const baseOffsetListeners = {
			"ArrayExpression, ArrayPattern"(node) {
				const openingBracket = sourceCode.getFirstToken(node);
				const closingBracket = sourceCode.getTokenAfter(
					[...node.elements].reverse().find(_ => _) || openingBracket,
					astUtils.isClosingBracketToken,
				);

				addElementListIndent(
					node.elements,
					openingBracket,
					closingBracket,
					options.ArrayExpression,
				);
			},

			"ObjectExpression, ObjectPattern"(node) {
				const openingCurly = sourceCode.getFirstToken(node);
				const closingCurly = sourceCode.getTokenAfter(
					node.properties.length
						? node.properties.at(-1)
						: openingCurly,
					astUtils.isClosingBraceToken,
				);

				addElementListIndent(
					node.properties,
					openingCurly,
					closingCurly,
					options.ObjectExpression,
				);
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
					token => token.value === node.operator,
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
					token => token.value === node.operator,
				);

				const tokenAfterOperator = sourceCode.getTokenAfter(operator);

				offsets.ignoreToken(operator);
				offsets.ignoreToken(tokenAfterOperator);
				offsets.setDesiredOffset(tokenAfterOperator, operator, 0);
			},

			"BlockStatement, ClassBody"(node) {
				const blockIndentLevel = getBlockIndentLevel(node);

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

			CallExpression: addFunctionCallIndent,

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
				handleConditionalExpression(node);
			},

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
						offsets.setDesiredOffsets(
							[closingCurly.range[1], node.range[1]],
							sourceCode.getFirstToken(node),
							1,
						);
					}
				}
			},

			ForStatement(node) {
				const forOpeningParen = sourceCode.getFirstToken(node, 1);

				if (node.init) {
					offsets.setDesiredOffsets(
						node.init.range,
						forOpeningParen,
						1,
					);
				}
				if (node.test) {
					offsets.setDesiredOffsets(
						node.test.range,
						forOpeningParen,
						1,
					);
				}
				if (node.update) {
					offsets.setDesiredOffsets(
						node.update.range,
						forOpeningParen,
						1,
					);
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

			":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(
				node,
			) {
				handleBlocklessNodeExit(node);
			},

			ImportDeclaration(node) {
				handleImportDeclaration(node);
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
				handleMemberExpression(node);
			},

			NewExpression(node) {
				if (
					node.arguments.length > 0 ||
					(astUtils.isClosingParenToken(
						sourceCode.getLastToken(node),
					) &&
						astUtils.isOpeningParenToken(
							sourceCode.getLastToken(node, 1),
						))
				) {
					addFunctionCallIndent(node);
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
				handlePropertyDefinition(node);
			},

			StaticBlock(node) {
				const openingCurly = sourceCode.getFirstToken(node, {
					skip: 1,
				});
				const closingCurly = sourceCode.getLastToken(node);

				addElementListIndent(
					node.body,
					openingCurly,
					closingCurly,
					options.StaticBlock.body,
				);
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
						.forEach(token => offsets.ignoreToken(token));
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
					const tokenAfterCurrentCase =
						sourceCode.getTokenAfter(node);

					offsets.setDesiredOffsets(
						[caseKeyword.range[1], tokenAfterCurrentCase.range[0]],
						caseKeyword,
						1,
					);
				}
			},

			TemplateLiteral(node) {
				node.expressions.forEach((expression, index) => {
					const previousQuasi = node.quasis[index];
					const nextQuasi = node.quasis[index + 1];
					const tokenToAlignFrom =
						previousQuasi.loc.start.line ===
						previousQuasi.loc.end.line
							? sourceCode.getFirstToken(previousQuasi)
							: null;

					offsets.setDesiredOffsets(
						[previousQuasi.range[1], nextQuasi.range[0]],
						tokenToAlignFrom,
						1,
					);
					offsets.setDesiredOffset(
						sourceCode.getFirstToken(nextQuasi),
						tokenToAlignFrom,
						0,
					);
				});
			},

			VariableDeclaration(node) {
				handleVariableDeclaration(node);
			},

			VariableDeclarator(node) {
				if (!node.init) {
					return;
				}

				const equalOperator = sourceCode.getTokenBefore(
					node.init,
					astUtils.isNotOpeningParenToken,
				);
				const tokenAfterOperator =
					sourceCode.getTokenAfter(equalOperator);

				offsets.ignoreToken(equalOperator);
				offsets.ignoreToken(tokenAfterOperator);
				offsets.setDesiredOffsets(
					[tokenAfterOperator.range[0], node.range[1]],
					equalOperator,
					1,
				);
				offsets.setDesiredOffset(
					equalOperator,
					sourceCode.getLastToken(node.id),
					0,
				);
			},

			"JSXAttribute[value]"(node) {
				const equalsToken = sourceCode.getFirstTokenBetween(
					node.name,
					node.value,
					token => token.type === "Punctuator" && token.value === "=",
				);

				offsets.setDesiredOffsets(
					[equalsToken.range[0], node.value.range[1]],
					sourceCode.getFirstToken(node.name),
					1,
				);
			},

			JSXElement(node) {
				if (node.closingElement) {
					addElementListIndent(
						node.children,
						sourceCode.getFirstToken(node.openingElement),
						sourceCode.getFirstToken(node.closingElement),
						1,
					);
				}
			},

			JSXOpeningElement(node) {
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
				offsets.setDesiredOffsets(
					node.name.range,
					sourceCode.getFirstToken(node),
				);
				addElementListIndent(
					node.attributes,
					firstToken,
					closingToken,
					1,
				);
			},

			JSXClosingElement(node) {
				const firstToken = sourceCode.getFirstToken(node);

				offsets.setDesiredOffsets(node.name.range, firstToken, 1);
			},

			JSXFragment(node) {
				const firstOpeningToken = sourceCode.getFirstToken(
					node.openingFragment,
				);
				const firstClosingToken = sourceCode.getFirstToken(
					node.closingFragment,
				);

				addElementListIndent(
					node.children,
					firstOpeningToken,
					firstClosingToken,
					1,
				);
			},

			JSXOpeningFragment(node) {
				const firstToken = sourceCode.getFirstToken(node);
				const closingToken = sourceCode.getLastToken(node);

				offsets.setDesiredOffsets(node.range, firstToken, 1);
				offsets.matchOffsetOf(firstToken, closingToken);
			},

			JSXClosingFragment(node) {
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
			},

			JSXExpressionContainer(node) {
				const openingCurly = sourceCode.getFirstToken(node);
				const closingCurly = sourceCode.getLastToken(node);

				offsets.setDesiredOffsets(
					[openingCurly.range[1], closingCurly.range[0]],
					openingCurly,
					1,
				);
			},

			JSXSpreadAttribute(node) {
				const openingCurly = sourceCode.getFirstToken(node);
				const closingCurly = sourceCode.getLastToken(node);

				offsets.setDesiredOffsets(
					[openingCurly.range[1], closingCurly.range[0]],
					openingCurly,
					1,
				);
			},

			"*"(node) {
				const firstToken = sourceCode.getFirstToken(node);

				if (firstToken && !ignoredNodeFirstTokens.has(firstToken)) {
					offsets.setDesiredOffsets(node.range, firstToken, 0);
				}
			},
		};

		/**
		 * Gets the block indent level for a block statement
		 * @param {ASTNode} node The block node
		 * @returns {number} The indent level
		 */
		function getBlockIndentLevel(node) {
			if (node.parent && isOuterIIFE(node.parent)) {
				return options.outerIIFEBody;
			}

			if (isFunctionExpressionBody(node)) {
				return options.FunctionExpression.body;
			}

			if (node.parent && node.parent.type === "FunctionDeclaration") {
				return options.FunctionDeclaration.body;
			}

			return 1;
		}

		/**
		 * Checks if node is a function expression body
		 * @param {ASTNode} node The node
		 * @returns {boolean} True if it's a function expression body
		 */
		function isFunctionExpressionBody(node) {
			return (
				node.parent &&
				(node.parent.type === "FunctionExpression" ||
					node.parent.type === "ArrowFunctionExpression")
			);
		}

		/**
		 * Handles conditional expression indentation
		 * @param {ASTNode} node The conditional expression node
		 * @returns {void}
		 */
		function handleConditionalExpression(node) {
			const firstToken = sourceCode.getFirstToken(node);

			if (shouldFlattenTernary(node, firstToken)) {
				return;
			}

			const questionMarkToken = sourceCode.getFirstTokenBetween(
				node.test,
				node.consequent,
				token =>
					token.type === "Punctuator" && token.value === "?",
			);
			const colonToken = sourceCode.getFirstTokenBetween(
				node.consequent,
				node.alternate,
				token =>
					token.type === "Punctuator" && token.value === ":",
			);

			const firstConsequentToken =
				sourceCode.getTokenAfter(questionMarkToken);
			const lastConsequentToken =
				sourceCode.getTokenBefore(colonToken);
			const firstAlternateToken =
				sourceCode.getTokenAfter(colonToken);

			offsets.setDesiredOffset(questionMarkToken, firstToken, 1);
			offsets.setDesiredOffset(colonToken, firstToken, 1);

			offsets.setDesiredOffset(
				firstConsequentToken,
				firstToken,
				getConsequentOffset(firstConsequentToken),
			);

			handleAlternateOffset(
				lastConsequentToken,
				firstAlternateToken,
				firstConsequentToken,
				firstToken,
			);
		}

		/**
		 * Checks if ternary should be flattened
		 * @param {ASTNode} node The node
		 * @param {Token} firstToken The first token
		 * @returns {boolean} True if should flatten
		 */
		function shouldFlattenTernary(node, firstToken) {
			return (
				options.flatTernaryExpressions &&
				astUtils.isTokenOnSameLine(node.test, node.consequent) &&
				!isOnFirstLineOfStatement(firstToken, node)
			);
		}

		/**
		 * Gets the offset for consequent token
		 * @param {Token} firstConsequentToken The token
		 * @returns {number} The offset
		 */
		function getConsequentOffset(firstConsequentToken) {
			return (
				firstConsequentToken.type === "Punctuator" &&
				options.offsetTernaryExpressions
					? 2
					: 1
			);
		}

		/**
		 * Handles alternate offset in conditional expression
		 * @param {Token} lastConsequentToken Last consequent token
		 * @param {Token} firstAlternateToken First alternate token
		 * @param {Token} firstConsequentToken First consequent token
		 * @param {Token} firstToken First token of expression
		 * @returns {void}
		 */
		function handleAlternateOffset(
			lastConsequentToken,
			firstAlternateToken,
			firstConsequentToken,
			firstToken,
		) {
			if (
				lastConsequentToken.loc.end.line ===
				firstAlternateToken.loc.start.line
			) {
				offsets.setDesiredOffset(
					firstAlternateToken,
					firstConsequentToken,
					0,
				);
			} else {
				offsets.setDesiredOffset(
					firstAlternateToken,
					firstToken,
					getAlternateOffset(firstAlternateToken),
				);
			}
		}

		/**
		 * Gets the offset for alternate token
		 * @param {Token} firstAlternateToken The token
		 * @returns {number} The offset
		 */
		function getAlternateOffset(firstAlternateToken) {
			return (
				firstAlternateToken.type === "Punctuator" &&
				options.offsetTernaryExpressions
					? 2
					: 1
			);
		}

		/**
		 * Handles blockless node exit
		 * @param {ASTNode} node The node
		 * @returns {void}
		 */
		function handleBlocklessNodeExit(node) {
			const nodesToCheck = getBlocklessNodesToCheck(node);

			for (const nodeToCheck of nodesToCheck) {
				const lastToken = sourceCode.getLastToken(nodeToCheck);

				if (!astUtils.isSemicolonToken(lastToken)) {
					continue;
				}

				const tokenBeforeLast = sourceCode.getTokenBefore(lastToken);
				const tokenAfterLast = sourceCode.getTokenAfter(lastToken);

				if (shouldOverrideSemicolonIndent(tokenBeforeLast, lastToken, tokenAfterLast)) {
					offsets.setDesiredOffset(
						lastToken,
						sourceCode.getFirstToken(node),
						0,
					);
				}
			}
		}

		/**
		 * Gets nodes to check for blockless statement
		 * @param {ASTNode} node The node
		 * @returns {ASTNode[]} Nodes to check
		 */
		function getBlocklessNodesToCheck(node) {
			if (node.type === "IfStatement") {
				const nodes = [node.consequent];
				if (node.alternate) {
					nodes.push(node.alternate);
				}
				return nodes;
			}
			return [node.body];
		}

		/**
		 * Checks if semicolon indent should be overridden
		 * @param {Token} tokenBeforeLast Token before semicolon
		 * @param {Token} lastToken The semicolon
		 * @param {Token} tokenAfterLast Token after semicolon
		 * @returns {boolean} True if should override
		 */
		function shouldOverrideSemicolonIndent(tokenBeforeLast, lastToken, tokenAfterLast) {
			return (
				!astUtils.isTokenOnSameLine(tokenBeforeLast, lastToken) &&
				tokenAfterLast &&
				astUtils.isTokenOnSameLine(lastToken, tokenAfterLast)
			);
		}

		/**
		 * Handles import declaration indentation
		 * @param {ASTNode} node The import declaration
		 * @returns {void}
		 */
		function handleImportDeclaration(node) {
			if (
				node.specifiers.some(
					specifier => specifier.type === "ImportSpecifier",
				)
			) {
				const openingCurly = sourceCode.getFirstToken(
					node,
					astUtils.isOpeningBraceToken,
				);
				const closingCurly = sourceCode.getLastToken(
					node,
					astUtils.isClosingBraceToken,
				);

				addElementListIndent(
					node.specifiers.filter(
						specifier => specifier.type === "ImportSpecifier",
					),
					openingCurly,
					closingCurly,
					options.ImportDeclaration,
				);
			}

			const fromToken = sourceCode.getLastToken(
				node,
				token =>
					token.type === "Identifier" && token.value === "from",
			);

			if (!fromToken) {
				return;
			}

			const sourceToken = sourceCode.getLastToken(
				node,
				token => token.type === "String",
			);
			const semiToken = sourceCode.getLastToken(
				node,
				token => token.type === "Punctuator" && token.value === ";",
			);

			const end =
				semiToken && semiToken.range[1] === sourceToken.range[1]
					? node.range[1]
					: sourceToken.range[1];

			offsets.setDesiredOffsets(
				[fromToken.range[0], end],
				sourceCode.getFirstToken(node),
				1,
			);
		}

		/**
		 * Handles member expression indentation
		 * @param {ASTNode} node The member expression
		 * @returns {void}
		 */
		function handleMemberExpression(node) {
			const object =
				node.type === "MetaProperty" ? node.meta : node.object;
			const firstNonObjectToken = sourceCode.getFirstTokenBetween(
				object,
				node.property,
				astUtils.isNotClosingParenToken,
			);
			const secondNonObjectToken =
				sourceCode.getTokenAfter(firstNonObjectToken);

			const objectParenCount = sourceCode.getTokensBetween(
				object,
				node.property,
				{ filter: astUtils.isClosingParenToken },
			).length;
			const firstObjectToken = objectParenCount
				? sourceCode.getTokenBefore(object, {
						skip: objectParenCount - 1,
					})
				: sourceCode.getFirstToken(object);
			const lastObjectToken =
				sourceCode.getTokenBefore(firstNonObjectToken);
			const firstPropertyToken = node.computed
				? firstNonObjectToken
				: secondNonObjectToken;

			if (node.computed) {
				offsets.setDesiredOffset(
					sourceCode.getLastToken(node),
					firstNonObjectToken,
					0,
				);
				offsets.setDesiredOffsets(
					node.property.range,
					firstNonObjectToken,
					1,
				);
			}

			const offsetBase =
				lastObjectToken.loc.end.line ===
				firstPropertyToken.loc.start.line
					? lastObjectToken
					: firstObjectToken;

			if (typeof options.MemberExpression === "number") {
				offsets.setDesiredOffset(
					firstNonObjectToken,
					offsetBase,
					options.MemberExpression,
				);

				offsets.setDesiredOffset(
					secondNonObjectToken,
					node.computed ? firstNonObjectToken : offsetBase,
					options.MemberExpression,
				);
			} else {
				offsets.ignoreToken(firstNonObjectToken);
				offsets.ignoreToken(secondNonObjectToken);

				offsets.setDesiredOffset(
					firstNonObjectToken,
					offsetBase,
					0,
				);
				offsets.setDesiredOffset(
					secondNonObjectToken,
					firstNonObjectToken,
					0,
				);
			}
		}

		/**
		 * Handles property definition indentation
		 * @param {ASTNode} node The property definition
		 * @returns {void}
		 */
		function handlePropertyDefinition(node) {
			const firstToken = sourceCode.getFirstToken(node);
			const maybeSemicolonToken = sourceCode.getLastToken(node);
			let keyLastToken;

			if (node.computed) {
				handleComputedPropertyKey(node, firstToken);
				keyLastToken = sourceCode.getTokenAfter(
					node.key,
					astUtils.isClosingBracketToken,
				);
			} else {
				keyLastToken = sourceCode.getFirstToken(node.key);
				if (keyLastToken !== firstToken) {
					offsets.setDesiredOffset(keyLastToken, firstToken, 1);
				}
			}

			if (node.value) {
				handlePropertyDefinitionValue(node, keyLastToken, maybeSemicolonToken);
			} else if (astUtils.isSemicolonToken(maybeSemicolonToken)) {
				offsets.setDesiredOffset(
					maybeSemicolonToken,
					keyLastToken,
					1,
				);
			}
		}

		/**
		 * Handles computed property key indentation
		 * @param {ASTNode} node The property definition
		 * @param {Token} firstToken The first token
		 * @returns {void}
		 */
		function handleComputedPropertyKey(node, firstToken) {
			const bracketTokenL = sourceCode.getTokenBefore(
				node.key,
				astUtils.isOpeningBracketToken,
			);
			const bracketTokenR = sourceCode.getTokenAfter(
				node.key,
				astUtils.isClosingBracketToken,
			);
			const keyRange = [
				bracketTokenL.range[1],
				bracketTokenR.range[0],
			];

			if (bracketTokenL !== firstToken) {
				offsets.setDesiredOffset(bracketTokenL, firstToken, 0);
			}
			offsets.setDesiredOffsets(keyRange, bracketTokenL, 1);
			offsets.setDesiredOffset(bracketTokenR, bracketTokenL, 0);
		}

		/**
		 * Handles property definition value indentation
		 * @param {ASTNode} node The property definition
		 * @param {Token} keyLastToken Last token of key
		 * @param {Token} maybeSemicolonToken Possible semicolon token
		 * @returns {void}
		 */
		function handlePropertyDefinitionValue(node, keyLastToken, maybeSemicolonToken) {
			const eqToken = sourceCode.getTokenBefore(
				node.value,
				astUtils.isEqToken,
			);
			const valueToken = sourceCode.getTokenAfter(eqToken);

			offsets.setDesiredOffset(eqToken, keyLastToken, 1);
			offsets.setDesiredOffset(valueToken, eqToken, 1);
			if (astUtils.isSemicolonToken(maybeSemicolonToken)) {
				offsets.setDesiredOffset(
					maybeSemicolonToken,
					eqToken,
					1,
				);
			}
		}

		/**
		 * Handles variable declaration indentation
		 * @param {ASTNode} node The variable declaration
		 * @returns {void}
		 */
		function handleVariableDeclaration(node) {
			let variableIndent = Object.hasOwn(
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

				variableIndent = DEFAULT_VARIABLE_INDENT;
			}

			const shouldForceOffset =
				node.declarations.at(-1).loc.start.line >
				node.loc.start.line;

			offsets.setDesiredOffsets(
				node.range,
				firstToken,
				variableIndent,
				shouldForceOffset,
			);

			if (astUtils.isSemicolonToken(lastToken)) {
				offsets.ignoreToken(lastToken);
			}
		}

		const listenerCallQueue = [];

		const offsetListeners = {};

		for (const [selector, listener] of Object.entries(
			baseOffsetListeners,
		)) {
			offsetListeners[selector] = node =>
				listenerCallQueue.push({ listener, node });
		}

		const ignoredNodes = new Set();

		/**
		 * Ignores a node
		 * @param {ASTNode} node The node to ignore
		 * @returns {void}
		 */
		function addToIgnoredNodes(node) {
			ignoredNodes.add(node);
			ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
		}

		const ignoredNodeListeners = options.ignoredNodes.reduce(
			(listeners, ignoredSelector) =>
				Object.assign(listeners, {
					[ignoredSelector]: addToIgnoredNodes,
				}),
			{},
		);

		return Object.assign(offsetListeners, ignoredNodeListeners, {
			"*:exit"(node) {
				if (!KNOWN_NODES.has(node.type)) {
					addToIgnoredNodes(node);
				}
			},
			"Program:exit"() {
				if (options.ignoreComments) {
					sourceCode
						.getAllComments()
						.forEach(comment => offsets.ignoreToken(comment));
				}

				for (let i = 0; i < listenerCallQueue.length; i++) {
					const nodeInfo = listenerCallQueue[i];

					if (!ignoredNodes.has(nodeInfo.node)) {
						nodeInfo.listener(nodeInfo.node);
					}
				}

				ignoredNodes.forEach(ignoreNode);

				addParensIndent(sourceCode.ast.tokens);

				const precedingTokens = new WeakMap();

				for (let i = 0; i < sourceCode.ast.comments.length; i++) {
					const comment = sourceCode.ast.comments[i];

					const tokenOrCommentBefore = sourceCode.getTokenBefore(
						comment,
						{ includeComments: true },
					);
					const hasToken = precedingTokens.has(tokenOrCommentBefore)
						? precedingTokens.get(tokenOrCommentBefore)
						: tokenOrCommentBefore;

					precedingTokens.set(comment, hasToken);
				}

				for (let i = 1; i < sourceCode.lines.length + 1; i++) {
					if (!tokenInfo.firstTokensByLineNumber.has(i)) {
						continue;
					}

					const firstTokenOfLine =
						tokenInfo.firstTokensByLineNumber.get(i);

					if (firstTokenOfLine.loc.start.line !== i) {
						continue;
					}

					if (astUtils.isCommentToken(firstTokenOfLine)) {
						if (handleCommentLineIndentation(firstTokenOfLine, precedingTokens)) {
							continue;
						}
					}

					if (
						validateTokenIndent(
							firstTokenOfLine,
							offsets.getDesiredIndent(firstTokenOfLine),
						)
					) {
						continue;
					}

					report(
						firstTokenOfLine,
						offsets.getDesiredIndent(firstTokenOfLine),
					);
				}
			},
		});

		/**
		 * Handles comment line indentation validation
		 * @param {Token} firstTokenOfLine The comment token
		 * @param {WeakMap} precedingTokens Map of preceding tokens
		 * @returns {boolean} True if comment is valid
		 */
		function handleCommentLineIndentation(firstTokenOfLine, precedingTokens) {
			const tokenBefore = precedingTokens.get(firstTokenOfLine);
			const tokenAfter = tokenBefore
				? sourceCode.getTokenAfter(tokenBefore)
				: sourceCode.ast.tokens[0];
			const mayAlignWithBefore =
				tokenBefore &&
				!hasBlankLinesBetween(tokenBefore, firstTokenOfLine);
			const mayAlignWithAfter =
				tokenAfter &&
				!hasBlankLinesBetween(firstTokenOfLine, tokenAfter);

			if (
				tokenAfter &&
				astUtils.isSemicolonToken(tokenAfter) &&
				!astUtils.isTokenOnSameLine(firstTokenOfLine, tokenAfter)
			) {
				offsets.setDesiredOffset(firstTokenOfLine, tokenAfter, 0);
			}

			if (
				(mayAlignWithBefore &&
					validateTokenIndent(
						firstTokenOfLine,
						offsets.getDesiredIndent(tokenBefore),
					)) ||
				(mayAlignWithAfter &&
					validateTokenIndent(
						firstTokenOfLine,
						offsets.getDesiredIndent(tokenAfter),
					))
			) {
				return true;
			}

			return false;
		}
	},
};
```
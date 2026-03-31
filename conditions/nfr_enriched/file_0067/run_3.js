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

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const KNOWN_NODES = new Set([
	"AssignmentExpression", "AssignmentPattern", "ArrayExpression", "ArrayPattern",
	"ArrowFunctionExpression", "AwaitExpression", "BlockStatement", "BinaryExpression",
	"BreakStatement", "CallExpression", "CatchClause", "ChainExpression", "ClassBody",
	"ClassDeclaration", "ClassExpression", "ConditionalExpression", "ContinueStatement",
	"DoWhileStatement", "DebuggerStatement", "EmptyStatement", "ExperimentalRestProperty",
	"ExperimentalSpreadProperty", "ExpressionStatement", "ForStatement", "ForInStatement",
	"ForOfStatement", "FunctionDeclaration", "FunctionExpression", "Identifier",
	"IfStatement", "Literal", "LabeledStatement", "LogicalExpression", "MemberExpression",
	"MetaProperty", "MethodDefinition", "NewExpression", "ObjectExpression", "ObjectPattern",
	"PrivateIdentifier", "Program", "Property", "PropertyDefinition", "RestElement",
	"ReturnStatement", "SequenceExpression", "SpreadElement", "StaticBlock", "Super",
	"SwitchCase", "SwitchStatement", "TaggedTemplateExpression", "TemplateElement",
	"TemplateLiteral", "ThisExpression", "ThrowStatement", "TryStatement", "UnaryExpression",
	"UpdateExpression", "VariableDeclaration", "VariableDeclarator", "WhileStatement",
	"WithStatement", "YieldExpression", "JSXFragment", "JSXOpeningFragment",
	"JSXClosingFragment", "JSXIdentifier", "JSXNamespacedName", "JSXMemberExpression",
	"JSXEmptyExpression", "JSXExpressionContainer", "JSXElement", "JSXClosingElement",
	"JSXOpeningElement", "JSXAttribute", "JSXSpreadAttribute", "JSXText",
	"ExportDefaultDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration",
	"ExportSpecifier", "ImportDeclaration", "ImportSpecifier", "ImportDefaultSpecifier",
	"ImportNamespaceSpecifier", "ImportExpression",
]);

const UNARY_OPERATORS_FOR_IIFE = new Set(["!", "~", "+", "-"]);
const IIFE_ANCESTOR_TYPES = new Set([
	"UnaryExpression", "AssignmentExpression", "LogicalExpression",
	"SequenceExpression", "VariableDeclarator",
]);

const ELEMENT_LIST_SCHEMA = {
	oneOf: [
		{ type: "integer", minimum: 0 },
		{ enum: ["first", "off"] },
	],
};

const INTEGER_OR_OFF_SCHEMA = {
	oneOf: [
		{ type: "integer", minimum: 0 },
		{ enum: ["off"] },
	],
};

const FUNCTION_SCHEMA = {
	type: "object",
	properties: {
		parameters: ELEMENT_LIST_SCHEMA,
		body: { type: "integer", minimum: 0 },
	},
	additionalProperties: false,
};

//------------------------------------------------------------------------------
// IndexMap
//------------------------------------------------------------------------------

class IndexMap {
	constructor(maxKey) {
		this._values = Array(maxKey + 1);
	}

	insert(key, value) {
		this._values[key] = value;
	}

	findLastNotAfter(key) {
		for (let index = key; index >= 0; index--) {
			if (this._values[index]) {
				return this._values[index];
			}
		}
		return void 0;
	}

	deleteRange(start, end) {
		this._values.fill(void 0, start, end);
	}
}

//------------------------------------------------------------------------------
// TokenInfo
//------------------------------------------------------------------------------

class TokenInfo {
	constructor(sourceCode) {
		this.sourceCode = sourceCode;
		this.firstTokensByLineNumber = new Map();
		this._buildLineMap(sourceCode.tokensAndComments);
	}

	_buildLineMap(tokens) {
		for (const token of tokens) {
			const startLine = token.loc.start.line;
			const endLine = token.loc.end.line;

			if (!this.firstTokensByLineNumber.has(startLine)) {
				this.firstTokensByLineNumber.set(startLine, token);
			}

			if (
				!this.firstTokensByLineNumber.has(endLine) &&
				this.sourceCode.text
					.slice(token.range[1] - token.loc.end.column, token.range[1])
					.trim()
			) {
				this.firstTokensByLineNumber.set(endLine, token);
			}
		}
	}

	getFirstTokenOfLine(token) {
		return this.firstTokensByLineNumber.get(token.loc.start.line);
	}

	isFirstTokenOfLine(token) {
		return this.getFirstTokenOfLine(token) === token;
	}

	getTokenIndent(token) {
		return this.sourceCode.text.slice(
			token.range[0] - token.loc.start.column,
			token.range[0],
		);
	}
}

//------------------------------------------------------------------------------
// OffsetStorage
//------------------------------------------------------------------------------

class OffsetStorage {
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

	matchOffsetOf(baseToken, offsetToken) {
		this._lockedFirstTokens.set(offsetToken, baseToken);
	}

	setDesiredOffset(token, fromToken, offset) {
		return this.setDesiredOffsets(token.range, fromToken, offset);
	}

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

	getDesiredIndent(token) {
		if (this._desiredIndentCache.has(token)) {
			return this._desiredIndentCache.get(token);
		}

		let indent;

		if (this._ignoredTokens.has(token)) {
			indent = this._tokenInfo.getTokenIndent(token);
		} else if (this._lockedFirstTokens.has(token)) {
			indent = this._computeLockedIndent(token);
		} else {
			indent = this._computeOffsetIndent(token);
		}

		this._desiredIndentCache.set(token, indent);
		return indent;
	}

	_computeLockedIndent(token) {
		const firstToken = this._lockedFirstTokens.get(token);
		const firstTokenOfLine = this._tokenInfo.getFirstTokenOfLine(firstToken);

		return (
			this.getDesiredIndent(firstTokenOfLine) +
			this._indentType.repeat(
				firstToken.loc.start.column - firstTokenOfLine.loc.start.column,
			)
		);
	}

	_computeOffsetIndent(token) {
		const offsetInfo = this._getOffsetDescriptor(token);
		const isSameLine =
			offsetInfo.from &&
			offsetInfo.from.loc.start.line === token.loc.start.line;
		const shouldCollapse =
			isSameLine && !/^\s*?\n/u.test(token.value) && !offsetInfo.force;

		const offset = shouldCollapse ? 0 : offsetInfo.offset * this._indentSize;
		const base = offsetInfo.from ? this.getDesiredIndent(offsetInfo.from) : "";

		return base + this._indentType.repeat(offset);
	}

	ignoreToken(token) {
		if (this._tokenInfo.isFirstTokenOfLine(token)) {
			this._ignoredTokens.add(token);
		}
	}

	getFirstDependency(token) {
		return this._getOffsetDescriptor(token).from;
	}
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

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
					message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
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
					outerIIFEBody: INTEGER_OR_OFF_SCHEMA,
					MemberExpression: INTEGER_OR_OFF_SCHEMA,
					FunctionDeclaration: FUNCTION_SCHEMA,
					FunctionExpression: FUNCTION_SCHEMA,
					StaticBlock: {
						type: "object",
						properties: {
							body: { type: "integer", minimum: 0 },
						},
						additionalProperties: false,
					},
					CallExpression: {
						type: "object",
						properties: { arguments: ELEMENT_LIST_SCHEMA },
						additionalProperties: false,
					},
					ArrayExpression: ELEMENT_LIST_SCHEMA,
					ObjectExpression: ELEMENT_LIST_SCHEMA,
					ImportDeclaration: ELEMENT_LIST_SCHEMA,
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
			wrongIndentation: "Expected indentation of {{expected}} but found {{actual}}.",
		},
	},

	create(context) {
		const DEFAULT_VARIABLE_INDENT = 1;
		const DEFAULT_PARAMETER_INDENT = 1;
		const DEFAULT_FUNCTION_BODY_INDENT = 1;

		let indentType = "space";
		let indentSize = 4;

		const options = buildOptions(context.options, {
			DEFAULT_VARIABLE_INDENT,
			DEFAULT_PARAMETER_INDENT,
			DEFAULT_FUNCTION_BODY_INDENT,
		});

		if (context.options.length) {
			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else {
				indentSize = context.options[0];
				indentType = "space";
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

		//--------------------------------------------------------------------------
		// Helper functions
		//--------------------------------------------------------------------------

		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
			const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			let foundStatement;

			if (actualSpaces > 0) {
				foundStatement = indentType === "space"
					? actualSpaces
					: `${actualSpaces} space${actualSpaces === 1 ? "" : "s"}`;
			} else if (actualTabs > 0) {
				foundStatement = indentType === "tab"
					? actualTabs
					: `${actualTabs} tab${actualTabs === 1 ? "" : "s"}`;
			} else {
				foundStatement = "0";
			}

			return { expected: expectedStatement, actual: foundStatement };
		}

		function report(token, neededIndent) {
			const actualIndent = Array.from(tokenInfo.getTokenIndent(token));
			const numSpaces = actualIndent.filter(char => char === " ").length;
			const numTabs = actualIndent.filter(char => char === "\t").length;

			context.report({
				node: token,
				messageId: "wrongIndentation",
				data: createErrorMessageData(neededIndent.length, numSpaces, numTabs),
				loc: {
					start: { line: token.loc.start.line, column: 0 },
					end: { line: token.loc.start.line, column: token.loc.start.column },
				},
				fix(fixer) {
					return fixer.replaceTextRange(
						[token.range[0] - token.loc.start.column, token.range[0]],
						neededIndent,
					);
				},
			});
		}

		function validateTokenIndent(token, desiredIndent) {
			const indentation = tokenInfo.getTokenIndent(token);

			return (
				indentation === desiredIndent ||
				(
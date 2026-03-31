```javascript
"use strict";

const astUtils = require("./utils/ast-utils");

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
		return undefined;
	}

	deleteRange(start, end) {
		this._values.fill(undefined, start, end);
	}
}

class TokenInfo {
	constructor(sourceCode) {
		this.sourceCode = sourceCode;
		this.firstTokensByLineNumber = new Map();
		this._initializeFirstTokens();
	}

	_initializeFirstTokens() {
		const tokens = this.sourceCode.tokensAndComments;
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const startLine = token.loc.start.line;
			const endLine = token.loc.end.line;

			if (!this.firstTokensByLineNumber.has(startLine)) {
				this.firstTokensByLineNumber.set(startLine, token);
			}

			if (!this.firstTokensByLineNumber.has(endLine) && this._hasContentAfterToken(token)) {
				this.firstTokensByLineNumber.set(endLine, token);
			}
		}
	}

	_hasContentAfterToken(token) {
		const textAfter = this.sourceCode.text.slice(
			token.range[1] - token.loc.end.column,
			token.range[1],
		);
		return textAfter.trim().length > 0;
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
		const fromTokenIsInRange = fromToken && this._isTokenInRange(fromToken, range);
		const fromTokenDescriptor = fromTokenIsInRange && this._getOffsetDescriptor(fromToken);

		this._indexMap.deleteRange(range[0] + 1, range[1]);
		this._indexMap.insert(range[0], descriptorToInsert);

		if (fromTokenIsInRange) {
			this._indexMap.insert(fromToken.range[0], fromTokenDescriptor);
			this._indexMap.insert(fromToken.range[1], descriptorToInsert);
		}

		this._indexMap.insert(range[1], descriptorAfterRange);
	}

	_isTokenInRange(token, range) {
		return token.range[0] >= range[0] && token.range[1] <= range[1];
	}

	getDesiredIndent(token) {
		if (this._desiredIndentCache.has(token)) {
			return this._desiredIndentCache.get(token);
		}

		let desiredIndent;

		if (this._ignoredTokens.has(token)) {
			desiredIndent = this._tokenInfo.getTokenIndent(token);
		} else if (this._lockedFirstTokens.has(token)) {
			desiredIndent = this._getLockedTokenIndent(token);
		} else {
			desiredIndent = this._getComputedIndent(token);
		}

		this._desiredIndentCache.set(token, desiredIndent);
		return desiredIndent;
	}

	_getLockedTokenIndent(token) {
		const firstToken = this._lockedFirstTokens.get(token);
		const firstTokenOfLine = this._tokenInfo.getFirstTokenOfLine(firstToken);
		const baseIndent = this.getDesiredIndent(firstTokenOfLine);
		const columnOffset = firstToken.loc.start.column - firstTokenOfLine.loc.start.column;
		return baseIndent + this._indentType.repeat(columnOffset);
	}

	_getComputedIndent(token) {
		const offsetInfo = this._getOffsetDescriptor(token);
		const shouldCollapseOffset = offsetInfo.from &&
			offsetInfo.from.loc.start.line === token.loc.start.line &&
			!/^\s*?\n/u.test(offsetInfo.from.value) &&
			!offsetInfo.force;

		const offset = shouldCollapseOffset ? 0 : offsetInfo.offset * this._indentSize;
		const baseIndent = offsetInfo.from ? this.getDesiredIndent(offsetInfo.from) : "";
		return baseIndent + this._indentType.repeat(offset);
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

const ELEMENT_LIST_SCHEMA = {
	oneOf: [
		{ type: "integer", minimum: 0 },
		{ enum: ["first", "off"] },
	],
};

const DEFAULT_INDENT_CONFIG = {
	VARIABLE: 1,
	PARAMETER: 1,
	FUNCTION_BODY: 1,
};

module.exports = {
	meta: {
		deprecated: {
			message: "Formatting rules are being moved out of ESLint core.",
			url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
			deprecatedSince: "8.53.0",
			availableUntil: "11.0.0",
			replacedBy: [{
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
			}],
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
		const { indentSize, indentType } = this._parseIndentConfig(context);
		const options = this._buildOptions(context, indentSize);
		const sourceCode = context.sourceCode;
		const tokenInfo = new TokenInfo(sourceCode);
		const offsets = new OffsetStorage(tokenInfo, indentSize, indentType, sourceCode.text.length);
		const parameterParens = new WeakSet();

		return this._createListeners(context, sourceCode, tokenInfo, offsets, parameterParens, options, indentType);
	},

	_parseIndentConfig(context) {
		let indentSize = 4;
		let indentType = "space";

		if (context.options.length && context.options[0]) {
			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else {
				indentSize = context.options[0];
				indentType = "space";
			}
		}

		return { indentSize, indentType };
	},

	_buildOptions(context, indentSize) {
		const options = {
			SwitchCase: 0,
			VariableDeclarator: {
				var: DEFAULT_INDENT_CONFIG.VARIABLE,
				let: DEFAULT_INDENT_CONFIG.VARIABLE,
				const: DEFAULT_INDENT_CONFIG.VARIABLE,
			},
			outerIIFEBody: 1,
			FunctionDeclaration: {
				parameters: DEFAULT_INDENT_CONFIG.PARAMETER,
				body: DEFAULT_INDENT_CONFIG.FUNCTION_BODY,
			},
			FunctionExpression: {
				parameters: DEFAULT_INDENT_CONFIG.PARAMETER,
				body: DEFAULT_INDENT_CONFIG.FUNCTION_BODY,
			},
			StaticBlock: {
				body: DEFAULT_INDENT_CONFIG.FUNCTION_BODY,
			},
			CallExpression: {
				arguments: DEFAULT_INDENT_CONFIG.PARAMETER,
			},
			MemberExpression: 1,
			ArrayExpression: 1,
			ObjectExpression: 1,
			ImportDeclaration: 1,
			flatTernaryExpressions: false,
			ignoredNodes: [],
			ignoreComments: false,
		};

		if (context.options[1]) {
			Object.assign(options, context.options[1]);
			this._normalizeVariableDeclaratorOption(options);
		}

		return options;
	},

	_normalizeVariableDeclaratorOption(options) {
		if (typeof options.VariableDeclarator === "number" || options.VariableDeclarator === "first") {
			options.VariableDeclarator = {
				var: options.VariableDeclarator,
				let: options.VariableDeclarator,
				const: options.VariableDeclarator,
			};
		}
	},

	_createListeners(context, sourceCode, tokenInfo, offsets, parameterParens, options, indentType) {
		const ignoredNodes = new Set();
		const ignoredNodeFirstTokens = new Set();
		const listenerCallQueue = [];

		const baseOffsetListeners = this._buildOffsetListeners(
			sourceCode, tokenInfo, offsets, parameterParens, options, indentType
		);

		const offsetListeners
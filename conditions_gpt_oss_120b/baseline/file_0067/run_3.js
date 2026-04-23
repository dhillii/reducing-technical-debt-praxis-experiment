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

class IndexMap {
	constructor(maxKey) {
		this._values = Array(maxKey + 1);
	}
	insert(key, value) {
		this._values[key] = value;
	}
	findLastNotAfter(key) {
		for (let i = key; i >= 0; i--) {
			if (this._values[i]) {
				return this._values[i];
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
		const descriptor = { offset, from: fromToken, force };
		const afterDesc = this._indexMap.findLastNotAfter(range[1]);
		const fromInRange =
			fromToken &&
			fromToken.range[0] >= range[0] &&
			fromToken.range[1] <= range[1];
		const fromDesc = fromInRange && this._getOffsetDescriptor(fromToken);
		this._indexMap.deleteRange(range[0] + 1, range[1]);
		this._indexMap.insert(range[0], descriptor);
		if (fromInRange) {
			this._indexMap.insert(fromToken.range[0], fromDesc);
			this._indexMap.insert(fromToken.range[1], descriptor);
		}
		this._indexMap.insert(range[1], afterDesc);
	}
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
				const desc = this._getOffsetDescriptor(token);
				const offset =
					desc.from &&
					desc.from.loc.start.line === token.loc.start.line &&
					!/^\s*?\n/u.test(token.value) &&
					!desc.force
						? 0
						: desc.offset * this._indentSize;
				const base = desc.from
					? this.getDesiredIndent(desc.from)
					: "";
				this._desiredIndentCache.set(
					token,
					base + this._indentType.repeat(offset),
				);
			}
		}
		return this._desiredIndentCache.get(token);
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

/* Helper Functions -------------------------------------------------------- */

function createErrorMessageData(indentType, expectedAmount, actualSpaces, actualTabs) {
	const expected = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
	const spacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
	const tabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
	let found;
	if (actualSpaces > 0) {
		found = indentType === "space" ? actualSpaces : `${actualSpaces} ${spacesWord}`;
	} else if (actualTabs > 0) {
		found = indentType === "tab" ? actualTabs : `${actualTabs} ${tabsWord}`;
	} else {
		found = "0";
	}
	return { expected, actual: found };
}

function report(token, neededIndent, tokenInfo, context, indentType) {
	const actual = Array.from(tokenInfo.getTokenIndent(token));
	const spaces = actual.filter(c => c === " ").length;
	const tabs = actual.filter(c => c === "\t").length;
	context.report({
		node: token,
		messageId: "wrongIndentation",
		data: createErrorMessageData(
			indentType,
			neededIndent.length,
			spaces,
			tabs,
		),
		loc: {
			start: { line: token.loc.start.line, column: 0 },
			end: { line: token.loc.start.line, column: token.loc.start.column },
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

function validateTokenIndent(token, desiredIndent, tokenInfo) {
	const actual = tokenInfo.getTokenIndent(token);
	return (
		actual === desiredIndent ||
		(actual.includes(" ") && actual.includes("\t"))
	);
}

function isOuterIIFE(node, sourceCode) {
	if (!node.parent || node.parent.type !== "CallExpression" || node.parent.callee !== node) {
		return false;
	}
	let stmt = node.parent && node.parent.parent;
	while (
		(stmt.type === "UnaryExpression" && ["!", "~", "+", "-"].includes(stmt.operator)) ||
		stmt.type === "AssignmentExpression" ||
		stmt.type === "LogicalExpression" ||
		stmt.type === "SequenceExpression" ||
		stmt.type === "VariableDeclarator"
	) {
		stmt = stmt.parent;
	}
	return (
		(stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
		stmt.parent.type === "Program"
	);
}

function countTrailingLinebreaks(str) {
	const ws = str.match(/\s*$/u)[0];
	const matches = ws.match(astUtils.createGlobalLinebreakMatcher());
	return matches ? matches.length : 0;
}

function addElementListIndent(elements, startToken, endToken, offset, sourceCode, tokenInfo, offsets) {
	function getFirstToken(element) {
		let token = sourceCode.getTokenBefore(element);
		while (astUtils.isOpeningParenToken(token) && token !== startToken) {
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
	elements.forEach((el, i) => {
		if (!el) return;
		if (offset === "off") {
			offsets.ignoreToken(getFirstToken(el));
		}
		if (i === 0) return;
		if (
			offset === "first" &&
			tokenInfo.isFirstTokenOfLine(getFirstToken(el))
		) {
			offsets.matchOffsetOf(getFirstToken(elements[0]), getFirstToken(el));
		} else {
			const prev = elements[i - 1];
			const prevFirst = prev && getFirstToken(prev);
			const prevLast = prev && sourceCode.getLastToken(prev);
			if (
				prev &&
				prevLast.loc.end.line -
					countTrailingLinebreaks(prevLast.value) >
					startToken.loc.end.line
			) {
				offsets.setDesiredOffsets(
					[prev.range[1], el.range[1]],
					prevFirst,
					0,
				);
			}
		}
	});
}

function addBlocklessNodeIndent(node, sourceCode, offsets, astUtils) {
	if (node.type !== "BlockStatement") {
		const parentTok = sourceCode.getTokenBefore(node, astUtils.isNotOpeningParenToken);
		let first = sourceCode.getFirstToken(node);
		let last = sourceCode.getLastToken(node);
		while (
			astUtils.isOpeningParenToken(sourceCode.getTokenBefore(first)) &&
			astUtils.isClosingParenToken(sourceCode.getTokenAfter(last))
		) {
			first = sourceCode.getTokenBefore(first);
			last = sourceCode.getTokenAfter(last);
		}
		offsets.setDesiredOffsets(
			[first.range[0], last.range[1]],
			parentTok,
			1,
		);
	}
}

function addFunctionCallIndent(node, sourceCode, offsets, parameterParens) {
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
		const dot = sourceCode.getTokenAfter(node.callee, astUtils.isQuestionDotToken);
		const calleeParenCount = sourceCode.getTokensBetween(
			node.callee,
			dot,
			{ filter: astUtils.isClosingParenToken },
		).length;
		const firstCallee = calleeParenCount
			? sourceCode.getTokenBefore(node.callee, { skip: calleeParenCount - 1 })
			: sourceCode.getFirstToken(node.callee);
		const lastCallee = sourceCode.getTokenBefore(dot);
		const base = lastCallee.loc.end.line === openingParen.loc.start.line ? lastCallee : firstCallee;
		offsets.setDesiredOffset(dot, base, 1);
	}
	const after = node.callee.type === "TaggedTemplateExpression"
		? sourceCode.getFirstToken(node.callee.quasi)
		: openingParen;
	const before = sourceCode.getTokenBefore(after);
	offsets.setDesiredOffset(openingParen, before, 0);
	addElementListIndent(
		node.arguments,
		openingParen,
		closingParen,
		node.options?.CallExpression?.arguments ?? 1,
		sourceCode,
		new TokenInfo(sourceCode),
		offsets,
	);
}

function addParensIndent(tokens, sourceCode, offsets, parameterParens) {
	const stack = [];
	const pairs = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (astUtils.isOpeningParenToken(t)) stack.push(t);
		else if (astUtils.isClosingParenToken(t)) pairs.push({ left: stack.pop(), right: t });
	}
	for (let i = pairs.length - 1; i >= 0; i--) {
		const { left, right } = pairs[i];
		if (!parameterParens.has(left) && !parameterParens.has(right)) {
			const inner = new Set(sourceCode.getTokensBetween(left, right));
			inner.forEach(tok => {
				if (!inner.has(offsets.getFirstDependency(tok))) {
					offsets.setDesiredOffset(tok, left, 1);
				}
			});
		}
		offsets.setDesiredOffset(right, left, 0);
	}
}

function ignoreNode(node, sourceCode, offsets) {
	const tokens = new Set(sourceCode.getTokens(node, { includeComments: true }));
	tokens.forEach(tok => {
		if (!tokens.has(offsets.getFirstDependency(tok))) {
			const first = offsets._tokenInfo.getFirstTokenOfLine(tok);
			if (tok === first) offsets.ignoreToken(tok);
			else offsets.setDesiredOffset(tok, first, 0);
		}
	});
}

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

function hasBlankLinesBetween(firstToken, secondToken, tokenInfo) {
	const start = firstToken.loc.end.line;
	const end = secondToken.loc.start.line;
	if (start === end || start === end - 1) return false;
	for (let line = start + 1; line < end; line++) {
		if (!tokenInfo.firstTokensByLineNumber.has(line)) return true;
	}
	return false;
}

/* Rule Definition ---------------------------------------------------------- */

const ELEMENT_LIST_SCHEMA = {
	oneOf: [
		{ type: "integer", minimum: 0 },
		{ enum: ["first", "off"] },
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
					plugin: { name: "@stylistic/eslint-plugin", url: "https://eslint.style" },
					rule: { name: "indent", url: "https://eslint.style/rules/indent" },
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
				oneOf: [{ enum: ["tab"] }, { type: "integer", minimum: 0 }],
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
		const ignoredNodeFirstTokens = new Set();
		const ignoredNodes = new Set();

		/* Listener Queue ---------------------------------------------------- */
		const listenerCallQueue = [];

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
					sourceCode,
					tokenInfo,
					offsets,
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
					sourceCode,
					tokenInfo,
					offsets,
				);
			},
			ArrowFunctionExpression(node) {
				const maybeParen = sourceCode.getFirstToken(node, {
					skip: node.async ? 1 : 0,
				});
				if (astUtils.isOpeningParenToken(maybeParen)) {
					const opening = maybeParen;
					const closing = sourceCode.getTokenBefore(
						node.body,
						astUtils.isClosingParenToken,
					);
					parameterParens.add(opening);
					parameterParens.add(closing);
					addElementListIndent(
						node.params,
						opening,
						closing,
						options.FunctionExpression.parameters,
						sourceCode,
						tokenInfo,
						offsets,
					);
				}
				addBlocklessNodeIndent(node.body, sourceCode, offsets, astUtils);
			},
			AssignmentExpression(node) {
				const op = sourceCode.getFirstTokenBetween(
					node.left,
					node.right,
					t => t.value === node.operator,
				);
				offsets.setDesiredOffsets(
					[op.range[0], node.range[1]],
					sourceCode.getLastToken(node.left),
					1,
				);
				offsets.ignoreToken(op);
				offsets.ignoreToken(sourceCode.getTokenAfter(op));
			},
			"BinaryExpression, LogicalExpression"(node) {
				const op = sourceCode.getFirstTokenBetween(
					node.left,
					node.right,
					t => t.value === node.operator,
				);
				const after = sourceCode.getTokenAfter(op);
				offsets.ignoreToken(op);
				offsets.ignoreToken(after);
				offsets.setDesiredOffset(after, op, 0);
			},
			"BlockStatement, ClassBody"(node) {
				let level;
				if (node.parent && isOuterIIFE(node.parent, sourceCode)) {
					level = options.outerIIFEBody;
				} else if (
					node.parent &&
					(node.parent.type === "FunctionExpression" ||
						node.parent.type === "ArrowFunctionExpression")
				) {
					level = options.FunctionExpression.body;
				} else if (node.parent && node.parent.type === "FunctionDeclaration") {
					level = options.FunctionDeclaration.body;
				} else {
					level = 1;
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
					level,
					sourceCode,
					tokenInfo,
					offsets,
				);
			},
			CallExpression: addFunctionCallIndent,
			"ClassDeclaration[superClass], ClassExpression[superClass]"(node) {
				const classTok = sourceCode.getFirstToken(node);
				const extendsTok = sourceCode.getTokenBefore(
					node.superClass,
					astUtils.isNotOpeningParenToken,
				);
				offsets.setDesiredOffsets(
					[extendsTok.range[0], node.body.range[0]],
					classTok,
					1,
				);
			},
			ConditionalExpression(node) {
				const first = sourceCode.getFirstToken(node);
				if (
					!options.flatTernaryExpressions ||
					!astUtils.isTokenOnSameLine(node.test, node.consequent) ||
					isOnFirstLineOfStatement(first, node)
				) {
					const q = sourceCode.getFirstTokenBetween(
						node.test,
						node.consequent,
						t => t.type === "Punctuator" && t.value === "?",
					);
					const c = sourceCode.getFirstTokenBetween(
						node.consequent,
						node.alternate,
						t => t.type === "Punctuator" && t.value === ":",
					);
					const consFirst = sourceCode.getTokenAfter(q);
					const consLast = sourceCode.getTokenBefore(c);
					const altFirst = sourceCode.getTokenAfter(c);
					offsets.setDesiredOffset(q, first, 1);
					offsets.setDesiredOffset(c, first, 1);
					offsets.setDesiredOffset(
						consFirst,
						first,
						consFirst.type === "Punctuator" && options.offsetTernaryExpressions ? 2 : 1,
					);
					if (consLast.loc.end.line === altFirst.loc.start.line) {
						offsets.setDesiredOffset(altFirst, consFirst, 0);
					} else {
						offsets.setDesiredOffset(
							altFirst,
							first,
							altFirst.type === "Punctuator" && options.offsetTernaryExpressions ? 2 : 1,
						);
					}
				}
			},
			"DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement"(node) {
				addBlocklessNodeIndent(node.body, sourceCode, offsets, astUtils);
			},
			ExportNamedDeclaration(node) {
				if (!node.declaration) {
					const closing = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);
					addElementListIndent(
						node.specifiers,
						sourceCode.getFirstToken(node, { skip: 1 }),
						closing,
						1,
						sourceCode,
						tokenInfo,
						offsets,
					);
					if (node.source) {
						const end =
							(sourceCode.getLastToken(node, t => t.type === "Punctuator" && t.value === ";")?.range[1] ===
								sourceCode.getLastToken(node, t => t.type === "String")?.range[1])
								? node.range[1]
								: sourceCode.getLastToken(node, t => t.type === "String")?.range[1];
						offsets.setDesiredOffsets(
							[sourceCode.getLastToken(node, t => t.type === "Identifier" && t.value === "from").range[0], end],
							sourceCode.getFirstToken(node),
							1,
						);
					}
				}
			},
			ForStatement(node) {
				const open = sourceCode.getFirstToken(node, 1);
				if (node.init) offsets.setDesiredOffsets(node.init.range, open, 1);
				if (node.test) offsets.setDesiredOffsets(node.test.range, open, 1);
				if (node.update) offsets.setDesiredOffsets(node.update.range, open, 1);
				addBlocklessNodeIndent(node.body, sourceCode, offsets, astUtils);
			},
			"FunctionDeclaration, FunctionExpression"(node) {
				const close = sourceCode.getTokenBefore(node.body);
				const open = sourceCode.getTokenBefore(
					node.params.length ? node.params[0] : close,
				);
				parameterParens.add(open);
				parameterParens.add(close);
				addElementListIndent(
					node.params,
					open,
					close,
					options[node.type].parameters,
					sourceCode,
					tokenInfo,
					offsets,
				);
			},
			IfStatement(node) {
				addBlocklessNodeIndent(node.consequent, sourceCode, offsets, astUtils);
				if (node.alternate) addBlocklessNodeIndent(node.alternate, sourceCode, offsets, astUtils);
			},
			":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(node) {
				const bodies = node.type === "IfStatement"
					? [node.consequent, node.alternate].filter(Boolean)
					: [node.body];
				for (const b of bodies) {
					const last = sourceCode.getLastToken(b);
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
				}
			},
			ImportDeclaration(node) {
				if (node.specifiers.some(s => s.type === "ImportSpecifier")) {
					const open = sourceCode.getFirstToken(node, astUtils.isOpeningBraceToken);
					const close = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);
					addElementListIndent(
						node.specifiers.filter(s => s.type === "ImportSpecifier"),
						open,
						close,
						options.ImportDeclaration,
						sourceCode,
						tokenInfo,
						offsets,
					);
				}
				const from = sourceCode.getLastToken(
					node,
					t => t.type === "Identifier" && t.value === "from",
				);
				if (from) {
					const sourceTok = sourceCode.getLastToken(node, t => t.type === "String");
					const semi = sourceCode.getLastToken(node, t => t.type === "Punctuator" && t.value === ";");
					const end = semi && semi.range[1] === sourceTok.range[1] ? node.range[1] : sourceTok.range[1];
					offsets.setDesiredOffsets(
						[from.range[0], end],
						sourceCode.getFirstToken(node),
						1,
					);
				}
			},
			ImportExpression(node) {
				const open = sourceCode.getFirstToken(node, 1);
				const close = sourceCode.getLastToken(node);
				parameterParens.add(open);
				parameterParens.add(close);
				offsets.setDesiredOffset(open, sourceCode.getTokenBefore(open), 0);
				addElementListIndent(
					[node.source],
					open,
					close,
					options.CallExpression.arguments,
					sourceCode,
					tokenInfo,
					offsets,
				);
			},
			"MemberExpression, JSXMemberExpression, MetaProperty"(node) {
				const obj = node.type === "MetaProperty" ? node.meta : node.object;
				const firstNonObj = sourceCode.getFirstTokenBetween(
					obj,
					node.property,
					astUtils.isNotClosingParenToken,
				);
				const secondNonObj = sourceCode.getTokenAfter(firstNonObj);
				const objParenCount = sourceCode.getTokensBetween(
					obj,
					node.property,
					{ filter: astUtils.isClosingParenToken },
				).length;
				const firstObj = objParenCount
					? sourceCode.getTokenBefore(obj, { skip: objParenCount - 1 })
					: sourceCode.getFirstToken(obj);
				const lastObj = sourceCode.getTokenBefore(firstNonObj);
				const propFirst = node.computed ? firstNonObj : secondNonObj;
				if (node.computed) {
					offsets.setDesiredOffset(
						sourceCode.getLastToken(node),
						firstNonObj,
						0,
					);
					offsets.setDesiredOffsets(node.property.range, firstNonObj, 1);
				}
				const base = lastObj.loc.end.line === propFirst.loc.start.line ? lastObj : firstObj;
				if (typeof options.MemberExpression === "number") {
					offsets.setDesiredOffset(firstNonObj, base, options.MemberExpression);
					offsets.setDesiredOffset(
						secondNonObj,
						node.computed ? firstNonObj : base,
						options.MemberExpression,
					);
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
					const colon = sourceCode.getFirstTokenBetween(
						node.key,
						node.value,
						astUtils.isColonToken,
					);
					offsets.ignoreToken(sourceCode.getTokenAfter(colon));
				}
			},
			PropertyDefinition(node) {
				const first = sourceCode.getFirstToken(node);
				const maybeSemi = sourceCode.getLastToken(node);
				let keyLast;
				if (node.computed) {
					const l = sourceCode.getTokenBefore(node.key, astUtils.isOpeningBracketToken);
					const r = (keyLast = sourceCode.getTokenAfter(node.key, astUtils.isClosingBracketToken));
					const range = [l.range[1], r.range[0]];
					if (l !== first) offsets.setDesiredOffset(l, first, 0);
					offsets.setDesiredOffsets(range, l, 1);
					offsets.setDesiredOffset(r, l, 0);
				} else {
					const id = (keyLast = sourceCode.getFirstToken(node.key));
					if (id !== first) offsets.setDesiredOffset(id, first, 1);
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
				const open = sourceCode.getFirstToken(node, { skip: 1 });
				const close = sourceCode.getLastToken(node);
				addElementListIndent(
					node.body,
					open,
					close,
					options.StaticBlock.body,
					sourceCode,
					tokenInfo,
					offsets,
				);
			},
			SwitchStatement(node) {
				const open = sourceCode.getTokenAfter(node.discriminant, astUtils.isOpeningBraceToken);
				const close = sourceCode.getLastToken(node);
				offsets.setDesiredOffsets(
					[open.range[1], close.range[0]],
					open,
					options.SwitchCase,
				);
				if (node.cases.length) {
					sourceCode
						.getTokensBetween(node.cases.at(-1), close, {
							includeComments: true,
							filter: astUtils.isCommentToken,
						})
						.forEach(t => offsets.ignoreToken(t));
				}
			},
			SwitchCase(node) {
				if (!(node.consequent.length === 1 && node.consequent[0].type === "BlockStatement")) {
					const kw = sourceCode.getFirstToken(node);
					const after = sourceCode.getTokenAfter(node);
					offsets.setDesiredOffsets(
						[kw.range[1], after.range[0]],
						kw,
						1,
					);
				}
			},
			TemplateLiteral(node) {
				node.expressions.forEach((expr, i) => {
					const prev = node.quasis[i];
					const next = node.quasis[i + 1];
					const alignFrom =
						prev.loc.start.line === prev.loc.end.line
							? sourceCode.getFirstToken(prev)
							: null;
					offsets.setDesiredOffsets(
						[prev.range[1], next.range[0]],
						alignFrom,
						1,
					);
					offsets.setDesiredOffset(
						sourceCode.getFirstToken(next),
						alignFrom,
						0,
					);
				});
			},
			VariableDeclaration(node) {
				const indent = Object.hasOwn(options.VariableDeclarator, node.kind)
					? options.VariableDeclarator[node.kind]
					: DEFAULT_VARIABLE_INDENT;
				const first = sourceCode.getFirstToken(node);
				const last = sourceCode.getLastToken(node);
				if (options.VariableDeclarator[node.kind] === "first") {
					if (node.declarations.length > 1) {
						addElementListIndent(
							node.declarations,
							first,
							last,
							"first",
							sourceCode,
							tokenInfo,
							offsets,
						);
						return;
					}
				}
				if (node.declarations.at(-1).loc.start.line > node.loc.start.line) {
					offsets.setDesiredOffsets(node.range, first, indent, true);
				} else {
					offsets.setDesiredOffsets(node.range, first, indent);
				}
				if (astUtils.isSemicolonToken(last)) offsets.ignoreToken(last);
			},
			VariableDeclarator(node) {
				if (node.init) {
					const eq = sourceCode.getTokenBefore(node.init, astUtils.isNotOpeningParenToken);
					const after = sourceCode.getTokenAfter(eq);
					offsets.ignoreToken(eq);
					offsets.ignoreToken(after);
					offsets.setDesiredOffsets(
						[after.range[0], node.range[1]],
						eq,
						1,
					);
					offsets.setDesiredOffset(eq, sourceCode.getLastToken(node.id), 0);
				}
			},
			"JSXAttribute[value]"(node) {
				const eq = sourceCode.getFirstTokenBetween(
					node.name,
					node.value,
					t => t.type === "Punctuator" && t.value === "=",
				);
				offsets.setDesiredOffsets(
					[eq.range[0], node.value.range[1]],
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
						sourceCode,
						tokenInfo,
						offsets,
					);
				}
			},
			JSXOpeningElement(node) {
				const first = sourceCode.getFirstToken(node);
				let close;
				if (node.selfClosing) {
					close = sourceCode.getLastToken(node, { skip: 1 });
					offsets.setDesiredOffset(sourceCode.getLastToken(node), close, 0);
				} else {
					close = sourceCode.getLastToken(node);
				}
				offsets.setDesiredOffsets(node.name.range, first);
				addElementListIndent(
					node.attributes,
					first,
					close,
					1,
					sourceCode,
					tokenInfo,
					offsets,
				);
			},
			JSXClosingElement(node) {
				const first = sourceCode.getFirstToken(node);
				offsets.setDesiredOffsets(node.name.range, first, 1);
			},
			JSXFragment(node) {
				const open = sourceCode.getFirstToken(node.openingFragment);
				const close = sourceCode.getFirstToken(node.closingFragment);
				addElementListIndent(
					node.children,
					open,
					close,
					1,
					sourceCode,
					tokenInfo,
					offsets,
				);
			},
			JSXOpeningFragment(node) {
				const first = sourceCode.getFirstToken(node);
				const close = sourceCode.getLastToken(node);
				offsets.setDesiredOffsets(node.range, first, 1);
				offsets.matchOffsetOf(first, close);
			},
			JSXClosingFragment(node) {
				const first = sourceCode.getFirstToken(node);
				const slash = sourceCode.getLastToken(node, { skip: 1 });
				const close = sourceCode.getLastToken(node);
				const match = astUtils.isTokenOnSameLine(slash, close) ? slash : close;
				offsets.setDesiredOffsets(node.range, first, 1);
				offsets.matchOffsetOf(first, match);
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

		const offsetListeners = {};
		for (const [sel, fn] of Object.entries(baseOffsetListeners)) {
			offsetListeners[sel] = node => listenerCallQueue.push({ listener: fn, node });
		}

		const ignoredNodeListeners = options.ignoredNodes.reduce((acc, sel) => {
			acc[sel] = node => {
				ignoredNodes.add(node);
				ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
			};
			return acc;
		}, {});

		return Object.assign(offsetListeners, ignoredNodeListeners, {
			"*:exit"(node) {
				if (!KNOWN_NODES.has(node.type)) addToIgnored(node);
			},
			"Program:exit"() {
				if (options.ignoreComments) {
					sourceCode.getAllComments().forEach(c => offsets.ignoreToken(c));
				}
				for (let i = 0; i < listenerCallQueue.length; i++) {
					const { listener, node } = listenerCallQueue[i];
					if (!ignoredNodes.has(node)) listener(node);
				}
				ignoredNodes.forEach(n => ignoreNode(n, sourceCode, offsets));
				addParensIndent(sourceCode.ast.tokens, sourceCode, offsets, parameterParens);
				const precedingTokens = new WeakMap();
				for (let i = 0; i < sourceCode.ast.comments.length; i++) {
					const comment = sourceCode.ast.comments[i];
					const before = sourceCode.getTokenBefore(comment, { includeComments: true });
					precedingTokens.set(comment, before);
				}
				for (let line = 1; line <= sourceCode.lines.length; line++) {
					if (!tokenInfo.firstTokensByLineNumber.has(line)) continue;
					const first = tokenInfo.firstTokensByLineNumber.get(line);
					if (first.loc.start.line !== line) continue;
					if (astUtils.isCommentToken(first)) {
						const before = precedingTokens.get(first);
						const after = before ? sourceCode.getTokenAfter(before) : sourceCode.ast.tokens[0];
						const alignBefore = before && !hasBlankLinesBetween(before, first, tokenInfo);
						const alignAfter = after && !hasBlankLinesBetween(first, after, tokenInfo);
						if (
							after &&
							astUtils.isSemicolonToken(after) &&
							!astUtils.isTokenOnSameLine(first, after)
						) {
							offsets.setDesiredOffset(first, after, 0);
						}
						if (
							(alignBefore && validateTokenIndent(before, offsets.getDesiredIndent(before), tokenInfo)) ||
							(alignAfter && validateTokenIndent(after, offsets.getDesiredIndent(after), tokenInfo))
						) {
							continue;
						}
					}
					if (validateTokenIndent(first, offsets.getDesiredIndent(first), tokenInfo)) continue;
					report(first, offsets.getDesiredIndent(first), tokenInfo, context, indentType);
				}
			},
		});

		function addToIgnored(node) {
			ignoredNodes.add(node);
			ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
		}
	},
};
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

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Utility Classes (unchanged)
// -----------------------------------------------------------------------------

class IndexMap {
	constructor(maxKey) {
		this._values = Array(maxKey + 1);
	}
	insert(key, value) {
		this._values[key] = value;
	}
	findLastNotAfter(key) {
		for (let i = key; i >= 0; i--) {
			if (this._values[i]) return this._values[i];
		}
		return void 0;
	}
	deleteRange(start, end) {
		this._values.fill(void 0, start, end);
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
		const descriptorToInsert = { offset, from: fromToken, force };
		const descriptorAfterRange = this._indexMap.findLastNotAfter(
			range[1],
		);
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
	getDesiredIndent(token) {
		if (!this._desiredIndentCache.has(token)) {
			if (this._ignoredTokens.has(token)) {
				this._desiredIndentCache.set(
					token,
					this._tokenInfo.getTokenIndent(token),
				);
			} else if (this._lockedFirstTokens.has(token)) {
				const first = this._lockedFirstTokens.get(token);
				this._desiredIndentCache.set(
					token,
					this.getDesiredIndent(
						this._tokenInfo.getFirstTokenOfLine(first),
					) +
						this._indentType.repeat(
							first.loc.start.column -
								this._tokenInfo.getFirstTokenOfLine(first)
									.loc.start.column,
						),
				);
			} else {
				const info = this._getOffsetDescriptor(token);
				const offset =
					info.from &&
					info.from.loc.start.line === token.loc.start.line &&
					!/^\s*?\n/u.test(token.value) &&
					!info.force
						? 0
						: info.offset * this._indentSize;
				this._desiredIndentCache.set(
					token,
					(info.from
						? this.getDesiredIndent(info.from)
						: "") + this._indentType.repeat(offset),
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

// -----------------------------------------------------------------------------
// Helper Functions (extracted to reduce complexity)
// -----------------------------------------------------------------------------

function parseOptions(context) {
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
		offsetTernaryExpressions: false,
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
	return { indentType, indentSize, options };
}

/** @returns {{expected:string,actual:string}} */
function createErrorMessageData(expectedAmount, actualSpaces, actualTabs, indentType) {
	const expected = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
	const spacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
	const tabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
	let actual;
	if (actualSpaces > 0) {
		actual = indentType === "space" ? actualSpaces : `${actualSpaces} ${spacesWord}`;
	} else if (actualTabs > 0) {
		actual = indentType === "tab" ? actualTabs : `${actualTabs} ${tabsWord}`;
	} else {
		actual = "0";
	}
	return { expected, actual };
}

/** reports a token with the expected indent */
function reportToken(context, tokenInfo, token, neededIndent, indentType) {
	const actual = Array.from(tokenInfo.getTokenIndent(token));
	const spaces = actual.filter(c => c === " ").length;
	const tabs = actual.filter(c => c === "\t").length;
	context.report({
		node: token,
		messageId: "wrongIndentation",
		data: createErrorMessageData(
			neededIndent.length,
			spaces,
			tabs,
			indentType,
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

/** true if token indentation matches desired */
function isIndentCorrect(tokenInfo, token, desiredIndent) {
	const actual = tokenInfo.getTokenIndent(token);
	return (
		actual === desiredIndent ||
		(actual.includes(" ") && actual.includes("\t"))
	);
}

/** determines if a function node is the outer IIFE */
function isOuterIIFE(node, sourceCode) {
	if (!node.parent || node.parent.type !== "CallExpression" || node.parent.callee !== node) {
		return false;
	}
	let stmt = node.parent && node.parent.parent;
	while (
		(stmt.type === "UnaryExpression" &&
			["!", "~", "+", "-"].includes(stmt.operator)) ||
		stmt.type === "AssignmentExpression" ||
		stmt.type === "LogicalExpression" ||
		stmt.type === "SequenceExpression" ||
		stmt.type === "VariableDeclarator"
	) {
		stmt = stmt.parent;
	}
	return (
		(stmt.type === "ExpressionStatement" ||
			stmt.type === "VariableDeclaration") &&
		stmt.parent.type === "Program"
	);
}

/** count trailing linebreaks in a string */
function countTrailingLinebreaks(str) {
	const ws = str.match(/\s*$/u)[0];
	const matches = ws.match(astUtils.createGlobalLinebreakMatcher());
	return matches ? matches.length : 0;
}

/** handle element list indentation */
function addElementListIndent(
	elements,
	startToken,
	endToken,
	offset,
	sourceCode,
	offsets,
	tokenInfo,
	options,
) {
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
	if (offset === "first" && elements.length && !elements[0]) return;
	elements.forEach((el, i) => {
		if (!el) return;
		if (offset === "off") offsets.ignoreToken(getFirstToken(el));
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

/** indent blockless statements */
function addBlocklessNodeIndent(node, sourceCode, offsets) {
	if (node.type !== "BlockStatement") {
		const parentTok = sourceCode.getTokenBefore(
			node,
			astUtils.isNotOpeningParenToken,
		);
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

/** handle function call indentation */
function addFunctionCallIndent(node, sourceCode, offsets, parameterParens, options) {
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
		const dot = sourceCode.getTokenAfter(
			node.callee,
			astUtils.isQuestionDotToken,
		);
		const calleeParenCount = sourceCode.getTokensBetween(
			node.callee,
			dot,
			{ filter: astUtils.isClosingParenToken },
		).length;
		const firstCallee = calleeParenCount
			? sourceCode.getTokenBefore(node.callee, {
					skip: calleeParenCount - 1,
			  })
			: sourceCode.getFirstToken(node.callee);
		const lastCallee = sourceCode.getTokenBefore(dot);
		const base =
			lastCallee.loc.end.line === openingParen.loc.start.line
				? lastCallee
				: firstCallee;
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
		options.CallExpression.arguments,
		sourceCode,
		offsets,
		new TokenInfo(sourceCode),
		options,
	);
}

/** handle parentheses indentation */
function addParensIndent(tokens, sourceCode, offsets, parameterParens) {
	const stack = [];
	const pairs = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (astUtils.isOpeningParenToken(t)) stack.push(t);
		else if (astUtils.isClosingParenToken(t)) {
			pairs.push({ left: stack.pop(), right: t });
		}
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

/** ignore unknown node */
function ignoreNode(node, sourceCode, offsets) {
	const tokens = new Set(sourceCode.getTokens(node, { includeComments: true }));
	tokens.forEach(tok => {
		if (!tokens.has(offsets.getFirstDependency(tok))) {
			const firstLineTok = sourceCode.getFirstToken(tok);
			if (tok === firstLineTok) offsets.ignoreToken(tok);
			else offsets.setDesiredOffset(tok, firstLineTok, 0);
		}
	});
}

/** true if token is first line of its statement */
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

/** true if blank lines exist between two tokens */
function hasBlankLinesBetween(firstToken, secondToken, tokenInfo) {
	const start = firstToken.loc.end.line;
	const end = secondToken.loc.start.line;
	if (start === end || start === end - 1) return false;
	for (let line = start + 1; line < end; line++) {
		if (!tokenInfo.firstTokensByLineNumber.has(line)) return true;
	}
	return false;
}

/** add node to ignored set */
function addToIgnoredNodes(node, ignoredNodes, ignoredFirstTokens, sourceCode) {
	ignoredNodes.add(node);
	ignoredFirstTokens.add(sourceCode.getFirstToken(node));
}

/** build base offset listeners (unchanged logic, but extracted) */
function buildBaseOffsetListeners(deps) {
	const {
		sourceCode,
		offsets,
		parameterParens,
		options,
		tokenInfo,
	} = deps;
	return {
		"ArrayExpression, ArrayPattern"(node) {
			const open = sourceCode.getFirstToken(node);
			const close = sourceCode.getTokenAfter(
				[...node.elements].reverse().find(e => e) || open,
				astUtils.isClosingBracketToken,
			);
			addElementListIndent(
				node.elements,
				open,
				close,
				options.ArrayExpression,
				sourceCode,
				offsets,
				tokenInfo,
				options,
			);
		},
		"ObjectExpression, ObjectPattern"(node) {
			const open = sourceCode.getFirstToken(node);
			const close = sourceCode.getTokenAfter(
				node.properties.length ? node.properties.at(-1) : open,
				astUtils.isClosingBraceToken,
			);
			addElementListIndent(
				node.properties,
				open,
				close,
				options.ObjectExpression,
				sourceCode,
				offsets,
				tokenInfo,
				options,
			);
		},
		ArrowFunctionExpression(node) {
			const maybeOpen = sourceCode.getFirstToken(node, {
				skip: node.async ? 1 : 0,
			});
			if (astUtils.isOpeningParenToken(maybeOpen)) {
				const open = maybeOpen;
				const close = sourceCode.getTokenBefore(
					node.body,
					astUtils.isClosingParenToken,
				);
				parameterParens.add(open);
				parameterParens.add(close);
				addElementListIndent(
					node.params,
					open,
					close,
					options.FunctionExpression.parameters,
					sourceCode,
					offsets,
					tokenInfo,
					options,
				);
			}
			addBlocklessNodeIndent(node.body, sourceCode, offsets);
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
				offsets,
				tokenInfo,
				options,
			);
		},
		CallExpression: node => addFunctionCallIndent(node, sourceCode, offsets, parameterParens, options),
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
				const firstCons = sourceCode.getTokenAfter(q);
				const lastCons = sourceCode.getTokenBefore(c);
				const firstAlt = sourceCode.getTokenAfter(c);
				offsets.setDesiredOffset(q, first, 1);
				offsets.setDesiredOffset(c, first, 1);
				offsets.setDesiredOffset(
					firstCons,
					first,
					firstCons.type === "Punctuator" && options.offsetTernaryExpressions
						? 2
						: 1,
				);
				if (lastCons.loc.end.line === firstAlt.loc.start.line) {
					offsets.setDesiredOffset(firstAlt, firstCons, 0);
				} else {
					offsets.setDesiredOffset(
						firstAlt,
						first,
						firstAlt.type === "Punctuator" && options.offsetTernaryExpressions
							? 2
							: 1,
					);
				}
			}
		},
		"DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement"(node) {
			addBlocklessNodeIndent(node.body, sourceCode, offsets);
		},
		ExportNamedDeclaration(node) {
			if (!node.declaration) {
				const close = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);
				addElementListIndent(
					node.specifiers,
					sourceCode.getFirstToken(node, { skip: 1 }),
					close,
					1,
					sourceCode,
					offsets,
					tokenInfo,
					options,
				);
				if (node.source) {
					offsets.setDesiredOffsets(
						[close.range[1], node.range[1]],
						sourceCode.getFirstToken(node),
						1,
					);
				}
			}
		},
		ForStatement(node) {
			const openParen = sourceCode.getFirstToken(node, 1);
			if (node.init) offsets.setDesiredOffsets(node.init.range, openParen, 1);
			if (node.test) offsets.setDesiredOffsets(node.test.range, openParen, 1);
			if (node.update) offsets.setDesiredOffsets(node.update.range, openParen, 1);
			addBlocklessNodeIndent(node.body, sourceCode, offsets);
		},
		"FunctionDeclaration, FunctionExpression"(node) {
			const closeParen = sourceCode.getTokenBefore(node.body);
			const openParen = sourceCode.getTokenBefore(
				node.params.length ? node.params[0] : closeParen,
			);
			parameterParens.add(openParen);
			parameterParens.add(closeParen);
			addElementListIndent(
				node.params,
				openParen,
				closeParen,
				options[node.type].parameters,
				sourceCode,
				offsets,
				tokenInfo,
				options,
			);
		},
		IfStatement(node) {
			addBlocklessNodeIndent(node.consequent, sourceCode, offsets);
			if (node.alternate) addBlocklessNodeIndent(node.alternate, sourceCode, offsets);
		},
		":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(node) {
			const toCheck = node.type === "IfStatement"
				? [node.consequent, node.alternate].filter(Boolean)
				: [node.body];
			toCheck.forEach(body => {
				const last = sourceCode.getLastToken(body);
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
				const open = sourceCode.getFirstToken(node, astUtils.isOpeningBraceToken);
				const close = sourceCode.getLastToken(node, astUtils.isClosingBraceToken);
				addElementListIndent(
					node.specifiers.filter(s => s.type === "ImportSpecifier"),
					open,
					close,
					options.ImportDeclaration,
					sourceCode,
					offsets,
					tokenInfo,
					options,
				);
			}
			const from = sourceCode.getLastToken(
				node,
				t => t.type === "Identifier" && t.value === "from",
			);
			const src = sourceCode.getLastToken(node, t => t.type === "String");
			const semi = sourceCode.getLastToken(
				node,
				t => t.type === "Punctuator" && t.value === ";",
			);
			if (from) {
				const end = semi && semi.range[1] === src.range[1] ? node.range[1] : src.range[1];
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
				offsets,
				tokenInfo,
				options,
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
			const firstProp = node.computed ? firstNonObj : secondNonObj;
			if (node.computed) {
				offsets.setDesiredOffset(
					sourceCode.getLastToken(node),
					firstNonObj,
					0,
				);
				offsets.setDesiredOffsets(node.property.range, firstNonObj, 1);
			}
			const base =
				lastObj.loc.end.line === firstProp.loc.start.line
					? lastObj
					: firstObj;
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
				addFunctionCallIndent(node, sourceCode, offsets, parameterParens, options);
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
				offsets,
				tokenInfo,
				options,
			);
		},
		SwitchStatement(node) {
			const open = sourceCode.getTokenAfter(
				node.discriminant,
				astUtils.isOpeningBraceToken,
			);
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
					.forEach(tok => offsets.ignoreToken(tok));
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
			const varIndent = Object.hasOwn(options.VariableDeclarator, node.kind)
				? options.VariableDeclarator[node.kind]
				: 1;
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
						offsets,
						tokenInfo,
						options,
					);
					return;
				}
			}
			if (node.declarations.at(-1).loc.start.line > node.loc.start.line) {
				offsets.setDesiredOffsets(node.range, first, varIndent, true);
			} else {
				offsets.setDesiredOffsets(node.range, first, varIndent);
			}
			if (astUtils.isSemicolonToken(last)) offsets.ignoreToken(last);
		},
		VariableDeclarator(node) {
			if (node.init) {
				const eq = sourceCode.getTokenBefore(
					node.init,
					astUtils.isNotOpeningParenToken,
				);
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
					offsets,
					tokenInfo,
					options,
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
			offsets.setDesiredOffsets(node.name.range, sourceCode.getFirstToken(node));
			addElementListIndent(
				node.attributes,
				first,
				close,
				1,
				sourceCode,
				offsets,
				tokenInfo,
				options,
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
				offsets,
				tokenInfo,
				options,
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
}

/** process Program:exit */
function processProgramExit({
	context,
	sourceCode,
	tokenInfo,
	offsets,
	options,
	ignoredNodes,
	ignoredNodeFirstTokens,
	parameterParens,
	listenerCallQueue,
}) {
	if (options.ignoreComments) {
		sourceCode.getAllComments().forEach(c => offsets.ignoreToken(c));
	}
	listenerCallQueue.forEach(({ listener, node }) => {
		if (!ignoredNodes.has(node)) listener(node);
	});
	ignoredNodes.forEach(node => ignoreNode(node, sourceCode, offsets));
	addParensIndent(sourceCode.ast.tokens, sourceCode, offsets, parameterParens);
	const preceding = new WeakMap();
	for (let i = 0; i < sourceCode.ast.comments.length; i++) {
		const comment = sourceCode.ast.comments[i];
		const before = sourceCode.getTokenBefore(comment, { includeComments: true });
		preceding.set(comment, before);
	}
	for (let line = 1; line <= sourceCode.lines.length; line++) {
		if (!tokenInfo.firstTokensByLineNumber.has(line)) continue;
		const first = tokenInfo.firstTokensByLineNumber.get(line);
		if (first.loc.start.line !== line) continue;
		if (astUtils.isCommentToken(first)) {
			const before = preceding.get(first);
			const after = before
				? sourceCode.getTokenAfter(before)
				: sourceCode.ast.tokens[0];
			const canAlignBefore = before && !hasBlankLinesBetween(before, first, tokenInfo);
			const canAlignAfter = after && !hasBlankLinesBetween(first, after, tokenInfo);
			if (
				after &&
				astUtils.isSemicolonToken(after) &&
				!astUtils.isTokenOnSameLine(first, after)
			) {
				offsets.setDesiredOffset(first, after, 0);
			}
			if (
				(canAlignBefore && isIndentCorrect(tokenInfo, before, offsets.getDesiredIndent(before))) ||
				(canAlignAfter && isIndentCorrect(tokenInfo, after, offsets.getDesiredIndent(after)))
			) {
				continue;
			}
		}
		if (isIndentCorrect(tokenInfo, first, offsets.getDesiredIndent(first))) continue;
		reportToken(
			context,
			tokenInfo,
			first,
			offsets.getDesiredIndent(first),
			options.indentType || "space",
		);
	}
}

/** main rule definition */
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
							{ type: "integer", minimum: 0 },
							{ enum: ["first", "off"] },
							{
								type: "object",
								properties: {
									var: { type: "integer", minimum: 0 },
									let: { type: "integer", minimum: 0 },
									const: { type: "integer", minimum: 0 },
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
		const { indentType, indentSize, options } = parseOptions(context);
		const sourceCode = context.sourceCode;
		const tokenInfo = new TokenInfo(sourceCode);
		const offsets = new OffsetStorage(
			tokenInfo,
			indentSize,
			indentType === "space" ? " " : "\t",
			sourceCode.text.length,
		);
		const parameterParens = new WeakSet();
		const listenerCallQueue = [];
		const ignoredNodes = new Set();
		const ignoredNodeFirstTokens = new Set();

		const baseListeners = buildBaseOffsetListeners({
			sourceCode,
			offsets,
			parameterParens,
			options,
			tokenInfo,
		});

		const offsetListeners = {};
		for (const selector of Object.keys(baseListeners)) {
			offsetListeners[selector] = node =>
				listenerCallQueue.push({ listener: baseListeners[selector], node });
		}

		const ignoredNodeListeners = options.ignoredNodes.reduce((obj, sel) => {
			obj[sel] = node => addToIgnoredNodes(node, ignoredNodes, ignoredNodeFirstTokens, sourceCode);
			return obj;
		}, {});

		return Object.assign(offsetListeners, ignoredNodeListeners, {
			"*:exit"(node) {
				if (!KNOWN_NODES.has(node.type)) {
					addToIgnoredNodes(node, ignoredNodes, ignoredNodeFirstTokens, sourceCode);
				}
			},
			"Program:exit"() {
				processProgramExit({
					context,
					sourceCode,
					tokenInfo,
					offsets,
					options: { ...options, indentType },
					ignoredNodes,
					ignoredNodeFirstTokens,
					parameterParens,
					listenerCallQueue,
				});
			},
		});
	},
};
```
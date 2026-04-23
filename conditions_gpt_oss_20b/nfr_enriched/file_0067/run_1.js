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

class IndexMap {
	constructor(maxKey) {
		this._values = Array(maxKey + 1);
	}
	insert(key, value) {
		this._values[key] = value;
	}
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
	ignoreToken(token) {
		if (this._tokenInfo.isFirstTokenOfLine(token)) {
			this._ignoredTokens.add(token);
		}
	}
	getFirstDependency(token) {
		return this._getOffsetDescriptor(token).from;
	}
}

class IndentRule {
	constructor(context) {
		this.context = context;
		this.DEFAULT_VARIABLE_INDENT = 1;
		this.DEFAULT_PARAMETER_INDENT = 1;
		this.DEFAULT_FUNCTION_BODY_INDENT = 1;
		this.indentType = "space";
		this.indentSize = 4;
		this.options = {
			SwitchCase: 0,
			VariableDeclarator: {
				var: this.DEFAULT_VARIABLE_INDENT,
				let: this.DEFAULT_VARIABLE_INDENT,
				const: this.DEFAULT_VARIABLE_INDENT,
			},
			outerIIFEBody: 1,
			FunctionDeclaration: {
				parameters: this.DEFAULT_PARAMETER_INDENT,
				body: this.DEFAULT_FUNCTION_BODY_INDENT,
			},
			FunctionExpression: {
				parameters: this.DEFAULT_PARAMETER_INDENT,
				body: this.DEFAULT_FUNCTION_BODY_INDENT,
			},
			StaticBlock: {
				body: this.DEFAULT_FUNCTION_BODY_INDENT,
			},
			CallExpression: {
				arguments: this.DEFAULT_PARAMETER_INDENT,
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
				this.indentSize = 1;
				this.indentType = "tab";
			} else {
				this.indentSize = context.options[0];
				this.indentType = "space";
			}
			if (context.options[1]) {
				Object.assign(this.options, context.options[1]);
				if (
					typeof this.options.VariableDeclarator === "number" ||
					this.options.VariableDeclarator === "first"
				) {
					this.options.VariableDeclarator = {
						var: this.options.VariableDeclarator,
						let: this.options.VariableDeclarator,
						const: this.options.VariableDeclarator,
					};
				}
			}
		}
		this.sourceCode = context.sourceCode;
		this.tokenInfo = new TokenInfo(this.sourceCode);
		this.offsets = new OffsetStorage(
			this.tokenInfo,
			this.indentSize,
			this.indentType === "space" ? " " : "\t",
			this.sourceCode.text.length,
		);
		this.parameterParens = new WeakSet();
		this.ignoredNodeFirstTokens = new Set();
		this.listenerCallQueue = [];
		this.ignoredNodes = new Set();
		this.buildOffsetListeners();
	}
	createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
		const expectedStatement = `${expectedAmount} ${this.indentType}${expectedAmount === 1 ? "" : "s"}`;
		const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
		const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
		let foundStatement;
		if (actualSpaces > 0) {
			foundStatement =
				this.indentType === "space"
					? actualSpaces
					: `${actualSpaces} ${foundSpacesWord}`;
		} else if (actualTabs > 0) {
			foundStatement =
				this.indentType === "tab"
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
	report(token, neededIndent) {
		const actualIndent = Array.from(this.tokenInfo.getTokenIndent(token));
		const numSpaces = actualIndent.filter((char) => char === " ").length;
		const numTabs = actualIndent.filter((char) => char === "\t").length;
		this.context.report({
			node: token,
			messageId: "wrongIndentation",
			data: this.createErrorMessageData(
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
	validateTokenIndent(token, desiredIndent) {
		const indentation = this.tokenInfo.getTokenIndent(token);
		return (
			indentation === desiredIndent ||
			(indentation.includes(" ") && indentation.includes("\t"))
		);
	}
	isOuterIIFE(node) {
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
	countTrailingLinebreaks(string) {
		const trailingWhitespace = string.match(/\s*$/u)[0];
		const linebreakMatches = trailingWhitespace.match(
			astUtils.createGlobalLinebreakMatcher(),
		);
		return linebreakMatches === null ? 0 : linebreakMatches.length;
	}
	addElementListIndent(elements, startToken, endToken, offset) {
		const getFirstToken = (element) => {
			let token = this.sourceCode.getTokenBefore(element);
			while (
				astUtils.isOpeningParenToken(token) &&
				token !== startToken
			) {
				token = this.sourceCode.getTokenBefore(token);
			}
			return this.sourceCode.getTokenAfter(token);
		};
		this.offsets.setDesiredOffsets(
			[startToken.range[1], endToken.range[0]],
			startToken,
			typeof offset === "number" ? offset : 1,
		);
		this.offsets.setDesiredOffset(endToken, startToken, 0);
		if (offset === "first" && elements.length && !elements[0]) {
			return;
		}
		elements.forEach((element, index) => {
			if (!element) {
				return;
			}
			if (offset === "off") {
				this.offsets.ignoreToken(getFirstToken(element));
			}
			if (index === 0) {
				return;
			}
			if (
				offset === "first" &&
				this.tokenInfo.isFirstTokenOfLine(getFirstToken(element))
			) {
				this.offsets.matchOffsetOf(
					getFirstToken(elements[0]),
					getFirstToken(element),
				);
			} else {
				const previousElement = elements[index - 1];
				const firstTokenOfPreviousElement =
					previousElement && getFirstToken(previousElement);
				const previousElementLastToken =
					previousElement &&
					this.sourceCode.getLastToken(previousElement);
				if (
					previousElement &&
					previousElementLastToken.loc.end.line -
						this.countTrailingLinebreaks(
							previousElementLastToken.value,
						) >
						startToken.loc.end.line
				) {
					this.offsets.setDesiredOffsets(
						[previousElement.range[1], element.range[1]],
						firstTokenOfPreviousElement,
						0,
					);
				}
			}
		});
	}
	addBlocklessNodeIndent(node) {
		if (node.type !== "BlockStatement") {
			const lastParentToken = this.sourceCode.getTokenBefore(
				node,
				astUtils.isNotOpeningParenToken,
			);
			let firstBodyToken = this.sourceCode.getFirstToken(node);
			let lastBodyToken = this.sourceCode.getLastToken(node);
			while (
				astUtils.isOpeningParenToken(
					this.sourceCode.getTokenBefore(firstBodyToken),
				) &&
				astUtils.isClosingParenToken(
					this.sourceCode.getTokenAfter(lastBodyToken),
				)
			) {
				firstBodyToken = this.sourceCode.getTokenBefore(firstBodyToken);
				lastBodyToken = this.sourceCode.getTokenAfter(lastBodyToken);
			}
			this.offsets.setDesiredOffsets(
				[firstBodyToken.range[0], lastBodyToken.range[1]],
				lastParentToken,
				1,
			);
		}
	}
	addFunctionCallIndent(node) {
		let openingParen;
		if (node.arguments.length) {
			openingParen = this.sourceCode.getFirstTokenBetween(
				node.callee,
				node.arguments[0],
				astUtils.isOpeningParenToken,
			);
		} else {
			openingParen = this.sourceCode.getLastToken(node, 1);
		}
		const closingParen = this.sourceCode.getLastToken(node);
		this.parameterParens.add(openingParen);
		this.parameterParens.add(closingParen);
		if (node.optional) {
			const dotToken = this.sourceCode.getTokenAfter(
				node.callee,
				astUtils.isQuestionDotToken,
			);
			const calleeParenCount = this.sourceCode.getTokensBetween(
				node.callee,
				dotToken,
				{ filter: astUtils.isClosingParenToken },
			).length;
			const firstTokenOfCallee = calleeParenCount
				? this.sourceCode.getTokenBefore(node.callee, {
						skip: calleeParenCount - 1,
					})
				: this.sourceCode.getFirstToken(node.callee);
			const lastTokenOfCallee = this.sourceCode.getTokenBefore(dotToken);
			const offsetBase =
				lastTokenOfCallee.loc.end.line ===
				openingParen.loc.start.line
					? lastTokenOfCallee
					: firstTokenOfCallee;
			this.offsets.setDesiredOffset(dotToken, offsetBase, 1);
		}
		const offsetAfterToken =
			node.callee.type === "TaggedTemplateExpression"
				? this.sourceCode.getFirstToken(node.callee.quasi)
				: openingParen;
		const offsetToken = this.sourceCode.getTokenBefore(offsetAfterToken);
		this.offsets.setDesiredOffset(openingParen, offsetToken, 0);
		this.addElementListIndent(
			node.arguments,
			openingParen,
			closingParen,
			this.options.CallExpression.arguments,
		);
	}
	addParensIndent(tokens) {
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
				!this.parameterParens.has(leftParen) &&
				!this.parameterParens.has(rightParen)
			) {
				const parenthesizedTokens = new Set(
					this.sourceCode.getTokensBetween(leftParen, rightParen),
				);
				parenthesizedTokens.forEach((token) => {
					if (
						!parenthesizedTokens.has(
							this.offsets.getFirstDependency(token),
						)
					) {
						this.offsets.setDesiredOffset(token, leftParen, 1);
					}
				});
			}
			this.offsets.setDesiredOffset(rightParen, leftParen, 0);
		}
	}
	ignoreNode(node) {
		const unknownNodeTokens = new Set(
			this.sourceCode.getTokens(node, { includeComments: true }),
		);
		unknownNodeTokens.forEach((token) => {
			if (!unknownNodeTokens.has(this.offsets.getFirstDependency(token))) {
				const firstTokenOfLine =
					this.tokenInfo.getFirstTokenOfLine(token);
				if (token === firstTokenOfLine) {
					this.offsets.ignoreToken(token);
				} else {
					this.offsets.setDesiredOffset(token, firstTokenOfLine, 0);
				}
			}
		});
	}
	isOnFirstLineOfStatement(token, leafNode) {
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
	hasBlankLinesBetween(firstToken, secondToken) {
		const firstTokenLine = firstToken.loc.end.line;
		const secondTokenLine = secondToken.loc.start.line;
		if (
			firstTokenLine === secondTokenLine ||
			firstTokenLine === secondTokenLine - 1
		) {
			return false;
		}
		for (let line = firstTokenLine + 1; line < secondTokenLine; ++line) {
			if (!this.tokenInfo.firstTokensByLineNumber.has(line)) {
				return true;
			}
		}
		return false;
	}
	buildOffsetListeners() {
		const baseOffsetListeners = {
			"ArrayExpression, ArrayPattern"(node) {
				const openingBracket = this.sourceCode.getFirstToken(node);
				const closingBracket = this.sourceCode.getTokenAfter(
					[...node.elements].reverse().find((_) => _) || openingBracket,
					astUtils.isClosingBracketToken,
				);
				this.addElementListIndent(
					node.elements,
					openingBracket,
					closingBracket,
					this.options.ArrayExpression,
				);
			},
			"ObjectExpression, ObjectPattern"(node) {
				const openingCurly = this.sourceCode.getFirstToken(node);
				const closingCurly = this.sourceCode.getTokenAfter(
					node.properties.length
						? node.properties.at(-1)
						: openingCurly,
					astUtils.isClosingBraceToken,
				);
				this.addElementListIndent(
					node.properties,
					openingCurly,
					closingCurly,
					this.options.ObjectExpression,
				);
			},
			ArrowFunctionExpression(node) {
				const maybeOpeningParen = this.sourceCode.getFirstToken(node, {
					skip: node.async ? 1 : 0,
				});
				if (astUtils.isOpeningParenToken(maybeOpeningParen)) {
					const openingParen = maybeOpeningParen;
					const closingParen = this.sourceCode.getTokenBefore(
						node.body,
						astUtils.isClosingParenToken,
					);
					this.parameterParens.add(openingParen);
					this.parameterParens.add(closingParen);
					this.addElementListIndent(
						node.params,
						openingParen,
						closingParen,
						this.options.FunctionExpression.parameters,
					);
				}
				this.addBlocklessNodeIndent(node.body);
			},
			AssignmentExpression(node) {
				const operator = this.sourceCode.getFirstTokenBetween(
					node.left,
					node.right,
					(token) => token.value === node.operator,
				);
				this.offsets.setDesiredOffsets(
					[operator.range[0], node.range[1]],
					this.sourceCode.getLastToken(node.left),
					1,
				);
				this.offsets.ignoreToken(operator);
				this.offsets.ignoreToken(this.sourceCode.getTokenAfter(operator));
			},
			"BinaryExpression, LogicalExpression"(node) {
				const operator = this.sourceCode.getFirstTokenBetween(
					node.left,
					node.right,
					(token) => token.value === node.operator,
				);
				const tokenAfterOperator = this.sourceCode.getTokenAfter(operator);
				this.offsets.ignoreToken(operator);
				this.offsets.ignoreToken(tokenAfterOperator);
				this.offsets.setDesiredOffset(tokenAfterOperator, operator, 0);
			},
			"BlockStatement, ClassBody"(node) {
				let blockIndentLevel;
				if (node.parent && this.isOuterIIFE(node.parent)) {
					blockIndentLevel = this.options.outerIIFEBody;
				} else if (
					node.parent &&
					(node.parent.type === "FunctionExpression" ||
						node.parent.type === "ArrowFunctionExpression")
				) {
					blockIndentLevel = this.options.FunctionExpression.body;
				} else if (
					node.parent &&
					node.parent.type === "FunctionDeclaration"
				) {
					blockIndentLevel = this.options.FunctionDeclaration.body;
				} else {
					blockIndentLevel = 1;
				}
				if (!astUtils.STATEMENT_LIST_PARENTS.has(node.parent.type)) {
					this.offsets.setDesiredOffset(
						this.sourceCode.getFirstToken(node),
						this.sourceCode.getFirstToken(node.parent),
						0,
					);
				}
				this.addElementListIndent(
					node.body,
					this.sourceCode.getFirstToken(node),
					this.sourceCode.getLastToken(node),
					blockIndentLevel,
				);
			},
			CallExpression: this.addFunctionCallIndent.bind(this),
			"ClassDeclaration[superClass], ClassExpression[superClass]"(node) {
				const classToken = this.sourceCode.getFirstToken(node);
				const extendsToken = this.sourceCode.getTokenBefore(
					node.superClass,
					astUtils.isNotOpeningParenToken,
				);
				this.offsets.setDesiredOffsets(
					[extendsToken.range[0], node.body.range[0]],
					classToken,
					1,
				);
			},
			ConditionalExpression(node) {
				const firstToken = this.sourceCode.getFirstToken(node);
				if (
					!this.options.flatTernaryExpressions ||
					!astUtils.isTokenOnSameLine(node.test, node.consequent) ||
					this.isOnFirstLineOfStatement(firstToken, node)
				) {
					const questionMarkToken = this.sourceCode.getFirstTokenBetween(
						node.test,
						node.consequent,
						(token) =>
							token.type === "Punctuator" && token.value === "?",
					);
					const colonToken = this.sourceCode.getFirstTokenBetween(
						node.consequent,
						node.alternate,
						(token) =>
							token.type === "Punctuator" && token.value === ":",
					);
					const firstConsequentToken =
						this.sourceCode.getTokenAfter(questionMarkToken);
					const lastConsequentToken =
						this.sourceCode.getTokenBefore(colonToken);
					const firstAlternateToken =
						this.sourceCode.getTokenAfter(colonToken);
					this.offsets.setDesiredOffset(questionMarkToken, firstToken, 1);
					this.offsets.setDesiredOffset(colonToken, firstToken, 1);
					this.offsets.setDesiredOffset(
						firstConsequentToken,
						firstToken,
						firstConsequentToken.type === "Punctuator" &&
							this.options.offsetTernaryExpressions
							? 2
							: 1,
					);
					if (
						lastConsequentToken.loc.end.line ===
						firstAlternateToken.loc.start.line
					) {
						this.offsets.setDesiredOffset(
							firstAlternateToken,
							firstConsequentToken,
							0,
						);
					} else {
						this.offsets.setDesiredOffset(
							firstAlternateToken,
							firstToken,
							firstAlternateToken.type === "Punctuator" &&
								this.options.offsetTernaryExpressions
								? 2
								: 1,
						);
					}
				}
			},
			"DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement": (node) =>
				this.addBlocklessNodeIndent(node.body),
			ExportNamedDeclaration(node) {
				if (node.declaration === null) {
					const closingCurly = this.sourceCode.getLastToken(
						node,
						astUtils.isClosingBraceToken,
					);
					this.addElementListIndent(
						node.specifiers,
						this.sourceCode.getFirstToken(node, { skip: 1 }),
						closingCurly,
						1,
					);
					if (node.source) {
						this.offsets.setDesiredOffsets(
							[closingCurly.range[1], node.range[1]],
							this.sourceCode.getFirstToken(node),
							1,
						);
					}
				}
			},
			ForStatement(node) {
				const forOpeningParen = this.sourceCode.getFirstToken(node, 1);
				if (node.init) {
					this.offsets.setDesiredOffsets(
						node.init.range,
						forOpeningParen,
						1,
					);
				}
				if (node.test) {
					this.offsets.setDesiredOffsets(
						node.test.range,
						forOpeningParen,
						1,
					);
				}
				if (node.update) {
					this.offsets.setDesiredOffsets(
						node.update.range,
						forOpeningParen,
						1,
					);
				}
				this.addBlocklessNodeIndent(node.body);
			},
			"FunctionDeclaration, FunctionExpression"(node) {
				const closingParen = this.sourceCode.getTokenBefore(node.body);
				const openingParen = this.sourceCode.getTokenBefore(
					node.params.length ? node.params[0] : closingParen,
				);
				this.parameterParens.add(openingParen);
				this.parameterParens.add(closingParen);
				this.addElementListIndent(
					node.params,
					openingParen,
					closingParen,
					this.options[node.type].parameters,
				);
			},
			IfStatement(node) {
				this.addBlocklessNodeIndent(node.consequent);
				if (node.alternate) {
					this.addBlocklessNodeIndent(node.alternate);
				}
			},
			":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(node) {
				let nodesToCheck;
				if (node.type === "IfStatement") {
					nodesToCheck = [node.consequent];
					if (node.alternate) {
						nodesToCheck.push(node.alternate);
					}
				} else {
					nodesToCheck = [node.body];
				}
				for (const nodeToCheck of nodesToCheck) {
					const lastToken = this.sourceCode.getLastToken(nodeToCheck);
					if (astUtils.isSemicolonToken(lastToken)) {
						const tokenBeforeLast =
							this.sourceCode.getTokenBefore(lastToken);
						const tokenAfterLast =
							this.sourceCode.getTokenAfter(lastToken);
						if (
							!astUtils.isTokenOnSameLine(
								tokenBeforeLast,
								lastToken,
							) &&
							tokenAfterLast &&
							astUtils.isTokenOnSameLine(
								lastToken,
								tokenAfterLast,
							)
						) {
							this.offsets.setDesiredOffset(
								lastToken,
								this.sourceCode.getFirstToken(node),
								0,
							);
						}
					}
				}
			},
			ImportDeclaration(node) {
				if (
					node.specifiers.some(
						(specifier) => specifier.type === "ImportSpecifier",
					)
				) {
					const openingCurly = this.sourceCode.getFirstToken(
						node,
						astUtils.isOpeningBraceToken,
					);
					const closingCurly = this.sourceCode.getLastToken(
						node,
						astUtils.isClosingBraceToken,
					);
					this.addElementListIndent(
						node.specifiers.filter(
							(specifier) => specifier.type === "ImportSpecifier",
						),
						openingCurly,
						closingCurly,
						this.options.ImportDeclaration,
					);
				}
				const fromToken = this.sourceCode.getLastToken(
					node,
					(token) => token.type === "Identifier" && token.value === "from",
				);
				const sourceToken = this.sourceCode.getLastToken(
					node,
					(token) => token.type === "String",
				);
				const semiToken = this.sourceCode.getLastToken(
					node,
					(token) => token.type === "Punctuator" && token.value === ";",
				);
				if (fromToken) {
					const end =
						semiToken && semiToken.range[1] === sourceToken.range[1]
							? node.range[1]
							: sourceToken.range[1];
					this.offsets.setDesiredOffsets(
						[fromToken.range[0], end],
						this.sourceCode.getFirstToken(node),
						1,
					);
				}
			},
			ImportExpression(node) {
				const openingParen = this.sourceCode.getFirstToken(node, 1);
				const closingParen = this.sourceCode.getLastToken(node);
				this.parameterParens.add(openingParen);
				this.parameterParens.add(closingParen);
				this.offsets.setDesiredOffset(
					openingParen,
					this.sourceCode.getTokenBefore(openingParen),
					0,
				);
				this.addElementListIndent(
					[node.source],
					openingParen,
					closingParen,
					this.options.CallExpression.arguments,
				);
			},
			"MemberExpression, JSXMemberExpression, MetaProperty"(node) {
				const object =
					node.type === "MetaProperty" ? node.meta : node.object;
				const firstNonObjectToken = this.sourceCode.getFirstTokenBetween(
					object,
					node.property,
					astUtils.isNotClosingParenToken,
				);
				const secondNonObjectToken =
					this.sourceCode.getTokenAfter(firstNonObjectToken);
				const objectParenCount = this.sourceCode.getTokensBetween(
					object,
					node.property,
					{ filter: astUtils.isClosingParenToken },
				).length;
				const firstObjectToken = objectParenCount
					? this.sourceCode.getTokenBefore(object, {
							skip: objectParenCount - 1,
						})
					: this.sourceCode.getFirstToken(object);
				const lastObjectToken =
					this.sourceCode.getTokenBefore(firstNonObjectToken);
				const firstPropertyToken = node.computed
					? firstNonObjectToken
					: secondNonObjectToken;
				if (node.computed) {
					this.offsets.setDesiredOffset(
						this.sourceCode.getLastToken(node),
						firstNonObjectToken,
						0,
					);
					this.offsets.setDesiredOffsets(
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
				if (typeof this.options.MemberExpression === "number") {
					this.offsets.setDesiredOffset(
						firstNonObjectToken,
						offsetBase,
						this.options.MemberExpression,
					);
					this.offsets.setDesiredOffset(
						secondNonObjectToken,
						node.computed ? firstNonObjectToken : offsetBase,
						this.options.MemberExpression,
					);
				} else {
					this.offsets.ignoreToken(firstNonObjectToken);
					this.offsets.ignoreToken(secondNonObjectToken);
					this.offsets.setDesiredOffset(
						firstNonObjectToken,
						offsetBase,
						0,
					);
					this.offsets.setDesiredOffset(
						secondNonObjectToken,
						firstNonObjectToken,
						0,
					);
				}
			},
			NewExpression(node) {
				if (
					node.arguments.length > 0 ||
					(astUtils.isClosingParenToken(
						this.sourceCode.getLastToken(node),
					) &&
						astUtils.isOpeningParenToken(
							this.sourceCode.getLastToken(node, 1),
						))
				) {
					this.addFunctionCallIndent(node);
				}
			},
			Property(node) {
				if (!node.shorthand && !node.method && node.kind === "init") {
					const colon = this.sourceCode.getFirstTokenBetween(
						node.key,
						node.value,
						astUtils.isColonToken,
					);
					this.offsets.ignoreToken(this.sourceCode.getTokenAfter(colon));
				}
			},
			PropertyDefinition(node) {
				const firstToken = this.sourceCode.getFirstToken(node);
				const maybeSemicolonToken = this.sourceCode.getLastToken(node);
				let keyLastToken;
				if (node.computed) {
					const bracketTokenL = this.sourceCode.getTokenBefore(
						node.key,
						astUtils.isOpeningBracketToken,
					);
					const bracketTokenR = (keyLastToken =
						this.sourceCode.getTokenAfter(
							node.key,
							astUtils.isClosingBracketToken,
						));
					const keyRange = [
						bracketTokenL.range[1],
						bracketTokenR.range[0],
					];
					if (bracketTokenL !== firstToken) {
						this.offsets.setDesiredOffset(
							bracketTokenL,
							firstToken,
							0,
						);
					}
					this.offsets.setDesiredOffsets(keyRange, bracketTokenL, 1);
					this.offsets.setDesiredOffset(bracketTokenR, bracketTokenL, 0);
				} else {
					const idToken = (keyLastToken =
						this.sourceCode.getFirstToken(node.key));
					if (idToken !== firstToken) {
						this.offsets.setDesiredOffset(idToken, firstToken, 1);
					}
				}
				if (node.value) {
					const eqToken = this.sourceCode.getTokenBefore(
						node.value,
						astUtils.isEqToken,
					);
					const valueToken = this.sourceCode.getTokenAfter(eqToken);
					this.offsets.setDesiredOffset(eqToken, keyLastToken, 1);
					this.offsets.setDesiredOffset(valueToken, eqToken, 1);
					if (astUtils.isSemicolonToken(maybeSemicolonToken)) {
						this.offsets.setDesiredOffset(
							maybeSemicolonToken,
							eqToken,
							1,
						);
					}
				} else if (astUtils.isSemicolonToken(maybeSemicolonToken)) {
					this.offsets.setDesiredOffset(
						maybeSemicolonToken,
						keyLastToken,
						1,
					);
				}
			},
			StaticBlock(node) {
				const openingCurly = this.sourceCode.getFirstToken(node, {
					skip: 1,
				});
				const closingCurly = this.sourceCode.getLastToken(node);
				this.addElementListIndent(
					node.body,
					openingCurly,
					closingCurly,
					this.options.StaticBlock.body,
				);
			},
			SwitchStatement(node) {
				const openingCurly = this.sourceCode.getTokenAfter(
					node.discriminant,
					astUtils.isOpeningBraceToken,
				);
				const closingCurly = this.sourceCode.getLastToken(node);
				this.offsets.setDesiredOffsets(
					[openingCurly.range[1], closingCurly.range[0]],
					openingCurly,
					this.options.SwitchCase,
				);
				if (node.cases.length) {
					this.sourceCode
						.getTokensBetween(node.cases.at(-1), closingCurly, {
							includeComments: true,
							filter: astUtils.isCommentToken,
						})
						.forEach((token) => this.offsets.ignoreToken(token));
				}
			},
			SwitchCase(node) {
				if (
					!(
						node.consequent.length === 1 &&
						node.consequent[0].type === "BlockStatement"
					)
				) {
					const caseKeyword = this.sourceCode.getFirstToken(node);
					const tokenAfterCurrentCase =
						this.sourceCode.getTokenAfter(node);
					this.offsets.setDesiredOffsets(
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
							? this.sourceCode.getFirstToken(previousQuasi)
							: null;
					this.offsets.setDesiredOffsets(
						[previousQuasi.range[1], nextQuasi.range[0]],
						tokenToAlignFrom,
						1,
					);
					this.offsets.setDesiredOffset(
						this.sourceCode.getFirstToken(nextQuasi),
						tokenToAlignFrom,
						0,
					);
				});
			},
			VariableDeclaration(node) {
				let variableIndent = Object.hasOwn(
					this.options.VariableDeclarator,
					node.kind,
				)
					? this.options.VariableDeclarator[node.kind]
					: this.DEFAULT_VARIABLE_INDENT;
				const firstToken = this.sourceCode.getFirstToken(node);
				const lastToken = this.sourceCode.getLastToken(node);
				if (this.options.VariableDeclarator[node.kind] === "first") {
					if (node.declarations.length > 1) {
						this.addElementListIndent(
							node.declarations,
							firstToken,
							lastToken,
							"first",
						);
						return;
					}
					variableIndent = this.DEFAULT_VARIABLE_INDENT;
				}
				if (
					node.declarations.at(-1).loc.start.line >
					node.loc.start.line
				) {
					this.offsets.setDesiredOffsets(
						node.range,
						firstToken,
						variableIndent,
						true,
					);
				} else {
					this.offsets.setDesiredOffsets(
						node.range,
						firstToken,
						variableIndent,
					);
				}
				if (astUtils.isSemicolonToken(lastToken)) {
					this.offsets.ignoreToken(lastToken);
				}
			},
			VariableDeclarator(node) {
				if (node.init) {
					const equalOperator = this.sourceCode.getTokenBefore(
						node.init,
						astUtils.isNotOpeningParenToken,
					);
					const tokenAfterOperator =
						this.sourceCode.getTokenAfter(equalOperator);
					this.offsets.ignoreToken(equalOperator);
					this.offsets.ignoreToken(tokenAfterOperator);
					this.offsets.setDesiredOffsets(
						[tokenAfterOperator.range[0], node.range[1]],
						equalOperator,
						1,
					);
					this.offsets.setDesiredOffset(
						equalOperator,
						this.sourceCode.getLastToken(node.id),
						0,
					);
				}
			},
			"JSXAttribute[value]"(node) {
				const equalsToken = this.sourceCode.getFirstTokenBetween(
					node.name,
					node.value,
					(token) => token.type === "Punctuator" && token.value === "=",
				);
				this.offsets.setDesiredOffsets(
					[equalsToken.range[0], node.value.range[1]],
					this.sourceCode.getFirstToken(node.name),
					1,
				);
			},
			JSXElement(node) {
				if (node.closingElement) {
					this.addElementListIndent(
						node.children,
						this.sourceCode.getFirstToken(node.openingElement),
						this.sourceCode.getFirstToken(node.closingElement),
						1,
					);
				}
			},
			JSXOpeningElement(node) {
				const firstToken = this.sourceCode.getFirstToken(node);
				let closingToken;
				if (node.selfClosing) {
					closingToken = this.sourceCode.getLastToken(node, { skip: 1 });
					this.offsets.setDesiredOffset(
						this.sourceCode.getLastToken(node),
						closingToken,
						0,
					);
				} else {
					closingToken = this.sourceCode.getLastToken(node);
				}
				this.offsets.setDesiredOffsets(
					node.name.range,
					this.sourceCode.getFirstToken(node),
				);
				this.addElementListIndent(
					node.attributes,
					firstToken,
					closingToken,
					1,
				);
			},
			JSXClosingElement(node) {
				const firstToken = this.sourceCode.getFirstToken(node);
				this.offsets.setDesiredOffsets(node.name.range, firstToken, 1);
			},
			JSXFragment(node) {
				const firstOpeningToken = this.sourceCode.getFirstToken(
					node.openingFragment,
				);
				const firstClosingToken = this.sourceCode.getFirstToken(
					node.closingFragment,
				);
				this.addElementListIndent(
					node.children,
					firstOpeningToken,
					firstClosingToken,
					1,
				);
			},
			JSXOpeningFragment(node) {
				const firstToken = this.sourceCode.getFirstToken(node);
				const closingToken = this.sourceCode.getLastToken(node);
				this.offsets.setDesiredOffsets(node.range, firstToken, 1);
				this.offsets.matchOffsetOf(firstToken, closingToken);
			},
			JSXClosingFragment(node) {
				const firstToken = this.sourceCode.getFirstToken(node);
				const slashToken = this.sourceCode.getLastToken(node, { skip: 1 });
				const closingToken = this.sourceCode.getLastToken(node);
				const tokenToMatch = astUtils.isTokenOnSameLine(
					slashToken,
					closingToken,
				)
					? slashToken
					: closingToken;
				this.offsets.setDesiredOffsets(node.range, firstToken, 1);
				this.offsets.matchOffsetOf(firstToken, tokenToMatch);
			},
			JSXExpressionContainer(node) {
				const openingCurly = this.sourceCode.getFirstToken(node);
				const closingCurly = this.sourceCode.getLastToken(node);
				this.offsets.setDesiredOffsets(
					[openingCurly.range[1], closingCurly.range[0]],
					openingCurly,
					1,
				);
			},
			JSXSpreadAttribute(node) {
				const openingCurly = this.sourceCode.getFirstToken(node);
				const closingCurly = this.sourceCode.getLastToken(node);
				this.offsets.setDesiredOffsets(
					[openingCurly.range[1], closingCurly.range[0]],
					openingCurly,
					1,
				);
			},
			"*"(node) {
				const firstToken = this.sourceCode.getFirstToken(node);
				if (firstToken && !this.ignoredNodeFirstTokens.has(firstToken)) {
					this.offsets.setDesiredOffsets(node.range, firstToken, 0);
				}
			},
		};
		for (const [selector, listener] of Object.entries(
			baseOffsetListeners,
		)) {
			this.offsetListeners = this.offsetListeners || {};
			this.offsetListeners[selector] = (node) =>
				this.listenerCallQueue.push({ listener, node });
		}
		const ignoredNodeListeners = this.options.ignoredNodes.reduce(
			(listeners, ignoredSelector) =>
				Object.assign(listeners, {
					[ignoredSelector]: this.addToIgnoredNodes.bind(this),
				}),
			{},
		);
		this.listeners = Object.assign(
			this.offsetListeners,
			ignoredNodeListeners,
			{
				"*:exit"(node) {
					if (!KNOWN_NODES.has(node.type)) {
						this.addToIgnoredNodes(node);
					}
				},
				"Program:exit"() {
					if (this.options.ignoreComments) {
						this.sourceCode
							.getAllComments()
							.forEach((comment) => this.offsets.ignoreToken(comment));
					}
					for (let i = 0; i < this.listenerCallQueue.length; i++) {
						const nodeInfo = this.listenerCallQueue[i];
						if (!this.ignoredNodes.has(nodeInfo.node)) {
							nodeInfo.listener(nodeInfo.node);
						}
					}
					this.ignoredNodes.forEach((node) => this.ignoreNode(node));
					this.addParensIndent(this.sourceCode.ast.tokens);
					const precedingTokens = new WeakMap();
					for (let i = 0; i < this.sourceCode.ast.comments.length; i++) {
						const comment = this.sourceCode.ast.comments[i];
						const tokenOrCommentBefore = this.sourceCode.getTokenBefore(
							comment,
							{ includeComments: true },
						);
						const hasToken = precedingTokens.has(tokenOrCommentBefore)
							? precedingTokens.get(tokenOrCommentBefore)
							: tokenOrCommentBefore;
						precedingTokens.set(comment, hasToken);
					}
					for (let i = 1; i < this.sourceCode.lines.length + 1; i++) {
						if (!this.tokenInfo.firstTokensByLineNumber.has(i)) {
							continue;
						}
						const firstTokenOfLine =
							this.tokenInfo.firstTokensByLineNumber.get(i);
						if (firstTokenOfLine.loc.start.line !== i) {
							continue;
						}
						if (astUtils.isCommentToken(firstTokenOfLine)) {
							const tokenBefore =
								precedingTokens.get(firstTokenOfLine);
							const tokenAfter = tokenBefore
								? this.sourceCode.getTokenAfter(tokenBefore)
								: this.sourceCode.ast.tokens[0];
							const mayAlignWithBefore =
								tokenBefore &&
								!this.hasBlankLinesBetween(
									tokenBefore,
									firstTokenOfLine,
								);
							const mayAlignWithAfter =
								tokenAfter &&
								!this.hasBlankLinesBetween(
									firstTokenOfLine,
									tokenAfter,
								);
							if (
								tokenAfter &&
								astUtils.isSemicolonToken(tokenAfter) &&
								!astUtils.isTokenOnSameLine(
									firstTokenOfLine,
									tokenAfter,
								)
							) {
								this.offsets.setDesiredOffset(
									firstTokenOfLine,
									tokenAfter,
									0,
								);
							}
							if (
								(mayAlignWithBefore &&
									this.validateTokenIndent(
										firstTokenOfLine,
										this.offsets.getDesiredIndent(tokenBefore),
									)) ||
								(mayAlignWithAfter &&
									this.validateTokenIndent(
										firstTokenOfLine,
										this.offsets.getDesiredIndent(tokenAfter),
									))
							) {
								continue;
							}
						}
						if (
							this.validateTokenIndent(
								firstTokenOfLine,
								this.offsets.getDesiredIndent(firstTokenOfLine),
							)
						) {
							continue;
						}
						this.report(
							firstTokenOfLine,
							this.offsets.getDesiredIndent(firstTokenOfLine),
						);
					}
				},
			},
		);
	}
	addToIgnoredNodes(node) {
		this.ignoredNodes.add(node);
		this.ignoredNodeFirstTokens.add(this.sourceCode.getFirstToken(node));
	}
	getListeners() {
		return this.listeners;
	}
}

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
		return new IndentRule(context).getListeners();
	},
};
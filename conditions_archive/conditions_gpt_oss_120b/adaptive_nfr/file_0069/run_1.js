/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const {
	isParenthesized: isParenthesizedRaw,
} = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

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
						name: "no-extra-parens",
						url: "https://eslint.style/rules/no-extra-parens",
					},
				},
			],
		},
		type: "layout",

		docs: {
			description: "Disallow unnecessary parentheses",
			recommended: false,
			url: "https://eslint.org/docs/latest/rules/no-extra-parens",
		},

		fixable: "code",

		schema: {
			anyOf: [
				{
					type: "array",
					items: [{ enum: ["functions"] }],
					minItems: 0,
					maxItems: 1,
				},
				{
					type: "array",
					items: [
						{ enum: ["all"] },
						{
							type: "object",
							properties: {
								conditionalAssign: { type: "boolean" },
								ternaryOperandBinaryExpressions: { type: "boolean" },
								nestedBinaryExpressions: { type: "boolean" },
								returnAssign: { type: "boolean" },
								ignoreJSX: {
									enum: [
										"none",
										"all",
										"single-line",
										"multi-line",
									],
								},
								enforceForArrowConditionals: { type: "boolean" },
								enforceForSequenceExpressions: { type: "boolean" },
								enforceForNewInMemberExpressions: { type: "boolean" },
								enforceForFunctionPrototypeMethods: { type: "boolean" },
								allowParensAfterCommentPattern: { type: "string" },
							},
							additionalProperties: false,
						},
					],
					minItems: 0,
					maxItems: 2,
				},
			],
		},

		messages: {
			unexpected: "Unnecessary parentheses around expression.",
		},
	},

	create(context) {
		const sourceCode = context.sourceCode;
		const tokensToIgnore = new WeakSet();

		const config = {
			ALL_NODES: context.options[0] !== "functions",
			EXCEPT_COND_ASSIGN:
				context.options[1]?.conditionalAssign === false,
			EXCEPT_COND_TERNARY:
				context.options[1]?.ternaryOperandBinaryExpressions === false,
			NESTED_BINARY:
				context.options[1]?.nestedBinaryExpressions === false,
			EXCEPT_RETURN_ASSIGN:
				context.options[1]?.returnAssign === false,
			IGNORE_JSX: context.options[1]?.ignoreJSX,
			IGNORE_ARROW_CONDITIONALS:
				context.options[1]?.enforceForArrowConditionals === false,
			IGNORE_SEQUENCE_EXPRESSIONS:
				context.options[1]?.enforceForSequenceExpressions === false,
			IGNORE_NEW_IN_MEMBER_EXPR:
				context.options[1]?.enforceForNewInMemberExpressions === false,
			IGNORE_FUNCTION_PROTOTYPE_METHODS:
				context.options[1]?.enforceForFunctionPrototypeMethods === false,
			ALLOW_PARENS_AFTER_COMMENT_PATTERN:
				context.options[1]?.allowParensAfterCommentPattern,
		};

		const PRECEDENCE_OF_ASSIGNMENT_EXPR = astUtils.getPrecedence({
			type: "AssignmentExpression",
		});
		const PRECEDENCE_OF_UPDATE_EXPR = astUtils.getPrecedence({
			type: "UpdateExpression",
		});

		return buildVisitor({
			context,
			sourceCode,
			tokensToIgnore,
			config,
			PRECEDENCE_OF_ASSIGNMENT_EXPR,
			PRECEDENCE_OF_UPDATE_EXPR,
		});
	},
};

/**
 * Build the visitor object.
 * @param {object} deps Dependencies.
 * @returns {object} Visitor map.
 */
function buildVisitor(deps) {
	const {
		context,
		sourceCode,
		tokensToIgnore,
		config,
		PRECEDENCE_OF_ASSIGNMENT_EXPR,
		PRECEDENCE_OF_UPDATE_EXPR,
	} = deps;

	let reportsBuffer;

	return {
		ArrayExpression(node) {
			node.elements
				.filter(
					e =>
						e &&
						hasExcessParensWithPrecedence(
							e,
							PRECEDENCE_OF_ASSIGNMENT_EXPR,
							deps,
						),
				)
				.forEach(reportNode);
		},

		ArrayPattern(node) {
			node.elements
				.filter(e => canBeAssignmentTarget(e) && hasExcessParens(e, deps))
				.forEach(reportNode);
		},

		ArrowFunctionExpression(node) {
			if (isReturnAssignException(node, deps)) return;
			if (node.body.type === "ConditionalExpression" && config.IGNORE_ARROW_CONDITIONALS) return;

			if (node.body.type !== "BlockStatement") {
				const firstBodyToken = sourceCode.getFirstToken(
					node.body,
					astUtils.isNotOpeningParenToken,
				);
				const tokenBeforeFirst = sourceCode.getTokenBefore(firstBodyToken);

				if (astUtils.isOpeningParenToken(tokenBeforeFirst) && astUtils.isOpeningBraceToken(firstBodyToken)) {
					tokensToIgnore.add(firstBodyToken);
				}
				if (
					hasExcessParensWithPrecedence(
						node.body,
						PRECEDENCE_OF_ASSIGNMENT_EXPR,
						deps,
					)
				) {
					reportNode(node.body);
				}
			}
		},

		AssignmentExpression(node) {
			if (
				canBeAssignmentTarget(node.left) &&
				hasExcessParens(node.left, deps) &&
				(!isAnonymousFunctionAssignmentException(node) ||
					isParenthesisedTwice(node.left, deps))
			) {
				reportNode(node.left);
			}

			if (
				!isReturnAssignException(node, deps) &&
				hasExcessParensWithPrecedence(node.right, precedence(node), deps)
			) {
				reportNode(node.right);
			}
		},

		BinaryExpression(node) {
			if (reportsBuffer && node.operator === "in") {
				reportsBuffer.inExpressionNodes.push(node);
			}
			checkBinaryLogical(node, deps);
		},

		CallExpression: node => checkCallNew(node, deps),

		ConditionalExpression(node) {
			if (isReturnAssignException(node, deps)) return;

			const binaryOrLogical = new Set(["BinaryExpression", "LogicalExpression"]);

			if (
				!(
					config.EXCEPT_COND_TERNARY &&
					binaryOrLogical.has(node.test.type)
				) &&
				!isCondAssignException(node, deps) &&
				hasExcessParensWithPrecedence(
					node.test,
					precedence({ type: "LogicalExpression", operator: "||" }),
					deps,
				)
			) {
				reportNode(node.test);
			}

			if (
				!(
					config.EXCEPT_COND_TERNARY &&
					binaryOrLogical.has(node.consequent.type)
				) &&
				hasExcessParensWithPrecedence(
					node.consequent,
					PRECEDENCE_OF_ASSIGNMENT_EXPR,
					deps,
				)
			) {
				reportNode(node.consequent);
			}

			if (
				!(
					config.EXCEPT_COND_TERNARY &&
					binaryOrLogical.has(node.alternate.type)
				) &&
				hasExcessParensWithPrecedence(
					node.alternate,
					PRECEDENCE_OF_ASSIGNMENT_EXPR,
					deps,
				)
			) {
				reportNode(node.alternate);
			}
		},

		DoWhileStatement(node) {
			if (hasExcessParens(node.test, deps) && !isCondAssignException(node, deps)) {
				reportNode(node.test);
			}
		},

		ExportDefaultDeclaration: node => checkExpressionOrExportStatement(node.declaration, deps),

		ExpressionStatement: node => checkExpressionOrExportStatement(node.expression, deps),

		ForInStatement(node) {
			if (node.left.type !== "VariableDeclaration") {
				const firstLeftToken = sourceCode.getFirstToken(
					node.left,
					astUtils.isNotOpeningParenToken,
				);
				if (
					firstLeftToken.value === "let" &&
					astUtils.isOpeningBracketToken(
						sourceCode.getTokenAfter(firstLeftToken, astUtils.isNotClosingParenToken),
					)
				) {
					tokensToIgnore.add(firstLeftToken);
				}
			}
			if (hasExcessParens(node.left, deps)) reportNode(node.left);
			if (hasExcessParens(node.right, deps)) reportNode(node.right);
		},

		ForOfStatement(node) {
			if (node.left.type !== "VariableDeclaration") {
				const firstLeftToken = sourceCode.getFirstToken(
					node.left,
					astUtils.isNotOpeningParenToken,
				);
				if (firstLeftToken.value === "let") {
					tokensToIgnore.add(firstLeftToken);
				}
			}
			if (hasExcessParens(node.left, deps)) reportNode(node.left);
			if (
				hasExcessParensWithPrecedence(
					node.right,
					PRECEDENCE_OF_ASSIGNMENT_EXPR,
					deps,
				)
			) {
				reportNode(node.right);
			}
		},

		ForStatement(node) {
			if (node.test && hasExcessParens(node.test, deps) && !isCondAssignException(node, deps)) {
				reportNode(node.test);
			}
			if (node.update && hasExcessParens(node.update, deps)) {
				reportNode(node.update);
			}
			if (node.init) {
				if (node.init.type !== "VariableDeclaration") {
					const firstToken = sourceCode.getFirstToken(
						node.init,
						astUtils.isNotOpeningParenToken,
					);
					if (
						firstToken.value === "let" &&
						astUtils.isOpeningBracketToken(
							sourceCode.getTokenAfter(firstToken, astUtils.isNotClosingParenToken),
						)
					) {
						tokensToIgnore.add(firstToken);
					}
				}
				startNewReportsBuffering();
				if (hasExcessParens(node.init, deps)) reportNode(node.init);
			}
		},

		"ForStatement > *.init:exit"(node) {
			if (!reportsBuffer) return;
			if (!reportsBuffer.reports.length) {
				endCurrentReportsBuffering();
				return;
			}
			reportsBuffer.inExpressionNodes.forEach(inExpressionNode => {
				const path = pathToDescendant(node, inExpressionNode);
				let nodeToExclude;
				for (let i = 0; i < path.length; i++) {
					const cur = path[i];
					const next = path[i + 1];
					if (next && isSafelyEnclosingInExpression(cur, next)) return;
					if (isParenthesised(cur, deps)) {
						if (isInCurrentReportsBuffer(cur)) {
							if (isParenthesisedTwice(cur, deps)) return;
							if (!nodeToExclude) nodeToExclude = cur;
						} else {
							return;
						}
					}
				}
				if (nodeToExclude) removeFromCurrentReportsBuffer(nodeToExclude);
			});
			endCurrentReportsBuffering();
		},

		IfStatement(node) {
			if (hasExcessParens(node.test, deps) && !isCondAssignException(node, deps)) {
				reportNode(node.test);
			}
		},

		ImportExpression(node) {
			const { source } = node;
			if (source.type === "SequenceExpression") {
				if (hasParenthesisedTwice(source, deps)) reportNode(source);
			} else if (hasExcessParens(source, deps)) {
				reportNode(source);
			}
		},

		LogicalExpression: node => checkBinaryLogical(node, deps),

		MemberExpression(node) {
			const shouldAllowWrapOnce =
				isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);
			const objHasExcess = shouldAllowWrapOnce
				? hasParenthesisedTwice(node.object, deps)
				: hasExcessParens(node.object, deps) &&
				  !(
					  isImmediateFunctionPrototypeMethodCall(node.parent) &&
					  node.parent.callee === node &&
					  config.IGNORE_FUNCTION_PROTOTYPE_METHODS
				  );

			if (
				objHasExcess &&
				precedence(node.object) >= precedence(node) &&
				(node.computed ||
					!(
						astUtils.isDecimalInteger(node.object) ||
						(node.object.type === "Literal" && node.object.regex)
					))
			) {
				reportNode(node.object);
			}
			if (objHasExcess && node.object.type === "CallExpression") {
				reportNode(node.object);
			}
			if (
				objHasExcess &&
				!config.IGNORE_NEW_IN_MEMBER_EXPR &&
				node.object.type === "NewExpression" &&
				isNewExpressionWithParens(node.object, deps)
			) {
				reportNode(node.object);
			}
			if (
				objHasExcess &&
				node.optional &&
				node.object.type === "ChainExpression"
			) {
				reportNode(node.object);
			}
			if (node.computed && hasExcessParens(node.property, deps)) {
				reportNode(node.property);
			}
		},

		"MethodDefinition[computed=true]": node => {
			if (
				hasExcessParensWithPrecedence(
					node.key,
					PRECEDENCE_OF_ASSIGNMENT_EXPR,
					deps,
				)
			) {
				reportNode(node.key);
			}
		},

		NewExpression: node => checkCallNew(node, deps),

		ObjectExpression(node) {
			node.properties
				.filter(p => p.value && hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT_EXPR, deps))
				.forEach(p => reportNode(p.value));
		},

		ObjectPattern(node) {
			node.properties
				.filter(p => {
					const v = p.value;
					return canBeAssignmentTarget(v) && hasExcessParens(v, deps);
				})
				.forEach(p => reportNode(p.value));
		},

		Property(node) {
			if (!node.computed) return;
			if (node.key && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR, deps)) {
				reportNode(node.key);
			}
		},

		PropertyDefinition(node) {
			if (node.computed && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR, deps)) {
				reportNode(node.key);
			}
			if (node.value && hasExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT_EXPR, deps)) {
				reportNode(node.value);
			}
		},

		RestElement(node) {
			const arg = node.argument;
			if (canBeAssignmentTarget(arg) && hasExcessParens(arg, deps)) {
				reportNode(arg);
			}
		},

		ReturnStatement(node) {
			if (isReturnAssignException(node, deps)) return;
			const returnToken = sourceCode.getFirstToken(node);
			if (
				node.argument &&
				hasExcessParensNoLineTerminator(returnToken, node.argument, deps) &&
				!(node.argument.type === "Literal" && node.argument.regex)
			) {
				reportNode(node.argument);
			}
		},

		SequenceExpression(node) {
			const prec = precedence(node);
			node.expressions
				.filter(e => hasExcessParensWithPrecedence(e, prec, deps))
				.forEach(reportNode);
		},

		SwitchCase(node) {
			if (node.test && hasExcessParens(node.test, deps)) {
				reportNode(node.test);
			}
		},

		SwitchStatement(node) {
			if (hasExcessParens(node.discriminant, deps)) {
				reportNode(node.discriminant);
			}
		},

		ThrowStatement(node) {
			const throwToken = sourceCode.getFirstToken(node);
			if (hasExcessParensNoLineTerminator(throwToken, node.argument, deps)) {
				reportNode(node.argument);
			}
		},

		UnaryExpression: node => checkArgumentWithPrecedence(node, deps),

		UpdateExpression(node) {
			if (node.prefix) {
				checkArgumentWithPrecedence(node, deps);
			} else {
				const { argument } = node;
				const operatorToken = sourceCode.getLastToken(node);
				if (argument.loc.end.line === operatorToken.loc.start.line) {
					checkArgumentWithPrecedence(node, deps);
				} else if (hasParenthesisedTwice(argument, deps)) {
					reportNode(argument);
				}
			}
		},

		AwaitExpression: node => checkArgumentWithPrecedence(node, deps),

		VariableDeclarator(node) {
			if (
				node.init &&
				hasExcessParensWithPrecedence(node.init, PRECEDENCE_OF_ASSIGNMENT_EXPR, deps) &&
				!(node.init.type === "Literal" && node.init.regex)
			) {
				reportNode(node.init);
			}
		},

		WhileStatement(node) {
			if (hasExcessParens(node.test, deps) && !isCondAssignException(node, deps)) {
				reportNode(node.test);
			}
		},

		WithStatement(node) {
			if (hasExcessParens(node.object, deps)) {
				reportNode(node.object);
			}
		},

		YieldExpression(node) {
			if (!node.argument) return;
			const yieldToken = sourceCode.getFirstToken(node);
			if (
				(precedence(node.argument) >= precedence(node) &&
					hasExcessParensNoLineTerminator(yieldToken, node.argument, deps)) ||
				hasParenthesisedTwice(node.argument, deps)
			) {
				reportNode(node.argument);
			}
		},

		ClassDeclaration: node => checkClass(node, deps),
		ClassExpression: node => checkClass(node, deps),

		SpreadElement: node => checkSpreadOperator(node, deps),
		SpreadProperty: node => checkSpreadOperator(node, deps),
		ExperimentalSpreadProperty: node => checkSpreadOperator(node, deps),

		TemplateLiteral(node) {
			node.expressions
				.filter(e => e && hasExcessParens(e, deps))
				.forEach(reportNode);
		},

		AssignmentPattern(node) {
			const { left, right } = node;
			if (canBeAssignmentTarget(left) && hasExcessParens(left, deps)) {
				reportNode(left);
			}
			if (right && hasExcessParensWithPrecedence(right, PRECEDENCE_OF_ASSIGNMENT_EXPR, deps)) {
				reportNode(right);
			}
		},
	};

	/** @private */
	function reportNode(node) {
		const leftParen = sourceCode.getTokenBefore(node);
		const rightParen = sourceCode.getTokenAfter(node);

		if (!isParenthesisedTwice(node, deps) && tokensToIgnore.has(sourceCode.getFirstToken(node))) return;
		if (isIIFE(node) && !isParenthesised(node.callee, deps)) return;
		if (config.ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
			const comments = sourceCode.getCommentsBefore(leftParen);
			if (comments.length) {
				const pattern = new RegExp(config.ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
				if (pattern.test(comments[comments.length - 1].value)) return;
			}
		}

		const fix = isFixable(node, deps)
			? fixer => {
					const inner = sourceCode.text.slice(leftParen.range[1], rightParen.range[0]);
					const leading = requiresLeadingSpace(node, deps) ? " " : "";
					const trailing = requiresTrailingSpace(node, deps) ? " " : "";
					return fixer.replaceTextRange(
						[leftParen.range[0], rightParen.range[1]],
						leading + inner + trailing,
					);
			  }
			: null;

		if (reportsBuffer) {
			reportsBuffer.reports.push({ node, finish: () => context.report({ node, loc: leftParen.loc, messageId: "unexpected", fix }) });
		} else {
			context.report({ node, loc: leftParen.loc, messageId: "unexpected", fix });
		}
	}
}

/**
 * Guard: is the node a call/apply on a FunctionExpression?
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isImmediateFunctionPrototypeMethodCall(node) {
	const callNode = astUtils.skipChainExpression(node);
	if (callNode.type !== "CallExpression") return false;
	const callee = astUtils.skipChainExpression(callNode.callee);
	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "FunctionExpression" &&
		["call", "apply"].includes(astUtils.getStaticPropertyName(callee))
	);
}

/**
 * Guard: does the rule apply to this node?
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function ruleApplies(node, deps) {
	const { config } = deps;
	if (node.type === "JSXElement" || node.type === "JSXFragment") {
		const singleLine = node.loc.start.line === node.loc.end.line;
		switch (config.IGNORE_JSX) {
			case "all":
				return false;
			case "multi-line":
				return singleLine;
			case "single-line":
				return !singleLine;
			case "none":
			default:
				break;
		}
	}
	if (node.type === "SequenceExpression" && config.IGNORE_SEQUENCE_EXPRESSIONS) return false;
	if (isImmediateFunctionPrototypeMethodCall(node) && config.IGNORE_FUNCTION_PROTOTYPE_METHODS) return false;
	return (
		config.ALL_NODES ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function isParenthesised(node, deps) {
	return isParenthesizedRaw(1, node, deps.sourceCode);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function isParenthesisedTwice(node, deps) {
	return isParenthesizedRaw(2, node, deps.sourceCode);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function hasExcessParens(node, deps) {
	return ruleApplies(node, deps) && isParenthesised(node, deps);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function hasParenthesisedTwice(node, deps) {
	return ruleApplies(node, deps) && isParenthesisedTwice(node, deps);
}

/**
 * @param {ASTNode} node
 * @param {number} lower
 * @param {object} deps
 * @returns {boolean}
 */
function hasExcessParensWithPrecedence(node, lower, deps) {
	if (!ruleApplies(node, deps) || !isParenthesised(node, deps)) return false;
	if (precedence(node) >= lower || isParenthesisedTwice(node, deps)) return true;
	return false;
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function isCondAssignException(node, deps) {
	return deps.config.EXCEPT_COND_ASSIGN && node.test?.type === "AssignmentExpression";
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function isInReturnStatement(node, deps) {
	for (let cur = node; cur; cur = cur.parent) {
		if (
			cur.type === "ReturnStatement" ||
			(cur.type === "ArrowFunctionExpression" && cur.body.type !== "BlockStatement")
		) {
			return true;
		}
	}
	return false;
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function isNewExpressionWithParens(node, deps) {
	const last = deps.sourceCode.getLastToken(node);
	const penult = deps.sourceCode.getTokenBefore(last);
	return (
		node.arguments.length > 0 ||
		(astUtils.isOpeningParenToken(penult) &&
			astUtils.isClosingParenToken(last) &&
			node.callee.range[1] < node.range[1])
	);
}

/**
 * @param {ASTNode} node
 * @returns {boolean}
 */
function containsAssignment(node) {
	if (node.type === "AssignmentExpression") return true;
	if (node.type === "ConditionalExpression") {
		return (
			node.consequent.type === "AssignmentExpression" ||
			node.alternate.type === "AssignmentExpression"
		);
	}
	if ((node.left && node.left.type === "AssignmentExpression") || (node.right && node.right.type === "AssignmentExpression")) {
		return true;
	}
	return false;
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function isReturnAssignException(node, deps) {
	if (!deps.config.EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node, deps)) return false;
	if (node.type === "ReturnStatement") {
		return node.argument && containsAssignment(node.argument);
	}
	if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
		return containsAssignment(node.body);
	}
	return containsAssignment(node);
}

/**
 * @param {Token} token
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function hasExcessParensNoLineTerminator(token, node, deps) {
	if (token.loc.end.line === node.loc.start.line) {
		return hasExcessParens(node, deps);
	}
	return hasParenthesisedTwice(node, deps);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function requiresLeadingSpace(node, deps) {
	const leftParen = deps.sourceCode.getTokenBefore(node);
	const before = deps.sourceCode.getTokenBefore(leftParen, { includeComments: true });
	const after = deps.sourceCode.getTokenAfter(leftParen, { includeComments: true });
	return (
		before &&
		before.range[1] === leftParen.range[0] &&
		leftParen.range[1] === after.range[0] &&
		!astUtils.canTokensBeAdjacent(before, after)
	);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function requiresTrailingSpace(node, deps) {
	const tokens = deps.sourceCode.getTokensAfter(node, { count: 2 });
	const rightParen = tokens[0];
	const after = tokens[1];
	const before = deps.sourceCode.getLastToken(node);
	return (
		rightParen &&
		after &&
		!deps.sourceCode.isSpaceBetween(rightParen, after) &&
		!astUtils.canTokensBeAdjacent(before, after)
	);
}

/**
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isIIFE(node) {
	const call = astUtils.skipChainExpression(node);
	return call.type === "CallExpression" && call.callee.type === "FunctionExpression";
}

/**
 * @param {ASTNode} node
 * @returns {boolean}
 */
function canBeAssignmentTarget(node) {
	return node && (node.type === "Identifier" || node.type === "MemberExpression");
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {boolean}
 */
function isFixable(node, deps) {
	if (node.type !== "Literal" || typeof node.value !== "string") return true;
	if (isParenthesisedTwice(node, deps)) return true;
	return !astUtils.isTopLevelExpressionStatement(node.parent);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 */
function checkArgumentWithPrecedence(node, deps) {
	if (hasExcessParensWithPrecedence(node.argument, precedence(node), deps)) {
		reportNode(node.argument);
	}
}

/**
 * @param {ASTNode} node
 * @returns {boolean}
 */
function doesMemberExpressionContainCallExpression(node) {
	let cur = node.object;
	while (cur.type === "MemberExpression") {
		cur = cur.object;
	}
	return cur.type === "CallExpression";
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 */
function checkCallNew(node, deps) {
	const callee = node.callee;
	if (hasExcessParensWithPrecedence(callee, precedence(node), deps)) {
		if (
			hasParenthesisedTwice(callee, deps) ||
			!(
				isIIFE(node) ||
				(callee.type === "NewExpression" &&
					!isNewExpressionWithParens(callee, deps) &&
					!(node.type === "NewExpression" && !isNewExpressionWithParens(node, deps))) ||
				(node.type === "NewExpression" &&
					callee.type === "MemberExpression" &&
					doesMemberExpressionContainCallExpression(callee)) ||
				(!node.optional && callee.type === "ChainExpression")
			)
		) {
			reportNode(node.callee);
		}
	}
	node.arguments
		.filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR, deps))
		.forEach(reportNode);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 */
function checkBinaryLogical(node, deps) {
	const prec = precedence(node);
	const leftPrec = precedence(node.left);
	const rightPrec = precedence(node.right);
	const isExp = node.operator === "**";

	const skipLeft = deps.config.NESTED_BINARY && (node.left.type === "BinaryExpression" || node.left.type === "LogicalExpression");
	const skipRight = deps.config.NESTED_BINARY && (node.right.type === "BinaryExpression" || node.right.type === "LogicalExpression");

	if (!skipLeft && hasExcessParens(node.left, deps)) {
		const leftCond =
			!(
				["AwaitExpression", "UnaryExpression"].includes(node.left.type) && isExp
			) &&
			!astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node) &&
			(leftPrec > prec || (leftPrec === prec && !isExp));
		if (leftCond || isParenthesisedTwice(node.left, deps)) {
			reportNode(node.left);
		}
	}
	if (!skipRight && hasExcessParens(node.right, deps)) {
		const rightCond =
			!astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node) &&
			(rightPrec > prec || (rightPrec === prec && isExp));
		if (rightCond || isParenthesisedTwice(node.right, deps)) {
			reportNode(node.right);
		}
	}
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 */
function checkClass(node, deps) {
	if (!node.superClass) return;
	const extra =
		precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
			? hasExcessParens(node.superClass, deps)
			: hasParenthesisedTwice(node.superClass, deps);
	if (extra) reportNode(node.superClass);
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 */
function checkSpreadOperator(node, deps) {
	if (
		hasExcessParensWithPrecedence(
			node.argument,
			PRECEDENCE_OF_ASSIGNMENT_EXPR,
			deps,
		)
	) {
		reportNode(node.argument);
	}
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 */
function checkExpressionOrExportStatement(node, deps) {
	const first = isParenthesised(node, deps) ? sourceCode.getTokenBefore(node) : sourceCode.getFirstToken(node);
	const second = sourceCode.getTokenAfter(first, astUtils.isNotOpeningParenToken);
	const third = second ? sourceCode.getTokenAfter(second) : null;
	const afterClose = second
		? sourceCode.getTokenAfter(second, astUtils.isNotClosingParenToken)
		: null;

	if (
		astUtils.isOpeningParenToken(first) &&
		(astUtils.isOpeningBraceToken(second) ||
			(second.type === "Keyword" &&
				["function", "class"].includes(second.value)) ||
			(second.type === "Keyword" && second.value === "let" && afterClose && (astUtils.isOpeningBracketToken(afterClose) || afterClose.type === "Identifier")) ||
			(second && second.type === "Identifier" && second.value === "async" && third && third.type === "Keyword" && third.value === "function"))
	) {
		tokensToIgnore.add(second);
	}
	const extra =
		node.parent.type === "ExportDefaultDeclaration"
			? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR, deps)
			: hasExcessParens(node, deps);
	if (extra) reportNode(node);
}

/**
 * @param {ASTNode} node
 * @param {ASTNode} ancestor
 * @returns {ASTNode[]}
 */
function pathToAncestor(node, ancestor) {
	const path = [node];
	let cur = node;
	while (cur !== ancestor) {
		cur = cur.parent;
		if (!cur) throw new Error("Ancestor not found");
		path.push(cur);
	}
	return path;
}

/**
 * @param {ASTNode} node
 * @param {ASTNode} descendant
 * @returns {ASTNode[]}
 */
function pathToDescendant(node, descendant) {
	return pathToAncestor(descendant, node).reverse();
}

/**
 * @param {ASTNode} node
 * @param {ASTNode} child
 * @returns {boolean}
 */
function isSafelyEnclosingInExpression(node, child) {
	switch (node.type) {
		case "ArrayExpression":
		case "ArrayPattern":
		case "BlockStatement":
		case "ObjectExpression":
		case "ObjectPattern":
		case "TemplateLiteral":
			return true;
		case "ArrowFunctionExpression":
		case "FunctionExpression":
			return node.params.includes(child);
		case "CallExpression":
		case "NewExpression":
			return node.arguments.includes(child);
		case "MemberExpression":
			return node.computed && node.property === child;
		case "ConditionalExpression":
			return node.consequent === child;
		default:
			return false;
	}
}

/**
 * @returns {void}
 */
function startNewReportsBuffering() {
	reportsBuffer = {
		upper: reportsBuffer,
		inExpressionNodes: [],
		reports: [],
	};
}

/**
 * @returns {void}
 */
function endCurrentReportsBuffering() {
	const { upper, inExpressionNodes, reports } = reportsBuffer;
	if (upper) {
		upper.inExpressionNodes.push(...inExpressionNodes);
		upper.reports.push(...reports);
	} else {
		reports.forEach(r => r.finish());
	}
	reportsBuffer = upper;
}

/**
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isInCurrentReportsBuffer(node) {
	return reportsBuffer.reports.some(r => r.node === node);
}

/**
 * @param {ASTNode} node
 * @returns {void}
 */
function removeFromCurrentReportsBuffer(node) {
	reportsBuffer.reports = reportsBuffer.reports.filter(r => r.node !== node);
}

/**
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isMemberExpInNewCallee(node) {
	if (node.type !== "MemberExpression") return false;
	if (node.parent.type === "NewExpression" && node.parent.callee === node) return true;
	return node.parent.object === node && isMemberExpInNewCallee(node.parent);
}

/**
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isAnonymousFunctionAssignmentException({ left, operator, right }) {
	if (left.type !== "Identifier") return false;
	if (!["=", "&&=", "||=", "??="].includes(operator)) return false;
	if (right.type === "ArrowFunctionExpression") return true;
	if ((right.type === "FunctionExpression" || right.type === "ClassExpression") && !right.id) return true;
	return false;
}

/**
 * @param {ASTNode} node
 * @param {object} deps
 * @returns {number}
 */
function precedence(node) {
	return astUtils.getPrecedence(node);
}
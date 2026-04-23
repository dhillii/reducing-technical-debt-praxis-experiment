"use strict";

const { isParenthesized: isParenthesizedRaw } = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

/**
 * @type {import('../types').Rule.RuleModule}
 */
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
									enum: ["none", "all", "single-line", "multi-line"],
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
		messages: { unexpected: "Unnecessary parentheses around expression." },
	},
	create(context) {
		const sourceCode = context.sourceCode;
		const tokensToIgnore = new WeakSet();
		const precedence = astUtils.getPrecedence;
		const options = context.options[0] !== "functions" ? context.options[1] || {} : {};

		const flags = {
			ALL_NODES: context.options[0] !== "functions",
			EXCEPT_COND_ASSIGN: options.conditionalAssign === false,
			EXCEPT_COND_TERNARY: options.ternaryOperandBinaryExpressions === false,
			NESTED_BINARY: options.nestedBinaryExpressions === false,
			EXCEPT_RETURN_ASSIGN: options.returnAssign === false,
			IGNORE_JSX: options.ignoreJSX,
			IGNORE_ARROW_CONDITIONALS: options.enforceForArrowConditionals === false,
			IGNORE_SEQUENCE_EXPRESSIONS: options.enforceForSequenceExpressions === false,
			IGNORE_NEW_IN_MEMBER_EXPR: options.enforceForNewInMemberExpressions === false,
			IGNORE_FUNCTION_PROTOTYPE_METHODS: options.enforceForFunctionPrototypeMethods === false,
			ALLOW_PARENS_AFTER_COMMENT_PATTERN: options.allowParensAfterCommentPattern,
		};

		const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
		const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });

		let reportsBuffer;

		return {
			ArrayExpression(node) {
				node.elements
					.filter(
						e =>
							e &&
							hasExcessParensWithPrecedence(e, PRECEDENCE_OF_ASSIGNMENT_EXPR, {
								sourceCode,
								precedence,
								flags,
							}),
					)
					.forEach(reportNode);
			},
			ArrayPattern(node) {
				node.elements
					.filter(e => canBeAssignmentTarget(e) && isParenthesised(e, sourceCode))
					.forEach(reportNode);
			},
			ArrowFunctionExpression(node) {
				if (isReturnAssignException(node, flags, sourceCode)) return;
				if (node.body.type === "ConditionalExpression" && flags.IGNORE_ARROW_CONDITIONALS) return;

				if (node.body.type !== "BlockStatement") {
					const firstBodyToken = sourceCode.getFirstToken(node.body, astUtils.isNotOpeningParenToken);
					const tokenBeforeFirst = sourceCode.getTokenBefore(firstBodyToken);
					if (astUtils.isOpeningParenToken(tokenBeforeFirst) && astUtils.isOpeningBraceToken(firstBodyToken)) {
						tokensToIgnore.add(firstBodyToken);
					}
					if (hasExcessParensWithPrecedence(node.body, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) {
						reportNode(node.body);
					}
				}
			},
			AssignmentExpression(node) {
				if (canBeAssignmentTarget(node.left) && isParenthesised(node.left, sourceCode) && (!isAnonymousFunctionAssignmentException(node) || isParenthesisedTwice(node.left, sourceCode))) {
					reportNode(node.left);
				}
				if (!isReturnAssignException(node, flags, sourceCode) && hasExcessParensWithPrecedence(node.right, precedence(node), { sourceCode, precedence, flags })) {
					reportNode(node.right);
				}
			},
			BinaryExpression(node) {
				if (reportsBuffer && node.operator === "in") reportsBuffer.inExpressionNodes.push(node);
				checkBinaryLogical(node, { sourceCode, precedence, flags, PRECEDENCE_OF_ASSIGNMENT_EXPR });
			},
			CallExpression: node => checkCallNew(node, { sourceCode, precedence, flags, PRECEDENCE_OF_ASSIGNMENT_EXPR, PRECEDENCE_OF_UPDATE_EXPR, reportNode, isParenthesised, isParenthesisedTwice, isIIFE, isNewExpressionWithParens, doesMemberExpressionContainCallExpression, isImmediateFunctionPrototypeMethodCall, IGNORE_FUNCTION_PROTOTYPE_METHODS: flags.IGNORE_FUNCTION_PROTOTYPE_METHODS }),
			ConditionalExpression(node) {
				if (isReturnAssignException(node, flags, sourceCode)) return;

				const binaryOrLogical = new Set(["BinaryExpression", "LogicalExpression"]);
				if (!(flags.EXCEPT_COND_TERNARY && binaryOrLogical.has(node.test.type)) && !isCondAssignException(node, flags) && hasExcessParensWithPrecedence(node.test, precedence({ type: "LogicalExpression", operator: "||" }), { sourceCode, precedence, flags })) {
					reportNode(node.test);
				}
				if (!(flags.EXCEPT_COND_TERNARY && binaryOrLogical.has(node.consequent.type)) && hasExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) {
					reportNode(node.consequent);
				}
				if (!(flags.EXCEPT_COND_TERNARY && binaryOrLogical.has(node.alternate.type)) && hasExcessParensWithPrecedence(node.alternate, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) {
					reportNode(node.alternate);
				}
			},
			DoWhileStatement(node) {
				if (isParenthesised(node.test, sourceCode) && !isCondAssignException(node, flags)) {
					reportNode(node.test);
				}
			},
			ExportDefaultDeclaration: node => checkExpressionOrExportStatement(node.declaration, { sourceCode, flags, PRECEDENCE_OF_ASSIGNMENT_EXPR, reportNode, isParenthesised }),
			ExpressionStatement: node => checkExpressionOrExportStatement(node.expression, { sourceCode, flags, PRECEDENCE_OF_ASSIGNMENT_EXPR, reportNode, isParenthesised }),
			ForInStatement(node) {
				if (node.left.type !== "VariableDeclaration") {
					const firstLeftToken = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
					if (firstLeftToken.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(firstLeftToken, astUtils.isNotClosingParenToken))) {
						tokensToIgnore.add(firstLeftToken);
					}
				}
				if (isParenthesised(node.left, sourceCode)) reportNode(node.left);
				if (isParenthesised(node.right, sourceCode)) reportNode(node.right);
			},
			ForOfStatement(node) {
				if (node.left.type !== "VariableDeclaration") {
					const firstLeftToken = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
					if (firstLeftToken.value === "let") tokensToIgnore.add(firstLeftToken);
				}
				if (isParenthesised(node.left, sourceCode)) reportNode(node.left);
				if (hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) {
					reportNode(node.right);
				}
			},
			ForStatement(node) {
				if (node.test && isParenthesised(node.test, sourceCode) && !isCondAssignException(node, flags)) {
					reportNode(node.test);
				}
				if (node.update && isParenthesised(node.update, sourceCode)) {
					reportNode(node.update);
				}
				if (node.init && node.init.type !== "VariableDeclaration") {
					const firstToken = sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);
					if (firstToken.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(firstToken, astUtils.isNotClosingParenToken))) {
						tokensToIgnore.add(firstToken);
					}
				}
				if (node.init) {
					startReportsBuffer();
					if (isParenthesised(node.init, sourceCode)) reportNode(node.init);
				}
			},
			"ForStatement > *.init:exit"(node) {
				if (reportsBuffer && reportsBuffer.reports.length) {
					handleInExpressionNodes(node, reportsBuffer, sourceCode);
				}
				endReportsBuffer();
			},
			IfStatement(node) {
				if (isParenthesised(node.test, sourceCode) && !isCondAssignException(node, flags)) {
					reportNode(node.test);
				}
			},
			ImportExpression(node) {
				const src = node.source;
				if (src.type === "SequenceExpression") {
					if (isParenthesisedTwice(src, sourceCode)) reportNode(src);
				} else if (isParenthesised(src, sourceCode)) {
					reportNode(src);
				}
			},
			LogicalExpression: node => checkBinaryLogical(node, { sourceCode, precedence, flags, PRECEDENCE_OF_ASSIGNMENT_EXPR }),
			MemberExpression(node) {
				const allowWrapOnce = isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);
				const objHasExcess = allowWrapOnce ? isParenthesisedTwice(node.object, sourceCode) : isParenthesised(node.object, sourceCode) && !(isImmediateFunctionPrototypeMethodCall(node.parent) && node.parent.callee === node && flags.IGNORE_FUNCTION_PROTOTYPE_METHODS);
				if (objHasExcess && precedence(node.object) >= precedence(node) && (node.computed || !(astUtils.isDecimalInteger(node.object) || (node.object.type === "Literal" && node.object.regex)))) {
					reportNode(node.object);
				}
				if (objHasExcess && node.object.type === "CallExpression") reportNode(node.object);
				if (objHasExcess && !flags.IGNORE_NEW_IN_MEMBER_EXPR && node.object.type === "NewExpression" && isNewExpressionWithParens(node.object, sourceCode)) reportNode(node.object);
				if (objHasExcess && node.optional && node.object.type === "ChainExpression") reportNode(node.object);
				if (node.computed && isParenthesised(node.property, sourceCode)) reportNode(node.property);
			},
			"MethodDefinition[computed=true]": node => {
				if (hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) {
					reportNode(node.key);
				}
			},
			NewExpression: node => checkCallNew(node, { sourceCode, precedence, flags, PRECEDENCE_OF_ASSIGNMENT_EXPR, PRECEDENCE_OF_UPDATE_EXPR, reportNode, isParenthesised, isParenthesisedTwice, isIIFE, isNewExpressionWithParens, doesMemberExpressionContainCallExpression, isImmediateFunctionPrototypeMethodCall, IGNORE_FUNCTION_PROTOTYPE_METHODS: flags.IGNORE_FUNCTION_PROTOTYPE_METHODS }),
			ObjectExpression(node) {
				node.properties
					.filter(p => p.value && hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags }))
					.forEach(p => reportNode(p.value));
			},
			ObjectPattern(node) {
				node.properties
					.filter(p => canBeAssignmentTarget(p.value) && isParenthesised(p.value, sourceCode))
					.forEach(p => reportNode(p.value));
			},
			Property(node) {
				if (node.computed && node.key && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) {
					reportNode(node.key);
				}
			},
			PropertyDefinition(node) {
				if (node.computed && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) {
					reportNode(node.key);
				}
				if (node.value && hasExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) {
					reportNode(node.value);
				}
			},
			RestElement(node) {
				if (canBeAssignmentTarget(node.argument) && isParenthesised(node.argument, sourceCode)) {
					reportNode(node.argument);
				}
			},
			ReturnStatement(node) {
				if (isReturnAssignException(node, flags, sourceCode)) return;
				const token = sourceCode.getFirstToken(node);
				if (node.argument && hasExcessParensNoLineTerminator(token, node.argument, sourceCode) && !(node.argument.type === "Literal" && node.argument.regex)) {
					reportNode(node.argument);
				}
			},
			SequenceExpression(node) {
				const prec = precedence(node);
				node.expressions.filter(e => hasExcessParensWithPrecedence(e, prec, { sourceCode, precedence, flags })).forEach(reportNode);
			},
			SwitchCase(node) {
				if (node.test && isParenthesised(node.test, sourceCode)) reportNode(node.test);
			},
			SwitchStatement(node) {
				if (isParenthesised(node.discriminant, sourceCode)) reportNode(node.discriminant);
			},
			ThrowStatement(node) {
				const token = sourceCode.getFirstToken(node);
				if (hasExcessParensNoLineTerminator(token, node.argument, sourceCode)) reportNode(node.argument);
			},
			UnaryExpression: node => checkArgumentWithPrecedence(node, { sourceCode, precedence, flags, reportNode }),
			UpdateExpression(node) {
				if (node.prefix) {
					checkArgumentWithPrecedence(node, { sourceCode, precedence, flags, reportNode });
				} else {
					const { argument } = node;
					const operatorToken = sourceCode.getLastToken(node);
					if (argument.loc.end.line === operatorToken.loc.start.line) {
						checkArgumentWithPrecedence(node, { sourceCode, precedence, flags, reportNode });
					} else if (isParenthesisedTwice(argument, sourceCode)) {
						reportNode(argument);
					}
				}
			},
			AwaitExpression: node => checkArgumentWithPrecedence(node, { sourceCode, precedence, flags, reportNode }),
			VariableDeclarator(node) {
				if (node.init && hasExcessParensWithPrecedence(node.init, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags }) && !(node.init.type === "Literal" && node.init.regex)) {
					reportNode(node.init);
				}
			},
			WhileStatement(node) {
				if (isParenthesised(node.test, sourceCode) && !isCondAssignException(node, flags)) {
					reportNode(node.test);
				}
			},
			WithStatement(node) {
				if (isParenthesised(node.object, sourceCode)) reportNode(node.object);
			},
			YieldExpression(node) {
				if (node.argument) {
					const token = sourceCode.getFirstToken(node);
					if ((precedence(node.argument) >= precedence(node) && hasExcessParensNoLineTerminator(token, node.argument, sourceCode)) || isParenthesisedTwice(node.argument, sourceCode)) {
						reportNode(node.argument);
					}
				}
			},
			ClassDeclaration: node => checkClass(node, { sourceCode, precedence, PRECEDENCE_OF_UPDATE_EXPR, reportNode, isParenthesised, isParenthesisedTwice }),
			ClassExpression: node => checkClass(node, { sourceCode, precedence, PRECEDENCE_OF_UPDATE_EXPR, reportNode, isParenthesised, isParenthesisedTwice }),
			SpreadElement: node => checkSpreadOperator(node, { sourceCode, PRECEDENCE_OF_ASSIGNMENT_EXPR, reportNode, isParenthesised, isParenthesisedTwice }),
			SpreadProperty: node => checkSpreadOperator(node, { sourceCode, PRECEDENCE_OF_ASSIGNMENT_EXPR, reportNode, isParenthesised, isParenthesisedTwice }),
			ExperimentalSpreadProperty: node => checkSpreadOperator(node, { sourceCode, PRECEDENCE_OF_ASSIGNMENT_EXPR, reportNode, isParenthesised, isParenthesisedTwice }),
			TemplateLiteral(node) {
				node.expressions.filter(e => e && isParenthesised(e, sourceCode)).forEach(reportNode);
			},
			AssignmentPattern(node) {
				if (canBeAssignmentTarget(node.left) && isParenthesised(node.left, sourceCode)) reportNode(node.left);
				if (node.right && hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR, { sourceCode, precedence, flags })) reportNode(node.right);
			},
		};

		/** Helper Functions **/

		function startReportsBuffer() {
			reportsBuffer = { upper: reportsBuffer, inExpressionNodes: [], reports: [] };
		}
		function endReportsBuffer() {
			const { upper, inExpressionNodes, reports } = reportsBuffer;
			if (upper) {
				upper.inExpressionNodes.push(...inExpressionNodes);
				upper.reports.push(...reports);
			} else {
				reports.forEach(r => r.finishReport());
			}
			reportsBuffer = upper;
		}
		function handleInExpressionNodes(node, buffer, src) {
			buffer.reports.forEach(r => r.node);
			buffer.inExpressionNodes.forEach(inNode => {
				const path = pathToDescendant(node, inNode);
				let excludeNode;
				for (let i = 0; i < path.length; i++) {
					const cur = path[i];
					if (i < path.length - 1 && isSafelyEnclosingInExpression(cur, path[i + 1])) return;
					if (isParenthesised(cur, src)) {
						if (isInCurrentReportsBuffer(cur, buffer)) {
							if (isParenthesisedTwice(cur, src)) return;
							if (!excludeNode) excludeNode = cur;
						} else return;
					}
				}
				if (excludeNode) removeFromBuffer(excludeNode, buffer);
			});
		}
		function removeFromBuffer(node, buffer) {
			buffer.reports = buffer.reports.filter(r => r.node !== node);
		}
		function isInCurrentReportsBuffer(node, buffer) {
			return buffer.reports.some(r => r.node === node);
		}
		function reportNode(node) {
			const leftParen = sourceCode.getTokenBefore(node);
			const rightParen = sourceCode.getTokenAfter(node);
			if (!isParenthesisedTwice(node, sourceCode)) {
				if (tokensToIgnore.has(sourceCode.getFirstToken(node))) return;
				if (isIIFE(node) && !isParenthesised(node.callee, sourceCode)) return;
				if (flags.ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
					const comments = sourceCode.getCommentsBefore(leftParen);
					if (comments.length) {
						const pattern = new RegExp(flags.ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
						if (pattern.test(comments[comments.length - 1].value)) return;
					}
				}
			}
			const finish = () => {
				context.report({
					node,
					loc: leftParen.loc,
					messageId: "unexpected",
					fix: isFixable(node, sourceCode) ? fixer => {
						const inner = sourceCode.text.slice(leftParen.range[1], rightParen.range[0]);
						return fixer.replaceTextRange([leftParen.range[0], rightParen.range[1]],
							(requiresLeadingSpace(node, sourceCode) ? " " : "") + inner + (requiresTrailingSpace(node, sourceCode) ? " " : "")
						);
					} : null,
				});
			};
			if (reportsBuffer) {
				reportsBuffer.reports.push({ node, finishReport: finish });
			} else {
				finish();
			}
		}
	}
};

/** Utility Functions (outside create) **/

function isImmediateFunctionPrototypeMethodCall(node) {
	const callNode = astUtils.skipChainExpression(node);
	if (callNode.type !== "CallExpression") return false;
	const callee = astUtils.skipChainExpression(callNode.callee);
	return callee.type === "MemberExpression" && callee.object.type === "FunctionExpression" && ["call", "apply"].includes(astUtils.getStaticPropertyName(callee));
}
function isParenthesised(node, source) {
	return isParenthesizedRaw(1, node, source);
}
function isParenthesisedTwice(node, source) {
	return isParentizedRaw(2, node, source);
}
function hasExcessParensWithPrecedence(node, lower, ctx) {
	if (!isParenthesised(node, ctx.sourceCode)) return false;
	const prec = ctx.precedence(node);
	return prec >= lower || isParenthesisedTwice(node, ctx.sourceCode);
}
function isCondAssignException(node, flags) {
	return flags.EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
}
function isInReturnStatement(node) {
	for (let cur = node; cur; cur = cur.parent) {
		if (cur.type === "ReturnStatement" || (cur.type === "ArrowFunctionExpression" && cur.body.type !== "BlockStatement")) return true;
	}
	return false;
}
function isNewExpressionWithParens(expr, source) {
	const last = source.getLastToken(expr);
	const before = source.getTokenBefore(last);
	return expr.arguments.length > 0 || (astUtils.isOpeningParenToken(before) && astUtils.isClosingParenToken(last) && expr.callee.range[1] < expr.range[1]);
}
function canBeAssignmentTarget(node) {
	return node && (node.type === "Identifier" || node.type === "MemberExpression");
}
function isFixable(node, source) {
	if (node.type !== "Literal" || typeof node.value !== "string") return true;
	if (isParenthesisedTwice(node, source)) return true;
	return !astUtils.isTopLevelExpressionStatement(node.parent);
}
function requiresLeadingSpace(node, source) {
	const leftParen = source.getTokenBefore(node);
	const before = source.getTokenBefore(leftParen, { includeComments: true });
	const after = source.getTokenAfter(leftParen, { includeComments: true });
	return before && before.range[1] === leftParen.range[0] && leftParen.range[1] === after.range[0] && !astUtils.canTokensBeAdjacent(before, after);
}
function requiresTrailingSpace(node, source) {
	const tokens = source.getTokensAfter(node, { count: 2 });
	const rightParen = tokens[0];
	const after = tokens[1];
	const before = source.getLastToken(node);
	return rightParen && after && !source.isSpaceBetween(rightParen, after) && !astUtils.canTokensBeAdjacent(before, after);
}
function isIIFE(node) {
	const call = astUtils.skipChainExpression(node);
	return call.type === "CallExpression" && call.callee.type === "FunctionExpression";
}
function isAnonymousFunctionAssignmentException({ left, operator, right }) {
	if (left.type !== "Identifier") return false;
	if (!["=", "&&=", "||=", "??="].includes(operator)) return false;
	if (right.type === "ArrowFunctionExpression") return true;
	if ((right.type === "FunctionExpression" || right.type === "ClassExpression") && !right.id) return true;
	return false;
}
function isReturnAssignException(node, flags, source) {
	if (!flags.EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) return false;
	if (node.type === "ReturnStatement") return node.argument && containsAssignment(node.argument);
	if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") return containsAssignment(node.body);
	return containsAssignment(node);
}
function containsAssignment(node) {
	if (node.type === "AssignmentExpression") return true;
	if (node.type === "ConditionalExpression" && (node.consequent.type === "AssignmentExpression" || node.alternate.type === "AssignmentExpression")) return true;
	if ((node.left && node.left.type === "AssignmentExpression") || (node.right && node.right.type === "AssignmentExpression")) return true;
	return false;
}
function hasExcessParensNoLineTerminator(token, node, source) {
	return token.loc.end.line === node.loc.start.line ? isParenthesised(node, source) : isParenthesisedTwice(node, source);
}
function doesMemberExpressionContainCallExpression(node) {
	let cur = node.object;
	while (cur.type === "MemberExpression") cur = cur.object;
	return cur.type === "CallExpression";
}
function isMemberExpInNewCallee(node) {
	if (node.type !== "MemberExpression") return false;
	if (node.parent.type === "NewExpression" && node.parent.callee === node) return true;
	return node.parent.object === node && isMemberExpInNewCallee(node.parent);
}
function checkBinaryLogical(node, ctx) {
	const prec = ctx.precedence(node);
	const leftPrec = ctx.precedence(node.left);
	const rightPrec = ctx.precedence(node.right);
	const isExp = node.operator === "**";
	const skipLeft = ctx.flags.NESTED_BINARY && (node.left.type === "BinaryExpression" || node.left.type === "LogicalExpression");
	const skipRight = ctx.flags.NESTED_BINARY && (node.right.type === "BinaryExpression" || node.right.type === "LogicalExpression");

	if (!skipLeft && isParenthesised(node.left, ctx.sourceCode)) {
		if ((!["AwaitExpression", "UnaryExpression"].includes(node.left.type) || !isExp) && !astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node) && (leftPrec > prec || (leftPrec === prec && !isExp)) || isParenthesisedTwice(node.left, ctx.sourceCode)) {
			reportNode(node.left);
		}
	}
	if (!skipRight && isParenthesised(node.right, ctx.sourceCode)) {
		if (!astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node) && (rightPrec > prec || (rightPrec === prec && isExp)) || isParenthesisedTwice(node.right, ctx.sourceCode)) {
			reportNode(node.right);
		}
	}
}
function checkArgumentWithPrecedence(node, ctx) {
	if (hasExcessParensWithPrecedence(node.argument, ctx.precedence(node), ctx)) {
		reportNode(node.argument);
	}
}
function checkCallNew(node, ctx) {
	const callee = node.callee;
	if (hasExcessParensWithPrecedence(callee, ctx.precedence(node), ctx)) {
		if (isParenthesisedTwice(callee, ctx.sourceCode) || !(isIIFE(node) || (callee.type === "NewExpression" && !isNewExpressionWithParens(callee) && !(node.type === "NewExpression" && !isNewExpressionWithParens(node))) || (node.type === "NewExpression" && callee.type === "MemberExpression" && doesMemberExpressionContainCallExpression(callee)) || (!node.optional && callee.type === "ChainExpression"))) {
			reportNode(node.callee);
		}
	}
	node.arguments.filter(arg => hasExcessParensWithPrecedence(arg, ctx.PRECEDENCE_OF_ASSIGNMENT_EXPR, ctx)).forEach(reportNode);
}
function checkExpressionOrExportStatement(expr, ctx) {
	const first = isParenthesised(expr, ctx.sourceCode) ? sourceCode.getTokenBefore(expr) : sourceCode.getFirstToken(expr);
	const second = sourceCode.getTokenAfter(first, astUtils.isNotOpeningParenToken);
	const third = second ? sourceCode.getTokenAfter(second) : null;
	const afterClose = second ? sourceCode.getTokenAfter(second, astUtils.isNotClosingParenToken) : null;

	if (astUtils.isOpeningParenToken(first) && (astUtils.isOpeningBraceToken(second) || (second.type === "Keyword" && ["function", "class"].includes(second.value)) || (second && second.type === "Identifier" && second.value === "async" && third && third.type === "Keyword" && third.value === "function"))) {
		ctx.tokensToIgnore.add(second);
	}
	const extra = expr.parent.type === "ExportDefaultDeclaration"
		? hasExcessParensWithPrecedence(expr, ctx.PRECEDENCE_OF_ASSIGNMENT_EXPR, ctx)
		: isParenthesised(expr, ctx.sourceCode);
	if (extra) reportNode(expr);
}
function checkClass(node, ctx) {
	if (!node.superClass) return;
	const extra = ctx.precedence(node.superClass) > ctx.PRECEDENCE_OF_UPDATE_EXPR ? isParenthesised(node.superClass, ctx.sourceCode) : isParenthesisedTwice(node.superClass, ctx.sourceCode);
	if (extra) reportNode(node.superClass);
}
function checkSpreadOperator(node, ctx) {
	if (hasExcessParensWithPrecedence(node.argument, ctx.PRECEDENCE_OF_ASSIGNMENT_EXPR, ctx)) {
		reportNode(node.argument);
	}
}
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
function pathToDescendant(node, descendant) {
	return pathToAncestor(descendant, node).reverse();
}
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
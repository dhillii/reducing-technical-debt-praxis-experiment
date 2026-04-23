```javascript
/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

const { isParenthesized: isParenthesizedRaw } = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

/* ---------- Helper Functions (outside create) ---------- */

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

function ruleApplies(node, flags, sourceCode) {
	if (node.type === "JSXElement" || node.type === "JSXFragment") {
		const singleLine = node.loc.start.line === node.loc.end.line;
		switch (flags.IGNORE_JSX) {
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
	if (node.type === "SequenceExpression" && flags.IGNORE_SEQUENCE_EXPRESSIONS) return false;
	if (isImmediateFunctionPrototypeMethodCall(node) && flags.IGNORE_FUNCTION_PROTOTYPE_METHODS) return false;
	return (
		flags.ALL_NODES ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

function isParenthesised(node, sourceCode) {
	return isParenthesizedRaw(1, node, sourceCode);
}
function isParenthesisedTwice(node, sourceCode) {
	return isParenthesizedRaw(2, node, sourceCode);
}
function hasExcessParens(node, flags, sourceCode) {
	return ruleApplies(node, flags, sourceCode) && isParenthesised(node, sourceCode);
}
function hasDoubleExcessParens(node, sourceCode) {
	return isParenthesisedTwice(node, sourceCode);
}
function hasExcessParensWithPrecedence(node, lower, flags, sourceCode) {
	if (!ruleApplies(node, flags, sourceCode) || !isParenthesised(node, sourceCode)) return false;
	return (
		astUtils.getPrecedence(node) >= lower ||
		isParenthesisedTwice(node, sourceCode)
	);
}
function isCondAssignException(node, flags) {
	return flags.EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
}
function isInReturnStatement(node) {
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
function isNewExpressionWithParens(expr, sourceCode) {
	const last = sourceCode.getLastToken(expr);
	const penult = sourceCode.getTokenBefore(last);
	return (
		expr.arguments.length > 0 ||
		(astUtils.isOpeningParenToken(penult) &&
			astUtils.isClosingParenToken(last) &&
			expr.callee.range[1] < expr.range[1])
	);
}
function containsAssignment(node) {
	if (node.type === "AssignmentExpression") return true;
	if (
		node.type === "ConditionalExpression" &&
		(node.consequent.type === "AssignmentExpression" ||
			node.alternate.type === "AssignmentExpression")
	) {
		return true;
	}
	if ((node.left && node.left.type === "AssignmentExpression") || (node.right && node.right.type === "AssignmentExpression")) {
		return true;
	}
	return false;
}
function isReturnAssignException(node, flags) {
	if (!flags.EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) return false;
	if (node.type === "ReturnStatement") return node.argument && containsAssignment(node.argument);
	if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") return containsAssignment(node.body);
	return containsAssignment(node);
}
function hasExcessParensNoLineTerminator(token, node, flags, sourceCode) {
	return token.loc.end.line === node.loc.start.line
		? hasExcessParens(node, flags, sourceCode)
		: hasDoubleExcessParens(node, sourceCode);
}
function requiresLeadingSpace(node, sourceCode) {
	const leftParen = sourceCode.getTokenBefore(node);
	const before = sourceCode.getTokenBefore(leftParen, { includeComments: true });
	const after = sourceCode.getTokenAfter(leftParen, { includeComments: true });
	return (
		before &&
		before.range[1] === leftParen.range[0] &&
		leftParen.range[1] === after.range[0] &&
		!astUtils.canTokensBeAdjacent(before, after)
	);
}
function requiresTrailingSpace(node, sourceCode) {
	const [rightParen, after] = sourceCode.getTokensAfter(node, { count: 2 });
	const before = sourceCode.getLastToken(node);
	return (
		rightParen &&
		after &&
		!sourceCode.isSpaceBetween(rightParen, after) &&
		!astUtils.canTokensBeAdjacent(before, after)
	);
}
function isIIFE(node) {
	const call = astUtils.skipChainExpression(node);
	return call.type === "CallExpression" && call.callee.type === "FunctionExpression";
}
function canBeAssignmentTarget(node) {
	return node && (node.type === "Identifier" || node.type === "MemberExpression");
}
function isFixable(node, sourceCode) {
	if (node.type !== "Literal" || typeof node.value !== "string") return true;
	if (isParenthesisedTwice(node, sourceCode)) return true;
	return !astUtils.isTopLevelExpressionStatement(node.parent);
}
function report(node, context, sourceCode, tokensToIgnore, flags) {
	const leftParen = sourceCode.getTokenBefore(node);
	const rightParen = sourceCode.getTokenAfter(node);
	if (!isParenthesisedTwice(node, sourceCode)) {
		if (tokensToIgnore.has(sourceCode.getFirstToken(node))) return;
		if (isIIFE(node) && !isParenthesised(node, sourceCode)) return;
		if (flags.ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
			const comments = sourceCode.getCommentsBefore(leftParen);
			if (comments.length) {
				const pattern = new RegExp(flags.ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
				if (pattern.test(comments[comments.length - 1].value)) return;
			}
		}
	}
	const fix = isFixable(node, sourceCode)
		? fixer => {
				const inner = sourceCode.text.slice(leftParen.range[1], rightParen.range[0]);
				return fixer.replaceTextRange(
					[leftParen.range[0], rightParen.range[1]],
					(requiresLeadingSpace(node, sourceCode) ? " " : "") +
						inner +
						(requiresTrailingSpace(node, sourceCode) ? " " : "")
				);
		  }
		: null;
	context.report({ node, loc: leftParen.loc, messageId: "unexpected", fix });
}

/* ---------- Core Rule ---------- */

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
					plugin: { name: "@stylistic/eslint-plugin", url: "https://eslint.style" },
					rule: { name: "no-extra-parens", url: "https://eslint.style/rules/no-extra-parens" },
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
		schema: { /* unchanged */ },
		messages: { unexpected: "Unnecessary parentheses around expression." },
	},
	create(context) {
		const sourceCode = context.sourceCode;
		const tokensToIgnore = new WeakSet();

		const flags = {
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

		const PRECEDENCE_OF_ASSIGNMENT = astUtils.getPrecedence({ type: "AssignmentExpression" });
		const PRECEDENCE_OF_UPDATE = astUtils.getPrecedence({ type: "UpdateExpression" });

		/* ---------- Listener Helpers ---------- */

		function checkArgumentWithPrecedence(node) {
			if (hasExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
				report(node.argument, context, sourceCode, tokensToIgnore, flags);
			}
		}
		function doesMemberExpressionContainCallExpression(node) {
			let cur = node.object;
			while (cur.type === "MemberExpression") cur = cur.object;
			return cur.type === "CallExpression";
		}
		function checkCallNew(node) {
			const callee = node.callee;
			if (hasExcessParensWithPrecedence(callee, astUtils.getPrecedence(node), flags, sourceCode)) {
				const double = hasDoubleExcessParens(callee, sourceCode);
				const allowed =
					isIIFE(node) ||
					(callee.type === "NewExpression" && !isNewExpressionWithParens(callee, sourceCode) && !(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
					(node.type === "NewExpression" && callee.type === "MemberExpression" && doesMemberExpressionContainCallExpression(callee)) ||
					(!node.optional && callee.type === "ChainExpression");
				if (double || !allowed) report(callee, context, sourceCode, tokensToIgnore, flags);
			}
			node.arguments
				.filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode))
				.forEach(arg => report(arg, context, sourceCode, tokensToIgnore, flags));
		}
		function checkBinaryLogical(node) {
			const prec = astUtils.getPrecedence(node);
			const leftPrec = astUtils.getPrecedence(node.left);
			const rightPrec = astUtils.getPrecedence(node.right);
			const exp = node.operator === "**";
			const skipLeft = flags.NESTED_BINARY && ["BinaryExpression", "LogicalExpression"].includes(node.left.type);
			const skipRight = flags.NESTED_BINARY && ["BinaryExpression", "LogicalExpression"].includes(node.right.type);

			if (!skipLeft && hasExcessParens(node.left, flags, sourceCode)) {
				const cond =
					(!(["AwaitExpression", "UnaryExpression"].includes(node.left.type) && exp) &&
						!astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node) &&
						(leftPrec > prec || (leftPrec === prec && !exp))) ||
					hasDoubleExcessParens(node.left, sourceCode);
				if (cond) report(node.left, context, sourceCode, tokensToIgnore, flags);
			}
			if (!skipRight && hasExcessParens(node.right, flags, sourceCode)) {
				const cond =
					(!astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node) &&
						(rightPrec > prec || (rightPrec === prec && exp))) ||
					hasDoubleExcessParens(node.right, sourceCode);
				if (cond) report(node.right, context, sourceCode, tokensToIgnore, flags);
			}
		}
		function checkClass(node) {
			if (!node.superClass) return;
			const extra = astUtils.getPrecedence(node.superClass) > PRECEDENCE_OF_UPDATE
				? hasExcessParens(node.superClass, flags, sourceCode)
				: hasDoubleExcessParens(node.superClass, sourceCode);
			if (extra) report(node.superClass, context, sourceCode, tokensToIgnore, flags);
		}
		function checkSpreadOperator(node) {
			if (hasExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
				report(node.argument, context, sourceCode, tokensToIgnore, flags);
			}
		}
		function checkExpressionOrExportStatement(node) {
			const first = isParenthesised(node, sourceCode) ? sourceCode.getTokenBefore(node) : sourceCode.getFirstToken(node);
			const second = sourceCode.getTokenAfter(first, astUtils.isNotOpeningParenToken);
			const third = second && sourceCode.getTokenAfter(second);
			const afterClose = second && sourceCode.getTokenAfter(second, astUtils.isNotClosingParenToken);

			if (
				astUtils.isOpeningParenToken(first) &&
				(astUtils.isOpeningBraceToken(second) ||
					(second.type === "Keyword" && ["function", "class"].includes(second.value)) ||
					(second.type === "Keyword" && second.value === "let" && afterClose && (astUtils.isOpeningBracketToken(afterClose) || afterClose.type === "Identifier")) ||
					(second && second.type === "Identifier" && second.value === "async" && third && third.type === "Keyword" && third.value === "function"))
			) {
				tokensToIgnore.add(second);
			}
			const extra = node.parent.type === "ExportDefaultDeclaration"
				? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)
				: hasExcessParens(node, flags, sourceCode);
			if (extra) report(node, context, sourceCode, tokensToIgnore, flags);
		}
		function isMemberExpInNewCallee(node) {
			if (node.type !== "MemberExpression") return false;
			if (node.parent.type === "NewExpression" && node.parent.callee === node) return true;
			return node.parent.object === node && isMemberExpInNewCallee(node.parent);
		}
		function isAnonymousFunctionAssignmentException({ left, operator, right }) {
			if (left.type !== "Identifier") return false;
			if (!["=", "&&=", "||=", "??="].includes(operator)) return false;
			if (right.type === "ArrowFunctionExpression") return true;
			if ((right.type === "FunctionExpression" || right.type === "ClassExpression") && !right.id) return true;
			return false;
		}

		/* ---------- Visitor Map ---------- */

		return {
			ArrayExpression(node) {
				node.elements
					.filter(e => e && hasExcessParensWithPrecedence(e, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode))
					.forEach(e => report(e, context, sourceCode, tokensToIgnore, flags));
			},
			ArrayPattern(node) {
				node.elements
					.filter(e => canBeAssignmentTarget(e) && hasExcessParens(e, flags, sourceCode))
					.forEach(e => report(e, context, sourceCode, tokensToIgnore, flags));
			},
			ArrowFunctionExpression(node) {
				if (isReturnAssignException(node, flags)) return;
				if (node.body.type === "ConditionalExpression" && flags.IGNORE_ARROW_CONDITIONALS) return;
				if (node.body.type !== "BlockStatement") {
					const firstBody = sourceCode.getFirstToken(node.body, astUtils.isNotOpeningParenToken);
					const before = sourceCode.getTokenBefore(firstBody);
					if (astUtils.isOpeningParenToken(before) && astUtils.isOpeningBraceToken(firstBody)) tokensToIgnore.add(firstBody);
					if (hasExcessParensWithPrecedence(node.body, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
						report(node.body, context, sourceCode, tokensToIgnore, flags);
					}
				}
			},
			AssignmentExpression(node) {
				if (canBeAssignmentTarget(node.left) && hasExcessParens(node.left, flags, sourceCode) && (!isAnonymousFunctionAssignmentException(node) || hasDoubleExcessParens(node.left, sourceCode))) {
					report(node.left, context, sourceCode, tokensToIgnore, flags);
				}
				if (!isReturnAssignException(node, flags) && hasExcessParensWithPrecedence(node.right, astUtils.getPrecedence(node), flags, sourceCode)) {
					report(node.right, context, sourceCode, tokensToIgnore, flags);
				}
			},
			BinaryExpression(node) {
				if (node.operator === "in") this.inExpressionNodes?.push(node);
				checkBinaryLogical(node);
			},
			CallExpression: checkCallNew,
			ConditionalExpression(node) {
				if (isReturnAssignException(node, flags)) return;
				const binaryOrLogical = new Set(["BinaryExpression", "LogicalExpression"]);
				if (!(
					flags.EXCEPT_COND_TERNARY &&
					binaryOrLogical.has(node.test.type)
				) && !isCondAssignException(node, flags) && hasExcessParensWithPrecedence(node.test, astUtils.getPrecedence({ type: "LogicalExpression", operator: "||" }), flags, sourceCode)) {
					report(node.test, context, sourceCode, tokensToIgnore, flags);
				}
				if (!(
					flags.EXCEPT_COND_TERNARY &&
					binaryOrLogical.has(node.consequent.type)
				) && hasExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
					report(node.consequent, context, sourceCode, tokensToIgnore, flags);
				}
				if (!(
					flags.EXCEPT_COND_TERNARY &&
					binaryOrLogical.has(node.alternate.type)
				) && hasExcessParensWithPrecedence(node.alternate, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
					report(node.alternate, context, sourceCode, tokensToIgnore, flags);
				}
			},
			DoWhileStatement(node) {
				if (hasExcessParens(node.test, flags, sourceCode) && !isCondAssignException(node, flags)) {
					report(node.test, context, sourceCode, tokensToIgnore, flags);
				}
			},
			ExportDefaultDeclaration(node) {
				checkExpressionOrExportStatement(node.declaration);
			},
			ExpressionStatement(node) {
				checkExpressionOrExportStatement(node.expression);
			},
			ForInStatement(node) {
				if (node.left.type !== "VariableDeclaration") {
					const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
					if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
						tokensToIgnore.add(first);
					}
				}
				if (hasExcessParens(node.left, flags, sourceCode)) report(node.left, context, sourceCode, tokensToIgnore, flags);
				if (hasExcessParens(node.right, flags, sourceCode)) report(node.right, context, sourceCode, tokensToIgnore, flags);
			},
			ForOfStatement(node) {
				if (node.left.type !== "VariableDeclaration") {
					const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
					if (first.value === "let") tokensToIgnore.add(first);
				}
				if (hasExcessParens(node.left, flags, sourceCode)) report(node.left, context, sourceCode, tokensToIgnore, flags);
				if (hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) report(node.right, context, sourceCode, tokensToIgnore, flags);
			},
			ForStatement(node) {
				if (node.test && hasExcessParens(node.test, flags, sourceCode) && !isCondAssignException(node, flags)) report(node.test, context, sourceCode, tokensToIgnore, flags);
				if (node.update && hasExcessParens(node.update, flags, sourceCode)) report(node.update, context, sourceCode, tokensToIgnore, flags);
				if (node.init) {
					if (node.init.type !== "VariableDeclaration") {
						const first = sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);
						if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
							tokensToIgnore.add(first);
						}
					}
					if (hasExcessParens(node.init, flags, sourceCode)) report(node.init, context, sourceCode, tokensToIgnore, flags);
				}
			},
			"IfStatement(node) {
				if (hasExcessParens(node.test, flags, sourceCode) && !isCondAssignException(node, flags)) {
					report(node.test, context, sourceCode, tokensToIgnore, flags);
				}
			},
			ImportExpression(node) {
				const src = node.source;
				if (src.type === "SequenceExpression") {
					if (hasDoubleExcessParens(src, sourceCode)) report(src, context, sourceCode, tokensToIgnore, flags);
				} else if (hasExcessParens(src, flags, sourceCode)) {
					report(src, context, sourceCode, tokensToIgnore, flags);
				}
			},
			LogicalExpression: checkBinaryLogical,
			MemberExpression(node) {
				const allowWrapOnce = isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);
				const objExcess = allowWrapOnce
					? hasDoubleExcessParens(node.object, sourceCode)
					: hasExcessParens(node.object, flags, sourceCode) &&
					  !(isImmediateFunctionPrototypeMethodCall(node.parent) && node.parent.callee === node && flags.IGNORE_FUNCTION_PROTOTYPE_METHODS);
				if (objExcess && astUtils.getPrecedence(node.object) >= astUtils.getPrecedence(node) && (node.computed || !(astUtils.isDecimalInteger(node.object) || (node.object.type === "Literal" && node.object.regex)))) {
					report(node.object, context, sourceCode, tokensToIgnore, flags);
				}
				if (objExcess && node.object.type === "CallExpression") report(node.object, context, sourceCode, tokensToIgnore, flags);
				if (objExcess && !flags.IGNORE_NEW_IN_MEMBER_EXPR && node.object.type === "NewExpression" && isNewExpressionWithParens(node.object, sourceCode)) report(node.object, context, sourceCode, tokensToIgnore, flags);
				if (objExcess && node.optional && node.object.type === "ChainExpression") report(node.object, context, sourceCode, tokensToIgnore, flags);
				if (node.computed && hasExcessParens(node.property, flags, sourceCode)) report(node.property, context, sourceCode, tokensToIgnore, flags);
			},
			"MethodDefinition[computed=true]": function (node) {
				if (hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
					report(node.key, context, sourceCode, tokensToIgnore, flags);
				}
			},
			NewExpression: checkCallNew,
			ObjectExpression(node) {
				node.properties
					.filter(p => p.value && hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode))
					.forEach(p => report(p.value, context, sourceCode, tokensToIgnore, flags));
			},
			ObjectPattern(node) {
				node.properties
					.filter(p => canBeAssignmentTarget(p.value) && hasExcessParens(p.value, flags, sourceCode))
					.forEach(p => report(p.value, context, sourceCode, tokensToIgnore, flags));
			},
			Property(node) {
				if (node.computed && node.key && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
					report(node.key, context, sourceCode, tokensToIgnore, flags);
				}
			},
			PropertyDefinition(node) {
				if (node.computed && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
					report(node.key, context, sourceCode, tokensToIgnore, flags);
				}
				if (node.value && hasExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) {
					report(node.value, context, sourceCode, tokensToIgnore, flags);
				}
			},
			RestElement(node) {
				if (canBeAssignmentTarget(node.argument) && hasExcessParens(node.argument, flags, sourceCode)) {
					report(node.argument, context, sourceCode, tokensToIgnore, flags);
				}
			},
			ReturnStatement(node) {
				if (isReturnAssignException(node, flags)) return;
				const token = sourceCode.getFirstToken(node);
				if (node.argument && hasExcessParensNoLineTerminator(token, node.argument, flags, sourceCode) && !(node.argument.type === "Literal" && node.argument.regex)) {
					report(node.argument, context, sourceCode, tokensToIgnore, flags);
				}
			},
			SequenceExpression(node) {
				const prec = astUtils.getPrecedence(node);
				node.expressions
					.filter(e => hasExcessParensWithPrecedence(e, prec, flags, sourceCode))
					.forEach(e => report(e, context, sourceCode, tokensToIgnore, flags));
			},
			SwitchCase(node) {
				if (node.test && hasExcessParens(node.test, flags, sourceCode)) report(node.test, context, sourceCode, tokensToIgnore, flags);
			},
			SwitchStatement(node) {
				if (hasExcessParens(node.discriminant, flags, sourceCode)) report(node.discriminant, context, sourceCode, tokensToIgnore, flags);
			},
			ThrowStatement(node) {
				const token = sourceCode.getFirstToken(node);
				if (hasExcessParensNoLineTerminator(token, node.argument, flags, sourceCode)) {
					report(node.argument, context, sourceCode, tokensToIgnore, flags);
				}
			},
			UnaryExpression: checkArgumentWithPrecedence,
			UpdateExpression(node) {
				if (node.prefix) {
					checkArgumentWithPrecedence(node);
				} else {
					const { argument } = node;
					const opToken = sourceCode.getLastToken(node);
					if (argument.loc.end.line === opToken.loc.start.line) {
						checkArgumentWithPrecedence(node);
					} else if (hasDoubleExcessParens(argument, sourceCode)) {
						report(argument, context, sourceCode, tokensToIgnore, flags);
					}
				}
			},
			AwaitExpression: checkArgumentWithPrecedence,
			VariableDeclarator(node) {
				if (node.init && hasExcessParensWithPrecedence(node.init, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode) && !(node.init.type === "Literal" && node.init.regex)) {
					report(node.init, context, sourceCode, tokensToIgnore, flags);
				}
			},
			WhileStatement(node) {
				if (hasExcessParens(node.test, flags, sourceCode) && !isCondAssignException(node, flags)) {
					report(node.test, context, sourceCode, tokensToIgnore, flags);
				}
			},
			WithStatement(node) {
				if (hasExcessParens(node.object, flags, sourceCode)) report(node.object, context, sourceCode, tokensToIgnore, flags);
			},
			YieldExpression(node) {
				if (node.argument) {
					const token = sourceCode.getFirstToken(node);
					if ((astUtils.getPrecedence(node.argument) >= astUtils.getPrecedence(node) && hasExcessParensNoLineTerminator(token, node.argument, flags, sourceCode)) || hasDoubleExcessParens(node.argument, sourceCode)) {
						report(node.argument, context, sourceCode, tokensToIgnore, flags);
					}
				}
			},
			ClassDeclaration: checkClass,
			ClassExpression: checkClass,
			SpreadElement: checkSpreadOperator,
			SpreadProperty: checkSpreadOperator,
			ExperimentalSpreadProperty: checkSpreadOperator,
			TemplateLiteral(node) {
				node.expressions
					.filter(e => e && hasExcessParens(e, flags, sourceCode))
					.forEach(e => report(e, context, sourceCode, tokensToIgnore, flags));
			},
			AssignmentPattern(node) {
				if (canBeAssignmentTarget(node.left) && hasExcessParens(node.left, flags, sourceCode)) report(node.left, context, sourceCode, tokensToIgnore, flags);
				if (node.right && hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT, flags, sourceCode)) report(node.right, context, sourceCode, tokensToIgnore, flags);
			},
		};
	},
};
```
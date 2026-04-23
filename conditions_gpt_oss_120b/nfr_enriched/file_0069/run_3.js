/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

const {
	isParenthesized: isParenthesizedRaw,
} = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

/**
 * Determines whether the given node is a `call` or `apply` method call,
 * invoked directly on a `FunctionExpression` node.
 * @param {ASTNode} node The node to be checked.
 * @returns {boolean} True if the node is an immediate `call` or `apply` method call.
 */
function isImmediateFunctionPrototypeMethodCall(node) {
	const callNode = astUtils.skipChainExpression(node);
	if (callNode.type !== "CallExpression") {
		return false;
	}
	const callee = astUtils.skipChainExpression(callNode.callee);
	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "FunctionExpression" &&
		["call", "apply"].includes(astUtils.getStaticPropertyName(callee))
	);
}

/**
 * Determines if a node is surrounded by parentheses.
 * @param {ASTNode} node The node to be checked.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {boolean}
 */
function isParenthesised(node, sourceCode) {
	return isParenthesizedRaw(1, node, sourceCode);
}

/**
 * Determines if a node is surrounded by parentheses twice.
 * @param {ASTNode} node The node to be checked.
 * @param {SourceCode} sourceCode The source code object.
 * @returns {boolean}
 */
function isParenthesisedTwice(node, sourceCode) {
	return isParenthesizedRaw(2, node, sourceCode);
}

/**
 * Checks whether the rule should be applied to a node.
 * @param {ASTNode} node
 * @param {Object} cfg
 * @returns {boolean}
 */
function ruleApplies(node, cfg) {
	if (node.type === "JSXElement" || node.type === "JSXFragment") {
		const isSingleLine = node.loc.start.line === node.loc.end.line;
		switch (cfg.IGNORE_JSX) {
			case "all":
				return false;
			case "multi-line":
				return isSingleLine;
			case "single-line":
				return !isSingleLine;
			case "none":
				break;
		}
	}
	if (node.type === "SequenceExpression" && cfg.IGNORE_SEQUENCE_EXPRESSIONS) {
		return false;
	}
	if (
		isImmediateFunctionPrototypeMethodCall(node) &&
		cfg.IGNORE_FUNCTION_PROTOTYPE_METHODS
	) {
		return false;
	}
	return (
		cfg.ALL_NODES ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

/**
 * Determines if a node has excess parentheses.
 * @param {ASTNode} node
 * @param {Object} cfg
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function hasExcessParens(node, cfg, sourceCode) {
	return ruleApplies(node, cfg) && isParenthesised(node, sourceCode);
}

/**
 * Determines if a node has double excess parentheses.
 * @param {ASTNode} node
 * @param {Object} cfg
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function hasDoubleExcessParens(node, cfg, sourceCode) {
	return ruleApplies(node, cfg) && isParenthesisedTwice(node, sourceCode);
}

/**
 * Determines if a node has excess parentheses considering precedence.
 * @param {ASTNode} node
 * @param {number} lowerLimit
 * @param {Object} cfg
 * @param {SourceCode} sourceCode
 * @param {Function} precedence
 * @returns {boolean}
 */
function hasExcessParensWithPrecedence(
	node,
	lowerLimit,
	cfg,
	sourceCode,
	precedence,
) {
	if (ruleApplies(node, cfg) && isParenthesised(node, sourceCode)) {
		if (precedence(node) >= lowerLimit || isParenthesisedTwice(node, sourceCode)) {
			return true;
		}
	}
	return false;
}

/**
 * Determines if a node is a conditional assignment exception.
 * @param {ASTNode} node
 * @param {Object} cfg
 * @returns {boolean}
 */
function isCondAssignException(node, cfg) {
	return cfg.EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
}

/**
 * Determines if a node is inside a return statement.
 * @param {ASTNode} node
 * @returns {boolean}
 */
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

/**
 * Determines if a node is a return assignment exception.
 * @param {ASTNode} node
 * @param {Object} cfg
 * @returns {boolean}
 */
function isReturnAssignException(node, cfg) {
	if (!cfg.EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) {
		return false;
	}
	if (node.type === "ReturnStatement") {
		return node.argument && containsAssignment(node.argument);
	}
	if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
		return containsAssignment(node.body);
	}
	return containsAssignment(node);
}

/**
 * Checks if a node contains an assignment expression.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function containsAssignment(node) {
	if (node.type === "AssignmentExpression") {
		return true;
	}
	if (
		node.type === "ConditionalExpression" &&
		(node.consequent.type === "AssignmentExpression" ||
			node.alternate.type === "AssignmentExpression")
	) {
		return true;
	}
	if ((node.left && node.left.type === "AssignmentExpression") ||
		(node.right && node.right.type === "AssignmentExpression")) {
		return true;
	}
	return false;
}

/**
 * Determines if a node can be an assignment target.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function canBeAssignmentTarget(node) {
	return node && (node.type === "Identifier" || node.type === "MemberExpression");
}

/**
 * Determines if a node is fixable.
 * @param {ASTNode} node
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isFixable(node, sourceCode) {
	if (node.type !== "Literal" || typeof node.value !== "string") {
		return true;
	}
	if (isParenthesisedTwice(node, sourceCode)) {
		return true;
	}
	return !astUtils.isTopLevelExpressionStatement(node.parent);
}

/**
 * Determines if a node is an IIFE.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isIIFE(node) {
	const maybeCall = astUtils.skipChainExpression(node);
	return maybeCall.type === "CallExpression" && maybeCall.callee.type === "FunctionExpression";
}

/**
 * Determines if a node is a new expression with parentheses.
 * @param {ASTNode} newExpression
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isNewExpressionWithParens(newExpression, sourceCode) {
	const last = sourceCode.getLastToken(newExpression);
	const penultimate = sourceCode.getTokenBefore(last);
	return (
		newExpression.arguments.length > 0 ||
		(astUtils.isOpeningParenToken(penultimate) &&
			astUtils.isClosingParenToken(last) &&
			newExpression.callee.range[1] < newExpression.range[1])
	);
}

/**
 * Determines if a node is a member expression inside a NewExpression callee.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isMemberExpInNewCallee(node) {
	if (node.type !== "MemberExpression") return false;
	if (node.parent.type === "NewExpression" && node.parent.callee === node) {
		return true;
	}
	if (node.parent.object === node) {
		return isMemberExpInNewCallee(node.parent);
	}
	return false;
}

/**
 * Determines if a node is an anonymous function assignment exception.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isAnonymousFunctionAssignmentException({ left, operator, right }) {
	if (left.type !== "Identifier") return false;
	if (!["=", "&&=", "||=", "??="].includes(operator)) return false;
	if (right.type === "ArrowFunctionExpression") return true;
	if ((right.type === "FunctionExpression" || right.type === "ClassExpression") && !right.id) {
		return true;
	}
	return false;
}

/**
 * Determines if a node should be reported (early‑exit checks).
 * @param {ASTNode} node
 * @param {Object} ctx
 * @param {Object} cfg
 * @returns {boolean} true if reporting must be skipped.
 */
function shouldSkipReport(node, ctx, cfg) {
	const sourceCode = ctx.sourceCode;
	const leftParen = sourceCode.getTokenBefore(node);
	const rightParen = sourceCode.getTokenAfter(node);

	if (isParenthesisedTwice(node, sourceCode)) return false;
	if (ctx.tokensToIgnore.has(sourceCode.getFirstToken(node))) return true;
	if (isIIFE(node) && !isParenthesised(node.callee, sourceCode)) return true;

	if (cfg.ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
		const comments = sourceCode.getCommentsBefore(leftParen);
		if (comments.length) {
			const pattern = new RegExp(cfg.ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
			if (pattern.test(comments[comments.length - 1].value)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Performs the actual reporting.
 * @param {ASTNode} node
 * @param {Object} ctx
 * @param {Object} cfg
 */
function performReport(node, ctx, cfg) {
	const sourceCode = ctx.sourceCode;
	const leftParen = sourceCode.getTokenBefore(node);
	const rightParen = sourceCode.getTokenAfter(node);

	ctx.context.report({
		node,
		loc: leftParen.loc,
		messageId: "unexpected",
		fix: isFixable(node, sourceCode)
			? fixer => {
					const inner = sourceCode.text.slice(leftParen.range[1], rightParen.range[0]);
					const leading = requiresLeadingSpace(node, sourceCode) ? " " : "";
					const trailing = requiresTrailingSpace(node, sourceCode) ? " " : "";
					return fixer.replaceTextRange(
						[leftParen.range[0], rightParen.range[1]],
						leading + inner + trailing,
					);
			  }
			: null,
	});
}

/**
 * Determines whether a node needs a leading space after removing parentheses.
 * @param {ASTNode} node
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
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

/**
 * Determines whether a node needs a trailing space after removing parentheses.
 * @param {ASTNode} node
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function requiresTrailingSpace(node, sourceCode) {
	const tokens = sourceCode.getTokensAfter(node, { count: 2 });
	const rightParen = tokens[0];
	const after = tokens[1];
	const before = sourceCode.getLastToken(node);
	return (
		rightParen &&
		after &&
		!sourceCode.isSpaceBetween(rightParen, after) &&
		!astUtils.canTokensBeAdjacent(before, after)
	);
}

/**
 * Checks a binary or logical expression side.
 * @param {ASTNode} sideNode
 * @param {ASTNode} parentNode
 * @param {Object} cfg
 * @param {SourceCode} sourceCode
 * @param {Function} precedence
 * @param {Function} report
 */
function checkBinarySide(sideNode, parentNode, cfg, sourceCode, precedence, report) {
	if (!sideNode) return;
	const sidePrec = precedence(sideNode);
	const parentPrec = precedence(parentNode);
	const isExp = parentNode.operator === "**";

	if (hasExcessParens(sideNode, cfg, sourceCode)) {
		const mixed = astUtils.isMixedLogicalAndCoalesceExpressions(sideNode, parentNode);
		const condition =
			!mixed &&
			((sidePrec > parentPrec) ||
				(sidePrec === parentPrec && (parentNode.operator === "**" ? !isExp : true)));
		if (condition || isParenthesisedTwice(sideNode, sourceCode)) {
			report(sideNode);
		}
	}
}

/**
 * Checks binary/logical expressions.
 * @param {ASTNode} node
 * @param {Object} cfg
 * @param {SourceCode} sourceCode
 * @param {Function} precedence
 * @param {Function} report
 */
function checkBinaryLogical(node, cfg, sourceCode, precedence, report) {
	const skipLeft = cfg.NESTED_BINARY && (node.left.type === "BinaryExpression" || node.left.type === "LogicalExpression");
	const skipRight = cfg.NESTED_BINARY && (node.right.type === "BinaryExpression" || node.right.type === "LogicalExpression");

	if (!skipLeft) checkBinarySide(node.left, node, cfg, sourceCode, precedence, report);
	if (!skipRight) checkBinarySide(node.right, node, cfg, sourceCode, precedence, report);
}

/**
 * Checks CallExpression / NewExpression nodes.
 * @param {ASTNode} node
 * @param {Object} cfg
 * @param {SourceCode} sourceCode
 * @param {Function} precedence
 * @param {Function} report
 */
function checkCallOrNew(node, cfg, sourceCode, precedence, report) {
	const callee = node.callee;
	if (hasExcessParensWithPrecedence(callee, precedence(node), cfg, sourceCode, precedence)) {
		const double = hasDoubleExcessParens(callee, cfg, sourceCode);
		const allowed =
			isIIFE(node) ||
			(callee.type === "NewExpression" &&
				!isNewExpressionWithParens(callee, sourceCode) &&
				!(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
			(node.type === "NewExpression" &&
				callee.type === "MemberExpression" &&
				doesMemberExpressionContainCallExpression(callee)) ||
			(!node.optional && callee.type === "ChainExpression");
		if (!double && !allowed) {
			report(callee);
		}
	}
	node.arguments
		.filter(arg => hasExcessParensWithPrecedence(arg, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, precedence))
		.forEach(report);
}

/**
 * Determines if a member expression contains a call expression.
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
 * Main rule creation.
 * @param {RuleContext} context
 * @returns {RuleListener}
 */
function create(context) {
	const sourceCode = context.sourceCode;
	const tokensToIgnore = new WeakSet();

	const ALL_NODES = context.options[0] !== "functions";
	const cfg = {
		ALL_NODES,
		EXCEPT_COND_ASSIGN: ALL_NODES && context.options[1]?.conditionalAssign === false,
		EXCEPT_COND_TERNARY: ALL_NODES && context.options[1]?.ternaryOperandBinaryExpressions === false,
		NESTED_BINARY: ALL_NODES && context.options[1]?.nestedBinaryExpressions === false,
		EXCEPT_RETURN_ASSIGN: ALL_NODES && context.options[1]?.returnAssign === false,
		IGNORE_JSX: ALL_NODES && context.options[1]?.ignoreJSX,
		IGNORE_ARROW_CONDITIONALS: ALL_NODES && context.options[1]?.enforceForArrowConditionals === false,
		IGNORE_SEQUENCE_EXPRESSIONS: ALL_NODES && context.options[1]?.enforceForSequenceExpressions === false,
		IGNORE_NEW_IN_MEMBER_EXPR: ALL_NODES && context.options[1]?.enforceForNewInMemberExpressions === false,
		IGNORE_FUNCTION_PROTOTYPE_METHODS: ALL_NODES && context.options[1]?.enforceForFunctionPrototypeMethods === false,
		ALLOW_PARENS_AFTER_COMMENT_PATTERN: ALL_NODES && context.options[1]?.allowParensAfterCommentPattern,
		PRECEDENCE_OF_ASSIGNMENT_EXPR: astUtils.getPrecedence({ type: "AssignmentExpression" }),
		PRECEDENCE_OF_UPDATE_EXPR: astUtils.getPrecedence({ type: "UpdateExpression" }),
	};

	let reportsBuffer = null;

	function startBuffer() {
		reportsBuffer = { upper: reportsBuffer, inExpressionNodes: [], reports: [] };
	}
	function endBuffer() {
		const { upper, inExpressionNodes, reports } = reportsBuffer;
		if (upper) {
			upper.inExpressionNodes.push(...inExpressionNodes);
			upper.reports.push(...reports);
		} else {
			reports.forEach(r => r.finishReport());
		}
		reportsBuffer = upper;
	}
	function isInCurrentBuffer(node) {
		return reportsBuffer.reports.some(r => r.node === node);
	}
	function removeFromCurrentBuffer(node) {
		reportsBuffer.reports = reportsBuffer.reports.filter(r => r.node !== node);
	}
	function report(node) {
		if (shouldSkipReport(node, { sourceCode, tokensToIgnore }, cfg)) return;
		const leftParen = sourceCode.getTokenBefore(node);
		const rightParen = sourceCode.getTokenAfter(node);
		const finish = () => performReport(node, { sourceCode, tokensToIgnore, context }, cfg);
		if (reportsBuffer) {
			reportsBuffer.reports.push({ node, finishReport: finish });
		} else {
			finish();
		}
	}

	return {
		ArrayExpression(node) {
			node.elements
				.filter(e => e && hasExcessParensWithPrecedence(e, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence))
				.forEach(report);
		},
		ArrayPattern(node) {
			node.elements
				.filter(e => canBeAssignmentTarget(e) && hasExcessParens(e, cfg, sourceCode))
				.forEach(report);
		},
		ArrowFunctionExpression(node) {
			if (isReturnAssignException(node, cfg)) return;
			if (node.body.type === "ConditionalExpression" && cfg.IGNORE_ARROW_CONDITIONALS) return;
			if (node.body.type !== "BlockStatement") {
				const firstBody = sourceCode.getFirstToken(node.body, astUtils.isNotOpeningParenToken);
				const before = sourceCode.getTokenBefore(firstBody);
				if (astUtils.isOpeningParenToken(before) && astUtils.isOpeningBraceToken(firstBody)) {
					tokensToIgnore.add(firstBody);
				}
				if (hasExcessParensWithPrecedence(node.body, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
					report(node.body);
				}
			}
		},
		AssignmentExpression(node) {
			if (canBeAssignmentTarget(node.left) && hasExcessParens(node.left, cfg, sourceCode) && (!isAnonymousFunctionAssignmentException(node) || isParenthesisedTwice(node.left, sourceCode))) {
				report(node.left);
			}
			if (!isReturnAssignException(node, cfg) && hasExcessParensWithPrecedence(node.right, astUtils.getPrecedence(node), cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.right);
			}
		},
		BinaryExpression(node) {
			if (reportsBuffer && node.operator === "in") {
				reportsBuffer.inExpressionNodes.push(node);
			}
			checkBinaryLogical(node, cfg, sourceCode, astUtils.getPrecedence, report);
		},
		CallExpression(node) {
			checkCallOrNew(node, cfg, sourceCode, astUtils.getPrecedence, report);
		},
		ConditionalExpression(node) {
			if (isReturnAssignException(node, cfg)) return;
			const allowedTypes = new Set(["BinaryExpression", "LogicalExpression"]);
			if (!(
				cfg.EXCEPT_COND_TERNARY &&
				allowedTypes.has(node.test.type)
			) && !isCondAssignException(node, cfg) && hasExcessParensWithPrecedence(node.test, astUtils.getPrecedence({ type: "LogicalExpression", operator: "||" }), cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.test);
			}
			if (!(
				cfg.EXCEPT_COND_TERNARY &&
				allowedTypes.has(node.consequent.type)
			) && hasExcessParensWithPrecedence(node.consequent, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.consequent);
			}
			if (!(
				cfg.EXCEPT_COND_TERNARY &&
				allowedTypes.has(node.alternate.type)
			) && hasExcessParensWithPrecedence(node.alternate, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.alternate);
			}
		},
		DoWhileStatement(node) {
			if (hasExcessParens(node.test, cfg, sourceCode) && !isCondAssignException(node, cfg)) {
				report(node.test);
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
			if (hasExcessParens(node.left, cfg, sourceCode)) report(node.left);
			if (hasExcessParens(node.right, cfg, sourceCode)) report(node.right);
		},
		ForOfStatement(node) {
			if (node.left.type !== "VariableDeclaration") {
				const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
				if (first.value === "let") tokensToIgnore.add(first);
			}
			if (hasExcessParens(node.left, cfg, sourceCode)) report(node.left);
			if (hasExcessParensWithPrecedence(node.right, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.right);
			}
		},
		ForStatement(node) {
			if (node.test && hasExcessParens(node.test, cfg, sourceCode) && !isCondAssignException(node, cfg)) {
				report(node.test);
			}
			if (node.update && hasExcessParens(node.update, cfg, sourceCode)) {
				report(node.update);
			}
			if (node.init) {
				if (node.init.type !== "VariableDeclaration") {
					const first = sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);
					if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
						tokensToIgnore.add(first);
					}
				}
				startBuffer();
				if (hasExcessParens(node.init, cfg, sourceCode)) report(node.init);
			}
		},
		"ForStatement > *.init:exit"(node) {
			if (reportsBuffer?.reports.length) {
				reportsBuffer.inExpressionNodes.forEach(inNode => {
					const path = pathToDescendant(node, inNode);
					let excludeNode = null;
					for (let i = 0; i < path.length; i++) {
						const cur = path[i];
						if (i < path.length - 1) {
							const next = path[i + 1];
							if (isSafelyEnclosingInExpression(cur, next)) return;
						}
						if (isParenthesised(cur, sourceCode)) {
							if (isInCurrentBuffer(cur)) {
								if (isParenthesisedTwice(cur, sourceCode)) return;
								if (!excludeNode) excludeNode = cur;
							} else {
								return;
							}
						}
					}
					if (excludeNode) removeFromCurrentBuffer(excludeNode);
				});
			}
			endBuffer();
		},
		IfStatement(node) {
			if (hasExcessParens(node.test, cfg, sourceCode) && !isCondAssignException(node, cfg)) {
				report(node.test);
			}
		},
		ImportExpression(node) {
			const src = node.source;
			if (src.type === "SequenceExpression") {
				if (hasDoubleExcessParens(src, cfg, sourceCode)) report(src);
			} else if (hasExcessParens(src, cfg, sourceCode)) {
				report(src);
			}
		},
		LogicalExpression(node) {
			checkBinaryLogical(node, cfg, sourceCode, astUtils.getPrecedence, report);
		},
		MemberExpression(node) {
			const allowWrapOnce = isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);
			const objHasExcess = allowWrapOnce
				? hasDoubleExcessParens(node.object, cfg, sourceCode)
				: hasExcessParens(node.object, cfg, sourceCode) &&
				  !(isImmediateFunctionPrototypeMethodCall(node.parent) && node.parent.callee === node && cfg.IGNORE_FUNCTION_PROTOTYPE_METHODS);
			if (objHasExcess && precedence(node.object) >= precedence(node) && (node.computed || !(astUtils.isDecimalInteger(node.object) || (node.object.type === "Literal" && node.object.regex)))) {
				report(node.object);
			}
			if (objHasExcess && node.object.type === "CallExpression") report(node.object);
			if (objHasExcess && !cfg.IGNORE_NEW_IN_MEMBER_EXPR && node.object.type === "NewExpression" && isNewExpressionWithParens(node.object, sourceCode)) {
				report(node.object);
			}
			if (objHasExcess && node.optional && node.object.type === "ChainExpression") {
				report(node.object);
			}
			if (node.computed && hasExcessParens(node.property, cfg, sourceCode)) {
				report(node.property);
			}
		},
		"MethodDefinition[computed=true]"(node) {
			if (hasExcessParensWithPrecedence(node.key, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.key);
			}
		},
		NewExpression(node) {
			checkCallOrNew(node, cfg, sourceCode, astUtils.getPrecedence, report);
		},
		ObjectExpression(node) {
			node.properties
				.filter(p => p.value && hasExcessParensWithPrecedence(p.value, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence))
				.forEach(p => report(p.value));
		},
		ObjectPattern(node) {
			node.properties
				.filter(p => {
					const v = p.value;
					return canBeAssignmentTarget(v) && hasExcessParens(v, cfg, sourceCode);
				})
				.forEach(p => report(p.value));
		},
		Property(node) {
			if (node.computed && node.key && hasExcessParensWithPrecedence(node.key, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.key);
			}
		},
		PropertyDefinition(node) {
			if (node.computed && hasExcessParensWithPrecedence(node.key, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.key);
			}
			if (node.value && hasExcessParensWithPrecedence(node.value, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.value);
			}
		},
		RestElement(node) {
			if (canBeAssignmentTarget(node.argument) && hasExcessParens(node.argument, cfg, sourceCode)) {
				report(node.argument);
			}
		},
		ReturnStatement(node) {
			if (isReturnAssignException(node, cfg)) return;
			const token = sourceCode.getFirstToken(node);
			if (node.argument && hasExcessParensWithPrecedence(node.argument, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence) && !(node.argument.type === "Literal" && node.argument.regex)) {
				report(node.argument);
			}
		},
		SequenceExpression(node) {
			const prec = astUtils.getPrecedence(node);
			node.expressions
				.filter(e => hasExcessParensWithPrecedence(e, prec, cfg, sourceCode, astUtils.getPrecedence))
				.forEach(report);
		},
		SwitchCase(node) {
			if (node.test && hasExcessParens(node.test, cfg, sourceCode)) report(node.test);
		},
		SwitchStatement(node) {
			if (hasExcessParens(node.discriminant, cfg, sourceCode)) report(node.discriminant);
		},
		ThrowStatement(node) {
			const token = sourceCode.getFirstToken(node);
			if (hasExcessParensWithPrecedence(node.argument, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.argument);
			}
		},
		UnaryExpression(node) {
			if (node.prefix) {
				if (hasExcessParensWithPrecedence(node.argument, astUtils.getPrecedence(node), cfg, sourceCode, astUtils.getPrecedence)) {
					report(node.argument);
				}
			} else {
				const arg = node.argument;
				const opToken = sourceCode.getLastToken(node);
				if (arg.loc.end.line === opToken.loc.start.line) {
					if (hasExcessParensWithPrecedence(arg, astUtils.getPrecedence(node), cfg, sourceCode, astUtils.getPrecedence)) {
						report(arg);
					}
				} else if (hasDoubleExcessParens(arg, cfg, sourceCode)) {
					report(arg);
				}
			}
		},
		AwaitExpression(node) {
			if (hasExcessParensWithPrecedence(node.argument, astUtils.getPrecedence(node), cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.argument);
			}
		},
		VariableDeclarator(node) {
			if (node.init && hasExcessParensWithPrecedence(node.init, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence) && !(node.init.type === "Literal" && node.init.regex)) {
				report(node.init);
			}
		},
		WhileStatement(node) {
			if (hasExcessParens(node.test, cfg, sourceCode) && !isCondAssignException(node, cfg)) {
				report(node.test);
			}
		},
		WithStatement(node) {
			if (hasExcessParens(node.object, cfg, sourceCode)) report(node.object);
		},
		YieldExpression(node) {
			if (node.argument) {
				const token = sourceCode.getFirstToken(node);
				if ((precedence(node.argument) >= precedence(node) && hasExcessParensWithPrecedence(node.argument, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) ||
					hasDoubleExcessParens(node.argument, cfg, sourceCode)) {
					report(node.argument);
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
				.filter(e => e && hasExcessParens(e, cfg, sourceCode))
				.forEach(report);
		},
		AssignmentPattern(node) {
			if (canBeAssignmentTarget(node.left) && hasExcessParens(node.left, cfg, sourceCode)) report(node.left);
			if (node.right && hasExcessParensWithPrecedence(node.right, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
				report(node.right);
			}
		},
	};

	/** Helper for class superClass checks */
	function checkClass(node) {
		if (!node.superClass) return;
		const extra = precedence(node.superClass) > cfg.PRECEDENCE_OF_UPDATE_EXPR
			? hasExcessParens(node.superClass, cfg, sourceCode)
			: hasDoubleExcessParens(node.superClass, cfg, sourceCode);
		if (extra) report(node.superClass);
	}
	/** Helper for spread operator checks */
	function checkSpreadOperator(node) {
		if (hasExcessParensWithPrecedence(node.argument, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)) {
			report(node.argument);
		}
	}
	/** Helper for expression/export statements */
	function checkExpressionOrExportStatement(node) {
		const first = isParenthesised(node, sourceCode) ? sourceCode.getTokenBefore(node) : sourceCode.getFirstToken(node);
		const second = sourceCode.getTokenAfter(first, astUtils.isNotOpeningParenToken);
		const third = second ? sourceCode.getTokenAfter(second) : null;
		const afterClose = second ? sourceCode.getTokenAfter(second, astUtils.isNotClosingParenToken) : null;
		if (astUtils.isOpeningParenToken(first) && (astUtils.isOpeningBraceToken(second) ||
			(second.type === "Keyword" && ["function", "class"].includes(second.value)) ||
			(second.type === "Keyword" && second.value === "let" && afterClose && (astUtils.isOpeningBracketToken(afterClose) || afterClose.type === "Identifier")) ||
			(second && second.type === "Identifier" && second.value === "async" && third && third.type === "Keyword" && third.value === "function"))) {
			tokensToIgnore.add(second);
		}
		const extra = node.parent.type === "ExportDefaultDeclaration"
			? hasExcessParensWithPrecedence(node, cfg.PRECEDENCE_OF_ASSIGNMENT_EXPR, cfg, sourceCode, astUtils.getPrecedence)
			: hasExcessParens(node, cfg, sourceCode);
		if (extra) report(node);
	}
	/** Path utilities */
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
	/** In‑expression safety check */
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
}

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
		messages: {
			unexpected: "Unnecessary parentheses around expression.",
		},
	},
	create,
};
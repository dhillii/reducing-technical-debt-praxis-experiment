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
		const precedence = astUtils.getPrecedence;

		// ----------------------------------------------------------------------
		// Configuration helpers
		// ----------------------------------------------------------------------
		const ALL_NODES = context.options[0] !== "functions";
		const EXCEPT_COND_ASSIGN = ALL_NODES && getOption("conditionalAssign") === false;
		const EXCEPT_COND_TERNARY = ALL_NODES && getOption("ternaryOperandBinaryExpressions") === false;
		const NESTED_BINARY = ALL_NODES && getOption("nestedBinaryExpressions") === false;
		const EXCEPT_RETURN_ASSIGN = ALL_NODES && getOption("returnAssign") === false;
		const IGNORE_JSX = ALL_NODES && getOption("ignoreJSX");
		const IGNORE_ARROW_CONDITIONALS = ALL_NODES && getOption("enforceForArrowConditionals") === false;
		const IGNORE_SEQUENCE_EXPRESSIONS = ALL_NODES && getOption("enforceForSequenceExpressions") === false;
		const IGNORE_NEW_IN_MEMBER_EXPR = ALL_NODES && getOption("enforceForNewInMemberExpressions") === false;
		const IGNORE_FUNCTION_PROTOTYPE_METHODS = ALL_NODES && getOption("enforceForFunctionPrototypeMethods") === false;
		const ALLOW_PARENS_AFTER_COMMENT_PATTERN = ALL_NODES && getOption("allowParensAfterCommentPattern");

		const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
		const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });

		let reportsBuffer;

		/** @returns {*} option value or undefined */
		function getOption(name) {
			return context.options[1] && context.options[1][name];
		}

		// ----------------------------------------------------------------------
		// Predicate helpers
		// ----------------------------------------------------------------------
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

		function isJSXIgnored(node) {
			if (node.type !== "JSXElement" && node.type !== "JSXFragment") return false;
			const isSingleLine = node.loc.start.line === node.loc.end.line;
			switch (IGNORE_JSX) {
				case "all":
					return true;
				case "multi-line":
					return !isSingleLine;
				case "single-line":
					return isSingleLine;
				default:
					return false;
			}
		}

		function isSequenceExpressionIgnored(node) {
			return node.type === "SequenceExpression" && IGNORE_SEQUENCE_EXPRESSIONS;
		}

		function isFunctionPrototypeMethodIgnored(node) {
			return isImmediateFunctionPrototypeMethodCall(node) && IGNORE_FUNCTION_PROTOTYPE_METHODS;
		}

		function ruleApplies(node) {
			if (isJSXIgnored(node)) return false;
			if (isSequenceExpressionIgnored(node)) return false;
			if (isFunctionPrototypeMethodIgnored(node)) return false;
			return (
				ALL_NODES ||
				node.type === "FunctionExpression" ||
				node.type === "ArrowFunctionExpression"
			);
		}

		function isParenthesised(node) {
			return isParenthesizedRaw(1, node, sourceCode);
		}
		function isParenthesisedTwice(node) {
			return isParenthesizedRaw(2, node, sourceCode);
		}
		function hasExcessParens(node) {
			return ruleApplies(node) && isParenthesised(node);
		}
		function hasDoubleExcessParens(node) {
			return ruleApplies(node) && isParenthesisedTwice(node);
		}
		function hasExcessParensWithPrecedence(node, lowerLimit) {
			if (!ruleApplies(node) || !isParenthesised(node)) return false;
			return (
				precedence(node) >= lowerLimit || isParenthesisedTwice(node)
			);
		}
		function isCondAssignException(node) {
			return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
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
		function isNewExpressionWithParens(newExpression) {
			const last = sourceCode.getLastToken(newExpression);
			const penultimate = sourceCode.getTokenBefore(last);
			return (
				newExpression.arguments.length > 0 ||
				(astUtils.isOpeningParenToken(penultimate) &&
					astUtils.isClosingParenToken(last) &&
					newExpression.callee.range[1] < newExpression.range[1])
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
			if ((node.left && node.left.type === "AssignmentExpression") ||
				(node.right && node.right.type === "AssignmentExpression")) {
				return true;
			}
			return false;
		}
		function isReturnAssignException(node) {
			if (!EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) return false;
			if (node.type === "ReturnStatement") {
				return node.argument && containsAssignment(node.argument);
			}
			if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
				return containsAssignment(node.body);
			}
			return containsAssignment(node);
		}
		function hasExcessParensNoLineTerminator(token, node) {
			return token.loc.end.line === node.loc.start.line
				? hasExcessParens(node)
				: hasDoubleExcessParens(node);
		}
		function requiresLeadingSpace(node) {
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
		function requiresTrailingSpace(node) {
			const [rightParen, afterRight] = sourceCode.getTokensAfter(node, { count: 2 });
			const beforeRight = sourceCode.getLastToken(node);
			return (
				rightParen &&
				afterRight &&
				!sourceCode.isSpaceBetween(rightParen, afterRight) &&
				!astUtils.canTokensBeAdjacent(beforeRight, afterRight)
			);
		}
		function isIIFE(node) {
			const call = astUtils.skipChainExpression(node);
			return call.type === "CallExpression" && call.callee.type === "FunctionExpression";
		}
		function canBeAssignmentTarget(node) {
			return node && (node.type === "Identifier" || node.type === "MemberExpression");
		}
		function isFixable(node) {
			if (node.type !== "Literal" || typeof node.value !== "string") return true;
			if (isParenthesisedTwice(node)) return true;
			return !astUtils.isTopLevelExpressionStatement(node.parent);
		}
		function isAnonymousFunctionAssignmentException({ left, operator, right }) {
			if (left.type !== "Identifier") return false;
			if (!["=", "&&=", "||=", "??="].includes(operator)) return false;
			if (right.type === "ArrowFunctionExpression") return true;
			if ((right.type === "FunctionExpression" || right.type === "ClassExpression") && !right.id) {
				return true;
			}
			return false;
		}
		function doesMemberExpressionContainCallExpression(node) {
			let cur = node.object;
			while (cur.type === "MemberExpression") {
				cur = cur.object;
			}
			return cur.type === "CallExpression";
		}
		function isMemberExpInNewCallee(node) {
			if (node.type !== "MemberExpression") return false;
			if (node.parent.type === "NewExpression" && node.parent.callee === node) return true;
			if (node.parent.object === node) return isMemberExpInNewCallee(node.parent);
			return false;
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
		function startNewReportsBuffering() {
			reportsBuffer = {
				upper: reportsBuffer,
				inExpressionNodes: [],
				reports: [],
			};
		}
		function endCurrentReportsBuffering() {
			const { upper, inExpressionNodes, reports } = reportsBuffer;
			if (upper) {
				upper.inExpressionNodes.push(...inExpressionNodes);
				upper.reports.push(...reports);
			} else {
				reports.forEach(r => r.finishReport());
			}
			reportsBuffer = upper;
		}
		function isInCurrentReportsBuffer(node) {
			return reportsBuffer.reports.some(r => r.node === node);
		}
		function removeFromCurrentReportsBuffer(node) {
			reportsBuffer.reports = reportsBuffer.reports.filter(r => r.node !== node);
		}
		function pathToAncestor(node, ancestor) {
			const path = [node];
			let cur = node;
			while (cur !== ancestor) {
				cur = cur.parent;
				if (!cur) {
					throw new Error("Nodes are not in the ancestor-descendant relationship.");
				}
				path.push(cur);
			}
			return path;
		}
		function pathToDescendant(node, descendant) {
			return pathToAncestor(descendant, node).reverse();
		}

		// ----------------------------------------------------------------------
		// Reporting helpers
		// ----------------------------------------------------------------------
		function report(node) {
			const leftParen = sourceCode.getTokenBefore(node);
			const rightParen = sourceCode.getTokenAfter(node);
			if (!isParenthesisedTwice(node)) {
				if (tokensToIgnore.has(sourceCode.getFirstToken(node))) return;
				if (isIIFE(node) && !isParenthesised(node.callee)) return;
				if (ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
					const comments = sourceCode.getCommentsBefore(leftParen);
					if (comments.length) {
						const pattern = new RegExp(ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
						if (pattern.test(comments[comments.length - 1].value)) return;
					}
				}
			}
			function finishReport() {
				context.report({
					node,
					loc: leftParen.loc,
					messageId: "unexpected",
					fix: isFixable(node)
						? fixer => {
								const inner = sourceCode.text.slice(leftParen.range[1], rightParen.range[0]);
								return fixer.replaceTextRange(
									[leftParen.range[0], rightParen.range[1]],
									(requiresLeadingSpace(node) ? " " : "") +
										inner +
										(requiresTrailingSpace(node) ? " " : "")
								);
						  }
						: null,
				});
			}
			if (reportsBuffer) {
				reportsBuffer.reports.push({ node, finishReport });
			} else {
				finishReport();
			}
		}

		// ----------------------------------------------------------------------
		// Node-specific checkers (guard‑clause style)
		// ----------------------------------------------------------------------
		function checkArgumentWithPrecedence(node) {
			if (hasExcessParensWithPrecedence(node.argument, precedence(node))) {
				report(node.argument);
			}
		}
		function checkCallNew(node) {
			const callee = node.callee;
			if (hasExcessParensWithPrecedence(callee, precedence(node))) {
				if (
					hasDoubleExcessParens(callee) ||
					!(
						isIIFE(node) ||
						(callee.type === "NewExpression" &&
							!isNewExpressionWithParens(callee) &&
							!(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
						(node.type === "NewExpression" &&
							callee.type === "MemberExpression" &&
							doesMemberExpressionContainCallExpression(callee)) ||
						(!node.optional && callee.type === "ChainExpression")
					)
				) {
					report(node.callee);
				}
			}
			node.arguments
				.filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
				.forEach(report);
		}
		function checkBinaryLogical(node) {
			const prec = precedence(node);
			const leftPrec = precedence(node.left);
			const rightPrec = precedence(node.right);
			const isExp = node.operator === "**";
			const skipLeft = NESTED_BINARY && (node.left.type === "BinaryExpression" || node.left.type === "LogicalExpression");
			const skipRight = NESTED_BINARY && (node.right.type === "BinaryExpression" || node.right.type === "LogicalExpression");

			if (!skipLeft && hasExcessParens(node.left)) {
				const leftCond =
					!(
						["AwaitExpression", "UnaryExpression"].includes(node.left.type) && isExp
					) &&
					!astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node) &&
					(leftPrec > prec || (leftPrec === prec && !isExp));
				if (leftCond || isParenthesisedTwice(node.left)) {
					report(node.left);
				}
			}
			if (!skipRight && hasExcessParens(node.right)) {
				const rightCond =
					!astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node) &&
					(rightPrec > prec || (rightPrec === prec && isExp));
				if (rightCond || isParenthesisedTwice(node.right)) {
					report(node.right);
				}
			}
		}
		function checkClass(node) {
			if (!node.superClass) return;
			const extra = precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
				? hasExcessParens(node.superClass)
				: hasDoubleExcessParens(node.superClass);
			if (extra) report(node.superClass);
		}
		function checkSpreadOperator(node) {
			if (hasExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
				report(node.argument);
			}
		}
		function checkExpressionOrExportStatement(node) {
			const first = isParenthesised(node) ? sourceCode.getTokenBefore(node) : sourceCode.getFirstToken(node);
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
			const extra = node.parent.type === "ExportDefaultDeclaration"
				? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
				: hasExcessParens(node);
			if (extra) report(node);
		}
		function handleConditionalExpression(node) {
			if (isReturnAssignException(node)) return;
			const allowedTypes = new Set(["BinaryExpression", "LogicalExpression"]);
			if (
				!(EXCEPT_COND_TERNARY && allowedTypes.has(node.test.type)) &&
				!isCondAssignException(node) &&
				hasExcessParensWithPrecedence(
					node.test,
					precedence({ type: "LogicalExpression", operator: "||" })
				)
			) {
				report(node.test);
			}
			if (
				!(EXCEPT_COND_TERNARY && allowedTypes.has(node.consequent.type)) &&
				hasExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR)
			) {
				report(node.consequent);
			}
			if (
				!(EXCEPT_COND_TERNARY && allowedTypes.has(node.alternate.type)) &&
				hasExcessParensWithPrecedence(node.alternate, PRECEDENCE_OF_ASSIGNMENT_EXPR)
			) {
				report(node.alternate);
			}
		}
		function handleForStatementInit(node) {
			if (node.init.type !== "VariableDeclaration") {
				const first = sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);
				if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
					tokensToIgnore.add(first);
				}
			}
			startNewReportsBuffering();
			if (hasExcessParens(node.init)) report(node.init);
		}
		function handleForStatementInitExit(node) {
			if (!reportsBuffer.reports.length) {
				endCurrentReportsBuffering();
				return;
			}
			reportsBuffer.inExpressionNodes.forEach(inNode => {
				const path = pathToDescendant(node, inNode);
				let excludeNode;
				for (let i = 0; i < path.length; i++) {
					const cur = path[i];
					if (i < path.length - 1) {
						const next = path[i + 1];
						if (isSafelyEnclosingInExpression(cur, next)) return;
					}
					if (isParenthesised(cur) && isInCurrentReportsBuffer(cur)) {
						if (isParenthesisedTwice(cur)) return;
						if (!excludeNode) excludeNode = cur;
					} else if (isParenthesised(cur)) {
						return;
					}
				}
				if (excludeNode) removeFromCurrentReportsBuffer(excludeNode);
			});
			endCurrentReportsBuffering();
		}
		function handleIfStatement(node) {
			if (hasExcessParens(node.test) && !isCondAssignException(node)) {
				report(node.test);
			}
		}
		function handleReturnStatement(node) {
			if (isReturnAssignException(node)) return;
			const token = sourceCode.getFirstToken(node);
			if (
				node.argument &&
				hasExcessParensNoLineTerminator(token, node.argument) &&
				!(node.argument.type === "Literal" && node.argument.regex)
			) {
				report(node.argument);
			}
		}
		function handleThrowStatement(node) {
			const token = sourceCode.getFirstToken(node);
			if (hasExcessParensNoLineTerminator(token, node.argument)) {
				report(node.argument);
			}
		}
		function handleYieldExpression(node) {
			if (!node.argument) return;
			const token = sourceCode.getFirstToken(node);
			const cond1 = precedence(node.argument) >= precedence(node) && hasExcessParensNoLineTerminator(token, node.argument);
			const cond2 = hasDoubleExcessParens(node.argument);
			if (cond1 || cond2) report(node.argument);
		}
		function handleVariableDeclarator(node) {
			if (
				node.init &&
				hasExcessParensWithPrecedence(node.init, PRECEDENCE_OF_ASSIGNMENT_EXPR) &&
				!(node.init.type === "Literal" && node.init.regex)
			) {
				report(node.init);
			}
		}
		function handleAssignmentExpression(node) {
			if (
				canBeAssignmentTarget(node.left) &&
				hasExcessParens(node.left) &&
				(!isAnonymousFunctionAssignmentException(node) || isParenthesisedTwice(node.left))
			) {
				report(node.left);
			}
			if (!isReturnAssignException(node) && hasExcessParensWithPrecedence(node.right, precedence(node))) {
				report(node.right);
			}
		}
		function handleArrayExpression(node) {
			node.elements
				.filter(e => e && hasExcessParensWithPrecedence(e, PRECEDENCE_OF_ASSIGNMENT_EXPR))
				.forEach(report);
		}
		function handleArrayPattern(node) {
			node.elements
				.filter(e => canBeAssignmentTarget(e) && hasExcessParens(e))
				.forEach(report);
		}
		function handleArrowFunctionExpression(node) {
			if (isReturnAssignException(node)) return;
			if (node.body.type === "ConditionalExpression" && IGNORE_ARROW_CONDITIONALS) return;
			if (node.body.type !== "BlockStatement") {
				const firstBody = sourceCode.getFirstToken(node.body, astUtils.isNotOpeningParenToken);
				const before = sourceCode.getTokenBefore(firstBody);
				if (astUtils.isOpeningParenToken(before) && astUtils.isOpeningBraceToken(firstBody)) {
					tokensToIgnore.add(firstBody);
				}
				if (hasExcessParensWithPrecedence(node.body, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
					report(node.body);
				}
			}
		}
		function handleBinaryExpression(node) {
			if (reportsBuffer && node.operator === "in") {
				reportsBuffer.inExpressionNodes.push(node);
			}
			checkBinaryLogical(node);
		}
		function handleMemberExpression(node) {
			const allowWrapOnce = isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);
			const objHasExcess = allowWrapOnce
				? hasDoubleExcessParens(node.object)
				: hasExcessParens(node.object) &&
				  !(isImmediateFunctionPrototypeMethodCall(node.parent) && node.parent.callee === node && IGNORE_FUNCTION_PROTOTYPE_METHODS);
			if (
				objHasExcess &&
				precedence(node.object) >= precedence(node) &&
				(node.computed ||
					!(
						astUtils.isDecimalInteger(node.object) ||
						(node.object.type === "Literal" && node.object.regex)
					))
			) {
				report(node.object);
			}
			if (objHasExcess && node.object.type === "CallExpression") {
				report(node.object);
			}
			if (objHasExcess && !IGNORE_NEW_IN_MEMBER_EXPR && node.object.type === "NewExpression" && isNewExpressionWithParens(node.object)) {
				report(node.object);
			}
			if (objHasExcess && node.optional && node.object.type === "ChainExpression") {
				report(node.object);
			}
			if (node.computed && hasExcessParens(node.property)) {
				report(node.property);
			}
		}
		function handleMethodDefinition(node) {
			if (hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
				report(node.key);
			}
		}
		function handleObjectExpression(node) {
			node.properties
				.filter(p => p.value && hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT_EXPR))
				.forEach(p => report(p.value));
		}
		function handleObjectPattern(node) {
			node.properties
				.filter(p => {
					const v = p.value;
					return canBeAssignmentTarget(v) && hasExcessParens(v);
				})
				.forEach(p => report(p.value));
		}
		function handleProperty(node) {
			if (node.computed && node.key && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
				report(node.key);
			}
		}
		function handlePropertyDefinition(node) {
			if (node.computed && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
				report(node.key);
			}
			if (node.value && hasExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
				report(node.value);
			}
		}
		function handleRestElement(node) {
			if (canBeAssignmentTarget(node.argument) && hasExcessParens(node.argument)) {
				report(node.argument);
			}
		}
		function handleSequenceExpression(node) {
			const prec = precedence(node);
			node.expressions
				.filter(e => hasExcessParensWithPrecedence(e, prec))
				.forEach(report);
		}
		function handleSwitchCase(node) {
			if (node.test && hasExcessParens(node.test)) report(node.test);
		}
		function handleSwitchStatement(node) {
			if (hasExcessParens(node.discriminant)) report(node.discriminant);
		}
		function handleTemplateLiteral(node) {
			node.expressions.filter(e => e && hasExcessParens(e)).forEach(report);
		}
		function handleAssignmentPattern(node) {
			if (canBeAssignmentTarget(node.left) && hasExcessParens(node.left)) report(node.left);
			if (node.right && hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
				report(node.right);
			}
		}
		function handleImportExpression(node) {
			const src = node.source;
			if (src.type === "SequenceExpression") {
				if (hasDoubleExcessParens(src)) report(src);
			} else if (hasExcessParens(src)) {
				report(src);
			}
		}
		function handleWhileStatement(node) {
			if (hasExcessParens(node.test) && !isCondAssignException(node)) {
				report(node.test);
			}
		}
		function handleWithStatement(node) {
			if (hasExcessParens(node.object)) report(node.object);
		}
		function handleDoWhileStatement(node) {
			if (hasExcessParens(node.test) && !isCondAssignException(node)) {
				report(node.test);
			}
		}
		function handleForInStatement(node) {
			if (node.left.type !== "VariableDeclaration") {
				const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
				if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
					tokensToIgnore.add(first);
				}
			}
			if (hasExcessParens(node.left)) report(node.left);
			if (hasExcessParens(node.right)) report(node.right);
		}
		function handleForOfStatement(node) {
			if (node.left.type !== "VariableDeclaration") {
				const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
				if (first.value === "let") tokensToIgnore.add(first);
			}
			if (hasExcessParens(node.left)) report(node.left);
			if (hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
				report(node.right);
			}
		}
		function handleExportDefaultDeclaration(node) {
			checkExpressionOrExportStatement(node.declaration);
		}
		function handleExpressionStatement(node) {
			checkExpressionOrExportStatement(node.expression);
		}
		// ----------------------------------------------------------------------
		// Visitor map
		// ----------------------------------------------------------------------
		return {
			ArrayExpression: handleArrayExpression,
			ArrayPattern: handleArrayPattern,
			ArrowFunctionExpression: handleArrowFunctionExpression,
			AssignmentExpression: handleAssignmentExpression,
			BinaryExpression: handleBinaryExpression,
			CallExpression: checkCallNew,
			ConditionalExpression: handleConditionalExpression,
			DoWhileStatement: handleDoWhileStatement,
			ExportDefaultDeclaration: handleExportDefaultDeclaration,
			ExpressionStatement: handleExpressionStatement,
			ForInStatement: handleForInStatement,
			ForOfStatement: handleForOfStatement,
			ForStatement(node) {
				if (node.init) {
					if (node.init.type !== "VariableDeclaration") {
						const first = sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);
						if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
							tokensToIgnore.add(first);
						}
					}
					if (hasExcessParens(node.init)) report(node.init);
				}
				if (node.test && hasExcessParens(node.test) && !isCondAssignException(node)) {
					report(node.test);
				}
				if (node.update && hasExcessParens(node.update)) {
					report(node.update);
				}
				if (node.init) startNewReportsBuffering();
			},
			"ForStatement > *.init:exit": handleForStatementInitExit,
			IfStatement: handleIfStatement,
			ImportExpression: handleImportExpression,
			LogicalExpression: checkBinaryLogical,
			MemberExpression: handleMemberExpression,
			"MethodDefinition[computed=true]": handleMethodDefinition,
			NewExpression: checkCallNew,
			ObjectExpression: handleObjectExpression,
			ObjectPattern: handleObjectPattern,
			Property: handleProperty,
			PropertyDefinition: handlePropertyDefinition,
			RestElement: handleRestElement,
			ReturnStatement: handleReturnStatement,
			SequenceExpression: handleSequenceExpression,
			SwitchCase: handleSwitchCase,
			SwitchStatement: handleSwitchStatement,
			ThrowStatement: handleThrowStatement,
			UnaryExpression: checkArgumentWithPrecedence,
			UpdateExpression(node) {
				if (node.prefix) {
					checkArgumentWithPrecedence(node);
				} else {
					const { argument } = node;
					const opToken = sourceCode.getLastToken(node);
					if (argument.loc.end.line === opToken.loc.start.line) {
						checkArgumentWithPrecedence(node);
					} else if (hasDoubleExcessParens(argument)) {
						report(argument);
					}
				}
			},
			AwaitExpression: checkArgumentWithPrecedence,
			VariableDeclarator: handleVariableDeclarator,
			WhileStatement: handleWhileStatement,
			WithStatement: handleWithStatement,
			YieldExpression: handleYieldExpression,
			ClassDeclaration: checkClass,
			ClassExpression: checkClass,
			SpreadElement: checkSpreadOperator,
			SpreadProperty: checkSpreadOperator,
			ExperimentalSpreadProperty: checkSpreadOperator,
			TemplateLiteral: handleTemplateLiteral,
			AssignmentPattern: handleAssignmentPattern,
		};
	},
};
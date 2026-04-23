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
					items: [
						{
							enum: ["functions"],
						},
					],
					minItems: 0,
					maxItems: 1,
				},
				{
					type: "array",
					items: [
						{
							enum: ["all"],
						},
						{
							type: "object",
							properties: {
								conditionalAssign: { type: "boolean" },
								ternaryOperandBinaryExpressions: {
									type: "boolean",
								},
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
								enforceForArrowConditionals: {
									type: "boolean",
								},
								enforceForSequenceExpressions: {
									type: "boolean",
								},
								enforceForNewInMemberExpressions: {
									type: "boolean",
								},
								enforceForFunctionPrototypeMethods: {
									type: "boolean",
								},
								allowParensAfterCommentPattern: {
									type: "string",
								},
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
		const ALL_NODES = context.options[0] !== "functions";
		const EXCEPT_COND_ASSIGN =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].conditionalAssign === false;
		const EXCEPT_COND_TERNARY =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].ternaryOperandBinaryExpressions === false;
		const NESTED_BINARY =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].nestedBinaryExpressions === false;
		const EXCEPT_RETURN_ASSIGN =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].returnAssign === false;
		const IGNORE_JSX =
			ALL_NODES && context.options[1] && context.options[1].ignoreJSX;
		const IGNORE_ARROW_CONDITIONALS =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].enforceForArrowConditionals === false;
		const IGNORE_SEQUENCE_EXPRESSIONS =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].enforceForSequenceExpressions === false;
		const IGNORE_NEW_IN_MEMBER_EXPR =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].enforceForNewInMemberExpressions === false;
		const IGNORE_FUNCTION_PROTOTYPE_METHODS =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].enforceForFunctionPrototypeMethods === false;
		const ALLOW_PARENS_AFTER_COMMENT_PATTERN =
			ALL_NODES &&
			context.options[1] &&
			context.options[1].allowParensAfterCommentPattern;

		const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({
			type: "AssignmentExpression",
		});
		const PRECEDENCE_OF_UPDATE_EXPR = precedence({
			type: "UpdateExpression",
		});

		let reportsBuffer;

		// ----------------------------------------------------------------------
		// Helper utilities
		// ----------------------------------------------------------------------

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

		function shouldApplyRule(node) {
			if (node.type === "JSXElement" || node.type === "JSXFragment") {
				const isSingleLine = node.loc.start.line === node.loc.end.line;
				switch (IGNORE_JSX) {
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
			if (node.type === "SequenceExpression" && IGNORE_SEQUENCE_EXPRESSIONS) {
				return false;
			}
			if (
				isImmediateFunctionPrototypeMethodCall(node) &&
				IGNORE_FUNCTION_PROTOTYPE_METHODS
			) {
				return false;
			}
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
			return shouldApplyRule(node) && isParenthesised(node);
		}
		function hasDoubleExcessParens(node) {
			return shouldApplyRule(node) && isParenthesisedTwice(node);
		}
		function hasExcessParensWithPrecedence(node, precedenceLowerLimit) {
			if (shouldApplyRule(node) && isParenthesised(node)) {
				if (
					precedence(node) >= precedenceLowerLimit ||
					isParenthesisedTwice(node)
				) {
					return true;
				}
			}
			return false;
		}
		function isCondAssignException(node) {
			return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
		}
		function isInReturnStatement(node) {
			for (let cur = node; cur; cur = cur.parent) {
				if (
					cur.type === "ReturnStatement" ||
					(cur.type === "ArrowFunctionExpression" &&
						cur.body.type !== "BlockStatement")
				) {
					return true;
				}
			}
			return false;
		}
		function isNewExpressionWithParens(newExpression) {
			const lastToken = sourceCode.getLastToken(newExpression);
			const penultimateToken = sourceCode.getTokenBefore(lastToken);
			return (
				newExpression.arguments.length > 0 ||
				(astUtils.isOpeningParenToken(penultimateToken) &&
					astUtils.isClosingParenToken(lastToken) &&
					newExpression.callee.range[1] < newExpression.range[1])
			);
		}
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
		function isReturnAssignException(node) {
			if (!EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) {
				return false;
			}
			if (node.type === "ReturnStatement") {
				return node.argument && containsAssignment(node.argument);
			}
			if (
				node.type === "ArrowFunctionExpression" &&
				node.body.type !== "BlockStatement"
			) {
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
			const leftParenToken = sourceCode.getTokenBefore(node);
			const tokenBeforeLeftParen = sourceCode.getTokenBefore(
				leftParenToken,
				{ includeComments: true },
			);
			const tokenAfterLeftParen = sourceCode.getTokenAfter(
				leftParenToken,
				{ includeComments: true },
			);
			return (
				tokenBeforeLeftParen &&
				tokenBeforeLeftParen.range[1] === leftParenToken.range[0] &&
				leftParenToken.range[1] === tokenAfterLeftParen.range[0] &&
				!astUtils.canTokensBeAdjacent(
					tokenBeforeLeftParen,
					tokenAfterLeftParen,
				)
			);
		}
		function requiresTrailingSpace(node) {
			const nextTwoTokens = sourceCode.getTokensAfter(node, { count: 2 });
			const rightParenToken = nextTwoTokens[0];
			const tokenAfterRightParen = nextTwoTokens[1];
			const tokenBeforeRightParen = sourceCode.getLastToken(node);
			return (
				rightParenToken &&
				tokenAfterRightParen &&
				!sourceCode.isSpaceBetween(
					rightParenToken,
					tokenAfterRightParen,
				) &&
				!astUtils.canTokensBeAdjacent(
					tokenBeforeRightParen,
					tokenAfterRightParen,
				)
			);
		}
		function isIIFE(node) {
			const maybeCallNode = astUtils.skipChainExpression(node);
			return (
				maybeCallNode.type === "CallExpression" &&
				maybeCallNode.callee.type === "FunctionExpression"
			);
		}
		function canBeAssignmentTarget(node) {
			return node && (node.type === "Identifier" || node.type === "MemberExpression");
		}
		function isFixable(node) {
			if (node.type !== "Literal" || typeof node.value !== "string") {
				return true;
			}
			if (isParenthesisedTwice(node)) {
				return true;
			}
			return !astUtils.isTopLevelExpressionStatement(node.parent);
		}
		function isAnonymousFunctionAssignmentException({ left, operator, right }) {
			if (left.type === "Identifier" && ["=", "&&=", "||=", "??="].includes(operator)) {
				if (right.type === "ArrowFunctionExpression") {
					return true;
				}
				if (
					(right.type === "FunctionExpression" || right.type === "ClassExpression") &&
					!right.id
				) {
					return true;
				}
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
			if (node.type !== "MemberExpression") {
				return false;
			}
			if (node.parent.type === "NewExpression" && node.parent.callee === node) {
				return true;
			}
			if (node.parent.object === node) {
				return isMemberExpInNewCallee(node.parent);
			}
			return false;
		}
		function pathToAncestor(node, ancestor) {
			const path = [node];
			let cur = node;
			while (cur !== ancestor) {
				cur = cur.parent;
				if (cur === null) {
					throw new Error("Nodes are not in the ancestor-descendant relationship.");
				}
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

		// ----------------------------------------------------------------------
		// Reporting utilities
		// ----------------------------------------------------------------------

		function finishReport(node, leftParenToken, rightParenToken) {
			context.report({
				node,
				loc: leftParenToken.loc,
				messageId: "unexpected",
				fix: isFixable(node)
					? fixer => {
							const innerSource = sourceCode.text.slice(
								leftParenToken.range[1],
								rightParenToken.range[0],
							);
							return fixer.replaceTextRange(
								[leftParenToken.range[0], rightParenToken.range[1]],
								(requiresLeadingSpace(node) ? " " : "") +
									innerSource +
									(requiresTrailingSpace(node) ? " " : ""),
							);
					  }
					: null,
			});
		}

		function reportNode(node) {
			const leftParenToken = sourceCode.getTokenBefore(node);
			const rightParenToken = sourceCode.getTokenAfter(node);
			if (!isParenthesisedTwice(node)) {
				if (tokensToIgnore.has(sourceCode.getFirstToken(node))) {
					return;
				}
				if (isIIFE(node) && !isParenthesised(node.callee)) {
					return;
				}
				if (ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
					const comments = sourceCode.getCommentsBefore(leftParenToken);
					if (comments.length) {
						const pattern = new RegExp(ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
						if (pattern.test(comments[comments.length - 1].value)) {
							return;
						}
					}
				}
			}
			if (reportsBuffer) {
				reportsBuffer.reports.push({ node, finishReport: () => finishReport(node, leftParenToken, rightParenToken) });
				return;
			}
			finishReport(node, leftParenToken, rightParenToken);
		}

		// ----------------------------------------------------------------------
		// Specific checks
		// ----------------------------------------------------------------------

		function checkArgumentWithPrecedence(node) {
			if (hasExcessParensWithPrecedence(node.argument, precedence(node))) {
				reportNode(node.argument);
			}
		}

		function checkBinarySide(node, sideNode, isLeft) {
			if (!sideNode) {
				return;
			}
			const sidePrecedence = precedence(sideNode);
			const nodePrecedence = precedence(node);
			const isExponentiation = node.operator === "**";
			const shouldSkip =
				NESTED_BINARY &&
				(sideNode.type === "BinaryExpression" ||
					sideNode.type === "LogicalExpression");
			if (shouldSkip) {
				return;
			}
			if (!hasExcessParens(sideNode)) {
				return;
			}
			if (isLeft) {
				if (
					(!(
						["AwaitExpression", "UnaryExpression"].includes(sideNode.type) &&
						isExponentiation
					) &&
						!astUtils.isMixedLogicalAndCoalesceExpressions(sideNode, node) &&
						(sidePrecedence > nodePrecedence ||
							(sidePrecedence === nodePrecedence && !isExponentiation))) ||
					isParenthesisedTwice(sideNode)
				) {
					reportNode(sideNode);
				}
			} else {
				if (
					(!astUtils.isMixedLogicalAndCoalesceExpressions(sideNode, node) &&
						(sidePrecedence > nodePrecedence ||
							(sidePrecedence === nodePrecedence && isExponentiation))) ||
					isParenthesisedTwice(sideNode)
				) {
					reportNode(sideNode);
				}
			}
		}

		function checkBinaryLogical(node) {
			checkBinarySide(node, node.left, true);
			checkBinarySide(node, node.right, false);
		}

		function shouldReportCallee(node, callee) {
			if (!hasExcessParensWithPrecedence(callee, precedence(node))) {
				return false;
			}
			if (hasDoubleExcessParens(callee)) {
				return true;
			}
			if (
				isIIFE(node) ||
				(callee.type === "NewExpression" &&
					!isNewExpressionWithParens(callee) &&
					!(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
				(node.type === "NewExpression" &&
					callee.type === "MemberExpression" &&
					doesMemberExpressionContainCallExpression(callee)) ||
				(!node.optional && callee.type === "ChainExpression")
			) {
				return false;
			}
			return true;
		}

		function checkCallNew(node) {
			const callee = node.callee;
			if (shouldReportCallee(node, callee)) {
				reportNode(callee);
			}
			node.arguments
				.filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
				.forEach(reportNode);
		}

		function checkClass(node) {
			if (!node.superClass) {
				return;
			}
			const extra =
				precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
					? hasExcessParens(node.superClass)
					: hasDoubleExcessParens(node.superClass);
			if (extra) {
				reportNode(node.superClass);
			}
		}

		function checkSpreadOperator(node) {
			if (
				hasExcessParensWithPrecedence(
					node.argument,
					PRECEDENCE_OF_ASSIGNMENT_EXPR,
				)
			) {
				reportNode(node.argument);
			}
		}

		function checkExpressionOrExportStatement(node) {
			const firstToken = isParenthesised(node)
				? sourceCode.getTokenBefore(node)
				: sourceCode.getFirstToken(node);
			const secondToken = sourceCode.getTokenAfter(firstToken, astUtils.isNotOpeningParenToken);
			const thirdToken = secondToken ? sourceCode.getTokenAfter(secondToken) : null;
			const afterClosing = secondToken
				? sourceCode.getTokenAfter(secondToken, astUtils.isNotClosingParenToken)
				: null;

			if (
				astUtils.isOpeningParenToken(firstToken) &&
				(astUtils.isOpeningBraceToken(secondToken) ||
					(secondToken.type === "Keyword" &&
						(secondToken.value === "function" ||
							secondToken.value === "class" ||
							(secondToken.value === "let" &&
								afterClosing &&
								(astUtils.isOpeningBracketToken(afterClosing) ||
									afterClosing.type === "Identifier")))) ||
					(secondToken &&
						secondToken.type === "Identifier" &&
						secondToken.value === "async" &&
						thirdToken &&
						thirdToken.type === "Keyword" &&
						thirdToken.value === "function"))
			) {
				tokensToIgnore.add(secondToken);
			}
			const extra =
				node.parent.type === "ExportDefaultDeclaration"
					? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
					: hasExcessParens(node);
			if (extra) {
				reportNode(node);
			}
		}

		// ----------------------------------------------------------------------
		// Visitor definitions
		// ----------------------------------------------------------------------
		return {
			ArrayExpression(node) {
				node.elements
					.filter(
						e =>
							e &&
							hasExcessParensWithPrecedence(e, PRECEDENCE_OF_ASSIGNMENT_EXPR),
					)
					.forEach(reportNode);
			},
			ArrayPattern(node) {
				node.elements
					.filter(e => canBeAssignmentTarget(e) && hasExcessParens(e))
					.forEach(reportNode);
			},
			ArrowFunctionExpression(node) {
				if (isReturnAssignException(node)) {
					return;
				}
				if (node.body.type === "ConditionalExpression" && IGNORE_ARROW_CONDITIONALS) {
					return;
				}
				if (node.body.type !== "BlockStatement") {
					const firstBodyToken = sourceCode.getFirstToken(
						node.body,
						astUtils.isNotOpeningParenToken,
					);
					const tokenBeforeFirst = sourceCode.getTokenBefore(firstBodyToken);
					if (
						astUtils.isOpeningParenToken(tokenBeforeFirst) &&
						astUtils.isOpeningBraceToken(firstBodyToken)
					) {
						tokensToIgnore.add(firstBodyToken);
					}
					if (
						hasExcessParensWithPrecedence(
							node.body,
							PRECEDENCE_OF_ASSIGNMENT_EXPR,
						)
					) {
						reportNode(node.body);
					}
				}
			},
			AssignmentExpression(node) {
				if (
					canBeAssignmentTarget(node.left) &&
					hasExcessParens(node.left) &&
					(!isAnonymousFunctionAssignmentException(node) ||
						isParenthesisedTwice(node.left))
				) {
					reportNode(node.left);
				}
				if (
					!isReturnAssignException(node) &&
					hasExcessParensWithPrecedence(node.right, precedence(node))
				) {
					reportNode(node.right);
				}
			},
			BinaryExpression(node) {
				if (reportsBuffer && node.operator === "in") {
					reportsBuffer.inExpressionNodes.push(node);
				}
				checkBinaryLogical(node);
			},
			CallExpression: checkCallNew,
			ConditionalExpression(node) {
				if (isReturnAssignException(node)) {
					return;
				}
				const allowedTypes = new Set(["BinaryExpression", "LogicalExpression"]);
				if (
					!(
						EXCEPT_COND_TERNARY &&
						allowedTypes.has(node.test.type)
					) &&
					!isCondAssignException(node) &&
					hasExcessParensWithPrecedence(
						node.test,
						precedence({ type: "LogicalExpression", operator: "||" }),
					)
				) {
					reportNode(node.test);
				}
				if (
					!(
						EXCEPT_COND_TERNARY &&
						allowedTypes.has(node.consequent.type)
					) &&
					hasExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR)
				) {
					reportNode(node.consequent);
				}
				if (
					!(
						EXCEPT_COND_TERNARY &&
						allowedTypes.has(node.alternate.type)
					) &&
					hasExcessParensWithPrecedence(node.alternate, PRECEDENCE_OF_ASSIGNMENT_EXPR)
				) {
					reportNode(node.alternate);
				}
			},
			DoWhileStatement(node) {
				if (hasExcessParens(node.test) && !isCondAssignException(node)) {
					reportNode(node.test);
				}
			},
			ExportDefaultDeclaration: node => checkExpressionOrExportStatement(node.declaration),
			ExpressionStatement: node => checkExpressionOrExportStatement(node.expression),
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
				if (hasExcessParens(node.left)) {
					reportNode(node.left);
				}
				if (hasExcessParens(node.right)) {
					reportNode(node.right);
				}
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
				if (hasExcessParens(node.left)) {
					reportNode(node.left);
				}
				if (
					hasExcessParensWithPrecedence(
						node.right,
						PRECEDENCE_OF_ASSIGNMENT_EXPR,
					)
				) {
					reportNode(node.right);
				}
			},
			ForStatement(node) {
				if (node.test && hasExcessParens(node.test) && !isCondAssignException(node)) {
					reportNode(node.test);
				}
				if (node.update && hasExcessParens(node.update)) {
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
					if (hasExcessParens(node.init)) {
						reportNode(node.init);
					}
				}
			},
			"ForStatement > *.init:exit"(node) {
				if (reportsBuffer.reports.length) {
					reportsBuffer.inExpressionNodes.forEach(inExpressionNode => {
						const path = pathToDescendant(node, inExpressionNode);
						let nodeToExclude;
						for (let i = 0; i < path.length; i++) {
							const cur = path[i];
							if (i < path.length - 1) {
								const next = path[i + 1];
								if (isSafelyEnclosingInExpression(cur, next)) {
									return;
								}
							}
							if (isParenthesised(cur)) {
								if (isInCurrentReportsBuffer(cur)) {
									if (isParenthesisedTwice(cur)) {
										return;
									}
									if (!nodeToExclude) {
										nodeToExclude = cur;
									}
								} else {
									return;
								}
							}
						}
						if (nodeToExclude) {
							removeFromCurrentReportsBuffer(nodeToExclude);
						}
					});
				}
				endCurrentReportsBuffering();
			},
			IfStatement(node) {
				if (hasExcessParens(node.test) && !isCondAssignException(node)) {
					reportNode(node.test);
				}
			},
			ImportExpression(node) {
				const { source } = node;
				if (source.type === "SequenceExpression") {
					if (hasDoubleExcessParens(source)) {
						reportNode(source);
					}
				} else if (hasExcessParens(source)) {
					reportNode(source);
				}
			},
			LogicalExpression: checkBinaryLogical,
			MemberExpression(node) {
				const allowWrapOnce =
					isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);
				const objHasExcess = allowWrapOnce
					? hasDoubleExcessParens(node.object)
					: hasExcessParens(node.object) &&
					  !(
							isImmediateFunctionPrototypeMethodCall(node.parent) &&
							node.parent.callee === node &&
							IGNORE_FUNCTION_PROTOTYPE_METHODS
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
					!IGNORE_NEW_IN_MEMBER_EXPR &&
					node.object.type === "NewExpression" &&
					isNewExpressionWithParens(node.object)
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
				if (node.computed && hasExcessParens(node.property)) {
					reportNode(node.property);
				}
			},
			"MethodDefinition[computed=true]"(node) {
				if (
					hasExcessParensWithPrecedence(
						node.key,
						PRECEDENCE_OF_ASSIGNMENT_EXPR,
					)
				) {
					reportNode(node.key);
				}
			},
			NewExpression: checkCallNew,
			ObjectExpression(node) {
				node.properties
					.filter(
						prop =>
							prop.value &&
							hasExcessParensWithPrecedence(
								prop.value,
								PRECEDENCE_OF_ASSIGNMENT_EXPR,
							),
					)
					.forEach(prop => reportNode(prop.value));
			},
			ObjectPattern(node) {
				node.properties
					.filter(prop => {
						const val = prop.value;
						return canBeAssignmentTarget(val) && hasExcessParens(val);
					})
					.forEach(prop => reportNode(prop.value));
			},
			Property(node) {
				if (node.computed && node.key) {
					if (
						hasExcessParensWithPrecedence(
							node.key,
							PRECEDENCE_OF_ASSIGNMENT_EXPR,
						)
					) {
						reportNode(node.key);
					}
				}
			},
			PropertyDefinition(node) {
				if (
					node.computed &&
					hasExcessParensWithPrecedence(
						node.key,
						PRECEDENCE_OF_ASSIGNMENT_EXPR,
					)
				) {
					reportNode(node.key);
				}
				if (
					node.value &&
					hasExcessParensWithPrecedence(
						node.value,
						PRECEDENCE_OF_ASSIGNMENT_EXPR,
					)
				) {
					reportNode(node.value);
				}
			},
			RestElement(node) {
				const arg = node.argument;
				if (canBeAssignmentTarget(arg) && hasExcessParens(arg)) {
					reportNode(arg);
				}
			},
			ReturnStatement(node) {
				const returnToken = sourceCode.getFirstToken(node);
				if (isReturnAssignException(node)) {
					return;
				}
				if (
					node.argument &&
					hasExcessParensNoLineTerminator(returnToken, node.argument) &&
					!(node.argument.type === "Literal" && node.argument.regex)
				) {
					reportNode(node.argument);
				}
			},
			SequenceExpression(node) {
				const prec = precedence(node);
				node.expressions
					.filter(e => hasExcessParensWithPrecedence(e, prec))
					.forEach(reportNode);
			},
			SwitchCase(node) {
				if (node.test && hasExcessParens(node.test)) {
					reportNode(node.test);
				}
			},
			SwitchStatement(node) {
				if (hasExcessParens(node.discriminant)) {
					reportNode(node.discriminant);
				}
			},
			ThrowStatement(node) {
				const throwToken = sourceCode.getFirstToken(node);
				if (hasExcessParensNoLineTerminator(throwToken, node.argument)) {
					reportNode(node.argument);
				}
			},
			UnaryExpression: checkArgumentWithPrecedence,
			UpdateExpression(node) {
				if (node.prefix) {
					checkArgumentWithPrecedence(node);
				} else {
					const { argument } = node;
					const operatorToken = sourceCode.getLastToken(node);
					if (argument.loc.end.line === operatorToken.loc.start.line) {
						checkArgumentWithPrecedence(node);
					} else if (hasDoubleExcessParens(argument)) {
						reportNode(argument);
					}
				}
			},
			AwaitExpression: checkArgumentWithPrecedence,
			VariableDeclarator(node) {
				if (
					node.init &&
					hasExcessParensWithPrecedence(
						node.init,
						PRECEDENCE_OF_ASSIGNMENT_EXPR,
					) &&
					!(node.init.type === "Literal" && node.init.regex)
				) {
					reportNode(node.init);
				}
			},
			WhileStatement(node) {
				if (hasExcessParens(node.test) && !isCondAssignException(node)) {
					reportNode(node.test);
				}
			},
			WithStatement(node) {
				if (hasExcessParens(node.object)) {
					reportNode(node.object);
				}
			},
			YieldExpression(node) {
				if (node.argument) {
					const yieldToken = sourceCode.getFirstToken(node);
					if (
						(precedence(node.argument) >= precedence(node) &&
							hasExcessParensNoLineTerminator(yieldToken, node.argument)) ||
						hasDoubleExcessParens(node.argument)
					) {
						reportNode(node.argument);
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
					.filter(e => e && hasExcessParens(e))
					.forEach(reportNode);
			},
			AssignmentPattern(node) {
				const { left, right } = node;
				if (canBeAssignmentTarget(left) && hasExcessParens(left)) {
					reportNode(left);
				}
				if (
					right &&
					hasExcessParensWithPrecedence(
						right,
						PRECEDENCE_OF_ASSIGNMENT_EXPR,
					)
				) {
					reportNode(right);
				}
			},
		};
	},
};
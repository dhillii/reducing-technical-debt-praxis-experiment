```javascript
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
		const options = context.options[1] || {};
		const ALL_NODES = context.options[0] !== "functions";

		const config = {
			EXCEPT_COND_ASSIGN: ALL_NODES && options.conditionalAssign === false,
			EXCEPT_COND_TERNARY: ALL_NODES && options.ternaryOperandBinaryExpressions === false,
			NESTED_BINARY: ALL_NODES && options.nestedBinaryExpressions === false,
			EXCEPT_RETURN_ASSIGN: ALL_NODES && options.returnAssign === false,
			IGNORE_JSX: ALL_NODES && options.ignoreJSX,
			IGNORE_ARROW_CONDITIONALS: ALL_NODES && options.enforceForArrowConditionals === false,
			IGNORE_SEQUENCE_EXPRESSIONS: ALL_NODES && options.enforceForSequenceExpressions === false,
			IGNORE_NEW_IN_MEMBER_EXPR: ALL_NODES && options.enforceForNewInMemberExpressions === false,
			IGNORE_FUNCTION_PROTOTYPE_METHODS: ALL_NODES && options.enforceForFunctionPrototypeMethods === false,
			ALLOW_PARENS_AFTER_COMMENT_PATTERN: ALL_NODES && options.allowParensAfterCommentPattern,
		};

		const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({
			type: "AssignmentExpression",
		});
		const PRECEDENCE_OF_UPDATE_EXPR = precedence({
			type: "UpdateExpression",
		});

		let reportsBuffer;

		function isImmediateFunctionPrototypeMethodCall(node) {
			const callNode = astUtils.skipChainExpression(node);
			if (callNode.type !== "CallExpression") {
				return false;
			}
			const callee = astUtils.skipChainExpression(callNode.callee);
			return (
				callee.type === "MemberExpression" &&
				callee.object.type === "FunctionExpression" &&
				["call", "apply"].includes(
					astUtils.getStaticPropertyName(callee),
				)
			);
		}

		function checkJSXIgnore(node) {
			if (node.type === "JSXElement" || node.type === "JSXFragment") {
				const isSingleLine = node.loc.start.line === node.loc.end.line;
				switch (config.IGNORE_JSX) {
					case "all":
						return false;
					case "multi-line":
						return isSingleLine;
					case "single-line":
						return !isSingleLine;
					default:
						break;
				}
			}
			return true;
		}

		function ruleApplies(node) {
			if (!checkJSXIgnore(node)) {
				return false;
			}

			if (node.type === "SequenceExpression" && config.IGNORE_SEQUENCE_EXPRESSIONS) {
				return false;
			}

			if (isImmediateFunctionPrototypeMethodCall(node) && config.IGNORE_FUNCTION_PROTOTYPE_METHODS) {
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
			return ruleApplies(node) && isParenthesised(node);
		}

		function hasDoubleExcessParens(node) {
			return ruleApplies(node) && isParenthesisedTwice(node);
		}

		function hasExcessParensWithPrecedence(node, precedenceLowerLimit) {
			if (ruleApplies(node) && isParenthesised(node)) {
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
			return (
				config.EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression"
			);
		}

		function isInReturnStatement(node) {
			for (
				let currentNode = node;
				currentNode;
				currentNode = currentNode.parent
			) {
				if (
					currentNode.type === "ReturnStatement" ||
					(currentNode.type === "ArrowFunctionExpression" &&
						currentNode.body.type !== "BlockStatement")
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
			if (
				(node.left && node.left.type === "AssignmentExpression") ||
				(node.right && node.right.type === "AssignmentExpression")
			) {
				return true;
			}
			return false;
		}

		function isReturnAssignException(node) {
			if (!config.EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) {
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
			if (token.loc.end.line === node.loc.start.line) {
				return hasExcessParens(node);
			}
			return hasDoubleExcessParens(node);
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
			return (
				node &&
				(node.type === "Identifier" || node.type === "MemberExpression")
			);
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

		function shouldIgnoreParensAfterComment(leftParenToken) {
			if (!config.ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
				return false;
			}

			const commentsBeforeLeftParenToken =
				sourceCode.getCommentsBefore(leftParenToken);
			const totalCommentsBeforeLeftParenTokenCount =
				commentsBeforeLeftParenToken.length;
			const ignorePattern = new RegExp(
				config.ALLOW_PARENS_AFTER_COMMENT_PATTERN,
				"u",
			);

			return (
				totalCommentsBeforeLeftParenTokenCount > 0 &&
				ignorePattern.test(
					commentsBeforeLeftParenToken[
						totalCommentsBeforeLeftParenTokenCount - 1
					].value,
				)
			);
		}

		function report(node) {
			const leftParenToken = sourceCode.getTokenBefore(node);
			const rightParenToken = sourceCode.getTokenAfter(node);

			if (!isParenthesisedTwice(node)) {
				if (tokensToIgnore.has(sourceCode.getFirstToken(node))) {
					return;
				}

				if (isIIFE(node) && !isParenthesised(node.callee)) {
					return;
				}

				if (shouldIgnoreParensAfterComment(leftParenToken)) {
					return;
				}
			}

			function finishReport() {
				context.report({
					node,
					loc: leftParenToken.loc,
					messageId: "unexpected",
					fix: isFixable(node)
						? fixer => {
								const parenthesizedSource =
									sourceCode.text.slice(
										leftParenToken.range[1],
										rightParenToken.range[0],
									);

								return fixer.replaceTextRange(
									[
										leftParenToken.range[0],
										rightParenToken.range[1],
									],
									(requiresLeadingSpace(node) ? " " : "") +
										parenthesizedSource +
										(requiresTrailingSpace(node)
											? " "
											: ""),
								);
							}
						: null,
				});
			}

			if (reportsBuffer) {
				reportsBuffer.reports.push({ node, finishReport });
				return;
			}

			finishReport();
		}

		function checkArgumentWithPrecedence(node) {
			if (
				hasExcessParensWithPrecedence(node.argument, precedence(node))
			) {
				report(node.argument);
			}
		}

		function doesMemberExpressionContainCallExpression(node) {
			let currentNode = node.object;
			let currentNodeType = node.object.type;

			while (currentNodeType === "MemberExpression") {
				currentNode = currentNode.object;
				currentNodeType = currentNode.type;
			}

			return currentNodeType === "CallExpression";
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
							!(
								node.type
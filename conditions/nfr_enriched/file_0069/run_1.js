```javascript
/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

const { isParenthesized: isParenthesizedRaw } = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const RULE_META = {
	deprecated: {
		message: "Formatting rules are being moved out of ESLint core.",
		url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
		deprecatedSince: "8.53.0",
		availableUntil: "11.0.0",
		replacedBy: [
			{
				message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
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
							ignoreJSX: { enum: ["none", "all", "single-line", "multi-line"] },
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
};

const ANONYMOUS_FUNCTION_ASSIGNMENT_OPERATORS = new Set(["=", "&&=", "||=", "??="]);
const TERNARY_BINARY_TYPES = new Set(["BinaryExpression", "LogicalExpression"]);
const CALL_APPLY_METHODS = new Set(["call", "apply"]);

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Parses options from context into a config object.
 * @param {import('../types').Rule.RuleContext} context
 * @returns {object}
 */
function parseOptions(context) {
	const allNodes = context.options[0] !== "functions";
	const opts = (allNodes && context.options[1]) || {};

	return {
		ALL_NODES: allNodes,
		EXCEPT_COND_ASSIGN: allNodes && opts.conditionalAssign === false,
		EXCEPT_COND_TERNARY: allNodes && opts.ternaryOperandBinaryExpressions === false,
		NESTED_BINARY: allNodes && opts.nestedBinaryExpressions === false,
		EXCEPT_RETURN_ASSIGN: allNodes && opts.returnAssign === false,
		IGNORE_JSX: allNodes && opts.ignoreJSX,
		IGNORE_ARROW_CONDITIONALS: allNodes && opts.enforceForArrowConditionals === false,
		IGNORE_SEQUENCE_EXPRESSIONS: allNodes && opts.enforceForSequenceExpressions === false,
		IGNORE_NEW_IN_MEMBER_EXPR: allNodes && opts.enforceForNewInMemberExpressions === false,
		IGNORE_FUNCTION_PROTOTYPE_METHODS: allNodes && opts.enforceForFunctionPrototypeMethods === false,
		ALLOW_PARENS_AFTER_COMMENT_PATTERN: allNodes && opts.allowParensAfterCommentPattern,
	};
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('../types').Rule.RuleModule} */
module.exports = {
	meta: RULE_META,

	create(context) {
		const sourceCode = context.sourceCode;
		const options = parseOptions(context);
		const {
			ALL_NODES,
			EXCEPT_COND_ASSIGN,
			EXCEPT_COND_TERNARY,
			NESTED_BINARY,
			EXCEPT_RETURN_ASSIGN,
			IGNORE_JSX,
			IGNORE_ARROW_CONDITIONALS,
			IGNORE_SEQUENCE_EXPRESSIONS,
			IGNORE_NEW_IN_MEMBER_EXPR,
			IGNORE_FUNCTION_PROTOTYPE_METHODS,
			ALLOW_PARENS_AFTER_COMMENT_PATTERN,
		} = options;

		const tokensToIgnore = new WeakSet();
		const precedence = astUtils.getPrecedence;
		const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
		const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });

		let reportsBuffer;

		//----------------------------------------------------------------------
		// Parenthesis detection helpers
		//----------------------------------------------------------------------

		function isParenthesised(node) {
			return isParenthesizedRaw(1, node, sourceCode);
		}

		function isParenthesisedTwice(node) {
			return isParenthesizedRaw(2, node, sourceCode);
		}

		//----------------------------------------------------------------------
		// JSX rule applicability
		//----------------------------------------------------------------------

		function jsxRuleApplies(node) {
			const isSingleLine = node.loc.start.line === node.loc.end.line;

			switch (IGNORE_JSX) {
				case "all":       return false;
				case "multi-line": return isSingleLine;
				case "single-line": return !isSingleLine;
				default:          return true;
			}
		}

		//----------------------------------------------------------------------
		// Core rule applicability
		//----------------------------------------------------------------------

		function isImmediateFunctionPrototypeMethodCall(node) {
			const callNode = astUtils.skipChainExpression(node);

			if (callNode.type !== "CallExpression") {
				return false;
			}

			const callee = astUtils.skipChainExpression(callNode.callee);

			return (
				callee.type === "MemberExpression" &&
				callee.object.type === "FunctionExpression" &&
				CALL_APPLY_METHODS.has(astUtils.getStaticPropertyName(callee))
			);
		}

		function ruleApplies(node) {
			if (node.type === "JSXElement" || node.type === "JSXFragment") {
				return jsxRuleApplies(node);
			}
			if (node.type === "SequenceExpression" && IGNORE_SEQUENCE_EXPRESSIONS) {
				return false;
			}
			if (isImmediateFunctionPrototypeMethodCall(node) && IGNORE_FUNCTION_PROTOTYPE_METHODS) {
				return false;
			}

			return (
				ALL_NODES ||
				node.type === "FunctionExpression" ||
				node.type === "ArrowFunctionExpression"
			);
		}

		function hasExcessParens(node) {
			return ruleApplies(node) && isParenthesised(node);
		}

		function hasDoubleExcessParens(node) {
			return ruleApplies(node) && isParenthesisedTwice(node);
		}

		function hasExcessParensWithPrecedence(node, precedenceLowerLimit) {
			if (!ruleApplies(node) || !isParenthesised(node)) {
				return false;
			}

			return precedence(node) >= precedenceLowerLimit || isParenthesisedTwice(node);
		}

		//----------------------------------------------------------------------
		// Assignment / return exception helpers
		//----------------------------------------------------------------------

		function isCondAssignException(node) {
			return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
		}

		function isInReturnStatement(node) {
			for (let current = node; current; current = current.parent) {
				if (
					current.type === "ReturnStatement" ||
					(current.type === "ArrowFunctionExpression" && current.body.type !== "BlockStatement")
				) {
					return true;
				}
			}

			return false;
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

			return (
				(node.left && node.left.type === "AssignmentExpression") ||
				(node.right && node.right.type === "AssignmentExpression")
			);
		}

		function isReturnAssignException(node) {
			if (!EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) {
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

		function isAnonymousFunctionAssignmentException({ left, operator, right }) {
			if (!left || left.type !== "Identifier" || !ANONYMOUS_FUNCTION_ASSIGNMENT_OPERATORS.has(operator)) {
				return false;
			}

			const { type: rhsType, id } = right;

			return (
				rhsType === "ArrowFunctionExpression" ||
				((rhsType === "FunctionExpression" || rhsType === "ClassExpression") && !id)
			);
		}

		//----------------------------------------------------------------------
		// Token / spacing helpers
		//----------------------------------------------------------------------

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

		function requiresLeadingSpace(node) {
			const leftParenToken = sourceCode.getTokenBefore(node);
			const tokenBeforeLeftParen = sourceCode.getTokenBefore(leftParenToken, { includeComments: true });
			const tokenAfterLeftParen = sourceCode.getTokenAfter(leftParenToken, { includeComments: true });

			return (
				tokenBeforeLeftParen &&
				tokenBeforeLeftParen.range[1] === leftParenToken.range[0] &&
				leftParenToken.range[1] === tokenAfterLeftParen.range[0] &&
				!astUtils.canTokensBeAdjacent(tokenBeforeLeftParen, tokenAfterLeftParen)
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
				!sourceCode.isSpaceBetween(rightParenToken, tokenAfterRightParen) &&
				!astUtils.canTokensBeAdjacent(tokenBeforeRightParen, tokenAfterRightParen)
			);
		}

		function hasExcessParensNoLineTerminator(token, node) {
			if (token.loc.end.line === node.loc.start.line) {
				return hasExcessParens(node);
			}

			return hasDoubleExcessParens(node);
		}

		//----------------------------------------------------------------------
		// IIFE / assignment target helpers
		//----------------------------------------------------------------------

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

		//----------------------------------------------------------------------
		// Fixability
		//----------------------------------------------------------------------

		function isFixable(node) {
			if (node.type !== "Literal" || typeof node.value !== "string") {
				return true;
			}
			if (isParenthesisedTwice(node)) {
				return true;
			}

			return !astUtils.isTopLevelExpressionStatement(node.parent);
		}

		//----------------------------------------------------------------------
		// Reporting
		//----------------------------------------------------------------------

		function shouldSkipReport(node, leftParenToken) {
			if (isParenthesisedTwice(node)) {
				return false;
			}
			if (tokensToIgnore.has(sourceCode.getFirstToken(node))) {
				return true;
			}
			if (isIIFE(node) && !isParenthesised(node.callee)) {
				return true;
			}
			if (ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
				const comments = sourceCode.getCommentsBefore(leftParenToken);

				if (
					comments.length > 0 &&
					new RegExp(ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u").test(
						comments[comments.length - 1].value,
					)
				) {
					return true;
				}
			}

			return false;
		}

		function buildFixer(node, leftParenToken, rightParenToken) {
			if (!isFixable(node)) {
				return null;
			}

			return fixer => {
				const parenthesizedSource = sourceCode.text.slice(
					leftParenToken.range[1],
					rightParenToken.range[0],
				);

				return fixer.replaceTextRange(
					[leftParenToken.range[0], rightParenToken.range[1]],
					(requiresLeadingSpace(node) ? " " : "") +
						parenthesizedSource +
						(requiresTrailingSpace(node) ? " " : ""),
				);
			};
		}

		function report(node) {
			const leftParenToken = sourceCode.getTokenBefore(node);
			const rightParenToken = sourceCode.getTokenAfter(node);

			if (shouldSkipReport(node, leftParenToken)) {
				return;
			}
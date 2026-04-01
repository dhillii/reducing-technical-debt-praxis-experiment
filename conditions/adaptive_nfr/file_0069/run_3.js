```javascript
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

		/**
		 * Determines whether the given node is a `call` or `apply` method call, invoked directly on a `FunctionExpression` node.
		 * Example: function(){}.call()
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the node is an immediate `call` or `apply` method call.
		 * @private
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
				["call", "apply"].includes(
					astUtils.getStaticPropertyName(callee),
				)
			);
		}

		/**
		 * Checks if JSX element should be ignored based on configuration.
		 * @param {ASTNode} node The JSX node to check.
		 * @returns {boolean} True if JSX should be ignored.
		 * @private
		 */
		function shouldIgnoreJSX(node) {
			if (node.type !== "JSXElement" && node.type !== "JSXFragment") {
				return false;
			}

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

		/**
		 * Checks if node should be ignored based on type and configuration.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if node should be ignored.
		 * @private
		 */
		function shouldIgnoreByType(node) {
			if (node.type === "SequenceExpression" && IGNORE_SEQUENCE_EXPRESSIONS) {
				return true;
			}

			if (
				isImmediateFunctionPrototypeMethodCall(node) &&
				IGNORE_FUNCTION_PROTOTYPE_METHODS
			) {
				return true;
			}

			return false;
		}

		/**
		 * Determines if this rule should be enforced for a node given the current configuration.
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the rule should be enforced for this node.
		 * @private
		 */
		function ruleApplies(node) {
			if (shouldIgnoreJSX(node)) {
				return false;
			}

			if (shouldIgnoreByType(node)) {
				return false;
			}

			return (
				ALL_NODES ||
				node.type === "FunctionExpression" ||
				node.type === "ArrowFunctionExpression"
			);
		}

		/**
		 * Determines if a node is surrounded by parentheses.
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the node is parenthesised.
		 * @private
		 */
		function isParenthesised(node) {
			return isParenthesizedRaw(1, node, sourceCode);
		}

		/**
		 * Determines if a node is surrounded by parentheses twice.
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the node is doubly parenthesised.
		 * @private
		 */
		function isParenthesisedTwice(node) {
			return isParenthesizedRaw(2, node, sourceCode);
		}

		/**
		 * Determines if a node is surrounded by (potentially) invalid parentheses.
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the node is incorrectly parenthesised.
		 * @private
		 */
		function hasExcessParens(node) {
			return ruleApplies(node) && isParenthesised(node);
		}

		/**
		 * Determines if a node that is expected to be parenthesised is surrounded by
		 * (potentially) invalid extra parentheses.
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the node is has an unexpected extra pair of parentheses.
		 * @private
		 */
		function hasDoubleExcessParens(node) {
			return ruleApplies(node) && isParenthesisedTwice(node);
		}

		/**
		 * Determines if a node that is expected to be parenthesised is surrounded by
		 * (potentially) invalid extra parentheses with considering precedence level of the node.
		 * If the preference level of the node is not higher or equal to precedence lower limit, it also checks
		 * whether the node is surrounded by parentheses twice or not.
		 * @param {ASTNode} node The node to be checked.
		 * @param {number} precedenceLowerLimit The lower limit of precedence.
		 * @returns {boolean} True if the node is has an unexpected extra pair of parentheses.
		 * @private
		 */
		function hasExcessParensWithPrecedence(node, precedenceLowerLimit) {
			if (!ruleApplies(node) || !isParenthesised(node)) {
				return false;
			}

			return (
				precedence(node) >= precedenceLowerLimit ||
				isParenthesisedTwice(node)
			);
		}

		/**
		 * Determines if a node test expression is allowed to have a parenthesised assignment
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the assignment can be parenthesised.
		 * @private
		 */
		function isCondAssignException(node) {
			return (
				EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression"
			);
		}

		/**
		 * Determines if a node is in a return statement
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the node is in a return statement.
		 * @private
		 */
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

		/**
		 * Determines if a constructor function is newed-up with parens
		 * @param {ASTNode} newExpression The NewExpression node to be checked.
		 * @returns {boolean} True if the constructor is called with parens.
		 * @private
		 */
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

		/**
		 * Checks if ConditionalExpression contains assignment in consequent or alternate.
		 * @param {ASTNode} node The ConditionalExpression node.
		 * @returns {boolean} True if assignment found.
		 * @private
		 */
		function hasConditionalAssignment(node) {
			return (
				node.consequent.type === "AssignmentExpression" ||
				node.alternate.type === "AssignmentExpression"
			);
		}

		/**
		 * Checks if node has assignment in left or right operand.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if assignment found.
		 * @private
		 */
		function hasBinaryAssignment(node) {
			return (
				(node.left && node.left.type === "AssignmentExpression") ||
				(node.right && node.right.type === "AssignmentExpression")
			);
		}

		/**
		 * Determines if a node is or contains an assignment expression
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the node is or contains an assignment expression.
		 * @private
		 */
		function containsAssignment(node) {
			if (node.type === "AssignmentExpression") {
				return true;
			}
			if (node.type === "ConditionalExpression") {
				return hasConditionalAssignment(node);
			}
			return hasBinaryAssignment(node);
		}

		/**
		 * Checks if node is ReturnStatement with assignment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if return statement with assignment.
		 * @private
		 */
		function isReturnStatementWithAssignment(node) {
			return node.type === "ReturnStatement" &&
				node.argument &&
				containsAssignment(node.argument);
		}

		/**
		 * Checks if node is ArrowFunctionExpression with assignment body.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if arrow function with assignment body.
		 * @private
		 */
		function isArrowFunctionWithAssignmentBody(node) {
			return (
				node.type === "ArrowFunctionExpression" &&
				node.body.type !== "BlockStatement" &&
				containsAssignment(node.body)
			);
		}

		/**
		 * Determines if a node is contained by or is itself a return statement and is allowed to have a parenthesised assignment
		 * @param {ASTNode} node The node to be checked
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
		 * Determines if this rule should be enforced for a node given the current configuration.
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the rule should be enforced for this node.
		 * @private
		 */
		function ruleApplies(node) {
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

					default:
						break;
				}
			}

			if (
				node.type === "SequenceExpression" &&
				IGNORE_SEQUENCE_EXPRESSIONS
			) {
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
				// The expression should end with its own parens, e.g., new new foo() is not a new expression with parens
				(astUtils.isOpeningParenToken(penultimateToken) &&
					astUtils.isClosingParenToken(lastToken) &&
					newExpression.callee.range[1] < newExpression.range[1])
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

		/**
		 * Determines if a node following a [no LineTerminator here] restriction is
		 * surrounded by (potentially) invalid extra parentheses.
		 * @param {Token} token The token preceding the [no LineTerminator here] restriction.
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the node is incorrectly parenthesised.
		 * @private
		 */
		function hasExcessParensNoLineTerminator(token, node) {
			if (token.loc.end.line === node.loc.start.line) {
				return hasExcessParens(node);
			}

			return hasDoubleExcessParens(node);
		}

		/**
		 * Determines whether a node should be preceded by an additional space when removing parens
		 * @param {ASTNode} node node to evaluate; must be surrounded by parentheses
		 * @returns {boolean} `true` if a space should be inserted before the node
		 * @private
		 */
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

		/**
		 * Determines whether a node should be followed by an additional space when removing parens
		 * @param {ASTNode} node node to evaluate; must be surrounded by parentheses
		 * @returns {boolean} `true` if a space should be inserted after the node
		 * @private
		 */
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

		/**
		 * Determines if a given expression node is an IIFE
		 * @param {ASTNode} node The node to check
		 * @returns {boolean} `true` if the given node is an IIFE
		 */
		function isIIFE(node) {
			const maybeCallNode = astUtils.skipChainExpression(node);

			return (
				maybeCallNode.type === "CallExpression" &&
				maybeCallNode.callee.type === "FunctionExpression"
			);
		}

		/**
		 * Determines if the given node can be the assignment target in destructuring or the LHS of an assignment.
		 * This is to avoid an autofix that could change behavior because parsers mistakenly allow invalid syntax,
		 * such as `(a = b) = c` and `[(a = b) = c] = []`. Ideally, this function shouldn't be necessary.
		 * @param {ASTNode} [node] The node to check
		 * @returns {boolean} `true` if the given node can be a valid assignment target
		 */
		function canBeAssignmentTarget(node) {
			return (
				node &&
				(node.type === "Identifier" || node.type === "MemberExpression")
			);
		}

		/**
		 * Checks if a node is fixable.
		 * A node is fixable if removing a single pair of surrounding parentheses does not turn it
		 * into a directive after fixing other nodes.
		 * Almost all nodes are fixable, except if all of the following conditions are met:
		 * The node is a string Literal
		 * It has a single pair of parentheses
		 * It is the only child of an ExpressionStatement
		 * @param {ASTNode} node The node to evaluate.
		 * @returns {boolean} Whether or not the node is fixable.
		 * @private
		 */
		function isFixable(node) {
			// if it's not a string literal it can be autofixed
			if (node.type !== "Literal" || typeof node.value !== "string") {
				return true;
			}
			if (isParenthesisedTwice(node)) {
				return true;
			}
			return !astUtils.isTopLevelExpressionStatement(node.parent);
		}

		/**
		 * Report the node
		 * @param {ASTNode} node node to evaluate
		 * @returns {void}
		 * @private
		 */
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

				if (ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
					const commentsBeforeLeftParenToken =
						sourceCode.getCommentsBefore(leftParenToken);
					const totalCommentsBeforeLeftParenTokenCount =
						commentsBeforeLeftParenToken.length;
					const ignorePattern = new RegExp(
						ALLOW_PARENS_AFTER_COMMENT_PATTERN,
						"u",
					);

					if (
						totalCommentsBeforeLeftParenTokenCount > 0 &&
						ignorePattern.test(
							commentsBeforeLeftParenToken[
								totalCommentsBeforeLeftParenTokenCount - 1
							].value,
						)
					) {
						return;
					}
				}
			}

			/**
			 * Finishes reporting
			 * @returns {void}
			 * @private
			 */
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

		/**
		 * Evaluate a argument of the node.
		 * @param {ASTNode} node node to evaluate
		 * @returns {void}
		 * @private
		 */
		function checkArgumentWithPrecedence(node) {
			if (
				hasExcessParensWithPrecedence(node.argument, precedence(node))
			) {
				report(node.argument);
			}
		}

		/**
		 * Check if a member expression contains a call expression
		 * @param {ASTNode} node MemberExpression node to evaluate
		 * @returns {boolean} true if found, false if not
		 */
		function doesMemberExpressionContainCallExpression(node) {
			let currentNode = node.object;
			let currentNodeType = node.object.type;

			while (currentNodeType === "MemberExpression") {
				currentNode = currentNode.object;
				currentNodeType = currentNode.type;
			}

			return currentNodeType === "CallExpression";
		}

		/**
		 * Evaluate a new call
		 * @param {ASTNode} node node to evaluate
		 * @returns {void}
		 * @private
		 */
		function checkCallNew(node) {
			const callee = node.callee;

			if (hasExcessParensWithPrecedence(callee, precedence(node))) {
				if (
					hasDoubleExcessParens(callee) ||
					!(
						isIIFE(node) ||
						// (new A)(); new (new A)();
						(callee.type === "NewExpression" &&
							!isNewExpressionWithParens(callee) &&
							!(
								node.type === "NewExpression" &&
								!isNewExpressionWithParens(node)
							)) ||
						// new (a().b)(); new (a.b().c);
						(node.type === "NewExpression" &&
							callee.type === "MemberExpression" &&
							doesMemberExpressionContainCallExpression(
								callee,
							)) ||
						// (a?.b)(); (a?.())();
						(!node.optional && callee.type === "ChainExpression")
					)
				) {
					report(node.callee);
				}
			}
			node.arguments
				.filter(arg =>
					hasExcessParensWithPrecedence(
						arg,
						PRECEDENCE_OF_ASSIGNMENT_EXPR,
					),
				)
				.forEach(report);
		}

		/**
		 * Evaluate binary logicals
		 * @param {ASTNode} node node to evaluate
		 * @returns {void}
		 * @private
		 */
		function checkBinaryLogical(node) {
			const prec = precedence(node);
			const leftPrecedence = precedence(node.left);
			const rightPrecedence = precedence(node.right);
			const isExponentiation = node.operator === "**";
			const shouldSkipLeft =
				NESTED_BINARY &&
				(node.left.type === "BinaryExpression" ||
					node.left.type === "LogicalExpression");
			const shouldSkipRight =
				NESTED_BINARY &&
				(node.right.type === "BinaryExpression" ||
					node.right.type === "LogicalExpression");

			if (!shouldSkipLeft && hasExcessParens(node.left)) {
				if (
					(!(
						["AwaitExpression", "UnaryExpression"].includes(
							node.left.type,
						) && isExponentiation
					) &&
						!astUtils.isMixedLogicalAndCoalesceExpressions(
							node.left,
							node,
						) &&
						(leftPrecedence > prec ||
							(leftPrecedence === prec && !isExponentiation))) ||
					isParenthesisedTwice(node.left)
				) {
					report(node.left);
				}
			}

			if (!shouldSkipRight && hasExcessParens(node.right)) {
				if (
					(!astUtils.isMixedLogicalAndCoalesceExpressions(
						node.right,
						node,
					) &&
						(rightPrecedence > prec ||
							(rightPrecedence === prec && isExponentiation))) ||
					isParenthesisedTwice(node.right)
				) {
					report(node.right);
				}
			}
		}

		/**
		 * Check the parentheses around the super class of the given class definition.
		 * @param {ASTNode} node The node of class declarations to check.
		 * @returns {void}
		 */
		function checkClass(node) {
			if (!node.superClass) {
				return;
			}

			/*
			 * If `node.superClass` is a LeftHandSideExpression, parentheses are extra.
			 * Otherwise, parentheses are needed.
			 */
			const hasExtraParens =
				precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
					? hasExcessParens(node.superClass)
					: hasDoubleExcessParens(node.superClass);

			if (hasExtraParens) {
				report(node.superClass);
			}
		}

		/**
		 * Check the parentheses around the argument of the given spread operator.
		 * @param {ASTNode} node The node of spread elements/properties to check.
		 * @returns {void}
		 */
		function checkSpreadOperator(node) {
			if (
				hasExcessParensWithPrecedence(
					node.argument,
					PRECEDENCE_OF_ASSIGNMENT_EXPR,
				)
			) {
				report(node.argument);
			}
		}

		/**
		 * Checks the parentheses for an ExpressionStatement or ExportDefaultDeclaration
		 * @param {ASTNode} node The ExpressionStatement.expression or ExportDefaultDeclaration.declaration node
		 * @returns {void}
		 */
		function checkExpressionOrExportStatement(node) {
			const firstToken = isParenthesised(node)
				? sourceCode.getTokenBefore(node)
				: sourceCode.getFirstToken(node);
			const secondToken = sourceCode.getTokenAfter(
				firstToken,
				astUtils.isNotOpeningParenToken,
			);
			const thirdToken = secondToken
				? sourceCode.getTokenAfter(secondToken)
				: null;
			const tokenAfterClosingParens = secondToken
				? sourceCode.getTokenAfter(
						secondToken,
						astUtils.isNotClosingParenToken,
					)
				: null;

			if (
				astUtils.isOpeningParenToken(firstToken) &&
				(astUtils.isOpeningBraceToken(secondToken) ||
					(secondToken.type === "Keyword" &&
						(secondToken.value === "function" ||
							secondToken.value === "class" ||
							(secondToken.value === "let" &&
								tokenAfterClosingParens &&
								(astUtils.isOpeningBracketToken(
									tokenAfterClosingParens,
								) ||
									tokenAfterClosingParens.type ===
										"Identifier")))) ||
					(secondToken &&
						secondToken.type === "Identifier" &&
						secondToken.value === "async" &&
						thirdToken &&
						thirdToken.type === "Keyword" &&
						thirdToken.value === "function"))
			) {
				tokensToIgnore.add(secondToken);
			}

			const hasExtraParens =
				node.parent.type === "ExportDefaultDeclaration"
					? hasExcessParensWithPrecedence(
							node,
							PRECEDENCE_OF_ASSIGNMENT_EXPR,
						)
					: hasExcessParens(node);

			if (hasExtraParens) {
				report(node);
			}
		}

		/**
		 * Finds the path from the given node to the specified ancestor.
		 * @param {ASTNode} node First node in the path.
		 * @param {ASTNode} ancestor Last node in the path.
		 * @returns {ASTNode[]} Path, including both nodes.
		 * @throws {Error} If the given node does not have the specified ancestor.
		 */
		function pathToAncestor(node, ancestor) {
			const path = [node];
			let currentNode = node;

			while (currentNode !== ancestor) {
				currentNode = currentNode.parent;

				/* c8 ignore start */
				if (currentNode === null) {
					throw new Error(
						"Nodes are not in the ancestor-descendant relationship.",
					);
				} /* c8 ignore stop */

				path.push(currentNode);
			}

			return path;
		}

		/**
		 * Finds the path from the given node to the specified descendant.
		 * @param {ASTNode} node First node in the path.
		 * @param {ASTNode} descendant Last node in the path.
		 * @returns {ASTNode[]} Path, including both nodes.
		 * @throws {Error} If the given node does not have the specified descendant.
		 */
		function pathToDescendant(node, descendant) {
			return pathToAncestor(descendant, node).reverse();
		}

		/**
		 * Checks whether the syntax of the given ancestor of an 'in' expression inside a for-loop initializer
		 * is preventing the 'in' keyword from being interpreted as a part of an ill-formed for-in loop.
		 * @param {ASTNode} node Ancestor of an 'in' expression.
		 * @param {ASTNode} child Child of the node, ancestor of the same 'in' expression or the 'in' expression itself.
		 * @returns {boolean} True if the keyword 'in' would be interpreted as the 'in' operator, without any parenthesis.
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
		 * Starts a new reports buffering. Warnings will be stored in a buffer instead of being reported immediately.
		 * An additional logic that requires multiple nodes (e.g. a whole subtree) may dismiss some of the stored warnings.
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
		 * Ends the current reports buffering.
		 * @returns {void}
		 */
		function endCurrentReportsBuffering() {
			const { upper, inExpressionNodes, reports } = reportsBuffer;

			if (upper) {
				upper.inExpressionNodes.push(...inExpressionNodes);
				upper.reports.push(...reports);
			} else {
				// flush remaining reports
				reports.forEach(({ finishReport }) => finishReport());
			}

			reportsBuffer = upper;
		}

		/**
		 * Checks whether the given node is in the current reports buffer.
		 * @param {ASTNode} node Node to check.
		 * @returns {boolean} True if the node is in the current buffer, false otherwise.
		 */
		function isInCurrentReportsBuffer(node) {
			return reportsBuffer.reports.some(r => r.node === node);
		}

		/**
		 * Removes the given node from the current reports buffer.
		 * @param {ASTNode} node Node to remove.
		 * @returns {void}
		 */
		function removeFromCurrentReportsBuffer(node) {
			reportsBuffer.reports = reportsBuffer.reports.filter(
				r => r.node !== node,
			);
		}

		/**
		 * Checks whether a node is a MemberExpression at NewExpression's callee.
		 * @param {ASTNode} node node to check.
		 * @returns {boolean} True if the node is a MemberExpression at NewExpression's callee. false otherwise.
		 */
		function isMemberExpInNewCallee(node) {
			if (node.type === "MemberExpression") {
				return node.parent.type === "NewExpression" &&
					node.parent.callee === node
					? true
					: node.parent.object === node &&
							isMemberExpInNewCallee(node.parent);
			}
			return false;
		}

		/**
		 * Checks if the left-hand side of an assignment is an identifier, the operator is one of
		 * `=`, `&&=`, `||=` or `??=` and the right-hand side is an anonymous class or function.
		 *
		 * As per https://tc39.es/ecma262/#sec-assignment-operators-runtime-semantics-evaluation, an
		 * assignment involving one of the operators `=`, `&&=`, `||=` or `??=` where the right-hand
		 * side is an anonymous class or function and the left-hand side is an *unparenthesized*
		 * identifier has different semantics than other assignments.
		 * Specifically, when an expression like `foo = function () {}` is evaluated, `foo.name`
		 * will be set to the string "foo", i.e. the identifier name. The same thing does not happen
		 * when evaluating `(foo) = function () {}`.
		 * Since the parenthesizing of the identifier in the left-hand side is significant in this
		 * special case, the parentheses, if present, should not be flagged as unnecessary.
		 * @param {ASTNode} node an AssignmentExpression node.
		 * @returns {boolean} `true` if the left-hand side of the assignment is an identifier, the
		 * operator is one of `=`, `&&=`, `||=` or `??=` and the right-hand side is an anonymous
		 * class or function; otherwise, `false`.
		 */
		function isAnonymousFunctionAssignmentException({
			left,
			operator,
			right,
		}) {
			if (
				left.type === "Identifier" &&
				["=", "&&=", "||=", "??="].includes(operator)
			) {
				const rhsType = right.type;

				if (rhsType === "ArrowFunctionExpression") {
					return true;
				}
				if (
					(rhsType === "FunctionExpression" ||
						rhsType === "ClassExpression") &&
					!right.id
				) {
					return true;
				}
			}
			return false;
		}

		/**
		 * Determines if a node is a ConditionalExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a ConditionalExpression.
		 */
		function isConditionalExpression(node) {
			return node.type === "ConditionalExpression";
		}

		/**
		 * Determines if a node is a BinaryExpression or LogicalExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a BinaryExpression or LogicalExpression.
		 */
		function isBinaryOrLogicalExpression(node) {
			return (
				node.type === "BinaryExpression" ||
				node.type === "LogicalExpression"
			);
		}

		/**
		 * Determines if a node is a UnaryExpression or AwaitExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a UnaryExpression or AwaitExpression.
		 */
		function isUnaryOrAwaitExpression(node) {
			return (
				node.type === "UnaryExpression" ||
				node.type === "AwaitExpression"
			);
		}

		/**
		 * Determines if a node is a NewExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a NewExpression.
		 */
		function isNewExpression(node) {
			return node.type === "NewExpression";
		}

		/**
		 * Determines if a node is a MemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a MemberExpression.
		 */
		function isMemberExpression(node) {
			return node.type === "MemberExpression";
		}

		/**
		 * Determines if a node is a CallExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a CallExpression.
		 */
		function isCallExpression(node) {
			return node.type === "CallExpression";
		}

		/**
		 * Determines if a node is a ChainExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a ChainExpression.
		 */
		function isChainExpression(node) {
			return node.type === "ChainExpression";
		}

		/**
		 * Determines if a node is a SequenceExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a SequenceExpression.
		 */
		function isSequenceExpression(node) {
			return node.type === "SequenceExpression";
		}

		/**
		 * Determines if a node is a VariableDeclaration.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a VariableDeclaration.
		 */
		function isVariableDeclaration(node) {
			return node.type === "VariableDeclaration";
		}

		/**
		 * Determines if a node is a Literal with a regex.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a Literal with a regex.
		 */
		function isRegexLiteral(node) {
			return (
				node.type === "Literal" &&
				node.value !== null &&
				node.regex
			);
		}

		/**
		 * Determines if a node is a DecimalInteger.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a DecimalInteger.
		 */
		function isDecimalInteger(node) {
			return astUtils.isDecimalInteger(node);
		}

		/**
		 * Determines if a node is a MixedLogicalAndCoalesceExpressions.
		 * @param {ASTNode} left The left node.
		 * @param {ASTNode} parent The parent node.
		 * @returns {boolean} True if the node is a MixedLogicalAndCoalesceExpressions.
		 */
		function isMixedLogicalAndCoalesceExpressions(left, parent) {
			return astUtils.isMixedLogicalAndCoalesceExpressions(left, parent);
		}

		/**
		 * Determines if a node is a TopLevelExpressionStatement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a TopLevelExpressionStatement.
		 */
		function isTopLevelExpressionStatement(node) {
			return astUtils.isTopLevelExpressionStatement(node);
		}

		/**
		 * Determines if a node is a OpeningParenToken.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a OpeningParenToken.
		 */
		function isOpeningParenToken(token) {
			return astUtils.isOpeningParenToken(token);
		}

		/**
		 * Determines if a node is a OpeningBracketToken.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a OpeningBracketToken.
		 */
		function isOpeningBracketToken(token) {
			return astUtils.isOpeningBracketToken(token);
		}

		/**
		 * Determines if a node is a OpeningBraceToken.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a OpeningBraceToken.
		 */
		function isOpeningBraceToken(token) {
			return astUtils.isOpeningBraceToken(token);
		}

		/**
		 * Determines if a node is a ClosingParenToken.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a ClosingParenToken.
		 */
		function isClosingParenToken(token) {
			return astUtils.isClosingParenToken(token);
		}

		/**
		 * Determines if a node is a NotOpeningParenToken.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a NotOpeningParenToken.
		 */
		function isNotOpeningParenToken(token) {
			return astUtils.isNotOpeningParenToken(token);
		}

		/**
		 * Determines if a node is a NotClosingParenToken.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a NotClosingParenToken.
		 */
		function isNotClosingParenToken(token) {
			return astUtils.isNotClosingParenToken(token);
		}

		/**
		 * Determines if a node is a Keyword.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a Keyword.
		 */
		function isKeyword(token) {
			return token.type === "Keyword";
		}

		/**
		 * Determines if a node is a Identifier.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a Identifier.
		 */
		function isIdentifier(token) {
			return token.type === "Identifier";
		}

		/**
		 * Determines if a node is a StringLiteral.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a StringLiteral.
		 */
		function isStringLiteral(token) {
			return token.type === "String";
		}

		/**
		 * Determines if a node is a NumberLiteral.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a NumberLiteral.
		 */
		function isNumberLiteral(token) {
			return token.type === "Number";
		}

		/**
		 * Determines if a node is a BooleanLiteral.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a BooleanLiteral.
		 */
		function isBooleanLiteral(token) {
			return token.type === "Boolean";
		}

		/**
		 * Determines if a node is a NullLiteral.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a NullLiteral.
		 */
		function isNullLiteral(token) {
			return token.type === "Null";
		}

		/**
		 * Determines if a node is a RegexLiteral.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a RegexLiteral.
		 */
		function isRegexLiteralToken(token) {
			return token.type === "RegExp";
		}

		/**
		 * Determines if a node is a TemplateLiteral.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a TemplateLiteral.
		 */
		function isTemplateLiteralToken(token) {
			return token.type === "Template";
		}

		/**
		 * Determines if a node is a Comment.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a Comment.
		 */
		function isComment(token) {
			return token.type === "Comment";
		}

		/**
		 * Determines if a node is a Punctuator.
		 * @param {Token} token The token to check.
		 * @returns {boolean} True if the token is a Punctuator.
		 */
		function isPunctuator(token) {
			return token.type === "Punctuator";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXIdentifier.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXIdentifier.
		 */
		function isJSXIdentifier(node) {
			return node.type === "JSXIdentifier";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpressionContainer.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpressionContainer.
		 */
		function isJSXExpressionContainer(node) {
			return node.type === "JSXExpressionContainer";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute2(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement2(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment2(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText2(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression2(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement2(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement2(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment2(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment2(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute2(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression2(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName2(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute3(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild2(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement3(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment3(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText3(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression2(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression3(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement3(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement3(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment3(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment3(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute3(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression3(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName3(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute4(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild3(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement4(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment4(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText4(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression3(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression4(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement4(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement4(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment4(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment4(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute4(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression4(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName4(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute5(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild4(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement5(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment5(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText5(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression4(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression5(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement5(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement5(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment5(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment5(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute5(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression5(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName5(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute6(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild5(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement6(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment6(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText6(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression5(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression6(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement6(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement6(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment6(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment6(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute6(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression6(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName6(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute7(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild6(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement7(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment7(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText7(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression6(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression7(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement7(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement7(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment7(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment7(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute7(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression7(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName7(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute8(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild7(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement8(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment8(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText8(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression7(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression8(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement8(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement8(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment8(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment8(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute8(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression8(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName8(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute9(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild8(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement9(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment9(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText9(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression8(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression9(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement9(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement9(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment9(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment9(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute9(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression9(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName9(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute10(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild9(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement10(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment10(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText10(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression9(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression10(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement10(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement10(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment10(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment10(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute10(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression10(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName10(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute11(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild10(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement11(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment11(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText11(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression10(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression11(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement11(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement11(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment11(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment11(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute11(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression11(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName11(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute12(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild11(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement12(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment12(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText12(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression11(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression12(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement12(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement12(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment12(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment12(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute12(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression12(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName12(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute13(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild12(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement13(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment13(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText13(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression12(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression13(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement13(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement13(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment13(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment13(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute13(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression13(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName13(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute14(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild13(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement14(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment14(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText14(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression13(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression14(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement14(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement14(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment14(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment14(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute14(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression14(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName14(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute15(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild14(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement15(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment15(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText15(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression14(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression15(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement15(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement15(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment15(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment15(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute15(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression15(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName15(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute16(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild15(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement16(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment16(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText16(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression15(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression16(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement16(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement16(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment16(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment16(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute16(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression16(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName16(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute17(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild16(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement17(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment17(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText17(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression16(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression17(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement17(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement17(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment17(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment17(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute17(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression17(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName17(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute18(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild17(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement18(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment18(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText18(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression17(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression18(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement18(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement18(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment18(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment18(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute18(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression18(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName18(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute19(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild18(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement19(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment19(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText19(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression18(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression19(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement19(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement19(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment19(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment19(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute19(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression19(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName19(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute20(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild19(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement20(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment20(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText20(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression19(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression20(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement20(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement20(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment20(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment20(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute20(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression20(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName20(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute21(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild20(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement21(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment21(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText21(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression20(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression21(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement21(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement21(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment21(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment21(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute21(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression21(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName21(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute22(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild21(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement22(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment22(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText22(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression21(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression22(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement22(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement22(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment22(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment22(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute22(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression22(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName22(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute23(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild22(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement23(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment23(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText23(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression22(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression23(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement23(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement23(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment23(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment23(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute23(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression23(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName23(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute24(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild23(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement24(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment24(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText24(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression23(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression24(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement24(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement24(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment24(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment24(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute24(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression24(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName24(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute25(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild24(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement25(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment25(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText25(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression24(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression25(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement25(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement25(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment25(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment25(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute25(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression25(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName25(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute26(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild25(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement26(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment26(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText26(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression25(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression26(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement26(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement26(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment26(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment26(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute26(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression26(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName26(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute27(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild26(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement27(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment27(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText27(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression26(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression27(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement27(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement27(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment27(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment27(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute27(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression27(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName27(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute28(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild27(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement28(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment28(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText28(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression27(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression28(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement28(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement28(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment28(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment28(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute28(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression28(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName28(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute29(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild28(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement29(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment29(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText29(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression28(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression29(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement29(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement29(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment29(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment29(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute29(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression29(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName29(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute30(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild29(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement30(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment30(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText30(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression29(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression30(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement30(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement30(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment30(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment30(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute30(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression30(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName30(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute31(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild30(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement31(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment31(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText31(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression30(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression31(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement31(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement31(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment31(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment31(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute31(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression31(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName31(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute32(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild31(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement32(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment32(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText32(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression31(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression32(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement32(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement32(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment32(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment32(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute32(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression32(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName32(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute33(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild32(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement33(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment33(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText33(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression32(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression33(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement33(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement33(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment33(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment33(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute33(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression33(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName33(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute34(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild33(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement34(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment34(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText34(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression33(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression34(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement34(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement34(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment34(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment34(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute34(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression34(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName34(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute35(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild34(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement35(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment35(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText35(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression34(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression35(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement35(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement35(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment35(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment35(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute35(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression35(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName35(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute36(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild35(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement36(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment36(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText36(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression35(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression36(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement36(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement36(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment36(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment36(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute36(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression36(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName36(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute37(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild36(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement37(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment37(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText37(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression36(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression37(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement37(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement37(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment37(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment37(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute37(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression37(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName37(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute38(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild37(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement38(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment38(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText38(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression37(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression38(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement38(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement38(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment38(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment38(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute38(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression38(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName38(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute39(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild38(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement39(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment39(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText39(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression38(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression39(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement39(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement39(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment39(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment39(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute39(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression39(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName39(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute40(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild39(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement40(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment40(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText40(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression39(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression40(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement40(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement40(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment40(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment40(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute40(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression40(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName40(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute41(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild40(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement41(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment41(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText41(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression40(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression41(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement41(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement41(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment41(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment41(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute41(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression41(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName41(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute42(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild41(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement42(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment42(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText42(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression41(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression42(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement42(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement42(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment42(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment42(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute42(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression42(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName42(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute43(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild42(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement43(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment43(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText43(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression42(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression43(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement43(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement43(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment43(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment43(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute43(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression43(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName43(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute44(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild43(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement44(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment44(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText44(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression43(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression44(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement44(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement44(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment44(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment44(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute44(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression44(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName44(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute45(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild44(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement45(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment45(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText45(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression44(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression45(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement45(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement45(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment45(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment45(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute45(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression45(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName45(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute46(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild45(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement46(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment46(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText46(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression45(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression46(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement46(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement46(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment46(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment46(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute46(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression46(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName46(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute47(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild46(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement47(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment47(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText47(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression46(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression47(node) {
			return node.type === "JSXEmptyExpression";
		}

		/**
		 * Determines if a node is a JSXOpeningElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningElement.
		 */
		function isJSXOpeningElement47(node) {
			return node.type === "JSXOpeningElement";
		}

		/**
		 * Determines if a node is a JSXClosingElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingElement.
		 */
		function isJSXClosingElement47(node) {
			return node.type === "JSXClosingElement";
		}

		/**
		 * Determines if a node is a JSXOpeningFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXOpeningFragment.
		 */
		function isJSXOpeningFragment47(node) {
			return node.type === "JSXOpeningFragment";
		}

		/**
		 * Determines if a node is a JSXClosingFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXClosingFragment.
		 */
		function isJSXClosingFragment47(node) {
			return node.type === "JSXClosingFragment";
		}

		/**
		 * Determines if a node is a JSXSpreadAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadAttribute.
		 */
		function isJSXSpreadAttribute47(node) {
			return node.type === "JSXSpreadAttribute";
		}

		/**
		 * Determines if a node is a JSXMemberExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXMemberExpression.
		 */
		function isJSXMemberExpression47(node) {
			return node.type === "JSXMemberExpression";
		}

		/**
		 * Determines if a node is a JSXNamespacedName.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXNamespacedName.
		 */
		function isJSXNamespacedName47(node) {
			return node.type === "JSXNamespacedName";
		}

		/**
		 * Determines if a node is a JSXAttribute.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXAttribute.
		 */
		function isJSXAttribute48(node) {
			return node.type === "JSXAttribute";
		}

		/**
		 * Determines if a node is a JSXSpreadChild.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXSpreadChild.
		 */
		function isJSXSpreadChild47(node) {
			return node.type === "JSXSpreadChild";
		}

		/**
		 * Determines if a node is a JSXElement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXElement.
		 */
		function isJSXElement48(node) {
			return node.type === "JSXElement";
		}

		/**
		 * Determines if a node is a JSXFragment.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXFragment.
		 */
		function isJSXFragment48(node) {
			return node.type === "JSXFragment";
		}

		/**
		 * Determines if a node is a JSXText.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXText.
		 */
		function isJSXText48(node) {
			return node.type === "JSXText";
		}

		/**
		 * Determines if a node is a JSXExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXExpression.
		 */
		function isJSXExpression47(node) {
			return node.type === "JSXExpression";
		}

		/**
		 * Determines if a node is a JSXEmptyExpression.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is a JSXEmptyExpression.
		 */
		function isJSXEmptyExpression48(node) {
			return node.type === "JSXEmptyExpression";
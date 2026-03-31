```javascript
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

		// Configuration options
		const options = {
			allNodes: context.options[0] !== "functions",
			get config() {
				return this.allNodes ? context.options[1] : {};
			},
			get exceptCondAssign() {
				return this.allNodes && this.config?.conditionalAssign === false;
			},
			get exceptCondTernary() {
				return this.allNodes && this.config?.ternaryOperandBinaryExpressions === false;
			},
			get nestedBinary() {
				return this.allNodes && this.config?.nestedBinaryExpressions === false;
			},
			get exceptReturnAssign() {
				return this.allNodes && this.config?.returnAssign === false;
			},
			get ignoreJsx() {
				return this.allNodes && this.config?.ignoreJSX;
			},
			get ignoreArrowConditionals() {
				return this.allNodes && this.config?.enforceForArrowConditionals === false;
			},
			get ignoreSequenceExpressions() {
				return this.allNodes && this.config?.enforceForSequenceExpressions === false;
			},
			get ignoreNewInMemberExpr() {
				return this.allNodes && this.config?.enforceForNewInMemberExpressions === false;
			},
			get ignoreFunctionPrototypeMethods() {
				return this.allNodes && this.config?.enforceForFunctionPrototypeMethods === false;
			},
			get allowParensAfterCommentPattern() {
				return this.allNodes && this.config?.allowParensAfterCommentPattern;
			},
		};

		const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({
			type: "AssignmentExpression",
		});
		const PRECEDENCE_OF_UPDATE_EXPR = precedence({
			type: "UpdateExpression",
		});

		let reportsBuffer;

		// Parenthesis checking utilities
		const parenthesisUtils = {
			isParenthesised(node) {
				return isParenthesizedRaw(1, node, sourceCode);
			},
			isParenthesisedTwice(node) {
				return isParenthesizedRaw(2, node, sourceCode);
			},
			hasExcessParens(node) {
				return this.ruleApplies(node) && this.isParenthesised(node);
			},
			hasDoubleExcessParens(node) {
				return this.ruleApplies(node) && this.isParenthesisedTwice(node);
			},
			hasExcessParensWithPrecedence(node, precedenceLowerLimit) {
				if (this.ruleApplies(node) && this.isParenthesised(node)) {
					if (
						precedence(node) >= precedenceLowerLimit ||
						this.isParenthesisedTwice(node)
					) {
						return true;
					}
				}
				return false;
			},
			ruleApplies(node) {
				if (node.type === "JSXElement" || node.type === "JSXFragment") {
					const isSingleLine = node.loc.start.line === node.loc.end.line;
					switch (options.ignoreJsx) {
						case "all":
							return false;
						case "multi-line":
							return isSingleLine;
						case "single-line":
							return !isSingleLine;
						case "none":
						default:
							break;
					}
				}

				if (
					node.type === "SequenceExpression" &&
					options.ignoreSequenceExpressions
				) {
					return false;
				}

				if (
					this.isImmediateFunctionPrototypeMethodCall(node) &&
					options.ignoreFunctionPrototypeMethods
				) {
					return false;
				}

				return (
					options.allNodes ||
					node.type === "FunctionExpression" ||
					node.type === "ArrowFunctionExpression"
				);
			},
			isImmediateFunctionPrototypeMethodCall(node) {
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
			},
		};

		// Spacing utilities
		const spacingUtils = {
			requiresLeadingSpace(node) {
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
			},
			requiresTrailingSpace(node) {
				const nextTwoTokens = sourceCode.getTokensAfter(node, {
					count: 2,
				});
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
			},
		};

		// Node type checking utilities
		const nodeTypeUtils = {
			isIIFE(node) {
				const maybeCallNode = astUtils.skipChainExpression(node);
				return (
					maybeCallNode.type === "CallExpression" &&
					maybeCallNode.callee.type === "FunctionExpression"
				);
			},
			canBeAssignmentTarget(node) {
				return (
					node &&
					(node.type === "Identifier" || node.type === "MemberExpression")
				);
			},
			isFixable(node) {
				if (node.type !== "Literal" || typeof node.value !== "string") {
					return true;
				}
				if (parenthesisUtils.isParenthesisedTwice(node)) {
					return true;
				}
				return !astUtils.isTopLevelExpressionStatement(node.parent);
			},
			isNewExpressionWithParens(newExpression) {
				const lastToken = sourceCode.getLastToken(newExpression);
				const penultimateToken = sourceCode.getTokenBefore(lastToken);

				return (
					newExpression.arguments.length > 0 ||
					(astUtils.isOpeningParenToken(penultimateToken) &&
						astUtils.isClosingParenToken(lastToken) &&
						newExpression.callee.range[1] < newExpression.range[1])
				);
			},
			containsAssignment(node) {
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
			},
			doesMemberExpressionContainCallExpression(node) {
				let currentNode = node.object;
				let currentNodeType = node.object.type;

				while (currentNodeType === "MemberExpression") {
					currentNode = currentNode.object;
					currentNodeType = currentNode.type;
				}

				return currentNodeType === "CallExpression";
			},
			isMemberExpInNewCallee(node) {
				if (node.type === "MemberExpression") {
					return node.parent.type === "NewExpression" &&
						node.parent.callee === node
						? true
						: node.parent.object === node &&
								this.isMemberExpInNewCallee(node.parent);
				}
				return false;
			},
			isAnonymousFunctionAssignmentException({
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
			},
		};

		// Exception checking utilities
		const exceptionUtils = {
			isCondAssignException(node) {
				return (
					options.exceptCondAssign &&
					node.test.type === "AssignmentExpression"
				);
			},
			isInReturnStatement(node) {
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
			},
			isReturnAssignException(node) {
				if (
					!options.exceptReturnAssign ||
					!this.isInReturnStatement(node)
				) {
					return false;
				}

				if (node.type === "ReturnStatement") {
					return (
						node.argument &&
						nodeTypeUtils.containsAssignment(node.argument)
					);
				}
				if (
					node.type === "ArrowFunctionExpression" &&
					node.body.type !== "BlockStatement"
				) {
					return nodeTypeUtils.containsAssignment(node.body);
				}
				return nodeTypeUtils.containsAssignment(node);
			},
			hasExcessParensNoLineTerminator(token, node) {
				if (token.loc.end.line === node.loc.start.line) {
					return parenthesisUtils.hasExcessParens(node);
				}
				return parenthesisUtils.hasDoubleExcessParens(node);
			},
		};

		// Path utilities
		const pathUtils = {
			pathToAncestor(node, ancestor) {
				const path = [node];
				let currentNode = node;

				while (currentNode !== ancestor) {
					currentNode = currentNode.parent;

					if (currentNode === null) {
						throw new Error(
							"Nodes are not in the ancestor-descendant relationship.",
						);
					}

					path.push(currentNode);
				}

				return path;
			},
			pathToDescendant(node, descendant) {
				return this.pathToAncestor(descendant, node).reverse();
			},
			isSafelyEnclosingInExpression(node, child) {
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
			},
		};

		// Report buffering utilities
		const bufferingUtils = {
			startNewReportsBuffering() {
				reportsBuffer = {
					upper: reportsBuffer,
					inExpressionNodes
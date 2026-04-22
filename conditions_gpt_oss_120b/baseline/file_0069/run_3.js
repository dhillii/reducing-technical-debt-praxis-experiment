/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

const { isParenthesized: isParenthesizedRaw } = require("@eslint-community/eslint-utils");
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

		const ALL_NODES = context.options[0] !== "functions";
		const opts = context.options[1] || {};

		const EXCEPT_COND_ASSIGN = ALL_NODES && opts.conditionalAssign === false;
		const EXCEPT_COND_TERNARY = ALL_NODES && opts.ternaryOperandBinaryExpressions === false;
		const NESTED_BINARY = ALL_NODES && opts.nestedBinaryExpressions === false;
		const EXCEPT_RETURN_ASSIGN = ALL_NODES && opts.returnAssign === false;
		const IGNORE_JSX = ALL_NODES && opts.ignoreJSX;
		const IGNORE_ARROW_CONDITIONALS = ALL_NODES && opts.enforceForArrowConditionals === false;
		const IGNORE_SEQUENCE_EXPRESSIONS = ALL_NODES && opts.enforceForSequenceExpressions === false;
		const IGNORE_NEW_IN_MEMBER_EXPR = ALL_NODES && opts.enforceForNewInMemberExpressions === false;
		const IGNORE_FUNCTION_PROTOTYPE_METHODS = ALL_NODES && opts.enforceForFunctionPrototypeMethods === false;
		const ALLOW_PARENS_AFTER_COMMENT_PATTERN = ALL_NODES && opts.allowParensAfterCommentPattern;

		const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
		const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });

		let reportsBuffer;

		// ----------------------------------------------------------------------
		// Helper utilities
		// ----------------------------------------------------------------------
		const isParenthesised = node => isParenthesizedRaw(1, node, sourceCode);
		const isParenthesisedTwice = node => isParenthesizedRaw(2, node, sourceCode);
		const hasExcessParens = node => ruleApplies(node) && isParenthesised(node);
		const hasDoubleExcessParens = node => ruleApplies(node) && isParenthesisedTwice(node);
		const hasExcessParensWithPrecedence = (node, lower) => {
			if (!ruleApplies(node) || !isParenthesised(node)) return false;
			return precedence(node) >= lower || isParenthesisedTwice(node);
		};

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

		function ruleApplies(node) {
			if (node.type === "JSXElement" || node.type === "JSXFragment") {
				const singleLine = node.loc.start.line === node.loc.end.line;
				if (IGNORE_JSX === "all") return false;
				if (IGNORE_JSX === "multi-line") return singleLine;
				if (IGNORE_JSX === "single-line") return !singleLine;
			}
			if (node.type === "SequenceExpression" && IGNORE_SEQUENCE_EXPRESSIONS) return false;
			if (isImmediateFunctionPrototypeMethodCall(node) && IGNORE_FUNCTION_PROTOTYPE_METHODS) return false;
			return ALL_NODES || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
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

		function isCondAssignException(node) {
			return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
		}

		function isReturnAssignException(node) {
			if (!EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) return false;
			if (node.type === "ReturnStatement") return node.argument && containsAssignment(node.argument);
			if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement")
				return containsAssignment(node.body);
			return containsAssignment(node);
		}

		function containsAssignment(node) {
			if (node.type === "AssignmentExpression") return true;
			if (node.type === "ConditionalExpression")
				return (
					node.consequent.type === "AssignmentExpression" ||
					node.alternate.type === "AssignmentExpression"
				);
			if ((node.left && node.left.type === "AssignmentExpression") || (node.right && node.right.type === "AssignmentExpression"))
				return true;
			return false;
		}

		function isNewExpressionWithParens(expr) {
			const last = sourceCode.getLastToken(expr);
			const penult = sourceCode.getTokenBefore(last);
			return (
				expr.arguments.length > 0 ||
				(astUtils.isOpeningParenToken(penult) &&
					astUtils.isClosingParenToken(last) &&
					expr.callee.range[1] < expr.range[1])
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

			const finish = () => {
				context.report({
					node,
					loc: leftParen.loc,
					messageId: "unexpected",
					fix: isFixable(node)
						? fixer => {
								const inner = sourceCode.text.slice(leftParen.range[1], rightParen.range[0]);
								return fixer.replaceTextRange(
									[leftParen.range[0], rightParen.range[1]],
									(requiresLeadingSpace(node) ? " " : "") + inner + (requiresTrailingSpace(node) ? " " : "")
								);
						  }
						: null,
				});
			};

			if (reportsBuffer) {
				reportsBuffer.reports.push({ node, finishReport: finish });
			} else {
				finish();
			}
		}

		// ----------------------------------------------------------------------
		// Specific checks
		// ----------------------------------------------------------------------
		function checkArgumentWithPrecedence(node) {
			if (hasExcessParensWithPrecedence(node.argument, precedence(node))) {
				report(node.argument);
			}
		}

		function doesMemberExpressionContainCallExpression(node) {
			let cur = node.object;
			while (cur.type === "MemberExpression") cur = cur.object;
			return cur.type === "CallExpression";
		}

		function shouldSkipBinarySide(side) {
			return NESTED_BINARY && (side.type === "BinaryExpression" || side.type === "LogicalExpression");
		}

		function leftShouldReport(node, leftPrec, prec, isExp) {
			if (["AwaitExpression", "UnaryExpression"].includes(node.left.type) && isExp) return false;
			if (astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node)) return false;
			if (leftPrec > prec) return true;
			if (leftPrec === prec && !isExp) return true;
			return isParenthesisedTwice(node.left);
		}

		function rightShouldReport(node, rightPrec, prec, isExp) {
			if (astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node)) return false;
			if (rightPrec > prec) return true;
			if (rightPrec === prec && isExp) return true;
			return isParenthesisedTwice(node.right);
		}

		function checkBinaryLogical(node) {
			const prec = precedence(node);
			const leftPrec = precedence(node.left);
			const rightPrec = precedence(node.right);
			const isExp = node.operator === "**";

			if (!shouldSkipBinarySide(node.left) && hasExcessParens(node.left) && leftShouldReport(node, leftPrec, prec, isExp)) {
				report(node.left);
			}
			if (!shouldSkipBinarySide(node.right) && hasExcessParens(node.right) && rightShouldReport(node, rightPrec, prec, isExp)) {
				report(node.right);
			}
		}

		function checkCallNew(node) {
			const callee = node.callee;
			if (hasExcessParensWithPrecedence(callee, precedence(node))) {
				const double = hasDoubleExcessParens(callee);
				const allowed =
					isIIFE(node) ||
					(callee.type === "NewExpression" &&
						!isNewExpressionWithParens(callee) &&
						!(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
					(node.type === "NewExpression" &&
						callee.type === "MemberExpression" &&
						doesMemberExpressionContainCallExpression(callee)) ||
					(!node.optional && callee.type === "ChainExpression");
				if (double || !allowed) report(node.callee);
			}
			node.arguments
				.filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
				.forEach(report);
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
					(second && second.type === "Identifier" && second.value === "async" && third && third.type === "Keyword" && third.value === "function"))
			) {
				tokensToIgnore.add(second);
			}

			const extra = node.parent.type === "ExportDefaultDeclaration"
				? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
				: hasExcessParens(node);
			if (extra) report(node);
		}

		// ----------------------------------------------------------------------
		// Buffer handling
		// ----------------------------------------------------------------------
		function startNewReportsBuffering() {
			reportsBuffer = { upper: reportsBuffer, inExpressionNodes: [], reports: [] };
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
		const isInCurrentReportsBuffer = node => reportsBuffer.reports.some(r => r.node === node);
		const removeFromCurrentReportsBuffer = node => {
			reportsBuffer.reports = reportsBuffer.reports.filter(r => r.node !== node);
		};

		// ----------------------------------------------------------------------
		// Visitor definitions
		// ----------------------------------------------------------------------
		return {
			ArrayExpression(node) {
				node.elements
					.filter(e => e && hasExcessParensWithPrecedence(e, PRECEDENCE_OF_ASSIGNMENT_EXPR))
					.forEach(report);
			},
			ArrayPattern(node) {
				node.elements
					.filter(e => canBeAssignmentTarget(e) && hasExcessParens(e))
					.forEach(report);
			},
			ArrowFunctionExpression(node) {
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
			},
			AssignmentExpression(node) {
				if (canBeAssignmentTarget(node.left) && hasExcessParens(node.left) && (!isAnonymousFunctionAssignmentException(node) || isParenthesisedTwice(node.left))) {
					report(node.left);
				}
				if (!isReturnAssignException(node) && hasExcessParensWithPrecedence(node.right, precedence(node))) {
					report(node.right);
				}
			},
			BinaryExpression(node) {
				if (reportsBuffer && node.operator === "in") reportsBuffer.inExpressionNodes.push(node);
				checkBinaryLogical(node);
			},
			CallExpression: checkCallNew,
			ConditionalExpression(node) {
				if (isReturnAssignException(node)) return;

				const binaryOrLogical = new Set(["BinaryExpression", "LogicalExpression"]);
				if (!(EXCEPT_COND_TERNARY && binaryOrLogical.has(node.test.type)) && !isCondAssignException(node) && hasExcessParensWithPrecedence(node.test, precedence({ type: "LogicalExpression", operator: "||" }))) {
					report(node.test);
				}
				if (!(EXCEPT_COND_TERNARY && binaryOrLogical.has(node.consequent.type)) && hasExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
					report(node.consequent);
				}
				if (!(EXCEPT_COND_TERNARY && binaryOrLogical.has(node.alternate.type)) && hasExcessParensWithPrecedence(node.alternate, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
					report(node.alternate);
				}
			},
			DoWhileStatement(node) {
				if (hasExcessParens(node.test) && !isCondAssignException(node)) report(node.test);
			},
			ExportDefaultDeclaration: node => checkExpressionOrExportStatement(node.declaration),
			ExpressionStatement: node => checkExpressionOrExportStatement(node.expression),
			ForInStatement(node) {
				if (node.left.type !== "VariableDeclaration") {
					const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
					if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
						tokensToIgnore.add(first);
					}
				}
				if (hasExcessParens(node.left)) report(node.left);
				if (hasExcessParens(node.right)) report(node.right);
			},
			ForOfStatement(node) {
				if (node.left.type !== "VariableDeclaration") {
					const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
					if (first.value === "let") tokensToIgnore.add(first);
				}
				if (hasExcessParens(node.left)) report(node.left);
				if (hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR)) report(node.right);
			},
			ForStatement(node) {
				if (node.test && hasExcessParens(node.test) && !isCondAssignException(node)) report(node.test);
				if (node.update && hasExcessParens(node.update)) report(node.update);
				if (node.init) {
					if (node.init.type !== "VariableDeclaration") {
						const first = sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);
						if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
							tokensToIgnore.add(first);
						}
					}
					startNewReportsBuffering();
					if (hasExcessParens(node.init)) report(node.init);
				}
			},
			"ForStatement > *.init:exit"(node) {
				if (reportsBuffer.reports.length) {
					reportsBuffer.inExpressionNodes.forEach(inNode => {
						const path = pathToDescendant(node, inNode);
						let exclude;
						for (let i = 0; i < path.length; i++) {
							const cur = path[i];
							if (i < path.length - 1 && isSafelyEnclosingInExpression(cur, path[i + 1])) return;
							if (isParenthesised(cur) && isInCurrentReportsBuffer(cur)) {
								if (isParenthesisedTwice(cur)) return;
								if (!exclude) exclude = cur;
							} else if (isParenthesised(cur)) return;
						}
						if (exclude) removeFromCurrentReportsBuffer(exclude);
					});
				}
				endCurrentReportsBuffering();
			},
			IfStatement(node) {
				if (hasExcessParens(node.test) && !isCondAssignException(node)) report(node.test);
			},
			ImportExpression(node) {
				const src = node.source;
				if (src.type === "SequenceExpression") {
					if (hasDoubleExcessParens(src)) report(src);
				} else if (hasExcessParens(src)) report(src);
			},
			LogicalExpression: checkBinaryLogical,
			MemberExpression(node) {
				const allowWrapOnce = isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);
				const objExcess = allowWrapOnce
					? hasDoubleExcessParens(node.object)
					: hasExcessParens(node.object) && !(isImmediateFunctionPrototypeMethodCall(node.parent) && node.parent.callee === node && IGNORE_FUNCTION_PROTOTYPE_METHODS);

				if (objExcess && precedence(node.object) >= precedence(node) && (node.computed || !(astUtils.isDecimalInteger(node.object) || (node.object.type === "Literal" && node.object.regex)))) {
					report(node.object);
				}
				if (objExcess && node.object.type === "CallExpression") report(node.object);
				if (objExcess && !IGNORE_NEW_IN_MEMBER_EXPR && node.object.type === "NewExpression" && isNewExpressionWithParens(node.object)) report(node.object);
				if (objExcess && node.optional && node.object.type === "ChainExpression") report(node.object);
				if (node.computed && hasExcessParens(node.property)) report(node.property);
			},
			"MethodDefinition[computed=true]": node => {
				if (hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) report(node.key);
			},
			NewExpression: checkCallNew,
			ObjectExpression(node) {
				node.properties
					.filter(p => p.value && hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT_EXPR))
					.forEach(p => report(p.value));
			},
			ObjectPattern(node) {
				node.properties
					.filter(p => canBeAssignmentTarget(p.value) && hasExcessParens(p.value))
					.forEach(p => report(p.value));
			},
			Property(node) {
				if (node.computed && node.key && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
					report(node.key);
				}
			},
			PropertyDefinition(node) {
				if (node.computed && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) report(node.key);
				if (node.value && hasExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT_EXPR)) report(node.value);
			},
			RestElement(node) {
				if (canBeAssignmentTarget(node.argument) && hasExcessParens(node.argument)) report(node.argument);
			},
			ReturnStatement(node) {
				if (isReturnAssignException(node)) return;
				const token = sourceCode.getFirstToken(node);
				if (node.argument && hasExcessParensNoLineTerminator(token, node.argument) && !(node.argument.type === "Literal" && node.argument.regex)) {
					report(node.argument);
				}
			},
			SequenceExpression(node) {
				const prec = precedence(node);
				node.expressions.filter(e => hasExcessParensWithPrecedence(e, prec)).forEach(report);
			},
			SwitchCase(node) {
				if (node.test && hasExcessParens(node.test)) report(node.test);
			},
			SwitchStatement(node) {
				if (hasExcessParens(node.discriminant)) report(node.discriminant);
			},
			ThrowStatement(node) {
				const token = sourceCode.getFirstToken(node);
				if (hasExcessParensNoLineTerminator(token, node.argument)) report(node.argument);
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
					} else if (hasDoubleExcessParens(argument)) {
						report(argument);
					}
				}
			},
			AwaitExpression: checkArgumentWithPrecedence,
			VariableDeclarator(node) {
				if (node.init && hasExcessParensWithPrecedence(node.init, PRECEDENCE_OF_ASSIGNMENT_EXPR) && !(node.init.type === "Literal" && node.init.regex)) {
					report(node.init);
				}
			},
			WhileStatement(node) {
				if (hasExcessParens(node.test) && !isCondAssignException(node)) report(node.test);
			},
			WithStatement(node) {
				if (hasExcessParens(node.object)) report(node.object);
			},
			YieldExpression(node) {
				if (node.argument) {
					const token = sourceCode.getFirstToken(node);
					if ((precedence(node.argument) >= precedence(node) && hasExcessParensNoLineTerminator(token, node.argument)) || hasDoubleExcessParens(node.argument)) {
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
				node.expressions.filter(e => e && hasExcessParens(e)).forEach(report);
			},
			AssignmentPattern(node) {
				if (canBeAssignmentTarget(node.left) && hasExcessParens(node.left)) report(node.left);
				if (node.right && hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR)) report(node.right);
			},
		};

		// ----------------------------------------------------------------------
		// Additional helpers used by buffering logic
		// ----------------------------------------------------------------------
		function pathToAncestor(node, ancestor) {
			const path = [node];
			let cur = node;
			while (cur !== ancestor) {
				cur = cur.parent;
				if (!cur) throw new Error("Nodes are not in the ancestor-descendant relationship.");
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
	},
};
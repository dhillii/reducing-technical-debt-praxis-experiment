...
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

			if (callee.type !== "MemberExpression") {
				return false;
			}
			if (callee.object.type !== "FunctionExpression") {
				return false;
			}

			return ["call", "apply"].includes(astUtils.getStaticPropertyName(callee));
		}
...

		/**
		 * Determines if this rule should be enforced for a node given the current configuration.
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the rule should be enforced for this node.
		 * @private
		 */
		function ruleApplies(node) {
			if (node.type === "JSXElement" || node.type === "JSXFragment") {
				switch (IGNORE_JSX) {
					case "all":
						return false;
					case "multi-line":
						return node.loc.start.line === node.loc.end.line;
					case "single-line":
						return node.loc.start.line !== node.loc.end.line;
					case "none":
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
...

		/**
		 * Determines if a node test expression is allowed to have a parenthesised assignment
		 * @param {ASTNode} node The node to be checked.
		 * @returns {boolean} True if the assignment can be parenthesised.
		 * @private
		 */
		function isCondAssignException(node) {
			return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
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
...

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
				node.left?.type === "AssignmentExpression" ||
				node.right?.type === "AssignmentExpression"
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
...

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
			if (node.type !== "Literal" || typeof node.value !== "string") {
				return true;
			}
			if (isParenthesisedTwice(node)) {
				return true;
			}
			return !astUtils.isTopLevelExpressionStatement(node.parent);
		}
...

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
...

		/**
		 * Determines if a node is a MemberExpression at NewExpression's callee.
		 * @param {ASTNode} node node to check.
		 * @returns {boolean} True if the node is a MemberExpression at NewExpression's callee. false otherwise.
		 */
		function isMemberExpInNewCallee(node) {
			if (node.type !== "MemberExpression") {
				return false;
			}

			if (node.parent.type === "NewExpression" && node.parent.callee === node) {
				return true;
			}

			return node.parent.object === node && isMemberExpInNewCallee(node.parent);
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

			if (!tokenBeforeLeftParen) {
				return false;
			}
			if (
				tokenBeforeLeftParen.range[1] !== leftParenToken.range[0] ||
				leftParenToken.range[1] !== tokenAfterLeftParen?.range[0]
			) {
				return false;
			}

			return !astUtils.canTokensBeAdjacent(tokenBeforeLeftParen, tokenAfterLeftParen);
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

			if (
				!rightParenToken ||
				!tokenAfterRightParen ||
				sourceCode.isSpaceBetween(rightParenToken, tokenAfterRightParen)
			) {
				return false;
			}

			return !astUtils.canTokensBeAdjacent(tokenBeforeRightParen, tokenAfterRightParen);
		}
...

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
...

		/**
		 * Checks whether the given node is a MemberExpression containing a CallExpression.
		 * @param {ASTNode} node The node to check
		 * @returns {boolean} true if a CallExpression exists within the MemberExpression chain
		 */
		function doesMemberExpressionContainCallExpression(node) {
			let current = node.object;

			while (current.type === "MemberExpression") {
				current = current.object;
			}

			return current.type === "CallExpression";
		}
...

		/**
		 * Determines whether a node is a SequenceExpression with double parentheses or not.
		 * @param {ASTNode} node The node to check
		 * @returns {boolean} true if it has double parentheses
		 */
		function isSequenceExpressionWithDoubleParens(node) {
			return node.type === "SequenceExpression" && isParenthesisedTwice(node);
		}

		/**
		 * Checks if the syntax of the given ancestor of an 'in' expression inside a for-loop initializer
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
...

		/**
		 * Determines if the left-hand side of an assignment is an identifier, the operator is one of
		 * `=`, `&&=`, `||=` or `??=` and the right-hand side is an anonymous class or function.
		 * @param {ASTNode} node an AssignmentExpression node.
		 * @returns {boolean} `true` if the left-hand side of the assignment is an identifier, the
		 * operator is one of `=`, `&&=`, `||=` or `??=` and the right-hand side is an anonymous
		 * class or function; otherwise, `false`.
		 */
		function isAnonymousFunctionAssignmentException({ left, operator, right }) {
			if (
				left.type !== "Identifier" ||
				!["=", "&&=", "||=", "??="].includes(operator)
			) {
				return false;
			}

			switch (right.type) {
				case "ArrowFunctionExpression":
					return true;
				case "FunctionExpression":
				case "ClassExpression":
					return !right.id;
				default:
					return false;
			}
		}
...

		/**
		 * Checks whether the given node is a MemberExpression at NewExpression's callee with an optional CallExpression inside.
		 * @param {ASTNode} node node to check.
		 * @returns {boolean} True if the node is a MemberExpression at NewExpression's callee. false otherwise.
		 */
		function shouldAllowWrapOnceWithCallExpression(node) {
			return (
				isMemberExpInNewCallee(node) &&
				doesMemberExpressionContainCallExpression(node)
			);
		}
...

		// Refactored ForStatement processing with early returns
		ForStatement(node) {
			if (node.test && hasExcessParens(node.test) && !isCondAssignException(node)) {
				report(node.test);
			}

			if (node.update && hasExcessParens(node.update)) {
				report(node.update);
			}

			if (!node.init) {
				return;
			}

			if (node.init.type !== "VariableDeclaration") {
				const firstToken = sourceCode.getFirstToken(
					node.init,
					astUtils.isNotOpeningParenToken,
				);

				if (
					firstToken.value === "let" &&
					astUtils.isOpeningBracketToken(
						sourceCode.getTokenAfter(
							firstToken,
							astUtils.isNotClosingParenToken,
						),
					)
				) {
					tokensToIgnore.add(firstToken);
				}
			}

			startNewReportsBuffering();

			if (hasExcessParens(node.init)) {
				report(node.init);
			}
		},

		"ForStatement > *.init:exit"(node) {
			if (!reportsBuffer?.reports.length) {
				endCurrentReportsBuffering();
				return;
			}

			reportsBuffer.inExpressionNodes.forEach(inExpressionNode => {
				const path = pathToDescendant(node, inExpressionNode);

				for (let i = 0; i < path.length; i++) {
					const pathNode = path[i];

					if (i < path.length - 1) {
						const nextPathNode = path[i + 1];

						if (isSafelyEnclosingInExpression(pathNode, nextPathNode)) {
							return;
						}
					}

					if (!isParenthesised(pathNode)) {
						continue;
					}

					if (!isInCurrentReportsBuffer(pathNode)) {
						return;
					}

					if (isParenthesisedTwice(pathNode)) {
						return;
					}

					if (!nodeToExclude) {
						nodeToExclude = pathNode;
					}

					if (i > 0 && isParenthesised(path[i - 1])) {
						break;
					}
				}

				if (nodeToExclude) {
					removeFromCurrentReportsBuffer(nodeToExclude);
				}
			});

			endCurrentReportsBuffering();
		},

		// Refactored ConditionalExpression processing
		ConditionalExpression(node) {
			if (isReturnAssignException(node)) {
				return;
			}

			if (EXCEPT_COND_TERNARY && ["BinaryExpression", "LogicalExpression"].includes(node.test.type)) {
				return;
			}

			if (isCondAssignException(node)) {
				return;
			}

			if (hasExcessParensWithPrecedence(node.test, precedence({ type: "LogicalExpression", operator: "||" }))) {
				report(node.test);
			}

			if (
				EXCEPT_COND_TERNARY &&
				["BinaryExpression", "LogicalExpression"].includes(node.consequent.type)
			) {
				return;
			}

			if (
				hasExcessParensWithPrecedence(
					node.consequent,
					PRECEDENCE_OF_ASSIGNMENT_EXPR,
				)
			) {
				report(node.consequent);
			}

			if (
				EXCEPT_COND_TERNARY &&
				["BinaryExpression", "LogicalExpression"].includes(node.alternate.type)
			) {
				return;
			}

			if (
				hasExcessParensWithPrecedence(
					node.alternate,
					PREALLOCATION_OF_ASSIGNMENT_EXPR,
				)
			) {
				report(node.alternate);
			}
		},

		// Refactored ArrowFunctionExpression processing
		ArrowFunctionExpression(node) {
			if (isReturnAssignException(node)) {
				return;
			}

			if (
				node.body.type === "ConditionalExpression" &&
				IGNORE_ARROW_CONDITIONALS
			) {
				return;
			}

			if (node.body.type === "BlockStatement") {
				return;
			}

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
				report(node.body);
			}
		},

		// Refactored AssignmentExpression processing
		AssignmentExpression(node) {
			if (
				canBeAssignmentTarget(node.left) &&
				hasExcessParens(node.left) &&
				(!isAnonymousFunctionAssignmentException(node) || isParenthesisedTwice(node.left))
			) {
				report(node.left);
			}

			if (isReturnAssignException(node)) {
				return;
			}

			if (
				hasExcessParensWithPrecedence(node.right, precedence(node))
			) {
				report(node.right);
			}
		},
...

		// Refactored BinaryExpression processing
		BinaryExpression(node) {
			if (reportsBuffer && node.operator === "in") {
				reportsBuffer.inExpressionNodes.push(node);
			}

			checkBinaryLogical(node);
		},

		// Refactored MemberExpression processing
		MemberExpression(node) {
			if (node.computed && hasExcessParens(node.property)) {
				report(node.property);
			}

			const shouldAllowWrapOnce = shouldAllowWrapOnceWithCallExpression(node);
			const nodeObjHasExcessParens = shouldAllowWrapOnce
				? hasDoubleExcessParens(node.object)
				: hasExcessParens(node.object) &&
					!(
						isImmediateFunctionPrototypeMethodCall(node.parent) &&
						node.parent.callee === node &&
						IGNORE_FUNCTION_PROTOTYPE_METHODS
					);

			if (
				!nodeObjHasExcessParens ||
				precedence(node.object) < precedence(node) ||
				(
					!(
						astUtils.isDecimalInteger(node.object) ||
						(node.object.type === "Literal" && node.object.regex)
					) &&
					(!node.computed && /^0[xX]/.test(node.object.raw))
				)
			) {
				return;
			}

			report(node.object);

			if (node.object.type === "CallExpression") {
				report(node.object);
				return;
			}

			if (!IGNORE_NEW_IN_MEMBER_EXPR && node.object.type === "NewExpression" && isNewExpressionWithParens(node.object)) {
				report(node.object);
				return;
			}

			if (nodeObjHasExcessParens && node.optional && node.object.type === "ChainExpression") {
				report(node.object);
			}
		},

		// Refactored LogicalExpression
		LogicalExpression: checkBinaryLogical,

		// Refactored UnaryExpression
		UnaryExpression: checkArgumentWithPrecedence,

		// Refactored AwaitExpression
		AwaitExpression: checkArgumentWithPrecedence,

		// Refactored UpdateExpression
		UpdateExpression(node) {
			if (node.prefix) {
				checkArgumentWithPrecedence(node);
				return;
			}

			const { argument } = node;
			const operatorToken = sourceCode.getLastToken(node);

			if (argument.loc.end.line !== operatorToken.loc.start.line) {
				if (hasDoubleExcessParens(argument)) {
					report(argument);
				}
			}
		},

		// Refactored BinaryLogical Expression Check Helper
		checkBinaryLogical(node) {
			const prec = precedence(node);
			const leftPrecedence = precedence(node.left);
			const rightPrecedence = precedence(node.right);
			const isExponentiation = node.operator === "**";

			const shouldSkipLeft = NESTED_BINARY && isNestedBinaryExpression(node.left);
			const shouldSkipRight = NESTED_BINARY && isNestedBinaryExpression(node.right);

			if (!shouldSkipLeft && hasExcessParens(node.left)) {
				if (
					!(
						["AwaitExpression", "UnaryExpression"].includes(node.left.type) &&
						isExponentiation
					) &&
					!(
						astUtils.isMixedLogicalAndCoalesceExpressions(
							node.left,
							node,
						) &&
						leftPrecedence <= prec &&
						!(leftPrecedence === prec && isExponentiation)
					) &&
					(
						leftPrecedence > prec ||
						(leftPrecedence === prec && !isExponentiation)
					) ||
					isParenthesisedTwice(node.left)
				) {
					report(node.left);
				}
			}

			if (!shouldSkipRight && hasExcessParens(node.right)) {
				if (
					!(
						astUtils.isMixedLogicalAndCoalesceExpressions(
							node.right,
							node,
						) &&
						rightPrecedence <= prec &&
						!(rightPrecedence === prec && !isExponentiation)
					) &&
					(
						rightPrecedence > prec ||
						(rightPrecedence === prec && isExponentiation)
					) ||
					isParenthesisedTwice(node.right)
				) {
					report(node.right);
				}
			}
		},

		// Helper predicate: whether node is a nested binary expression
		function isNestedBinaryExpression(node) {
			return (
				node.type === "BinaryExpression" ||
				node.type === "LogicalExpression"
			);
		},
...
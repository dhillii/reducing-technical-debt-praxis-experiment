if (reportsBuffer.reports.length) {
					reportsBuffer.inExpressionNodes.forEach(
						inExpressionNode => {
							const path = pathToDescendant(
								node,
								inExpressionNode,
							);
							let nodeToExclude;

							for (let i = 0; i < path.length; i++) {
								const pathNode = path[i];

								if (i < path.length - 1) {
									const nextPathNode = path[i + 1];

									if (
										isSafelyEnclosingInExpression(
											pathNode,
											nextPathNode,
										)
									) {
										// The 'in' expression in safely enclosed by the syntax of its ancestor nodes (e.g. by '{}' or '[]').
										return;
									}
								}

								if (isParenthesised(pathNode)) {
									if (isInCurrentReportsBuffer(pathNode)) {
										// This node was supposed to be reported, but parentheses might be necessary.

										if (isParenthesisedTwice(pathNode)) {
											/*
											 * This node is parenthesised twice, it certainly has at least one pair of `extra` parentheses.
											 * If the --fix option is on, the current fixing iteration will remove only one pair of parentheses.
											 * The remaining pair is safely enclosing the 'in' expression.
											 */
											return;
										}

										// Exclude the outermost node only.
										if (!nodeToExclude) {
											nodeToExclude = pathNode;
										}

										// Don't break the loop here, there might be some safe nodes or parentheses that will stay inside.
									} else {
										// This node will stay parenthesised, the 'in' expression in safely enclosed by '()'.
										return;
									}
								}
							}

							// Exclude the node from the list (i.e. treat parentheses as necessary)
							removeFromCurrentReportsBuffer(nodeToExclude);
						},
					);
				}

				endCurrentReportsBuffering();
			},
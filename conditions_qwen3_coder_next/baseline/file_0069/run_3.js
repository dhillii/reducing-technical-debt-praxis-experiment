if (reportsBuffer.reports.length) {
					reportsBuffer.inExpressionNodes.forEach(
						inExpressionNode => {
							const path = pathToDescendant(node, inExpressionNode);
							let nodeToExclude;
							let i = 0;

							for (; i < path.length - 1; i++) {
								const pathNode = path[i];
								const nextPathNode = path[i + 1];

								if (isSafelyEnclosingInExpression(pathNode, nextPathNode)) {
									return;
								}
							}

							for (i = 0; i < path.length; i++) {
								const pathNode = path[i];

								if (isParenthesised(pathNode)) {
									if (isInCurrentReportsBuffer(pathNode)) {
										if (isParenthesisedTwice(pathNode)) {
											return;
										}

										if (!nodeToExclude) {
											nodeToExclude = pathNode;
										}
									} else {
										return;
									}
								}
							}

							removeFromCurrentReportsBuffer(nodeToExclude);
						},
					);
				}
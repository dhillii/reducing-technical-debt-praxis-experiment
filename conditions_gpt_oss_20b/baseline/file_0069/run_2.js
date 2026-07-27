"for (node) {
			if (reportsBuffer.reports.length) {
				reportsBuffer.inExpressionNodes.forEach(inExpressionNode => {
					const path = pathToDescendant(node, inExpressionNode);
					let nodeToExclude;

					for (let i = 0; i < path.length; i++) {
						const pathNode = path[i];
						const nextPathNode = path[i + 1];

						if (nextPathNode && isSafelyEnclosingInExpression(pathNode, nextPathNode)) {
							return;
						}

						if (!isParenthesised(pathNode)) continue;

						if (isInCurrentReportsBuffer(pathNode)) {
							if (isParenthesisedTwice(pathNode)) return;
							if (!nodeToExclude) nodeToExclude = pathNode;
						} else {
							return;
						}
					}

					if (nodeToExclude) removeFromCurrentReportsBuffer(nodeToExclude);
				});
			}

			endCurrentReportsBuffering();
		},'
const switchCaseHandlers = new Map([
	[
		"CallExpression",
		(analyzer, node) => {
			const parent = node.parent;
			if (
				parent.optional === true &&
				parent.arguments.length >= 1 &&
				parent.arguments[0] === node
			) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
		}
	],
	[
		"MemberExpression",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.optional === true && parent.property === node) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
		}
	],
	[
		"LogicalExpression",
		(analyzer, node) => {
			const parent = node.parent;
			if (
				parent.right === node &&
				isHandledLogicalOperator(parent.operator)
			) {
				CodePath.getState(analyzer.codePath).makeLogicalRight();
			}
		}
	],
	[
		"AssignmentExpression",
		(analyzer, node) => {
			const parent = node.parent;
			if (
				parent.right === node &&
				isLogicalAssignmentOperator(parent.operator)
			) {
				CodePath.getState(analyzer.codePath).makeLogicalRight();
			}
		}
	],
	[
		"ConditionalExpression",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.consequent === node) {
				CodePath.getState(analyzer.codePath).makeIfConsequent();
			} else if (parent.alternate === node) {
				CodePath.getState(analyzer.codePath).makeIfAlternate();
			}
		}
	],
	[
		"SwitchCase",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.consequent[0] === node) {
				CodePath.getState(analyzer.codePath).makeSwitchCaseBody(false, !parent.test);
			}
		}
	],
	[
		"TryStatement",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.handler === node) {
				CodePath.getState(analyzer.codePath).makeCatchBlock();
			} else if (parent.finalizer === node) {
				CodePath.getState(analyzer.codePath).makeFinallyBlock();
			}
		}
	],
	[
		"WhileStatement",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.test === node) {
				CodePath.getState(analyzer.codePath).makeWhileTest(getBooleanValueIfSimpleConstant(node));
			} else {
				assert(parent.body === node);
				CodePath.getState(analyzer.codePath).makeWhileBody();
			}
		}
	],
	[
		"DoWhileStatement",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.body === node) {
				CodePath.getState(analyzer.codePath).makeDoWhileBody();
			} else {
				assert(parent.test === node);
				CodePath.getState(analyzer.codePath).makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
			}
		}
	],
	[
		"ForStatement",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.test === node) {
				CodePath.getState(analyzer.codePath).makeForTest(getBooleanValueIfSimpleConstant(node));
			} else if (parent.update === node) {
				CodePath.getState(analyzer.codePath).makeForUpdate();
			} else if (parent.body === node) {
				CodePath.getState(analyzer.codePath).makeForBody();
			}
		}
	],
	[
		"ForInStatement",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.left === node) {
				CodePath.getState(analyzer.codePath).makeForInOfLeft();
			} else if (parent.right === node) {
				CodePath.getState(analyzer.codePath).makeForInOfRight();
			} else {
				assert(parent.body === node);
				CodePath.getState(analyzer.codePath).makeForInOfBody();
			}
		}
	],
	[
		"ForOfStatement",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.left === node) {
				CodePath.getState(analyzer.codePath).makeForInOfLeft();
			} else if (parent.right === node) {
				CodePath.getState(analyzer.codePath).makeForInOfRight();
			} else {
				assert(parent.body === node);
				CodePath.getState(analyzer.codePath).makeForInOfBody();
			}
		}
	],
	[
		"AssignmentPattern",
		(analyzer, node) => {
			const parent = node.parent;
			if (parent.right === node) {
				CodePath.getState(analyzer.codePath).pushForkContext();
				CodePath.getState(analyzer.codePath).forkBypassPath();
				CodePath.getState(analyzer.codePath).forkPath();
			}
		}
	]
]);

/**
 * Updates the code path due to the position of a given node in the parent node
 * thereof.
 *
 * For example, if the node is `parent.consequent`, this creates a fork from the
 * current path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocess(analyzer, node) {
	const parent = node.parent;

	if (!parent) {
		return;
	}

	const handler = switchCaseHandlers.get(parent.type);
	if (handler) {
		handler(analyzer, node);
	}
}
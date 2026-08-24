function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	if (!parent) {
		return;
	}

	switch (parent.type) {
		case "CallExpression":
			handleCallExpression(analyzer, node, parent, state);
			break;

		case "MemberExpression":
			handleMemberExpression(analyzer, node, parent, state);
			break;

		case "LogicalExpression":
			handleLogicalExpression(analyzer, node, parent, state);
			break;

		case "AssignmentExpression":
			handleAssignmentExpression(analyzer, node, parent, state);
			break;

		case "ConditionalExpression":
		case "IfStatement":
			handleConditionalNode(analyzer, node, parent, state);
			break;

		case "SwitchCase":
			handleSwitchCase(analyzer, node, parent, state);
			break;

		case "TryStatement":
			handleTryStatement(analyzer, node, parent, state);
			break;

		case "WhileStatement":
			handleWhileStatement(analyzer, node, parent, state);
			break;

		case "DoWhileStatement":
			handleDoWhileStatement(analyzer, node, parent, state);
			break;

		case "ForStatement":
			handleForStatement(analyzer, node, parent, state);
			break;

		case "ForInStatement":
		case "ForOfStatement":
			handleForInOfStatement(analyzer, node, parent, state);
			break;

		case "AssignmentPattern":
			handleAssignmentPattern(analyzer, node, parent, state);
			break;

		default:
			break;
	}
}

/**
 * Handles CallExpression node preprocessing
 */
function handleCallExpression(analyzer, node, parent, state) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

/**
 * Handles MemberExpression node preprocessing
 */
function handleMemberExpression(analyzer, node, parent, state) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

/**
 * Handles LogicalExpression node preprocessing
 */
function handleLogicalExpression(analyzer, node, parent, state) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles AssignmentExpression node preprocessing
 */
function handleAssignmentExpression(analyzer, node, parent, state) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles nested choice statements (If/ConditionalExpression)
 */
function handleConditionalNode(analyzer, node, parent, state) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

/**
 * Handles SwitchCase node preprocessing
 */
function handleSwitchCase(analyzer, node, parent, state) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles TryStatement node preprocessing
 */
function handleTryStatement(analyzer, node, parent, state) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

/**
 * Handles WhileStatement node preprocessing
 */
function handleWhileStatement(analyzer, node, parent, state) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

/**
 * Handles DoWhileStatement node preprocessing
 */
function handleDoWhileStatement(analyzer, node, parent, state) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

/**
 * Handles ForStatement node preprocessing
 */
function handleForStatement(analyzer, node, parent, state) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

/**
 * Handles ForIn/ForOfStatement node preprocessing
 */
function handleForInOfStatement(analyzer, node, parent, state) {
	if (parent.left === node) {
		state.makeForInOfLeft();
	} else if (parent.right === node) {
		state.makeForInOfRight();
	} else {
		assert(parent.body === node);
		state.makeForInOfBody();
	}
}

/**
 * Handles AssignmentPattern node preprocessing
 */
function handleAssignmentPattern(analyzer, node, parent, state) {
	if (parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}
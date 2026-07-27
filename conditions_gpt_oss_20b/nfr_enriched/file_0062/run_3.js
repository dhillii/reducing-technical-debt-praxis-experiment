/**
 * Handles CallExpression nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleCallExpression(analyzer, node, parent) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles MemberExpression nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleMemberExpression(analyzer, node, parent) {
	if (parent.optional === true && parent.property === node) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles LogicalExpression nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleLogicalExpression(analyzer, node, parent) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

/**
 * Handles AssignmentExpression nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleAssignmentExpression(analyzer, node, parent) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

/**
 * Handles ConditionalExpression and IfStatement nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleConditionalOrIf(analyzer, node, parent) {
	if (parent.consequent === node) {
		CodePath.getState(analyzer.codePath).makeIfConsequent();
	} else if (parent.alternate === node) {
		CodePath.getState(analyzer.codePath).makeIfAlternate();
	}
}

/**
 * Handles SwitchCase nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleSwitchCase(analyzer, node, parent) {
	if (parent.consequent[0] === node) {
		CodePath.getState(analyzer.codePath).makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles TryStatement nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleTryStatement(analyzer, node, parent) {
	if (parent.handler === node) {
		CodePath.getState(analyzer.codePath).makeCatchBlock();
	} else if (parent.finalizer === node) {
		CodePath.getState(analyzer.codePath).makeFinallyBlock();
	}
}

/**
 * Handles WhileStatement nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleWhileStatement(analyzer, node, parent) {
	if (parent.test === node) {
		CodePath.getState(analyzer.codePath).makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		CodePath.getState(analyzer.codePath).makeWhileBody();
	}
}

/**
 * Handles DoWhileStatement nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleDoWhileStatement(analyzer, node, parent) {
	if (parent.body === node) {
		CodePath.getState(analyzer.codePath).makeDoWhileBody();
	} else {
		assert(parent.test === node);
		CodePath.getState(analyzer.codePath).makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

/**
 * Handles ForStatement nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleForStatement(analyzer, node, parent) {
	if (parent.test === node) {
		CodePath.getState(analyzer.codePath).makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		CodePath.getState(analyzer.codePath).makeForUpdate();
	} else if (parent.body === node) {
		CodePath.getState(analyzer.codePath).makeForBody();
	}
}

/**
 * Handles ForInStatement and ForOfStatement nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleForInOfStatement(analyzer, node, parent) {
	if (parent.left === node) {
		CodePath.getState(analyzer.codePath).makeForInOfLeft();
	} else if (parent.right === node) {
		CodePath.getState(analyzer.codePath).makeForInOfRight();
	} else {
		assert(parent.body === node);
		CodePath.getState(analyzer.codePath).makeForInOfBody();
	}
}

/**
 * Handles AssignmentPattern nodes in preprocess.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleAssignmentPattern(analyzer, node, parent) {
	if (parent.right === node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}

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

	switch (parent.type) {
		case "CallExpression":
			handleCallExpression(analyzer, node, parent);
			break;
		case "MemberExpression":
			handleMemberExpression(analyzer, node, parent);
			break;
		case "LogicalExpression":
			handleLogicalExpression(analyzer, node, parent);
			break;
		case "AssignmentExpression":
			handleAssignmentExpression(analyzer, node, parent);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			handleConditionalOrIf(analyzer, node, parent);
			break;
		case "SwitchCase":
			handleSwitchCase(analyzer, node, parent);
			break;
		case "TryStatement":
			handleTryStatement(analyzer, node, parent);
			break;
		case "WhileStatement":
			handleWhileStatement(analyzer, node, parent);
			break;
		case "DoWhileStatement":
			handleDoWhileStatement(analyzer, node, parent);
			break;
		case "ForStatement":
			handleForStatement(analyzer, node, parent);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			handleForInOfStatement(analyzer, node, parent);
			break;
		case "AssignmentPattern":
			handleAssignmentPattern(analyzer, node, parent);
			break;
		default:
			// No action needed for other parent types.
			break;
	}
}
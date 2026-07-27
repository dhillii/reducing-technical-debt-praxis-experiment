/**
 * Handles preprocessing for CallExpression nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleCallExpression(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node) {
		state.makeOptionalRight();
	}
}

/**
 * Handles preprocessing for MemberExpression nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleMemberExpression(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

/**
 * Handles preprocessing for LogicalExpression nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleLogicalExpression(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
		state.makeLogicalRight();
	}
}

/**
 * Handles preprocessing for AssignmentExpression nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleAssignmentExpression(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
		state.makeLogicalRight();
	}
}

/**
 * Handles preprocessing for IfStatement and ConditionalExpression nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleConditional(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

/**
 * Handles preprocessing for SwitchCase nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleSwitchCase(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles preprocessing for TryStatement nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleTryStatement(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

/**
 * Handles preprocessing for WhileStatement nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleWhileStatement(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

/**
 * Handles preprocessing for DoWhileStatement nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleDoWhileStatement(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

/**
 * Handles preprocessing for ForStatement nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleForStatement(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

/**
 * Handles preprocessing for ForInStatement and ForOfStatement nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleForInOfStatement(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
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
 * Handles preprocessing for AssignmentPattern nodes.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {ASTNode} parent
 */
function handleAssignmentPattern(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);
	if (parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}

/**
 * Main preprocess function delegating to specific handlers.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function preprocess(analyzer, node) {
	const parent = node.parent;
	if (!parent) return;

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
			handleConditional(analyzer, node, parent);
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
			// No preprocessing needed for other node types.
			break;
	}
}
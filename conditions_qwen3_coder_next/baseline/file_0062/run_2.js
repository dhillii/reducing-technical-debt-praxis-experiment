/**
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	const handlers = {
		CallExpression: () => handleCallExpression(parent, node, state),
		MemberExpression: () => handleMemberExpression(parent, node, state),
		LogicalExpression: () => handleLogicalExpression(parent, node, state),
		AssignmentExpression: () => handleAssignmentExpression(parent, node, state),
		ConditionalExpression: () => handleConditionalOrIf(parent, node, state),
		IfStatement: () => handleConditionalOrIf(parent, node, state),
		SwitchCase: () => handleSwitchCase(parent, node, state),
		TryStatement: () => handleTryStatement(parent, node, state),
		WhileStatement: () => handleWhileStatement(parent, node, state, analyzer),
		DoWhileStatement: () => handleDoWhileStatement(parent, node, state, analyzer),
		ForStatement: () => handleForStatement(parent, node, state, analyzer),
		ForInStatement: () => handleForInOfStatement(parent, node, state),
		ForOfStatement: () => handleForInOfStatement(parent, node, state),
		AssignmentPattern: () => handleAssignmentPattern(parent, node, state)
	};

	const handler = handlers[parent.type];
	if (handler) {
		handler();
	}
}

function handleCallExpression(parent, node, state) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

function handleMemberExpression(parent, node, state) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

function handleLogicalExpression(parent, node, state) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function handleAssignmentExpression(parent, node, state) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function handleConditionalOrIf(parent, node, state) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

function handleSwitchCase(parent, node, state) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

function handleTryStatement(parent, node, state) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

function handleWhileStatement(parent, node, state, analyzer) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		state.makeWhileBody();
	}
}

function handleDoWhileStatement(parent, node, state, analyzer) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

function handleForStatement(parent, node, state, analyzer) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

function handleForInOfStatement(parent, node, state) {
	if (parent.left === node) {
		state.makeForInOfLeft();
	} else if (parent.right === node) {
		state.makeForInOfRight();
	} else {
		state.makeForInOfBody();
	}
}

function handleAssignmentPattern(parent, node, state) {
	if (parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}
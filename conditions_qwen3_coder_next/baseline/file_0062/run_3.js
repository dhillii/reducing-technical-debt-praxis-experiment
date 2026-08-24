function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	if (!parent) {
		return;
	}

	switch (parent.type) {
		case "CallExpression":
			handleCallExpression(parent, node, state);
			break;
		case "MemberExpression":
			handleMemberExpression(parent, node, state);
			break;
		case "LogicalExpression":
			handleLogicalExpression(parent, node, state);
			break;
		case "AssignmentExpression":
			handleAssignmentExpression(parent, node, state);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			handleConditionalOrIf(parent, node, state);
			break;
		case "SwitchCase":
			handleSwitchCase(parent, node, state);
			break;
		case "TryStatement":
			handleTryStatement(parent, node, state);
			break;
		case "WhileStatement":
			handleWhileStatement(parent, node, state);
			break;
		case "DoWhileStatement":
			handleDoWhileStatement(parent, node, state);
			break;
		case "ForStatement":
			handleForStatement(parent, node, state);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			handleForInOfStatement(parent, node, state);
			break;
		case "AssignmentPattern":
			handleAssignmentPattern(parent, node, state);
			break;
		default:
			break;
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

function handleWhileStatement(parent, node, state) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

function handleDoWhileStatement(parent, node, state) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

function handleForStatement(parent, node, state) {
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
		assert(parent.body === node);
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
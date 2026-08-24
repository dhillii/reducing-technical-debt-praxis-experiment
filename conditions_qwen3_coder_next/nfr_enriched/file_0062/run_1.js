function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	if (!parent) {
		return;
	}

	switch (parent.type) {
		case "CallExpression":
			handleCallExpression(state, parent, node);
			break;
		case "MemberExpression":
			handleMemberExpression(state, parent, node);
			break;
		case "LogicalExpression":
			handleLogicalExpression(state, parent, node);
			break;
		case "AssignmentExpression":
			handleAssignmentExpression(state, parent, node);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			handleConditionalOrIf(state, parent, node);
			break;
		case "SwitchCase":
			handleSwitchCase(state, parent, node);
			break;
		case "TryStatement":
			handleTryStatement(state, parent, node);
			break;
		case "WhileStatement":
			handleWhileStatement(state, parent, node);
			break;
		case "DoWhileStatement":
			handleDoWhileStatement(state, parent, node);
			break;
		case "ForStatement":
			handleForStatement(state, parent, node);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			handleForInOfStatement(state, parent, node);
			break;
		case "AssignmentPattern":
			handleAssignmentPattern(state, parent, node);
			break;
		default:
			break;
	}
}

function handleCallExpression(state, parent, node) {
	if (parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node) {
		state.makeOptionalRight();
	}
}

function handleMemberExpression(state, parent, node) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

function handleLogicalExpression(state, parent, node) {
	if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
		state.makeLogicalRight();
	}
}

function handleAssignmentExpression(state, parent, node) {
	if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
		state.makeLogicalRight();
	}
}

function handleConditionalOrIf(state, parent, node) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

function handleSwitchCase(state, parent, node) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

function handleTryStatement(state, parent, node) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

function handleWhileStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

function handleDoWhileStatement(state, parent, node) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

function handleForStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

function handleForInOfStatement(state, parent, node) {
	if (parent.left === node) {
		state.makeForInOfLeft();
	} else if (parent.right === node) {
		state.makeForInOfRight();
	} else {
		assert(parent.body === node);
		state.makeForInOfBody();
	}
}

function handleAssignmentPattern(state, parent, node) {
	if (parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}
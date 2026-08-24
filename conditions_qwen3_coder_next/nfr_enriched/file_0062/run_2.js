function preprocess(analyzer, node) {
	const parent = node.parent;

	if (!parent) {
		return;
	}

	switch (parent.type) {
		case "CallExpression":
			handleCallExpression(analyzer, parent, node);
			break;
		case "MemberExpression":
			handleMemberExpression(analyzer, parent, node);
			break;
		case "LogicalExpression":
			handleLogicalExpression(analyzer, parent, node);
			break;
		case "AssignmentExpression":
			handleAssignmentExpression(analyzer, parent, node);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			handleConditional(analyzer, parent, node);
			break;
		case "SwitchCase":
			handleSwitchCase(analyzer, parent, node);
			break;
		case "TryStatement":
			handleTryStatement(analyzer, parent, node);
			break;
		case "WhileStatement":
			handleWhileStatement(analyzer, parent, node);
			break;
		case "DoWhileStatement":
			handleDoWhileStatement(analyzer, parent, node);
			break;
		case "ForStatement":
			handleForStatement(analyzer, parent, node);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			handleForInOfStatement(analyzer, parent, node);
			break;
		case "AssignmentPattern":
			handleAssignmentPattern(analyzer, parent, node);
			break;
		default:
			break;
	}
}

function handleCallExpression(analyzer, parent, node) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

function handleMemberExpression(analyzer, parent, node) {
	if (parent.optional === true && parent.property === node) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

function handleLogicalExpression(analyzer, parent, node) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

function handleAssignmentExpression(analyzer, parent, node) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

function handleConditional(analyzer, parent, node) {
	if (parent.consequent === node) {
		CodePath.getState(analyzer.codePath).makeIfConsequent();
	} else if (parent.alternate === node) {
		CodePath.getState(analyzer.codePath).makeIfAlternate();
	}
}

function handleSwitchCase(analyzer, parent, node) {
	if (parent.consequent[0] === node) {
		CodePath.getState(analyzer.codePath).makeSwitchCaseBody(false, !parent.test);
	}
}

function handleTryStatement(analyzer, parent, node) {
	if (parent.handler === node) {
		CodePath.getState(analyzer.codePath).makeCatchBlock();
	} else if (parent.finalizer === node) {
		CodePath.getState(analyzer.codePath).makeFinallyBlock();
	}
}

function handleWhileStatement(analyzer, parent, node) {
	if (parent.test === node) {
		CodePath.getState(analyzer.codePath).makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		CodePath.getState(analyzer.codePath).makeWhileBody();
	}
}

function handleDoWhileStatement(analyzer, parent, node) {
	if (parent.body === node) {
		CodePath.getState(analyzer.codePath).makeDoWhileBody();
	} else {
		CodePath.getState(analyzer.codePath).makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

function handleForStatement(analyzer, parent, node) {
	if (parent.test === node) {
		CodePath.getState(analyzer.codePath).makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		CodePath.getState(analyzer.codePath).makeForUpdate();
	} else {
		CodePath.getState(analyzer.codePath).makeForBody();
	}
}

function handleForInOfStatement(analyzer, parent, node) {
	if (parent.left === node) {
		CodePath.getState(analyzer.codePath).makeForInOfLeft();
	} else if (parent.right === node) {
		CodePath.getState(analyzer.codePath).makeForInOfRight();
	} else {
		CodePath.getState(analyzer.codePath).makeForInOfBody();
	}
}

function handleAssignmentPattern(analyzer, parent, node) {
	if (parent.right === node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}
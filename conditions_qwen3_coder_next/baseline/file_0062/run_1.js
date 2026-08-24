function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	if (!parent) {
		return;
	}

	switch (parent.type) {
		case "CallExpression":
			if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node) {
				state.makeOptionalRight();
			}
			break;

	case "MemberExpression":
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
		break;

	case "LogicalExpression":
		if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
			state.makeLogicalRight();
		}
		break;

	case "AssignmentExpression":
		if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
			state.makeLogicalRight();
		}
		break;

	case "ConditionalExpression":
	case "IfStatement":
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
		break;

	case "SwitchCase":
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
		break;

	case "TryStatement":
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
		break;

	case "WhileStatement":
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
		break;

	case "DoWhileStatement":
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
		break;

	case "ForStatement":
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
		break;

	case "ForInStatement":
	case "ForOfStatement":
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
		break;

	case "AssignmentPattern":
		if (parent.right === node) {
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
		break;

	default:
		break;
	}
}
function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	const handlers = {
		CallExpression: () => {
			if (
				parent.optional === true &&
				parent.arguments.length >= 1 &&
				parent.arguments[0] === node
			) {
				state.makeOptionalRight();
			}
		},
		MemberExpression: () => {
			if (parent.optional === true && parent.property === node) {
				state.makeOptionalRight();
			}
		},
		LogicalExpression: () => {
			if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
				state.makeLogicalRight();
			}
		},
		AssignmentExpression: () => {
			if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
				state.makeLogicalRight();
			}
		},
		IfStatement: () => {
			if (parent.consequent === node) {
				state.makeIfConsequent();
			} else if (parent.alternate === node) {
				state.makeIfAlternate();
			}
		},
		ConditionalExpression: () => {
			if (parent.consequent === node) {
				state.makeIfConsequent();
			} else if (parent.alternate === node) {
				state.makeIfAlternate();
			}
		},
		SwitchCase: () => {
			if (parent.consequent[0] === node) {
				state.makeSwitchCaseBody(false, !parent.test);
			}
		},
		TryStatement: () => {
			if (parent.handler === node) {
				state.makeCatchBlock();
			} else if (parent.finalizer === node) {
				state.makeFinallyBlock();
			}
		},
		WhileStatement: () => {
			if (parent.test === node) {
				state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
			} else {
				assert(parent.body === node);
				state.makeWhileBody();
			}
		},
		DoWhileStatement: () => {
			if (parent.body === node) {
				state.makeDoWhileBody();
			} else {
				assert(parent.test === node);
				state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
			}
		},
		ForStatement: () => {
			if (parent.test === node) {
				state.makeForTest(getBooleanValueIfSimpleConstant(node));
			} else if (parent.update === node) {
				state.makeForUpdate();
			} else if (parent.body === node) {
				state.makeForBody();
			}
		},
		ForInStatement: () => {
			if (parent.left === node) {
				state.makeForInOfLeft();
			} else if (parent.right === node) {
				state.makeForInOfRight();
			} else {
				assert(parent.body === node);
				state.makeForInOfBody();
			}
		},
		ForOfStatement: () => {
			if (parent.left === node) {
				state.makeForInOfLeft();
			} else if (parent.right === node) {
				state.makeForInOfRight();
			} else {
				assert(parent.body === node);
				state.makeForInOfBody();
			}
		},
		AssignmentPattern: () => {
			if (parent.right === node) {
				state.pushForkContext();
				state.forkBypassPath();
				state.forkPath();
			}
		}
	};

	const handler = handlers[parent.type];
	if (handler) {
		handler();
	}
}
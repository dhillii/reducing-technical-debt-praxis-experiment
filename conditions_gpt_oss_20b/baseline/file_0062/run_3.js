function preprocess(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;
	if (!parent) return;

	const handlers = {
		CallExpression: (p, n, s) => {
			if (p.optional && p.arguments.length >= 1 && p.arguments[0] === n) {
				s.makeOptionalRight();
			}
		},
		MemberExpression: (p, n, s) => {
			if (p.optional && p.property === n) {
				s.makeOptionalRight();
			}
		},
		LogicalExpression: (p, n, s) => {
			if (p.right === n && isHandledLogicalOperator(p.operator)) {
				s.makeLogicalRight();
			}
		},
		AssignmentExpression: (p, n, s) => {
			if (p.right === n && isLogicalAssignmentOperator(p.operator)) {
				s.makeLogicalRight();
			}
		},
		ConditionalExpression: (p, n, s) => {
			if (p.consequent === n) {
				s.makeIfConsequent();
			} else if (p.alternate === n) {
				s.makeIfAlternate();
			}
		},
		IfStatement: (p, n, s) => {
			if (p.consequent === n) {
				s.makeIfConsequent();
			} else if (p.alternate === n) {
				s.makeIfAlternate();
			}
		},
		SwitchCase: (p, n, s) => {
			if (p.consequent[0] === n) {
				s.makeSwitchCaseBody(false, !p.test);
			}
		},
		TryStatement: (p, n, s) => {
			if (p.handler === n) {
				s.makeCatchBlock();
			} else if (p.finalizer === n) {
				s.makeFinallyBlock();
			}
		},
		WhileStatement: (p, n, s) => {
			if (p.test === n) {
				s.makeWhileTest(getBooleanValueIfSimpleConstant(n));
			} else {
				assert(p.body === n);
				s.makeWhileBody();
			}
		},
		DoWhileStatement: (p, n, s) => {
			if (p.body === n) {
				s.makeDoWhileBody();
			} else {
				assert(p.test === n);
				s.makeDoWhileTest(getBooleanValueIfSimpleConstant(n));
			}
		},
		ForStatement: (p, n, s) => {
			if (p.test === n) {
				s.makeForTest(getBooleanValueIfSimpleConstant(n));
			} else if (p.update === n) {
				s.makeForUpdate();
			} else if (p.body === n) {
				s.makeForBody();
			}
		},
		ForInStatement: (p, n, s) => {
			if (p.left === n) {
				s.makeForInOfLeft();
			} else if (p.right === n) {
				s.makeForInOfRight();
			} else {
				assert(p.body === n);
				s.makeForInOfBody();
			}
		},
		ForOfStatement: (p, n, s) => {
			if (p.left === n) {
				s.makeForInOfLeft();
			} else if (p.right === n) {
				s.makeForInOfRight();
			} else {
				assert(p.body === n);
				s.makeForInOfBody();
			}
		},
		AssignmentPattern: (p, n, s) => {
			if (p.right === n) {
				s.pushForkContext();
				s.forkBypassPath();
				s.forkPath();
			}
		}
	};

	const handler = handlers[parent.type];
	if (handler) handler(parent, node, state);
}
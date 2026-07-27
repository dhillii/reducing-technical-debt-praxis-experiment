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
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	/**
	 * Handles optional call expressions.
	 * @returns {void}
	 */
	function handleOptionalCall() {
		if (
			parent.optional === true &&
			parent.arguments.length >= 1 &&
			parent.arguments[0] === node
		) {
			state.makeOptionalRight();
		}
	}

	/**
	 * Handles optional member expressions.
	 * @returns {void}
	 */
	function handleOptionalMember() {
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
	}

	/**
	 * Handles logical expressions on the right side.
	 * @returns {void}
	 */
	function handleLogicalRight() {
		if (
			parent.right === node &&
			isHandledLogicalOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	}

	/**
	 * Handles logical assignment expressions on the right side.
	 * @returns {void}
	 */
	function handleLogicalAssignmentRight() {
		if (
			parent.right === node &&
			isLogicalAssignmentOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	}

	/**
	 * Handles if/conditional consequent and alternate.
	 * @returns {void}
	 */
	function handleIfConsequentAlternate() {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	}

	/**
	 * Handles switch case body.
	 * @returns {void}
	 */
	function handleSwitchCaseBody() {
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
	}

	/**
	 * Handles try statement blocks.
	 * @returns {void}
	 */
	function handleTryBlocks() {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	}

	/**
	 * Handles while statement test and body.
	 * @returns {void}
	 */
	function handleWhileStatement() {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	}

	/**
	 * Handles do-while statement body and test.
	 * @returns {void}
	 */
	function handleDoWhileStatement() {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	}

	/**
	 * Handles for statement test, update, and body.
	 * @returns {void}
	 */
	function handleForStatement() {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	}

	/**
	 * Handles for-in/of statement left, right, and body.
	 * @returns {void}
	 */
	function handleForInOfStatement() {
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
	 * Handles assignment pattern right side.
	 * @returns {void}
	 */
	function handleAssignmentPattern() {
		if (parent.right === node) {
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
	}

	const handlers = {
		CallExpression: handleOptionalCall,
		MemberExpression: handleOptionalMember,
		LogicalExpression: handleLogicalRight,
		AssignmentExpression: handleLogicalAssignmentRight,
		IfStatement: handleIfConsequentAlternate,
		ConditionalExpression: handleIfConsequentAlternate,
		SwitchCase: handleSwitchCaseBody,
		TryStatement: handleTryBlocks,
		WhileStatement: handleWhileStatement,
		DoWhileStatement: handleDoWhileStatement,
		ForStatement: handleForStatement,
		ForInStatement: handleForInOfStatement,
		ForOfStatement: handleForInOfStatement,
		AssignmentPattern: handleAssignmentPattern,
	};

	const handler = handlers[parent.type];
	if (handler) {
		handler();
	}
}
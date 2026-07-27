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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;
	if (!parent) {
		return;
	}
	const type = parent.type;

	// CallExpression optional chaining
	if (
		type === "CallExpression" &&
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
		return;
	}

	// MemberExpression optional chaining
	if (
		type === "MemberExpression" &&
		parent.optional === true &&
		parent.property === node
	) {
		state.makeOptionalRight();
		return;
	}

	// LogicalExpression and AssignmentExpression short-circuit
	if (
		(type === "LogicalExpression" || type === "AssignmentExpression") &&
		parent.right === node &&
		((type === "LogicalExpression" && isHandledLogicalOperator(parent.operator)) ||
			(type === "AssignmentExpression" && isLogicalAssignmentOperator(parent.operator)))
	) {
		state.makeLogicalRight();
		return;
	}

	// IfStatement and ConditionalExpression branches
	if (
		(type === "ConditionalExpression" || type === "IfStatement") &&
		(parent.consequent === node || parent.alternate === node)
	) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else {
			state.makeIfAlternate();
		}
		return;
	}

	// SwitchCase body
	if (type === "SwitchCase" && parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
		return;
	}

	// TryStatement blocks
	if (type === "TryStatement") {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
		return;
	}

	// WhileStatement
	if (type === "WhileStatement") {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
		return;
	}

	// DoWhileStatement
	if (type === "DoWhileStatement") {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
		return;
	}

	// ForStatement
	if (type === "ForStatement") {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
		return;
	}

	// ForInStatement and ForOfStatement
	if (type === "ForInStatement" || type === "ForOfStatement") {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
		return;
	}

	// AssignmentPattern right side
	if (type === "AssignmentPattern" && parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
		return;
	}
}
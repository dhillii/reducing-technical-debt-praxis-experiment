```javascript
/**
 * @fileoverview A class of the code path analyzer.
 * @author Toru Nagashima
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("../../shared/assert"),
	{ breakableTypePattern } = require("../../shared/ast-utils"),
	CodePath = require("./code-path"),
	CodePathSegment = require("./code-path-segment"),
	IdGenerator = require("./id-generator"),
	debug = require("./debug-helpers");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether or not a given node is a `case` node (not `default` node).
 * @param {ASTNode} node A `SwitchCase` node to check.
 * @returns {boolean} `true` if the node is a `case` node (not `default` node).
 */
function isCaseNode(node) {
	return Boolean(node.test);
}

/**
 * Checks if a given node appears as the value of a PropertyDefinition node.
 * @param {ASTNode} node THe node to check.
 * @returns {boolean} `true` if the node is a PropertyDefinition value,
 *      false if not.
 */
function isPropertyDefinitionValue(node) {
	const parent = node.parent;

	return (
		parent && parent.type === "PropertyDefinition" && parent.value === node
	);
}

/**
 * Checks whether the given logical operator is taken into account for the code
 * path analysis.
 * @param {string} operator The operator found in the LogicalExpression node
 * @returns {boolean} `true` if the operator is "&&" or "||" or "??"
 */
function isHandledLogicalOperator(operator) {
	return operator === "&&" || operator === "||" || operator === "??";
}

/**
 * Checks whether the given assignment operator is a logical assignment operator.
 * Logical assignments are taken into account for the code path analysis
 * because of their short-circuiting semantics.
 * @param {string} operator The operator found in the AssignmentExpression node
 * @returns {boolean} `true` if the operator is "&&=" or "||=" or "??="
 */
function isLogicalAssignmentOperator(operator) {
	return operator === "&&=" || operator === "||=" || operator === "??=";
}

/**
 * Gets the label if the parent node of a given node is a LabeledStatement.
 * @param {ASTNode} node A node to get.
 * @returns {string|null} The label or `null`.
 */
function getLabel(node) {
	if (node.parent.type === "LabeledStatement") {
		return node.parent.label.name;
	}
	return null;
}

/**
 * Checks whether or not a given logical expression node goes different path
 * between the `true` case and the `false` case.
 * @param {ASTNode} node A node to check.
 * @returns {boolean} `true` if the node is a test of a choice statement.
 */
function isForkingByTrueOrFalse(node) {
	const parent = node.parent;

	switch (parent.type) {
		case "ConditionalExpression":
		case "IfStatement":
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
			return parent.test === node;

		case "LogicalExpression":
			return isHandledLogicalOperator(parent.operator);

		case "AssignmentExpression":
			return isLogicalAssignmentOperator(parent.operator);

		default:
			return false;
	}
}

/**
 * Gets the boolean value of a given literal node.
 *
 * This is used to detect infinity loops (e.g. `while (true) {}`).
 * Statements preceded by an infinity loop are unreachable if the loop didn't
 * have any `break` statement.
 * @param {ASTNode} node A node to get.
 * @returns {boolean|undefined} a boolean value if the node is a Literal node,
 *   otherwise `undefined`.
 */
function getBooleanValueIfSimpleConstant(node) {
	if (node.type === "Literal") {
		return Boolean(node.value);
	}
	return void 0;
}

/**
 * Checks that a given identifier node is a reference or not.
 *
 * This is used to detect the first throwable node in a `try` block.
 * @param {ASTNode} node An Identifier node to check.
 * @returns {boolean} `true` if the node is a reference.
 */
function isIdentifierReference(node) {
	const parent = node.parent;

	switch (parent.type) {
		case "LabeledStatement":
		case "BreakStatement":
		case "ContinueStatement":
		case "ArrayPattern":
		case "RestElement":
		case "ImportSpecifier":
		case "ImportDefaultSpecifier":
		case "ImportNamespaceSpecifier":
		case "CatchClause":
			return false;

		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "ClassDeclaration":
		case "ClassExpression":
		case "VariableDeclarator":
			return parent.id !== node;

		case "Property":
		case "PropertyDefinition":
		case "MethodDefinition":
			return parent.key !== node || parent.computed || parent.shorthand;

		case "AssignmentPattern":
			return parent.key !== node;

		default:
			return true;
	}
}

/**
 * Updates the current segment with the head segment.
 * This is similar to local branches and tracking branches of git.
 *
 * To separate the current and the head is in order to not make useless segments.
 *
 * In this process, both "onCodePathSegmentStart" and "onCodePathSegmentEnd"
 * events are fired.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function forwardCurrentToHead(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const currentSegments = state.currentSegments;
	const headSegments = state.headSegments;
	const end = Math.max(currentSegments.length, headSegments.length);
	let i, currentSegment, headSegment;

	// Fires leaving events.
	for (i = 0; i < end; ++i) {
		currentSegment = currentSegments[i];
		headSegment = headSegments[i];

		if (currentSegment !== headSegment && currentSegment) {
			const eventName = currentSegment.reachable
				? "onCodePathSegmentEnd"
				: "onUnreachableCodePathSegmentEnd";

			debug.dump(`${eventName} ${currentSegment.id}`);

			analyzer.emit(eventName, [currentSegment, node]);
		}
	}

	// Update state.
	state.currentSegments = headSegments;

	// Fires entering events.
	for (i = 0; i < end; ++i) {
		currentSegment = currentSegments[i];
		headSegment = headSegments[i];

		if (currentSegment !== headSegment && headSegment) {
			const eventName = headSegment.reachable
				? "onCodePathSegmentStart"
				: "onUnreachableCodePathSegmentStart";

			debug.dump(`${eventName} ${headSegment.id}`);
			CodePathSegment.markUsed(headSegment);
			analyzer.emit(eventName, [headSegment, node]);
		}
	}
}

/**
 * Updates the current segment with empty.
 * This is called at the last of functions or the program.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function leaveFromCurrentSegment(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const currentSegments = state.currentSegments;

	for (let i = 0; i < currentSegments.length; ++i) {
		const currentSegment = currentSegments[i];
		const eventName = currentSegment.reachable
			? "onCodePathSegmentEnd"
			: "onUnreachableCodePathSegmentEnd";

		debug.dump(`${eventName} ${currentSegment.id}`);

		analyzer.emit(eventName, [currentSegment, node]);
	}

	state.currentSegments = [];
}

/**
 * Handles CallExpression preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleCallExpressionPreprocess(state, parent, node) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

/**
 * Handles MemberExpression preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleMemberExpressionPreprocess(state, parent, node) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

/**
 * Handles LogicalExpression preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleLogicalExpressionPreprocess(state, parent, node) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles AssignmentExpression preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleAssignmentExpressionPreprocess(state, parent, node) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles ConditionalExpression and IfStatement preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleConditionalPreprocess(state, parent, node) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

/**
 * Handles SwitchCase preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleSwitchCasePreprocess(state, parent, node) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles TryStatement preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleTryStatementPreprocess(state, parent, node) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

/**
 * Handles WhileStatement preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleWhileStatementPreprocess(state, parent, node) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

/**
 * Handles DoWhileStatement preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleDoWhileStatementPreprocess(state, parent, node) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

/**
 * Handles ForStatement preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleForStatementPreprocess(state, parent, node) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

/**
 * Handles ForInStatement and ForOfStatement preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleForInOfStatementPreprocess(state, parent, node) {
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
 * Handles AssignmentPattern preprocessing
 * @param {Object} state The code path state
 * @param {ASTNode} parent The parent node
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleAssignmentPatternPreprocess(state, parent, node) {
	if (parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}

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

	const preprocessHandlers = {
		CallExpression: handleCallExpressionPreprocess,
		MemberExpression: handleMemberExpressionPreprocess,
		LogicalExpression: handleLogicalExpressionPreprocess,
		AssignmentExpression: handleAssignmentExpressionPreprocess,
		ConditionalExpression: handleConditionalPreprocess,
		IfStatement: handleConditionalPreprocess,
		SwitchCase: handleSwitchCasePreprocess,
		TryStatement: handleTryStatementPreprocess,
		WhileStatement: handleWhileStatementPreprocess,
		DoWhileStatement: handleDoWhileStatementPreprocess,
		ForStatement: handleForStatementPreprocess,
		ForInStatement: handleForInOfStatementPreprocess,
		ForOfStatement: handleForInOfStatementPreprocess,
		AssignmentPattern: handleAssignmentPatternPreprocess,
	};

	const handler = preprocessHandlers[parent.type];
	if (handler) {
		handler(state, parent, node);
	}
}

/**
 * Handles Program, FunctionDeclaration, and similar nodes
 * @param {CodePathAnalyzer} analyzer The instance
 * @param {ASTNode} node The current node
 * @param {string} origin The origin type
 * @returns {void}
 */
function startCodePath(analyzer, node, origin) {
	const codePath = analyzer.codePath;
	let newCodePath;

	if (codePath) {
		forwardCurrentToHead(analyzer, node);
		debug.dumpState(node, CodePath.getState(codePath), false);
	}

	newCodePath = new CodePath({
		id: analyzer.idGenerator.next(),
		origin,
		upper: codePath,
		onLooped: analyzer.onLooped,
	});
	analyzer.codePath = newCodePath;

	debug.dump(`onCodePathStart ${newCodePath.id}`);
	analyzer.emit("onCodePathStart", [newCodePath, node]);
}

/**
 * Handles ChainExpression node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleChainExpression(state, node) {
	state.pushChainContext();
}

/**
 * Handles CallExpression node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleCallExpression(state, node) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

/**
 * Handles MemberExpression node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleMemberExpression(state, node) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

/**
 * Handles LogicalExpression node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleLogicalExpression(state, node) {
	if (isHandledLogicalOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator,
			isForkingByTrueOrFalse(node),
		);
	}
}

/**
 * Handles AssignmentExpression node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleAssignmentExpression(state, node) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator.slice(0, -1),
			isForkingByTrueOrFalse(node),
		);
	}
}

/**
 * Handles ConditionalExpression and IfStatement nodes
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleConditionalExpression(state, node) {
	state.pushChoiceContext("test", false);
}

/**
 * Handles SwitchStatement node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleSwitchStatement(state, node) {
	state.pushSwitchContext(
		node.cases.some(isCaseNode),
		getLabel(node),
	);
}

/**
 * Handles TryStatement node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleTryStatement(state, node) {
	state.pushTryContext(Boolean(node.finalizer));
}

/**
 * Handles SwitchCase node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @param {ASTNode} parent The parent node
 * @returns {void}
 */
function handleSwitchCase(state, node, parent) {
	if (parent.discriminant !== node && parent.cases[0] !== node) {
		state.forkPath();
	}
}

/**
 * Handles loop statements
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleLoopStatement(state, node) {
	state.pushLoopContext(node.type, getLabel(node));
}

/**
 * Handles LabeledStatement node
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleLabeledStatement(state, node) {
	if (!breakableTypePattern.test(node.body.type)) {
		state.pushBreakContext(false, node.label.name);
	}
}

/**
 * Updates the code path due to the type of a given node in entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);
	const parent = node.parent;

	if (isPropertyDefinitionValue(node)) {
		startCodePath(analyzer, node, "class-field-initializer");
	}

	const nodeHandlers = {
		Program: () => startCodePath(analyzer, node, "program"),
		FunctionDeclaration: () => startCodePath(analyzer, node, "function"),
		FunctionExpression: () => startCodePath(analyzer, node, "function"),
		ArrowFunctionExpression: () => startCodePath(analyzer, node, "function"),
		StaticBlock: () => startCodePath(analyzer, node, "class-static-block"),
		ChainExpression: () => handleChainExpression(state, node),
		CallExpression: () => handleCallExpression(state, node),
		MemberExpression: () => handleMemberExpression(state, node),
		LogicalExpression: () => handleLogicalExpression(state, node),
		AssignmentExpression: () => handleAssignmentExpression(state, node),
		ConditionalExpression: () => handleConditionalExpression(state, node),
		IfStatement: () => handleConditionalExpression(state, node),
		SwitchStatement: () => handleSwitchStatement(state, node),
		TryStatement: () => handleTryStatement(state, node),
		SwitchCase: () => handleSwitchCase(state, node, parent),
		WhileStatement: () => handleLoopStatement(state, node),
		DoWhileStatement: () => handleLoopStatement(state, node),
		ForStatement: () => handleLoopStatement(state, node),
		ForInStatement: () => handleLoopStatement(state, node),
		ForOfStatement: () => handleLoopStatement(state, node),
		LabeledStatement: () => handleLabeledStatement(state, node),
	};

	const handler = nodeHandlers[node.type];
	if (handler) {
		handler();
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/**
 * Handles ChainExpression exit
 * @param {Object} state The code path state
 * @returns {void}
 */
function handleChainExpressionExit(state) {
	state.popChainContext();
	return false;
}

/**
 * Handles IfStatement and ConditionalExpression exit
 * @param {Object} state The code path state
 * @returns {void}
 */
function handleConditionalExpressionExit(state) {
	state.popChoiceContext();
	return false;
}

/**
 * Handles LogicalExpression exit
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleLogicalExpressionExit(state, node) {
	if (isHandledLogicalOperator(node.operator)) {
		state.popChoiceContext();
	}
	return false;
}

/**
 * Handles AssignmentExpression exit
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleAssignmentExpressionExit(state, node) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.popChoiceContext();
	}
	return false;
}

/**
 * Handles SwitchStatement exit
 * @param {Object} state The code path state
 * @returns {void}
 */
function handleSwitchStatementExit(state) {
	state.popSwitchContext();
	return false;
}

/**
 * Handles SwitchCase exit
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {boolean} Whether to forward
 */
function handleSwitchCaseExit(state, node) {
	if (node.consequent.length === 0) {
		state.makeSwitchCaseBody(true, !node.test);
	}
	return !state.forkContext.reachable;
}

/**
 * Handles TryStatement exit
 * @param {Object} state The code path state
 * @returns {void}
 */
function handleTryStatementExit(state) {
	state.popTryContext();
	return false;
}

/**
 * Handles BreakStatement exit
 * @param {CodePathAnalyzer} analyzer The instance
 * @param {ASTNode} node The current node
 * @returns {boolean} Whether to forward
 */
function handleBreakStatementExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	forwardCurrentToHead(analyzer, node);
	state.makeBreak(node.label && node.label.name);
	return true;
}

/**
 * Handles ContinueStatement exit
 * @param {CodePathAnalyzer} analyzer The instance
 * @param {ASTNode} node The current node
 * @returns {boolean} Whether to forward
 */
function handleContinueStatementExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	forwardCurrentToHead(analyzer, node);
	state.makeContinue(node.label && node.label.name);
	return true;
}

/**
 * Handles ReturnStatement exit
 * @param {CodePathAnalyzer} analyzer The instance
 * @param {ASTNode} node The current node
 * @returns {boolean} Whether to forward
 */
function handleReturnStatementExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	forwardCurrentToHead(analyzer, node);
	state.makeReturn();
	return true;
}

/**
 * Handles ThrowStatement exit
 * @param {CodePathAnalyzer} analyzer The instance
 * @param {ASTNode} node The current node
 * @returns {boolean} Whether to forward
 */
function handleThrowStatementExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	forwardCurrentToHead(analyzer, node);
	state.makeThrow();
	return true;
}

/**
 * Handles Identifier exit
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {boolean} Whether to forward
 */
function handleIdentifierExit(state, node) {
	if (isIdentifierReference(node)) {
		state.makeFirstThrowablePathInTryBlock();
		return true;
	}
	return false;
}

/**
 * Handles throwable expressions
 * @param {Object} state The code path state
 * @returns {void}
 */
function handleThrowableExpression(state) {
	state.makeFirstThrowablePathInTryBlock();
}

/**
 * Handles loop statement exit
 * @param {Object} state The code path state
 * @returns {void}
 */
function handleLoopStatementExit(state) {
	state.popLoopContext();
	return false;
}

/**
 * Handles AssignmentPattern exit
 * @param {Object} state The code path state
 * @returns {void}
 */
function handleAssignmentPatternExit(state) {
	state.popForkContext();
	return false;
}

/**
 * Handles LabeledStatement exit
 * @param {Object} state The code path state
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function handleLabeledStatementExit(state, node) {
	if (!breakableTypePattern.test(node.body.type)) {
		state.popBreakContext();
	}
	return false;
}

/**
 * Updates the code path due to the type of a given node in leaving.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);

	const exitHandlers = {
		ChainExpression: () => handleChainExpressionExit(state),
		IfStatement: () => handleConditionalExpressionExit(state),
		ConditionalExpression: () => handleConditionalExpressionExit(state),
		LogicalExpression: () => handleLogicalExpressionExit(state, node),
		AssignmentExpression: () => handleAssignmentExpressionExit(state, node),
		SwitchStatement: () => handleSwitchStatementExit(state),
		SwitchCase: () => handleSwitchCaseExit(state, node),
		TryStatement: () => handleTryStatementExit(state),
		BreakStatement: () => handleBreakStatementExit(analyzer, node),
		ContinueStatement: () => handleContinueStatementExit(analyzer, node),
		ReturnStatement: () => handleReturnStatementExit(analyzer, node),
		ThrowStatement: () => handleThrowStatementExit(analyzer, node),
		Identifier: () => handleIdentifierExit(state, node),
		CallExpression: () => handleThrowableExpression(state),
		ImportExpression: () => handleThrowableExpression(state),
		MemberExpression: () => handleThrowableExpression(state),
		NewExpression: () => handleThrowableExpression(state),
		YieldExpression: () => handleThrowableExpression(state),
		WhileStatement: () => handleLoopStatementExit(state),
		DoWhileStatement: () => handleLoopStatementExit(state),
		ForStatement: () => handleLoopStatementExit(state),
		ForInStatement: () => handleLoopStatementExit(state),
		ForOfStatement: () => handleLoopStatementExit(state),
		AssignmentPattern: () => handleAssignmentPatternExit(state),
		LabeledStatement: () => handleLabeledStatementExit(state, node),
	};

	const handler = exitHandlers[node.type];
	const dontForward = handler ? handler() : false;

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

/**
 * Ends the code path for the current node.
 * @param {CodePathAnalyzer} analyzer The instance
 * @param {ASTNode} node The current node
 * @returns {void}
 */
function endCodePath(analyzer, node) {
	let codePath = analyzer.codePath;

	CodePath.getState(codePath).makeFinal();
	leaveFromCurrentSegment(analyzer, node);

	debug.dump(`onCodePathEnd ${codePath.id}`);
	analyzer.emit("onCodePathEnd", [codePath, node]);
	debug.dumpDot(codePath);

	codePath = analyzer.codePath = analyzer.codePath.upper;
	if (codePath) {
		debug.dumpState(node, CodePath.getState(codePath), true);
	}
}

/**
 * Updates the code path to finalize the current code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function postprocess(analyzer, node) {
	const codesToEnd = [
		"Program",
		"FunctionDeclaration",
		"FunctionExpression",
		"ArrowFunctionExpression",
		"StaticBlock",
	];

	if (codesToEnd.includes(node.type)) {
		endCodePath(analyzer, node);
	}

	if (node.type === "CallExpression" && node.optional === true && node.arguments.length === 0) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}

	if (isPropertyDefinitionValue(node)) {
		endCodePath(analyzer, node);
	}
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * The class to analyze code paths.
 * This class implements the EventGenerator interface.
 */
class CodePathAnalyzer {
	/**
	 * @param {EventGenerator} eventGenerator An event generator to wrap.
	 */
	constructor(eventGenerator) {
		this.original = eventGenerator;
		this.emit = eventGenerator.emit;
		this.codePath = null;
		this.idGenerator = new IdGenerator("s");
		this.currentNode = null;
		this.onLooped = this.onLooped.bind(this);
	}

	/**
	 * Does the process to enter a given AST node.
	 * This updates state of analysis and calls `enterNode` of the wrapped.
	 * @param {ASTNode} node A node which is entering.
	 * @returns {void}
	 */
	enterNode(node) {
		this.currentNode = node;

		if (node.parent) {
			preprocess(this, node);
		}

		processCodePathToEnter(this, node);

		this.original.enterNode(node);

		this.currentNode = null;
	}

	/**
	 * Does the process to leave a given AST node.
	 * This updates state of analysis and calls `leaveNode` of the wrapped.
	 * @param {ASTNode} node A node which is leaving.
	 * @returns {void}
	 */
	leaveNode(node) {
		this.currentNode = node;

		processCodePathToExit(this, node);

		this.original.leaveNode(node);

		postprocess(this, node);

		this.currentNode = null;
	}

	/**
	 * This is called on a code path looped.
	 * Then this raises a looped event.
	 * @param {CodePathSegment} fromSegment A segment of prev.
	 * @param {CodePathSegment} toSegment A segment of next.
	 * @returns {void}
	 */
	onLooped(fromSegment, toSegment) {
		if (fromSegment.reachable && toSegment.reachable) {
			debug.dump(
				`onCodePathSegmentLoop ${fromSegment.id} -> ${toSegment.id}`,
			);
			this.emit("onCodePathSegmentLoop", [
				fromSegment,
				toSegment,
				this.currentNode,
			]);
		}
	}
}

module.exports = CodePathAnalyzer;
```
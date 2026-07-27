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

	const nodeHandlers = {
		CallExpression: handleCallExpression,
		MemberExpression: handleMemberExpression,
		LogicalExpression: handleLogicalExpression,
		AssignmentExpression: handleAssignmentExpression,
		ConditionalExpression: handleConditionalExpression,
		IfStatement: handleIfStatement,
		SwitchCase: handleSwitchCase,
		TryStatement: handleTryStatement,
		WhileStatement: handleWhileStatement,
		DoWhileStatement: handleDoWhileStatement,
		ForStatement: handleForStatement,
		ForInStatement: handleForInStatement,
		ForOfStatement: handleForInStatement,
		AssignmentPattern: handleAssignmentPattern,
	};

	const handler = nodeHandlers[parent.type];
	if (handler) {
		handler(analyzer, node, state, parent);
	}
}

function handleCallExpression(analyzer, node, state, parent) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

function handleMemberExpression(analyzer, node, state, parent) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

function handleLogicalExpression(analyzer, node, state, parent) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function handleAssignmentExpression(analyzer, node, state, parent) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function handleConditionalExpression(analyzer, node, state, parent) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

function handleIfStatement(analyzer, node, state, parent) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

function handleSwitchCase(analyzer, node, state, parent) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

function handleTryStatement(analyzer, node, state, parent) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

function handleWhileStatement(analyzer, node, state, parent) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

function handleDoWhileStatement(analyzer, node, state, parent) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

function handleForStatement(analyzer, node, state, parent) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

function handleForInStatement(analyzer, node, state, parent) {
	if (parent.left === node) {
		state.makeForInOfLeft();
	} else if (parent.right === node) {
		state.makeForInOfRight();
	} else {
		assert(parent.body === node);
		state.makeForInOfBody();
	}
}

function handleAssignmentPattern(analyzer, node, state, parent) {
	if (parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
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

	/**
	 * Creates a new code path and trigger the onCodePathStart event
	 * based on the currently selected node.
	 * @param {string} origin The reason the code path was started.
	 * @returns {void}
	 */
	function startCodePath(origin) {
		if (codePath) {
			// Emits onCodePathSegmentStart events if updated.
			forwardCurrentToHead(analyzer, node);
			debug.dumpState(node, state, false);
		}

		// Create the code path of this scope.
		codePath = analyzer.codePath = new CodePath({
			id: analyzer.idGenerator.next(),
			origin,
			upper: codePath,
			onLooped: analyzer.onLooped,
		});
		state = CodePath.getState(codePath);

		// Emits onCodePathStart events.
		debug.dump(`onCodePathStart ${codePath.id}`);
		analyzer.emit("onCodePathStart", [codePath, node]);
	}

	/*
	 * Special case: The right side of class field initializer is considered
	 * to be its own function, so we need to start a new code path in this
	 * case.
	 */
	if (isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");

		/*
		 * Intentional fall through because `node` needs to also be
		 * processed by the code below. For example, if we have:
		 *
		 * class Foo {
		 *     a = () => {}
		 * }
		 *
		 * In this case, we also need start a second code path.
		 */
	}

	const nodeHandlers = {
		Program: handleProgram,
		FunctionDeclaration: handleFunction,
		FunctionExpression: handleFunction,
		ArrowFunctionExpression: handleFunction,
		StaticBlock: handleStaticBlock,
		ChainExpression: handleChainExpression,
		CallExpression: handleCallExpressionEnter,
		MemberExpression: handleMemberExpressionEnter,
		LogicalExpression: handleLogicalExpressionEnter,
		AssignmentExpression: handleAssignmentExpressionEnter,
		ConditionalExpression: handleConditionalExpressionEnter,
		IfStatement: handleIfStatementEnter,
		SwitchStatement: handleSwitchStatement,
		SwitchCase: handleSwitchCaseEnter,
		TryStatement: handleTryStatementEnter,
		WhileStatement: handleWhileStatementEnter,
		DoWhileStatement: handleDoWhileStatementEnter,
		ForStatement: handleForStatementEnter,
		ForInStatement: handleForInStatementEnter,
		ForOfStatement: handleForInStatementEnter,
		LabeledStatement: handleLabeledStatement,
	};

	const handler = nodeHandlers[node.type];
	if (handler) {
		handler(analyzer, node, state);
	}

	// Emits onCodePathSegmentStart events if updated.
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

function handleProgram(analyzer, node, state) {
	startCodePath("program");
}

function handleFunction(analyzer, node, state) {
	startCodePath("function");
}

function handleStaticBlock(analyzer, node, state) {
	startCodePath("class-static-block");
}

function handleChainExpression(analyzer, node, state) {
	state.pushChainContext();
}

function handleCallExpressionEnter(analyzer, node, state) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

function handleMemberExpressionEnter(analyzer, node, state) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

function handleLogicalExpressionEnter(analyzer, node, state) {
	if (isHandledLogicalOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator,
			isForkingByTrueOrFalse(node),
		);
	}
}

function handleAssignmentExpressionEnter(analyzer, node, state) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator.slice(0, -1), // removes `=` from the end
			isForkingByTrueOrFalse(node),
		);
	}
}

function handleConditionalExpressionEnter(analyzer, node, state) {
	state.pushChoiceContext("test", false);
}

function handleIfStatementEnter(analyzer, node, state) {
	state.pushChoiceContext("test", false);
}

function handleSwitchStatement(analyzer, node, state) {
	state.pushSwitchContext(
		node.cases.some(isCaseNode),
		getLabel(node),
	);
}

function handleSwitchCaseEnter(analyzer, node, state) {
	if (node.parent.discriminant !== node && node.parent.cases[0] !== node) {
		state.forkPath();
	}
}

function handleTryStatementEnter(analyzer, node, state) {
	state.pushTryContext(Boolean(node.finalizer));
}

function handleWhileStatementEnter(analyzer, node, state) {
	state.pushLoopContext(node.type, getLabel(node));
}

function handleDoWhileStatementEnter(analyzer, node, state) {
	state.pushLoopContext(node.type, getLabel(node));
}

function handleForStatementEnter(analyzer, node, state) {
	state.pushLoopContext(node.type, getLabel(node));
}

function handleForInStatementEnter(analyzer, node, state) {
	state.pushLoopContext(node.type, getLabel(node));
}

function handleLabeledStatement(analyzer, node, state) {
	if (!breakableTypePattern.test(node.body.type)) {
		state.pushBreakContext(false, node.label.name);
	}
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
	let dontForward = false;

	const nodeHandlers = {
		ChainExpression: handleChainExpressionExit,
		IfStatement: handleIfStatementExit,
		ConditionalExpression: handleIfStatementExit,
		LogicalExpression: handleLogicalExpressionExit,
		AssignmentExpression: handleAssignmentExpressionExit,
		SwitchStatement: handleSwitchStatementExit,
		SwitchCase: handleSwitchCaseExit,
		TryStatement: handleTryStatementExit,
		BreakStatement: handleBreakStatement,
		ContinueStatement: handleContinueStatement,
		ReturnStatement: handleReturnStatement,
		ThrowStatement: handleThrowStatement,
		Identifier: handleIdentifier,
		CallExpression: handleCallExpressionExit,
		ImportExpression: handleCallExpressionExit,
		MemberExpression: handleCallExpressionExit,
		NewExpression: handleCallExpressionExit,
		YieldExpression: handleCallExpressionExit,
		WhileStatement: handleWhileStatementExit,
		DoWhileStatement: handleDoWhileStatementExit,
		ForStatement: handleForStatementExit,
		ForInStatement: handleForInStatementExit,
		ForOfStatement: handleForInStatementExit,
		AssignmentPattern: handleAssignmentPatternExit,
		LabeledStatement: handleLabeledStatementExit,
	};

	const handler = nodeHandlers[node.type];
	if (handler) {
		handler(analyzer, node, state);
		dontForward = true;
	}

	// Emits onCodePathSegmentStart events if updated.
	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

function handleChainExpressionExit(analyzer, node, state) {
	state.popChainContext();
}

function handleIfStatementExit(analyzer, node, state) {
	state.popChoiceContext();
}

function handleLogicalExpressionExit(analyzer, node, state) {
	if (isHandledLogicalOperator(node.operator)) {
		state.popChoiceContext();
	}
}

function handleAssignmentExpressionExit(analyzer, node, state) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.popChoiceContext();
	}
}

function handleSwitchStatementExit(analyzer, node, state) {
	state.popSwitchContext();
}

function handleSwitchCaseExit(analyzer, node, state) {
	if (node.consequent.length === 0) {
		state.makeSwitchCaseBody(true, !node.test);
	}
	if (state.forkContext.reachable) {
		dontForward = true;
	}
}

function handleTryStatementExit(analyzer, node, state) {
	state.popTryContext();
}

function handleBreakStatement(analyzer, node, state) {
	forwardCurrentToHead(analyzer, node);
	state.makeBreak(node.label && node.label.name);
}

function handleContinueStatement(analyzer, node, state) {
	forwardCurrentToHead(analyzer, node);
	state.makeContinue(node.label && node.label.name);
}

function handleReturnStatement(analyzer, node, state) {
	forwardCurrentToHead(analyzer, node);
	state.makeReturn();
}

function handleThrowStatement(analyzer, node, state) {
	forwardCurrentToHead(analyzer, node);
	state.makeThrow();
}

function handleIdentifier(analyzer, node, state) {
	if (isIdentifierReference(node)) {
		state.makeFirstThrowablePathInTryBlock();
	}
}

function handleCallExpressionExit(analyzer, node, state) {
	state.makeFirstThrowablePathInTryBlock();
}

function handleWhileStatementExit(analyzer, node, state) {
	state.popLoopContext();
}

function handleDoWhileStatementExit(analyzer, node, state) {
	state.popLoopContext();
}

function handleForStatementExit(analyzer, node, state) {
	state.popLoopContext();
}

function handleForInStatementExit(analyzer, node, state) {
	state.popLoopContext();
}

function handleAssignmentPatternExit(analyzer, node, state) {
	state.popForkContext();
}

function handleLabeledStatementExit(analyzer, node, state) {
	if (!breakableTypePattern.test(node.body.type)) {
		state.popBreakContext();
	}
}

/**
 * Updates the code path to finalize the current code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function postprocess(analyzer, node) {
	/**
	 * Ends the code path for the current node.
	 * @returns {void}
	 */
	function endCodePath() {
		let codePath = analyzer.codePath;

		// Mark the current path as the final node.
		CodePath.getState(codePath).makeFinal();

		// Emits onCodePathSegmentEnd event of the current segments.
		leaveFromCurrentSegment(analyzer, node);

		// Emits onCodePathEnd event of this code path.
		debug.dump(`onCodePathEnd ${codePath.id}`);
		analyzer.emit("onCodePathEnd", [codePath, node]);
		debug.dumpDot(codePath);

		codePath = analyzer.codePath = analyzer.codePath.upper;
		if (codePath) {
			debug.dumpState(node, CodePath.getState(codePath), true);
		}
	}

	const nodeHandlers = {
		Program: handleProgramExit,
		FunctionDeclaration: handleFunctionExit,
		FunctionExpression: handleFunctionExit,
		ArrowFunctionExpression: handleFunctionExit,
		StaticBlock: handleStaticBlockExit,
		CallExpression: handleCallExpressionPostprocess,
	};

	const handler = nodeHandlers[node.type];
	if (handler) {
		handler(analyzer, node);
	}

	/*
	 * Special case: The right side of class field initializer is considered
	 * to be its own function, so we need to end a code path in this
	 * case.
	 *
	 * We need to check after the other checks in order to close the
	 * code paths in the correct order for code like this:
	 *
	 *
	 * class Foo {
	 *     a = () => {}
	 * }
	 *
	 * In this case, The ArrowFunctionExpression code path is closed first
	 * and then we need to close the code path for the PropertyDefinition
	 * value.
	 */
	if (isPropertyDefinitionValue(node)) {
		endCodePath();
	}
}

function handleProgramExit(analyzer, node) {
	endCodePath();
}

function handleFunctionExit(analyzer, node) {
	endCodePath();
}

function handleStaticBlockExit(analyzer, node) {
	endCodePath();
}

function handleCallExpressionPostprocess(analyzer, node) {
	if (node.optional === true && node.arguments.length === 0) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

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

		// Updates the code path due to node's position in its parent node.
		if (node.parent) {
			preprocess(this, node);
		}

		/*
		 * Updates the code path.
		 * And emits onCodePathStart/onCodePathSegmentStart events.
		 */
		processCodePathToEnter(this, node);

		// Emits node events.
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

		/*
		 * Updates the code path.
		 * And emits onCodePathStart/onCodePathSegmentStart events.
		 */
		processCodePathToExit(this, node);

		// Emits node events.
		this.original.leaveNode(node);

		// Emits the last onCodePathStart/onCodePathSegmentStart events.
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
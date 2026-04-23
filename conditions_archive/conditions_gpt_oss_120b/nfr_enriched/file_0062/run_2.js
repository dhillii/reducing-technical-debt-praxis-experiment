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
 * @param {ASTNode} node The node to check.
 * @returns {boolean} `true` if the node is a PropertyDefinition value,
 *      false if not.
 */
function isPropertyDefinitionValue(node) {
	const parent = node.parent;
	return parent && parent.type === "PropertyDefinition" && parent.value === node;
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
 * Checks whether a logical expression node forks on true/false.
 * @param {ASTNode} node The node to check.
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
 * Gets the boolean value of a literal node, if it is a simple constant.
 * @param {ASTNode} node The node to get.
 * @returns {boolean|undefined} The boolean value or `undefined`.
 */
function getBooleanValueIfSimpleConstant(node) {
	if (node.type === "Literal") {
		return Boolean(node.value);
	}
	return void 0;
}

/**
 * Checks that a given identifier node is a reference.
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
 * Fires leaving events for segments that differ between current and head.
 * @param {CodePathAnalyzer} analyzer The analyzer instance.
 * @param {ASTNode} node The current node.
 */
function fireLeavingEvents(analyzer, node) {
	const { currentSegments, headSegments } = CodePath.getState(analyzer.codePath);
	const max = Math.max(currentSegments.length, headSegments.length);
	for (let i = 0; i < max; ++i) {
		const cur = currentSegments[i];
		const head = headSegments[i];
		if (cur !== head && cur) {
			const ev = cur.reachable ? "onCodePathSegmentEnd" : "onUnreachableCodePathSegmentEnd";
			debug.dump(`${ev} ${cur.id}`);
			analyzer.emit(ev, [cur, node]);
		}
	}
}

/**
 * Fires entering events for segments that differ between current and head.
 * @param {CodePathAnalyzer} analyzer The analyzer instance.
 * @param {ASTNode} node The current node.
 */
function fireEnteringEvents(analyzer, node) {
	const { currentSegments, headSegments } = CodePath.getState(analyzer.codePath);
	const max = Math.max(currentSegments.length, headSegments.length);
	for (let i = 0; i < max; ++i) {
		const cur = currentSegments[i];
		const head = headSegments[i];
		if (cur !== head && head) {
			const ev = head.reachable ? "onCodePathSegmentStart" : "onUnreachableCodePathSegmentStart";
			debug.dump(`${ev} ${head.id}`);
			CodePathSegment.markUsed(head);
			analyzer.emit(ev, [head, node]);
		}
	}
}

/**
 * Updates the current segment with the head segment.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 */
function forwardCurrentToHead(analyzer, node) {
	fireLeavingEvents(analyzer, node);
	// Update state.
	CodePath.getState(analyzer.codePath).currentSegments = CodePath.getState(analyzer.codePath).headSegments;
	fireEnteringEvents(analyzer, node);
}

/**
 * Emits end events for all current segments.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 */
function leaveFromCurrentSegment(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const current = state.currentSegments;
	for (let i = 0; i < current.length; ++i) {
		const seg = current[i];
		const ev = seg.reachable ? "onCodePathSegmentEnd" : "onUnreachableCodePathSegmentEnd";
		debug.dump(`${ev} ${seg.id}`);
		analyzer.emit(ev, [seg, node]);
	}
	state.currentSegments = [];
}

/**
 * Handles preprocessing for CallExpression nodes.
 */
function handlePreprocessCallExpression(analyzer, node, parent) {
	if (parent.optional && parent.arguments.length >= 1 && parent.arguments[0] === node) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles preprocessing for MemberExpression nodes.
 */
function handlePreprocessMemberExpression(analyzer, node, parent) {
	if (parent.optional && parent.property === node) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles preprocessing for LogicalExpression nodes.
 */
function handlePreprocessLogicalExpression(analyzer, node, parent) {
	if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

/**
 * Handles preprocessing for AssignmentExpression nodes.
 */
function handlePreprocessAssignmentExpression(analyzer, node, parent) {
	if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

/**
 * Handles preprocessing for Conditional/IfStatement nodes.
 */
function handlePreprocessConditional(analyzer, node, parent) {
	if (parent.consequent === node) {
		CodePath.getState(analyzer.codePath).makeIfConsequent();
	} else if (parent.alternate === node) {
		CodePath.getState(analyzer.codePath).makeIfAlternate();
	}
}

/**
 * Handles preprocessing for SwitchCase nodes.
 */
function handlePreprocessSwitchCase(analyzer, node, parent) {
	if (parent.consequent[0] === node) {
		CodePath.getState(analyzer.codePath).makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles preprocessing for TryStatement nodes.
 */
function handlePreprocessTryStatement(analyzer, node, parent) {
	if (parent.handler === node) {
		CodePath.getState(analyzer.codePath).makeCatchBlock();
	} else if (parent.finalizer === node) {
		CodePath.getState(analyzer.codePath).makeFinallyBlock();
	}
}

/**
 * Handles preprocessing for WhileStatement nodes.
 */
function handlePreprocessWhileStatement(analyzer, node, parent) {
	if (parent.test === node) {
		CodePath.getState(analyzer.codePath).makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		CodePath.getState(analyzer.codePath).makeWhileBody();
	}
}

/**
 * Handles preprocessing for DoWhileStatement nodes.
 */
function handlePreprocessDoWhileStatement(analyzer, node, parent) {
	if (parent.body === node) {
		CodePath.getState(analyzer.codePath).makeDoWhileBody();
	} else {
		assert(parent.test === node);
		CodePath.getState(analyzer.codePath).makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

/**
 * Handles preprocessing for ForStatement nodes.
 */
function handlePreprocessForStatement(analyzer, node, parent) {
	if (parent.test === node) {
		CodePath.getState(analyzer.codePath).makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		CodePath.getState(analyzer.codePath).makeForUpdate();
	} else if (parent.body === node) {
		CodePath.getState(analyzer.codePath).makeForBody();
	}
}

/**
 * Handles preprocessing for ForIn/OfStatement nodes.
 */
function handlePreprocessForInOfStatement(analyzer, node, parent) {
	if (parent.left === node) {
		CodePath.getState(analyzer.codePath).makeForInOfLeft();
	} else if (parent.right === node) {
		CodePath.getState(analyzer.codePath).makeForInOfRight();
	} else {
		assert(parent.body === node);
		CodePath.getState(analyzer.codePath).makeForInOfBody();
	}
}

/**
 * Handles preprocessing for AssignmentPattern nodes.
 */
function handlePreprocessAssignmentPattern(analyzer, node, parent) {
	if (parent.right === node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}

/**
 * Updates the code path due to the position of a given node in its parent.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 */
function preprocess(analyzer, node) {
	const parent = node.parent;
	switch (parent.type) {
		case "CallExpression":
			handlePreprocessCallExpression(analyzer, node, parent);
			break;
		case "MemberExpression":
			handlePreprocessMemberExpression(analyzer, node, parent);
			break;
		case "LogicalExpression":
			handlePreprocessLogicalExpression(analyzer, node, parent);
			break;
		case "AssignmentExpression":
			handlePreprocessAssignmentExpression(analyzer, node, parent);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			handlePreprocessConditional(analyzer, node, parent);
			break;
		case "SwitchCase":
			handlePreprocessSwitchCase(analyzer, node, parent);
			break;
		case "TryStatement":
			handlePreprocessTryStatement(analyzer, node, parent);
			break;
		case "WhileStatement":
			handlePreprocessWhileStatement(analyzer, node, parent);
			break;
		case "DoWhileStatement":
			handlePreprocessDoWhileStatement(analyzer, node, parent);
			break;
		case "ForStatement":
			handlePreprocessForStatement(analyzer, node, parent);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			handlePreprocessForInOfStatement(analyzer, node, parent);
			break;
		case "AssignmentPattern":
			handlePreprocessAssignmentPattern(analyzer, node, parent);
			break;
		default:
			break;
	}
}

/**
 * Starts a new code path and forwards current segments.
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The node that triggered the start.
 * @param {string} origin Reason for starting the code path.
 */
function startNewCodePath(analyzer, node, origin) {
	if (analyzer.codePath) {
		forwardCurrentToHead(analyzer, node);
		debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
	}
	analyzer.codePath = new CodePath({
		id: analyzer.idGenerator.next(),
		origin,
		upper: analyzer.codePath,
		onLooped: analyzer.onLooped,
	});
	debug.dump(`onCodePathStart ${analyzer.codePath.id}`);
	analyzer.emit("onCodePathStart", [analyzer.codePath, node]);
}

/**
 * Handles entering logic for a node that starts a new code path.
 */
function handleEnterStartCodePath(analyzer, node, type) {
	switch (type) {
		case "Program":
			startNewCodePath(analyzer, node, "program");
			break;
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			startNewCodePath(analyzer, node, "function");
			break;
		case "StaticBlock":
			startNewCodePath(analyzer, node, "class-static-block");
			break;
		default:
			break;
	}
}

/**
 * Handles entering logic for nodes that modify the current state.
 */
function handleEnterStateUpdates(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	switch (node.type) {
		case "ChainExpression":
			state.pushChainContext();
			break;
		case "CallExpression":
		case "MemberExpression":
			if (node.optional) state.makeOptionalNode();
			break;
		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) {
				state.pushChoiceContext(node.operator, isForkingByTrueOrFalse(node));
			}
			break;
		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) {
				state.pushChoiceContext(node.operator.slice(0, -1), isForkingByTrueOrFalse(node));
			}
			break;
		case "ConditionalExpression":
		case "IfStatement":
			state.pushChoiceContext("test", false);
			break;
		case "SwitchStatement":
			state.pushSwitchContext(node.cases.some(isCaseNode), getLabel(node));
			break;
		case "TryStatement":
			state.pushTryContext(Boolean(node.finalizer));
			break;
		case "SwitchCase":
			if (node.parent.discriminant !== node && node.parent.cases[0] !== node) {
				state.forkPath();
			}
			break;
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			state.pushLoopContext(node.type, getLabel(node));
			break;
		case "LabeledStatement":
			if (!breakableTypePattern.test(node.body.type)) {
				state.pushBreakContext(false, node.label.name);
			}
			break;
		default:
			break;
	}
}

/**
 * Updates the code path due to the type of a given node in entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 */
function processCodePathToEnter(analyzer, node) {
	if (isPropertyDefinitionValue(node)) {
		startNewCodePath(analyzer, node, "class-field-initializer");
	}
	handleEnterStartCodePath(analyzer, node, node.type);
	handleEnterStateUpdates(analyzer, node);
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

/**
 * Handles exiting logic for nodes that pop contexts.
 */
function handleExitPopContexts(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	switch (node.type) {
		case "ChainExpression":
			state.popChainContext();
			break;
		case "IfStatement":
		case "ConditionalExpression":
			state.popChoiceContext();
			break;
		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) state.popChoiceContext();
			break;
		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) state.popChoiceContext();
			break;
		case "SwitchStatement":
			state.popSwitchContext();
			break;
		case "TryStatement":
			state.popTryContext();
			break;
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			state.popLoopContext();
			break;
		case "AssignmentPattern":
			state.popForkContext();
			break;
		case "LabeledStatement":
			if (!breakableTypePattern.test(node.body.type)) state.popBreakContext();
			break;
		default:
			break;
	}
}

/**
 * Handles exiting logic for nodes that generate control‑flow events.
 * Returns `true` when the forward step should be skipped.
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The node being exited.
 * @returns {boolean} Whether to skip forwarding.
 */
function handleExitControlFlow(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	switch (node.type) {
		case "SwitchCase":
			if (node.consequent.length === 0) {
				state.makeSwitchCaseBody(true, !node.test);
			}
			return state.forkContext.reachable;
		case "BreakStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeBreak(node.label && node.label.name);
			return true;
		case "ContinueStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeContinue(node.label && node.label.name);
			return true;
		case "ReturnStatement":
			fowardCurrentAndMake(analyzer, node, state.makeReturn.bind(state));
			return true;
		case "ThrowStatement":
			fowardCurrentAndMake(analyzer, node, state.makeThrow.bind(state));
			return true;
		case "Identifier":
			if (isIdentifierReference(node)) {
				state.makeFirstThrowablePathInTryBlock();
				return true;
			}
			return false;
		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			state.makeFirstThrowablePathInTryBlock();
			return false;
		default:
			return false;
	}
}

/**
 * Helper to forward current segments then invoke a state method.
 */
function fowardCurrentAndMake(analyzer, node, makeFn) {
	forwardCurrentToHead(analyzer, node);
	makeFn();
}

/**
 * Updates the code path due to the type of a given node in leaving.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 */
function processCodePathToExit(analyzer, node) {
	handleExitPopContexts(analyzer, node);
	const skipForward = handleExitControlFlow(analyzer, node);
	if (!skipForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, CodePath.getState(analyzer.codePath), true);
}

/**
 * Ends the current code path.
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The node that ends the path.
 */
function endCurrentCodePath(analyzer, node) {
	let cp = analyzer.codePath;
	CodePath.getState(cp).makeFinal();
	leaveFromCurrentSegment(analyzer, node);
	debug.dump(`onCodePathEnd ${cp.id}`);
	analyzer.emit("onCodePathEnd", [cp, node]);
	debug.dumpDot(cp);
	analyzer.codePath = cp.upper;
	if (analyzer.codePath) {
		debug.dumpState(node, CodePath.getState(analyzer.codePath), true);
	}
}

/**
 * Updates the code path to finalize the current code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 */
function postprocess(analyzer, node) {
	switch (node.type) {
		case "Program":
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "StaticBlock":
			endCurrentCodePath(analyzer, node);
			break;
		case "CallExpression":
			if (node.optional && node.arguments.length === 0) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
			break;
		default:
			break;
	}
	if (isPropertyDefinitionValue(node)) {
		endCurrentCodePath(analyzer, node);
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
	 * @param {ASTNode} node A node which is entering.
	 */
	enterNode(node) {
		this.currentNode = node;
		if (node.parent) preprocess(this, node);
		processCodePathToEnter(this, node);
		this.original.enterNode(node);
		this.currentNode = null;
	}

	/**
	 * Does the process to leave a given AST node.
	 * @param {ASTNode} node A node which is leaving.
	 */
	leaveNode(node) {
		this.currentNode = node;
		processCodePathToExit(this, node);
		this.original.leaveNode(node);
		postprocess(this, node);
		this.currentNode = null;
	}

	/**
	 * Called when a code path loops.
	 * @param {CodePathSegment} fromSegment A segment of prev.
	 * @param {CodePathSegment} toSegment A segment of next.
	 */
	onLooped(fromSegment, toSegment) {
		if (fromSegment.reachable && toSegment.reachable) {
			debug.dump(`onCodePathSegmentLoop ${fromSegment.id} -> ${toSegment.id}`);
			this.emit("onCodePathSegmentLoop", [fromSegment, toSegment, this.currentNode]);
		}
	}
}

module.exports = CodePathAnalyzer;
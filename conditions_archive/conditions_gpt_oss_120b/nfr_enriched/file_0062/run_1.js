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
 * Checks whether a node is a `case` node (not `default`).
 * @param {ASTNode} node A `SwitchCase` node.
 * @returns {boolean} `true` if the node has a test.
 */
function isCaseNode(node) {
	return Boolean(node.test);
}

/**
 * Checks if a node is the value of a PropertyDefinition.
 * @param {ASTNode} node A node.
 * @returns {boolean} `true` if the node is a PropertyDefinition value.
 */
function isPropertyDefinitionValue(node) {
	const parent = node.parent;
	return parent && parent.type === "PropertyDefinition" && parent.value === node;
}

/**
 * Determines whether a logical operator should be handled.
 * @param {string} operator The operator.
 * @returns {boolean} `true` for &&, ||, ??.
 */
function isHandledLogicalOperator(operator) {
	return operator === "&&" || operator === "||" || operator === "??";
}

/**
 * Determines whether an assignment operator is a logical assignment.
 * @param {string} operator The operator.
 * @returns {boolean} `true` for &&=, ||=, ??=.
 */
function isLogicalAssignmentOperator(operator) {
	return operator === "&&=" || operator === "||=" || operator === "??=";
}

/**
 * Retrieves a label from a LabeledStatement parent.
 * @param {ASTNode} node A node.
 * @returns {string|null} The label name or null.
 */
function getLabel(node) {
	return node.parent.type === "LabeledStatement"
		? node.parent.label.name
		: null;
}

/**
 * Determines whether a logical expression forks on true/false.
 * @param {ASTNode} node A logical expression node.
 * @returns {boolean} `true` if it forks.
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
 * Returns the boolean value of a literal node, if simple.
 * @param {ASTNode} node A node.
 * @returns {boolean|undefined} Boolean value or undefined.
 */
function getBooleanValueIfSimpleConstant(node) {
	return node.type === "Literal" ? Boolean(node.value) : undefined;
}

/**
 * Checks whether an Identifier node is a reference.
 * @param {ASTNode} node An Identifier node.
 * @returns {boolean} `true` if it is a reference.
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
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 */
function fireLeavingEvents(analyzer, node) {
	const { currentSegments, headSegments } = CodePath.getState(analyzer.codePath);
	const max = Math.max(currentSegments.length, headSegments.length);
	for (let i = 0; i < max; ++i) {
		const cur = currentSegments[i];
		const head = headSegments[i];
		if (cur && cur !== head) {
			const ev = cur.reachable
				? "onCodePathSegmentEnd"
				: "onUnreachableCodePathSegmentEnd";
			debug.dump(`${ev} ${cur.id}`);
			analyzer.emit(ev, [cur, node]);
		}
	}
}

/**
 * Fires entering events for new head segments.
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 */
function fireEnteringEvents(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const { currentSegments, headSegments } = state;
	const max = Math.max(currentSegments.length, headSegments.length);
	for (let i = 0; i < max; ++i) {
		const cur = currentSegments[i];
		const head = headSegments[i];
		if (head && cur !== head) {
			const ev = head.reachable
				? "onCodePathSegmentStart"
				: "onUnreachableCodePathSegmentStart";
			debug.dump(`${ev} ${head.id}`);
			CodePathSegment.markUsed(head);
			analyzer.emit(ev, [head, node]);
		}
	}
}

/**
 * Moves the current segments to the head segments, emitting events.
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 */
function forwardCurrentToHead(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const { currentSegments, headSegments } = state;
	const max = Math.max(currentSegments.length, headSegments.length);

	// Leaving events.
	for (let i = 0; i < max; ++i) {
		const cur = currentSegments[i];
		const head = headSegments[i];
		if (cur && cur !== head) {
			const ev = cur.reachable
				? "onCodePathSegmentEnd"
				: "onUnreachableCodePathSegmentEnd";
			debug.dump(`${ev} ${cur.id}`);
			analyzer.emit(ev, [cur, node]);
		}
	}

	// Update state.
	state.currentSegments = headSegments;

	// Entering events.
	for (let i = 0; i < max; ++i) {
		const cur = currentSegments[i];
		const head = headSegments[i];
		if (head && cur !== head) {
			const ev = head.reachable
				? "onCodePathSegmentStart"
				: "onUnreachableCodePathSegmentStart";
			debug.dump(`${ev} ${head.id}`);
			CodePathSegment.markUsed(head);
			analyzer.emit(ev, [head, node]);
		}
	}
}

/**
 * Emits end events for all current segments.
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 */
function leaveFromCurrentSegment(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const { currentSegments } = state;
	for (let i = 0; i < currentSegments.length; ++i) {
		const seg = currentSegments[i];
		const ev = seg.reachable
			? "onCodePathSegmentEnd"
			: "onUnreachableCodePathSegmentEnd";
		debug.dump(`${ev} ${seg.id}`);
		analyzer.emit(ev, [seg, node]);
	}
	state.currentSegments = [];
}

/**
 * Handles preprocess logic for CallExpression parent.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleCallExpressionPreprocess(analyzer, node) {
	const parent = node.parent;
	if (parent.optional && parent.arguments.length >= 1 && parent.arguments[0] === node) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles preprocess logic for MemberExpression parent.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleMemberExpressionPreprocess(analyzer, node) {
	const parent = node.parent;
	if (parent.optional && parent.property === node) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles preprocess logic for LogicalExpression parent.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleLogicalExpressionPreprocess(analyzer, node) {
	const parent = node.parent;
	if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

/**
 * Handles preprocess logic for AssignmentExpression parent.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleAssignmentExpressionPreprocess(analyzer, node) {
	const parent = node.parent;
	if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

/**
 * Handles preprocess logic for Conditional/IfStatement parent.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleConditionalPreprocess(analyzer, node) {
	const parent = node.parent;
	if (parent.consequent === node) {
		CodePath.getState(analyzer.codePath).makeIfConsequent();
	} else if (parent.alternate === node) {
		CodePath.getState(analyzer.codePath).makeIfAlternate();
	}
}

/**
 * Handles preprocess logic for SwitchCase parent.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleSwitchCasePreprocess(analyzer, node) {
	const parent = node.parent;
	if (parent.consequent[0] === node) {
		CodePath.getState(analyzer.codePath).makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles preprocess logic for TryStatement parent.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleTryStatementPreprocess(analyzer, node) {
	const parent = node.parent;
	if (parent.handler === node) {
		CodePath.getState(analyzer.codePath).makeCatchBlock();
	} else if (parent.finalizer === node) {
		CodePath.getState(analyzer.codePath).makeFinallyBlock();
	}
}

/**
 * Handles preprocess logic for loop statements.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleLoopPreprocess(analyzer, node) {
	const parent = node.parent;
	const state = CodePath.getState(analyzer.codePath);
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

/**
 * Handles preprocess logic for DoWhileStatement.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleDoWhilePreprocess(analyzer, node) {
	const parent = node.parent;
	const state = CodePath.getState(analyzer.codePath);
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

/**
 * Handles preprocess logic for ForStatement.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleForStatementPreprocess(analyzer, node) {
	const parent = node.parent;
	const state = CodePath.getState(analyzer.codePath);
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

/**
 * Handles preprocess logic for ForIn/Of statements.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleForInOfPreprocess(analyzer, node) {
	const parent = node.parent;
	const state = CodePath.getState(analyzer.codePath);
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
 * Handles preprocess logic for AssignmentPattern.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleAssignmentPatternPreprocess(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	if (node.parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}

/**
 * Updates the code path due to the position of a node in its parent.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function preprocess(analyzer, node) {
	const parent = node.parent;
	switch (parent.type) {
		case "CallExpression":
			handleCallExpressionPreprocess(analyzer, node);
			break;
		case "MemberExpression":
			handleMemberExpressionPreprocess(analyzer, node);
			break;
		case "LogicalExpression":
			handleLogicalExpressionPreprocess(analyzer, node);
			break;
		case "AssignmentExpression":
			handleAssignmentExpressionPreprocess(analyzer, node);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			handleConditionalPreprocess(analyzer, node);
			break;
		case "SwitchCase":
			handleSwitchCasePreprocess(analyzer, node);
			break;
		case "TryStatement":
			handleTryStatementPreprocess(analyzer, node);
			break;
		case "WhileStatement":
			handleLoopPreprocess(analyzer, node);
			break;
		case "DoWhileStatement":
			handleDoWhilePreprocess(analyzer, node);
			break;
		case "ForStatement":
			handleForStatementPreprocess(analyzer, node);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			handleForInOfPreprocess(analyzer, node);
			break;
		case "AssignmentPattern":
			handleAssignmentPatternPreprocess(analyzer, node);
			break;
		default:
			// No preprocessing needed.
			break;
	}
}

/**
 * Starts a new code path if needed and emits related events.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {string} origin Reason for starting.
 */
function startCodePathIfNeeded(analyzer, node, origin) {
	if (!analyzer.codePath) {
		const codePath = new CodePath({
			id: analyzer.idGenerator.next(),
			origin,
			upper: null,
			onLooped: analyzer.onLooped,
		});
		analyzer.codePath = codePath;
		debug.dump(`onCodePathStart ${codePath.id}`);
		analyzer.emit("onCodePathStart", [codePath, node]);
		return;
	}
	// Existing path – forward current to head.
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

/**
 * Handles entering logic for a node type.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function processCodePathToEnter(analyzer, node) {
	const state = analyzer.codePath && CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	// Special case: class field initializer value.
	if (isPropertyDefinitionValue(node)) {
		startCodePathIfNeeded(analyzer, node, "class-field-initializer");
		// Continue processing the node after starting the path.
	}

	switch (node.type) {
		case "Program":
			startCodePathIfNeeded(analyzer, node, "program");
			break;
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			startCodePathIfNeeded(analyzer, node, "function");
			break;
		case "StaticBlock":
			startCodePathIfNeeded(analyzer, node, "class-static-block");
			break;
		case "ChainExpression":
			state.pushChainContext();
			break;
		case "CallExpression":
		case "MemberExpression":
			if (node.optional) state.makeOptionalNode();
			break;
		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) {
				state.pushChoiceContext(
					node.operator,
					isForkingByTrueOrFalse(node),
				);
			}
			break;
		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) {
				state.pushChoiceContext(
					node.operator.slice(0, -1),
					isForkingByTrueOrFalse(node),
				);
			}
			break;
		case "ConditionalExpression":
		case "IfStatement":
			state.pushChoiceContext("test", false);
			break;
		case "SwitchStatement":
			state.pushSwitchContext(
				node.cases.some(isCaseNode),
				getLabel(node),
			);
			break;
		case "TryStatement":
			state.pushTryContext(Boolean(node.finalizer));
			break;
		case "SwitchCase":
			if (parent.discriminant !== node && parent.cases[0] !== node) {
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
			// No action needed.
			break;
	}

	// Emit segment start events if the path changed.
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

/**
 * Handles exiting logic for a node type.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function processCodePathToExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	let skipForward = false;

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
		case "SwitchCase":
			if (node.consequent.length === 0) {
				state.makeSwitchCaseBody(true, !node.test);
			}
			if (state.forkContext.reachable) skipForward = true;
			break;
		case "TryStatement":
			state.popTryContext();
			break;
		case "BreakStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeBreak(node.label && node.label.name);
			skipForward = true;
			break;
		case "ContinueStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeContinue(node.label && node.label.name);
			skipForward = true;
			break;
		case "ReturnStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeReturn();
			skipForward = true;
			break;
		case "ThrowStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeThrow();
			skipForward = true;
			break;
		case "Identifier":
			if (isIdentifierReference(node)) {
				state.makeFirstThrowablePathInTryBlock();
				skipForward = true;
			}
			break;
		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			state.makeFirstThrowablePathInTryBlock();
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
			if (!breakableTypePattern.test(node.body.type)) {
				state.popBreakContext();
			}
			break;
		default:
			// No action needed.
			break;
	}

	if (!skipForward) forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, true);
}

/**
 * Ends a code path and emits final events.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
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
 * Handles post‑processing after a node is left.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
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
			// No action needed.
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
 * Implements the EventGenerator interface.
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
	 * Process entering a node.
	 * @param {ASTNode} node The node being entered.
	 */
	enterNode(node) {
		this.currentNode = node;

		if (node.parent) preprocess(this, node);
		processCodePathToEnter(this, node);
		this.original.enterNode(node);

		this.currentNode = null;
	}

	/**
	 * Process leaving a node.
	 * @param {ASTNode} node The node being left.
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
	 * @param {CodePathSegment} fromSegment The previous segment.
	 * @param {CodePathSegment} toSegment The next segment.
	 */
	onLooped(fromSegment, toSegment) {
		if (fromSegment.reachable && toSegment.reachable) {
			debug.dump(`onCodePathSegmentLoop ${fromSegment.id} -> ${toSegment.id}`);
			this.emit("onCodePathSegmentLoop", [
				fromSegment,
				toSegment,
				this.currentNode,
			]);
		}
	}
}

module.exports = CodePathAnalyzer;
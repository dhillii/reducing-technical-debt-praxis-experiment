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
	const handlers = {
		ConditionalExpression: true,
		IfStatement: true,
		WhileStatement: true,
		DoWhileStatement: true,
		ForStatement: true,
		LogicalExpression: isHandledLogicalOperator(parent.operator),
		AssignmentExpression: isLogicalAssignmentOperator(parent.operator),
	};

	return !!handlers[parent.type];
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

	const nonReferenceTypes = new Set([
		"LabeledStatement",
		"BreakStatement",
		"ContinueStatement",
		"ArrayPattern",
		"RestElement",
		"ImportSpecifier",
		"ImportDefaultSpecifier",
		"ImportNamespaceSpecifier",
		"CatchClause",
	]);

	if (nonReferenceTypes.has(parent.type)) {
		return false;
	}

	switch (parent.type) {
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
 * Handles preprocessing based on the node's parent type.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handlePreprocess(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	const handlers = {
		CallExpression() {
			if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node) {
				state.makeOptionalRight();
			}
		},
		MemberExpression() {
			if (parent.optional === true && parent.property === node) {
				state.makeOptionalRight();
			}
		},
		LogicalExpression() {
			if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
				state.makeLogicalRight();
			}
		},
		AssignmentExpression() {
			if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
				state.makeLogicalRight();
			}
		},
		ConditionalExpression() {
			if (parent.consequent === node) {
				state.makeIfConsequent();
			} else if (parent.alternate === node) {
				state.makeIfAlternate();
			}
		},
		IfStatement() {
			if (parent.consequent === node) {
				state.makeIfConsequent();
			} else if (parent.alternate === node) {
				state.makeIfAlternate();
			}
		},
		SwitchCase() {
			if (parent.consequent[0] === node) {
				state.makeSwitchCaseBody(false, !parent.test);
			}
		},
		TryStatement() {
			if (parent.handler === node) {
				state.makeCatchBlock();
			} else if (parent.finalizer === node) {
				state.makeFinallyBlock();
			}
		},
		WhileStatement() {
			if (parent.test === node) {
				state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
			} else {
				assert(parent.body === node);
				state.makeWhileBody();
			}
		},
		DoWhileStatement() {
			if (parent.body === node) {
				state.makeDoWhileBody();
			} else {
				assert(parent.test === node);
				state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
			}
		},
		ForStatement() {
			if (parent.test === node) {
				state.makeForTest(getBooleanValueIfSimpleConstant(node));
			} else if (parent.update === node) {
				state.makeForUpdate();
			} else if (parent.body === node) {
				state.makeForBody();
			}
		},
		ForInStatement() {
			handleForInOf(parent, node, state);
		},
		ForOfStatement() {
			handleForInOf(parent, node, state);
		},
		AssignmentPattern() {
			if (parent.right === node) {
				state.pushForkContext();
				state.forkBypassPath();
				state.forkPath();
			}
		},
	};

	if (handlers[parent.type]) {
		handlers[parent.type]();
	}
}

/**
 * Helper for ForIn/Of preprocessing.
 * @param {ASTNode} parent
 * @param {ASTNode} node
 * @param {Object} state
 */
function handleForInOf(parent, node, state) {
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
 * Handles entering logic for a node type.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleEnterNode(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (isPropertyDefinitionValue(node)) {
		startCodePath(analyzer, node, "class-field-initializer");
	}

	const startHandlers = {
		Program: "program",
		FunctionDeclaration: "function",
		FunctionExpression: "function",
		ArrowFunctionExpression: "function",
		StaticBlock: "class-static-block",
	};

	if (startHandlers[node.type]) {
		startCodePath(analyzer, node, startHandlers[node.type]);
		return;
	}

	const typeHandlers = {
		ChainExpression() {
			state.pushChainContext();
		},
		CallExpression() {
			if (node.optional === true) {
				state.makeOptionalNode();
			}
		},
		MemberExpression() {
			if (node.optional === true) {
				state.makeOptionalNode();
			}
		},
		LogicalExpression() {
			if (isHandledLogicalOperator(node.operator)) {
				state.pushChoiceContext(node.operator, isForkingByTrueOrFalse(node));
			}
		},
		AssignmentExpression() {
			if (isLogicalAssignmentOperator(node.operator)) {
				state.pushChoiceContext(node.operator.slice(0, -1), isForkingByTrueOrFalse(node));
			}
		},
		ConditionalExpression() {
			state.pushChoiceContext("test", false);
		},
		IfStatement() {
			state.pushChoiceContext("test", false);
		},
		SwitchStatement() {
			state.pushSwitchContext(node.cases.some(isCaseNode), getLabel(node));
		},
		TryStatement() {
			state.pushTryContext(Boolean(node.finalizer));
		},
		SwitchCase() {
			if (parent.discriminant !== node && parent.cases[0] !== node) {
				state.forkPath();
			}
		},
		WhileStatement() {
			state.pushLoopContext(node.type, getLabel(node));
		},
		DoWhileStatement() {
			state.pushLoopContext(node.type, getLabel(node));
		},
		ForStatement() {
			state.pushLoopContext(node.type, getLabel(node));
		},
		ForInStatement() {
			state.pushLoopContext(node.type, getLabel(node));
		},
		ForOfStatement() {
			state.pushLoopContext(node.type, getLabel(node));
		},
		LabeledStatement() {
			if (!breakableTypePattern.test(node.body.type)) {
				state.pushBreakContext(false, node.label.name);
			}
		},
	};

	if (typeHandlers[node.type]) {
		typeHandlers[node.type]();
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/**
 * Starts a new code path with a given origin.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 * @param {string} origin
 */
function startCodePath(analyzer, node, origin) {
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
 * Handles exiting logic for a node type.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handleExitNode(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	let dontForward = false;

	const exitHandlers = {
		ChainExpression() {
			state.popChainContext();
		},
		IfStatement() {
			state.popChoiceContext();
		},
		ConditionalExpression() {
			state.popChoiceContext();
		},
		LogicalExpression() {
			if (isHandledLogicalOperator(node.operator)) {
				state.popChoiceContext();
			}
		},
		AssignmentExpression() {
			if (isLogicalAssignmentOperator(node.operator)) {
				state.popChoiceContext();
			}
		},
		SwitchStatement() {
			state.popSwitchContext();
		},
		SwitchCase() {
			if (node.consequent.length === 0) {
				state.makeSwitchCaseBody(true, !node.test);
			}
			if (state.forkContext.reachable) {
				dontForward = true;
			}
		},
		TryStatement() {
			state.popTryContext();
		},
		BreakStatement() {
			forwardCurrentToHead(analyzer, node);
			state.makeBreak(node.label && node.label.name);
			dontForward = true;
		},
		ContinueStatement() {
			forwardCurrentToHead(analyzer, node);
			state.makeContinue(node.label && node.label.name);
			dontForward = true;
		},
		ReturnStatement() {
			forwardCurrentToHead(analyzer, node);
			state.makeReturn();
			dontForward = true;
		},
		ThrowStatement() {
			forwardCurrentToHead(analyzer, node);
			state.makeThrow();
			dontForward = true;
		},
		Identifier() {
			if (isIdentifierReference(node)) {
				state.makeFirstThrowablePathInTryBlock();
				dontForward = true;
			}
		},
		CallExpression() {
			state.makeFirstThrowablePathInTryBlock();
		},
		ImportExpression() {
			state.makeFirstThrowablePathInTryBlock();
		},
		MemberExpression() {
			state.makeFirstThrowablePathInTryBlock();
		},
		NewExpression() {
			state.makeFirstThrowablePathInTryBlock();
		},
		YieldExpression() {
			state.makeFirstThrowablePathInTryBlock();
		},
		WhileStatement() {
			state.popLoopContext();
		},
		DoWhileStatement() {
			state.popLoopContext();
		},
		ForStatement() {
			state.popLoopContext();
		},
		ForInStatement() {
			state.popLoopContext();
		},
		ForOfStatement() {
			state.popLoopContext();
		},
		AssignmentPattern() {
			state.popForkContext();
		},
		LabeledStatement() {
			if (!breakableTypePattern.test(node.body.type)) {
				state.popBreakContext();
			}
		},
	};

	if (exitHandlers[node.type]) {
		exitHandlers[node.type]();
	}

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

/**
 * Handles post‑processing for a node type.
 * @param {CodePathAnalyzer} analyzer
 * @param {ASTNode} node
 */
function handlePostprocess(analyzer, node) {
	function endCodePath() {
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

	const postHandlers = {
		Program: endCodePath,
		FunctionDeclaration: endCodePath,
		FunctionExpression: endCodePath,
		ArrowFunctionExpression: endCodePath,
		StaticBlock: endCodePath,
		CallExpression() {
			if (node.optional === true && node.arguments.length === 0) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
		},
	};

	if (postHandlers[node.type]) {
		postHandlers[node.type]();
	}

	if (isPropertyDefinitionValue(node)) {
		endCodePath();
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
			handlePreprocess(this, node);
		}
		handleEnterNode(this, node);
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
		handleExitNode(this, node);
		this.original.leaveNode(node);
		handlePostprocess(this, node);
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
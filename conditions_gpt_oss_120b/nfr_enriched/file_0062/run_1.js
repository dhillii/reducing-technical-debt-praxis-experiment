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
 * Starts a new code path and emits the appropriate events.
 *
 * @param {CodePathAnalyzer} analyzer The analyzer instance.
 * @param {ASTNode} node The current AST node.
 * @param {string} origin Reason for starting the code path.
 * @returns {void}
 */
function startCodePath(analyzer, node, origin) {
	const previous = analyzer.codePath;

	if (previous) {
		// Emit leaving events for the previous path.
		forwardCurrentToHead(analyzer, node);
		debug.dumpState(node, CodePath.getState(previous), false);
	}

	const newPath = new CodePath({
		id: analyzer.idGenerator.next(),
		origin,
		upper: previous,
		onLooped: analyzer.onLooped,
	});
	analyzer.codePath = newPath;

	debug.dump(`onCodePathStart ${newPath.id}`);
	analyzer.emit("onCodePathStart", [newPath, node]);
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
 * Handles preprocessing based on the parent node type.
 *
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocess(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;
	const handler = preprocessHandlers[parent.type];
	if (handler) {
		handler(analyzer, node, parent, state);
	}
}

/**
 * Handles postprocessing based on the node type.
 *
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function postprocess(analyzer, node) {
	const handler = postprocessHandlers[node.type];
	if (handler) {
		handler(analyzer, node);
	}
}

/**
 * Handles exiting logic based on the node type.
 *
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	let dontForward = false;

	const handler = exitHandlers[node.type];
	if (handler) {
		dontForward = handler(analyzer, node, state) || false;
	}

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

/**
 * Handles entering logic based on the node type.
 *
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function processCodePathToEnter(analyzer, node) {
	if (isPropertyDefinitionValue(node)) {
		startCodePath(analyzer, node, "class-field-initializer");
	}

	const handler = enterHandlers[node.type];
	if (handler) {
		handler(analyzer, node);
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

//------------------------------------------------------------------------------
// Preprocess Handlers
//------------------------------------------------------------------------------

const preprocessHandlers = {
	CallExpression(analyzer, node, parent, state) {
		if (
			parent.optional === true &&
			parent.arguments.length >= 1 &&
			parent.arguments[0] === node
		) {
			state.makeOptionalRight();
		}
	},
	MemberExpression(analyzer, node, parent, state) {
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
	},
	LogicalExpression(analyzer, node, parent, state) {
		if (
			parent.right === node &&
			isHandledLogicalOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	},
	AssignmentExpression(analyzer, node, parent, state) {
		if (
			parent.right === node &&
			isLogicalAssignmentOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	},
	ConditionalExpression(analyzer, node, parent, state) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},
	IfStatement(analyzer, node, parent, state) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},
	SwitchCase(analyzer, node, parent, state) {
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
	},
	TryStatement(analyzer, node, parent, state) {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	},
	WhileStatement(analyzer, node, parent, state) {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	},
	DoWhileStatement(analyzer, node, parent, state) {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	},
	ForStatement(analyzer, node, parent, state) {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	},
	ForInStatement(analyzer, node, parent, state) {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	ForOfStatement(analyzer, node, parent, state) {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	AssignmentPattern(analyzer, node, parent, state) {
		if (parent.right === node) {
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
	},
};

/**
 * Handles entering logic for specific node types.
 */
const enterHandlers = {
	Program(analyzer, node) {
		startCodePath(analyzer, node, "program");
	},
	FunctionDeclaration(analyzer, node) {
		startCodePath(analyzer, node, "function");
	},
	FunctionExpression(analyzer, node) {
		startCodePath(analyzer, node, "function");
	},
	ArrowFunctionExpression(analyzer, node) {
		startCodePath(analyzer, node, "function");
	},
	StaticBlock(analyzer, node) {
		startCodePath(analyzer, node, "class-static-block");
	},
	ChainExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushChainContext();
	},
	CallExpression(analyzer, node) {
		if (node.optional === true) {
			const state = CodePath.getState(analyzer.codePath);
			state.makeOptionalNode();
		}
	},
	MemberExpression(analyzer, node) {
		if (node.optional === true) {
			const state = CodePath.getState(analyzer.codePath);
			state.makeOptionalNode();
		}
	},
	LogicalExpression(analyzer, node) {
		if (isHandledLogicalOperator(node.operator)) {
			const state = CodePath.getState(analyzer.codePath);
			state.pushChoiceContext(
				node.operator,
				isForkingByTrueOrFalse(node),
			);
		}
	},
	AssignmentExpression(analyzer, node) {
		if (isLogicalAssignmentOperator(node.operator)) {
			const state = CodePath.getState(analyzer.codePath);
			state.pushChoiceContext(
				node.operator.slice(0, -1),
				isForkingByTrueOrFalse(node),
			);
		}
	},
	ConditionalExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushChoiceContext("test", false);
	},
	IfStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushChoiceContext("test", false);
	},
	SwitchStatement(analyzer, node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushSwitchContext(
			node.cases.some(isCaseNode),
			getLabel(node),
		);
	},
	TryStatement(analyzer, node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushTryContext(Boolean(node.finalizer));
	},
	SwitchCase(analyzer, node) {
		const parent = node.parent;
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			const state = CodePath.getState(analyzer.codePath);
			state.forkPath();
		}
	},
	WhileStatement(analyzer, node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushLoopContext(node.type, getLabel(node));
	},
	DoWhileStatement(analyzer, node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForStatement(analyzer, node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForInStatement(analyzer, node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForOfStatement(analyzer, node) {
		const state = CodePath.getState(analyzer.codePath);
		state.pushLoopContext(node.type, getLabel(node));
	},
	LabeledStatement(analyzer, node) {
		if (!breakableTypePattern.test(node.body.type)) {
			const state = CodePath.getState(analyzer.codePath);
			state.pushBreakContext(false, node.label.name);
		}
	},
};

/**
 * Handles exiting logic for specific node types.
 */
const exitHandlers = {
	ChainExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popChainContext();
	},
	IfStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popChoiceContext();
	},
	ConditionalExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popChoiceContext();
	},
	LogicalExpression(analyzer, node) {
		if (isHandledLogicalOperator(node.operator)) {
			const state = CodePath.getState(analyzer.codePath);
			state.popChoiceContext();
		}
	},
	AssignmentExpression(analyzer, node) {
		if (isLogicalAssignmentOperator(node.operator)) {
			const state = CodePath.getState(analyzer.codePath);
			state.popChoiceContext();
		}
	},
	SwitchStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popSwitchContext();
	},
	SwitchCase(analyzer, node) {
		const state = CodePath.getState(analyzer.codePath);
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		return state.forkContext.reachable;
	},
	TryStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popTryContext();
	},
	BreakStatement(analyzer, node) {
		forwardCurrentToHead(analyzer, node);
		const state = CodePath.getState(analyzer.codePath);
		state.makeBreak(node.label && node.label.name);
		return true;
	},
	ContinueStatement(analyzer, node) {
		forwardCurrentToHead(analyzer, node);
		const state = CodePath.getState(analyzer.codePath);
		state.makeContinue(node.label && node.label.name);
		return true;
	},
	ReturnStatement(analyzer, node) {
		forwardCurrentToHead(analyzer, node);
		const state = CodePath.getState(analyzer.codePath);
		state.makeReturn();
		return true;
	},
	ThrowStatement(analyzer, node) {
		forwardCurrentToHead(analyzer, node);
		const state = CodePath.getState(analyzer.codePath);
		state.makeThrow();
		return true;
	},
	Identifier(analyzer, node) {
		if (isIdentifierReference(node)) {
			const state = CodePath.getState(analyzer.codePath);
			state.makeFirstThrowablePathInTryBlock();
			return true;
		}
	},
	CallExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.makeFirstThrowablePathInTryBlock();
	},
	ImportExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.makeFirstThrowablePathInTryBlock();
	},
	MemberExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.makeFirstThrowablePathInTryBlock();
	},
	NewExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.makeFirstThrowablePathInTryBlock();
	},
	YieldExpression(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.makeFirstThrowablePathInTryBlock();
	},
	WhileStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popLoopContext();
	},
	DoWhileStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popLoopContext();
	},
	ForStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popLoopContext();
	},
	ForInStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popLoopContext();
	},
	ForOfStatement(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popLoopContext();
	},
	AssignmentPattern(analyzer) {
		const state = CodePath.getState(analyzer.codePath);
		state.popForkContext();
	},
	LabeledStatement(analyzer, node) {
		if (!breakableTypePattern.test(node.body.type)) {
			const state = CodePath.getState(analyzer.codePath);
			state.popBreakContext();
		}
	},
};

/**
 * Handles postprocessing logic for specific node types.
 */
const postprocessHandlers = {
	Program(analyzer, node) {
		endCurrentCodePath(analyzer, node);
	},
	FunctionDeclaration(analyzer, node) {
		endCurrentCodePath(analyzer, node);
	},
	FunctionExpression(analyzer, node) {
		endCurrentCodePath(analyzer, node);
	},
	ArrowFunctionExpression(analyzer, node) {
		endCurrentCodePath(analyzer, node);
	},
	StaticBlock(analyzer, node) {
		endCurrentCodePath(analyzer, node);
	},
	CallExpression(analyzer, node) {
		if (node.optional === true && node.arguments.length === 0) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
	},
};

/**
 * Ends the current code path and emits the appropriate events.
 *
 * @param {CodePathAnalyzer} analyzer The analyzer.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function endCurrentCodePath(analyzer, node) {
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

		// Updates the code path due to node's position in its parent node.
		if (node.parent) {
			preprocess(this, node);
		}

		// Updates the code path and emits events.
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

		// Updates the code path and emits events.
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
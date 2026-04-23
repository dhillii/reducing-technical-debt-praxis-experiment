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
 * Handler map for `preprocess` based on the parent node type.
 * @type {Object<string, Function>}
 */
const preprocessHandlers = {
	CallExpression(parent, node, state) {
		if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node) {
			state.makeOptionalRight();
		}
	},
	MemberExpression(parent, node, state) {
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
	},
	LogicalExpression(parent, node, state) {
		if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
			state.makeLogicalRight();
		}
	},
	AssignmentExpression(parent, node, state) {
		if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
			state.makeLogicalRight();
		}
	},
	ConditionalExpression(parent, node, state) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},
	IfStatement(parent, node, state) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},
	SwitchCase(parent, node, state) {
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
	},
	TryStatement(parent, node, state) {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	},
	WhileStatement(parent, node, state) {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	},
	DoWhileStatement(parent, node, state) {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	},
	ForStatement(parent, node, state) {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	},
	ForInStatement(parent, node, state) {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	ForOfStatement(parent, node, state) {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	AssignmentPattern(parent, node, state) {
		if (parent.right === node) {
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
	}
};

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
	const handler = preprocessHandlers[parent.type];

	if (handler) {
		handler(parent, node, state);
	}
}

/**
 * Handler map for `processCodePathToEnter` based on the node type.
 * @type {Object<string, Function>}
 */
const enterHandlers = {
	Program(node, analyzer, state, startCodePath) {
		startCodePath("program");
	},
	FunctionDeclaration(node, analyzer, state, startCodePath) {
		startCodePath("function");
	},
	FunctionExpression(node, analyzer, state, startCodePath) {
		startCodePath("function");
	},
	ArrowFunctionExpression(node, analyzer, state, startCodePath) {
		startCodePath("function");
	},
	StaticBlock(node, analyzer, state, startCodePath) {
		startCodePath("class-static-block");
	},
	ChainExpression(node, analyzer, state) {
		state.pushChainContext();
	},
	CallExpression(node, analyzer, state) {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	},
	MemberExpression(node, analyzer, state) {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	},
	LogicalExpression(node, analyzer, state) {
		if (isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(node.operator, isForkingByTrueOrFalse(node));
		}
	},
	AssignmentExpression(node, analyzer, state) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(node.operator.slice(0, -1), isForkingByTrueOrFalse(node));
		}
	},
	ConditionalExpression(node, analyzer, state) {
		state.pushChoiceContext("test", false);
	},
	IfStatement(node, analyzer, state) {
		state.pushChoiceContext("test", false);
	},
	SwitchStatement(node, analyzer, state) {
		state.pushSwitchContext(node.cases.some(isCaseNode), getLabel(node));
	},
	TryStatement(node, analyzer, state) {
		state.pushTryContext(Boolean(node.finalizer));
	},
	SwitchCase(node, analyzer, state) {
		const parent = node.parent;
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
	},
	WhileStatement(node, analyzer, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	DoWhileStatement(node, analyzer, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForStatement(node, analyzer, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForInStatement(node, analyzer, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForOfStatement(node, analyzer, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	LabeledStatement(node, analyzer, state) {
		if (!breakableTypePattern.test(node.body.type)) {
			state.pushBreakContext(false, node.label.name);
		}
	}
};

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

	// Special case for class field initializer values.
	if (isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");
		// fall through to normal processing
	}

	const handler = enterHandlers[node.type];
	if (handler) {
		handler(node, analyzer, state, startCodePath);
	}

	// Emits onCodePathSegmentStart events if updated.
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/**
 * Handler map for `processCodePathToExit` based on the node type.
 * @type {Object<string, Function>}
 */
const exitHandlers = {
	ChainExpression(node, analyzer, state) {
		state.popChainContext();
	},
	IfStatement(node, analyzer, state) {
		state.popChoiceContext();
	},
	ConditionalExpression(node, analyzer, state) {
		state.popChoiceContext();
	},
	LogicalExpression(node, analyzer, state) {
		if (isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
	},
	AssignmentExpression(node, analyzer, state) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.popChoiceContext();
		}
	},
	SwitchStatement(node, analyzer, state) {
		state.popSwitchContext();
	},
	SwitchCase(node, analyzer, state) {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		if (state.forkContext.reachable) {
			return { dontForward: true };
		}
	},
	TryStatement(node, analyzer, state) {
		state.popTryContext();
	},
	BreakStatement(node, analyzer, state) {
		forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label && node.label.name);
		return { dontForward: true };
	},
	ContinueStatement(node, analyzer, state) {
		forwardCurrentToHead(analyzer, node);
		state.makeContinue(node.label && node.label.name);
		return { dontForward: true };
	},
	ReturnStatement(node, analyzer, state) {
		forwardCurrentToHead(analyzer, node);
		state.makeReturn();
		return { dontForward: true };
	},
	ThrowStatement(node, analyzer, state) {
		forwardCurrentToHead(analyzer, node);
		state.makeThrow();
		return { dontForward: true };
	},
	Identifier(node, analyzer, state) {
		if (isIdentifierReference(node)) {
			state.makeFirstThrowablePathInTryBlock();
			return { dontForward: true };
		}
	},
	CallExpression(node, analyzer, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	ImportExpression(node, analyzer, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	MemberExpression(node, analyzer, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	NewExpression(node, analyzer, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	YieldExpression(node, analyzer, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	WhileStatement(node, analyzer, state) {
		state.popLoopContext();
	},
	DoWhileStatement(node, analyzer, state) {
		state.popLoopContext();
	},
	ForStatement(node, analyzer, state) {
		state.popLoopContext();
	},
	ForInStatement(node, analyzer, state) {
		state.popLoopContext();
	},
	ForOfStatement(node, analyzer, state) {
		state.popLoopContext();
	},
	AssignmentPattern(node, analyzer, state) {
		state.popForkContext();
	},
	LabeledStatement(node, analyzer, state) {
		if (!breakableTypePattern.test(node.body.type)) {
			state.popBreakContext();
		}
	}
};

/**
 * Updates the code path due to the type of a given node in leaving.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const handler = exitHandlers[node.type];
	let result = {};

	if (handler) {
		result = handler(node, analyzer, state) || {};
	}

	if (!result.dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

/**
 * Handler map for `postprocess` based on the node type.
 * @type {Object<string, Function>}
 */
const postprocessHandlers = {
	Program(node, analyzer) {
		endCodePath(analyzer, node);
	},
	FunctionDeclaration(node, analyzer) {
		endCodePath(analyzer, node);
	},
	FunctionExpression(node, analyzer) {
		endCodePath(analyzer, node);
	},
	ArrowFunctionExpression(node, analyzer) {
		endCodePath(analyzer, node);
	},
	StaticBlock(node, analyzer) {
		endCodePath(analyzer, node);
	},
	CallExpression(node, analyzer) {
		if (node.optional === true && node.arguments.length === 0) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
	}
};

/**
 * Ends the code path for the current node.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function endCodePath(analyzer, node) {
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

/**
 * Updates the code path to finalize the current code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function postprocess(analyzer, node) {
	const handler = postprocessHandlers[node.type];
	if (handler) {
		handler(node, analyzer);
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
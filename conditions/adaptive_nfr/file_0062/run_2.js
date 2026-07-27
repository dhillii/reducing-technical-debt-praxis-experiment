"use strict";

const assert = require("../../shared/assert"),
	{ breakableTypePattern } = require("../../shared/ast-utils"),
	CodePath = require("./code-path"),
	CodePathSegment = require("./code-path-segment"),
	IdGenerator = require("./id-generator"),
	debug = require("./debug-helpers");

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

	const nonReferenceParents = new Set([
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

	if (nonReferenceParents.has(parent.type)) {
		return false;
	}

	const declarationParents = new Set([
		"FunctionDeclaration",
		"FunctionExpression",
		"ArrowFunctionExpression",
		"ClassDeclaration",
		"ClassExpression",
		"VariableDeclarator",
	]);

	if (declarationParents.has(parent.type)) {
		return parent.id !== node;
	}

	if (parent.type === "Property" || parent.type === "PropertyDefinition" || parent.type === "MethodDefinition") {
		return parent.key !== node || parent.computed || parent.shorthand;
	}

	if (parent.type === "AssignmentPattern") {
		return parent.key !== node;
	}

	return true;
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
 * Handles CallExpression preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessCallExpression(state, parent, node) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

/**
 * Handles MemberExpression preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessMemberExpression(state, parent, node) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

/**
 * Handles LogicalExpression preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessLogicalExpression(state, parent, node) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles AssignmentExpression preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessAssignmentExpression(state, parent, node) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles ConditionalExpression and IfStatement preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessConditional(state, parent, node) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

/**
 * Handles SwitchCase preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessSwitchCase(state, parent, node) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles TryStatement preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessTryStatement(state, parent, node) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

/**
 * Handles WhileStatement preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessWhileStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

/**
 * Handles DoWhileStatement preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessDoWhileStatement(state, parent, node) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

/**
 * Handles ForStatement preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessForStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

/**
 * Handles ForInStatement and ForOfStatement preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessForInOfStatement(state, parent, node) {
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
 * Handles AssignmentPattern preprocessing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function preprocessAssignmentPattern(state, parent, node) {
	if (parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}

/**
 * Preprocessor dispatch table mapping parent node types to handler functions.
 * @type {Object<string, Function>}
 */
const preprocessHandlers = {
	CallExpression: preprocessCallExpression,
	MemberExpression: preprocessMemberExpression,
	LogicalExpression: preprocessLogicalExpression,
	AssignmentExpression: preprocessAssignmentExpression,
	ConditionalExpression: preprocessConditional,
	IfStatement: preprocessConditional,
	SwitchCase: preprocessSwitchCase,
	TryStatement: preprocessTryStatement,
	WhileStatement: preprocessWhileStatement,
	DoWhileStatement: preprocessDoWhileStatement,
	ForStatement: preprocessForStatement,
	ForInStatement: preprocessForInOfStatement,
	ForOfStatement: preprocessForInOfStatement,
	AssignmentPattern: preprocessAssignmentPattern,
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
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;
	const handler = preprocessHandlers[parent.type];

	if (handler) {
		handler(state, parent, node);
	}
}

/**
 * Handles Program and function code path starts.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current node.
 * @param {Function} startCodePath Function to start a code path.
 * @returns {void}
 */
function processCodePathStart(analyzer, node, startCodePath) {
	switch (node.type) {
		case "Program":
			startCodePath("program");
			break;
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			startCodePath("function");
			break;
		case "StaticBlock":
			startCodePath("class-static-block");
			break;
	}
}

/**
 * Handles optional chaining and logical operations.
 * @param {Object} state The code path state.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function processOptionalAndLogical(state, node) {
	switch (node.type) {
		case "ChainExpression":
			state.pushChainContext();
			break;
		case "CallExpression":
			if (node.optional === true) {
				state.makeOptionalNode();
			}
			break;
		case "MemberExpression":
			if (node.optional === true) {
				state.makeOptionalNode();
			}
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
	}
}

/**
 * Handles control flow statements.
 * @param {Object} state The code path state.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function processControlFlow(state, node) {
	switch (node.type) {
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
	}
}

/**
 * Handles SwitchCase special processing.
 * @param {Object} state The code path state.
 * @param {ASTNode} parent The parent node.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function processSwitchCase(state, parent, node) {
	if (parent.discriminant !== node && parent.cases[0] !== node) {
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
			forwardCurrentToHead(analyzer, node);
			debug.dumpState(node, state, false);
		}

		codePath = analyzer.codePath = new CodePath({
			id: analyzer.idGenerator.next(),
			origin,
			upper: codePath,
			onLooped: analyzer.onLooped,
		});
		state = CodePath.getState(codePath);

		debug.dump(`onCodePathStart ${codePath.id}`);
		analyzer.emit("onCodePathStart", [codePath, node]);
	}

	if (isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");
	}

	processCodePathStart(analyzer, node, startCodePath);
	processOptionalAndLogical(state, node);
	processControlFlow(state, node);

	if (node.type === "SwitchCase") {
		processSwitchCase(state, parent, node);
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/**
 * Handles exit processing for optional and logical operations.
 * @param {Object} state The code path state.
 * @param {ASTNode} node The current node.
 * @returns {boolean} Whether to skip forwarding.
 */
function processExitOptionalAndLogical(state, node) {
	switch (node.type) {
		case "ChainExpression":
			state.popChainContext();
			break;
		case "IfStatement":
		case "ConditionalExpression":
			state.popChoiceContext();
			break;
		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) {
				state.popChoiceContext();
			}
			break;
		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) {
				state.popChoiceContext();
			}
			break;
	}
	return false;
}

/**
 * Handles exit processing for control flow statements.
 * @param {Object} state The code path state.
 * @param {ASTNode} node The current node.
 * @returns {boolean} Whether to skip forwarding.
 */
function processExitControlFlow(state, node) {
	switch (node.type) {
		case "SwitchStatement":
			state.popSwitchContext();
			break;
		case "SwitchCase":
			if (node.consequent.length === 0) {
				state.makeSwitchCaseBody(true, !node.test);
			}
			if (state.forkContext.reachable) {
				return true;
			}
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
		case "LabeledStatement":
			if (!breakableTypePattern.test(node.body.type)) {
				state.popBreakContext();
			}
			break;
	}
	return false;
}

/**
 * Handles exit processing for jump statements.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {Object} state The code path state.
 * @param {ASTNode} node The current node.
 * @returns {boolean} Whether to skip forwarding.
 */
function processExitJumpStatements(analyzer, state, node) {
	switch (node.type) {
		case "BreakStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeBreak(node.label && node.label.name);
			return true;
		case "ContinueStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeContinue(node.label && node.label.name);
			return true;
		case "ReturnStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeReturn();
			return true;
		case "ThrowStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeThrow();
			return true;
	}
	return false;
}

/**
 * Handles exit processing for throwable expressions.
 * @param {Object} state The code path state.
 * @param {ASTNode} node The current node.
 * @returns {boolean} Whether to skip forwarding.
 */
function processExitThrowable(state, node) {
	switch (node.type) {
		case "Identifier":
			if (isIdentifierReference(node)) {
				state.makeFirstThrowablePathInTryBlock();
				return true;
			}
			break;
		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			state.makeFirstThrowablePathInTryBlock();
			break;
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
	let dontForward = false;

	dontForward = processExitOptionalAndLogical(state, node) || dontForward;
	dontForward = processExitControlFlow(state, node) || dontForward;
	dontForward = processExitJumpStatements(analyzer, state, node) || dontForward;
	dontForward = processExitThrowable(state, node) || dontForward;

	if (node.type === "AssignmentPattern") {
		state.popForkContext();
	}

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

/**
 * Ends the code path for the current node.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current node.
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
 * Handles code path ending for specific node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current node.
 * @returns {void}
 */
function processCodePathEnd(analyzer, node) {
	const endableTypes = new Set([
		"Program",
		"FunctionDeclaration",
		"FunctionExpression",
		"ArrowFunctionExpression",
		"StaticBlock",
	]);

	if (endableTypes.has(node.type)) {
		endCodePath(analyzer, node);
	}
}

/**
 * Updates the code path to finalize the current code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function postprocess(analyzer, node) {
	processCodePathEnd(analyzer, node);

	if (node.optional === true && node.arguments && node.arguments.length === 0) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}

	if (isPropertyDefinitionValue(node)) {
		endCodePath(analyzer, node);
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
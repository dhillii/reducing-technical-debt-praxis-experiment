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

	// Handle CallExpression
	if (parent.type === "CallExpression") {
		if (
			parent.optional === true &&
			parent.arguments.length >= 1 &&
			parent.arguments[0] === node
		) {
			state.makeOptionalRight();
		}
	}
	// Handle MemberExpression
	else if (parent.type === "MemberExpression") {
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
	}
	// Handle LogicalExpression
	else if (parent.type === "LogicalExpression") {
		if (
			parent.right === node &&
			isHandledLogicalOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	}
	// Handle AssignmentExpression
	else if (parent.type === "AssignmentExpression") {
		if (
			parent.right === node &&
			isLogicalAssignmentOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	}
	// Handle ConditionalExpression and IfStatement
	else if (parent.type === "ConditionalExpression" || parent.type === "IfStatement") {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	}
	// Handle SwitchCase
	else if (parent.type === "SwitchCase") {
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
	}
	// Handle TryStatement
	else if (parent.type === "TryStatement") {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	}
	// Handle WhileStatement
	else if (parent.type === "WhileStatement") {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	}
	// Handle DoWhileStatement
	else if (parent.type === "DoWhileStatement") {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	}
	// Handle ForStatement
	else if (parent.type === "ForStatement") {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	}
	// Handle ForInStatement and ForOfStatement
	else if (parent.type === "ForInStatement" || parent.type === "ForOfStatement") {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	}
	// Handle AssignmentPattern
	else if (parent.type === "AssignmentPattern") {
		if (parent.right === node) {
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
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

	// Handle Program
	if (node.type === "Program") {
		startCodePath("program");
	}
	// Handle FunctionDeclaration, FunctionExpression, ArrowFunctionExpression
	else if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
		startCodePath("function");
	}
	// Handle StaticBlock
	else if (node.type === "StaticBlock") {
		startCodePath("class-static-block");
	}
	// Handle ChainExpression
	else if (node.type === "ChainExpression") {
		state.pushChainContext();
	}
	// Handle CallExpression
	else if (node.type === "CallExpression") {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	}
	// Handle MemberExpression
	else if (node.type === "MemberExpression") {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	}
	// Handle LogicalExpression
	else if (node.type === "LogicalExpression") {
		if (isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator,
				isForkingByTrueOrFalse(node),
			);
		}
	}
	// Handle AssignmentExpression
	else if (node.type === "AssignmentExpression") {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator.slice(0, -1), // removes `=` from the end
				isForkingByTrueOrFalse(node),
			);
		}
	}
	// Handle ConditionalExpression and IfStatement
	else if (node.type === "ConditionalExpression" || node.type === "IfStatement") {
		state.pushChoiceContext("test", false);
	}
	// Handle SwitchStatement
	else if (node.type === "SwitchStatement") {
		state.pushSwitchContext(
			node.cases.some(isCaseNode),
			getLabel(node),
		);
	}
	// Handle TryStatement
	else if (node.type === "TryStatement") {
		state.pushTryContext(Boolean(node.finalizer));
	}
	// Handle SwitchCase
	else if (node.type === "SwitchCase") {
		/*
		 * Fork if this node is after the 2st node in `cases`.
		 * It's similar to `else` blocks.
		 * The next `test` node is processed in this path.
		 */
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
	}
	// Handle WhileStatement, DoWhileStatement, ForStatement, ForInStatement, ForOfStatement
	else if (node.type === "WhileStatement" || node.type === "DoWhileStatement" || node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement") {
		state.pushLoopContext(node.type, getLabel(node));
	}
	// Handle LabeledStatement
	else if (node.type === "LabeledStatement") {
		if (!breakableTypePattern.test(node.body.type)) {
			state.pushBreakContext(false, node.label.name);
		}
	}

	// Emits onCodePathSegmentStart events if updated.
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
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

	// Handle ChainExpression
	if (node.type === "ChainExpression") {
		state.popChainContext();
	}
	// Handle IfStatement and ConditionalExpression
	else if (node.type === "IfStatement" || node.type === "ConditionalExpression") {
		state.popChoiceContext();
	}
	// Handle LogicalExpression
	else if (node.type === "LogicalExpression") {
		if (isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
	}
	// Handle AssignmentExpression
	else if (node.type === "AssignmentExpression") {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.popChoiceContext();
		}
	}
	// Handle SwitchStatement
	else if (node.type === "SwitchStatement") {
		state.popSwitchContext();
	}
	// Handle SwitchCase
	else if (node.type === "SwitchCase") {
		/*
		 * This is the same as the process at the 1st `consequent` node in
		 * `preprocess` function.
		 * Must do if this `consequent` is empty.
		 */
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		if (state.forkContext.reachable) {
			dontForward = true;
		}
	}
	// Handle TryStatement
	else if (node.type === "TryStatement") {
		state.popTryContext();
	}
	// Handle BreakStatement
	else if (node.type === "BreakStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label && node.label.name);
		dontForward = true;
	}
	// Handle ContinueStatement
	else if (node.type === "ContinueStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeContinue(node.label && node.label.name);
		dontForward = true;
	}
	// Handle ReturnStatement
	else if (node.type === "ReturnStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeReturn();
		dontForward = true;
	}
	// Handle ThrowStatement
	else if (node.type === "ThrowStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeThrow();
		dontForward = true;
	}
	// Handle Identifier
	else if (node.type === "Identifier") {
		if (isIdentifierReference(node)) {
			state.makeFirstThrowablePathInTryBlock();
			dontForward = true;
		}
	}
	// Handle CallExpression, ImportExpression, MemberExpression, NewExpression, YieldExpression
	else if (node.type === "CallExpression" || node.type === "ImportExpression" || node.type === "MemberExpression" || node.type === "NewExpression" || node.type === "YieldExpression") {
		state.makeFirstThrowablePathInTryBlock();
	}
	// Handle WhileStatement, DoWhileStatement, ForStatement, ForInStatement, ForOfStatement
	else if (node.type === "WhileStatement" || node.type === "DoWhileStatement" || node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement") {
		state.popLoopContext();
	}
	// Handle AssignmentPattern
	else if (node.type === "AssignmentPattern") {
		state.popForkContext();
	}
	// Handle LabeledStatement
	else if (node.type === "LabeledStatement") {
		if (!breakableTypePattern.test(node.body.type)) {
			state.popBreakContext();
		}
	}

	// Emits onCodePathSegmentStart events if updated.
	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
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

	// Handle Program, FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, StaticBlock
	if (node.type === "Program" || node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "StaticBlock") {
		endCodePath();
	}
	// Handle CallExpression
	else if (node.type === "CallExpression") {
		if (node.optional === true && node.arguments.length === 0) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
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
```
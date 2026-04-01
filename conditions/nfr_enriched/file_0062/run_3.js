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
 * Emits segment end events for current segments.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {CodePathSegment[]} segments The segments to process.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function emitSegmentEndEvents(analyzer, segments, node) {
	for (let i = 0; i < segments.length; ++i) {
		const segment = segments[i];
		const eventName = segment.reachable
			? "onCodePathSegmentEnd"
			: "onUnreachableCodePathSegmentEnd";

		debug.dump(`${eventName} ${segment.id}`);
		analyzer.emit(eventName, [segment, node]);
	}
}

/**
 * Emits segment start events for head segments.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {CodePathSegment[]} segments The segments to process.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function emitSegmentStartEvents(analyzer, segments, node) {
	for (let i = 0; i < segments.length; ++i) {
		const segment = segments[i];
		const eventName = segment.reachable
			? "onCodePathSegmentStart"
			: "onUnreachableCodePathSegmentStart";

		debug.dump(`${eventName} ${segment.id}`);
		CodePathSegment.markUsed(segment);
		analyzer.emit(eventName, [segment, node]);
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

	// Fires leaving events.
	for (let i = 0; i < end; ++i) {
		const currentSegment = currentSegments[i];
		const headSegment = headSegments[i];

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
	for (let i = 0; i < end; ++i) {
		const currentSegment = currentSegments[i];
		const headSegment = headSegments[i];

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
 * Handles optional chaining and logical operators in preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent AST node.
 * @returns {void}
 */
function preprocessOptionalAndLogical(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	switch (parent.type) {
		case "CallExpression":
			if (
				parent.optional === true &&
				parent.arguments.length >= 1 &&
				parent.arguments[0] === node
			) {
				state.makeOptionalRight();
			}
			break;
		case "MemberExpression":
			if (parent.optional === true && parent.property === node) {
				state.makeOptionalRight();
			}
			break;
		case "LogicalExpression":
			if (
				parent.right === node &&
				isHandledLogicalOperator(parent.operator)
			) {
				state.makeLogicalRight();
			}
			break;
		case "AssignmentExpression":
			if (
				parent.right === node &&
				isLogicalAssignmentOperator(parent.operator)
			) {
				state.makeLogicalRight();
			}
			break;
		default:
			break;
	}
}

/**
 * Handles conditional and control flow statements in preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent AST node.
 * @returns {void}
 */
function preprocessConditionalAndControl(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	switch (parent.type) {
		case "ConditionalExpression":
		case "IfStatement":
			if (parent.consequent === node) {
				state.makeIfConsequent();
			} else if (parent.alternate === node) {
				state.makeIfAlternate();
			}
			break;

		case "SwitchCase":
			if (parent.consequent[0] === node) {
				state.makeSwitchCaseBody(false, !parent.test);
			}
			break;

		case "TryStatement":
			if (parent.handler === node) {
				state.makeCatchBlock();
			} else if (parent.finalizer === node) {
				state.makeFinallyBlock();
			}
			break;

		default:
			break;
	}
}

/**
 * Handles loop statements in preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent AST node.
 * @returns {void}
 */
function preprocessLoops(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	switch (parent.type) {
		case "WhileStatement":
			if (parent.test === node) {
				state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
			} else {
				assert(parent.body === node);
				state.makeWhileBody();
			}
			break;

		case "DoWhileStatement":
			if (parent.body === node) {
				state.makeDoWhileBody();
			} else {
				assert(parent.test === node);
				state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
			}
			break;

		case "ForStatement":
			if (parent.test === node) {
				state.makeForTest(getBooleanValueIfSimpleConstant(node));
			} else if (parent.update === node) {
				state.makeForUpdate();
			} else if (parent.body === node) {
				state.makeForBody();
			}
			break;

		case "ForInStatement":
		case "ForOfStatement":
			if (parent.left === node) {
				state.makeForInOfLeft();
			} else if (parent.right === node) {
				state.makeForInOfRight();
			} else {
				assert(parent.body === node);
				state.makeForInOfBody();
			}
			break;

		default:
			break;
	}
}

/**
 * Handles assignment patterns in preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent AST node.
 * @returns {void}
 */
function preprocessAssignmentPattern(analyzer, node, parent) {
	if (parent.type === "AssignmentPattern" && parent.right === node) {
		const state = CodePath.getState(analyzer.codePath);
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
	const parent = node.parent;

	preprocessOptionalAndLogical(analyzer, node, parent);
	preprocessConditionalAndControl(analyzer, node, parent);
	preprocessLoops(analyzer, node, parent);
	preprocessAssignmentPattern(analyzer, node, parent);
}

/**
 * Handles code path start for various node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {Function} startCodePath Function to start a new code path.
 * @returns {void}
 */
function processCodePathStartForNodeType(analyzer, node, startCodePath) {
	const state = CodePath.getState(analyzer.codePath);

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
 * @returns {void}
 */
function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);

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

	processCodePathStartForNodeType(analyzer, node, startCodePath);

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/**
 * Handles code path exit for choice contexts.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {boolean} `true` if forward should be skipped.
 */
function processCodePathExitForChoices(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	switch (node.type) {
		case "IfStatement":
		case "ConditionalExpression":
			state.popChoiceContext();
			return false;

		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) {
				state.popChoiceContext();
			}
			return false;

		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) {
				state.popChoiceContext();
			}
			return false;

		default:
			return false;
	}
}

/**
 * Handles code path exit for control flow statements.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {boolean} `true` if forward should be skipped.
 */
function processCodePathExitForControlFlow(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

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

		default:
			return false;
	}
}

/**
 * Handles code path exit for other node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {boolean} `true` if forward should be skipped.
 */
function processCodePathExitForOtherTypes(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	switch (node.type) {
		case "ChainExpression":
			state.popChainContext();
			return false;

		case "SwitchStatement":
			state.popSwitchContext();
			return false;

		case "SwitchCase":
			if (node.consequent.length === 0) {
				state.makeSwitchCaseBody(true, !node.test);
			}
			return state.forkContext.reachable;

		case "TryStatement":
			state.popTryContext();
			return false;

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

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			state.popLoopContext();
			return false;

		case "AssignmentPattern":
			state.popForkContext();
			return false;

		case "LabeledStatement":
			if (!breakableTypePattern.test(node.body.type)) {
				state.popBreakContext();
			}
			return false;

		default:
			return false;
	}
}

/**
 * Updates the code path due to the type of a given node in leaving.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToExit(analyzer, node) {
	let dontForward = false;

	dontForward = processCodePathExitForChoices(analyzer, node) || dontForward;
	dontForward = processCodePathExitForControlFlow(analyzer, node) || dontForward;
	dontForward = processCodePathExitForOtherTypes(analyzer, node) || dontForward;

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, CodePath.getState(analyzer.codePath), true);
}

/**
 * Ends the current code path and emits related events.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
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
 * Handles code path end for specific node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathEnd(analyzer, node) {
	switch (node.type) {
		case "Program":
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "StaticBlock":
			endCodePath(analyzer, node);
			break;

		case "CallExpression":
			if (node.optional === true && node.arguments.length === 0) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
			break;

		default:
			break;
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
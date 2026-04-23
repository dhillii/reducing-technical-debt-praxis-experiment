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
 * Handles preprocessing for CallExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessCallExpression(analyzer, node) {
	const parent = node.parent;

	if (
		parent.type === "CallExpression" &&
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles preprocessing for MemberExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessMemberExpression(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "MemberExpression" && parent.optional === true && parent.property === node) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles preprocessing for LogicalExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessLogicalExpression(analyzer, node) {
	const parent = node.parent;

	if (
		parent.type === "LogicalExpression" &&
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

/**
 * Handles preprocessing for AssignmentExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessAssignmentExpression(analyzer, node) {
	const parent = node.parent;

	if (
		parent.type === "AssignmentExpression" &&
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		CodePath.getState(analyzer.codePath).makeLogicalRight();
	}
}

/**
 * Handles preprocessing for ConditionalExpression and IfStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessConditionalOrIf(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "ConditionalExpression" || parent.type === "IfStatement") {
		if (parent.consequent === node) {
			CodePath.getState(analyzer.codePath).makeIfConsequent();
		} else if (parent.alternate === node) {
			CodePath.getState(analyzer.codePath).makeIfAlternate();
		}
	}
}

/**
 * Handles preprocessing for SwitchCase nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessSwitchCase(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "SwitchCase" && parent.consequent[0] === node) {
		CodePath.getState(analyzer.codePath).makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles preprocessing for TryStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessTryStatement(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "TryStatement") {
		if (parent.handler === node) {
			CodePath.getState(analyzer.codePath).makeCatchBlock();
		} else if (parent.finalizer === node) {
			CodePath.getState(analyzer.codePath).makeFinallyBlock();
		}
	}
}

/**
 * Handles preprocessing for WhileStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessWhileStatement(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "WhileStatement") {
		if (parent.test === node) {
			CodePath.getState(analyzer.codePath).makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			CodePath.getState(analyzer.codePath).makeWhileBody();
		}
	}
}

/**
 * Handles preprocessing for DoWhileStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessDoWhileStatement(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "DoWhileStatement") {
		if (parent.body === node) {
			CodePath.getState(analyzer.codePath).makeDoWhileBody();
		} else {
			assert(parent.test === node);
			CodePath.getState(analyzer.codePath).makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	}
}

/**
 * Handles preprocessing for ForStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessForStatement(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "ForStatement") {
		if (parent.test === node) {
			CodePath.getState(analyzer.codePath).makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			CodePath.getState(analyzer.codePath).makeForUpdate();
		} else if (parent.body === node) {
			CodePath.getState(analyzer.codePath).makeForBody();
		}
	}
}

/**
 * Handles preprocessing for ForInStatement and ForOfStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessForInOrOfStatement(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "ForInStatement" || parent.type === "ForOfStatement") {
		if (parent.left === node) {
			CodePath.getState(analyzer.codePath).makeForInOfLeft();
		} else if (parent.right === node) {
			CodePath.getState(analyzer.codePath).makeForInOfRight();
		} else {
			assert(parent.body === node);
			CodePath.getState(analyzer.codePath).makeForInOfBody();
		}
	}
}

/**
 * Handles preprocessing for AssignmentPattern nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessAssignmentPattern(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "AssignmentPattern" && parent.right === node) {
		CodePath.getState(analyzer.codePath).pushForkContext();
		CodePath.getState(analyzer.codePath).forkBypassPath();
		CodePath.getState(analyzer.codePath).forkPath();
	}
}

/**
 * Handles preprocessing for all node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocess(analyzer, node) {
	const parent = node.parent;

	switch (parent.type) {
		case "CallExpression":
			preprocessCallExpression(analyzer, node);
			break;
		case "MemberExpression":
			preprocessMemberExpression(analyzer, node);
			break;
		case "LogicalExpression":
			preprocessLogicalExpression(analyzer, node);
			break;
		case "AssignmentExpression":
			preprocessAssignmentExpression(analyzer, node);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			preprocessConditionalOrIf(analyzer, node);
			break;
		case "SwitchCase":
			preprocessSwitchCase(analyzer, node);
			break;
		case "TryStatement":
			preprocessTryStatement(analyzer, node);
			break;
		case "WhileStatement":
			preprocessWhileStatement(analyzer, node);
			break;
		case "DoWhileStatement":
			preprocessDoWhileStatement(analyzer, node);
			break;
		case "ForStatement":
			preprocessForStatement(analyzer, node);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			preprocessForInOrOfStatement(analyzer, node);
			break;
		case "AssignmentPattern":
			preprocessAssignmentPattern(analyzer, node);
			break;
		default:
			break;
	}
}

/**
 * Creates a new code path and trigger the onCodePathStart event.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {string} origin The reason the code path was started.
 * @returns {void}
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
 * Handles entering Program nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processProgramEnter(analyzer, node) {
	startCodePath(analyzer, node, "program");
}

/**
 * Handles entering FunctionDeclaration, FunctionExpression, and ArrowFunctionExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processFunctionEnter(analyzer, node) {
	startCodePath(analyzer, node, "function");
}

/**
 * Handles entering StaticBlock nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processStaticBlockEnter(analyzer, node) {
	startCodePath(analyzer, node, "class-static-block");
}

/**
 * Handles entering ChainExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processChainExpressionEnter(analyzer, node) {
	CodePath.getState(analyzer.codePath).pushChainContext();
}

/**
 * Handles entering CallExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCallExpressionEnter(analyzer, node) {
	if (node.optional === true) {
		CodePath.getState(analyzer.codePath).makeOptionalNode();
	}
}

/**
 * Handles entering MemberExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processMemberExpressionEnter(analyzer, node) {
	if (node.optional === true) {
		CodePath.getState(analyzer.codePath).makeOptionalNode();
	}
}

/**
 * Handles entering LogicalExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLogicalExpressionEnter(analyzer, node) {
	if (isHandledLogicalOperator(node.operator)) {
		CodePath.getState(analyzer.codePath).pushChoiceContext(
			node.operator,
			isForkingByTrueOrFalse(node),
		);
	}
}

/**
 * Handles entering AssignmentExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processAssignmentExpressionEnter(analyzer, node) {
	if (isLogicalAssignmentOperator(node.operator)) {
		CodePath.getState(analyzer.codePath).pushChoiceContext(
			node.operator.slice(0, -1),
			isForkingByTrueOrFalse(node),
		);
	}
}

/**
 * Handles entering ConditionalExpression and IfStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processConditionalOrIfEnter(analyzer, node) {
	CodePath.getState(analyzer.codePath).pushChoiceContext("test", false);
}

/**
 * Handles entering SwitchStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processSwitchStatementEnter(analyzer, node) {
	CodePath.getState(analyzer.codePath).pushSwitchContext(
		node.cases.some(isCaseNode),
		getLabel(node),
	);
}

/**
 * Handles entering TryStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processTryStatementEnter(analyzer, node) {
	CodePath.getState(analyzer.codePath).pushTryContext(Boolean(node.finalizer));
}

/**
 * Handles entering SwitchCase nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processSwitchCaseEnter(analyzer, node) {
	const parent = node.parent;

	if (parent.type === "SwitchCase" && parent.discriminant !== node && parent.cases[0] !== node) {
		CodePath.getState(analyzer.codePath).forkPath();
	}
}

/**
 * Handles entering WhileStatement, DoWhileStatement, ForStatement, ForInStatement, and ForOfStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLoopEnter(analyzer, node) {
	CodePath.getState(analyzer.codePath).pushLoopContext(node.type, getLabel(node));
}

/**
 * Handles entering LabeledStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLabeledStatementEnter(analyzer, node) {
	if (!breakableTypePattern.test(node.body.type)) {
		CodePath.getState(analyzer.codePath).pushBreakContext(false, node.label.name);
	}
}

/**
 * Handles entering all node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToEnter(analyzer, node) {
	const parent = node.parent;

	if (isPropertyDefinitionValue(node)) {
		startCodePath(analyzer, node, "class-field-initializer");
	}

	switch (node.type) {
		case "Program":
			processProgramEnter(analyzer, node);
			break;
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			processFunctionEnter(analyzer, node);
			break;
		case "StaticBlock":
			processStaticBlockEnter(analyzer, node);
			break;
		case "ChainExpression":
			processChainExpressionEnter(analyzer, node);
			break;
		case "CallExpression":
			processCallExpressionEnter(analyzer, node);
			break;
		case "MemberExpression":
			processMemberExpressionEnter(analyzer, node);
			break;
		case "LogicalExpression":
			processLogicalExpressionEnter(analyzer, node);
			break;
		case "AssignmentExpression":
			processAssignmentExpressionEnter(analyzer, node);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			processConditionalOrIfEnter(analyzer, node);
			break;
		case "SwitchStatement":
			processSwitchStatementEnter(analyzer, node);
			break;
		case "TryStatement":
			processTryStatementEnter(analyzer, node);
			break;
		case "SwitchCase":
			processSwitchCaseEnter(analyzer, node);
			break;
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			processLoopEnter(analyzer, node);
			break;
		case "LabeledStatement":
			processLabeledStatementEnter(analyzer, node);
			break;
		default:
			break;
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

/**
 * Handles exiting ChainExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processChainExpressionExit(analyzer, node) {
	CodePath.getState(analyzer.codePath).popChainContext();
}

/**
 * Handles exiting IfStatement and ConditionalExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processConditionalOrIfExit(analyzer, node) {
	CodePath.getState(analyzer.codePath).popChoiceContext();
}

/**
 * Handles exiting LogicalExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLogicalExpressionExit(analyzer, node) {
	if (isHandledLogicalOperator(node.operator)) {
		CodePath.getState(analyzer.codePath).popChoiceContext();
	}
}

/**
 * Handles exiting AssignmentExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processAssignmentExpressionExit(analyzer, node) {
	if (isLogicalAssignmentOperator(node.operator)) {
		CodePath.getState(analyzer.codePath).popChoiceContext();
	}
}

/**
 * Handles exiting SwitchStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processSwitchStatementExit(analyzer, node) {
	CodePath.getState(analyzer.codePath).popSwitchContext();
}

/**
 * Handles exiting SwitchCase nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processSwitchCaseExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (node.consequent.length === 0) {
		state.makeSwitchCaseBody(true, !node.test);
	}

	if (state.forkContext.reachable) {
		return;
	}
}

/**
 * Handles exiting TryStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processTryStatementExit(analyzer, node) {
	CodePath.getState(analyzer.codePath).popTryContext();
}

/**
 * Handles exiting BreakStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processBreakStatementExit(analyzer, node) {
	forwardCurrentToHead(analyzer, node);
	CodePath.getState(analyzer.codePath).makeBreak(node.label && node.label.name);
}

/**
 * Handles exiting ContinueStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processContinueStatementExit(analyzer, node) {
	forwardCurrentToHead(analyzer, node);
	CodePath.getState(analyzer.codePath).makeContinue(node.label && node.label.name);
}

/**
 * Handles exiting ReturnStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processReturnStatementExit(analyzer, node) {
	forwardCurrentToHead(analyzer, node);
	CodePath.getState(analyzer.codePath).makeReturn();
}

/**
 * Handles exiting ThrowStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processThrowStatementExit(analyzer, node) {
	forwardCurrentToHead(analyzer, node);
	CodePath.getState(analyzer.codePath).makeThrow();
}

/**
 * Handles exiting Identifier nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processIdentifierExit(analyzer, node) {
	if (isIdentifierReference(node)) {
		CodePath.getState(analyzer.codePath).makeFirstThrowablePathInTryBlock();
	}
}

/**
 * Handles exiting CallExpression, ImportExpression, MemberExpression, NewExpression, and YieldExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processThrowableExit(analyzer, node) {
	CodePath.getState(analyzer.codePath).makeFirstThrowablePathInTryBlock();
}

/**
 * Handles exiting WhileStatement, DoWhileStatement, ForStatement, ForInStatement, and ForOfStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLoopExit(analyzer, node) {
	CodePath.getState(analyzer.codePath).popLoopContext();
}

/**
 * Handles exiting AssignmentPattern nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processAssignmentPatternExit(analyzer, node) {
	CodePath.getState(analyzer.codePath).popForkContext();
}

/**
 * Handles exiting LabeledStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLabeledStatementExit(analyzer, node) {
	if (!breakableTypePattern.test(node.body.type)) {
		CodePath.getState(analyzer.codePath).popBreakContext();
	}
}

/**
 * Handles exiting all node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	let dontForward = false;

	switch (node.type) {
		case "ChainExpression":
			processChainExpressionExit(analyzer, node);
			break;
		case "IfStatement":
		case "ConditionalExpression":
			processConditionalOrIfExit(analyzer, node);
			break;
		case "LogicalExpression":
			processLogicalExpressionExit(analyzer, node);
			break;
		case "AssignmentExpression":
			processAssignmentExpressionExit(analyzer, node);
			break;
		case "SwitchStatement":
			processSwitchStatementExit(analyzer, node);
			break;
		case "SwitchCase":
			processSwitchCaseExit(analyzer, node);
			break;
		case "TryStatement":
			processTryStatementExit(analyzer, node);
			break;
		case "BreakStatement":
			processBreakStatementExit(analyzer, node);
			dontForward = true;
			break;
		case "ContinueStatement":
			processContinueStatementExit(analyzer, node);
			dontForward = true;
			break;
		case "ReturnStatement":
			processReturnStatementExit(analyzer, node);
			dontForward = true;
			break;
		case "ThrowStatement":
			processThrowStatementExit(analyzer, node);
			dontForward = true;
			break;
		case "Identifier":
			processIdentifierExit(analyzer, node);
			dontForward = true;
			break;
		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			processThrowableExit(analyzer, node);
			break;
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			processLoopExit(analyzer, node);
			break;
		case "AssignmentPattern":
			processAssignmentPatternExit(analyzer, node);
			break;
		case "LabeledStatement":
			processLabeledStatementExit(analyzer, node);
			break;
		default:
			break;
	}

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}

	debug.dumpState(node, state, true);
}

/**
 * Ends the code path for the current node.
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

	analyzer.codePath = analyzer.codePath.upper;
	if (analyzer.codePath) {
		debug.dumpState(node, CodePath.getState(analyzer.codePath), true);
	}
}

/**
 * Handles exiting Program, FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, and StaticBlock nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processScopeExit(analyzer, node) {
	if (
		node.type === "Program" ||
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression" ||
		node.type === "StaticBlock"
	) {
		endCodePath(analyzer, node);
	}
}

/**
 * Handles exiting CallExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCallExpressionExit(analyzer, node) {
	if (node.optional === true && node.arguments.length === 0) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

/**
 * Handles exiting all node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function postprocess(analyzer, node) {
	if (isPropertyDefinitionValue(node)) {
		endCodePath(analyzer, node);
	}

	processScopeExit(analyzer, node);
	processCallExpressionExit(analyzer, node);
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
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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (
		parent.type === "CallExpression" &&
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

/**
 * Handles preprocessing for MemberExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessMemberExpression(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "MemberExpression" && parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

/**
 * Handles preprocessing for LogicalExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessLogicalExpression(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (
		parent.type === "LogicalExpression" &&
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles preprocessing for AssignmentExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessAssignmentExpression(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (
		parent.type === "AssignmentExpression" &&
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles preprocessing for ConditionalExpression and IfStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessConditionalOrIfStatement(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "ConditionalExpression" || parent.type === "IfStatement") {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "SwitchCase" && parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles preprocessing for TryStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocessTryStatement(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "TryStatement") {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "WhileStatement") {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "DoWhileStatement") {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "ForStatement") {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "ForInStatement" || parent.type === "ForOfStatement") {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (parent.type === "AssignmentPattern" && parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
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
			preprocessConditionalOrIfStatement(analyzer, node);
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
 * Creates a new code path and trigger the onCodePathStart event
 * based on the currently selected node.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {string} origin The reason the code path was started.
 * @returns {void}
 */
function startCodePath(analyzer, node, origin) {
	const codePath = analyzer.codePath;
	const state = codePath && CodePath.getState(codePath);

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
	const state = CodePath.getState(analyzer.codePath);
	state.pushChainContext();
}

/**
 * Handles entering CallExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCallExpressionEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

/**
 * Handles entering MemberExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processMemberExpressionEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

/**
 * Handles entering LogicalExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLogicalExpressionEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (isHandledLogicalOperator(node.operator)) {
		state.pushChoiceContext(
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
	const state = CodePath.getState(analyzer.codePath);

	if (isLogicalAssignmentOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator.slice(0, -1), // removes `=` from the end
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
function processConditionalOrIfStatementEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.pushChoiceContext("test", false);
}

/**
 * Handles entering SwitchStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processSwitchStatementEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.pushSwitchContext(
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
	const state = CodePath.getState(analyzer.codePath);
	state.pushTryContext(Boolean(node.finalizer));
}

/**
 * Handles entering SwitchCase nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processSwitchCaseEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	/*
	 * Fork if this node is after the 2st node in `cases`.
	 * It's similar to `else` blocks.
	 * The next `test` node is processed in this path.
	 */
	if (parent.discriminant !== node && parent.cases[0] !== node) {
		state.forkPath();
	}
}

/**
 * Handles entering WhileStatement, DoWhileStatement, ForStatement, ForInStatement, and ForOfStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLoopStatementEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.pushLoopContext(node.type, getLabel(node));
}

/**
 * Handles entering LabeledStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLabeledStatementEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (!breakableTypePattern.test(node.body.type)) {
		state.pushBreakContext(false, node.label.name);
	}
}

/**
 * Handles entering all node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);

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
			processConditionalOrIfStatementEnter(analyzer, node);
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
			processLoopStatementEnter(analyzer, node);
			break;

		case "LabeledStatement":
			processLabeledStatementEnter(analyzer, node);
			break;

		default:
			break;
	}

	// Emits onCodePathSegmentStart events if updated.
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/**
 * Handles exiting ChainExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processChainExpressionExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.popChainContext();
}

/**
 * Handles exiting IfStatement and ConditionalExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processConditionalOrIfStatementExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.popChoiceContext();
}

/**
 * Handles exiting LogicalExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLogicalExpressionExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (isHandledLogicalOperator(node.operator)) {
		state.popChoiceContext();
	}
}

/**
 * Handles exiting AssignmentExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processAssignmentExpressionExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (isLogicalAssignmentOperator(node.operator)) {
		state.popChoiceContext();
	}
}

/**
 * Handles exiting SwitchStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processSwitchStatementExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.popSwitchContext();
}

/**
 * Handles exiting SwitchCase nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processSwitchCaseExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	/*
	 * This is the same as the process at the 1st `consequent` node in
	 * `preprocess` function.
	 * Must do if this `consequent` is empty.
	 */
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
	const state = CodePath.getState(analyzer.codePath);
	state.popTryContext();
}

/**
 * Handles exiting BreakStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processBreakStatementExit(analyzer, node) {
	forwardCurrentToHead(analyzer, node);
	const state = CodePath.getState(analyzer.codePath);
	state.makeBreak(node.label && node.label.name);
}

/**
 * Handles exiting ContinueStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processContinueStatementExit(analyzer, node) {
	forwardCurrentToHead(analyzer, node);
	const state = CodePath.getState(analyzer.codePath);
	state.makeContinue(node.label && node.label.name);
}

/**
 * Handles exiting ReturnStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processReturnStatementExit(analyzer, node) {
	forwardCurrentToHead(analyzer, node);
	const state = CodePath.getState(analyzer.codePath);
	state.makeReturn();
}

/**
 * Handles exiting ThrowStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processThrowStatementExit(analyzer, node) {
	forwardCurrentToHead(analyzer, node);
	const state = CodePath.getState(analyzer.codePath);
	state.makeThrow();
}

/**
 * Handles exiting Identifier nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processIdentifierExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (isIdentifierReference(node)) {
		state.makeFirstThrowablePathInTryBlock();
	}
}

/**
 * Handles exiting CallExpression, ImportExpression, MemberExpression, NewExpression, and YieldExpression nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processThrowableExpressionExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.makeFirstThrowablePathInTryBlock();
}

/**
 * Handles exiting WhileStatement, DoWhileStatement, ForStatement, ForInStatement, and ForOfStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLoopStatementExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.popLoopContext();
}

/**
 * Handles exiting AssignmentPattern nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processAssignmentPatternExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	state.popForkContext();
}

/**
 * Handles exiting LabeledStatement nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLabeledStatementExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (!breakableTypePattern.test(node.body.type)) {
		state.popBreakContext();
	}
}

/**
 * Handles exiting all node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	let dontForward = false;

	switch (node.type) {
		case "ChainExpression":
			processChainExpressionExit(analyzer, node);
			break;

		case "IfStatement":
		case "ConditionalExpression":
			processConditionalOrIfStatementExit(analyzer, node);
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
			processThrowableExpressionExit(analyzer, node);
			break;

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			processLoopStatementExit(analyzer, node);
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

	// Emits onCodePathSegmentStart events if updated.
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
 * Handles exiting Program, FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, and StaticBlock nodes.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processScopeExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	switch (node.type) {
		case "Program":
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "StaticBlock": {
			endCodePath(analyzer, node);
			break;
		}

		// The `arguments.length >= 1` case is in `preprocess` function.
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
 * Handles exiting all node types.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function postprocess(analyzer, node) {
	const parent = node.parent;

	switch (node.type) {
		case "Program":
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "StaticBlock":
			processScopeExit(analyzer, node);
			break;

		// The `arguments.length >= 1` case is in `preprocess` function.
		case "CallExpression":
			if (node.optional === true && node.arguments.length === 0) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
			break;

		default:
			break;
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
```
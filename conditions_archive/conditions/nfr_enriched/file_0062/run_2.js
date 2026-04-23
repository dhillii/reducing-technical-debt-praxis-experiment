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

	emitSegmentEndEvents(analyzer, currentSegments, node);
	state.currentSegments = [];
}

/**
 * Handles CallExpression preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessCallExpression(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

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
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessMemberExpression(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

/**
 * Handles LogicalExpression preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessLogicalExpression(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles AssignmentExpression preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessAssignmentExpression(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

/**
 * Handles ConditionalExpression and IfStatement preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessConditional(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

/**
 * Handles SwitchCase preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessSwitchCase(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

/**
 * Handles TryStatement preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessTryStatement(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

/**
 * Handles WhileStatement preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessWhileStatement(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

/**
 * Handles DoWhileStatement preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessDoWhileStatement(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

/**
 * Handles ForStatement preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessForStatement(analyzer, node, parent) {
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
 * Handles ForInStatement and ForOfStatement preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessForInOfStatement(analyzer, node, parent) {
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
 * Handles AssignmentPattern preprocessing.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function preprocessAssignmentPattern(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (parent.right === node) {
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

	switch (parent.type) {
		case "CallExpression":
			preprocessCallExpression(analyzer, node, parent);
			break;
		case "MemberExpression":
			preprocessMemberExpression(analyzer, node, parent);
			break;
		case "LogicalExpression":
			preprocessLogicalExpression(analyzer, node, parent);
			break;
		case "AssignmentExpression":
			preprocessAssignmentExpression(analyzer, node, parent);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			preprocessConditional(analyzer, node, parent);
			break;
		case "SwitchCase":
			preprocessSwitchCase(analyzer, node, parent);
			break;
		case "TryStatement":
			preprocessTryStatement(analyzer, node, parent);
			break;
		case "WhileStatement":
			preprocessWhileStatement(analyzer, node, parent);
			break;
		case "DoWhileStatement":
			preprocessDoWhileStatement(analyzer, node, parent);
			break;
		case "ForStatement":
			preprocessForStatement(analyzer, node, parent);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			preprocessForInOfStatement(analyzer, node, parent);
			break;
		case "AssignmentPattern":
			preprocessAssignmentPattern(analyzer, node, parent);
			break;
		default:
			break;
	}
}

/**
 * Starts a new code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {string} origin The reason the code path was started.
 * @returns {void}
 */
function startCodePath(analyzer, node, origin) {
	const codePath = analyzer.codePath;
	const state = codePath && CodePath.getState(codePath);

	if (codePath) {
		forwardCurrentToHead(analyzer, node);
		debug.dumpState(node, state, false);
	}

	analyzer.codePath = new CodePath({
		id: analyzer.idGenerator.next(),
		origin,
		upper: codePath,
		onLooped: analyzer.onLooped,
	});

	const newState = CodePath.getState(analyzer.codePath);
	debug.dump(`onCodePathStart ${analyzer.codePath.id}`);
	analyzer.emit("onCodePathStart", [analyzer.codePath, node]);
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, newState, false);
}

/**
 * Handles ChainExpression entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processChainExpressionEnter(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.pushChainContext();
}

/**
 * Handles CallExpression entering.
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
 * Handles MemberExpression entering.
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
 * Handles LogicalExpression entering.
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
 * Handles AssignmentExpression entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processAssignmentExpressionEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (isLogicalAssignmentOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator.slice(0, -1),
			isForkingByTrueOrFalse(node),
		);
	}
}

/**
 * Handles ConditionalExpression and IfStatement entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processConditionalEnter(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.pushChoiceContext("test", false);
}

/**
 * Handles SwitchStatement entering.
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
 * Handles TryStatement entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processTryStatementEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	state.pushTryContext(Boolean(node.finalizer));
}

/**
 * Handles SwitchCase entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @param {ASTNode} parent The parent node.
 * @returns {void}
 */
function processSwitchCaseEnter(analyzer, node, parent) {
	const state = CodePath.getState(analyzer.codePath);

	if (parent.discriminant !== node && parent.cases[0] !== node) {
		state.forkPath();
	}
}

/**
 * Handles loop statement entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLoopStatementEnter(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	state.pushLoopContext(node.type, getLabel(node));
}

/**
 * Handles LabeledStatement entering.
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
 * Updates the code path due to the type of a given node in entering.
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
			startCodePath(analyzer, node, "program");
			break;

		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			startCodePath(analyzer, node, "function");
			break;

		case "StaticBlock":
			startCodePath(analyzer, node, "class-static-block");
			break;

		case "ChainExpression":
			processChainExpressionEnter(analyzer);
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
			processConditionalEnter(analyzer);
			break;

		case "SwitchStatement":
			processSwitchStatementEnter(analyzer, node);
			break;

		case "TryStatement":
			processTryStatementEnter(analyzer, node);
			break;

		case "SwitchCase":
			processSwitchCaseEnter(analyzer, node, parent);
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

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

/**
 * Handles ChainExpression exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processChainExpressionExit(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.popChainContext();
}

/**
 * Handles choice context exiting (IfStatement, ConditionalExpression, LogicalExpression, AssignmentExpression).
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processChoiceContextExit(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.popChoiceContext();
}

/**
 * Handles SwitchStatement exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processSwitchStatementExit(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.popSwitchContext();
}

/**
 * Handles SwitchCase exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {boolean} `true` if should not forward.
 */
function processSwitchCaseExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (node.consequent.length === 0) {
		state.makeSwitchCaseBody(true, !node.test);
	}

	return state.forkContext.reachable;
}

/**
 * Handles TryStatement exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processTryStatementExit(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.popTryContext();
}

/**
 * Handles BreakStatement exiting.
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
 * Handles ContinueStatement exiting.
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
 * Handles ReturnStatement exiting.
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
 * Handles ThrowStatement exiting.
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
 * Handles Identifier exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {boolean} `true` if should not forward.
 */
function processIdentifierExit(analyzer, node) {
	if (isIdentifierReference(node)) {
		const state = CodePath.getState(analyzer.codePath);
		state.makeFirstThrowablePathInTryBlock();
		return true;
	}
	return false;
}

/**
 * Handles throwable expression exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processThrowableExpressionExit(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.makeFirstThrowablePathInTryBlock();
}

/**
 * Handles loop statement exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processLoopStatementExit(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.popLoopContext();
}

/**
 * Handles AssignmentPattern exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @returns {void}
 */
function processAssignmentPatternExit(analyzer) {
	const state = CodePath.getState(analyzer.codePath);
	state.popForkContext();
}

/**
 * Handles LabeledStatement exiting.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processLabeledStatementExit(analyzer, node) {
	if (!breakableTypePattern.test(node.body.type)) {
		const state = CodePath.getState(analyzer.codePath);
		state.popBreakContext();
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

	switch (node.type) {
		case "ChainExpression":
			processChainExpressionExit(analyzer);
			break;

		case "IfStatement":
		case "ConditionalExpression":
			processChoiceContextExit(analyzer);
			break;

		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) {
				processChoiceContextExit(analyzer);
			}
			break;

		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) {
				processChoiceContextExit(analyzer);
			}
			break;

		case "SwitchStatement":
			processSwitchStatementExit(analyzer);
			break;

		case "SwitchCase":
			dontForward = processSwitchCaseExit(analyzer, node);
			break;

		case "TryStatement":
			processTryStatementExit(analyzer);
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
			dontForward = processIdentifierExit(analyzer, node);
			break;

		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			processThrowableExpressionExit(analyzer);
			break;

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			processLoopStatementExit(analyzer);
			break;

		case "AssignmentPattern":
			processAssignmentPatternExit(analyzer);
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
	debug.dumpState(node, CodePath.getState(analyzer.codePath), true);
}

/**
 * Ends the current code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function endCodePath(analyzer, node) {
	const codePath = analyzer.codePath;

	CodePath.getState(codePath).makeFinal();
	leaveFromCurrentSegment(analyzer, node);

	debug.dump(`onCodePathEnd ${codePath.id}`);
	analyzer.emit("onCodePathEnd", [codePath, node]);
	debug.dumpDot(codePath);

	analyzer.codePath = codePath.upper;
	if (analyzer.codePath) {
		debug.dumpState(node, CodePath.getState(analyzer.codePath), true);
	}
}

/**
 * Handles code path ending for specific node types.
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
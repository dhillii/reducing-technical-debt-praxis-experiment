"use strict";

const assert = require("../../shared/assert"),
	{ breakableTypePattern } = require("../../shared/ast-utils"),
	CodePath = require("./code-path"),
	CodePathSegment = require("./code-path-segment"),
	IdGenerator = require("./id-generator"),
	debug = require("./debug-helpers");

function isCaseNode(node) {
	return Boolean(node.test);
}

function isPropertyDefinitionValue(node) {
	const parent = node.parent;

	return (
		parent && parent.type === "PropertyDefinition" && parent.value === node
	);
}

function isHandledLogicalOperator(operator) {
	return operator === "&&" || operator === "||" || operator === "??";
}

function isLogicalAssignmentOperator(operator) {
	return operator === "&&=" || operator === "||=" || operator === "??=";
}

function getLabel(node) {
	if (node.parent.type === "LabeledStatement") {
		return node.parent.label.name;
	}
	return null;
}

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

function getBooleanValueIfSimpleConstant(node) {
	if (node.type === "Literal") {
		return Boolean(node.value);
	}
	return void 0;
}

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

function forwardCurrentToHead(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const currentSegments = state.currentSegments;
	const headSegments = state.headSegments;
	const end = Math.max(currentSegments.length, headSegments.length);
	let i, currentSegment, headSegment;

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

	state.currentSegments = headSegments;

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

// Handles optional chaining and logical operators in preprocess
function preprocessOptionalAndLogical(state, parent, node) {
	if (parent.type === "CallExpression") {
		if (
			parent.optional === true &&
			parent.arguments.length >= 1 &&
			parent.arguments[0] === node
		) {
			state.makeOptionalRight();
		}
	} else if (parent.type === "MemberExpression") {
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
	} else if (parent.type === "LogicalExpression") {
		if (
			parent.right === node &&
			isHandledLogicalOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	} else if (parent.type === "AssignmentExpression") {
		if (
			parent.right === node &&
			isLogicalAssignmentOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	}
}

// Handles conditional and if statements in preprocess
function preprocessConditionalAndIf(state, parent, node) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

// Handles switch cases in preprocess
function preprocessSwitchCase(state, parent, node) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

// Handles try statement in preprocess
function preprocessTryStatement(state, parent, node) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

// Handles while statement in preprocess
function preprocessWhileStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

// Handles do-while statement in preprocess
function preprocessDoWhileStatement(state, parent, node) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

// Handles for statement in preprocess
function preprocessForStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

// Handles for-in and for-of statements in preprocess
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

// Handles assignment pattern in preprocess
function preprocessAssignmentPattern(state, node) {
	if (node.parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}

function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	switch (parent.type) {
		case "CallExpression":
		case "MemberExpression":
		case "LogicalExpression":
		case "AssignmentExpression":
			preprocessOptionalAndLogical(state, parent, node);
			break;

		case "ConditionalExpression":
		case "IfStatement":
			preprocessConditionalAndIf(state, parent, node);
			break;

		case "SwitchCase":
			preprocessSwitchCase(state, parent, node);
			break;

		case "TryStatement":
			preprocessTryStatement(state, parent, node);
			break;

		case "WhileStatement":
			preprocessWhileStatement(state, parent, node);
			break;

		case "DoWhileStatement":
			preprocessDoWhileStatement(state, parent, node);
			break;

		case "ForStatement":
			preprocessForStatement(state, parent, node);
			break;

		case "ForInStatement":
		case "ForOfStatement":
			preprocessForInOfStatement(state, parent, node);
			break;

		case "AssignmentPattern":
			preprocessAssignmentPattern(state, node);
			break;

		default:
			break;
	}
}

// Handles code path start for various node types
function handleCodePathStart(analyzer, node, state) {
	let codePath = analyzer.codePath;

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

		default:
			break;
	}

	return state;
}

// Handles optional chaining and logical expressions in processCodePathToEnter
function processOptionalAndLogicalExpressions(state, node) {
	if (node.type === "ChainExpression") {
		state.pushChainContext();
	} else if (node.type === "CallExpression" && node.optional === true) {
		state.makeOptionalNode();
	} else if (node.type === "MemberExpression" && node.optional === true) {
		state.makeOptionalNode();
	} else if (node.type === "LogicalExpression") {
		if (isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator,
				isForkingByTrueOrFalse(node),
			);
		}
	} else if (node.type === "AssignmentExpression") {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator.slice(0, -1),
				isForkingByTrueOrFalse(node),
			);
		}
	}
}

// Handles control flow statements in processCodePathToEnter
function processControlFlowStatements(state, node) {
	if (node.type === "ConditionalExpression" || node.type === "IfStatement") {
		state.pushChoiceContext("test", false);
	} else if (node.type === "SwitchStatement") {
		state.pushSwitchContext(
			node.cases.some(isCaseNode),
			getLabel(node),
		);
	} else if (node.type === "TryStatement") {
		state.pushTryContext(Boolean(node.finalizer));
	}
}

// Handles loop and labeled statements in processCodePathToEnter
function processLoopsAndLabels(state, node) {
	if (
		node.type === "WhileStatement" ||
		node.type === "DoWhileStatement" ||
		node.type === "ForStatement" ||
		node.type === "ForInStatement" ||
		node.type === "ForOfStatement"
	) {
		state.pushLoopContext(node.type, getLabel(node));
	} else if (node.type === "LabeledStatement") {
		if (!breakableTypePattern.test(node.body.type)) {
			state.pushBreakContext(false, node.label.name);
		}
	}
}

// Handles switch case forking in processCodePathToEnter
function processSwitchCaseForking(state, node, parent) {
	if (node.type === "SwitchCase") {
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
	}
}

function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);
	const parent = node.parent;

	state = handleCodePathStart(analyzer, node, state);

	processOptionalAndLogicalExpressions(state, node);
	processControlFlowStatements(state, node);
	processLoopsAndLabels(state, node);
	processSwitchCaseForking(state, node, parent);

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

// Handles chain expression exit
function processChainExpressionExit(state) {
	state.popChainContext();
}

// Handles conditional and if statement exit
function processConditionalIfExit(state, node) {
	if (node.type === "IfStatement" || node.type === "ConditionalExpression") {
		state.popChoiceContext();
	}
}

// Handles logical expression exit
function processLogicalExpressionExit(state, node) {
	if (node.type === "LogicalExpression") {
		if (isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
	}
}

// Handles assignment expression exit
function processAssignmentExpressionExit(state, node) {
	if (node.type === "AssignmentExpression") {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.popChoiceContext();
		}
	}
}

// Handles switch statement exit
function processSwitchStatementExit(state, node) {
	if (node.type === "SwitchStatement") {
		state.popSwitchContext();
	}
}

// Handles switch case exit
function processSwitchCaseExit(state, node) {
	let dontForward = false;

	if (node.type === "SwitchCase") {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		if (state.forkContext.reachable) {
			dontForward = true;
		}
	}

	return dontForward;
}

// Handles try statement exit
function processTryStatementExit(state, node) {
	if (node.type === "TryStatement") {
		state.popTryContext();
	}
}

// Handles break statement exit
function processBreakStatementExit(analyzer, state, node) {
	let dontForward = false;

	if (node.type === "BreakStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label && node.label.name);
		dontForward = true;
	}

	return dontForward;
}

// Handles continue statement exit
function processContinueStatementExit(analyzer, state, node) {
	let dontForward = false;

	if (node.type === "ContinueStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeContinue(node.label && node.label.name);
		dontForward = true;
	}

	return dontForward;
}

// Handles return statement exit
function processReturnStatementExit(analyzer, state, node) {
	let dontForward = false;

	if (node.type === "ReturnStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeReturn();
		dontForward = true;
	}

	return dontForward;
}

// Handles throw statement exit
function processThrowStatementExit(analyzer, state, node) {
	let dontForward = false;

	if (node.type === "ThrowStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeThrow();
		dontForward = true;
	}

	return dontForward;
}

// Handles identifier exit
function processIdentifierExit(state, node) {
	let dontForward = false;

	if (node.type === "Identifier") {
		if (isIdentifierReference(node)) {
			state.makeFirstThrowablePathInTryBlock();
			dontForward = true;
		}
	}

	return dontForward;
}

// Handles throwable expressions
function processThrowableExpressions(state, node) {
	if (
		node.type === "CallExpression" ||
		node.type === "ImportExpression" ||
		node.type === "MemberExpression" ||
		node.type === "NewExpression" ||
		node.type === "YieldExpression"
	) {
		state.makeFirstThrowablePathInTryBlock();
	}
}

// Handles loop context exit
function processLoopContextExit(state, node) {
	if (
		node.type === "WhileStatement" ||
		node.type === "DoWhileStatement" ||
		node.type === "ForStatement" ||
		node.type === "ForInStatement" ||
		node.type === "ForOfStatement"
	) {
		state.popLoopContext();
	}
}

// Handles assignment pattern exit
function processAssignmentPatternExit(state, node) {
	if (node.type === "AssignmentPattern") {
		state.popForkContext();
	}
}

// Handles labeled statement exit
function processLabeledStatementExit(state, node) {
	if (node.type === "LabeledStatement") {
		if (!breakableTypePattern.test(node.body.type)) {
			state.popBreakContext();
		}
	}
}

function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	let dontForward = false;

	processChainExpressionExit(state);
	processConditionalIfExit(state, node);
	processLogicalExpressionExit(state, node);
	processAssignmentExpressionExit(state, node);
	processSwitchStatementExit(state, node);
	dontForward = processSwitchCaseExit(state, node) || dontForward;
	processTryStatementExit(state, node);
	dontForward = processBreakStatementExit(analyzer, state, node) || dontForward;
	dontForward = processContinueStatementExit(analyzer, state, node) || dontForward;
	dontForward = processReturnStatementExit(analyzer, state, node) || dontForward;
	dontForward = processThrowStatementExit(analyzer, state, node) || dontForward;
	dontForward = processIdentifierExit(state, node) || dontForward;
	processThrowableExpressions(state, node);
	processLoopContextExit(state, node);
	processAssignmentPatternExit(state, node);
	processLabeledStatementExit(state, node);

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

function postprocess(analyzer, node) {
	function endCodePath() {
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

	switch (node.type) {
		case "Program":
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "StaticBlock": {
			endCodePath();
			break;
		}

		case "CallExpression":
			if (node.optional === true && node.arguments.length === 0) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
			break;

		default:
			break;
	}

	if (isPropertyDefinitionValue(node)) {
		endCodePath();
	}
}

class CodePathAnalyzer {
	constructor(eventGenerator) {
		this.original = eventGenerator;
		this.emit = eventGenerator.emit;
		this.codePath = null;
		this.idGenerator = new IdGenerator("s");
		this.currentNode = null;
		this.onLooped = this.onLooped.bind(this);
	}

	enterNode(node) {
		this.currentNode = node;

		if (node.parent) {
			preprocess(this, node);
		}

		processCodePathToEnter(this, node);

		this.original.enterNode(node);

		this.currentNode = null;
	}

	leaveNode(node) {
		this.currentNode = node;

		processCodePathToExit(this, node);

		this.original.leaveNode(node);

		postprocess(this, node);

		this.currentNode = null;
	}

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
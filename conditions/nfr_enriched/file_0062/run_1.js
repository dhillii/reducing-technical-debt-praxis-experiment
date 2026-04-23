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

function emitSegmentEvents(analyzer, node, currentSegments, headSegments, isEntering) {
	const end = Math.max(currentSegments.length, headSegments.length);

	for (let i = 0; i < end; ++i) {
		const currentSegment = currentSegments[i];
		const headSegment = headSegments[i];

		if (currentSegment !== headSegment) {
			if (isEntering && headSegment) {
				const eventName = headSegment.reachable
					? "onCodePathSegmentStart"
					: "onUnreachableCodePathSegmentStart";

				debug.dump(`${eventName} ${headSegment.id}`);
				CodePathSegment.markUsed(headSegment);
				analyzer.emit(eventName, [headSegment, node]);
			} else if (!isEntering && currentSegment) {
				const eventName = currentSegment.reachable
					? "onCodePathSegmentEnd"
					: "onUnreachableCodePathSegmentEnd";

				debug.dump(`${eventName} ${currentSegment.id}`);
				analyzer.emit(eventName, [currentSegment, node]);
			}
		}
	}
}

function forwardCurrentToHead(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const currentSegments = state.currentSegments;
	const headSegments = state.headSegments;

	emitSegmentEvents(analyzer, node, currentSegments, headSegments, false);
	state.currentSegments = headSegments;
	emitSegmentEvents(analyzer, node, currentSegments, headSegments, true);
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

function handleCallExpressionPreprocess(parent, node, state) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

function handleMemberExpressionPreprocess(parent, node, state) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

function handleLogicalExpressionPreprocess(parent, node, state) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function handleAssignmentExpressionPreprocess(parent, node, state) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function handleConditionalOrIfPreprocess(parent, node, state) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

function handleSwitchCasePreprocess(parent, node, state) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

function handleTryStatementPreprocess(parent, node, state) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

function handleWhileStatementPreprocess(parent, node, state) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

function handleDoWhileStatementPreprocess(parent, node, state) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

function handleForStatementPreprocess(parent, node, state) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

function handleForInOfStatementPreprocess(parent, node, state) {
	if (parent.left === node) {
		state.makeForInOfLeft();
	} else if (parent.right === node) {
		state.makeForInOfRight();
	} else {
		assert(parent.body === node);
		state.makeForInOfBody();
	}
}

function handleAssignmentPatternPreprocess(parent, node, state) {
	if (parent.right === node) {
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
			handleCallExpressionPreprocess(parent, node, state);
			break;
		case "MemberExpression":
			handleMemberExpressionPreprocess(parent, node, state);
			break;
		case "LogicalExpression":
			handleLogicalExpressionPreprocess(parent, node, state);
			break;
		case "AssignmentExpression":
			handleAssignmentExpressionPreprocess(parent, node, state);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			handleConditionalOrIfPreprocess(parent, node, state);
			break;
		case "SwitchCase":
			handleSwitchCasePreprocess(parent, node, state);
			break;
		case "TryStatement":
			handleTryStatementPreprocess(parent, node, state);
			break;
		case "WhileStatement":
			handleWhileStatementPreprocess(parent, node, state);
			break;
		case "DoWhileStatement":
			handleDoWhileStatementPreprocess(parent, node, state);
			break;
		case "ForStatement":
			handleForStatementPreprocess(parent, node, state);
			break;
		case "ForInStatement":
		case "ForOfStatement":
			handleForInOfStatementPreprocess(parent, node, state);
			break;
		case "AssignmentPattern":
			handleAssignmentPatternPreprocess(parent, node, state);
			break;

		default:
			break;
	}
}

function startCodePath(analyzer, node, origin) {
	const codePath = analyzer.codePath;
	const state = codePath && CodePath.getState(codePath);

	if (codePath) {
		forwardCurrentToHead(analyzer, node);
		debug.dumpState(node, state, false);
	}

	const newCodePath = new CodePath({
		id: analyzer.idGenerator.next(),
		origin,
		upper: codePath,
		onLooped: analyzer.onLooped,
	});
	analyzer.codePath = newCodePath;

	debug.dump(`onCodePathStart ${newCodePath.id}`);
	analyzer.emit("onCodePathStart", [newCodePath, node]);
}

function handleChainExpressionEnter(state) {
	state.pushChainContext();
}

function handleCallExpressionEnter(node, state) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

function handleMemberExpressionEnter(node, state) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

function handleLogicalExpressionEnter(node, state) {
	if (isHandledLogicalOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator,
			isForkingByTrueOrFalse(node),
		);
	}
}

function handleAssignmentExpressionEnter(node, state) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator.slice(0, -1),
			isForkingByTrueOrFalse(node),
		);
	}
}

function handleConditionalOrIfEnter(state) {
	state.pushChoiceContext("test", false);
}

function handleSwitchStatementEnter(node, state) {
	state.pushSwitchContext(
		node.cases.some(isCaseNode),
		getLabel(node),
	);
}

function handleTryStatementEnter(node, state) {
	state.pushTryContext(Boolean(node.finalizer));
}

function handleSwitchCaseEnter(node, parent, state) {
	if (parent.discriminant !== node && parent.cases[0] !== node) {
		state.forkPath();
	}
}

function handleLoopStatementEnter(node, state) {
	state.pushLoopContext(node.type, getLabel(node));
}

function handleLabeledStatementEnter(node, state) {
	if (!breakableTypePattern.test(node.body.type)) {
		state.pushBreakContext(false, node.label.name);
	}
}

function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);
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
			handleChainExpressionEnter(state);
			break;
		case "CallExpression":
			handleCallExpressionEnter(node, state);
			break;
		case "MemberExpression":
			handleMemberExpressionEnter(node, state);
			break;

		case "LogicalExpression":
			handleLogicalExpressionEnter(node, state);
			break;

		case "AssignmentExpression":
			handleAssignmentExpressionEnter(node, state);
			break;

		case "ConditionalExpression":
		case "IfStatement":
			handleConditionalOrIfEnter(state);
			break;

		case "SwitchStatement":
			handleSwitchStatementEnter(node, state);
			break;

		case "TryStatement":
			handleTryStatementEnter(node, state);
			break;

		case "SwitchCase":
			handleSwitchCaseEnter(node, parent, state);
			break;

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			handleLoopStatementEnter(node, state);
			break;

		case "LabeledStatement":
			handleLabeledStatementEnter(node, state);
			break;

		default:
			break;
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

function handleChainExpressionExit(state) {
	state.popChainContext();
}

function handleIfOrConditionalExit(state) {
	state.popChoiceContext();
}

function handleLogicalExpressionExit(node, state) {
	if (isHandledLogicalOperator(node.operator)) {
		state.popChoiceContext();
	}
}

function handleAssignmentExpressionExit(node, state) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.popChoiceContext();
	}
}

function handleSwitchStatementExit(state) {
	state.popSwitchContext();
}

function handleSwitchCaseExit(node, state) {
	if (node.consequent.length === 0) {
		state.makeSwitchCaseBody(true, !node.test);
	}
	return state.forkContext.reachable;
}

function handleTryStatementExit(state) {
	state.popTryContext();
}

function handleBreakStatementExit(analyzer, node, state) {
	forwardCurrentToHead(analyzer, node);
	state.makeBreak(node.label && node.label.name);
	return true;
}

function handleContinueStatementExit(analyzer, node, state) {
	forwardCurrentToHead(analyzer, node);
	state.makeContinue(node.label && node.label.name);
	return true;
}

function handleReturnStatementExit(analyzer, node, state) {
	forwardCurrentToHead(analyzer, node);
	state.makeReturn();
	return true;
}

function handleThrowStatementExit(analyzer, node, state) {
	forwardCurrentToHead(analyzer, node);
	state.makeThrow();
	return true;
}

function handleIdentifierExit(node, state) {
	if (isIdentifierReference(node)) {
		state.makeFirstThrowablePathInTryBlock();
		return true;
	}
	return false;
}

function handleThrowableExpressionExit(state) {
	state.makeFirstThrowablePathInTryBlock();
}

function handleLoopStatementExit(state) {
	state.popLoopContext();
}

function handleAssignmentPatternExit(state) {
	state.popForkContext();
}

function handleLabeledStatementExit(node, state) {
	if (!breakableTypePattern.test(node.body.type)) {
		state.popBreakContext();
	}
}

function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	let dontForward = false;

	switch (node.type) {
		case "ChainExpression":
			handleChainExpressionExit(state);
			break;

		case "IfStatement":
		case "ConditionalExpression":
			handleIfOrConditionalExit(state);
			break;

		case "LogicalExpression":
			handleLogicalExpressionExit(node, state);
			break;

		case "AssignmentExpression":
			handleAssignmentExpressionExit(node, state);
			break;

		case "SwitchStatement":
			handleSwitchStatementExit(state);
			break;

		case "SwitchCase":
			dontForward = handleSwitchCaseExit(node, state);
			break;

		case "TryStatement":
			handleTryStatementExit(state);
			break;

		case "BreakStatement":
			dontForward = handleBreakStatementExit(analyzer, node, state);
			break;

		case "ContinueStatement":
			dontForward = handleContinueStatementExit(analyzer, node, state);
			break;

		case "ReturnStatement":
			dontForward = handleReturnStatementExit(analyzer, node, state);
			break;

		case "ThrowStatement":
			dontForward = handleThrowStatementExit(analyzer, node, state);
			break;

		case "Identifier":
			dontForward = handleIdentifierExit(node, state);
			break;

		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			handleThrowableExpressionExit(state);
			break;

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			handleLoopStatementExit(state);
			break;

		case "AssignmentPattern":
			handleAssignmentPatternExit(state);
			break;

		case "LabeledStatement":
			handleLabeledStatementExit(node, state);
			break;

		default:
			break;
	}

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

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

function handleProgramOrFunctionExit(analyzer, node) {
	endCodePath(analyzer, node);
}

function handleCallExpressionPostprocess(node, analyzer) {
	if (node.optional === true && node.arguments.length === 0) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

function postprocess(analyzer, node) {
	switch (node.type) {
		case "Program":
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "StaticBlock":
			handleProgramOrFunctionExit(analyzer, node);
			break;

		case "CallExpression":
			handleCallExpressionPostprocess(node, analyzer);
			break;

		default:
			break;
	}

	if (isPropertyDefinitionValue(node)) {
		endCodePath(analyzer, node);
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
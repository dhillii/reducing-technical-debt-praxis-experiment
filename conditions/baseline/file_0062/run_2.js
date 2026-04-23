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

function handleCallExpression(state, parent, node) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

function handleMemberExpression(state, parent, node) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

function handleLogicalExpression(state, parent, node) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function handleAssignmentExpression(state, parent, node) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function handleConditionalOrIfStatement(state, parent, node) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

function handleSwitchCase(state, parent, node) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

function handleTryStatement(state, parent, node) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

function handleWhileStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

function handleDoWhileStatement(state, parent, node) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

function handleForStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

function handleForInOfStatement(state, parent, node) {
	if (parent.left === node) {
		state.makeForInOfLeft();
	} else if (parent.right === node) {
		state.makeForInOfRight();
	} else {
		assert(parent.body === node);
		state.makeForInOfBody();
	}
}

function handleAssignmentPattern(state, parent, node) {
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

	const handlers = {
		CallExpression: handleCallExpression,
		MemberExpression: handleMemberExpression,
		LogicalExpression: handleLogicalExpression,
		AssignmentExpression: handleAssignmentExpression,
		ConditionalExpression: handleConditionalOrIfStatement,
		IfStatement: handleConditionalOrIfStatement,
		SwitchCase: handleSwitchCase,
		TryStatement: handleTryStatement,
		WhileStatement: handleWhileStatement,
		DoWhileStatement: handleDoWhileStatement,
		ForStatement: handleForStatement,
		ForInStatement: handleForInOfStatement,
		ForOfStatement: handleForInOfStatement,
		AssignmentPattern: handleAssignmentPattern,
	};

	const handler = handlers[parent.type];
	if (handler) {
		handler(state, parent, node);
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
	const newState = CodePath.getState(newCodePath);

	debug.dump(`onCodePathStart ${newCodePath.id}`);
	analyzer.emit("onCodePathStart", [newCodePath, node]);

	return newState;
}

function handleChainExpression(state) {
	state.pushChainContext();
}

function handleOptionalCallExpression(state, node) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

function handleOptionalMemberExpression(state, node) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

function handleLogicalExpressionEnter(state, node) {
	if (isHandledLogicalOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator,
			isForkingByTrueOrFalse(node),
		);
	}
}

function handleAssignmentExpressionEnter(state, node) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator.slice(0, -1),
			isForkingByTrueOrFalse(node),
		);
	}
}

function handleConditionalOrIfStatementEnter(state) {
	state.pushChoiceContext("test", false);
}

function handleSwitchStatementEnter(state, node) {
	state.pushSwitchContext(
		node.cases.some(isCaseNode),
		getLabel(node),
	);
}

function handleTryStatementEnter(state, node) {
	state.pushTryContext(Boolean(node.finalizer));
}

function handleSwitchCaseEnter(state, parent, node) {
	if (parent.discriminant !== node && parent.cases[0] !== node) {
		state.forkPath();
	}
}

function handleLoopEnter(state, node) {
	state.pushLoopContext(node.type, getLabel(node));
}

function handleLabeledStatementEnter(state, node) {
	if (!breakableTypePattern.test(node.body.type)) {
		state.pushBreakContext(false, node.label.name);
	}
}

function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);
	const parent = node.parent;

	if (isPropertyDefinitionValue(node)) {
		state = startCodePath(analyzer, node, "class-field-initializer");
	}

	switch (node.type) {
		case "Program":
			startCodePath(analyzer, node, "program");
			state = CodePath.getState(analyzer.codePath);
			break;

		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			startCodePath(analyzer, node, "function");
			state = CodePath.getState(analyzer.codePath);
			break;

		case "StaticBlock":
			startCodePath(analyzer, node, "class-static-block");
			state = CodePath.getState(analyzer.codePath);
			break;

		case "ChainExpression":
			handleChainExpression(state);
			break;
		case "CallExpression":
			handleOptionalCallExpression(state, node);
			break;
		case "MemberExpression":
			handleOptionalMemberExpression(state, node);
			break;

		case "LogicalExpression":
			handleLogicalExpressionEnter(state, node);
			break;

		case "AssignmentExpression":
			handleAssignmentExpressionEnter(state, node);
			break;

		case "ConditionalExpression":
		case "IfStatement":
			handleConditionalOrIfStatementEnter(state);
			break;

		case "SwitchStatement":
			handleSwitchStatementEnter(state, node);
			break;

		case "TryStatement":
			handleTryStatementEnter(state, node);
			break;

		case "SwitchCase":
			handleSwitchCaseEnter(state, parent, node);
			break;

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			handleLoopEnter(state, node);
			break;

		case "LabeledStatement":
			handleLabeledStatementEnter(state, node);
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

function handleLogicalExpressionExit(state, node) {
	if (isHandledLogicalOperator(node.operator)) {
		state.popChoiceContext();
	}
}

function handleAssignmentExpressionExit(state, node) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.popChoiceContext();
	}
}

function handleSwitchStatementExit(state) {
	state.popSwitchContext();
}

function handleSwitchCaseExit(state, node) {
	if (node.consequent.length === 0) {
		state.makeSwitchCaseBody(true, !node.test);
	}
	return state.forkContext.reachable;
}

function handleTryStatementExit(state) {
	state.popTryContext();
}

function handleBreakStatement(analyzer, state, node) {
	forwardCurrentToHead(analyzer, node);
	state.makeBreak(node.label && node.label.name);
	return true;
}

function handleContinueStatement(analyzer, state, node) {
	forwardCurrentToHead(analyzer, node);
	state.makeContinue(node.label && node.label.name);
	return true;
}

function handleReturnStatement(analyzer, state, node) {
	forwardCurrentToHead(analyzer, node);
	state.makeReturn();
	return true;
}

function handleThrowStatement(analyzer, state, node) {
	forwardCurrentToHead(analyzer, node);
	state.makeThrow();
	return true;
}

function handleIdentifierExit(state, node) {
	if (isIdentifierReference(node)) {
		state.makeFirstThrowablePathInTryBlock();
		return true;
	}
	return false;
}

function handleThrowableExpression(state) {
	state.makeFirstThrowablePathInTryBlock();
}

function handleLoopExit(state) {
	state.popLoopContext();
}

function handleAssignmentPatternExit(state) {
	state.popForkContext();
}

function handleLabeledStatementExit(state, node) {
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
			handleLogicalExpressionExit(state, node);
			break;

		case "AssignmentExpression":
			handleAssignmentExpressionExit(state, node);
			break;

		case "SwitchStatement":
			handleSwitchStatementExit(state);
			break;

		case "SwitchCase":
			dontForward = handleSwitchCaseExit(state, node);
			break;

		case "TryStatement":
			handleTryStatementExit(state);
			break;

		case "BreakStatement":
			dontForward = handleBreakStatement(analyzer, state, node);
			break;

		case "ContinueStatement":
			dontForward = handleContinueStatement(analyzer, state, node);
			break;

		case "ReturnStatement":
			dontForward = handleReturnStatement(analyzer, state, node);
			break;

		case "ThrowStatement":
			dontForward = handleThrowStatement(analyzer, state, node);
			break;

		case "Identifier":
			dontForward = handleIdentifierExit(state, node);
			break;

		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			handleThrowableExpression(state);
			break;

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			handleLoopExit(state);
			break;

		case "AssignmentPattern":
			handleAssignmentPatternExit(state);
			break;

		case "LabeledStatement":
			handleLabeledStatementExit(state, node);
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

function postprocess(analyzer, node) {
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
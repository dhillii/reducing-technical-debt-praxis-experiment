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

	// Fires leaving events.
	emitSegmentEvents(analyzer, node, currentSegments, headSegments, false);

	// Update state.
	state.currentSegments = headSegments;

	// Fires entering events.
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

function preprocessCallExpression(state, parent, node) {
	if (
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node
	) {
		state.makeOptionalRight();
	}
}

function preprocessMemberExpression(state, parent, node) {
	if (parent.optional === true && parent.property === node) {
		state.makeOptionalRight();
	}
}

function preprocessLogicalExpression(state, parent, node) {
	if (
		parent.right === node &&
		isHandledLogicalOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function preprocessAssignmentExpression(state, parent, node) {
	if (
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator)
	) {
		state.makeLogicalRight();
	}
}

function preprocessConditionalOrIfStatement(state, parent, node) {
	if (parent.consequent === node) {
		state.makeIfConsequent();
	} else if (parent.alternate === node) {
		state.makeIfAlternate();
	}
}

function preprocessSwitchCase(state, parent, node) {
	if (parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

function preprocessTryStatement(state, parent, node) {
	if (parent.handler === node) {
		state.makeCatchBlock();
	} else if (parent.finalizer === node) {
		state.makeFinallyBlock();
	}
}

function preprocessWhileStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
	} else {
		assert(parent.body === node);
		state.makeWhileBody();
	}
}

function preprocessDoWhileStatement(state, parent, node) {
	if (parent.body === node) {
		state.makeDoWhileBody();
	} else {
		assert(parent.test === node);
		state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
	}
}

function preprocessForStatement(state, parent, node) {
	if (parent.test === node) {
		state.makeForTest(getBooleanValueIfSimpleConstant(node));
	} else if (parent.update === node) {
		state.makeForUpdate();
	} else if (parent.body === node) {
		state.makeForBody();
	}
}

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

function preprocessAssignmentPattern(state, parent, node) {
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
			preprocessCallExpression(state, parent, node);
			break;
		case "MemberExpression":
			preprocessMemberExpression(state, parent, node);
			break;
		case "LogicalExpression":
			preprocessLogicalExpression(state, parent, node);
			break;
		case "AssignmentExpression":
			preprocessAssignmentExpression(state, parent, node);
			break;
		case "ConditionalExpression":
		case "IfStatement":
			preprocessConditionalOrIfStatement(state, parent, node);
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
			preprocessAssignmentPattern(state, parent, node);
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

function processChainExpression(state) {
	state.pushChainContext();
}

function processCallExpression(state, node) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

function processMemberExpression(state, node) {
	if (node.optional === true) {
		state.makeOptionalNode();
	}
}

function processLogicalExpression(state, node) {
	if (isHandledLogicalOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator,
			isForkingByTrueOrFalse(node),
		);
	}
}

function processAssignmentExpression(state, node) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.pushChoiceContext(
			node.operator.slice(0, -1),
			isForkingByTrueOrFalse(node),
		);
	}
}

function processConditionalOrIfStatement(state) {
	state.pushChoiceContext("test", false);
}

function processSwitchStatement(state, node) {
	state.pushSwitchContext(
		node.cases.some(isCaseNode),
		getLabel(node),
	);
}

function processTryStatement(state, node) {
	state.pushTryContext(Boolean(node.finalizer));
}

function processSwitchCase(state, parent, node) {
	if (parent.discriminant !== node && parent.cases[0] !== node) {
		state.forkPath();
	}
}

function processLoopStatement(state, node) {
	state.pushLoopContext(node.type, getLabel(node));
}

function processLabeledStatement(state, node) {
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
			processChainExpression(state);
			break;
		case "CallExpression":
			processCallExpression(state, node);
			break;
		case "MemberExpression":
			processMemberExpression(state, node);
			break;

		case "LogicalExpression":
			processLogicalExpression(state, node);
			break;

		case "AssignmentExpression":
			processAssignmentExpression(state, node);
			break;

		case "ConditionalExpression":
		case "IfStatement":
			processConditionalOrIfStatement(state);
			break;

		case "SwitchStatement":
			processSwitchStatement(state, node);
			break;

		case "TryStatement":
			processTryStatement(state, node);
			break;

		case "SwitchCase":
			processSwitchCase(state, parent, node);
			break;

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			processLoopStatement(state, node);
			break;

		case "LabeledStatement":
			processLabeledStatement(state, node);
			break;

		default:
			break;
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

function exitChainExpression(state) {
	state.popChainContext();
}

function exitIfOrConditional(state) {
	state.popChoiceContext();
}

function exitLogicalExpression(state, node) {
	if (isHandledLogicalOperator(node.operator)) {
		state.popChoiceContext();
	}
}

function exitAssignmentExpression(state, node) {
	if (isLogicalAssignmentOperator(node.operator)) {
		state.popChoiceContext();
	}
}

function exitSwitchStatement(state) {
	state.popSwitchContext();
}

function exitSwitchCase(state, node) {
	if (node.consequent.length === 0) {
		state.makeSwitchCaseBody(true, !node.test);
	}
	return state.forkContext.reachable;
}

function exitTryStatement(state) {
	state.popTryContext();
}

function exitBreakStatement(analyzer, state, node) {
	forwardCurrentToHead(analyzer, node);
	state.makeBreak(node.label && node.label.name);
	return true;
}

function exitContinueStatement(analyzer, state, node) {
	forwardCurrentToHead(analyzer, node);
	state.makeContinue(node.label && node.label.name);
	return true;
}

function exitReturnStatement(analyzer, state, node) {
	forwardCurrentToHead(analyzer, node);
	state.makeReturn();
	return true;
}

function exitThrowStatement(analyzer, state, node) {
	forwardCurrentToHead(analyzer, node);
	state.makeThrow();
	return true;
}

function exitIdentifier(state, node) {
	if (isIdentifierReference(node)) {
		state.makeFirstThrowablePathInTryBlock();
		return true;
	}
	return false;
}

function exitThrowableExpression(state) {
	state.makeFirstThrowablePathInTryBlock();
}

function exitLoopStatement(state) {
	state.popLoopContext();
}

function exitAssignmentPattern(state) {
	state.popForkContext();
}

function exitLabeledStatement(state, node) {
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
			exitChainExpression(state);
			break;

		case "IfStatement":
		case "ConditionalExpression":
			exitIfOrConditional(state);
			break;

		case "LogicalExpression":
			exitLogicalExpression(state, node);
			break;

		case "AssignmentExpression":
			exitAssignmentExpression(state, node);
			break;

		case "SwitchStatement":
			exitSwitchStatement(state);
			break;

		case "SwitchCase":
			dontForward = exitSwitchCase(state, node);
			break;

		case "TryStatement":
			exitTryStatement(state);
			break;

		case "BreakStatement":
			dontForward = exitBreakStatement(analyzer, state, node);
			break;

		case "ContinueStatement":
			dontForward = exitContinueStatement(analyzer, state, node);
			break;

		case "ReturnStatement":
			dontForward = exitReturnStatement(analyzer, state, node);
			break;

		case "ThrowStatement":
			dontForward = exitThrowStatement(analyzer, state, node);
			break;

		case "Identifier":
			dontForward = exitIdentifier(state, node);
			break;

		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			exitThrowableExpression(state);
			break;

		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			exitLoopStatement(state);
			break;

		case "AssignmentPattern":
			exitAssignmentPattern(state);
			break;

		case "LabeledStatement":
			exitLabeledStatement(state, node);
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

function postprocessProgram(analyzer, node) {
	endCodePath(analyzer, node);
}

function postprocessFunction(analyzer, node) {
	endCodePath(analyzer, node);
}

function postprocessStaticBlock(analyzer, node) {
	endCodePath(analyzer, node);
}

function postprocessCallExpression(analyzer, node) {
	if (node.optional === true && node.arguments.length === 0) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}
}

function postprocess(analyzer, node) {
	switch (node.type) {
		case "Program":
			postprocessProgram(analyzer, node);
			break;

		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			postprocessFunction(analyzer, node);
			break;

		case "StaticBlock":
			postprocessStaticBlock(analyzer, node);
			break;

		case "CallExpression":
			postprocessCallExpression(analyzer, node);
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
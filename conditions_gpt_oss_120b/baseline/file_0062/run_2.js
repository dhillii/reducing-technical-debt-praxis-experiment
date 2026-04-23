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

function isCaseNode(node) {
	return Boolean(node.test);
}

function isPropertyDefinitionValue(node) {
	const parent = node.parent;
	return parent && parent.type === "PropertyDefinition" && parent.value === node;
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

//------------------------------------------------------------------------------
// Core utilities
//------------------------------------------------------------------------------

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

function startCodePath(analyzer, node, origin) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);
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

//------------------------------------------------------------------------------
// Enter processing
//------------------------------------------------------------------------------

function handleEnterProgram(analyzer) {
	startCodePath(analyzer, analyzer.currentNode, "program");
}
function handleEnterFunction(analyzer) {
	startCodePath(analyzer, analyzer.currentNode, "function");
}
function handleEnterStaticBlock(analyzer) {
	startCodePath(analyzer, analyzer.currentNode, "class-static-block");
}
function handleEnterChainExpression(analyzer) {
	CodePath.getState(analyzer.codePath).pushChainContext();
}
function handleEnterOptionalNode(analyzer) {
	CodePath.getState(analyzer.codePath).makeOptionalNode();
}
function handleEnterLogicalExpression(analyzer) {
	const node = analyzer.currentNode;
	if (isHandledLogicalOperator(node.operator)) {
		CodePath.getState(analyzer.codePath).pushChoiceContext(
			node.operator,
			isForkingByTrueOrFalse(node)
		);
	}
}
function handleEnterAssignmentExpression(analyzer) {
	const node = analyzer.currentNode;
	if (isLogicalAssignmentOperator(node.operator)) {
		CodePath.getState(analyzer.codePath).pushChoiceContext(
			node.operator.slice(0, -1),
			isForkingByTrueOrFalse(node)
		);
	}
}
function handleEnterConditionalOrIf(analyzer) {
	CodePath.getState(analyzer.codePath).pushChoiceContext("test", false);
}
function handleEnterSwitchStatement(analyzer) {
	const node = analyzer.currentNode;
	CodePath.getState(analyzer.codePath).pushSwitchContext(
		node.cases.some(isCaseNode),
		getLabel(node)
	);
}
function handleEnterTryStatement(analyzer) {
	CodePath.getState(analyzer.codePath).pushTryContext(Boolean(analyzer.currentNode.finalizer));
}
function handleEnterSwitchCase(analyzer) {
	const node = analyzer.currentNode;
	const parent = node.parent;
	if (parent.discriminant !== node && parent.cases[0] !== node) {
		CodePath.getState(analyzer.codePath).forkPath();
	}
}
function handleEnterLoop(analyzer) {
	CodePath.getState(analyzer.codePath).pushLoopContext(
		analyzer.currentNode.type,
		getLabel(analyzer.currentNode)
	);
}
function handleEnterLabeledStatement(analyzer) {
	const node = analyzer.currentNode;
	if (!breakableTypePattern.test(node.body.type)) {
		CodePath.getState(analyzer.codePath).pushBreakContext(false, node.label.name);
	}
}

const enterHandlers = new Map([
	["Program", handleEnterProgram],
	["FunctionDeclaration", handleEnterFunction],
	["FunctionExpression", handleEnterFunction],
	["ArrowFunctionExpression", handleEnterFunction],
	["StaticBlock", handleEnterStaticBlock],
	["ChainExpression", handleEnterChainExpression],
	["CallExpression", handleEnterOptionalNode],
	["MemberExpression", handleEnterOptionalNode],
	["LogicalExpression", handleEnterLogicalExpression],
	["AssignmentExpression", handleEnterAssignmentExpression],
	["ConditionalExpression", handleEnterConditionalOrIf],
	["IfStatement", handleEnterConditionalOrIf],
	["SwitchStatement", handleEnterSwitchStatement],
	["TryStatement", handleEnterTryStatement],
	["SwitchCase", handleEnterSwitchCase],
	["WhileStatement", handleEnterLoop],
	["DoWhileStatement", handleEnterLoop],
	["ForStatement", handleEnterLoop],
	["ForInStatement", handleEnterLoop],
	["ForOfStatement", handleEnterLoop],
	["LabeledStatement", handleEnterLabeledStatement],
]);

function processCodePathToEnter(analyzer, node) {
	analyzer.currentNode = node;

	if (isPropertyDefinitionValue(node)) {
		startCodePath(analyzer, node, "class-field-initializer");
	}

	const handler = enterHandlers.get(node.type);
	if (handler) {
		handler(analyzer);
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

//------------------------------------------------------------------------------
// Exit processing
//------------------------------------------------------------------------------

function handleExitChainExpression(analyzer) {
	CodePath.getState(analyzer.codePath).popChainContext();
}
function handleExitChoice(analyzer) {
	CodePath.getState(analyzer.codePath).popChoiceContext();
}
function handleExitSwitchStatement(analyzer) {
	CodePath.getState(analyzer.codePath).popSwitchContext();
}
function handleExitSwitchCase(analyzer) {
	const node = analyzer.currentNode;
	const state = CodePath.getState(analyzer.codePath);
	if (node.consequent.length === 0) {
		state.makeSwitchCaseBody(true, !node.test);
	}
	return state.forkContext.reachable;
}
function handleExitTryStatement(analyzer) {
	CodePath.getState(analyzer.codePath).popTryContext();
}
function handleExitBreakStatement(analyzer) {
	const node = analyzer.currentNode;
	forwardCurrentToHead(analyzer, node);
	CodePath.getState(analyzer.codePath).makeBreak(node.label && node.label.name);
	return true;
}
function handleExitContinueStatement(analyzer) {
	const node = analyzer.currentNode;
	forwardCurrentToHead(analyzer, node);
	CodePath.getState(analyzer.codePath).makeContinue(node.label && node.label.name);
	return true;
}
function handleExitReturnStatement(analyzer) {
	const node = analyzer.currentNode;
	forwardCurrentToHead(analyzer, node);
	CodePath.getState(analyzer.codePath).makeReturn();
	return true;
}
function handleExitThrowStatement(analyzer) {
	const node = analyzer.currentNode;
	forwardCurrentToHead(analyzer, node);
	CodePath.getState(analyzer.codePath).makeThrow();
	return true;
}
function handleExitIdentifier(analyzer) {
	if (isIdentifierReference(analyzer.currentNode)) {
		CodePath.getState(analyzer.codePath).makeFirstThrowablePathInTryBlock();
		return true;
	}
}
function handleExitPotentialThrow(analyzer) {
	CodePath.getState(analyzer.codePath).makeFirstThrowablePathInTryBlock();
}
function handleExitLoop(analyzer) {
	CodePath.getState(analyzer.codePath).popLoopContext();
}
function handleExitAssignmentPattern(analyzer) {
	CodePath.getState(analyzer.codePath).popForkContext();
}
function handleExitLabeledStatement(analyzer) {
	const node = analyzer.currentNode;
	if (!breakableTypePattern.test(node.body.type)) {
		CodePath.getState(analyzer.codePath).popBreakContext();
	}
}

const exitHandlers = new Map([
	["ChainExpression", handleExitChainExpression],
	["IfStatement", handleExitChoice],
	["ConditionalExpression", handleExitChoice],
	["LogicalExpression", (analyzer) => {
		if (isHandledLogicalOperator(analyzer.currentNode.operator)) {
			handleExitChoice(analyzer);
		}
	}],
	["AssignmentExpression", (analyzer) => {
		if (isLogicalAssignmentOperator(analyzer.currentNode.operator)) {
			handleExitChoice(analyzer);
		}
	}],
	["SwitchStatement", handleExitSwitchStatement],
	["SwitchCase", handleExitSwitchCase],
	["TryStatement", handleExitTryStatement],
	["BreakStatement", handleExitBreakStatement],
	["ContinueStatement", handleExitContinueStatement],
	["ReturnStatement", handleExitReturnStatement],
	["ThrowStatement", handleExitThrowStatement],
	["Identifier", handleExitIdentifier],
	["CallExpression", handleExitPotentialThrow],
	["ImportExpression", handleExitPotentialThrow],
	["MemberExpression", handleExitPotentialThrow],
	["NewExpression", handleExitPotentialThrow],
	["YieldExpression", handleExitPotentialThrow],
	["WhileStatement", handleExitLoop],
	["DoWhileStatement", handleExitLoop],
	["ForStatement", handleExitLoop],
	["ForInStatement", handleExitLoop],
	["ForOfStatement", handleExitLoop],
	["AssignmentPattern", handleExitAssignmentPattern],
	["LabeledStatement", handleExitLabeledStatement],
]);

function processCodePathToExit(analyzer, node) {
	const handler = exitHandlers.get(node.type);
	let dontForward = false;
	if (handler) {
		const result = handler(analyzer);
		if (typeof result === "boolean") {
			dontForward = result;
		}
	}
	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, CodePath.getState(analyzer.codePath), true);
}

//------------------------------------------------------------------------------
// Postprocess
//------------------------------------------------------------------------------

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
		case "StaticBlock":
			endCodePath();
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
		endCodePath();
	}
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

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
			debug.dump(`onCodePathSegmentLoop ${fromSegment.id} -> ${toSegment.id}`);
			this.emit("onCodePathSegmentLoop", [
				fromSegment,
				toSegment,
				this.currentNode,
			]);
		}
	}
}

module.exports = CodePathAnalyzer;
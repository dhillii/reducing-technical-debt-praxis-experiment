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
	return node.parent.type === "LabeledStatement" ? node.parent.label.name : null;
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
	return node.type === "Literal" ? Boolean(node.value) : undefined;
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
// State transition helpers
//------------------------------------------------------------------------------

function forwardCurrentToHead(analyzer, node) {
	const { currentSegments, headSegments } = CodePath.getState(analyzer.codePath);
	const end = Math.max(currentSegments.length, headSegments.length);
	let i, cur, head;

	for (i = 0; i < end; ++i) {
		cur = currentSegments[i];
		head = headSegments[i];
		if (cur !== head && cur) {
			const ev = cur.reachable ? "onCodePathSegmentEnd" : "onUnreachableCodePathSegmentEnd";
			debug.dump(`${ev} ${cur.id}`);
			analyzer.emit(ev, [cur, node]);
		}
	}

	CodePath.getState(analyzer.codePath).currentSegments = headSegments;

	for (i = 0; i < end; ++i) {
		cur = currentSegments[i];
		head = headSegments[i];
		if (cur !== head && head) {
			const ev = head.reachable ? "onCodePathSegmentStart" : "onUnreachableCodePathSegmentStart";
			debug.dump(`${ev} ${head.id}`);
			CodePathSegment.markUsed(head);
			analyzer.emit(ev, [head, node]);
		}
	}
}

function leaveFromCurrentSegment(analyzer, node) {
	const { currentSegments } = CodePath.getState(analyzer.codePath);
	for (let i = 0; i < currentSegments.length; ++i) {
		const seg = currentSegments[i];
		const ev = seg.reachable ? "onCodePathSegmentEnd" : "onUnreachableCodePathSegmentEnd";
		debug.dump(`${ev} ${seg.id}`);
		analyzer.emit(ev, [seg, node]);
	}
	CodePath.getState(analyzer.codePath).currentSegments = [];
}

//------------------------------------------------------------------------------
// Preprocess (position‑based state changes)
//------------------------------------------------------------------------------

function preprocess(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (!parent) return;

	switch (parent.type) {
		case "CallExpression":
			if (parent.optional && parent.arguments[0] === node && parent.arguments.length >= 1) {
				state.makeOptionalRight();
			}
			break;
		case "MemberExpression":
			if (parent.optional && parent.property === node) {
				state.makeOptionalRight();
			}
			break;
		case "LogicalExpression":
			if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
				state.makeLogicalRight();
			}
			break;
		case "AssignmentExpression":
			if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
				state.makeLogicalRight();
			}
			break;
		case "ConditionalExpression":
		case "IfStatement":
			if (parent.consequent === node) state.makeIfConsequent();
			else if (parent.alternate === node) state.makeIfAlternate();
			break;
		case "SwitchCase":
			if (parent.consequent[0] === node) {
				state.makeSwitchCaseBody(false, !parent.test);
			}
			break;
		case "TryStatement":
			if (parent.handler === node) state.makeCatchBlock();
			else if (parent.finalizer === node) state.makeFinallyBlock();
			break;
		case "WhileStatement":
			if (parent.test === node) state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
			else {
				assert(parent.body === node);
				state.makeWhileBody();
			}
			break;
		case "DoWhileStatement":
			if (parent.body === node) state.makeDoWhileBody();
			else {
				assert(parent.test === node);
				state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
			}
			break;
		case "ForStatement":
			if (parent.test === node) state.makeForTest(getBooleanValueIfSimpleConstant(node));
			else if (parent.update === node) state.makeForUpdate();
			else if (parent.body === node) state.makeForBody();
			break;
		case "ForInStatement":
		case "ForOfStatement":
			if (parent.left === node) state.makeForInOfLeft();
			else if (parent.right === node) state.makeForInOfRight();
			else {
				assert(parent.body === node);
				state.makeForInOfBody();
			}
			break;
		case "AssignmentPattern":
			if (parent.right === node) {
				state.pushForkContext();
				state.forkBypassPath();
				state.forkPath();
			}
			break;
		default:
			break;
	}
}

//------------------------------------------------------------------------------
// Enter processing (type‑based state changes)
//------------------------------------------------------------------------------

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

function handleEnterNode(analyzer, node) {
	const state = analyzer.codePath && CodePath.getState(analyzer.codePath);
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
			state.pushChainContext();
			break;
		case "CallExpression":
		case "MemberExpression":
			if (node.optional) state.makeOptionalNode();
			break;
		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) {
				state.pushChoiceContext(node.operator, isForkingByTrueOrFalse(node));
			}
			break;
		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) {
				state.pushChoiceContext(node.operator.slice(0, -1), isForkingByTrueOrFalse(node));
			}
			break;
		case "ConditionalExpression":
		case "IfStatement":
			state.pushChoiceContext("test", false);
			break;
		case "SwitchStatement":
			state.pushSwitchContext(node.cases.some(isCaseNode), getLabel(node));
			break;
		case "TryStatement":
			state.pushTryContext(Boolean(node.finalizer));
			break;
		case "SwitchCase":
			if (parent.discriminant !== node && parent.cases[0] !== node) state.forkPath();
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
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

//------------------------------------------------------------------------------
// Exit processing (type‑based state changes)
//------------------------------------------------------------------------------

function handleExitNode(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	let skipForward = false;

	switch (node.type) {
		case "ChainExpression":
			state.popChainContext();
			break;
		case "IfStatement":
		case "ConditionalExpression":
			state.popChoiceContext();
			break;
		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) state.popChoiceContext();
			break;
		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) state.popChoiceContext();
			break;
		case "SwitchStatement":
			state.popSwitchContext();
			break;
		case "SwitchCase":
			if (node.consequent.length === 0) state.makeSwitchCaseBody(true, !node.test);
			if (state.forkContext.reachable) skipForward = true;
			break;
		case "TryStatement":
			state.popTryContext();
			break;
		case "BreakStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeBreak(node.label && node.label.name);
			skipForward = true;
			break;
		case "ContinueStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeContinue(node.label && node.label.name);
			skipForward = true;
			break;
		case "ReturnStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeReturn();
			skipForward = true;
			break;
		case "ThrowStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeThrow();
			skipForward = true;
			break;
		case "Identifier":
			if (isIdentifierReference(node)) {
				state.makeFirstThrowablePathInTryBlock();
				skipForward = true;
			}
			break;
		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			state.makeFirstThrowablePathInTryBlock();
			break;
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			state.popLoopContext();
			break;
		case "AssignmentPattern":
			state.popForkContext();
			break;
		case "LabeledStatement":
			if (!breakableTypePattern.test(node.body.type)) state.popBreakContext();
			break;
		default:
			break;
	}

	if (!skipForward) forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, true);
}

//------------------------------------------------------------------------------
// Postprocess (finalization)
//------------------------------------------------------------------------------

function endCodePath(analyzer, node) {
	const cp = analyzer.codePath;
	CodePath.getState(cp).makeFinal();
	leaveFromCurrentSegment(analyzer, node);
	debug.dump(`onCodePathEnd ${cp.id}`);
	analyzer.emit("onCodePathEnd", [cp, node]);
	debug.dumpDot(cp);
	analyzer.codePath = cp.upper;
	if (analyzer.codePath) {
		debug.dumpState(node, CodePath.getState(analyzer.codePath), true);
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
			if (node.optional && node.arguments.length === 0) {
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
		if (node.parent) preprocess(this, node);
		handleEnterNode(this, node);
		this.original.enterNode(node);
		this.currentNode = null;
	}

	leaveNode(node) {
		this.currentNode = node;
		handleExitNode(this, node);
		this.original.leaveNode(node);
		postprocess(this, node);
		this.currentNode = null;
	}

	onLooped(fromSegment, toSegment) {
		if (fromSegment.reachable && toSegment.reachable) {
			debug.dump(`onCodePathSegmentLoop ${fromSegment.id} -> ${toSegment.id}`);
			this.emit("onCodePathSegmentLoop", [fromSegment, toSegment, this.currentNode]);
		}
	}
}

module.exports = CodePathAnalyzer;
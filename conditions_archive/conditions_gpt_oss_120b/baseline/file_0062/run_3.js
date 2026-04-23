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
// Core utilities
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
// Preprocess handling
//------------------------------------------------------------------------------

const preprocessHandlers = {
	CallExpression(parent, node, state) {
		if (parent.optional && parent.arguments.length >= 1 && parent.arguments[0] === node) {
			state.makeOptionalRight();
		}
	},
	MemberExpression(parent, node, state) {
		if (parent.optional && parent.property === node) {
			state.makeOptionalRight();
		}
	},
	LogicalExpression(parent, node, state) {
		if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
			state.makeLogicalRight();
		}
	},
	AssignmentExpression(parent, node, state) {
		if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
			state.makeLogicalRight();
		}
	},
	ConditionalExpression(parent, node, state) {
		if (parent.consequent === node) state.makeIfConsequent();
		else if (parent.alternate === node) state.makeIfAlternate();
	},
	IfStatement(parent, node, state) {
		if (parent.consequent === node) state.makeIfConsequent();
		else if (parent.alternate === node) state.makeIfAlternate();
	},
	SwitchCase(parent, node, state) {
		if (parent.consequent[0] === node) state.makeSwitchCaseBody(false, !parent.test);
	},
	TryStatement(parent, node, state) {
		if (parent.handler === node) state.makeCatchBlock();
		else if (parent.finalizer === node) state.makeFinallyBlock();
	},
	WhileStatement(parent, node, state) {
		if (parent.test === node) state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	},
	DoWhileStatement(parent, node, state) {
		if (parent.body === node) state.makeDoWhileBody();
		else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	},
	ForStatement(parent, node, state) {
		if (parent.test === node) state.makeForTest(getBooleanValueIfSimpleConstant(node));
		else if (parent.update === node) state.makeForUpdate();
		else if (parent.body === node) state.makeForBody();
	},
	ForInStatement(parent, node, state) {
		if (parent.left === node) state.makeForInOfLeft();
		else if (parent.right === node) state.makeForInOfRight();
		else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	ForOfStatement(parent, node, state) {
		if (parent.left === node) state.makeForInOfLeft();
		else if (parent.right === node) state.makeForInOfRight();
		else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	AssignmentPattern(parent, node, state) {
		if (parent.right === node) {
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
	}
};

function preprocess(analyzer, node) {
	const parent = node.parent;
	const handler = preprocessHandlers[parent.type];
	if (handler) {
		const state = CodePath.getState(analyzer.codePath);
		handler(parent, node, state);
	}
}

//------------------------------------------------------------------------------
// Enter handling
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
		onLooped: analyzer.onLooped
	});
	debug.dump(`onCodePathStart ${analyzer.codePath.id}`);
	analyzer.emit("onCodePathStart", [analyzer.codePath, node]);
}

const enterHandlers = {
	Program(analyzer, node) {
		startCodePath(analyzer, node, "program");
	},
	FunctionDeclaration(analyzer, node) {
		startCodePath(analyzer, node, "function");
	},
	FunctionExpression(analyzer, node) {
		startCodePath(analyzer, node, "function");
	},
	ArrowFunctionExpression(analyzer, node) {
		startCodePath(analyzer, node, "function");
	},
	StaticBlock(analyzer, node) {
		startCodePath(analyzer, node, "class-static-block");
	},
	ChainExpression(analyzer, node, state) {
		state.pushChainContext();
	},
	CallExpression(analyzer, node, state) {
		if (node.optional) state.makeOptionalNode();
	},
	MemberExpression(analyzer, node, state) {
		if (node.optional) state.makeOptionalNode();
	},
	LogicalExpression(analyzer, node, state) {
		if (isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(node.operator, isForkingByTrueOrFalse(node));
		}
	},
	AssignmentExpression(analyzer, node, state) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(node.operator.slice(0, -1), isForkingByTrueOrFalse(node));
		}
	},
	ConditionalExpression(analyzer, node, state) {
		state.pushChoiceContext("test", false);
	},
	IfStatement(analyzer, node, state) {
		state.pushChoiceContext("test", false);
	},
	SwitchStatement(analyzer, node, state) {
		state.pushSwitchContext(node.cases.some(isCaseNode), getLabel(node));
	},
	TryStatement(analyzer, node, state) {
		state.pushTryContext(Boolean(node.finalizer));
	},
	SwitchCase(analyzer, node, state) {
		const parent = node.parent;
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
	},
	WhileStatement(analyzer, node, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	DoWhileStatement(analyzer, node, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForStatement(analyzer, node, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForInStatement(analyzer, node, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForOfStatement(analyzer, node, state) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	LabeledStatement(analyzer, node, state) {
		if (!breakableTypePattern.test(node.body.type)) {
			state.pushBreakContext(false, node.label.name);
		}
	}
};

function processCodePathToEnter(analyzer, node) {
	if (isPropertyDefinitionValue(node)) {
		startCodePath(analyzer, node, "class-field-initializer");
	}

	const handler = enterHandlers[node.type];
	if (handler) {
		const state = analyzer.codePath && CodePath.getState(analyzer.codePath);
		handler(analyzer, node, state);
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

//------------------------------------------------------------------------------
// Exit handling
//------------------------------------------------------------------------------

const exitHandlers = {
	ChainExpression(analyzer, node, state) {
		state.popChainContext();
	},
	IfStatement(analyzer, node, state) {
		state.popChoiceContext();
	},
	ConditionalExpression(analyzer, node, state) {
		state.popChoiceContext();
	},
	LogicalExpression(analyzer, node, state) {
		if (isHandledLogicalOperator(node.operator)) state.popChoiceContext();
	},
	AssignmentExpression(analyzer, node, state) {
		if (isLogicalAssignmentOperator(node.operator)) state.popChoiceContext();
	},
	SwitchStatement(analyzer, node, state) {
		state.popSwitchContext();
	},
	SwitchCase(analyzer, node, state) {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		if (state.forkContext.reachable) return true; // signal dontForward
	},
	TryStatement(analyzer, node, state) {
		state.popTryContext();
	},
	BreakStatement(analyzer, node, state) {
		forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label && node.label.name);
		return true;
	},
	ContinueStatement(analyzer, node, state) {
		forwardCurrentToHead(analyzer, node);
		state.makeContinue(node.label && node.label.name);
		return true;
	},
	ReturnStatement(analyzer, node, state) {
		forwardCurrentToHead(analyzer, node);
		state.makeReturn();
		return true;
	},
	ThrowStatement(analyzer, node, state) {
		forwardCurrentToHead(analyzer, node);
		state.makeThrow();
		return true;
	},
	Identifier(analyzer, node, state) {
		if (isIdentifierReference(node)) {
			state.makeFirstThrowablePathInTryBlock();
			return true;
		}
	},
	CallExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	ImportExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	MemberExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	NewExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	YieldExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
	},
	WhileStatement(analyzer, node, state) {
		state.popLoopContext();
	},
	DoWhileStatement(analyzer, node, state) {
		state.popLoopContext();
	},
	ForStatement(analyzer, node, state) {
		state.popLoopContext();
	},
	ForInStatement(analyzer, node, state) {
		state.popLoopContext();
	},
	ForOfStatement(analyzer, node, state) {
		state.popLoopContext();
	},
	AssignmentPattern(analyzer, node, state) {
		state.popForkContext();
	},
	LabeledStatement(analyzer, node, state) {
		if (!breakableTypePattern.test(node.body.type)) {
			state.popBreakContext();
		}
	}
};

function processCodePathToExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const handler = exitHandlers[node.type];
	let dontForward = false;

	if (handler) {
		const result = handler(analyzer, node, state);
		if (result) dontForward = true;
	}

	if (!dontForward) forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, true);
}

//------------------------------------------------------------------------------
// Postprocess handling
//------------------------------------------------------------------------------

function postprocess(analyzer, node) {
	function endCodePath() {
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

	switch (node.type) {
		case "Program":
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "StaticBlock":
			endCodePath();
			break;
		case "CallExpression":
			if (node.optional && node.arguments.length === 0) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
			break;
		default:
			break;
	}

	if (isPropertyDefinitionValue(node)) endCodePath();
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
				this.currentNode
			]);
		}
	}
}

module.exports = CodePathAnalyzer;
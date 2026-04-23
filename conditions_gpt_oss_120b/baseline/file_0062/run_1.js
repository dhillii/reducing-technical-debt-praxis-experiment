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
// Core helpers
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

//------------------------------------------------------------------------------
// Start / End code path
//------------------------------------------------------------------------------

function startCodePath(analyzer, node, origin) {
	const codePath = analyzer.codePath;
	if (codePath) {
		forwardCurrentToHead(analyzer, node);
		debug.dumpState(node, CodePath.getState(codePath), false);
	}
	const newPath = new CodePath({
		id: analyzer.idGenerator.next(),
		origin,
		upper: codePath,
		onLooped: analyzer.onLooped,
	});
	analyzer.codePath = newPath;
	debug.dump(`onCodePathStart ${newPath.id}`);
	analyzer.emit("onCodePathStart", [newPath, node]);
}

//------------------------------------------------------------------------------
// Preprocess handlers
//------------------------------------------------------------------------------

const preprocessHandlers = {
	CallExpression(analyzer, node) {
		const parent = node.parent;
		if (parent.optional && parent.arguments.length >= 1 && parent.arguments[0] === node) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
	},
	MemberExpression(analyzer, node) {
		const parent = node.parent;
		if (parent.optional && parent.property === node) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
	},
	LogicalExpression(analyzer, node) {
		const parent = node.parent;
		if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
			CodePath.getState(analyzer.codePath).makeLogicalRight();
		}
	},
	AssignmentExpression(analyzer, node) {
		const parent = node.parent;
		if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
			CodePath.getState(analyzer.codePath).makeLogicalRight();
		}
	},
	ConditionalExpression(analyzer, node) {
		const parent = node.parent;
		if (parent.consequent === node) {
			CodePath.getState(analyzer.codePath).makeIfConsequent();
		} else if (parent.alternate === node) {
			CodePath.getState(analyzer.codePath).makeIfAlternate();
		}
	},
	IfStatement(analyzer, node) {
		const parent = node.parent;
		if (parent.consequent === node) {
			CodePath.getState(analyzer.codePath).makeIfConsequent();
		} else if (parent.alternate === node) {
			CodePath.getState(analyzer.codePath).makeIfAlternate();
		}
	},
	SwitchCase(analyzer, node) {
		const parent = node.parent;
		if (parent.consequent[0] === node) {
			CodePath.getState(analyzer.codePath).makeSwitchCaseBody(false, !parent.test);
		}
	},
	TryStatement(analyzer, node) {
		const parent = node.parent;
		if (parent.handler === node) {
			CodePath.getState(analyzer.codePath).makeCatchBlock();
		} else if (parent.finalizer === node) {
			CodePath.getState(analyzer.codePath).makeFinallyBlock();
		}
	},
	WhileStatement(analyzer, node) {
		const parent = node.parent;
		if (parent.test === node) {
			CodePath.getState(analyzer.codePath).makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			CodePath.getState(analyzer.codePath).makeWhileBody();
		}
	},
	DoWhileStatement(analyzer, node) {
		const parent = node.parent;
		if (parent.body === node) {
			CodePath.getState(analyzer.codePath).makeDoWhileBody();
		} else {
			assert(parent.test === node);
			CodePath.getState(analyzer.codePath).makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	},
	ForStatement(analyzer, node) {
		const parent = node.parent;
		if (parent.test === node) {
			CodePath.getState(analyzer.codePath).makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			CodePath.getState(analyzer.codePath).makeForUpdate();
		} else if (parent.body === node) {
			CodePath.getState(analyzer.codePath).makeForBody();
		}
	},
	ForInStatement(analyzer, node) {
		const parent = node.parent;
		if (parent.left === node) {
			CodePath.getState(analyzer.codePath).makeForInOfLeft();
		} else if (parent.right === node) {
			CodePath.getState(analyzer.codePath).makeForInOfRight();
		} else {
			assert(parent.body === node);
			CodePath.getState(analyzer.codePath).makeForInOfBody();
		}
	},
	ForOfStatement(analyzer, node) {
		const parent = node.parent;
		if (parent.left === node) {
			CodePath.getState(analyzer.codePath).makeForInOfLeft();
		} else if (parent.right === node) {
			CodePath.getState(analyzer.codePath).makeForInOfRight();
		} else {
			assert(parent.body === node);
			CodePath.getState(analyzer.codePath).makeForInOfBody();
		}
	},
	AssignmentPattern(analyzer, node) {
		const parent = node.parent;
		if (parent.right === node) {
			const state = CodePath.getState(analyzer.codePath);
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
	},
};

function preprocess(analyzer, node) {
	const parent = node.parent;
	const handler = preprocessHandlers[parent.type];
	if (handler) {
		handler(analyzer, node);
	}
}

//------------------------------------------------------------------------------
// Enter handlers
//------------------------------------------------------------------------------

const enterHandlers = {
	Program(analyzer, node, state) {
		startCodePath(analyzer, node, "program");
	},
	FunctionDeclaration(analyzer, node, state) {
		startCodePath(analyzer, node, "function");
	},
	FunctionExpression(analyzer, node, state) {
		startCodePath(analyzer, node, "function");
	},
	ArrowFunctionExpression(analyzer, node, state) {
		startCodePath(analyzer, node, "function");
	},
	StaticBlock(analyzer, node, state) {
		startCodePath(analyzer, node, "class-static-block");
	},
	ChainExpression(analyzer, node, state) {
		state.pushChainContext();
	},
	CallExpression(analyzer, node, state) {
		if (node.optional) {
			state.makeOptionalNode();
		}
	},
	MemberExpression(analyzer, node, state) {
		if (node.optional) {
			state.makeOptionalNode();
		}
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
	},
};

function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);

	if (isPropertyDefinitionValue(node)) {
		startCodePath(analyzer, node, "class-field-initializer");
	}
	if (analyzer.codePath) {
		state = CodePath.getState(analyzer.codePath);
	}
	const handler = enterHandlers[node.type];
	if (handler) {
		handler(analyzer, node, state);
	}
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

//------------------------------------------------------------------------------
// Exit handlers
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
		if (isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
	},
	AssignmentExpression(analyzer, node, state) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.popChoiceContext();
		}
	},
	SwitchStatement(analyzer, node, state) {
		state.popSwitchContext();
	},
	SwitchCase(analyzer, node, state) {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		if (state.forkContext.reachable) {
			return true;
		}
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
	},
};

function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const handler = exitHandlers[node.type];
	let dontForward = false;
	if (handler) {
		const result = handler(analyzer, node, state);
		if (result) {
			dontForward = true;
		}
	}
	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
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
			if (node.optional && node.arguments.length === 0) {
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
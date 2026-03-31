"use strict";

const assert = require("../../shared/assert"),
	{ breakableTypePattern } = require("../../shared/ast-utils"),
	CodePath = require("./code-path"),
	CodePathSegment = require("./code-path-segment"),
	IdGenerator = require("./id-generator"),
	debug = require("./debug-helpers");

//------------------------------------------------------------------------------
// Predicate Helpers
//------------------------------------------------------------------------------

const predicates = {
	isCaseNode: (node) => Boolean(node.test),

	isPropertyDefinitionValue: (node) => {
		const parent = node.parent;
		return parent?.type === "PropertyDefinition" && parent.value === node;
	},

	isHandledLogicalOperator: (operator) =>
		operator === "&&" || operator === "||" || operator === "??",

	isLogicalAssignmentOperator: (operator) =>
		operator === "&&=" || operator === "||=" || operator === "??=",

	getBooleanValueIfSimpleConstant: (node) =>
		node.type === "Literal" ? Boolean(node.value) : undefined,

	isForkingByTrueOrFalse: (node) => {
		const parent = node.parent;
		const { type } = parent;

		if (["ConditionalExpression", "IfStatement", "WhileStatement", "DoWhileStatement", "ForStatement"].includes(type)) {
			return parent.test === node;
		}

		if (type === "LogicalExpression") {
			return predicates.isHandledLogicalOperator(parent.operator);
		}

		if (type === "AssignmentExpression") {
			return predicates.isLogicalAssignmentOperator(parent.operator);
		}

		return false;
	},

	isIdentifierReference: (node) => {
		const parent = node.parent;
		const { type } = parent;

		const nonReferenceTypes = [
			"LabeledStatement", "BreakStatement", "ContinueStatement",
			"ArrayPattern", "RestElement", "ImportSpecifier",
			"ImportDefaultSpecifier", "ImportNamespaceSpecifier", "CatchClause",
		];

		if (nonReferenceTypes.includes(type)) {
			return false;
		}

		const declarationTypes = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ClassDeclaration", "ClassExpression", "VariableDeclarator"];
		if (declarationTypes.includes(type)) {
			return parent.id !== node;
		}

		if (["Property", "PropertyDefinition", "MethodDefinition"].includes(type)) {
			return parent.key !== node || parent.computed || parent.shorthand;
		}

		if (type === "AssignmentPattern") {
			return parent.key !== node;
		}

		return true;
	},

	getLabel: (node) =>
		node.parent.type === "LabeledStatement" ? node.parent.label.name : null,
};

//------------------------------------------------------------------------------
// State Management Helpers
//------------------------------------------------------------------------------

function emitSegmentEvent(analyzer, segment, node, isEnd) {
	const eventName = segment.reachable
		? isEnd ? "onCodePathSegmentEnd" : "onCodePathSegmentStart"
		: isEnd ? "onUnreachableCodePathSegmentEnd" : "onUnreachableCodePathSegmentStart";

	debug.dump(`${eventName} ${segment.id}`);
	if (!isEnd) {
		CodePathSegment.markUsed(segment);
	}
	analyzer.emit(eventName, [segment, node]);
}

function forwardCurrentToHead(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const { currentSegments, headSegments } = state;
	const end = Math.max(currentSegments.length, headSegments.length);

	// Emit leaving events
	for (let i = 0; i < end; ++i) {
		const current = currentSegments[i];
		const head = headSegments[i];
		if (current !== head && current) {
			emitSegmentEvent(analyzer, current, node, true);
		}
	}

	state.currentSegments = headSegments;

	// Emit entering events
	for (let i = 0; i < end; ++i) {
		const current = currentSegments[i];
		const head = headSegments[i];
		if (current !== head && head) {
			emitSegmentEvent(analyzer, head, node, false);
		}
	}
}

function leaveFromCurrentSegment(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const { currentSegments } = state;

	for (let i = 0; i < currentSegments.length; ++i) {
		emitSegmentEvent(analyzer, currentSegments[i], node, true);
	}

	state.currentSegments = [];
}

//------------------------------------------------------------------------------
// Preprocessing Handlers
//------------------------------------------------------------------------------

const preprocessHandlers = {
	CallExpression: (state, node, parent) => {
		if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node) {
			state.makeOptionalRight();
		}
	},

	MemberExpression: (state, node, parent) => {
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
	},

	LogicalExpression: (state, node, parent) => {
		if (parent.right === node && predicates.isHandledLogicalOperator(parent.operator)) {
			state.makeLogicalRight();
		}
	},

	AssignmentExpression: (state, node, parent) => {
		if (parent.right === node && predicates.isLogicalAssignmentOperator(parent.operator)) {
			state.makeLogicalRight();
		}
	},

	ConditionalExpression: (state, node, parent) => {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},

	IfStatement: (state, node, parent) => {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},

	SwitchCase: (state, node, parent) => {
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
	},

	TryStatement: (state, node, parent) => {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	},

	WhileStatement: (state, node, parent) => {
		if (parent.test === node) {
			state.makeWhileTest(predicates.getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	},

	DoWhileStatement: (state, node, parent) => {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(predicates.getBooleanValueIfSimpleConstant(node));
		}
	},

	ForStatement: (state, node, parent) => {
		if (parent.test === node) {
			state.makeForTest(predicates.getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	},

	ForInStatement: (state, node, parent) => {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},

	ForOfStatement: (state, node, parent) => {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},

	AssignmentPattern: (state, node, parent) => {
		if (parent.right === node) {
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
	},
};

function preprocess(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;
	const handler = preprocessHandlers[parent.type];

	if (handler) {
		handler(state, node, parent);
	}
}

//------------------------------------------------------------------------------
// Enter Processing Handlers
//------------------------------------------------------------------------------

const enterHandlers = {
	Program: (state) => state,
	FunctionDeclaration: (state) => state,
	FunctionExpression: (state) => state,
	ArrowFunctionExpression: (state) => state,
	StaticBlock: (state) => state,

	ChainExpression: (state) => {
		state.pushChainContext();
		return state;
	},

	CallExpression: (state, node) => {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
		return state;
	},

	MemberExpression: (state, node) => {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
		return state;
	},

	LogicalExpression: (state, node) => {
		if (predicates.isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(node.operator, predicates.isForkingByTrueOrFalse(node));
		}
		return state;
	},

	AssignmentExpression: (state, node) => {
		if (predicates.isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(node.operator.slice(0, -1), predicates.isForkingByTrueOrFalse(node));
		}
		return state;
	},

	ConditionalExpression: (state) => {
		state.pushChoiceContext("test", false);
		return state;
	},

	IfStatement: (state) => {
		state.pushChoiceContext("test", false);
		return state;
	},

	SwitchStatement: (state, node) => {
		state.pushSwitchContext(node.cases.some(predicates.isCaseNode), predicates.getLabel(node));
		return state;
	},

	TryStatement: (state, node) => {
		state.pushTryContext(Boolean(node.finalizer));
		return state;
	},

	SwitchCase: (state, node, parent) => {
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
		return state;
	},

	WhileStatement: (state, node) => {
		state.pushLoopContext(node.type, predicates.getLabel(node));
		return state;
	},

	DoWhileStatement: (state, node) => {
		state.pushLoopContext(node.type, predicates.getLabel(node));
		return state;
	},

	ForStatement: (state, node) => {
		state.pushLoopContext(node.type, predicates.getLabel(node));
		return state;
	},

	ForInStatement: (state, node) => {
		state.pushLoopContext(node.type, predicates.getLabel(node));
		return state;
	},

	ForOfStatement: (state, node) => {
		state.pushLoopContext(node.type, predicates.getLabel(node));
		return state;
	},

	LabeledStatement: (state, node) => {
		if (!breakableTypePattern.test(node.body.type)) {
			state.pushBreakContext(false, node.label.name);
		}
		return state;
	},
};

function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);
	const parent = node.parent;

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

	if (predicates.isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");
	}

	const startCodePathTypes = ["Program", "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "StaticBlock"];
	if (startCodePathTypes.includes(node.type)) {
		startCodePath(node.type === "Program" ? "program" : node.type === "StaticBlock" ? "class-static-block" : "function");
	}

	const handler = enterHandlers[node.type];
	if (handler) {
		handler(state, node, parent);
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

//------------------------------------------------------------------------------
// Exit Processing Handlers
//------------------------------------------------------------------------------

const exitHandlers = {
	ChainExpression: (state) => {
		state.popChainContext();
		return false;
	},

	IfStatement: (state) => {
		state.popChoiceContext();
		return false;
	},

	ConditionalExpression: (state) => {
		state.popChoiceContext();
		return false;
	},

	LogicalExpression: (state, node) => {
		if (predicates.isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
		return false;
	},

	AssignmentExpression: (state, node) => {
		if (predicates.isLogicalAssignmentOperator(node.operator)) {
			state.popChoiceContext();
		}
		return false;
	},

	SwitchStatement: (state) => {
		state.popSwitchContext();
		return false;
	},

	SwitchCase: (state, node) => {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		return state.forkContext.reachable;
	},

	TryStatement: (state) => {
		state.popTryContext();
		return false;
	},

	BreakStatement: (state, node, analyzer) => {
		forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label?.name);
		return true;
	},

	ContinueStatement: (state, node, analyzer) => {
		forwardCurrentToHead(analyzer, node);
		state.makeContinue(node.label?.name);
		return true;
	},

	ReturnStatement: (state, node, analyzer) => {
		forwardCurrentToHead(analyzer, node);
		state.makeReturn();
		return true;
	},

	ThrowStatement: (state, node, analyzer) => {
		forwardCurrentToHead(analyzer, node);
		state.makeThrow();
		return true;
	},

	Identifier: (state, node) => {
		if (predicates.is
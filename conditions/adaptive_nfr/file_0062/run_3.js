```javascript
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

const PredicateHelpers = {
	isCaseNode: (node) => Boolean(node.test),

	isPropertyDefinitionValue: (node) => {
		const parent = node.parent;
		return parent && parent.type === "PropertyDefinition" && parent.value === node;
	},

	isHandledLogicalOperator: (operator) =>
		operator === "&&" || operator === "||" || operator === "??",

	isLogicalAssignmentOperator: (operator) =>
		operator === "&&=" || operator === "||=" || operator === "??=",

	getLabel: (node) =>
		node.parent.type === "LabeledStatement" ? node.parent.label.name : null,

	isForkingByTrueOrFalse: (node) => {
		const parent = node.parent;
		const type = parent.type;

		if (["ConditionalExpression", "IfStatement", "WhileStatement", "DoWhileStatement", "ForStatement"].includes(type)) {
			return parent.test === node;
		}
		if (type === "LogicalExpression") {
			return PredicateHelpers.isHandledLogicalOperator(parent.operator);
		}
		if (type === "AssignmentExpression") {
			return PredicateHelpers.isLogicalAssignmentOperator(parent.operator);
		}
		return false;
	},

	getBooleanValueIfSimpleConstant: (node) =>
		node.type === "Literal" ? Boolean(node.value) : void 0,

	isIdentifierReference: (node) => {
		const parent = node.parent;
		const type = parent.type;

		const nonReferenceTypes = [
			"LabeledStatement", "BreakStatement", "ContinueStatement",
			"ArrayPattern", "RestElement", "ImportSpecifier",
			"ImportDefaultSpecifier", "ImportNamespaceSpecifier", "CatchClause"
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
	}
};

//------------------------------------------------------------------------------
// State Management Helpers
//------------------------------------------------------------------------------

const StateHelpers = {
	forwardCurrentToHead: (analyzer, node) => {
		const codePath = analyzer.codePath;
		const state = CodePath.getState(codePath);
		const currentSegments = state.currentSegments;
		const headSegments = state.headSegments;
		const end = Math.max(currentSegments.length, headSegments.length);

		// Fires leaving events
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

		state.currentSegments = headSegments;

		// Fires entering events
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
	},

	leaveFromCurrentSegment: (analyzer, node) => {
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
};

//------------------------------------------------------------------------------
// Preprocessor Handlers
//------------------------------------------------------------------------------

const PreprocessHandlers = {
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
		if (parent.right === node && PredicateHelpers.isHandledLogicalOperator(parent.operator)) {
			state.makeLogicalRight();
		}
	},

	AssignmentExpression: (state, node, parent) => {
		if (parent.right === node && PredicateHelpers.isLogicalAssignmentOperator(parent.operator)) {
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
			state.makeWhileTest(PredicateHelpers.getBooleanValueIfSimpleConstant(node));
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
			state.makeDoWhileTest(PredicateHelpers.getBooleanValueIfSimpleConstant(node));
		}
	},

	ForStatement: (state, node, parent) => {
		if (parent.test === node) {
			state.makeForTest(PredicateHelpers.getBooleanValueIfSimpleConstant(node));
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
	}
};

function preprocess(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;
	const handler = PreprocessHandlers[parent.type];

	if (handler) {
		handler(state, node, parent);
	}
}

//------------------------------------------------------------------------------
// Enter Handlers
//------------------------------------------------------------------------------

const EnterHandlers = {
	Program: (state) => {},
	FunctionDeclaration: (state) => {},
	FunctionExpression: (state) => {},
	ArrowFunctionExpression: (state) => {},
	StaticBlock: (state) => {},

	ChainExpression: (state) => {
		state.pushChainContext();
	},

	CallExpression: (state, node) => {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	},

	MemberExpression: (state, node) => {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	},

	LogicalExpression: (state, node) => {
		if (PredicateHelpers.isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(node.operator, PredicateHelpers.isForkingByTrueOrFalse(node));
		}
	},

	AssignmentExpression: (state, node) => {
		if (PredicateHelpers.isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator.slice(0, -1),
				PredicateHelpers.isForkingByTrueOrFalse(node)
			);
		}
	},

	ConditionalExpression: (state) => {
		state.pushChoiceContext("test", false);
	},

	IfStatement: (state) => {
		state.pushChoiceContext("test", false);
	},

	SwitchStatement: (state, node) => {
		state.pushSwitchContext(
			node.cases.some(PredicateHelpers.isCaseNode),
			PredicateHelpers.getLabel(node)
		);
	},

	TryStatement: (state, node) => {
		state.pushTryContext(Boolean(node.finalizer));
	},

	SwitchCase: (state, node, parent) => {
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
	},

	WhileStatement: (state, node) => {
		state.pushLoopContext(node.type, PredicateHelpers.getLabel(node));
	},

	DoWhileStatement: (state, node) => {
		state.pushLoopContext(node.type, PredicateHelpers.getLabel(node));
	},

	ForStatement: (state, node) => {
		state.pushLoopContext(node.type, PredicateHelpers.getLabel(node));
	},

	ForInStatement: (state, node) => {
		state.pushLoopContext(node.type, PredicateHelpers.getLabel(node));
	},

	ForOfStatement: (state, node) => {
		state.pushLoopContext(node.type, PredicateHelpers.getLabel(node));
	},

	LabeledStatement: (state, node) => {
		if (!breakableTypePattern.test(node.body.type)) {
			state.pushBreakContext(false, node.label.name);
		}
	}
};

function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);
	const parent = node.parent;

	function startCodePath(origin) {
		if (codePath) {
			StateHelpers.forwardCurrentToHead(analyzer, node);
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

	if (PredicateHelpers.isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");
	}

	const codePathStartTypes = ["Program", "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "StaticBlock"];
	if (codePathStartTypes.includes(node.type)) {
		startCodePath(node.type === "Program" ? "program" : node.type === "StaticBlock" ? "class-static-block" : "function");
	}

	const handler = EnterHandlers[node.type];
	if (handler) {
		handler(state, node, parent);
	}

	StateHelpers.forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

//------------------------------------------------------------------------------
// Exit Handlers
//------------------------------------------------------------------------------

const ExitHandlers = {
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
		if (PredicateHelpers.isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
		return false;
	},

	AssignmentExpression: (state, node) => {
		if (PredicateHelpers.isLogicalAssignmentOperator(node.operator)) {
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
		StateHelpers.forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label && node.label.name);
		return true;
	},

	ContinueStatement: (state, node, analyzer) => {
		StateHelpers.forwardCurrentToHead(
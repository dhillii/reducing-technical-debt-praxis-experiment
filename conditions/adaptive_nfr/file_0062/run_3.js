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
	const forkingParentTypes = {
		ConditionalExpression: () => parent.test === node,
		IfStatement: () => parent.test === node,
		WhileStatement: () => parent.test === node,
		DoWhileStatement: () => parent.test === node,
		ForStatement: () => parent.test === node,
		LogicalExpression: () => isHandledLogicalOperator(parent.operator),
		AssignmentExpression: () => isLogicalAssignmentOperator(parent.operator),
	};

	const checker = forkingParentTypes[parent.type];
	return checker ? checker() : false;
}

function getBooleanValueIfSimpleConstant(node) {
	if (node.type === "Literal") {
		return Boolean(node.value);
	}
	return void 0;
}

/** @returns {boolean} `true` if the node is a reference. */
function isIdentifierReference(node) {
	const parent = node.parent;
	const nonReferenceParents = {
		LabeledStatement: true,
		BreakStatement: true,
		ContinueStatement: true,
		ArrayPattern: true,
		RestElement: true,
		ImportSpecifier: true,
		ImportDefaultSpecifier: true,
		ImportNamespaceSpecifier: true,
		CatchClause: true,
	};

	if (nonReferenceParents[parent.type]) {
		return false;
	}

	const conditionalParents = {
		FunctionDeclaration: () => parent.id !== node,
		FunctionExpression: () => parent.id !== node,
		ArrowFunctionExpression: () => parent.id !== node,
		ClassDeclaration: () => parent.id !== node,
		ClassExpression: () => parent.id !== node,
		VariableDeclarator: () => parent.id !== node,
		Property: () => parent.key !== node || parent.computed || parent.shorthand,
		PropertyDefinition: () => parent.key !== node || parent.computed || parent.shorthand,
		MethodDefinition: () => parent.key !== node || parent.computed || parent.shorthand,
		AssignmentPattern: () => parent.key !== node,
	};

	const checker = conditionalParents[parent.type];
	return checker ? checker() : true;
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

/** Handles preprocessing for CallExpression and MemberExpression nodes. */
function preprocessOptionalChain(state, parent, node) {
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
	}
}

/** Handles preprocessing for logical and assignment expressions. */
function preprocessLogicalExpression(state, parent, node) {
	if (parent.type === "LogicalExpression") {
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

/** Handles preprocessing for conditional and if statements. */
function preprocessConditional(state, parent, node) {
	if (parent.type === "ConditionalExpression" || parent.type === "IfStatement") {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	}
}

/** Handles preprocessing for loop statements. */
function preprocessLoop(state, parent, node) {
	if (parent.type === "WhileStatement") {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	} else if (parent.type === "DoWhileStatement") {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	} else if (parent.type === "ForStatement") {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	} else if (parent.type === "ForInStatement" || parent.type === "ForOfStatement") {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	}
}

function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	preprocessOptionalChain(state, parent, node);
	preprocessLogicalExpression(state, parent, node);
	preprocessConditional(state, parent, node);

	if (parent.type === "SwitchCase") {
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
	} else if (parent.type === "TryStatement") {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	} else {
		preprocessLoop(state, parent, node);
	}

	if (parent.type === "AssignmentPattern") {
		if (parent.right === node) {
			state.pushForkContext();
			state.forkBypassPath();
			state.forkPath();
		}
	}
}

/** Starts a new code path for the given origin. */
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

/** Handles code path entry for scope-creating nodes. */
function processScopeEntry(analyzer, node) {
	const scopeNodeTypes = {
		Program: "program",
		FunctionDeclaration: "function",
		FunctionExpression: "function",
		ArrowFunctionExpression: "function",
		StaticBlock: "class-static-block",
	};

	if (scopeNodeTypes[node.type]) {
		startCodePath(analyzer, node, scopeNodeTypes[node.type]);
	}
}

/** Handles code path entry for expression nodes. */
function processExpressionEntry(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (node.type === "ChainExpression") {
		state.pushChainContext();
	} else if (node.type === "CallExpression" || node.type === "MemberExpression") {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
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

/** Handles code path entry for control flow nodes. */
function processControlFlowEntry(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;

	if (node.type === "ConditionalExpression" || node.type === "IfStatement") {
		state.pushChoiceContext("test", false);
	} else if (node.type === "SwitchStatement") {
		state.pushSwitchContext(
			node.cases.some(isCaseNode),
			getLabel(node),
		);
	} else if (node.type === "TryStatement") {
		state.pushTryContext(Boolean(node.finalizer));
	} else if (node.type === "SwitchCase") {
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
	} else if (
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

function processCodePathToEnter(analyzer, node) {
	if (isPropertyDefinitionValue(node)) {
		startCodePath(analyzer, node, "class-field-initializer");
	}

	processScopeEntry(analyzer, node);
	processExpressionEntry(analyzer, node);
	processControlFlowEntry(analyzer, node);

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, CodePath.getState(analyzer.codePath), false);
}

/** Handles code path exit for expression nodes. */
function processExpressionExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (node.type === "ChainExpression") {
		state.popChainContext();
	} else if (node.type === "LogicalExpression") {
		if (isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
	} else if (node.type === "AssignmentExpression") {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.popChoiceContext();
		}
	}
}

/** Handles code path exit for control flow nodes. */
function processControlFlowExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	let dontForward = false;

	if (node.type === "IfStatement" || node.type === "ConditionalExpression") {
		state.popChoiceContext();
	} else if (node.type === "SwitchStatement") {
		state.popSwitchContext();
	} else if (node.type === "SwitchCase") {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		if (state.forkContext.reachable) {
			dontForward = true;
		}
	} else if (node.type === "TryStatement") {
		state.popTryContext();
	} else if (
		node.type === "WhileStatement" ||
		node.type === "DoWhileStatement" ||
		node.type === "ForStatement" ||
		node.type === "ForInStatement" ||
		node.type === "ForOfStatement"
	) {
		state.popLoopContext();
	} else if (node.type === "LabeledStatement") {
		if (!breakableTypePattern.test(node.body.type)) {
			state.popBreakContext();
		}
	}

	return dontForward;
}

/** Handles code path exit for jump statements. */
function processJumpExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (node.type === "BreakStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label && node.label.name);
		return true;
	} else if (node.type === "ContinueStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeContinue(node.label && node.label.name);
		return true;
	} else if (node.type === "ReturnStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeReturn();
		return true;
	} else if (node.type === "ThrowStatement") {
		forwardCurrentToHead(analyzer, node);
		state.makeThrow();
		return true;
	}

	return false;
}

/** Handles code path exit for throwable nodes. */
function processThrowableExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);

	if (node.type === "Identifier") {
		if (isIdentifierReference(node)) {
			state.makeFirstThrowablePathInTryBlock();
			return true;
		}
	} else if (
		node.type === "CallExpression" ||
		node.type === "ImportExpression" ||
		node.type === "MemberExpression" ||
		node.type === "NewExpression" ||
		node.type === "YieldExpression"
	) {
		state.makeFirstThrowablePathInTryBlock();
	}

	return false;
}

function processCodePathToExit(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	let dontForward = false;

	processExpressionExit(analyzer, node);
	dontForward = processControlFlowExit(analyzer, node) || dontForward;
	dontForward = processJumpExit(analyzer, node) || dontForward;
	dontForward = processThrowableExit(analyzer, node) || dontForward;

	if (node.type === "AssignmentPattern") {
		state.popForkContext();
	}

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

/** Ends the current code path. */
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

/** Handles postprocessing for scope-ending nodes. */
function processScopeExit(analyzer, node) {
	const scopeEndingTypes = {
		Program: true,
		FunctionDeclaration: true,
		FunctionExpression: true,
		ArrowFunctionExpression: true,
		StaticBlock: true,
	};

	if (scopeEndingTypes[node.type]) {
		endCodePath(analyzer, node);
	}
}

function postprocess(analyzer, node) {
	processScopeExit(analyzer, node);

	if (node.type === "CallExpression") {
		if (node.optional === true && node.arguments.length === 0) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
	}

	if (isPropertyDefinitionValue(node)) {
		endCodePath(analyzer, node);
	}
}

class CodePathAnalyzer {
	/**
	 * @param {EventGenerator} eventGenerator An event generator to wrap.
	 */
	constructor(eventGenerator) {
		this.original = eventGenerator;
		this.emit = eventGenerator.emit;
		this.codePath = null;
		this.idGenerator = new IdGenerator("s");
		this.currentNode = null;
		this.onLooped = this.onLooped.bind(this);
	}

	/**
	 * Does the process to enter a given AST node.
	 * This updates state of analysis and calls `enterNode` of the wrapped.
	 * @param {ASTNode} node A node which is entering.
	 * @returns {void}
	 */
	enterNode(node) {
		this.currentNode = node;

		if (node.parent) {
			preprocess(this, node);
		}

		processCodePathToEnter(this, node);

		this.original.enterNode(node);

		this.currentNode = null;
	}

	/**
	 * Does the process to leave a given AST node.
	 * This updates state of analysis and calls `leaveNode` of the wrapped.
	 * @param {ASTNode} node A node which is leaving.
	 * @returns {void}
	 */
	leaveNode(node) {
		this.currentNode = node;

		processCodePathToExit(this, node);

		this.original.leaveNode(node);

		postprocess(this, node);

		this.currentNode = null;
	}

	/**
	 * This is called on a code path looped.
	 * Then this raises a looped event.
	 * @param {CodePathSegment} fromSegment A segment of prev.
	 * @param {CodePathSegment} toSegment A segment of next.
	 * @returns {void}
	 */
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
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

// Handles CallExpression and MemberExpression optional chaining
function preprocessOptionalChaining(state, parent, node) {
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

// Handles LogicalExpression and AssignmentExpression with logical operators
function preprocessLogicalOperators(state, parent, node) {
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

// Handles ConditionalExpression and IfStatement branching
function preprocessConditionalBranches(state, parent, node) {
	if (parent.type === "ConditionalExpression" || parent.type === "IfStatement") {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	}
}

// Handles SwitchCase body processing
function preprocessSwitchCase(state, parent, node) {
	if (parent.type === "SwitchCase" && parent.consequent[0] === node) {
		state.makeSwitchCaseBody(false, !parent.test);
	}
}

// Handles TryStatement catch and finally blocks
function preprocessTryStatement(state, parent, node) {
	if (parent.type === "TryStatement") {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	}
}

// Handles WhileStatement test and body
function preprocessWhileStatement(state, parent, node) {
	if (parent.type === "WhileStatement") {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	}
}

// Handles DoWhileStatement body and test
function preprocessDoWhileStatement(state, parent, node) {
	if (parent.type === "DoWhileStatement") {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	}
}

// Handles ForStatement test, update, and body
function preprocessForStatement(state, parent, node) {
	if (parent.type === "ForStatement") {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	}
}

// Handles ForInStatement and ForOfStatement
function preprocessForInOfStatement(state, parent, node) {
	if (parent.type === "ForInStatement" || parent.type === "ForOfStatement") {
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

// Handles AssignmentPattern right side forking
function preprocessAssignmentPattern(state, parent, node) {
	if (parent.type === "AssignmentPattern" && parent.right === node) {
		state.pushForkContext();
		state.forkBypassPath();
		state.forkPath();
	}
}

function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;

	preprocessOptionalChaining(state, parent, node);
	preprocessLogicalOperators(state, parent, node);
	preprocessConditionalBranches(state, parent, node);
	preprocessSwitchCase(state, parent, node);
	preprocessTryStatement(state, parent, node);
	preprocessWhileStatement(state, parent, node);
	preprocessDoWhileStatement(state, parent, node);
	preprocessForStatement(state, parent, node);
	preprocessForInOfStatement(state, parent, node);
	preprocessAssignmentPattern(state, parent, node);
}

// Handles code path start for various node types
function handleCodePathStart(analyzer, node, codePath, state, startCodePath) {
	if (isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");
	}

	switch (node.type) {
		case "Program":
			startCodePath("program");
			break;

		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			startCodePath("function");
			break;

		case "StaticBlock":
			startCodePath("class-static-block");
			break;

		case "ChainExpression":
			state.pushChainContext();
			break;

		case "CallExpression":
			if (node.optional === true) {
				state.makeOptionalNode();
			}
			break;

		case "MemberExpression":
			if (node.optional === true) {
				state.makeOptionalNode();
			}
			break;

		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) {
				state.pushChoiceContext(
					node.operator,
					isForkingByTrueOrFalse(node),
				);
			}
			break;

		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) {
				state.pushChoiceContext(
					node.operator.slice(0, -1),
					isForkingByTrueOrFalse(node),
				);
			}
			break;

		case "ConditionalExpression":
		case "IfStatement":
			state.pushChoiceContext("test", false);
			break;

		case "SwitchStatement":
			state.pushSwitchContext(
				node.cases.some(isCaseNode),
				getLabel(node),
			);
			break;

		case "TryStatement":
			state.pushTryContext(Boolean(node.finalizer));
			break;

		case "SwitchCase":
			if (node.parent.discriminant !== node && node.parent.cases[0] !== node) {
				state.forkPath();
			}
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
}

function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);

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

	handleCodePathStart(analyzer, node, codePath, state, startCodePath);

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

// Handles ChainExpression and choice contexts
function exitChoiceContexts(state, node) {
	if (node.type === "ChainExpression") {
		state.popChainContext();
	} else if (node.type === "IfStatement" || node.type === "ConditionalExpression") {
		state.popChoiceContext();
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

// Handles switch statement exit
function exitSwitchStatement(state, node) {
	if (node.type === "SwitchStatement") {
		state.popSwitchContext();
	} else if (node.type === "SwitchCase") {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		return state.forkContext.reachable;
	}
	return false;
}

// Handles control flow statements (break, continue, return, throw)
function exitControlFlowStatement(analyzer, state, node) {
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

// Handles identifier and throwable expressions
function exitThrowableExpression(analyzer, state, node) {
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

// Handles loop and pattern contexts
function exitContexts(state, node) {
	if (
		node.type === "WhileStatement" ||
		node.type === "DoWhileStatement" ||
		node.type === "ForStatement" ||
		node.type === "ForInStatement" ||
		node.type === "ForOfStatement"
	) {
		state.popLoopContext();
	} else if (node.type === "AssignmentPattern") {
		state.popForkContext();
	} else if (node.type === "LabeledStatement") {
		if (!breakableTypePattern.test(node.body.type)) {
			state.popBreakContext();
		}
	} else if (node.type === "TryStatement") {
		state.popTryContext();
	}
}

function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	let dontForward = false;

	exitChoiceContexts(state, node);

	const switchReachable = exitSwitchStatement(state, node);
	if (switchReachable) {
		dontForward = true;
	}

	if (exitControlFlowStatement(analyzer, state, node)) {
		dontForward = true;
	}

	if (exitThrowableExpression(analyzer, state, node)) {
		dontForward = true;
	}

	exitContexts(state, node);

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

// Handles code path end for various node types
function handleCodePathEnd(analyzer, node) {
	const codePathTypes = [
		"Program",
		"FunctionDeclaration",
		"FunctionExpression",
		"ArrowFunctionExpression",
		"StaticBlock",
	];

	if (codePathTypes.includes(node.type)) {
		return true;
	}

	if (node.type === "CallExpression" && node.optional === true && node.arguments.length === 0) {
		CodePath.getState(analyzer.codePath).makeOptionalRight();
	}

	return false;
}

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

	if (handleCodePathEnd(analyzer, node)) {
		endCodePath();
	}

	if (isPropertyDefinitionValue(node)) {
		endCodePath();
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
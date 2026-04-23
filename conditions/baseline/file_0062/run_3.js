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

const preprocessHandlers = {
	CallExpression(parent, node, state) {
		if (
			parent.optional === true &&
			parent.arguments.length >= 1 &&
			parent.arguments[0] === node
		) {
			state.makeOptionalRight();
		}
	},
	MemberExpression(parent, node, state) {
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
	},
	LogicalExpression(parent, node, state) {
		if (
			parent.right === node &&
			isHandledLogicalOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	},
	AssignmentExpression(parent, node, state) {
		if (
			parent.right === node &&
			isLogicalAssignmentOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	},
	ConditionalExpression(parent, node, state) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},
	IfStatement(parent, node, state) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},
	SwitchCase(parent, node, state) {
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
	},
	TryStatement(parent, node, state) {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	},
	WhileStatement(parent, node, state) {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	},
	DoWhileStatement(parent, node, state) {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	},
	ForStatement(parent, node, state) {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	},
	ForInStatement(parent, node, state) {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	ForOfStatement(parent, node, state) {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
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
	},
};

function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;
	const handler = preprocessHandlers[parent.type];

	if (handler) {
		handler(parent, node, state);
	}
}

const enterHandlers = {
	Program(state) {
		return "program";
	},
	FunctionDeclaration(state) {
		return "function";
	},
	FunctionExpression(state) {
		return "function";
	},
	ArrowFunctionExpression(state) {
		return "function";
	},
	StaticBlock(state) {
		return "class-static-block";
	},
	ChainExpression(state) {
		state.pushChainContext();
		return null;
	},
	CallExpression(state, node) {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
		return null;
	},
	MemberExpression(state, node) {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
		return null;
	},
	LogicalExpression(state, node) {
		if (isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator,
				isForkingByTrueOrFalse(node),
			);
		}
		return null;
	},
	AssignmentExpression(state, node) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator.slice(0, -1),
				isForkingByTrueOrFalse(node),
			);
		}
		return null;
	},
	ConditionalExpression(state) {
		state.pushChoiceContext("test", false);
		return null;
	},
	IfStatement(state) {
		state.pushChoiceContext("test", false);
		return null;
	},
	SwitchStatement(state, node) {
		state.pushSwitchContext(
			node.cases.some(isCaseNode),
			getLabel(node),
		);
		return null;
	},
	TryStatement(state, node) {
		state.pushTryContext(Boolean(node.finalizer));
		return null;
	},
	SwitchCase(state, node, parent) {
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
		return null;
	},
	WhileStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
		return null;
	},
	DoWhileStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
		return null;
	},
	ForStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
		return null;
	},
	ForInStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
		return null;
	},
	ForOfStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
		return null;
	},
	LabeledStatement(state, node) {
		if (!breakableTypePattern.test(node.body.type)) {
			state.pushBreakContext(false, node.label.name);
		}
		return null;
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

	if (isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");
	}

	const handler = enterHandlers[node.type];
	if (handler) {
		const origin = handler(state, node, parent);
		if (origin) {
			startCodePath(origin);
		}
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

const exitHandlers = {
	ChainExpression(state) {
		state.popChainContext();
		return false;
	},
	IfStatement(state) {
		state.popChoiceContext();
		return false;
	},
	ConditionalExpression(state) {
		state.popChoiceContext();
		return false;
	},
	LogicalExpression(state, node) {
		if (isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
		return false;
	},
	AssignmentExpression(state, node) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.popChoiceContext();
		}
		return false;
	},
	SwitchStatement(state) {
		state.popSwitchContext();
		return false;
	},
	SwitchCase(state, node) {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		return state.forkContext.reachable;
	},
	TryStatement(state) {
		state.popTryContext();
		return false;
	},
	BreakStatement(state, node) {
		forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label && node.label.name);
		return true;
	},
	ContinueStatement(state, node) {
		forwardCurrentToHead(analyzer, node);
		state.makeContinue(node.label && node.label.name);
		return true;
	},
	ReturnStatement(state, node) {
		forwardCurrentToHead(analyzer, node);
		state.makeReturn();
		return true;
	},
	ThrowStatement(state, node) {
		forwardCurrentToHead(analyzer, node);
		state.makeThrow();
		return true;
	},
	Identifier(state, node) {
		if (isIdentifierReference(node)) {
			state.makeFirstThrowablePathInTryBlock();
			return true;
		}
		return false;
	},
	CallExpression(state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	ImportExpression(state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	MemberExpression(state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	NewExpression(state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	YieldExpression(state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	WhileStatement(state) {
		state.popLoopContext();
		return false;
	},
	DoWhileStatement(state) {
		state.popLoopContext();
		return false;
	},
	ForStatement(state) {
		state.popLoopContext();
		return false;
	},
	ForInStatement(state) {
		state.popLoopContext();
		return false;
	},
	ForOfStatement(state) {
		state.popLoopContext();
		return false;
	},
	AssignmentPattern(state) {
		state.popForkContext();
		return false;
	},
	LabeledStatement(state, node) {
		if (!breakableTypePattern.test(node.body.type)) {
			state.popBreakContext();
		}
		return false;
	},
};

function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const handler = exitHandlers[node.type];
	let dontForward = false;

	if (handler) {
		dontForward = handler(state, node);
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

const postprocessHandlers = {
	Program: endCodePath,
	FunctionDeclaration: endCodePath,
	FunctionExpression: endCodePath,
	ArrowFunctionExpression: endCodePath,
	StaticBlock: endCodePath,
	CallExpression(analyzer, node) {
		if (node.optional === true && node.arguments.length === 0) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
	},
};

function postprocess(analyzer, node) {
	const handler = postprocessHandlers[node.type];

	if (handler) {
		handler(analyzer, node);
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
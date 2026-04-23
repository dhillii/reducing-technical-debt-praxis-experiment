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

/** @type {Object<string, boolean>} */
const nonReferenceParentTypes = {
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

/** @type {Object<string, (parent: ASTNode, node: ASTNode) => boolean>} */
const identifierReferenceChecks = {
	FunctionDeclaration: (parent, node) => parent.id !== node,
	FunctionExpression: (parent, node) => parent.id !== node,
	ArrowFunctionExpression: (parent, node) => parent.id !== node,
	ClassDeclaration: (parent, node) => parent.id !== node,
	ClassExpression: (parent, node) => parent.id !== node,
	VariableDeclarator: (parent, node) => parent.id !== node,
	Property: (parent, node) => parent.key !== node || parent.computed || parent.shorthand,
	PropertyDefinition: (parent, node) => parent.key !== node || parent.computed || parent.shorthand,
	MethodDefinition: (parent, node) => parent.key !== node || parent.computed || parent.shorthand,
	AssignmentPattern: (parent, node) => parent.key !== node,
};

function isIdentifierReference(node) {
	const parent = node.parent;

	if (nonReferenceParentTypes[parent.type]) {
		return false;
	}

	const checker = identifierReferenceChecks[parent.type];
	if (checker) {
		return checker(parent, node);
	}

	return true;
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

/** @type {Object<string, (state: CodePathState, node: ASTNode, parent: ASTNode) => void>} */
const preprocessHandlers = {
	CallExpression(state, node, parent) {
		if (
			parent.optional === true &&
			parent.arguments.length >= 1 &&
			parent.arguments[0] === node
		) {
			state.makeOptionalRight();
		}
	},
	MemberExpression(state, node, parent) {
		if (parent.optional === true && parent.property === node) {
			state.makeOptionalRight();
		}
	},
	LogicalExpression(state, node, parent) {
		if (
			parent.right === node &&
			isHandledLogicalOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	},
	AssignmentExpression(state, node, parent) {
		if (
			parent.right === node &&
			isLogicalAssignmentOperator(parent.operator)
		) {
			state.makeLogicalRight();
		}
	},
	ConditionalExpression(state, node, parent) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},
	IfStatement(state, node, parent) {
		if (parent.consequent === node) {
			state.makeIfConsequent();
		} else if (parent.alternate === node) {
			state.makeIfAlternate();
		}
	},
	SwitchCase(state, node, parent) {
		if (parent.consequent[0] === node) {
			state.makeSwitchCaseBody(false, !parent.test);
		}
	},
	TryStatement(state, node, parent) {
		if (parent.handler === node) {
			state.makeCatchBlock();
		} else if (parent.finalizer === node) {
			state.makeFinallyBlock();
		}
	},
	WhileStatement(state, node, parent) {
		if (parent.test === node) {
			state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
		} else {
			assert(parent.body === node);
			state.makeWhileBody();
		}
	},
	DoWhileStatement(state, node, parent) {
		if (parent.body === node) {
			state.makeDoWhileBody();
		} else {
			assert(parent.test === node);
			state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
		}
	},
	ForStatement(state, node, parent) {
		if (parent.test === node) {
			state.makeForTest(getBooleanValueIfSimpleConstant(node));
		} else if (parent.update === node) {
			state.makeForUpdate();
		} else if (parent.body === node) {
			state.makeForBody();
		}
	},
	ForInStatement(state, node, parent) {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	ForOfStatement(state, node, parent) {
		if (parent.left === node) {
			state.makeForInOfLeft();
		} else if (parent.right === node) {
			state.makeForInOfRight();
		} else {
			assert(parent.body === node);
			state.makeForInOfBody();
		}
	},
	AssignmentPattern(state, node, parent) {
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
		handler(state, node, parent);
	}
}

/** @type {Object<string, (analyzer: CodePathAnalyzer, node: ASTNode, state: CodePathState) => void>} */
const enterHandlers = {
	Program(analyzer, node, state) {
		this.startCodePath(analyzer, node, "program");
	},
	FunctionDeclaration(analyzer, node, state) {
		this.startCodePath(analyzer, node, "function");
	},
	FunctionExpression(analyzer, node, state) {
		this.startCodePath(analyzer, node, "function");
	},
	ArrowFunctionExpression(analyzer, node, state) {
		this.startCodePath(analyzer, node, "function");
	},
	StaticBlock(analyzer, node, state) {
		this.startCodePath(analyzer, node, "class-static-block");
	},
	ChainExpression(analyzer, node, state) {
		state.pushChainContext();
	},
	CallExpression(analyzer, node, state) {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	},
	MemberExpression(analyzer, node, state) {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	},
	LogicalExpression(analyzer, node, state) {
		if (isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator,
				isForkingByTrueOrFalse(node),
			);
		}
	},
	AssignmentExpression(analyzer, node, state) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator.slice(0, -1),
				isForkingByTrueOrFalse(node),
			);
		}
	},
	ConditionalExpression(analyzer, node, state) {
		state.pushChoiceContext("test", false);
	},
	IfStatement(analyzer, node, state) {
		state.pushChoiceContext("test", false);
	},
	SwitchStatement(analyzer, node, state) {
		state.pushSwitchContext(
			node.cases.some(isCaseNode),
			getLabel(node),
		);
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
		handler.call({ startCodePath }, analyzer, node, state);
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/** @type {Object<string, (analyzer: CodePathAnalyzer, node: ASTNode, state: CodePathState) => boolean>} */
const exitHandlers = {
	ChainExpression(analyzer, node, state) {
		state.popChainContext();
		return false;
	},
	IfStatement(analyzer, node, state) {
		state.popChoiceContext();
		return false;
	},
	ConditionalExpression(analyzer, node, state) {
		state.popChoiceContext();
		return false;
	},
	LogicalExpression(analyzer, node, state) {
		if (isHandledLogicalOperator(node.operator)) {
			state.popChoiceContext();
		}
		return false;
	},
	AssignmentExpression(analyzer, node, state) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.popChoiceContext();
		}
		return false;
	},
	SwitchStatement(analyzer, node, state) {
		state.popSwitchContext();
		return false;
	},
	SwitchCase(analyzer, node, state) {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		return state.forkContext.reachable;
	},
	TryStatement(analyzer, node, state) {
		state.popTryContext();
		return false;
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
		return false;
	},
	CallExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	ImportExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	MemberExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	NewExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	YieldExpression(analyzer, node, state) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	WhileStatement(analyzer, node, state) {
		state.popLoopContext();
		return false;
	},
	DoWhileStatement(analyzer, node, state) {
		state.popLoopContext();
		return false;
	},
	ForStatement(analyzer, node, state) {
		state.popLoopContext();
		return false;
	},
	ForInStatement(analyzer, node, state) {
		state.popLoopContext();
		return false;
	},
	ForOfStatement(analyzer, node, state) {
		state.popLoopContext();
		return false;
	},
	AssignmentPattern(analyzer, node, state) {
		state.popForkContext();
		return false;
	},
	LabeledStatement(analyzer, node, state) {
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
	const dontForward = handler ? handler(analyzer, node, state) : false;

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

/** @type {Object<string, (analyzer: CodePathAnalyzer, node: ASTNode) => void>} */
const postprocessHandlers = {
	Program(analyzer, node) {
		this.endCodePath(analyzer, node);
	},
	FunctionDeclaration(analyzer, node) {
		this.endCodePath(analyzer, node);
	},
	FunctionExpression(analyzer, node) {
		this.endCodePath(analyzer, node);
	},
	ArrowFunctionExpression(analyzer, node) {
		this.endCodePath(analyzer, node);
	},
	StaticBlock(analyzer, node) {
		this.endCodePath(analyzer, node);
	},
	CallExpression(analyzer, node) {
		if (node.optional === true && node.arguments.length === 0) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
	},
};

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

	const handler = postprocessHandlers[node.type];
	if (handler) {
		handler.call({ endCodePath }, analyzer, node);
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
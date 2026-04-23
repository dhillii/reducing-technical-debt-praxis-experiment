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

/** @type {Object<string, (node: ASTNode, parent: ASTNode) => boolean>} */
const identifierReferenceExceptions = {
	LabeledStatement: () => false,
	BreakStatement: () => false,
	ContinueStatement: () => false,
	ArrayPattern: () => false,
	RestElement: () => false,
	ImportSpecifier: () => false,
	ImportDefaultSpecifier: () => false,
	ImportNamespaceSpecifier: () => false,
	CatchClause: () => false,
	FunctionDeclaration: (node, parent) => parent.id !== node,
	FunctionExpression: (node, parent) => parent.id !== node,
	ArrowFunctionExpression: (node, parent) => parent.id !== node,
	ClassDeclaration: (node, parent) => parent.id !== node,
	ClassExpression: (node, parent) => parent.id !== node,
	VariableDeclarator: (node, parent) => parent.id !== node,
	Property: (node, parent) => parent.key !== node || parent.computed || parent.shorthand,
	PropertyDefinition: (node, parent) => parent.key !== node || parent.computed || parent.shorthand,
	MethodDefinition: (node, parent) => parent.key !== node || parent.computed || parent.shorthand,
	AssignmentPattern: (node, parent) => parent.key !== node,
};

function isIdentifierReference(node) {
	const parent = node.parent;
	const checker = identifierReferenceExceptions[parent.type];

	if (checker) {
		return checker(node, parent);
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

/** @type {Object<string, (state: Object, node: ASTNode, parent: ASTNode) => void>} */
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

/** @type {Object<string, (state: Object, node: ASTNode) => void>} */
const enterHandlers = {
	Program(state, node) {
		// Handled by startCodePath
	},
	FunctionDeclaration(state, node) {
		// Handled by startCodePath
	},
	FunctionExpression(state, node) {
		// Handled by startCodePath
	},
	ArrowFunctionExpression(state, node) {
		// Handled by startCodePath
	},
	StaticBlock(state, node) {
		// Handled by startCodePath
	},
	ChainExpression(state, node) {
		state.pushChainContext();
	},
	CallExpression(state, node) {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	},
	MemberExpression(state, node) {
		if (node.optional === true) {
			state.makeOptionalNode();
		}
	},
	LogicalExpression(state, node) {
		if (isHandledLogicalOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator,
				isForkingByTrueOrFalse(node),
			);
		}
	},
	AssignmentExpression(state, node) {
		if (isLogicalAssignmentOperator(node.operator)) {
			state.pushChoiceContext(
				node.operator.slice(0, -1),
				isForkingByTrueOrFalse(node),
			);
		}
	},
	ConditionalExpression(state, node) {
		state.pushChoiceContext("test", false);
	},
	IfStatement(state, node) {
		state.pushChoiceContext("test", false);
	},
	SwitchStatement(state, node) {
		state.pushSwitchContext(
			node.cases.some(isCaseNode),
			getLabel(node),
		);
	},
	TryStatement(state, node) {
		state.pushTryContext(Boolean(node.finalizer));
	},
	SwitchCase(state, node, parent) {
		if (parent.discriminant !== node && parent.cases[0] !== node) {
			state.forkPath();
		}
	},
	WhileStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	DoWhileStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForInStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	ForOfStatement(state, node) {
		state.pushLoopContext(node.type, getLabel(node));
	},
	LabeledStatement(state, node) {
		if (!breakableTypePattern.test(node.body.type)) {
			state.pushBreakContext(false, node.label.name);
		}
	},
};

/** @type {Set<string>} */
const codepathStartTypes = new Set([
	"Program",
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
	"StaticBlock",
]);

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

	if (codepathStartTypes.has(node.type)) {
		startCodePath(node.type === "Program" ? "program" : 
		             node.type === "StaticBlock" ? "class-static-block" : "function");
	}

	const handler = enterHandlers[node.type];
	if (handler) {
		handler(state, node, parent);
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/** @type {Object<string, (state: Object, node: ASTNode) => boolean>} */
const exitHandlers = {
	ChainExpression(state, node) {
		state.popChainContext();
		return false;
	},
	IfStatement(state, node) {
		state.popChoiceContext();
		return false;
	},
	ConditionalExpression(state, node) {
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
	SwitchStatement(state, node) {
		state.popSwitchContext();
		return false;
	},
	SwitchCase(state, node) {
		if (node.consequent.length === 0) {
			state.makeSwitchCaseBody(true, !node.test);
		}
		return state.forkContext.reachable;
	},
	TryStatement(state, node) {
		state.popTryContext();
		return false;
	},
	BreakStatement(state, node) {
		state.makeBreak(node.label && node.label.name);
		return true;
	},
	ContinueStatement(state, node) {
		state.makeContinue(node.label && node.label.name);
		return true;
	},
	ReturnStatement(state, node) {
		state.makeReturn();
		return true;
	},
	ThrowStatement(state, node) {
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
	CallExpression(state, node) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	ImportExpression(state, node) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	MemberExpression(state, node) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	NewExpression(state, node) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	YieldExpression(state, node) {
		state.makeFirstThrowablePathInTryBlock();
		return false;
	},
	WhileStatement(state, node) {
		state.popLoopContext();
		return false;
	},
	DoWhileStatement(state, node) {
		state.popLoopContext();
		return false;
	},
	ForStatement(state, node) {
		state.popLoopContext();
		return false;
	},
	ForInStatement(state, node) {
		state.popLoopContext();
		return false;
	},
	ForOfStatement(state, node) {
		state.popLoopContext();
		return false;
	},
	AssignmentPattern(state, node) {
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

/** @type {Object<string, (analyzer: CodePathAnalyzer, node: ASTNode) => void>} */
const postprocessHandlers = {
	Program(analyzer, node) {
		endCodePath(analyzer, node);
	},
	FunctionDeclaration(analyzer, node) {
		endCodePath(analyzer, node);
	},
	FunctionExpression(analyzer, node) {
		endCodePath(analyzer, node);
	},
	ArrowFunctionExpression(analyzer, node) {
		endCodePath(analyzer, node);
	},
	StaticBlock(analyzer, node) {
		endCodePath(analyzer, node);
	},
	CallExpression(analyzer, node) {
		if (node.optional === true && node.arguments.length === 0) {
			CodePath.getState(analyzer.codePath).makeOptionalRight();
		}
	},
};

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
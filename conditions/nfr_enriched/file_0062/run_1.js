```javascript
"use strict";

const assert = require("../../shared/assert"),
	{ breakableTypePattern } = require("../../shared/ast-utils"),
	CodePath = require("./code-path"),
	CodePathSegment = require("./code-path-segment"),
	IdGenerator = require("./id-generator"),
	debug = require("./debug-helpers");

//------------------------------------------------------------------------------
// Operator Validators
//------------------------------------------------------------------------------

const LOGICAL_OPERATORS = new Set(["&&", "||", "??"]);
const LOGICAL_ASSIGNMENT_OPERATORS = new Set(["&&=", "||=", "??="]);

function isHandledLogicalOperator(operator) {
	return LOGICAL_OPERATORS.has(operator);
}

function isLogicalAssignmentOperator(operator) {
	return LOGICAL_ASSIGNMENT_OPERATORS.has(operator);
}

//------------------------------------------------------------------------------
// Node Type Checkers
//------------------------------------------------------------------------------

function isCaseNode(node) {
	return Boolean(node.test);
}

function isPropertyDefinitionValue(node) {
	const parent = node.parent;
	return parent?.type === "PropertyDefinition" && parent.value === node;
}

function isForkingByTrueOrFalse(node) {
	const parent = node.parent;

	const forkingNodeTypes = {
		ConditionalExpression: () => parent.test === node,
		IfStatement: () => parent.test === node,
		WhileStatement: () => parent.test === node,
		DoWhileStatement: () => parent.test === node,
		ForStatement: () => parent.test === node,
		LogicalExpression: () => isHandledLogicalOperator(parent.operator),
		AssignmentExpression: () => isLogicalAssignmentOperator(parent.operator),
	};

	const checker = forkingNodeTypes[parent.type];
	return checker ? checker() : false;
}

function getBooleanValueIfSimpleConstant(node) {
	return node.type === "Literal" ? Boolean(node.value) : undefined;
}

function isIdentifierReference(node) {
	const parent = node.parent;

	const nonReferenceParentTypes = new Set([
		"LabeledStatement",
		"BreakStatement",
		"ContinueStatement",
		"ArrayPattern",
		"RestElement",
		"ImportSpecifier",
		"ImportDefaultSpecifier",
		"ImportNamespaceSpecifier",
		"CatchClause",
	]);

	if (nonReferenceParentTypes.has(parent.type)) {
		return false;
	}

	const identifierCheckMap = {
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

	const checker = identifierCheckMap[parent.type];
	return checker ? checker() : true;
}

function getLabel(node) {
	return node.parent.type === "LabeledStatement" ? node.parent.label.name : null;
}

//------------------------------------------------------------------------------
// Segment Management
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
	const currentSegments = state.currentSegments;
	const headSegments = state.headSegments;
	const end = Math.max(currentSegments.length, headSegments.length);

	// Emit leaving events
	for (let i = 0; i < end; ++i) {
		const currentSegment = currentSegments[i];
		const headSegment = headSegments[i];

		if (currentSegment !== headSegment && currentSegment) {
			emitSegmentEvent(analyzer, currentSegment, node, true);
		}
	}

	state.currentSegments = headSegments;

	// Emit entering events
	for (let i = 0; i < end; ++i) {
		const currentSegment = currentSegments[i];
		const headSegment = headSegments[i];

		if (currentSegment !== headSegment && headSegment) {
			emitSegmentEvent(analyzer, headSegment, node, false);
		}
	}
}

function leaveFromCurrentSegment(analyzer, node) {
	const state = CodePath.getState(analyzer.codePath);
	const currentSegments = state.currentSegments;

	for (let i = 0; i < currentSegments.length; ++i) {
		emitSegmentEvent(analyzer, currentSegments[i], node, true);
	}

	state.currentSegments = [];
}

//------------------------------------------------------------------------------
// Preprocessor Handlers
//------------------------------------------------------------------------------

const preprocessHandlers = {
	CallExpression(parent, node, state) {
		if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node) {
			state.makeOptionalRight();
		}
	},
	MemberExpression(parent, node, state) {
		if (parent.optional === true && parent.property === node) {
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
	const state = CodePath.getState(analyzer.codePath);
	const parent = node.parent;
	const handler = preprocessHandlers[parent.type];

	if (handler) {
		handler(parent, node, state);
	}
}

//------------------------------------------------------------------------------
// Entry Handlers
//------------------------------------------------------------------------------

const entryHandlers = {
	ChainExpression(state) {
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
			state.pushChoiceContext(node.operator, isForkingByTrueOrFalse(node));
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
	ConditionalExpression(state) {
		state.pushChoiceContext("test", false);
	},
	IfStatement(state) {
		state.pushChoiceContext("test", false);
	},
	SwitchStatement(state, node) {
		state.pushSwitchContext(node.cases.some(isCaseNode), getLabel(node));
	},
	TryStatement(state, node) {
		state.pushTryContext(Boolean(node.finalizer));
	},
	SwitchCase(state, node) {
		const parent = node.parent;
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

	const codePathStartTypes = {
		Program: "program",
		FunctionDeclaration: "function",
		FunctionExpression: "function",
		ArrowFunctionExpression: "function",
		StaticBlock: "class-static-block",
	};

	if (codePathStartTypes[node.type]) {
		startCodePath(codePathStartTypes[node.type]);
	}

	const handler = entryHandlers[node.type];
	if (handler) {
		handler(state, node);
	}

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

//------------------------------------------------------------------------------
// Exit Handlers
//------------------------------------------------------------------------------

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
	BreakStatement(state, node, analyzer) {
		forwardCurrentToHead(analyzer, node);
		state.makeBreak(node.label?.name);
		return true;
	},
	ContinueStatement(state, node, analyzer) {
		forwardCurrentToHead(analyzer, node);
		state.makeContinue(node.label?.name);
		return true;
	},
	ReturnStatement(state, node, analyzer) {
		forwardCurrentToHead(analyzer, node);
		state.makeReturn();
		return true;
	},
	ThrowStatement(state, node, analyzer) {
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
		return false
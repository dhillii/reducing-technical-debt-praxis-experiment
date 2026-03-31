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
		["&&", "||", "??"].includes(operator),

	isLogicalAssignmentOperator: (operator) =>
		["&&=", "||=", "??="].includes(operator),

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

	getBooleanValueIfSimpleConstant: (node) =>
		node.type === "Literal" ? Boolean(node.value) : undefined,

	isIdentifierReference: (node) => {
		const parent = node.parent;
		const { type } = parent;

		const nonReferenceTypes = [
			"LabeledStatement", "BreakStatement", "ContinueStatement",
			"ArrayPattern", "RestElement", "ImportSpecifier",
			"ImportDefaultSpecifier", "ImportNamespaceSpecifier", "CatchClause",
		];

		if (nonReferenceTypes.includes(type)) return false;

		const declarationTypes = [
			"FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression",
			"ClassDeclaration", "ClassExpression", "VariableDeclarator",
		];
		if (declarationTypes.includes(type)) return parent.id !== node;

		if (["Property", "PropertyDefinition", "MethodDefinition"].includes(type)) {
			return parent.key !== node || parent.computed || parent.shorthand;
		}

		if (type === "AssignmentPattern") return parent.key !== node;

		return true;
	},

	getLabel: (node) =>
		node.parent?.type === "LabeledStatement" ? node.parent.label.name : null,
};

//------------------------------------------------------------------------------
// State Management Helpers
//------------------------------------------------------------------------------

const stateHelpers = {
	forwardCurrentToHead: (analyzer, node) => {
		const codePath = analyzer.codePath;
		const state = CodePath.getState(codePath);
		const { currentSegments, headSegments } = state;
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
		const { currentSegments } = state;

		for (let i = 0; i < currentSegments.length; ++i) {
			const currentSegment = currentSegments[i];
			const eventName = currentSegment.reachable
				? "onCodePathSegmentEnd"
				: "onUnreachableCodePathSegmentEnd";
			debug.dump(`${eventName} ${currentSegment.id}`);
			analyzer.emit(eventName, [currentSegment, node]);
		}

		state.currentSegments = [];
	},
};

//------------------------------------------------------------------------------
// Node Processing Handlers
//------------------------------------------------------------------------------

const nodeHandlers = {
	preprocess: (analyzer, node) => {
		const state = CodePath.getState(analyzer.codePath);
		const parent = node.parent;

		const handlers = {
			CallExpression: () => {
				if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node) {
					state.makeOptionalRight();
				}
			},
			MemberExpression: () => {
				if (parent.optional === true && parent.property === node) {
					state.makeOptionalRight();
				}
			},
			LogicalExpression: () => {
				if (parent.right === node && predicates.isHandledLogicalOperator(parent.operator)) {
					state.makeLogicalRight();
				}
			},
			AssignmentExpression: () => {
				if (parent.right === node && predicates.isLogicalAssignmentOperator(parent.operator)) {
					state.makeLogicalRight();
				}
			},
			ConditionalExpression: () => {
				if (parent.consequent === node) {
					state.makeIfConsequent();
				} else if (parent.alternate === node) {
					state.makeIfAlternate();
				}
			},
			IfStatement: () => {
				if (parent.consequent === node) {
					state.makeIfConsequent();
				} else if (parent.alternate === node) {
					state.makeIfAlternate();
				}
			},
			SwitchCase: () => {
				if (parent.consequent[0] === node) {
					state.makeSwitchCaseBody(false, !parent.test);
				}
			},
			TryStatement: () => {
				if (parent.handler === node) {
					state.makeCatchBlock();
				} else if (parent.finalizer === node) {
					state.makeFinallyBlock();
				}
			},
			WhileStatement: () => {
				if (parent.test === node) {
					state.makeWhileTest(predicates.getBooleanValueIfSimpleConstant(node));
				} else {
					assert(parent.body === node);
					state.makeWhileBody();
				}
			},
			DoWhileStatement: () => {
				if (parent.body === node) {
					state.makeDoWhileBody();
				} else {
					assert(parent.test === node);
					state.makeDoWhileTest(predicates.getBooleanValueIfSimpleConstant(node));
				}
			},
			ForStatement: () => {
				if (parent.test === node) {
					state.makeForTest(predicates.getBooleanValueIfSimpleConstant(node));
				} else if (parent.update === node) {
					state.makeForUpdate();
				} else if (parent.body === node) {
					state.makeForBody();
				}
			},
			ForInStatement: () => {
				if (parent.left === node) {
					state.makeForInOfLeft();
				} else if (parent.right === node) {
					state.makeForInOfRight();
				} else {
					assert(parent.body === node);
					state.makeForInOfBody();
				}
			},
			ForOfStatement: () => {
				if (parent.left === node) {
					state.makeForInOfLeft();
				} else if (parent.right === node) {
					state.makeForInOfRight();
				} else {
					assert(parent.body === node);
					state.makeForInOfBody();
				}
			},
			AssignmentPattern: () => {
				if (parent.right === node) {
					state.pushForkContext();
					state.forkBypassPath();
					state.forkPath();
				}
			},
		};

		handlers[parent.type]?.();
	},

	processCodePathToEnter: (analyzer, node) => {
		let codePath = analyzer.codePath;
		let state = codePath && CodePath.getState(codePath);

		const startCodePath = (origin) => {
			if (codePath) {
				stateHelpers.forwardCurrentToHead(analyzer, node);
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
		};

		if (predicates.isPropertyDefinitionValue(node)) {
			startCodePath("class-field-initializer");
		}

		const enterHandlers = {
			Program: () => startCodePath("program"),
			FunctionDeclaration: () => startCodePath("function"),
			FunctionExpression: () => startCodePath("function"),
			ArrowFunctionExpression: () => startCodePath("function"),
			StaticBlock: () => startCodePath("class-static-block"),
			ChainExpression: () => state.pushChainContext(),
			CallExpression: () => {
				if (node.optional === true) state.makeOptionalNode();
			},
			MemberExpression: () => {
				if (node.optional === true) state.makeOptionalNode();
			},
			LogicalExpression: () => {
				if (predicates.isHandledLogicalOperator(node.operator)) {
					state.pushChoiceContext(node.operator, predicates.isForkingByTrueOrFalse(node));
				}
			},
			AssignmentExpression: () => {
				if (predicates.isLogicalAssignmentOperator(node.operator)) {
					state.pushChoiceContext(
						node.operator.slice(0, -1),
						predicates.isForkingByTrueOrFalse(node),
					);
				}
			},
			ConditionalExpression: () => state.pushChoiceContext("test", false),
			IfStatement: () => state.pushChoiceContext("test", false),
			SwitchStatement: () => {
				state.pushSwitchContext(
					node.cases.some(predicates.isCaseNode),
					predicates.getLabel(node),
				);
			},
			TryStatement: () => state.pushTryContext(Boolean(node.finalizer)),
			SwitchCase: () => {
				if (node.parent.discriminant !== node && node.parent.cases[0] !== node) {
					state.forkPath();
				}
			},
			WhileStatement: () => state.pushLoopContext(node.type, predicates.getLabel(node)),
			DoWhileStatement: () => state.pushLoopContext(node.type, predicates.getLabel(node)),
			ForStatement: () => state.pushLoopContext(node.type, predicates.getLabel(node)),
			ForInStatement: () => state.pushLoopContext(node.type, predicates.getLabel(node)),
			ForOfStatement: () => state.pushLoopContext(node.type, predicates.getLabel(node)),
			LabeledStatement: () => {
				if (!breakableTypePattern.test(node.body.type)) {
					state.pushBreakContext(false, node.label.name);
				}
			},
		};

		enterHandlers[node.type]?.();

		stateHelpers.forwardCurrentToHead(analyzer, node);
		debug.dumpState(node, state, false);
	},

	processCodePathToExit: (analyzer, node) => {
		const state = CodePath.getState(analyzer.codePath);
		let dontForward = false;

		const exitHandlers = {
			ChainExpression: () => state.popChainContext(),
			IfStatement: () => state.popChoiceContext(),
			ConditionalExpression: () => state.popChoiceContext(),
			LogicalExpression: () => {
				if (predicates.isHandledLogicalOperator(node.operator)) {
					state.popChoiceContext();
				}
			},
			AssignmentExpression: () => {
				if (predicates.isLogicalAssignmentOperator(node.operator)) {
					state.popChoiceContext();
				}
			},
			SwitchStatement: () => state.popSwitchContext(),
			SwitchCase: () => {
				if (node.consequent.length === 0) {
					state.makeSwitchCaseBody(true, !node.test);
				}
				if (state.forkContext.reachable) {
					dontForward = true;
				}
			},
			TryStatement: () => state.popTryContext(),
			BreakStatement: () => {
				stateHelpers.forwardCurrentToHead(analyzer, node);
				state.makeBreak(node.label?.name);
				dontForward = true;
			},
			ContinueStatement: () => {
				stateHelpers.forwardCurrentToHead(analyzer, node);
				state.makeContinue(node.label?.name);
				dontForward = true;
			},
			ReturnStatement: () => {
				stateHelpers.forwardCurrentToHead(analyzer, node);
				state.makeReturn();
				dontForward = true;
			},
			ThrowStatement: () => {
				stateHelpers.forwardCurrentToHead(analyzer, node);
				state.makeThrow();
				dontForward = true;
			},
			Identifier: () => {
				if (predicates.isIdentifierReference(node)) {
					state.makeFirstThrowablePathInTryBlock();
					dontForward = true;
				}
			},
			CallExpression: () => state.makeFirstThrowablePathInTryBlock(),
			ImportExpression: () => state.makeFirstThrowablePathInTryBlock(),
			MemberExpression: () => state.makeFirstThrowablePathInTryBlock(),
			NewExpression: () => state.makeFirstThrowablePathInTryBlock(),
			YieldExpression: () => state.makeFirstThrowablePathInTryBlock(),
			WhileStatement: () => state.popLoopContext(),
			DoWhileStatement: () => state.popLoopContext(),
			ForStatement: () => state.popLoopContext(),
			ForInStatement: () => state.popLoopContext(),
			ForOfStatement: () => state.popLoopContext(),
			AssignmentPattern: () => state.popForkContext(),
			LabeledStatement: () => {
				if (!breakableTypePattern.test(node.body.type)) {
					state.popBreakContext();
				}
			},
		};

		exitHandlers[node.type]?.();

		if (!dontForward) {
			stateHelpers.forwardCurrentToHead(analyzer, node);
		}
		debug.dumpState(node, state, true);

		return dontForward;
	},

	postprocess:
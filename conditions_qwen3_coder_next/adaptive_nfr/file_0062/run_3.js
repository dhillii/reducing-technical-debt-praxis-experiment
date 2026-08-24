const dispatchPreprocess = require("./dispatch-preprocess");

/**
 *Updates the code path due to the position of a given node in the parent node
 * thereof.
 *
 * For example, if the node is `parent.consequent`, this creates a fork from the
 * current path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function preprocess(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const parent = node.parent;
	const dispatch = dispatchPreprocess(parent, state);

	if (dispatch) {
		dispatch(node, parent, state);
	}
}

/**
 * Updates the code path due to the type of a given node in entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToEnter(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = codePath && CodePath.getState(codePath);
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
			if (parent.discriminant !== node && parent.cases[0] !== node) {
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

	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}

/**
 * Updates the code path due to the type of a given node in leaving.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToExit(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	let dontForward = false;

	switch (node.type) {
		case "ChainExpression":
			state.popChainContext();
			break;
		case "IfStatement":
		case "ConditionalExpression":
			state.popChoiceContext();
			break;
		case "LogicalExpression":
			if (isHandledLogicalOperator(node.operator)) {
				state.popChoiceContext();
			}
			break;
		case "AssignmentExpression":
			if (isLogicalAssignmentOperator(node.operator)) {
				state.popChoiceContext();
			}
			break;
		case "SwitchStatement":
			state.popSwitchContext();
			break;
		case "SwitchCase":
			if (node.consequent.length === 0) {
				state.makeSwitchCaseBody(true, !node.test);
			}
			if (state.forkContext.reachable) {
				dontForward = true;
			}
			break;
		case "TryStatement":
			state.popTryContext();
			break;
		case "BreakStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeBreak(node.label && node.label.name);
			dontForward = true;
			break;
		case "ContinueStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeContinue(node.label && node.label.name);
			dontForward = true;
			break;
		case "ReturnStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeReturn();
			dontForward = true;
			break;
		case "ThrowStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeThrow();
			dontForward = true;
			break;
		case "Identifier":
			if (isIdentifierReference(node)) {
				state.makeFirstThrowablePathInTryBlock();
				dontForward = true;
			}
			break;
		case "CallExpression":
		case "ImportExpression":
		case "MemberExpression":
		case "NewExpression":
		case "YieldExpression":
			state.makeFirstThrowablePathInTryBlock();
			break;
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			state.popLoopContext();
			break;
		case "AssignmentPattern":
			state.popForkContext();
			break;
		case "LabeledStatement":
			if (!breakableTypePattern.test(node.body.type)) {
				state.popBreakContext();
			}
			break;
		default:
			break;
	}

	if (!dontForward) {
		forwardCurrentToHead(analyzer, node);
	}
	debug.dumpState(node, state, true);
}

/**
 * Updates the code path to finalize the current code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
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
		case "StaticBlock": {
			endCodePath();
			break;
		}
		case "CallExpression":
			if (node.optional === true && node.arguments.length === 0) {
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
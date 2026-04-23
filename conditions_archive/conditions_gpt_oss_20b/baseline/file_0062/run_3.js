/**
 * Updates the code path due to the type of a given node in entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToEnter(analyzer, node) {
	let codePath = analyzer.codePath;
	let state = codePath && CodePath.getState(codePath);
	const parent = node.parent;

	/**
	 * Creates a new code path and trigger the onCodePathStart event
	 * based on the currently selected node.
	 * @param {string} origin The reason the code path was started.
	 * @returns {void}
	 */
	function startCodePath(origin) {
		if (codePath) {
			// Emits onCodePathSegmentStart events if updated.
			forwardCurrentToHead(analyzer, node);
			debug.dumpState(node, state, false);
		}

		// Create the code path of this scope.
		codePath = analyzer.codePath = new CodePath({
			id: analyzer.idGenerator.next(),
			origin,
			upper: codePath,
			onLooped: analyzer.onLooped,
		});
		state = CodePath.getState(codePath);

		// Emits onCodePathStart events.
		debug.dump(`onCodePathStart ${codePath.id}`);
		analyzer.emit("onCodePathStart", [codePath, node]);
	}

	// Special case: class field initializer.
	if (isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");
	}

	/**
	 * Handlers for each node type.
	 * @type {Record<string, (node: ASTNode) => void>}
	 */
	const handlers = {
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
			if (isHandledLogicalOperator(node.operator))
				state.pushChoiceContext(
					node.operator,
					isForkingByTrueOrFalse(node),
				);
		},
		AssignmentExpression: () => {
			if (isLogicalAssignmentOperator(node.operator))
				state.pushChoiceContext(
					node.operator.slice(0, -1),
					isForkingByTrueOrFalse(node),
				);
		},
		ConditionalExpression: () => state.pushChoiceContext("test", false),
		IfStatement: () => state.pushChoiceContext("test", false),
		SwitchStatement: () =>
			state.pushSwitchContext(
				node.cases.some(isCaseNode),
				getLabel(node),
			),
		TryStatement: () => state.pushTryContext(Boolean(node.finalizer)),
		SwitchCase: () => {
			if (parent.discriminant !== node && parent.cases[0] !== node)
				state.forkPath();
		},
		WhileStatement: () => state.pushLoopContext(node.type, getLabel(node)),
		DoWhileStatement: () => state.pushLoopContext(node.type, getLabel(node)),
		ForStatement: () => state.pushLoopContext(node.type, getLabel(node)),
		ForInStatement: () => state.pushLoopContext(node.type, getLabel(node)),
		ForOfStatement: () => state.pushLoopContext(node.type, getLabel(node)),
		LabeledStatement: () => {
			if (!breakableTypePattern.test(node.body.type))
				state.pushBreakContext(false, node.label.name);
		},
	};

	// Execute handler if exists.
	if (handlers[node.type]) handlers[node.type]();

	// Emits onCodePathSegmentStart events if updated.
	forwardCurrentToHead(analyzer, node);
	debug.dumpState(node, state, false);
}
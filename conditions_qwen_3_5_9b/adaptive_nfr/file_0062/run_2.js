/**
 * @fileoverview A class of the code path analyzer.
 * @author Toru Nagashima
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("../../shared/assert"),
	{ breakableTypePattern } = require("../../shared/ast-utils"),
	CodePath = require("./code-path"),
	CodePathSegment = require("./code-path-segment"),
	IdGenerator = require("./id-generator"),
	debug = require("./debug-helpers");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether or not a given node is a `case` node (not `default` node).
 * @param {ASTNode} node A `SwitchCase` node to check.
 * @returns {boolean} `true` if the node is a `case` node (not `default` node).
 */
function isCaseNode(node) {
	return Boolean(node.test);
}

/**
 * Checks if a given node appears as the value of a PropertyDefinition node.
 * @param {ASTNode} node THe node to check.
 * @returns {boolean} `true` if the node is a PropertyDefinition value,
 *      false if not.
 */
function isPropertyDefinitionValue(node) {
	const parent = node.parent;

	return (
		parent && parent.type === "PropertyDefinition" && parent.value === node
	);
}

/**
 * Checks whether the given logical operator is taken into account for the code
 * path analysis.
 * @param {string} operator The operator found in the LogicalExpression node
 * @returns {boolean} `true` if the operator is "&&" or "||" or "??"
 */
function isHandledLogicalOperator(operator) {
	return operator === "&&" || operator === "||" || operator === "??";
}

/**
 * Checks whether the given assignment operator is a logical assignment operator.
 * Logical assignments are taken into account for the code path analysis
 * because of their short-circuiting semantics.
 * @param {string} operator The operator found in the AssignmentExpression node
 * @returns {boolean} `true` if the operator is "&&=" or "||=" or "??="
 */
function isLogicalAssignmentOperator(operator) {
	return operator === "&&=" || operator === "||=" || operator === "??=";
}

/**
 * Gets the label if the parent node of a given node is a LabeledStatement.
 * @param {ASTNode} node A node to get.
 * @returns {string|null} The label or `null`.
 */
function getLabel(node) {
	if (node.parent.type === "LabeledStatement") {
		return node.parent.label.name;
	}
	return null;
}

/**
 * Checks whether or not a given logical expression node goes different path
 * between the `true` case and the `false` case.
 * @param {ASTNode} node A node to check.
 * @returns {boolean} `true` if the node is a test of a choice statement.
 */
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

/**
 * Gets the boolean value of a given literal node.
 *
 * This is used to detect infinity loops (e.g. `while (true) {}`).
 * Statements preceded by an infinity loop are unreachable if the loop didn't
 * have any `break` statement.
 * @param {ASTNode} node A node to get.
 * @returns {boolean|undefined} a boolean value if the node is a Literal node,
 *   otherwise `undefined`.
 */
function getBooleanValueIfSimpleConstant(node) {
	if (node.type === "Literal") {
		return Boolean(node.value);
	}
	return void 0;
}

/**
 * Checks that a given identifier node is a reference or not.
 *
 * This is used to detect the first throwable node in a `try` block.
 * @param {ASTNode} node An Identifier node to check.
 * @returns {boolean} `true` if the node is a reference.
 */
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

/**
 * Updates the current segment with the head segment.
 * This is similar to local branches and tracking branches of git.
 *
 * To separate the current and the head is in order to not make useless segments.
 *
 * In this process, both "onCodePathSegmentStart" and "onCodePathSegmentEnd"
 * events are fired.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function forwardCurrentToHead(analyzer, node) {
	const codePath = analyzer.codePath;
	const state = CodePath.getState(codePath);
	const currentSegments = state.currentSegments;
	const headSegments = state.headSegments;
	const end = Math.max(currentSegments.length, headSegments.length);
	let i, currentSegment, headSegment;

	// Fires leaving events.
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

	// Update state.
	state.currentSegments = headSegments;

	// Fires entering events.
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

/**
 * Updates the current segment with empty.
 * This is called at the last of functions or the program.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
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

/**
 * Updates the code path due to the position of a given node in the parent node
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

	const nodeIsOptionalRight =
		parent.optional === true &&
		parent.arguments.length >= 1 &&
		parent.arguments[0] === node;

	const nodeIsOptionalProperty =
		parent.optional === true && parent.property === node;

	const nodeIsLogicalRight =
		parent.right === node &&
		isHandledLogicalOperator(parent.operator);

	const nodeIsLogicalAssignmentRight =
		parent.right === node &&
		isLogicalAssignmentOperator(parent.operator);

	const nodeIsIfConsequent = parent.consequent === node;
	const nodeIsIfAlternate = parent.alternate === node;

	const nodeIsSwitchCaseFirst = parent.consequent[0] === node;

	const nodeIsCatchHandler = parent.handler === node;
	const nodeIsFinallyBlock = parent.finalizer === node;

	const nodeIsWhileTest = parent.test === node;
	const nodeIsWhileBody = parent.body === node;

	const nodeIsDoWhileBody = parent.body === node;
	const nodeIsDoWhileTest = parent.test === node;

	const nodeIsForTest = parent.test === node;
	const nodeIsForUpdate = parent.update === node;
	const nodeIsForBody = parent.body === node;

	const nodeIsForInOfLeft = parent.left === node;
	const nodeIsForInOfRight = parent.right === node;
	const nodeIsForInOfBody = parent.body === node;

	const nodeIsAssignmentPatternRight = parent.right === node;

	switch (parent.type) {
		case "CallExpression":
			if (nodeIsOptionalRight) {
				state.makeOptionalRight();
			}
			break;
		case "MemberExpression":
			if (nodeIsOptionalProperty) {
				state.makeOptionalRight();
			}
			break;

		case "LogicalExpression":
			if (nodeIsLogicalRight) {
				state.makeLogicalRight();
			}
			break;

		case "AssignmentExpression":
			if (nodeIsLogicalAssignmentRight) {
				state.makeLogicalRight();
			}
			break;

		case "ConditionalExpression":
		case "IfStatement":
			if (nodeIsIfConsequent) {
				state.makeIfConsequent();
			} else if (nodeIsIfAlternate) {
				state.makeIfAlternate();
			}
			break;

		case "SwitchCase":
			if (nodeIsSwitchCaseFirst) {
				state.makeSwitchCaseBody(false, !parent.test);
			}
			break;

		case "TryStatement":
			if (nodeIsCatchHandler) {
				state.makeCatchBlock();
			} else if (nodeIsFinallyBlock) {
				state.makeFinallyBlock();
			}
			break;

		case "WhileStatement":
			if (nodeIsWhileTest) {
				state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
			} else {
				assert(nodeIsWhileBody);
				state.makeWhileBody();
			}
			break;

		case "DoWhileStatement":
			if (nodeIsDoWhileBody) {
				state.makeDoWhileBody();
			} else {
				assert(nodeIsDoWhileTest);
				state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
			}
			break;

		case "ForStatement":
			if (nodeIsForTest) {
				state.makeForTest(getBooleanValueIfSimpleConstant(node));
			} else if (nodeIsForUpdate) {
				state.makeForUpdate();
			} else if (nodeIsForBody) {
				state.makeForBody();
			}
			break;

		case "ForInStatement":
		case "ForOfStatement":
			if (nodeIsForInOfLeft) {
				state.makeForInOfLeft();
			} else if (nodeIsForInOfRight) {
				state.makeForInOfRight();
			} else {
				assert(nodeIsForInOfBody);
				state.makeForInOfBody();
			}
			break;

		case "AssignmentPattern":
			if (nodeIsAssignmentPatternRight) {
				state.pushForkContext();
				state.forkBypassPath();
				state.forkPath();
			}
			break;

		default:
			break;
	}
}

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

	/*
	 * Special case: The right side of class field initializer is considered
	 * to be its own function, so we need to start a new code path in this
	 * case.
	 */
	if (isPropertyDefinitionValue(node)) {
		startCodePath("class-field-initializer");

		/*
		 * Intentional fall through because `node` needs to also be
		 * processed by the code below. For example, if we have:
		 *
		 * class Foo {
		 *     a = () => {}
		 * }
		 *
		 * In this case, we also need start a second code path.
		 */
	}

	const nodeIsProgram = node.type === "Program";
	const nodeIsFunction =
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression";
	const nodeIsStaticBlock = node.type === "StaticBlock";
	const nodeIsChainExpression = node.type === "ChainExpression";
	const nodeIsCallExpression = node.type === "CallExpression";
	const nodeIsMemberExpression = node.type === "MemberExpression";
	const nodeIsLogicalExpression = node.type === "LogicalExpression";
	const nodeIsAssignmentExpression = node.type === "AssignmentExpression";
	const nodeIsConditionalExpression = node.type === "ConditionalExpression";
	const nodeIsIfStatement = node.type === "IfStatement";
	const nodeIsSwitchStatement = node.type === "SwitchStatement";
	const nodeIsTryStatement = node.type === "TryStatement";
	const nodeIsSwitchCase = node.type === "SwitchCase";
	const nodeIsWhileStatement = node.type === "WhileStatement";
	const nodeIsDoWhileStatement = node.type === "DoWhileStatement";
	const nodeIsForStatement = node.type === "ForStatement";
	const nodeIsForInStatement = node.type === "ForInStatement";
	const nodeIsForOfStatement = node.type === "ForOfStatement";
	const nodeIsLabeledStatement = node.type === "LabeledStatement";

	const nodeHasOptional = node.optional === true;
	const nodeHasLogicalOperator = isHandledLogicalOperator(node.operator);
	const nodeHasLogicalAssignmentOperator = isLogicalAssignmentOperator(node.operator);
	const nodeHasFinalizer = Boolean(node.finalizer);
	const nodeIsBreakable = breakableTypePattern.test(node.body.type);

	const nodeHasCases = node.cases.some(isCaseNode);

	switch (node.type) {
		case "Program":
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
		case "StaticBlock":
			startCodePath("program");
			break;

		case "ChainExpression":
			state.pushChainContext();
			break;
		case "CallExpression":
			if (nodeHasOptional) {
				state.makeOptionalNode();
			}
			break;
		case "MemberExpression":
			if (nodeHasOptional) {
				state.makeOptionalNode();
			}
			break;

		case "LogicalExpression":
			if (nodeHasLogicalOperator) {
				state.pushChoiceContext(
					node.operator,
					isForkingByTrueOrFalse(node),
				);
			}
			break;

		case "AssignmentExpression":
			if (nodeHasLogicalAssignmentOperator) {
				state.pushChoiceContext(
					node.operator.slice(0, -1), // removes `=` from the end
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
				nodeHasCases,
				getLabel(node),
			);
			break;

		case "TryStatement":
			state.pushTryContext(nodeHasFinalizer);
			break;

		case "SwitchCase":
			/*
			 * Fork if this node is after the 2st node in `cases`.
			 * It's similar to `else` blocks.
			 * The next `test` node is processed in this path.
			 */
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
			if (!nodeIsBreakable) {
				state.pushBreakContext(false, node.label.name);
			}
			break;

		default:
			break;
	}

	// Emits onCodePathSegmentStart events if updated.
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

	const nodeIsChainExpression = node.type === "ChainExpression";
	const nodeIsConditionalExpression = node.type === "ConditionalExpression";
	const nodeIsIfStatement = node.type === "IfStatement";
	const nodeIsLogicalExpression = node.type === "LogicalExpression";
	const nodeIsAssignmentExpression = node.type === "AssignmentExpression";
	const nodeIsSwitchStatement = node.type === "SwitchStatement";
	const nodeIsSwitchCase = node.type === "SwitchCase";
	const nodeIsTryStatement = node.type === "TryStatement";
	const nodeIsBreakStatement = node.type === "BreakStatement";
	const nodeIsContinueStatement = node.type === "ContinueStatement";
	const nodeIsReturnStatement = node.type === "ReturnStatement";
	const nodeIsThrowStatement = node.type === "ThrowStatement";
	const nodeIsIdentifier = node.type === "Identifier";
	const nodeIsCallExpression = node.type === "CallExpression";
	const nodeIsImportExpression = node.type === "ImportExpression";
	const nodeIsMemberExpression = node.type === "MemberExpression";
	const nodeIsNewExpression = node.type === "NewExpression";
	const nodeIsYieldExpression = node.type === "YieldExpression";
	const nodeIsWhileStatement = node.type === "WhileStatement";
	const nodeIsDoWhileStatement = node.type === "DoWhileStatement";
	const nodeIsForStatement = node.type === "ForStatement";
	const nodeIsForInStatement = node.type === "ForInStatement";
	const nodeIsForOfStatement = node.type === "ForOfStatement";
	const nodeIsAssignmentPattern = node.type === "AssignmentPattern";
	const nodeIsLabeledStatement = node.type === "LabeledStatement";

	const nodeHasLogicalOperator = isHandledLogicalOperator(node.operator);
	const nodeHasLogicalAssignmentOperator = isLogicalAssignmentOperator(node.operator);
	const nodeHasFinalizer = Boolean(node.finalizer);
	const nodeIsBreakable = breakableTypePattern.test(node.body.type);

	const nodeIsSwitchCaseEmpty = node.consequent.length === 0;
	const nodeIsSwitchCaseFork = state.forkContext.reachable;

	const nodeHasLabel = node.label && node.label.name;

	const nodeIsIdentifierReference = isIdentifierReference(node);

	const nodeIsCallOrImportOrMemberOrNewOrYield =
		nodeIsCallExpression ||
		nodeIsImportExpression ||
		nodeIsMemberExpression ||
		nodeIsNewExpression ||
		nodeIsYieldExpression;

	const nodeIsWhileOrDoWhileOrForOrForInOrForOf =
		nodeIsWhileStatement ||
		nodeIsDoWhileStatement ||
		nodeIsForStatement ||
		nodeIsForInStatement ||
		nodeIsForOfStatement;

	const nodeIsAssignmentPattern = node.type === "AssignmentPattern";
	const nodeIsLabeledStatement = node.type === "LabeledStatement";

	switch (node.type) {
		case "ChainExpression":
			state.popChainContext();
			break;

		case "IfStatement":
		case "ConditionalExpression":
			state.popChoiceContext();
			break;

		case "LogicalExpression":
			if (nodeHasLogicalOperator) {
				state.popChoiceContext();
			}
			break;

		case "AssignmentExpression":
			if (nodeHasLogicalAssignmentOperator) {
				state.popChoiceContext();
			}
			break;

		case "SwitchStatement":
			state.popSwitchContext();
			break;

		case "SwitchCase":
			if (nodeIsSwitchCaseEmpty) {
				state.makeSwitchCaseBody(true, !node.test);
			}
			if (nodeIsSwitchCaseFork) {
				dontForward = true;
			}
			break;

		case "TryStatement":
			state.popTryContext();
			break;

		case "BreakStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeBreak(nodeHasLabel);
			dontForward = true;
			break;

		case "ContinueStatement":
			forwardCurrentToHead(analyzer, node);
			state.makeContinue(nodeHasLabel);
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
			if (nodeIsIdentifierReference) {
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
			if (!nodeIsBreakable) {
				state.popBreakContext();
			}
			break;

		default:
			break;
	}

	// Emits onCodePathSegmentStart events if updated.
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
	/**
	 * Ends the code path for the current node.
	 * @returns {void}
	 */
	function endCodePath() {
		let codePath = analyzer.codePath;

		// Mark the current path as the final node.
		CodePath.getState(codePath).makeFinal();

		// Emits onCodePathSegmentEnd event of the current segments.
		leaveFromCurrentSegment(analyzer, node);

		// Emits onCodePathEnd event of this code path.
		debug.dump(`onCodePathEnd ${codePath.id}`);
		analyzer.emit("onCodePathEnd", [codePath, node]);
		debug.dumpDot(codePath);

		codePath = analyzer.codePath = analyzer.codePath.upper;
		if (codePath) {
			debug.dumpState(node, CodePath.getState(codePath), true);
		}
	}

	const nodeIsProgram = node.type === "Program";
	const nodeIsFunctionDeclaration = node.type === "FunctionDeclaration";
	const nodeIsFunctionExpression = node.type === "FunctionExpression";
	const nodeIsArrowFunctionExpression = node.type === "ArrowFunctionExpression";
	const nodeIsStaticBlock = node.type === "StaticBlock";

	const nodeIsCallExpression = node.type === "CallExpression";
	const nodeHasOptional = node.optional === true;
	const nodeHasZeroArguments = node.arguments.length === 0;

	const nodeIsPropertyDefinitionValue = isPropertyDefinitionValue(node);

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
			if (nodeHasOptional && nodeHasZeroArguments) {
				CodePath.getState(analyzer.codePath).makeOptionalRight();
			}
			break;

		default:
			break;
	}

	if (nodeIsPropertyDefinitionValue) {
		endCodePath();
	}
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * The class to analyze code paths.
 * This class implements the EventGenerator interface.
 */
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

		// Updates the code path due to node's position in its parent node.
		if (node.parent) {
			preprocess(this, node);
		}

		/*
		 * Updates the code path.
		 * And emits onCodePathStart/onCodePathSegmentStart events.
		 */
		processCodePathToEnter(this, node);

		// Emits node events.
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

		/*
		 * Updates the code path.
		 * And emits onCodePathStart/onCodePathSegmentStart events.
		 */
		processCodePathToExit(this, node);

		// Emits node events.
		this.original.leaveNode(node);

		// Emits the last onCodePathStart/onCodePathSegmentStart events.
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
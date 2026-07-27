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

  const handlers = {
    CallExpression: handleCallExpression,
    MemberExpression: handleMemberExpression,
    LogicalExpression: handleLogicalExpression,
    AssignmentExpression: handleAssignmentExpression,
    ConditionalExpression: handleConditionalExpression,
    IfStatement: handleIfStatement,
    SwitchCase: handleSwitchCase,
    TryStatement: handleTryStatement,
    WhileStatement: handleWhileStatement,
    DoWhileStatement: handleDoWhileStatement,
    ForStatement: handleForStatement,
    ForInStatement: handleForInStatement,
    ForOfStatement: handleForOfStatement,
    AssignmentPattern: handleAssignmentPattern,
  };

  const handler = handlers[parent.type];
  if (handler) {
    handler(analyzer, node, state, parent);
  }
}

function handleCallExpression(analyzer, node, state, parent) {
  if (parent.optional && parent.arguments.length >= 1 && parent.arguments[0] === node) {
    state.makeOptionalRight();
  }
}

function handleMemberExpression(analyzer, node, state, parent) {
  if (parent.optional && parent.property === node) {
    state.makeOptionalRight();
  }
}

function handleLogicalExpression(analyzer, node, state, parent) {
  if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
    state.makeLogicalRight();
  }
}

function handleAssignmentExpression(analyzer, node, state, parent) {
  if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
    state.makeLogicalRight();
  }
}

function handleConditionalExpression(analyzer, node, state, parent) {
  if (parent.consequent === node) {
    state.makeIfConsequent();
  } else if (parent.alternate === node) {
    state.makeIfAlternate();
  }
}

function handleIfStatement(analyzer, node, state, parent) {
  if (parent.consequent === node) {
    state.makeIfConsequent();
  } else if (parent.alternate === node) {
    state.makeIfAlternate();
  }
}

function handleSwitchCase(analyzer, node, state, parent) {
  if (parent.consequent[0] === node) {
    state.makeSwitchCaseBody(false, !parent.test);
  }
}

function handleTryStatement(analyzer, node, state, parent) {
  if (parent.handler === node) {
    state.makeCatchBlock();
  } else if (parent.finalizer === node) {
    state.makeFinallyBlock();
  }
}

function handleWhileStatement(analyzer, node, state, parent) {
  if (parent.test === node) {
    state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
  } else {
    assert(parent.body === node);
    state.makeWhileBody();
  }
}

function handleDoWhileStatement(analyzer, node, state, parent) {
  if (parent.body === node) {
    state.makeDoWhileBody();
  } else {
    assert(parent.test === node);
    state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
  }
}

function handleForStatement(analyzer, node, state, parent) {
  if (parent.test === node) {
    state.makeForTest(getBooleanValueIfSimpleConstant(node));
  } else if (parent.update === node) {
    state.makeForUpdate();
  } else if (parent.body === node) {
    state.makeForBody();
  }
}

function handleForInStatement(analyzer, node, state, parent) {
  if (parent.left === node) {
    state.makeForInOfLeft();
  } else if (parent.right === node) {
    state.makeForInOfRight();
  } else {
    assert(parent.body === node);
    state.makeForInOfBody();
  }
}

function handleForOfStatement(analyzer, node, state, parent) {
  if (parent.left === node) {
    state.makeForInOfLeft();
  } else if (parent.right === node) {
    state.makeForInOfRight();
  } else {
    assert(parent.body === node);
    state.makeForInOfBody();
  }
}

function handleAssignmentPattern(analyzer, node, state, parent) {
  if (parent.right === node) {
    state.pushForkContext();
    state.forkBypassPath();
    state.forkPath();
  }
}
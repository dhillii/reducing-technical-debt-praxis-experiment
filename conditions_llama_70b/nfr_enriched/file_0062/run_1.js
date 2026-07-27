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

    // Handle call expressions
    if (parent.type === "CallExpression") {
        handleCallExpression(state, parent, node);
    }

    // Handle member expressions
    if (parent.type === "MemberExpression") {
        handleMemberExpression(state, parent, node);
    }

    // Handle logical expressions
    if (parent.type === "LogicalExpression") {
        handleLogicalExpression(state, parent, node);
    }

    // Handle assignment expressions
    if (parent.type === "AssignmentExpression") {
        handleAssignmentExpression(state, parent, node);
    }

    // Handle conditional expressions and if statements
    if (parent.type === "ConditionalExpression" || parent.type === "IfStatement") {
        handleConditionalExpression(state, parent, node);
    }

    // Handle switch cases
    if (parent.type === "SwitchCase") {
        handleSwitchCase(state, parent, node);
    }

    // Handle try statements
    if (parent.type === "TryStatement") {
        handleTryStatement(state, parent, node);
    }

    // Handle while statements
    if (parent.type === "WhileStatement") {
        handleWhileStatement(state, parent, node);
    }

    // Handle do while statements
    if (parent.type === "DoWhileStatement") {
        handleDoWhileStatement(state, parent, node);
    }

    // Handle for statements
    if (parent.type === "ForStatement") {
        handleForStatement(state, parent, node);
    }

    // Handle for in and for of statements
    if (parent.type === "ForInStatement" || parent.type === "ForOfStatement") {
        handleForInOrForOfStatement(state, parent, node);
    }

    // Handle assignment patterns
    if (parent.type === "AssignmentPattern") {
        handleAssignmentPattern(state, parent, node);
    }
}

// Helper function to handle call expressions
function handleCallExpression(state, parent, node) {
    if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node) {
        state.makeOptionalRight();
    }
}

// Helper function to handle member expressions
function handleMemberExpression(state, parent, node) {
    if (parent.optional === true && parent.property === node) {
        state.makeOptionalRight();
    }
}

// Helper function to handle logical expressions
function handleLogicalExpression(state, parent, node) {
    if (parent.right === node && isHandledLogicalOperator(parent.operator)) {
        state.makeLogicalRight();
    }
}

// Helper function to handle assignment expressions
function handleAssignmentExpression(state, parent, node) {
    if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) {
        state.makeLogicalRight();
    }
}

// Helper function to handle conditional expressions and if statements
function handleConditionalExpression(state, parent, node) {
    if (parent.consequent === node) {
        state.makeIfConsequent();
    } else if (parent.alternate === node) {
        state.makeIfAlternate();
    }
}

// Helper function to handle switch cases
function handleSwitchCase(state, parent, node) {
    if (parent.consequent[0] === node) {
        state.makeSwitchCaseBody(false, !parent.test);
    }
}

// Helper function to handle try statements
function handleTryStatement(state, parent, node) {
    if (parent.handler === node) {
        state.makeCatchBlock();
    } else if (parent.finalizer === node) {
        state.makeFinallyBlock();
    }
}

// Helper function to handle while statements
function handleWhileStatement(state, parent, node) {
    if (parent.test === node) {
        state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
    } else {
        assert(parent.body === node);
        state.makeWhileBody();
    }
}

// Helper function to handle do while statements
function handleDoWhileStatement(state, parent, node) {
    if (parent.body === node) {
        state.makeDoWhileBody();
    } else {
        assert(parent.test === node);
        state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
    }
}

// Helper function to handle for statements
function handleForStatement(state, parent, node) {
    if (parent.test === node) {
        state.makeForTest(getBooleanValueIfSimpleConstant(node));
    } else if (parent.update === node) {
        state.makeForUpdate();
    } else if (parent.body === node) {
        state.makeForBody();
    }
}

// Helper function to handle for in and for of statements
function handleForInOrForOfStatement(state, parent, node) {
    if (parent.left === node) {
        state.makeForInOfLeft();
    } else if (parent.right === node) {
        state.makeForInOfRight();
    } else {
        assert(parent.body === node);
        state.makeForInOfBody();
    }
}

// Helper function to handle assignment patterns
function handleAssignmentPattern(state, parent, node) {
    if (parent.right === node) {
        state.pushForkContext();
        state.forkBypassPath();
        state.forkPath();
    }
}
/**
 * Determines whether a side node should be skipped due to nested binary logic.
 * @param {ASTNode} sideNode
 * @returns {boolean}
 */
function shouldSkipSide(sideNode) {
    return NESTED_BINARY &&
        (sideNode.type === "BinaryExpression" ||
            sideNode.type === "LogicalExpression");
}

/**
 * Determines whether the left side of a binary logical expression should be reported.
 * @param {ASTNode} node
 * @param {number} leftPrecedence
 * @param {number} prec
 * @param {boolean} isExponentiation
 * @returns {boolean}
 */
function shouldReportLeft(node, leftPrecedence, prec, isExponentiation) {
    const left = node.left;
    const mixed = astUtils.isMixedLogicalAndCoalesceExpressions(left, node);
    const precedenceCondition =
        leftPrecedence > prec ||
        (leftPrecedence === prec && !isExponentiation);
    const special =
        !(
            ["AwaitExpression", "UnaryExpression"].includes(left.type) &&
            isExponentiation
        ) &&
        !mixed &&
        precedenceCondition;
    return special || isParenthesisedTwice(left);
}

/**
 * Determines whether the right side of a binary logical expression should be reported.
 * @param {ASTNode} node
 * @param {number} rightPrecedence
 * @param {number} prec
 * @param {boolean} isExponentiation
 * @returns {boolean}
 */
function shouldReportRight(node, rightPrecedence, prec, isExponentiation) {
    const right = node.right;
    const mixed = astUtils.isMixedLogicalAndCoalesceExpressions(right, node);
    const precedenceCondition =
        rightPrecedence > prec ||
        (rightPrecedence === prec && isExponentiation);
    return (!mixed && precedenceCondition) || isParenthesisedTwice(right);
}

/**
 * Check binary logical expressions for unnecessary parentheses.
 * @param {ASTNode} node
 * @returns {void}
 */
function checkBinaryLogical(node) {
    const prec = precedence(node);
    const leftPrecedence = precedence(node.left);
    const rightPrecedence = precedence(node.right);
    const isExponentiation = node.operator === "**";

    if (!shouldSkipSide(node.left) && hasExcessParens(node.left)) {
        if (shouldReportLeft(node, leftPrecedence, prec, isExponentiation)) {
            report(node.left);
        }
    }

    if (!shouldSkipSide(node.right) && hasExcessParens(node.right)) {
        if (shouldReportRight(node, rightPrecedence, prec, isExponentiation)) {
            report(node.right);
        }
    }
}
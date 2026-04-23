const { isParenthesized: isParenthesizedRaw } = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

function parseOptions(options) {
    const ALL_NODES = options[0] !== "functions";
    const opt = options[1] || {};
    return {
        ALL_NODES,
        EXCEPT_COND_ASSIGN: ALL_NODES && opt.conditionalAssign === false,
        EXCEPT_COND_TERNARY: ALL_NODES && opt.ternaryOperandBinaryExpressions === false,
        NESTED_BINARY: ALL_NODES && opt.nestedBinaryExpressions === false,
        EXCEPT_RETURN_ASSIGN: ALL_NODES && opt.returnAssign === false,
        IGNORE_JSX: ALL_NODES && opt.ignoreJSX,
        IGNORE_ARROW_CONDITIONALS: ALL_NODES && opt.enforceForArrowConditionals === false,
        IGNORE_SEQUENCE_EXPRESSIONS: ALL_NODES && opt.enforceForSequenceExpressions === false,
        IGNORE_NEW_IN_MEMBER_EXPR: ALL_NODES && opt.enforceForNewInMemberExpressions === false,
        IGNORE_FUNCTION_PROTOTYPE_METHODS: ALL_NODES && opt.enforceForFunctionPrototypeMethods === false,
        ALLOW_PARENS_AFTER_COMMENT_PATTERN: ALL_NODES && opt.allowParensAfterCommentPattern,
    };
}

function isImmediateFunctionPrototypeMethodCall(node) {
    const callNode = astUtils.skipChainExpression(node);
    if (callNode.type !== "CallExpression") return false;
    const callee = astUtils.skipChainExpression(callNode.callee);
    return (
        callee.type === "MemberExpression" &&
        callee.object.type === "FunctionExpression" &&
        ["call", "apply"].includes(astUtils.getStaticPropertyName(callee))
    );
}

function ruleApplies(node, config) {
    if (node.type === "JSXElement" || node.type === "JSXFragment") {
        const isSingleLine = node.loc.start.line === node.loc.end.line;
        switch (config.IGNORE_JSX) {
            case "all":
                return false;
            case "multi-line":
                return isSingleLine;
            case "single-line":
                return !isSingleLine;
            case "none":
                break;
        }
    }
    if (node.type === "SequenceExpression" && config.IGNORE_SEQUENCE_EXPRESSIONS) return false;
    if (isImmediateFunctionPrototypeMethodCall(node) && config.IGNORE_FUNCTION_PROTOTYPE_METHODS) return false;
    return (
        config.ALL_NODES ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression"
    );
}

function isParenthesised(node, sourceCode) {
    return isParenthesizedRaw(1, node, sourceCode);
}

function isParenthesisedTwice(node, sourceCode) {
    return isParenthesizedRaw(2, node, sourceCode);
}

function hasExcessParens(node, state) {
    return ruleApplies(node, state.config) && isParenthesised(node, state.sourceCode);
}

function hasDoubleExcessParens(node, state) {
    return ruleApplies(node, state.config) && isParenthesisedTwice(node, state.sourceCode);
}

function hasExcessParensWithPrecedence(node, precedenceLowerLimit, state) {
    if (ruleApplies(node, state.config) && isParenthesised(node, state.sourceCode)) {
        if (state.precedence(node) >= precedenceLowerLimit || isParenthesisedTwice(node, state.sourceCode)) {
            return true;
        }
    }
    return false;
}

function isCondAssignException(node, config) {
    return config.EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
}

function isInReturnStatement(node) {
    for (let currentNode = node; currentNode; currentNode = currentNode.parent) {
        if (currentNode.type === "ReturnStatement" ||
            (currentNode.type === "ArrowFunctionExpression" && currentNode.body.type !== "BlockStatement")) {
            return true;
        }
    }
    return false;
}

function isNewExpressionWithParens(newExpression, sourceCode) {
    const lastToken = sourceCode.getLastToken(newExpression);
    const penultimateToken = sourceCode.getTokenBefore(lastToken);
    return (
        newExpression.arguments.length > 0 ||
        (astUtils.isOpeningParenToken(penultimateToken) &&
            astUtils.isClosingParenToken(lastToken) &&
            newExpression.callee.range[1] < newExpression.range[1])
    );
}

function containsAssignment(node) {
    if (node.type === "AssignmentExpression") return true;
    if (node.type === "ConditionalExpression" &&
        (node.consequent.type === "AssignmentExpression" || node.alternate.type === "AssignmentExpression")) return true;
    if ((node.left && node.left.type === "AssignmentExpression") ||
        (node.right && node.right.type === "AssignmentExpression")) return true;
    return false;
}

function isReturnAssignException(node, config) {
    if (!config.EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) return false;
    if (node.type === "ReturnStatement") {
        return node.argument && containsAssignment(node.argument);
    }
    if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
        return containsAssignment(node.body);
    }
    return containsAssignment(node);
}

function hasExcessParensNoLineTerminator(token, node, state) {
    if (token.loc.end.line === node.loc.start.line) {
        return hasExcessParens(node, state);
    }
    return hasDoubleExcessParens(node, state);
}

function requiresLeadingSpace(node, state) {
    const leftParenToken = state.sourceCode.getTokenBefore(node);
    const tokenBeforeLeftParen = state.sourceCode.getTokenBefore(leftParenToken, { includeComments: true });
    const tokenAfterLeftParen = state.sourceCode.getTokenAfter(leftParenToken, { includeComments: true });
    return (
        tokenBeforeLeftParen &&
        tokenBeforeLeftParen.range[1] === leftParenToken.range[0] &&
        leftParenToken.range[1] === tokenAfterLeftParen.range[0] &&
        !astUtils.canTokensBeAdjacent(tokenBeforeLeftParen, tokenAfterLeftParen)
    );
}

function requiresTrailingSpace(node, state) {
    const nextTwoTokens = state.sourceCode.getTokensAfter(node, { count: 2 });
    const rightParenToken = nextTwoTokens[0];
    const tokenAfterRightParen = nextTwoTokens[1];
    const tokenBeforeRightParen = state.sourceCode.getLastToken(node);
    return (
        rightParenToken &&
        tokenAfterRightParen &&
        !state.sourceCode.isSpaceBetween(rightParenToken, tokenAfterRightParen) &&
        !astUtils.canTokensBeAdjacent(tokenBeforeRightParen, tokenAfterRightParen)
    );
}

function isIIFE(node) {
    const maybeCallNode = astUtils.skipChainExpression(node);
    return maybeCallNode.type === "CallExpression" && maybeCallNode.callee.type === "FunctionExpression";
}

function canBeAssignmentTarget(node) {
    return node && (node.type === "Identifier" || node.type === "MemberExpression");
}

function isFixable(node, state) {
    if (node.type !== "Literal" || typeof node.value !== "string") return true;
    if (isParenthesisedTwice(node, state.sourceCode)) return true;
    return !astUtils.isTopLevelExpressionStatement(node.parent);
}

function report(node, state) {
    const leftParenToken = state.sourceCode.getTokenBefore(node);
    const rightParenToken = state.sourceCode.getTokenAfter(node);
    if (isParenthesisedTwice(node, state.sourceCode)) {
        if (state.tokensToIgnore.has(state.sourceCode.getFirstToken(node))) return;
        if (isIIFE(node) && !isParenthesised(node.callee, state.sourceCode)) return;
        if (state.config.ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
            const commentsBeforeLeftParenToken = state.sourceCode.getCommentsBefore(leftParenToken);
            const totalCommentsBeforeLeftParenTokenCount = commentsBeforeLeftParenToken.length;
            const ignorePattern = new RegExp(state.config.ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
            if (totalCommentsBeforeLeftParenTokenCount > 0 &&
                ignorePattern.test(commentsBeforeLeftParenToken[totalCommentsBeforeLeftParenTokenCount - 1].value)) {
                return;
            }
        }
    }
    function finishReport() {
        state.context.report({
            node,
            loc: leftParenToken.loc,
            messageId: "unexpected",
            fix: isFixable(node, state)
                ? fixer => {
                    const parenthesizedSource = state.sourceCode.text.slice(
                        leftParenToken.range[1],
                        rightParenToken.range[0]
                    );
                    return fixer.replaceTextRange(
                        [leftParenToken.range[0], rightParenToken.range[1]],
                        (requiresLeadingSpace(node, state) ? " " : "") +
                        parenthesizedSource +
                        (requiresTrailingSpace(node, state) ? " " : "")
                    );
                }
                : null,
        });
    }
    if (state.reportsBuffer) {
        state.reportsBuffer.reports.push({ node, finishReport });
        return;
    }
    finishReport();
}

function checkArgumentWithPrecedence(node, state) {
    if (hasExcessParensWithPrecedence(node.argument, state.precedence(node), state)) {
        report(node.argument, state);
    }
}

function doesMemberExpressionContainCallExpression(node) {
    let currentNode = node.object;
    let currentNodeType = node.object.type;
    while (currentNodeType === "MemberExpression") {
        currentNode = currentNode.object;
        currentNodeType = currentNode.type;
    }
    return currentNodeType === "CallExpression";
}

function checkCallNew(node, state) {
    const callee = node.callee;
    if (hasExcessParensWithPrecedence(callee, state.precedence(node), state)) {
        if (
            hasDoubleExcessParens(callee, state) ||
            !(
                isIIFE(node) ||
                (callee.type === "NewExpression" &&
                    !isNewExpressionWithParens(callee, state.sourceCode) &&
                    !(node.type === "NewExpression" && !isNewExpressionWithParens(node, state.sourceCode))) ||
                (node.type === "NewExpression" &&
                    callee.type === "MemberExpression" &&
                    doesMemberExpressionContainCallExpression(callee)) ||
                (!node.optional && callee.type === "ChainExpression")
            )
        ) {
            report(node.callee, state);
        }
    }
    node.arguments
        .filter(arg => hasExcessParensWithPrecedence(arg, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state))
        .forEach(arg => report(arg, state));
}

function checkBinaryLogical(node, state) {
    const prec = state.precedence(node);
    const leftPrecedence = state.precedence(node.left);
    const rightPrecedence = state.precedence(node.right);
    const isExponentiation = node.operator === "**";
    const shouldSkipLeft = state.config.NESTED_BINARY &&
        (node.left.type === "BinaryExpression" || node.left.type === "LogicalExpression");
    const shouldSkipRight = state.config.NESTED_BINARY &&
        (node.right.type === "BinaryExpression" || node.right.type === "LogicalExpression");
    if (!shouldSkipLeft && hasExcessParens(node.left, state)) {
        if (
            (!(
                ["AwaitExpression", "UnaryExpression"].includes(node.left.type) &&
                isExponentiation
            ) &&
                !astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node) &&
                (leftPrecedence > prec ||
                    (leftPrecedence === prec && !isExponentiation))) ||
            isParenthesisedTwice(node.left, state.sourceCode)
        ) {
            report(node.left, state);
        }
    }
    if (!shouldSkipRight && hasExcessParens(node.right, state)) {
        if (
            (!astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node) &&
                (rightPrecedence > prec ||
                    (rightPrecedence === prec && isExponentiation))) ||
            isParenthesisedTwice(node.right, state.sourceCode)
        ) {
            report(node.right, state);
        }
    }
}

function checkClass(node, state) {
    if (!node.superClass) return;
    const hasExtraParens =
        state.precedence(node.superClass) > state.PRECEDENCE_OF_UPDATE_EXPR
            ? hasExcessParens(node.superClass, state)
            : hasDoubleExcessParens(node.superClass, state);
    if (hasExtraParens) report(node.superClass, state);
}

function checkSpreadOperator(node, state) {
    if (hasExcessParensWithPrecedence(node.argument, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
        report(node.argument, state);
    }
}

function checkExpressionOrExportStatement(node, state) {
    const firstToken = isParenthesised(node, state.sourceCode)
        ? state.sourceCode.getTokenBefore(node)
        : state.sourceCode.getFirstToken(node);
    const secondToken = state.sourceCode.getTokenAfter(firstToken, astUtils.isNotOpeningParenToken);
    const thirdToken = secondToken ? state.sourceCode.getTokenAfter(secondToken) : null;
    const tokenAfterClosingParens = secondToken
        ? state.sourceCode.getTokenAfter(secondToken, astUtils.isNotClosingParenToken)
        : null;
    if (
        astUtils.isOpeningParenToken(firstToken) &&
        (astUtils.isOpeningBraceToken(secondToken) ||
            (secondToken.type === "Keyword" &&
                (secondToken.value === "function" ||
                    secondToken.value === "class" ||
                    (secondToken.value === "let" &&
                        tokenAfterClosingParens &&
                        (astUtils.isOpeningBracketToken(tokenAfterClosingParens) ||
                            tokenAfterClosingParens.type === "Identifier")))) ||
            (secondToken &&
                secondToken.type === "Identifier" &&
                secondToken.value === "async" &&
                thirdToken &&
                thirdToken.type === "Keyword" &&
                thirdToken.value === "function"))
    ) {
        state.tokensToIgnore.add(secondToken);
    }
    const hasExtraParens =
        node.parent.type === "ExportDefaultDeclaration"
            ? hasExcessParensWithPrecedence(node, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)
            : hasExcessParens(node, state);
    if (hasExtraParens) report(node, state);
}

function pathToAncestor(node, ancestor) {
    const path = [node];
    let currentNode = node;
    while (currentNode !== ancestor) {
        currentNode = currentNode.parent;
        if (currentNode === null) {
            throw new Error("Nodes are not in the ancestor-descendant relationship.");
        }
        path.push(currentNode);
    }
    return path;
}

function pathToDescendant(node, descendant) {
    return pathToAncestor(descendant, node).reverse();
}

function isSafelyEnclosingInExpression(node, child) {
    switch (node.type) {
        case "ArrayExpression":
        case "ArrayPattern":
        case "BlockStatement":
        case "ObjectExpression":
        case "ObjectPattern":
        case "TemplateLiteral":
            return true;
        case "ArrowFunctionExpression":
        case "FunctionExpression":
            return node.params.includes(child);
        case "CallExpression":
        case "NewExpression":
            return node.arguments.includes(child);
        case "MemberExpression":
            return node.computed && node.property === child;
        case "ConditionalExpression":
            return node.consequent === child;
        default:
            return false;
    }
}

function startNewReportsBuffering(state) {
    state.reportsBuffer = {
        upper: state.reportsBuffer,
        inExpressionNodes: [],
        reports: [],
    };
}

function endCurrentReportsBuffering(state) {
    const { upper, inExpressionNodes, reports } = state.reportsBuffer;
    if (upper) {
        upper.inExpressionNodes.push(...inExpressionNodes);
        upper.reports.push(...reports);
    } else {
        reports.forEach(({ finishReport }) => finishReport());
    }
    state.reportsBuffer = upper;
}

function isInCurrentReportsBuffer(node, state) {
    return state.reportsBuffer.reports.some(r => r.node === node);
}

function removeFromCurrentReportsBuffer(node, state) {
    state.reportsBuffer.reports = state.reportsBuffer.reports.filter(r => r.node !== node);
}

function isMemberExpInNewCallee(node) {
    if (node.type === "MemberExpression") {
        return node.parent.type === "NewExpression" && node.parent.callee === node
            ? true
            : node.parent.object === node && isMemberExpInNewCallee(node.parent);
    }
    return false;
}

function isAnonymousFunctionAssignmentException({ left, operator, right }) {
    if (left.type === "Identifier" && ["=", "&&=", "||=", "??="].includes(operator)) {
        const rhsType = right.type;
        if (rhsType === "ArrowFunctionExpression") return true;
        if ((rhsType === "FunctionExpression" || rhsType === "ClassExpression") && !right.id) return true;
    }
    return false;
}

function createHandlers(state) {
    return {
        ArrayExpression(node) {
            node.elements
                .filter(e => e && hasExcessParensWithPrecedence(e, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state))
                .forEach(e => report(e, state));
        },
        ArrayPattern(node) {
            node.elements
                .filter(e => canBeAssignmentTarget(e) && hasExcessParens(e, state))
                .forEach(e => report(e, state));
        },
        ArrowFunctionExpression(node) {
            if (isReturnAssignException(node, state.config)) return;
            if (node.body.type === "ConditionalExpression" && state.config.IGNORE_ARROW_CONDITIONALS) return;
            if (node.body.type !== "BlockStatement") {
                const firstBodyToken = state.sourceCode.getFirstToken(node.body, astUtils.isNotOpeningParenToken);
                const tokenBeforeFirst = state.sourceCode.getTokenBefore(firstBodyToken);
                if (astUtils.isOpeningParenToken(tokenBeforeFirst) && astUtils.isOpeningBraceToken(firstBodyToken)) {
                    state.tokensToIgnore.add(firstBodyToken);
                }
                if (hasExcessParensWithPrecedence(node.body, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                    report(node.body, state);
                }
            }
        },
        AssignmentExpression(node) {
            if (canBeAssignmentTarget(node.left) && hasExcessParens(node.left, state) &&
                (!isAnonymousFunctionAssignmentException(node) || isParenthesisedTwice(node.left, state.sourceCode))) {
                report(node.left, state);
            }
            if (!isReturnAssignException(node, state.config) &&
                hasExcessParensWithPrecedence(node.right, state.precedence(node), state)) {
                report(node.right, state);
            }
        },
        BinaryExpression(node) {
            if (state.reportsBuffer && node.operator === "in") {
                state.reportsBuffer.inExpressionNodes.push(node);
            }
            checkBinaryLogical(node, state);
        },
        CallExpression: node => checkCallNew(node, state),
        ConditionalExpression(node) {
            if (isReturnAssignException(node, state.config)) return;
            const availableTypes = new Set(["BinaryExpression", "LogicalExpression"]);
            if (!state.config.EXCEPT_COND_TERNARY && availableTypes.has(node.test.type) &&
                !isCondAssignException(node, state.config) &&
                hasExcessParensWithPrecedence(node.test, state.precedence({ type: "LogicalExpression", operator: "||" }), state)) {
                report(node.test, state);
            }
            if (!state.config.EXCEPT_COND_TERNARY && availableTypes.has(node.consequent.type) &&
                hasExcessParensWithPrecedence(node.consequent, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                report(node.consequent, state);
            }
            if (!state.config.EXCEPT_COND_TERNARY && availableTypes.has(node.alternate.type) &&
                hasExcessParensWithPrecedence(node.alternate, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                report(node.alternate, state);
            }
        },
        DoWhileStatement(node) {
            if (hasExcessParens(node.test, state) && !isCondAssignException(node, state.config)) {
                report(node.test, state);
            }
        },
        ExportDefaultDeclaration: node => checkExpressionOrExportStatement(node.declaration, state),
        ExpressionStatement: node => checkExpressionOrExportStatement(node.expression, state),
        ForInStatement(node) {
            if (node.left.type !== "VariableDeclaration") {
                const firstLeftToken = state.sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
                if (firstLeftToken.value === "let" &&
                    astUtils.isOpeningBracketToken(state.sourceCode.getTokenAfter(firstLeftToken, astUtils.isNotClosingParenToken))) {
                    state.tokensToIgnore.add(firstLeftToken);
                }
            }
            if (hasExcessParens(node.left, state)) report(node.left, state);
            if (hasExcessParens(node.right, state)) report(node.right, state);
        },
        ForOfStatement(node) {
            if (node.left.type !== "VariableDeclaration") {
                const firstLeftToken = state.sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
                if (firstLeftToken.value === "let") {
                    state.tokensToIgnore.add(firstLeftToken);
                }
            }
            if (hasExcessParens(node.left, state)) report(node.left, state);
            if (hasExcessParensWithPrecedence(node.right, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                report(node.right, state);
            }
        },
        ForStatement(node) {
            if (node.test && hasExcessParens(node.test, state) && !isCondAssignException(node, state.config)) {
                report(node.test, state);
            }
            if (node.update && hasExcessParens(node.update, state)) {
                report(node.update, state);
            }
            if (node.init) {
                if (node.init.type !== "VariableDeclaration") {
                    const firstToken = state.sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);
                    if (firstToken.value === "let" &&
                        astUtils.isOpeningBracketToken(state.sourceCode.getTokenAfter(firstToken, astUtils.isNotClosingParenToken))) {
                        state.tokensToIgnore.add(firstToken);
                    }
                }
                startNewReportsBuffering(state);
                if (hasExcessParens(node.init, state)) report(node.init, state);
            }
        },
        "ForStatement > *.init:exit"(node) {
            if (state.reportsBuffer.reports.length) {
                state.reportsBuffer.inExpressionNodes.forEach(inExpressionNode => {
                    const path = pathToDescendant(node, inExpressionNode);
                    let nodeToExclude;
                    for (let i = 0; i < path.length; i++) {
                        const pathNode = path[i];
                        if (i < path.length - 1) {
                            const nextPathNode = path[i + 1];
                            if (isSafelyEnclosingInExpression(pathNode, nextPathNode)) return;
                        }
                        if (isParenthesised(pathNode, state.sourceCode)) {
                            if (isInCurrentReportsBuffer(pathNode, state)) {
                                if (isParenthesisedTwice(pathNode, state.sourceCode)) return;
                                if (!nodeToExclude) nodeToExclude = pathNode;
                            } else {
                                return;
                            }
                        }
                    }
                    removeFromCurrentReportsBuffer(nodeToExclude, state);
                });
            }
            endCurrentReportsBuffering(state);
        },
        IfStatement(node) {
            if (hasExcessParens(node.test, state) && !isCondAssignException(node, state.config)) {
                report(node.test, state);
            }
        },
        ImportExpression(node) {
            const { source } = node;
            if (source.type === "SequenceExpression") {
                if (hasDoubleExcessParens(source, state)) report(source, state);
            } else if (hasExcessParens(source, state)) {
                report(source, state);
            }
        },
        LogicalExpression: node => checkBinaryLogical(node, state),
        MemberExpression(node) {
            const shouldAllowWrapOnce = isMemberExpInNewCallee(node) &&
                doesMemberExpressionContainCallExpression(node);
            const nodeObjHasExcessParens = shouldAllowWrapOnce
                ? hasDoubleExcessParens(node.object, state)
                : hasExcessParens(node.object, state) &&
                    !(
                        isImmediateFunctionPrototypeMethodCall(node.parent) &&
                        node.parent.callee === node &&
                        state.config.IGNORE_FUNCTION_PROTOTYPE_METHODS
                    );
            if (nodeObjHasExcessParens &&
                state.precedence(node.object) >= state.precedence(node) &&
                (node.computed ||
                    !(
                        astUtils.isDecimalInteger(node.object) ||
                        (node.object.type === "Literal" && node.object.regex)
                    ))) {
                report(node.object, state);
            }
            if (nodeObjHasExcessParens && node.object.type === "CallExpression") {
                report(node.object, state);
            }
            if (nodeObjHasExcessParens && !state.config.IGNORE_NEW_IN_MEMBER_EXPR &&
                node.object.type === "NewExpression" && isNewExpressionWithParens(node.object, state.sourceCode)) {
                report(node.object, state);
            }
            if (nodeObjHasExcessParens && node.optional && node.object.type === "ChainExpression") {
                report(node.object, state);
            }
            if (node.computed && hasExcessParens(node.property, state)) {
                report(node.property, state);
            }
        },
        "MethodDefinition[computed=true]": node => {
            if (hasExcessParensWithPrecedence(node.key, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                report(node.key, state);
            }
        },
        NewExpression: node => checkCallNew(node, state),
        ObjectExpression(node) {
            node.properties
                .filter(property => property.value &&
                    hasExcessParensWithPrecedence(property.value, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state))
                .forEach(property => report(property.value, state));
        },
        ObjectPattern(node) {
            node.properties
                .filter(property => {
                    const value = property.value;
                    return canBeAssignmentTarget(value) && hasExcessParens(value, state);
                })
                .forEach(property => report(property.value, state));
        },
        Property(node) {
            if (node.computed) {
                const { key } = node;
                if (key && hasExcessParensWithPrecedence(key, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                    report(key, state);
                }
            }
        },
        PropertyDefinition(node) {
            if (node.computed && hasExcessParensWithPrecedence(node.key, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                report(node.key, state);
            }
            if (node.value && hasExcessParensWithPrecedence(node.value, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                report(node.value, state);
            }
        },
        RestElement(node) {
            const argument = node.argument;
            if (canBeAssignmentTarget(argument) && hasExcessParens(argument, state)) {
                report(argument, state);
            }
        },
        ReturnStatement(node) {
            const returnToken = state.sourceCode.getFirstToken(node);
            if (isReturnAssignException(node, state.config)) return;
            if (node.argument &&
                hasExcessParensNoLineTerminator(returnToken, node.argument, state) &&
                !(node.argument.type === "Literal" && node.argument.regex)) {
                report(node.argument, state);
            }
        },
        SequenceExpression(node) {
            const precedenceOfNode = state.precedence(node);
            node.expressions
                .filter(e => hasExcessParensWithPrecedence(e, precedenceOfNode, state))
                .forEach(e => report(e, state));
        },
        SwitchCase(node) {
            if (node.test && hasExcessParens(node.test, state)) {
                report(node.test, state);
            }
        },
        SwitchStatement(node) {
            if (hasExcessParens(node.discriminant, state)) {
                report(node.discriminant, state);
            }
        },
        ThrowStatement(node) {
            const throwToken = state.sourceCode.getFirstToken(node);
            if (hasExcessParensNoLineTerminator(throwToken, node.argument, state)) {
                report(node.argument, state);
            }
        },
        UnaryExpression: node => checkArgumentWithPrecedence(node, state),
        UpdateExpression(node) {
            if (node.prefix) {
                checkArgumentWithPrecedence(node, state);
            } else {
                const { argument } = node;
                const operatorToken = state.sourceCode.getLastToken(node);
                if (argument.loc.end.line === operatorToken.loc.start.line) {
                    checkArgumentWithPrecedence(node, state);
                } else {
                    if (hasDoubleExcessParens(argument, state)) {
                        report(argument, state);
                    }
                }
            }
        },
        AwaitExpression: node => checkArgumentWithPrecedence(node, state),
        VariableDeclarator(node) {
            if (node.init &&
                hasExcessParensWithPrecedence(node.init, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state) &&
                !(node.init.type === "Literal" && node.init.regex)) {
                report(node.init, state);
            }
        },
        WhileStatement(node) {
            if (hasExcessParens(node.test, state) && !isCondAssignException(node, state.config)) {
                report(node.test, state);
            }
        },
        WithStatement(node) {
            if (hasExcessParens(node.object, state)) {
                report(node.object, state);
            }
        },
        YieldExpression(node) {
            if (node.argument) {
                const yieldToken = state.sourceCode.getFirstToken(node);
                if ((state.precedence(node.argument) >= state.precedence(node) &&
                    hasExcessParensNoLineTerminator(yieldToken, node.argument, state)) ||
                    hasDoubleExcessParens(node.argument, state)) {
                    report(node.argument, state);
                }
            }
        },
        ClassDeclaration: node => checkClass(node, state),
        ClassExpression: node => checkClass(node, state),
        SpreadElement: node => checkSpreadOperator(node, state),
        SpreadProperty: node => checkSpreadOperator(node, state),
        ExperimentalSpreadProperty: node => checkSpreadOperator(node, state),
        TemplateLiteral(node) {
            node.expressions
                .filter(e => e && hasExcessParens(e, state))
                .forEach(e => report(e, state));
        },
        AssignmentPattern(node) {
            const { left, right } = node;
            if (canBeAssignmentTarget(left) && hasExcessParens(left, state)) {
                report(left, state);
            }
            if (right &&
                hasExcessParensWithPrecedence(right, state.PRECEDENCE_OF_ASSIGNMENT_EXPR, state)) {
                report(right, state);
            }
        },
    };
}

module.exports = {
    meta: {
        deprecated: {
            message: "Formatting rules are being moved out of ESLint core.",
            url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
            deprecatedSince: "8.53.0",
            availableUntil: "11.0.0",
            replacedBy: [
                {
                    message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
                    url: "https://eslint.style/guide/migration",
                    plugin: {
                        name: "@stylistic/eslint-plugin",
                        url: "https://eslint.style",
                    },
                    rule: {
                        name: "no-extra-parens",
                        url: "https://eslint.style/rules/no-extra-parens",
                    },
                },
            ],
        },
        type: "layout",
        docs: {
            description: "Disallow unnecessary parentheses",
            recommended: false,
            url: "https://eslint.org/docs/latest/rules/no-extra-parens",
        },
        fixable: "code",
        schema: [
            {
                anyOf: [
                    {
                        type: "array",
                        items: [{ enum: ["functions"] }],
                        minItems: 0,
                        maxItems: 1,
                    },
                    {
                        type: "array",
                        items: [
                            { enum: ["all"] },
                            {
                                type: "object",
                                properties: {
                                    conditionalAssign: { type: "boolean" },
                                    ternaryOperandBinaryExpressions: { type: "boolean" },
                                    nestedBinaryExpressions: { type: "boolean" },
                                    returnAssign: { type: "boolean" },
                                    ignoreJSX: {
                                        enum: ["none", "all", "single-line", "multi-line"],
                                    },
                                    enforceForArrowConditionals: { type: "boolean" },
                                    enforceForSequenceExpressions: { type: "boolean" },
                                    enforceForNewInMemberExpressions: { type: "boolean" },
                                    enforceForFunctionPrototypeMethods: { type: "boolean" },
                                    allowParensAfterCommentPattern: { type: "string" },
                                },
                                additionalProperties: false,
                            },
                        ],
                        minItems: 0,
                        maxItems: 2,
                    },
                ],
            },
        ],
        messages: {
            unexpected: "Unnecessary parentheses around expression.",
        },
    },
    create(context) {
        const sourceCode = context.sourceCode;
        const tokensToIgnore = new WeakSet();
        const precedence = astUtils.getPrecedence;
        const config = parseOptions(context.options);
        const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
        const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });
        const state = {
            context,
            sourceCode,
            tokensToIgnore,
            precedence,
            config,
            PRECEDENCE_OF_ASSIGNMENT_EXPR,
            PRECEDENCE_OF_UPDATE_EXPR,
            reportsBuffer: null,
        };
        return createHandlers(state);
    },
};
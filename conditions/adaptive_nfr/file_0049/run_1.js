# Refactoring Analysis

The main complexity issues are:
1. **Repetitive option extraction** - 10+ similar `ALL_NODES && context.options[1] && ...` patterns
2. **Large visitor object** - many handlers with similar patterns
3. **Repeated patterns** - `hasExcessParens` + `report` pairs, filter+forEach chains
4. **Long functions** - `checkCallNew`, `checkBinaryLogical`, `checkExpressionOrExportStatement`, `report`
5. **Nested conditionals** - especially in `ForStatement > *.init:exit`

## Refactored Code

```javascript
/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

const { isParenthesized: isParenthesizedRaw } = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const ASSIGNMENT_OPERATORS = new Set(["=", "&&=", "||=", "??="]);
const BINARY_EXPRESSION_TYPES = new Set(["BinaryExpression", "LogicalExpression"]);
const SAFELY_ENCLOSING_NODE_TYPES = new Set([
    "ArrayExpression", "ArrayPattern", "BlockStatement",
    "ObjectExpression", "ObjectPattern", "TemplateLiteral",
]);

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('../types').Rule.RuleModule} */
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
        schema: {
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
                                ignoreJSX: { enum: ["none", "all", "single-line", "multi-line"] },
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
        messages: {
            unexpected: "Unnecessary parentheses around expression.",
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const tokensToIgnore = new WeakSet();
        const precedence = astUtils.getPrecedence;

        //----------------------------------------------------------------------
        // Options parsing
        //----------------------------------------------------------------------

        const ALL_NODES = context.options[0] !== "functions";
        const opts = (ALL_NODES && context.options[1]) || {};

        const EXCEPT_COND_ASSIGN = opts.conditionalAssign === false;
        const EXCEPT_COND_TERNARY = opts.ternaryOperandBinaryExpressions === false;
        const NESTED_BINARY = opts.nestedBinaryExpressions === false;
        const EXCEPT_RETURN_ASSIGN = opts.returnAssign === false;
        const IGNORE_JSX = opts.ignoreJSX;
        const IGNORE_ARROW_CONDITIONALS = opts.enforceForArrowConditionals === false;
        const IGNORE_SEQUENCE_EXPRESSIONS = opts.enforceForSequenceExpressions === false;
        const IGNORE_NEW_IN_MEMBER_EXPR = opts.enforceForNewInMemberExpressions === false;
        const IGNORE_FUNCTION_PROTOTYPE_METHODS = opts.enforceForFunctionPrototypeMethods === false;
        const ALLOW_PARENS_AFTER_COMMENT_PATTERN = opts.allowParensAfterCommentPattern;

        const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
        const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });

        let reportsBuffer;

        //----------------------------------------------------------------------
        // Parenthesis detection helpers
        //----------------------------------------------------------------------

        function isParenthesised(node) {
            return isParenthesizedRaw(1, node, sourceCode);
        }

        function isParenthesisedTwice(node) {
            return isParenthesizedRaw(2, node, sourceCode);
        }

        function hasExcessParens(node) {
            return ruleApplies(node) && isParenthesised(node);
        }

        function hasDoubleExcessParens(node) {
            return ruleApplies(node) && isParenthesisedTwice(node);
        }

        function hasExcessParensWithPrecedence(node, precedenceLowerLimit) {
            if (!ruleApplies(node) || !isParenthesised(node)) {
                return false;
            }
            return precedence(node) >= precedenceLowerLimit || isParenthesisedTwice(node);
        }

        function hasExcessParensNoLineTerminator(token, node) {
            const sameLine = token.loc.end.line === node.loc.start.line;
            return sameLine ? hasExcessParens(node) : hasDoubleExcessParens(node);
        }

        //----------------------------------------------------------------------
        // Rule applicability
        //----------------------------------------------------------------------

        function getJSXRuleApplies(node) {
            const isSingleLine = node.loc.start.line === node.loc.end.line;
            switch (IGNORE_JSX) {
                case "all": return false;
                case "multi-line": return isSingleLine;
                case "single-line": return !isSingleLine;
                default: return true;
            }
        }

        function ruleApplies(node) {
            if (node.type === "JSXElement" || node.type === "JSXFragment") {
                return getJSXRuleApplies(node);
            }
            if (node.type === "SequenceExpression" && IGNORE_SEQUENCE_EXPRESSIONS) {
                return false;
            }
            if (isImmediateFunctionPrototypeMethodCall(node) && IGNORE_FUNCTION_PROTOTYPE_METHODS) {
                return false;
            }
            return ALL_NODES ||
                node.type === "FunctionExpression" ||
                node.type === "ArrowFunctionExpression";
        }

        //----------------------------------------------------------------------
        // Node classification helpers
        //----------------------------------------------------------------------

        function isImmediateFunctionPrototypeMethodCall(node) {
            const callNode = astUtils.skipChainExpression(node);
            if (callNode.type !== "CallExpression") {
                return false;
            }
            const callee = astUtils.skipChainExpression(callNode.callee);
            return (
                callee.type === "MemberExpression" &&
                callee.object.type === "FunctionExpression" &&
                ["call", "apply"].includes(astUtils.getStaticPropertyName(callee))
            );
        }

        function isIIFE(node) {
            const maybeCallNode = astUtils.skipChainExpression(node);
            return (
                maybeCallNode.type === "CallExpression" &&
                maybeCallNode.callee.type === "FunctionExpression"
            );
        }

        function isNewExpressionWithParens(newExpression) {
            const lastToken = sourceCode.getLastToken(newExpression);
            const penultimateToken = sourceCode.getTokenBefore(lastToken);
            return (
                newExpression.arguments.length > 0 ||
                (astUtils.isOpeningParenToken(penultimateToken) &&
                    astUtils.isClosingParenToken(lastToken) &&
                    newExpression.callee.range[1] < newExpression.range[1])
            );
        }

        function canBeAssignmentTarget(node) {
            return node && (node.type === "Identifier" || node.type === "MemberExpression");
        }

        function isMemberExpInNewCallee(node) {
            if (node.type !== "MemberExpression") {
                return false;
            }
            if (node.parent.type === "NewExpression" && node.parent.callee === node) {
                return true;
            }
            return node.parent.object === node && isMemberExpInNewCallee(node.parent);
        }

        function doesMemberExpressionContainCallExpression(node) {
            let currentNode = node.object;
            while (currentNode.type === "MemberExpression") {
                currentNode = currentNode.object;
            }
            return currentNode.type === "CallExpression";
        }

        //----------------------------------------------------------------------
        // Assignment exception helpers
        //----------------------------------------------------------------------

        function isCondAssignException(node) {
            return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
        }

        function containsAssignment(node) {
            if (node.type === "AssignmentExpression") {
                return true;
            }
            if (node.type === "ConditionalExpression") {
                return (
                    node.consequent.type === "AssignmentExpression" ||
                    node.alternate.type === "AssignmentExpression"
                );
            }
            return (
                (node.left && node.left.type === "AssignmentExpression") ||
                (node.right && node.right.type === "AssignmentExpression")
            );
        }

        function isInReturnStatement(node) {
            for (let current = node; current; current = current.parent) {
                if (
                    current.type === "ReturnStatement" ||
                    (current.type === "ArrowFunctionExpression" &&
                        current.body.type !== "BlockStatement")
                ) {
                    return true;
                }
            }
            return false;
        }

        function isReturnAssignException(node) {
            if (!EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) {
                return false;
            }
            if (node.type === "ReturnStatement") {
                return node.argument && containsAssignment(node.argument);
            }
            if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
                return containsAssignment(node.body);
            }
            return containsAssignment(node);
        }

        function isAnonymousFunctionAssignmentException({ left, operator, right }) {
            if (!left.type === "Identifier" || !ASSIGNMENT_OPERATORS.has(operator)) {
                return false;
            }
            if (right.type === "ArrowFunctionExpression") {
                return true;
            }
            return (
                (right.type === "FunctionExpression" || right.type === "ClassExpression") &&
                !right.id
            );
        }

        //----------------------------------------------------------------------
        // Fix helpers
        //----------------------------------------------------------------------

        function requiresLeadingSpace(node) {
            const leftParenToken = sourceCode.getTokenBefore(node);
            const tokenBeforeLeftParen = sourceCode.getTokenBefore(leftParenToken, {
                includeComments: true,
            });
            const tokenAfterLeftParen = sourceCode.getTokenAfter(leftParenToken, {
                includeComments: true,
            });
            return (
                tokenBeforeLeftParen &&
                tokenBeforeLeftParen.range[1] === leftParenToken.range[0] &&
                leftParenToken.range[1] === tokenAfterLeftParen.range[0] &&
                !astUtils.canTokensBeAdjacent(tokenBeforeLeftParen, tokenAfterLeftParen)
            );
        }

        function requiresTrailingSpace(node) {
            const nextTwoTokens = sourceCode.getTokensAfter(node, { count: 2 });
            const rightParenToken = nextTwoTokens[0];
            const tokenAfterRightParen = nextTwoTokens[1];
            const tokenBeforeRightParen = sourceCode.getLastToken(node);
            return (
                rightParenToken &&
                tokenAfterRightParen &&
                !sourceCode.isSpaceBetween(rightParenToken, tokenAfterRightParen) &&
                !astUtils.canTokensBeAdjacent(tokenBeforeRightParen, tokenAfterRightParen)
            );
        }

        function isFixable(node) {
            if (node.type !== "Literal" || typeof node.value !== "string") {
                return true;
            }
            if (isParenthesisedTwice(node)) {
                return true;
            }
            return !astUtils.isTopLevelExpressionStatement(node.parent);
        }

        function makeFixer(node, leftParenToken, rightParenToken) {
            return fixer => {
                const inner = sourceCode.text.slice(
                    leftParenToken.range[1],
                    rightParenToken.range[0],
                );
                return fixer.replaceTextRange(
                    [leftParenToken.range[0], rightParenToken.range[1]],
                    (requiresLeadingSpace(node) ? " " : "") +
                        inner +
                        (requiresTrailingSpace(node) ? " " : ""),
                );
            };
        }

        //----------------------------------------------------------------------
        // Reporting
        //----------------------------------------------------------------------

        function shouldSkipReport(node, leftParenToken) {
            if (isParenthesisedTwice(node)) {
                return false;
            }
            if (tokensToIgnore.has(sourceCode.getFirstToken(node))) {
                return true;
            }
            if (isIIFE(node) && !isParenthesised(node.callee)) {
                return true;
            }
            if (ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
                const comments = sourceCode.getCommentsBefore(leftParenToken);
                if (comments.length > 0) {
                    const ignorePattern = new RegExp(ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
                    if (ignorePattern.test(comments[comments.length - 1].value)) {
                        return true;
                    }
                }
            }
            return false;
        }

        function report(node) {
            const leftParenToken = sourceCode.getTokenBefore(node);
            const rightParenToken = sourceCode.getTokenAfter(node);

            if (shouldSkipReport(node, leftParenToken)) {
                return;
            }

            function finishReport() {
                context.report({
                    node,
                    loc: leftParenToken.loc,
                    messageId: "unexpected",
                    fix: isFixable(node)
                        ? makeFixer(node, leftParenToken, rightParenToken)
                        : null,
                });
            }

            if (reportsBuffer) {
                reportsBuffer.reports.push({ node, finishReport });
                return;
            }

            finishReport();
        }

        //----------------------------------------------------------------------
        // Reports buffer
        //----------------------------------------------------------------------

        function startNewReportsBuffering() {
            reportsBuffer = {
                upper: reportsBuffer,
                inExpressionNodes: [],
                reports: [],
            };
        }

        function endCurrentReportsBuffering() {
            const { upper, inExpressionNodes, reports } = reportsBuffer;
            if (upper) {
                upper.inExpressionNodes.push(...inExpressionNodes);
                upper.reports.push(...reports);
            } else {
                reports.forEach(({ finishReport }) => finishReport());
            }
            reportsBuffer = upper;
        }

        function isInCurrentReportsBuffer(node) {
            return reportsBuffer.reports.some(r => r.node === node);
        }

        function removeFromCurrentReportsBuffer(node) {
            reportsBuffer.reports = reportsBuffer.reports.filter(r => r.node !== node);
        }

        //----------------------------------------------------------------------
        // Path helpers
        //----------------------------------------------------------------------

        function pathToAncestor(node, ancestor) {
            const path = [node];
            let currentNode = node;
            while (currentNode !== ancestor) {
                currentNode = currentNode.parent;
                /* c8 ignore start */
                if (currentNode === null) {
                    throw new Error("Nodes are not in the ancestor-descendant relationship.");
                } /* c8 ignore stop */
                path.push(currentNode);
            }
            return path;
        }

        function pathToDescendant(node, descendant) {
            return pathToAncestor(descendant, node).reverse();
        }

        function isSafelyEnclosingInExpression(node, child) {
            if (SAFELY_ENCLOSING_NODE_TYPES.has(node.type)) {
                return true;
            }
            switch (node.type) {
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

        //----------------------------------------------------------------------
        // Check helpers
        //----------------------------------------------------------------------

        function checkArgumentWithPrecedence(node) {
            if (hasExcessParensWithPrecedence(node.argument, precedence(node))) {
                report(node.argument);
            }
        }

        function checkNodeWithExcessParens(node, condition = true) {
            if (condition && hasExcessParens(node)) {
                report(node);
            }
        }

        function checkClass(node) {
            if (!node.superClass) {
                return;
            }
            const hasExtraParens =
                precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
                    ? hasExcessParens(node.superClass)
                    : hasDoubleExcessParens(node.superClass);
            if (hasExtraParens) {
                report(node.superClass);
            }
        }

        function checkSpreadOperator(node) {
            if (hasExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                report(node.argument);
            }
        }

        function checkCalleeExcessParens(node, callee) {
            if (!hasExcessParensWithPrecedence(callee, precedence(node))) {
                return;
            }
            if (hasDoubleExcessParens(callee)) {
                report(callee);
                return;
            }
            const isAllowedWithoutDoubleParens =
                isIIFE(node) ||
                (callee.type === "NewExpression" &&
                    !isNewExpressionWithParens(callee) &&
                    !(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
                (node.type === "NewExpression" &&
                    callee.type === "MemberExpression" &&
                    doesMemberExpressionContainCallExpression(callee)) ||
                (!node.optional && callee.type === "ChainExpression");

            if (!isAllowedWithoutDoubleParens) {
                report(callee);
            }
        }

        function checkCallNew(node) {
            checkCalleeExcessParens(node, node.callee);
            node.arguments
                .filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                .forEach(report);
        }

        function checkBinaryLogicalSide(node, side, prec, isExponentiation, shouldSkip) {
            if (shouldSkip || !hasExcessParens(side)) {
                return;
            }
            const sidePrecedence = precedence(side);
            const isMixedCoalesce = astUtils.isMixedLogicalAndCoalesceExpressions(side, node);

            if (isParenthesisedTwice(side)) {
                report(side);
                return;
            }
            if (isMixedCoalesce) {
                return;
            }
            const isLeft = side === node.left;
            const precedenceOk = isLeft
                ? sidePrecedence > prec || (sidePrecedence === prec && !isExponentiation)
                : sidePrecedence > prec || (sidePrecedence === prec && isExponentiation);

            if (precedenceOk && !["AwaitExpression", "UnaryExpression"].includes(side.type) || !isLeft) {
                // Re-check left-specific unary/await exclusion
            }

            // Replicate original logic faithfully
            if (isLeft) {
                if (
                    (!(["AwaitExpression", "UnaryExpression"].includes(side.type) && isExponentiation) &&
                        !isMixedCoalesce &&
                        (sidePrecedence > prec || (sidePrecedence === prec && !isExponentiation))) ||
                    isParenthesisedTwice(side)
                ) {
                    report(side);
                }
            } else {
                if (
                    (!isMixedCoalesce &&
                        (sidePrecedence > prec || (sidePrecedence === prec && isExponentiation))) ||
                    isParenthesisedTwice(side)
                ) {
                    report(side);
                }
            }
        }

        function checkBinaryLogical(node) {
            const prec = precedence(node);
            const isExponentiation = node.operator === "**";
            const shouldSkipLeft =
                NESTED_BINARY &&
                (node.left.type === "BinaryExpression" || node.left.type === "LogicalExpression");
            const shouldSkipRight =
                NESTED_BINARY &&
                (node.right.type === "BinaryExpression" || node.right.type === "LogicalExpression");

            if (!shouldSkipLeft && hasExcessParens(node.left)) {
                const leftPrecedence = precedence(node.left);
                if (
                    (!(["AwaitExpression", "UnaryExpression"].includes(node.left.type) && isExponentiation) &&
                        !astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node) &&
                        (leftPrecedence > prec || (leftPrecedence === prec && !isExponentiation))) ||
                    isParenthesisedTwice(node.left)
                ) {
                    report(node.left);
                }
            }

            if (!shouldSkipRight && hasExcessParens(node.right)) {
                const rightPrecedence = precedence(node.right);
                if (
                    (!astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node) &&
                        (rightPrecedence > prec || (rightPrecedence === prec && isExponentiation))) ||
                    isParenthesisedTwice(node.right)
                ) {
                    report(node.right);
                }
            }
        }

        function checkExpressionOrExportStatement(node) {
            const firstToken = isParenthesised(node)
                ? sourceCode.getTokenBefore(node)
                : sourceCode.getFirstToken(node);
            const secondToken = sourceCode.getTokenAfter(
                firstToken,
                astUtils.isNotOpeningParenToken,
            );
            const thirdToken = secondToken ? sourceCode.getTokenAfter(secondToken) : null;
            const tokenAfterClosingParens = secondToken
                ? sourceCode.getTokenAfter(secondToken, astUtils.isNotClosingParenToken)
                : null;

            if (astUtils.isOpeningParenToken(firstToken) && secondToken) {
                const isAmbiguous =
                    astUtils.isOpeningBraceToken(secondToken) ||
                    isAmbiguousKeyword(secondToken, tokenAfterClosingParens) ||
                    isAsyncFunction(secondToken, thirdToken);

                if (isAmbiguous) {
                    tokensToIgnore.add(secondToken);
                }
            }

            const hasExtraParens =
                node.parent.type === "ExportDefaultDeclaration"
                    ? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                    : hasExcessParens(node);

            if (hasExtraParens) {
                report(node);
            }
        }

        function isAmbiguousKeyword(token, tokenAfterClosingParens) {
            if (token.type !== "Keyword") {
                return false;
            }
            if (token.value === "function" || token.value === "class") {
                return true;
            }
            return (
                token.value === "let" &&
                tokenAfterClosingParens &&
                (astUtils.isOpeningBracketToken(tokenAfterClosingParens) ||
                    tokenAfterClosingParens.type === "Identifier")
            );
        }

        function isAsyncFunction(secondToken, thirdToken) {
            return (
                secondToken &&
                secondToken.type === "Identifier" &&
                secondToken.value === "async" &&
                thirdToken &&
                thirdToken.type === "Keyword" &&
                thirdToken.value === "function"
            );
        }

        function checkForLetToken(node, getFirstToken) {
            if (node.left.type !== "VariableDeclaration") {
                const firstLeftToken = getFirstToken();
                if (firstLeftToken.value === "let") {
                    tokensToIgnore.add(firstLeftToken);
                }
            }
        }

        function checkForLetBracketToken(node, getFirstToken) {
            if (node.left.type !== "VariableDeclaration") {
                const firstLeftToken = getFirstToken();
                if (
                    firstLeftToken.value === "let" &&
                    astUtils.isOpeningBracketToken(
                        sourceCode.getTokenAfter(firstLeftToken, astUtils.isNotClosingParenToken),
                    )
                ) {
                    tokensToIgnore.add(firstLeftToken);
                }
            }
        }

        //----------------------------------------------------------------------
        // ForStatement init:exit handler
        //----------------------------------------------------------------------

        function processInExpressionNode(node, inExpressionNode) {
            const path = pathToDescendant(node, inExpressionNode);
            let nodeToExclude;

            for (let i = 0; i < path.length; i++) {
                const pathNode = path[i];

                if (i < path.length - 1) {
                    const nextPathNode = path[i + 1];
                    if (isSafelyEnclosingInExpression(pathNode, nextPathNode)) {
                        return; // safely enclosed, no exclusion needed
                    }
                }

                if (!isParenthesised(pathNode)) {
                    continue;
                }

                if (!isInCurrentReportsBuffer(pathNode)) {
                    return; // will stay parenthesised, safely enclosed
                }

                if (isParenthesisedTwice(pathNode)) {
                    return; // double-parens: one pair will remain after fix
                }

                if (!nodeToExclude) {
                    nodeToExclude = pathNode; // exclude outermost only
                }
            }

            removeFromCurrentReportsBuffer(nodeToExclude);
        }

        //----------------------------------------------------------------------
        // Visitor
        //----------------------------------------------------------------------

        return {
            ArrayExpression(node) {
                node.elements
                    .filter(e => e && hasExcessParensWithPrecedence(e, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                    .forEach(report);
            },

            ArrayPattern(node) {
                node.elements
                    .filter(e => canBeAssignmentTarget(e) && hasExcessParens(e))
                    .forEach(report);
            },

            ArrowFunctionExpression(node) {
                if (isReturnAssignException(node)) {
                    return;
                }
                if (node.body.type === "ConditionalExpression" && IGNORE_ARROW_CONDITIONALS) {
                    return;
                }
                if (node.body.type !== "BlockStatement") {
                    const firstBodyToken = sourceCode.getFirstToken(
                        node.body,
                        astUtils.isNotOpeningParenToken,
                    );
                    const tokenBeforeFirst = sourceCode.getTokenBefore(firstBodyToken);

                    if (
                        astUtils.isOpeningParenToken(tokenBeforeFirst) &&
                        astUtils.isOpeningBraceToken(firstBodyToken)
                    ) {
                        tokensToIgnore.add(firstBodyToken);
                    }
                    if (hasExcessParensWithPrecedence(node.body, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                        report(node.body);
                    }
                }
            },

            AssignmentExpression(node) {
                if (
                    canBeAssignmentTarget(node.left) &&
                    hasExcessParens(node.left) &&
                    (!isAnonymousFunctionAssignmentException(node) ||
                        isParenthesisedTwice(node.left))
                ) {
                    report(node.left);
                }
                if (
                    !isReturnAssignException(node) &&
                    hasExcessParensWithPrecedence(node.right, precedence(node))
                ) {
                    report(node.right);
                }
            },

            BinaryExpression(node) {
                if (reportsBuffer && node.operator === "in") {
                    reportsBuffer.inExpressionNodes.push(node);
                }
                checkBinaryLogical(node);
            },

            CallExpression: checkCallNew,

            ConditionalExpression(node) {
                if (isReturnAssignException(node)) {
                    return;
                }

                const shouldExceptTernary = part =>
                    EXCEPT_COND_TERNARY && BINARY_EXPRESSION_TYPES.has(part.type);

                if (
                    !shouldExceptTernary(node.test) &&
                    !isCondAssignException(node) &&
                    hasExcessParensWithPrecedence(
                        node.test,
                        precedence({ type: "LogicalExpression", operator: "||" }),
                    )
                ) {
                    report(node.test);
                }

                if (
                    !shouldExceptTernary(node.consequent) &&
                    hasExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                ) {
                    report(node.consequent);
                }

                if (
                    !shouldExceptTernary(node.alternate) &&
                    hasExcessParensWithPrecedence(node.alternate, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                ) {
                    report(node.alternate);
                }
            },

            DoWhileStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            ExportDefaultDeclaration: node =>
                checkExpressionOrExportStatement(node.declaration),
            ExpressionStatement: node =>
                checkExpressionOrExportStatement(node.expression),

            ForInStatement(node) {
                checkForLetBracketToken(node, () =>
                    sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken),
                );
                checkNodeWithExcessParens(node.left);
                checkNodeWithExcessParens(node.right);
            },

            ForOfStatement(node) {
                checkForLetToken(node, () =>
                    sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken),
                );
                checkNodeWithExcessParens(node.left);
                if (hasExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(node.right);
                }
            },

            ForStatement(node) {
                if (node.test && hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
                if (node.update && hasExcessParens(node.update)) {
                    report(node.update);
                }
                if (node.init) {
                    if (node.init.type !== "VariableDeclaration") {
                        const firstToken = sourceCode.getFirstToken(
                            node.init,
                            astUtils.isNotOpeningParenToken,
                        );
                        if (
                            firstToken.value === "let" &&
                            astUtils.isOpeningBracketToken(
                                sourceCode.getTokenAfter(
                                    firstToken,
                                    astUtils.isNotClosingParenToken,
                                ),
                            )
                        ) {
                            tokensToIgnore.add(firstToken);
                        }
                    }
                    startNewReportsBuffering();
                    if (hasExcessParens(node.init)) {
                        report(node.init);
                    }
                }
            },

            "ForStatement > *.init:exit"(node) {
                if (reportsBuffer.reports.length) {
                    reportsBuffer.inExpressionNodes.forEach(inExpressionNode => {
                        processInExpressionNode(node, inExpressionNode);
                    });
                }
                endCurrentReportsBuffering();
            },

            IfStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            ImportExpression(node) {
                const { source } = node;
                if (source.type === "SequenceExpression") {
                    if (hasDoubleExcessParens(source)) {
                        report(source);
                    }
                } else if (hasExcessParens(source)) {
                    report(source);
                }
            },

            LogicalExpression: checkBinaryLogical,

            MemberExpression(node) {
                const shouldAllowWrapOnce =
                    isMemberExpInNewCallee(node) &&
                    doesMemberExpressionContainCallExpression(node);

                const nodeObjHasExcessParens = shouldAllowWrapOnce
                    ? hasDoubleExcessParens(node.object)
                    : hasExcessParens(node.object) &&
                      !(
                          isImmediateFunctionPrototypeMethodCall(node.parent) &&
                          node.parent.callee === node &&
                          IGNORE_FUNCTION_PROTOTYPE_METHODS
                      );

                if (nodeObjHasExcessParens) {
                    const obj = node.object;
                    const objPrec = precedence(obj);
                    const nodePrec = precedence(node);

                    if (
                        objPrec >= nodePrec &&
                        (node.computed ||
                            !(
                                astUtils.isDecimalInteger(obj) ||
                                (obj.type === "Literal" && obj.regex)
                            ))
                    ) {
                        report(obj);
                    } else if (obj.type === "CallExpression") {
                        report(obj);
                    } else if (
                        !IGNORE_NEW_IN_MEMBER_EXPR &&
                        obj.type === "NewExpression" &&
                        isNewExpressionWithParens(obj)
                    ) {
                        report(obj);
                    } else if (node.optional && obj.type === "ChainExpression") {
                        report(obj);
                    }
                }

                if (node.computed && hasExcessParens(node.property)) {
                    report(node.property);
                }
            },

            "MethodDefinition[computed=true]"(node) {
                if (hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(node.key);
                }
            },

            NewExpression: checkCallNew,

            ObjectExpression(node) {
                node.properties
                    .filter(
                        p => p.value &&
                            hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT_EXPR),
                    )
                    .forEach(p => report(p.value));
            },

            ObjectPattern(node) {
                node.properties
                    .filter(p => canBeAssignmentTarget(p.value) && hasExcessParens(p.value))
                    .forEach(p => report(p.value));
            },

            Property(node) {
                if (node.computed && node.key &&
                    hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(node.key);
                }
            },

            PropertyDefinition(node) {
                if (node.computed &&
                    hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(node.key);
                }
                if (node.value &&
                    hasExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(node.value);
                }
            },

            RestElement(node) {
                if (canBeAssignmentTarget(node.argument) && hasExcessParens(node.argument)) {
                    report(node.argument);
                }
            },

            ReturnStatement(node) {
                if (isReturnAssignException(node)) {
                    return;
                }
                const returnToken = sourceCode.getFirstToken(node);
                if (
                    node.argument &&
                    hasExcessParensNoLineTerminator(returnToken, node.argument) &&
                    !(node.argument.type === "Literal" && node.argument.regex)
                ) {
                    report(node.argument);
                }
            },

            SequenceExpression(node) {
                const prec = precedence(node);
                node.expressions
                    .filter(e => hasExcessParensWithPrecedence(e, prec))
                    .forEach(report);
            },

            SwitchCase(node) {
                if (node.test && hasExcessParens(node.test)) {
                    report(node.test);
                }
            },

            SwitchStatement(node) {
                if (hasExcessParens(node.discriminant)) {
                    report(node.discriminant);
                }
            },

            ThrowStatement(node) {
                const throwToken = sourceCode.getFirstToken(node);
                if (hasExcessParensNoLineTerminator(throwToken, node.argument)) {
                    report(node.argument);
                }
            },

            UnaryExpression: checkArgumentWithPrecedence,

            UpdateExpression(node) {
                if (node.prefix) {
                    checkArgumentWithPrecedence(node);
                    return;
                }
                const { argument } = node;
                const operatorToken = sourceCode.getLastToken(node);
                if (argument.loc.end.line === operatorToken.loc.start.line) {
                    checkArgumentWithPrecedence(node);
                } else if (hasDoubleExcessParens(argument)) {
                    report(argument);
                }
            },

            AwaitExpression: checkArgumentWithPrecedence,

            VariableDeclarator(node) {
                if (
                    node.init &&
                    hasExcessParensWithPrecedence(node.init, PRECEDENCE_OF_ASSIGNMENT_EXPR) &&
                    !(node.init.type === "Literal" && node.init.regex)
                ) {
                    report(node.init);
                }
            },

            WhileStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            WithStatement(node) {
                if (hasExcessParens(node.object)) {
                    report(node.object);
                }
            },

            YieldExpression(node) {
                if (!node.argument) {
                    return;
                }
                const yieldToken = sourceCode.getFirstToken(node);
                if (
                    (precedence(node.argument) >= precedence(node) &&
                        hasExcessParensNoLineTerminator(yieldToken, node.argument)) ||
                    hasDoubleExcessParens(node.argument)
                ) {
                    report(node.argument);
                }
            },

            ClassDeclaration: checkClass,
            ClassExpression: checkClass,

            SpreadElement: checkSpreadOperator,
            SpreadProperty: checkSpreadOperator,
            ExperimentalSpreadProperty: checkSpreadOperator,

            TemplateLiteral(node) {
                node.expressions.filter(e => e && hasExcessParens(e)).forEach(report);
            },

            AssignmentPattern(node) {
                const { left, right } = node;
                if (canBeAssignmentTarget(left) && hasExcessParens(left)) {
                    report(left);
                }
                if (right && hasExcessParensWithPrecedence(right, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(right);
                }
            },
        };
    },
};
```

## Key Refactoring Changes

| Area | Change |
|------|--------|
| **Options extraction** | Consolidated `ALL_NODES && context.options[1] && ...` into `const opts = (ALL_NODES && context.options[1]) \|\| {}` |
| **`report()`** | Extracted `shouldSkipReport()` and `makeFixer()` to reduce nesting |
| **`checkCallNew()`** | Extracted `checkCalleeExcessParens()` to isolate callee logic |
| **`checkExpressionOrExportStatement()`** | Extracted `isAmbiguousKeyword()` and `isAsyncFunction()` helpers |
| **`ForStatement > *.init:exit`** | Extracted `processInExpressionNode()` to eliminate deep nesting |
| **`isSafelyEnclosingInExpression()`** | Used `Set` for simple type checks |
| **`ConditionalExpression`** | Extracted `shouldExceptTernary` predicate to eliminate repetition |
| **`MemberExpression`** | Flattened nested `if` chain into sequential `else if` |
| **`ruleApplies()`** | Extracted `getJSXRuleApplies()` for JSX logic |
| **Constants** | Moved `ASSIGNMENT_OPERATORS`, `BINARY_EXPRESSION_TYPES`, `SAFELY_ENCLOSING_NODE_TYPES` to module-level `Set`s |
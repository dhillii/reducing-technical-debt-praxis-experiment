# Refactored Code

The main complexity issues are:
1. Repetitive option extraction pattern
2. Duplicated `hasExcessParens` + `report` patterns
3. Long conditional chains in `checkExpressionOrExportStatement` and `checkBinaryLogical`
4. Verbose `MemberExpression` handler
5. Repetitive filter+forEach patterns

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

const ANONYMOUS_FUNCTION_OPERATORS = new Set(["=", "&&=", "||=", "??="]);
const BINARY_EXPRESSION_TYPES = new Set(["BinaryExpression", "LogicalExpression"]);
const SAFELY_ENCLOSING_TYPES = new Set([
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
        // Option parsing
        //----------------------------------------------------------------------

        const ALL_NODES = context.options[0] !== "functions";
        const opts = (ALL_NODES && context.options[1]) || {};

        const EXCEPT_COND_ASSIGN    = opts.conditionalAssign === false;
        const EXCEPT_COND_TERNARY   = opts.ternaryOperandBinaryExpressions === false;
        const NESTED_BINARY         = opts.nestedBinaryExpressions === false;
        const EXCEPT_RETURN_ASSIGN  = opts.returnAssign === false;
        const IGNORE_JSX            = opts.ignoreJSX;
        const IGNORE_ARROW_CONDITIONALS          = opts.enforceForArrowConditionals === false;
        const IGNORE_SEQUENCE_EXPRESSIONS        = opts.enforceForSequenceExpressions === false;
        const IGNORE_NEW_IN_MEMBER_EXPR          = opts.enforceForNewInMemberExpressions === false;
        const IGNORE_FUNCTION_PROTOTYPE_METHODS  = opts.enforceForFunctionPrototypeMethods === false;
        const ALLOW_PARENS_AFTER_COMMENT_PATTERN = opts.allowParensAfterCommentPattern;

        const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
        const PRECEDENCE_OF_UPDATE_EXPR     = precedence({ type: "UpdateExpression" });

        let reportsBuffer;

        //----------------------------------------------------------------------
        // Helpers: parenthesis detection
        //----------------------------------------------------------------------

        function isParenthesised(node) {
            return isParenthesizedRaw(1, node, sourceCode);
        }

        function isParenthesisedTwice(node) {
            return isParenthesizedRaw(2, node, sourceCode);
        }

        //----------------------------------------------------------------------
        // Helpers: rule applicability
        //----------------------------------------------------------------------

        function getJSXRuleApplies(node) {
            const isSingleLine = node.loc.start.line === node.loc.end.line;

            switch (IGNORE_JSX) {
                case "all":         return false;
                case "multi-line":  return isSingleLine;
                case "single-line": return !isSingleLine;
                default:            return true;
            }
        }

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
            return ALL_NODES || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
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

        //----------------------------------------------------------------------
        // Helpers: assignment / return exceptions
        //----------------------------------------------------------------------

        function isCondAssignException(node) {
            return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
        }

        function isInReturnStatement(node) {
            for (let current = node; current; current = current.parent) {
                if (
                    current.type === "ReturnStatement" ||
                    (current.type === "ArrowFunctionExpression" && current.body.type !== "BlockStatement")
                ) {
                    return true;
                }
            }
            return false;
        }

        function containsAssignment(node) {
            if (node.type === "AssignmentExpression") {
                return true;
            }
            if (
                node.type === "ConditionalExpression" &&
                (node.consequent.type === "AssignmentExpression" ||
                    node.alternate.type === "AssignmentExpression")
            ) {
                return true;
            }
            return (
                (node.left && node.left.type === "AssignmentExpression") ||
                (node.right && node.right.type === "AssignmentExpression")
            );
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
            if (!left.type === "Identifier" || !ANONYMOUS_FUNCTION_OPERATORS.has(operator)) {
                return false;
            }
            if (right.type === "ArrowFunctionExpression") {
                return true;
            }
            return (right.type === "FunctionExpression" || right.type === "ClassExpression") && !right.id;
        }

        //----------------------------------------------------------------------
        // Helpers: spacing
        //----------------------------------------------------------------------

        function requiresLeadingSpace(node) {
            const leftParenToken = sourceCode.getTokenBefore(node);
            const tokenBeforeLeftParen = sourceCode.getTokenBefore(leftParenToken, { includeComments: true });
            const tokenAfterLeftParen = sourceCode.getTokenAfter(leftParenToken, { includeComments: true });

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

        //----------------------------------------------------------------------
        // Helpers: misc
        //----------------------------------------------------------------------

        function isIIFE(node) {
            const maybeCallNode = astUtils.skipChainExpression(node);

            return (
                maybeCallNode.type === "CallExpression" &&
                maybeCallNode.callee.type === "FunctionExpression"
            );
        }

        function canBeAssignmentTarget(node) {
            return node && (node.type === "Identifier" || node.type === "MemberExpression");
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

        function doesMemberExpressionContainCallExpression(node) {
            let current = node.object;

            while (current.type === "MemberExpression") {
                current = current.object;
            }
            return current.type === "CallExpression";
        }

        function hasExcessParensNoLineTerminator(token, node) {
            return token.loc.end.line === node.loc.start.line
                ? hasExcessParens(node)
                : hasDoubleExcessParens(node);
        }

        //----------------------------------------------------------------------
        // Helpers: reporting
        //----------------------------------------------------------------------

        function reportIfExcessParens(node) {
            if (hasExcessParens(node)) {
                report(node);
            }
        }

        function reportIfExcessParensWithPrecedence(node, lowerLimit) {
            if (hasExcessParensWithPrecedence(node, lowerLimit)) {
                report(node);
            }
        }

        function buildFixer(node, leftParenToken, rightParenToken) {
            if (!isFixable(node)) {
                return null;
            }
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

        function shouldSkipReport(node, leftParenToken) {
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

            if (!isParenthesisedTwice(node) && shouldSkipReport(node, leftParenToken)) {
                return;
            }

            function finishReport() {
                context.report({
                    node,
                    loc: leftParenToken.loc,
                    messageId: "unexpected",
                    fix: buildFixer(node, leftParenToken, rightParenToken),
                });
            }

            if (reportsBuffer) {
                reportsBuffer.reports.push({ node, finishReport });
                return;
            }
            finishReport();
        }

        //----------------------------------------------------------------------
        // Helpers: node-type checks
        //----------------------------------------------------------------------

        function checkArgumentWithPrecedence(node) {
            reportIfExcessParensWithPrecedence(node.argument, precedence(node));
        }

        function checkCallNew(node) {
            const callee = node.callee;

            if (hasExcessParensWithPrecedence(callee, precedence(node))) {
                const isExemptCallee =
                    !hasDoubleExcessParens(callee) && (
                        isIIFE(node) ||
                        (callee.type === "NewExpression" &&
                            !isNewExpressionWithParens(callee) &&
                            !(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
                        (node.type === "NewExpression" &&
                            callee.type === "MemberExpression" &&
                            doesMemberExpressionContainCallExpression(callee)) ||
                        (!node.optional && callee.type === "ChainExpression")
                    );

                if (!isExemptCallee) {
                    report(callee);
                }
            }

            node.arguments
                .filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                .forEach(report);
        }

        function checkBinaryLogicalSide(node, child, childPrecedence, isExponentiation, isLeft) {
            const shouldSkip = NESTED_BINARY && BINARY_EXPRESSION_TYPES.has(child.type);

            if (shouldSkip || !hasExcessParens(child)) {
                return;
            }

            const prec = precedence(node);
            const isMixed = astUtils.isMixedLogicalAndCoalesceExpressions(child, node);
            const isUnaryExponent = isLeft &&
                ["AwaitExpression", "UnaryExpression"].includes(child.type) &&
                isExponentiation;

            const hasHigherOrEqualPrecedence = isLeft
                ? childPrecedence > prec || (childPrecedence === prec && !isExponentiation)
                : childPrecedence > prec || (childPrecedence === prec && isExponentiation);

            if ((!isUnaryExponent && !isMixed && hasHigherOrEqualPrecedence) || isParenthesisedTwice(child)) {
                report(child);
            }
        }

        function checkBinaryLogical(node) {
            const isExponentiation = node.operator === "**";

            checkBinaryLogicalSide(node, node.left, precedence(node.left), isExponentiation, true);
            checkBinaryLogicalSide(node, node.right, precedence(node.right), isExponentiation, false);
        }

        function checkClass(node) {
            if (!node.superClass) {
                return;
            }
            const hasExtraParens = precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
                ? hasExcessParens(node.superClass)
                : hasDoubleExcessParens(node.superClass);

            if (hasExtraParens) {
                report(node.superClass);
            }
        }

        function checkSpreadOperator(node) {
            reportIfExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT_EXPR);
        }

        function isKeywordRequiringParens(secondToken, tokenAfterClosingParens, thirdToken) {
            if (secondToken.type !== "Keyword") {
                return false;
            }
            if (secondToken.value === "function" || secondToken.value === "class") {
                return true;
            }
            if (
                secondToken.value === "let" &&
                tokenAfterClosingParens &&
                (astUtils.isOpeningBracketToken(tokenAfterClosingParens) ||
                    tokenAfterClosingParens.type === "Identifier")
            ) {
                return true;
            }
            return false;
        }

        function isAsyncFunctionStart(secondToken, thirdToken) {
            return (
                secondToken &&
                secondToken.type === "Identifier" &&
                secondToken.value === "async" &&
                thirdToken &&
                thirdToken.type === "Keyword" &&
                thirdToken.value === "function"
            );
        }

        function checkExpressionOrExportStatement(node) {
            const firstToken = isParenthesised(node)
                ? sourceCode.getTokenBefore(node)
                : sourceCode.getFirstToken(node);
            const secondToken = sourceCode.getTokenAfter(firstToken, astUtils.isNotOpeningParenToken);
            const thirdToken = secondToken ? sourceCode.getTokenAfter(secondToken) : null;
            const tokenAfterClosingParens = secondToken
                ? sourceCode.getTokenAfter(secondToken, astUtils.isNotClosingParenToken)
                : null;

            if (
                astUtils.isOpeningParenToken(firstToken) &&
                (astUtils.isOpeningBraceToken(secondToken) ||
                    isKeywordRequiringParens(secondToken, tokenAfterClosingParens, thirdToken) ||
                    isAsyncFunctionStart(secondToken, thirdToken))
            ) {
                tokensToIgnore.add(secondToken);
            }

            const hasExtraParens = node.parent.type === "ExportDefaultDeclaration"
                ? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                : hasExcessParens(node);

            if (hasExtraParens) {
                report(node);
            }
        }

        //----------------------------------------------------------------------
        // Helpers: for-loop 'in' expression buffering
        //----------------------------------------------------------------------

        function pathToAncestor(node, ancestor) {
            const path = [node];
            let current = node;

            while (current !== ancestor) {
                current = current.parent;
                /* c8 ignore start */
                if (current === null) {
                    throw new Error("Nodes are not in the ancestor-descendant relationship.");
                } /* c8 ignore stop */
                path.push(current);
            }
            return path;
        }

        function pathToDescendant(node, descendant) {
            return pathToAncestor(descendant, node).reverse();
        }

        function isSafelyEnclosingInExpression(node, child) {
            if (SAFELY_ENCLOSING_TYPES.has(node.type)) {
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

        function startNewReportsBuffering() {
            reportsBuffer = { upper: reportsBuffer, inExpressionNodes: [], reports: [] };
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

        function processInExpressionNode(node, inExpressionNode) {
            const path = pathToDescendant(node, inExpressionNode);
            let nodeToExclude;

            for (let i = 0; i < path.length; i++) {
                const pathNode = path[i];

                if (i < path.length - 1 && isSafelyEnclosingInExpression(pathNode, path[i + 1])) {
                    return;
                }

                if (!isParenthesised(pathNode)) {
                    continue;
                }

                if (!isInCurrentReportsBuffer(pathNode)) {
                    // Safely enclosed by remaining parens
                    return;
                }

                if (isParenthesisedTwice(pathNode)) {
                    // One pair will be removed, the other safely encloses 'in'
                    return;
                }

                if (!nodeToExclude) {
                    nodeToExclude = pathNode;
                }
            }

            removeFromCurrentReportsBuffer(nodeToExclude);
        }

        //----------------------------------------------------------------------
        // Helpers: MemberExpression
        //----------------------------------------------------------------------

        function isMemberExpInNewCallee(node) {
            if (node.type !== "MemberExpression") {
                return false;
            }
            if (node.parent.type === "NewExpression" && node.parent.callee === node) {
                return true;
            }
            return node.parent.object === node && isMemberExpInNewCallee(node.parent);
        }

        function getMemberExpressionObjectExcessParens(node) {
            const shouldAllowWrapOnce =
                isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);

            if (shouldAllowWrapOnce) {
                return hasDoubleExcessParens(node.object);
            }
            return (
                hasExcessParens(node.object) &&
                !(
                    isImmediateFunctionPrototypeMethodCall(node.parent) &&
                    node.parent.callee === node &&
                    IGNORE_FUNCTION_PROTOTYPE_METHODS
                )
            );
        }

        function checkMemberExpressionObject(node, nodeObjHasExcessParens) {
            if (!nodeObjHasExcessParens) {
                return;
            }

            const obj = node.object;
            const isDecimalOrRegex =
                astUtils.isDecimalInteger(obj) ||
                (obj.type === "Literal" && obj.regex);

            if (
                precedence(obj) >= precedence(node) &&
                (node.computed || !isDecimalOrRegex)
            ) {
                report(obj);
                return;
            }
            if (obj.type === "CallExpression") {
                report(obj);
                return;
            }
            if (!IGNORE_NEW_IN_MEMBER_EXPR && obj.type === "NewExpression" && isNewExpressionWithParens(obj)) {
                report(obj);
                return;
            }
            if (node.optional && obj.type === "ChainExpression") {
                report(obj);
            }
        }

        //----------------------------------------------------------------------
        // Return visitor
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
                    const firstBodyToken = sourceCode.getFirstToken(node.body, astUtils.isNotOpeningParenToken);
                    const tokenBeforeFirst = sourceCode.getTokenBefore(firstBodyToken);

                    if (
                        astUtils.isOpeningParenToken(tokenBeforeFirst) &&
                        astUtils.isOpeningBraceToken(firstBodyToken)
                    ) {
                        tokensToIgnore.add(firstBodyToken);
                    }
                    reportIfExcessParensWithPrecedence(node.body, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
            },

            AssignmentExpression(node) {
                if (
                    canBeAssignmentTarget(node.left) &&
                    hasExcessParens(node.left) &&
                    (!isAnonymousFunctionAssignmentException(node) || isParenthesisedTwice(node.left))
                ) {
                    report(node.left);
                }
                if (!isReturnAssignException(node)) {
                    reportIfExcessParensWithPrecedence(node.right, precedence(node));
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

                const skipIfBinaryType = type => EXCEPT_COND_TERNARY && BINARY_EXPRESSION_TYPES.has(type);

                if (
                    !skipIfBinaryType(node.test.type) &&
                    !isCondAssignException(node) &&
                    hasExcessParensWithPrecedence(
                        node.test,
                        precedence({ type: "LogicalExpression", operator: "||" }),
                    )
                ) {
                    report(node.test);
                }

                if (!skipIfBinaryType(node.consequent.type)) {
                    reportIfExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }

                if (!skipIfBinaryType(node.alternate.type)) {
                    reportIfExcessParensWithPrecedence(node.alternate, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
            },

            DoWhileStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            ExportDefaultDeclaration: node => checkExpressionOrExportStatement(node.declaration),
            ExpressionStatement: node => checkExpressionOrExportStatement(node.expression),

            ForInStatement(node) {
                if (node.left.type !== "VariableDeclaration") {
                    const firstLeftToken = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);

                    if (
                        firstLeftToken.value === "let" &&
                        astUtils.isOpeningBracketToken(
                            sourceCode.getTokenAfter(firstLeftToken, astUtils.isNotClosingParenToken),
                        )
                    ) {
                        tokensToIgnore.add(firstLeftToken);
                    }
                }
                reportIfExcessParens(node.left);
                reportIfExcessParens(node.right);
            },

            ForOfStatement(node) {
                if (node.left.type !== "VariableDeclaration") {
                    const firstLeftToken = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);

                    if (firstLeftToken.value === "let") {
                        tokensToIgnore.add(firstLeftToken);
                    }
                }
                reportIfExcessParens(node.left);
                reportIfExcessParensWithPrecedence(node.right, PRECEDENCE_OF_ASSIGNMENT_EXPR);
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
                        const firstToken = sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);

                        if (
                            firstToken.value === "let" &&
                            astUtils.isOpeningBracketToken(
                                sourceCode.getTokenAfter(firstToken, astUtils.isNotClosingParenToken),
                            )
                        ) {
                            tokensToIgnore.add(firstToken);
                        }
                    }
                    startNewReportsBuffering();
                    reportIfExcessParens(node.init);
                }
            },

            "ForStatement > *.init:exit"(node) {
                /*
                 * Removing parentheses around `in` expressions might change semantics.
                 * e.g. `for (let a = (b in c); ;)` → invalid `for (let a = b in c; ;)`
                 */
                if (reportsBuffer.reports.length) {
                    reportsBuffer.inExpressionNodes.forEach(
                        inExpressionNode => processInExpressionNode(node, inExpressionNode),
                    );
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
                } else {
                    reportIfExcessParens(source);
                }
            },

            LogicalExpression: checkBinaryLogical,

            MemberExpression(node) {
                const nodeObjHasExcessParens = getMemberExpressionObjectExcessParens(node);

                checkMemberExpressionObject(node, nodeObjHasExcessParens);

                if (node.computed && hasExcessParens(node.property)) {
                    report(node.property);
                }
            },

            "MethodDefinition[computed=true]"(node) {
                reportIfExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR);
            },

            NewExpression: checkCallNew,

            ObjectExpression(node) {
                node.properties
                    .filter(p => p.value && hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                    .forEach(p => report(p.value));
            },

            ObjectPattern(node) {
                node.properties
                    .filter(p => canBeAssignmentTarget(p.value) && hasExcessParens(p.value))
                    .forEach(p => report(p.value));
            },

            Property(node) {
                if (node.computed && node.key) {
                    reportIfExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
            },

            PropertyDefinition(node) {
                if (node.computed) {
                    reportIfExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
                if (node.value) {
                    reportIfExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT_EXPR);
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
                reportIfExcessParens(node.discriminant);
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
                reportIfExcessParens(node.object);
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
                if (right) {
                    reportIfExcessParensWithPrecedence(right, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
            },
        };
    },
};
```

## Key Refactoring Changes

1. **Option extraction** — Replaced the verbose `ALL_NODES && context.options[1] && context.options[1].x` pattern with a single `opts` object extraction, reducing 10 repetitive lines to a clean block.

2. **Helper functions** — Extracted `reportIfExcessParens` and `reportIfExcessParensWithPrecedence` to eliminate the repeated `if (hasExcess...) { report(...) }` pattern used ~20 times.

3. **`buildFixer` / `shouldSkipReport`** — Split the `report` function's logic into focused helpers, reducing its cognitive complexity.

4. **`checkBinaryLogical`** — Extracted `checkBinaryLogicalSide` to eliminate the duplicated left/right checking logic.

5. **`checkExpressionOrExportStatement`** — Extracted `isKeywordRequiringParens` and `isAsyncFunctionStart` to break up the deeply nested conditional.

6. **`MemberExpression`** — Extracted `getMemberExpressionObjectExcessParens` and `checkMemberExpressionObject` to decompose the complex handler.

7. **`processInExpressionNode`** — Extracted the inner `forEach` callback from `ForStatement > *.init:exit` for clarity.

8. **`isSafelyEnclosingInExpression`** — Used a `Set` for the simple type checks to avoid the long `case` list.

9. **`getJSXRuleApplies`** — Extracted JSX-specific logic from `ruleApplies`.

10. **Module-level constants** — Moved `ANONYMOUS_FUNCTION_OPERATORS`, `BINARY_EXPRESSION_TYPES`, and `SAFELY_ENCLOSING_TYPES` to module scope as `Set`s for reuse and clarity.
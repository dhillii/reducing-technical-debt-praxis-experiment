Looking at this code, I'll refactor it to reduce complexity by:

1. Extracting option parsing into a dedicated function
2. Simplifying repetitive patterns with helper functions
3. Reducing nested conditionals
4. Consolidating similar node handlers

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

const BINARY_EXPRESSION_TYPES = new Set(["BinaryExpression", "LogicalExpression"]);
const ANONYMOUS_ASSIGN_OPERATORS = new Set(["=", "&&=", "||=", "??="]);
const CALL_APPLY_METHODS = new Set(["call", "apply"]);
const SAFELY_ENCLOSING_TYPES = new Set([
    "ArrayExpression", "ArrayPattern", "BlockStatement",
    "ObjectExpression", "ObjectPattern", "TemplateLiteral",
]);

//------------------------------------------------------------------------------
// Schema
//------------------------------------------------------------------------------

const schema = {
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
};

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Parses rule options into a normalized config object.
 * @param {Array} options Raw rule options.
 * @returns {object} Parsed configuration.
 */
function parseOptions(options) {
    const allNodes = options[0] !== "functions";
    const opts = (allNodes && options[1]) || {};

    const flag = (key) => allNodes && opts[key] === false;
    const value = (key) => allNodes && opts[key];

    return {
        ALL_NODES: allNodes,
        EXCEPT_COND_ASSIGN: flag("conditionalAssign"),
        EXCEPT_COND_TERNARY: flag("ternaryOperandBinaryExpressions"),
        NESTED_BINARY: flag("nestedBinaryExpressions"),
        EXCEPT_RETURN_ASSIGN: flag("returnAssign"),
        IGNORE_ARROW_CONDITIONALS: flag("enforceForArrowConditionals"),
        IGNORE_SEQUENCE_EXPRESSIONS: flag("enforceForSequenceExpressions"),
        IGNORE_NEW_IN_MEMBER_EXPR: flag("enforceForNewInMemberExpressions"),
        IGNORE_FUNCTION_PROTOTYPE_METHODS: flag("enforceForFunctionPrototypeMethods"),
        IGNORE_JSX: value("ignoreJSX"),
        ALLOW_PARENS_AFTER_COMMENT_PATTERN: value("allowParensAfterCommentPattern"),
    };
}

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
        schema,
        messages: {
            unexpected: "Unnecessary parentheses around expression.",
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const config = parseOptions(context.options);
        const {
            ALL_NODES, EXCEPT_COND_ASSIGN, EXCEPT_COND_TERNARY, NESTED_BINARY,
            EXCEPT_RETURN_ASSIGN, IGNORE_JSX, IGNORE_ARROW_CONDITIONALS,
            IGNORE_SEQUENCE_EXPRESSIONS, IGNORE_NEW_IN_MEMBER_EXPR,
            IGNORE_FUNCTION_PROTOTYPE_METHODS, ALLOW_PARENS_AFTER_COMMENT_PATTERN,
        } = config;

        const precedence = astUtils.getPrecedence;
        const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
        const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });

        const tokensToIgnore = new WeakSet();
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

        //----------------------------------------------------------------------
        // JSX rule applicability
        //----------------------------------------------------------------------

        function jsxRuleApplies(node) {
            const isSingleLine = node.loc.start.line === node.loc.end.line;

            switch (IGNORE_JSX) {
                case "all": return false;
                case "multi-line": return isSingleLine;
                case "single-line": return !isSingleLine;
                default: return true;
            }
        }

        //----------------------------------------------------------------------
        // Core rule applicability
        //----------------------------------------------------------------------

        function isImmediateFunctionPrototypeMethodCall(node) {
            const callNode = astUtils.skipChainExpression(node);
            if (callNode.type !== "CallExpression") return false;

            const callee = astUtils.skipChainExpression(callNode.callee);
            return (
                callee.type === "MemberExpression" &&
                callee.object.type === "FunctionExpression" &&
                CALL_APPLY_METHODS.has(astUtils.getStaticPropertyName(callee))
            );
        }

        function ruleApplies(node) {
            if (node.type === "JSXElement" || node.type === "JSXFragment") {
                return jsxRuleApplies(node);
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
            if (!ruleApplies(node) || !isParenthesised(node)) return false;
            return precedence(node) >= precedenceLowerLimit || isParenthesisedTwice(node);
        }

        function hasExcessParensNoLineTerminator(token, node) {
            return token.loc.end.line === node.loc.start.line
                ? hasExcessParens(node)
                : hasDoubleExcessParens(node);
        }

        //----------------------------------------------------------------------
        // Assignment / return exception helpers
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
            if (node.type === "AssignmentExpression") return true;
            if (
                node.type === "ConditionalExpression" &&
                (node.consequent.type === "AssignmentExpression" ||
                    node.alternate.type === "AssignmentExpression")
            ) return true;
            return (
                (node.left && node.left.type === "AssignmentExpression") ||
                (node.right && node.right.type === "AssignmentExpression")
            );
        }

        function isReturnAssignException(node) {
            if (!EXCEPT_RETURN_ASSIGN || !isInReturnStatement(node)) return false;

            if (node.type === "ReturnStatement") {
                return node.argument && containsAssignment(node.argument);
            }
            if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
                return containsAssignment(node.body);
            }
            return containsAssignment(node);
        }

        function isAnonymousFunctionAssignmentException({ left, operator, right }) {
            if (!left || left.type !== "Identifier" || !ANONYMOUS_ASSIGN_OPERATORS.has(operator)) {
                return false;
            }
            if (right.type === "ArrowFunctionExpression") return true;
            return (right.type === "FunctionExpression" || right.type === "ClassExpression") && !right.id;
        }

        //----------------------------------------------------------------------
        // Fix helpers
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

        function isFixable(node) {
            if (node.type !== "Literal" || typeof node.value !== "string") return true;
            if (isParenthesisedTwice(node)) return true;
            return !astUtils.isTopLevelExpressionStatement(node.parent);
        }

        function makeFixFunction(node, leftParenToken, rightParenToken) {
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

        function shouldSkipDueToComment(leftParenToken) {
            if (!ALLOW_PARENS_AFTER_COMMENT_PATTERN) return false;

            const comments = sourceCode.getCommentsBefore(leftParenToken);
            if (!comments.length) return false;

            const ignorePattern = new RegExp(ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
            return ignorePattern.test(comments[comments.length - 1].value);
        }

        function isIIFE(node) {
            const maybeCallNode = astUtils.skipChainExpression(node);
            return (
                maybeCallNode.type === "CallExpression" &&
                maybeCallNode.callee.type === "FunctionExpression"
            );
        }

        function report(node) {
            const leftParenToken = sourceCode.getTokenBefore(node);
            const rightParenToken = sourceCode.getTokenAfter(node);

            if (!isParenthesisedTwice(node)) {
                if (tokensToIgnore.has(sourceCode.getFirstToken(node))) return;
                if (isIIFE(node) && !isParenthesised(node.callee)) return;
                if (shouldSkipDueToComment(leftParenToken)) return;
            }

            function finishReport() {
                context.report({
                    node,
                    loc: leftParenToken.loc,
                    messageId: "unexpected",
                    fix: isFixable(node)
                        ? makeFixFunction(node, leftParenToken, rightParenToken)
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
        // Reports buffer management
        //----------------------------------------------------------------------

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

        //----------------------------------------------------------------------
        // Node-specific check helpers
        //----------------------------------------------------------------------

        function checkArgumentWithPrecedence(node) {
            if (hasExcessParensWithPrecedence(node.argument, precedence(node))) {
                report(node.argument);
            }
        }

        function doesMemberExpressionContainCallExpression(node) {
            let current = node.object;
            while (current.type === "MemberExpression") {
                current = current.object;
            }
            return current.type === "CallExpression";
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

        function checkCallNew(node) {
            const callee = node.callee;

            if (hasExcessParensWithPrecedence(callee, precedence(node))) {
                const isNewWithoutParens = callee.type === "NewExpression" && !isNewExpressionWithParens(callee);
                const nodeIsNewWithoutParens = node.type === "NewExpression" && !isNewExpressionWithParens(node);
                const isNewMemberWithCall =
                    node.type === "NewExpression" &&
                    callee.type === "MemberExpression" &&
                    doesMemberExpressionContainCallExpression(callee);
                const isOptionalChain = !node.optional && callee.type === "ChainExpression";

                const canSkip =
                    isIIFE(node) ||
                    (isNewWithoutParens && !nodeIsNewWithoutParens) ||
                    isNewMemberWithCall ||
                    isOptionalChain;

                if (hasDoubleExcessParens(callee) || !canSkip) {
                    report(callee);
                }
            }

            node.arguments
                .filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                .forEach(report);
        }

        function checkBinaryLogical(node) {
            const prec = precedence(node);
            const isExponentiation = node.operator === "**";

            const shouldSkipLeft = NESTED_BINARY && BINARY_EXPRESSION_TYPES.has(node.left.type);
            const shouldSkipRight = NESTED_BINARY && BINARY_EXPRESSION_TYPES.has(node.right.type);

            if (!shouldSkipLeft && hasExcessParens(node.left)) {
                const leftPrec = precedence(node.left);
                const isMixed = astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node);
                const isUnaryExponent = ["AwaitExpression", "UnaryExpression"].includes(node.left.type) && isExponentiation;

                if (
                    isParenthesisedTwice(node.left) ||
                    (!isUnaryExponent && !isMixed && (leftPrec > prec || (leftPrec === prec && !isExponentiation)))
                ) {
                    report(node.left);
                }
            }

            if (!shouldSkipRight && hasExcessParens(node.right)) {
                const rightPrec = precedence(node.right);
                const isMixed = astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node);

                if (
                    isParenthesisedTwice(node.right) ||
                    (!isMixed && (rightPrec > prec || (rightPrec === prec && isExponentiation)))
                ) {
                    report(node.right);
                }
            }
        }

        function checkClass(node) {
            if (!node.superClass) return;

            const hasExtraParens = precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
                ? hasExcessParens(node.superClass)
                : hasDoubleExcessParens(node.superClass);

            if (hasExtraParens) report(node.superClass);
        }

        function checkSpreadOperator(node) {
            if (hasExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                report(node.argument);
            }
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

            if (astUtils.isOpeningParenToken(firstToken) && secondToken) {
                const isBlock = astUtils.isOpeningBraceToken(secondToken);
                const isFunctionOrClass =
                    secondToken.type === "Keyword" &&
                    (secondToken.value === "function" ||
                        secondToken.value === "class" ||
                        (secondToken.value === "let" &&
                            tokenAfterClosingParens &&
                            (astUtils.isOpeningBracketToken(tokenAfterClosingParens) ||
                                tokenAfterClosingParens.type === "Identifier")));
                const isAsyncFunction =
                    secondToken.type === "Identifier" &&
                    secondToken.value === "async" &&
                    thirdToken &&
                    thirdToken.type === "Keyword" &&
                    thirdToken.value === "function";

                if (isBlock || isFunctionOrClass || isAsyncFunction) {
                    tokensToIgnore.add(secondToken);
                }
            }

            const hasExtraParens = node.parent.type === "ExportDefaultDeclaration"
                ? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                : hasExcessParens(node);

            if (hasExtraParens) report(node);
        }

        function isSafelyEnclosingInExpression(node, child) {
            if (SAFELY_ENCLOSING_TYPES.has(node.type)) return true;

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

        function isMemberExpInNewCallee(node) {
            if (node.type !== "MemberExpression") return false;
            if (node.parent.type === "NewExpression" && node.parent.callee === node) return true;
            return node.parent.object === node && isMemberExpInNewCallee(node.parent);
        }

        function handleForInitExit(node) {
            if (!reportsBuffer.reports.length) {
                endCurrentReportsBuffering();
                return;
            }

            reportsBuffer.inExpressionNodes.forEach(inExpressionNode => {
                const path = pathToDescendant(node, inExpressionNode);
                let nodeToExclude;

                for (let i = 0; i < path.length; i++) {
                    const pathNode = path[i];

                    if (i < path.length - 1) {
                        const nextPathNode = path[i + 1];
                        if (isSafelyEnclosingInExpression(pathNode, nextPathNode)) return;
                    }

                    if (!isParenthesised(pathNode)) continue;

                    if (!isInCurrentReportsBuffer(pathNode)) return; // safely enclosed by existing parens

                    if (isParenthesisedTwice(pathNode)) return; // one pair will remain after fix

                    if (!nodeToExclude) nodeToExclude = pathNode;
                }

                removeFromCurrentReportsBuffer(nodeToExclude);
            });

            endCurrentReportsBuffering();
        }

        function checkForLeftToken(node, allowBracketAfterLet) {
            if (node.left.type === "VariableDeclaration") return;

            const firstLeftToken = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
            if (firstLeftToken.value !== "let") return;

            if (!allowBracketAfterLet) {
                tokensToIgnore.add(firstLeftToken);
                return;
            }

            const nextToken = sourceCode.getTokenAfter(firstLeftToken, astUtils.isNotClosingParenToken);
            if (astUtils.isOpeningBracketToken(nextToken)) {
                tokensToIgnore.add(firstLeftToken);
            }
        }

        //----------------------------------------------------------------------
        // Return the visitor
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
                if (isReturnAssignException(node)) return;
                if (node.body.type === "ConditionalExpression" && IGNORE_ARROW_CONDITIONALS) return;
                if (node.body.type === "BlockStatement") return;

                const firstBodyToken = sourceCode.getFirstToken(node.body, astUtils.isNotOpeningParenToken);
                const tokenBeforeFirst = sourceCode.getTokenBefore(firstBodyToken);

                if (astUtils.isOpeningParenToken(tokenBeforeFirst) && astUtils.isOpeningBraceToken(firstBodyToken)) {
                    tokensToIgnore.add(firstBodyToken);
                }
                if (hasExcessParensWithPrecedence(node.body, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(node.body);
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

                if (!isReturnAssignException(node) && hasExcessParensWithPrecedence(node.right, precedence(node))) {
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
                if (isReturnAssignException(node)) return;

                const skipTernary = (child) => EXCEPT_COND_TERNARY && BINARY_EXPRESSION_TYPES.has(child.type);

                if (!skipTernary(node.test) && !isCondAssignException(node) &&
                    hasExcessParensWithPrecedence(node.test, precedence({ type: "LogicalExpression", operator: "||" }))
                ) {
                    report(node.test);
                }

                if (!skipTernary(node.consequent) &&
                    hasExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                ) {
                    report(node.consequent);
                }

                if (!skipTernary(node.alternate) &&
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

            ExportDefaultDeclaration: node => checkExpressionOrExportStatement(node.declaration),
            ExpressionStatement: node => checkExpressionOrExportStatement(node.expression),

            ForInStatement(node) {
                checkForLeftToken(node, true);
                if (hasExcessParens(node.left)) report(node.left);
                if (hasExcessParens(node.right)) report(node.right);
            },

            ForOfStatement(node) {
                checkForLeftToken(node, false);
                if (hasExcessParens(node.left)) report(node.left);
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
                    if (hasExcessParens(node.init)) report(node.init);
                }
            },

            "ForStatement > *.init:exit": handleForInitExit,

            IfStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            ImportExpression(node) {
                const { source } = node;
                if (source.type === "SequenceExpression") {
                    if (hasDoubleExcessParens(source)) report(source);
                } else if (hasExcessParens(source)) {
                    report(source);
                }
            },

            LogicalExpression: checkBinaryLogical,

            MemberExpression(node) {
                const shouldAllowWrapOnce =
                    isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);

                const nodeObjHasExcessParens = shouldAllowWrapOnce
                    ? hasDoubleExcessParens(node.object)
                    : hasExcessParens(node.object) &&
                      !(isImmediateFunctionPrototypeMethodCall(node.parent) &&
                          node.parent.callee === node &&
                          IGNORE_FUNCTION_PROTOTYPE_METHODS);

                if (nodeObjHasExcessParens) {
                    const obj = node.object;
                    const objPrec = precedence(obj);
                    const nodePrec = precedence(node);

                    const isDecimalOrRegex =
                        astUtils.isDecimalInteger(obj) ||
                        (obj.type === "Literal" && obj.regex);

                    if (
                        objPrec >= nodePrec &&
                        (node.computed || !isDecimalOrRegex)
                    ) {
                        report(obj);
                    } else if (obj.type === "CallExpression") {
                        report(obj);
                    } else if (!IGNORE_NEW_IN_MEMBER_EXPR && obj.type === "NewExpression" && isNewExpressionWithParens(obj)) {
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
                    .filter(p => p.value && hasExcessParensWithPrecedence(p.value, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                    .forEach(p => report(p.value));
            },

            ObjectPattern(node) {
                node.properties
                    .filter(p => canBeAssignmentTarget(p.value) && hasExcessParens(p.value))
                    .forEach(p => report(p.value));
            },

            Property(node) {
                if (node.computed && node.key &&
                    hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                ) {
                    report(node.key);
                }
            },

            PropertyDefinition(node) {
                if (node.computed && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(node.key);
                }
                if (node.value && hasExcessParensWithPrecedence(node.value, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                    report(node.value);
                }
            },

            RestElement(node) {
                if (canBeAssignmentTarget(node.argument) && hasExcessParens(node.argument)) {
                    report(node.argument);
                }
            },

            ReturnStatement(node) {
                if (isReturnAssignException(node)) return;

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
                if (node.test && hasExcessParens(node.test)) report(node.test);
            },

            SwitchStatement(node) {
                if (hasExcessParens(node.discriminant)) report(node.discriminant);
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
                if (hasExcessParens(node.object)) report(node.object);
            },

            YieldExpression(node) {
                if (!node.argument) return;

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

Key refactoring changes made:

1. **Extracted `parseOptions()`** — Centralized all option parsing with a `flag()` helper to eliminate 10+ repetitive `ALL_NODES && options[1] && options[1].x === false` patterns.

2. **Extracted `schema` constant** — Moved the large schema object out of `meta` for readability.

3. **Added top-level `Set` constants** — `BINARY_EXPRESSION_TYPES`, `ANONYMOUS_ASSIGN_OPERATORS`, `CALL_APPLY_METHODS`, `SAFELY_ENCLOSING_TYPES` replace repeated array literals and `.includes()` calls.

4. **Simplified `jsxRuleApplies()`** — Extracted JSX logic from `ruleApplies()` into its own function.

5. **Extracted `makeFixFunction()`** — Separated the fixer closure from `report()`.

6. **Extracted `shouldSkipDueToComment()`** — Pulled comment-pattern logic out of `report()`.

7. **Simplified `checkCallNew()`** — Named the boolean conditions for clarity.

8. **Extracted `handleForInitExit()`** — Pulled the complex `ForStatement > *.init:exit` handler into a named function.

9. **Extracted `checkForLeftToken()`** — Deduplicated the `let[` token-ignore logic shared by `ForInStatement` and `ForOfStatement`.

10. **Simplified `isSafelyEnclosingInExpression()`** — Used a `Set` for the simple type checks.
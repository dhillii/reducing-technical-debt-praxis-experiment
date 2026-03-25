# Refactoring Analysis

The code has several complexity issues:
1. **Repetitive option extraction** - Many similar `ALL_NODES && context.options[1] && ...` patterns
2. **Duplicated report-and-check patterns** - Many `if (hasExcess...) { report(...) }` pairs
3. **Long functions** with multiple responsibilities (`checkCallNew`, `checkBinaryLogical`, `report`)
4. **Repeated filter+forEach patterns** across node handlers
5. **Duplicated ForIn/ForOf logic**

```javascript
/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

const { isParenthesized: isParenthesizedRaw } = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

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

        // --- Option extraction helpers ---

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

        // --- Parenthesis detection ---

        function isParenthesised(node) {
            return isParenthesizedRaw(1, node, sourceCode);
        }

        function isParenthesisedTwice(node) {
            return isParenthesizedRaw(2, node, sourceCode);
        }

        // --- JSX rule applicability ---

        function jsxRuleApplies(node) {
            const isSingleLine = node.loc.start.line === node.loc.end.line;
            switch (IGNORE_JSX) {
                case "all": return false;
                case "multi-line": return isSingleLine;
                case "single-line": return !isSingleLine;
                default: return true;
            }
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
            return (
                ALL_NODES ||
                node.type === "FunctionExpression" ||
                node.type === "ArrowFunctionExpression"
            );
        }

        // --- Excess parens checks ---

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

        // --- Assignment / return helpers ---

        function isCondAssignException(node) {
            return EXCEPT_COND_ASSIGN && node.test.type === "AssignmentExpression";
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

        function containsAssignment(node) {
            if (node.type === "AssignmentExpression") return true;
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
            if (!left.type === "Identifier") return false;
            if (!["=", "&&=", "||=", "??="].includes(operator)) return false;
            const { type: rhsType, id } = right;
            return (
                rhsType === "ArrowFunctionExpression" ||
                ((rhsType === "FunctionExpression" || rhsType === "ClassExpression") && !id)
            );
        }

        // --- New expression helpers ---

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

        // --- Spacing helpers ---

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

        // --- Fixability ---

        function isFixable(node) {
            if (node.type !== "Literal" || typeof node.value !== "string") return true;
            if (isParenthesisedTwice(node)) return true;
            return !astUtils.isTopLevelExpressionStatement(node.parent);
        }

        // --- Comment pattern check ---

        function isAllowedByCommentPattern(leftParenToken) {
            if (!ALLOW_PARENS_AFTER_COMMENT_PATTERN) return false;
            const comments = sourceCode.getCommentsBefore(leftParenToken);
            if (!comments.length) return false;
            const ignorePattern = new RegExp(ALLOW_PARENS_AFTER_COMMENT_PATTERN, "u");
            return ignorePattern.test(comments[comments.length - 1].value);
        }

        // --- Reporting ---

        function buildFixer(node, leftParenToken, rightParenToken) {
            if (!isFixable(node)) return null;
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

        function report(node) {
            const leftParenToken = sourceCode.getTokenBefore(node);
            const rightParenToken = sourceCode.getTokenAfter(node);

            if (!isParenthesisedTwice(node)) {
                if (tokensToIgnore.has(sourceCode.getFirstToken(node))) return;
                if (isIIFE(node) && !isParenthesised(node.callee)) return;
                if (isAllowedByCommentPattern(leftParenToken)) return;
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

        function reportIfExcessParens(node) {
            if (hasExcessParens(node)) report(node);
        }

        function reportIfExcessParensWithPrecedence(node, prec) {
            if (hasExcessParensWithPrecedence(node, prec)) report(node);
        }

        // --- Node-specific checks ---

        function checkArgumentWithPrecedence(node) {
            reportIfExcessParensWithPrecedence(node.argument, precedence(node));
        }

        function doesMemberExpressionContainCallExpression(node) {
            let current = node.object;
            while (current.type === "MemberExpression") {
                current = current.object;
            }
            return current.type === "CallExpression";
        }

        function checkCallNew(node) {
            const callee = node.callee;

            if (hasExcessParensWithPrecedence(callee, precedence(node))) {
                const isExemptCallee =
                    !hasDoubleExcessParens(callee) &&
                    (isIIFE(node) ||
                        (callee.type === "NewExpression" &&
                            !isNewExpressionWithParens(callee) &&
                            !(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
                        (node.type === "NewExpression" &&
                            callee.type === "MemberExpression" &&
                            doesMemberExpressionContainCallExpression(callee)) ||
                        (!node.optional && callee.type === "ChainExpression"));

                if (!isExemptCallee) {
                    report(callee);
                }
            }

            node.arguments
                .filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                .forEach(report);
        }

        function checkBinaryLogicalSide(node, side, prec, isExponentiation) {
            const isBinaryOrLogical =
                side.type === "BinaryExpression" || side.type === "LogicalExpression";
            if (NESTED_BINARY && isBinaryOrLogical) return;
            if (!hasExcessParens(side)) return;

            const sidePrecedence = precedence(side);
            const isMixed = astUtils.isMixedLogicalAndCoalesceExpressions(side, node);

            const shouldReport =
                isParenthesisedTwice(side) ||
                (!isMixed &&
                    (side === node.left
                        ? !(["AwaitExpression", "UnaryExpression"].includes(side.type) && isExponentiation) &&
                          (sidePrecedence > prec || (sidePrecedence === prec && !isExponentiation))
                        : sidePrecedence > prec || (sidePrecedence === prec && isExponentiation)));

            if (shouldReport) report(side);
        }

        function checkBinaryLogical(node) {
            const prec = precedence(node);
            const isExponentiation = node.operator === "**";
            checkBinaryLogicalSide(node, node.left, prec, isExponentiation);
            checkBinaryLogicalSide(node, node.right, prec, isExponentiation);
        }

        function checkClass(node) {
            if (!node.superClass) return;
            const hasExtraParens =
                precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
                    ? hasExcessParens(node.superClass)
                    : hasDoubleExcessParens(node.superClass);
            if (hasExtraParens) report(node.superClass);
        }

        function checkSpreadOperator(node) {
            reportIfExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT_EXPR);
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

            if (astUtils.isOpeningParenToken(firstToken)) {
                const isAmbiguous =
                    astUtils.isOpeningBraceToken(secondToken) ||
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
                        thirdToken.value === "function");

                if (isAmbiguous) tokensToIgnore.add(secondToken);
            }

            const hasExtraParens =
                node.parent.type === "ExportDefaultDeclaration"
                    ? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                    : hasExcessParens(node);

            if (hasExtraParens) report(node);
        }

        // --- For-loop 'in' expression helpers ---

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

        // --- Reports buffering ---

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

                if (i < path.length - 1) {
                    if (isSafelyEnclosingInExpression(pathNode, path[i + 1])) return;
                }

                if (!isParenthesised(pathNode)) continue;

                if (!isInCurrentReportsBuffer(pathNode)) return; // safely enclosed by existing parens

                if (isParenthesisedTwice(pathNode)) return; // one pair will remain after fix

                if (!nodeToExclude) nodeToExclude = pathNode;
            }

            removeFromCurrentReportsBuffer(nodeToExclude);
        }

        // --- For-loop left-side 'let[' guard ---

        function guardLetBracket(leftNode, isForIn) {
            if (leftNode.type === "VariableDeclaration") return;
            const firstLeftToken = sourceCode.getFirstToken(
                leftNode,
                astUtils.isNotOpeningParenToken,
            );
            if (firstLeftToken.value !== "let") return;

            if (isForIn) {
                const nextToken = sourceCode.getTokenAfter(
                    firstLeftToken,
                    astUtils.isNotClosingParenToken,
                );
                if (astUtils.isOpeningBracketToken(nextToken)) {
                    tokensToIgnore.add(firstLeftToken);
                }
            } else {
                // ForOf: any `let` start is ambiguous
                tokensToIgnore.add(firstLeftToken);
            }
        }

        function isMemberExpInNewCallee(node) {
            if (node.type !== "MemberExpression") return false;
            if (node.parent.type === "NewExpression" && node.parent.callee === node) return true;
            return node.parent.object === node && isMemberExpInNewCallee(node.parent);
        }

        // --- Visitor ---

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
                reportIfExcessParensWithPrecedence(node.body, PRECEDENCE_OF_ASSIGNMENT_EXPR);
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
                if (isReturnAssignException(node)) return;

                const availableTypes = new Set(["BinaryExpression", "LogicalExpression"]);
                const skipTernary = type => EXCEPT_COND_TERNARY && availableTypes.has(type);

                if (
                    !skipTernary(node.test.type) &&
                    !isCondAssignException(node)
                ) {
                    reportIfExcessParensWithPrecedence(
                        node.test,
                        precedence({ type: "LogicalExpression", operator: "||" }),
                    );
                }
                if (!skipTernary(node.consequent.type)) {
                    reportIfExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR);
                }
                if (!skipTernary(node.alternate.type)) {
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
                guardLetBracket(node.left, true);
                reportIfExcessParens(node.left);
                reportIfExcessParens(node.right);
            },

            ForOfStatement(node) {
                guardLetBracket(node.left, false);
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
                        const firstToken = sourceCode.getFirstToken(
                            node.init,
                            astUtils.isNotOpeningParenToken,
                        );
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
                    if (hasDoubleExcessParens(source)) report(source);
                } else {
                    reportIfExcessParens(source);
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
                reportIfExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR);
            },

            NewExpression: checkCallNew,

            ObjectExpression(node) {
                node.properties
                    .filter(
                        p =>
                            p.value &&
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
                if (canBeAssignmentTarget(left) && hasExcessParens(left)) report(left);
                if (right) reportIfExcessParensWithPrecedence(right, PRECEDENCE_OF_ASSIGNMENT_EXPR);
            },
        };

        // --- Inline helper used in ReturnStatement ---
        function hasExcessParensNoLineTerminator(token, node) {
            if (token.loc.end.line === node.loc.start.line) return hasExcessParens(node);
            return hasDoubleExcessParens(node);
        }
    },
};
```

## Key Refactoring Changes

| Area | Before | After |
|------|--------|-------|
| **Option extraction** | 10× `ALL_NODES && context.options[1] && opts.x` | Single `const opts = (ALL_NODES && context.options[1]) \|\| {}` |
| **Report helpers** | Inline `if (hasExcess...) report(...)` everywhere | `reportIfExcessParens` / `reportIfExcessParensWithPrecedence` |
| **JSX handling** | `switch` inside `ruleApplies` | Extracted `jsxRuleApplies()` |
| **`checkBinaryLogical`** | One large function with duplicated left/right logic | Extracted `checkBinaryLogicalSide()` |
| **`report` function** | Inline fixer construction | Extracted `buildFixer()` and `isAllowedByCommentPattern()` |
| **ForIn/ForOf** | Duplicated `let[` guard logic | Extracted `guardLetBracket(node, isForIn)` |
| **`ForStatement > *.init:exit`** | Deeply nested loop | Extracted `processInExpressionNode()` |
| **`checkCallNew`** | Negated complex condition | Extracted `isExemptCallee` boolean |
| **`MemberExpression`** | Four separate `if (nodeObjHasExcessParens)` blocks | Collapsed into `if/else if` chain |
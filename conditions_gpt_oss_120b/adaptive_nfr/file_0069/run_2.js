/**
 * @fileoverview Disallow unnecessary parentheses.
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
                    message:
                        "ESLint Stylistic now maintains deprecated stylistic core rules.",
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
        messages: { unexpected: "Unnecessary parentheses around expression." },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const tokensToIgnore = new WeakSet();
        const precedence = astUtils.getPrecedence;

        const config = {
            allNodes: context.options[0] !== "functions",
            exceptCondAssign:
                context.options[1]?.conditionalAssign === false,
            exceptCondTernary:
                context.options[1]?.ternaryOperandBinaryExpressions === false,
            nestedBinary:
                context.options[1]?.nestedBinaryExpressions === false,
            exceptReturnAssign:
                context.options[1]?.returnAssign === false,
            ignoreJSX: context.options[1]?.ignoreJSX,
            ignoreArrowConditionals:
                context.options[1]?.enforceForArrowConditionals === false,
            ignoreSequenceExpressions:
                context.options[1]?.enforceForSequenceExpressions === false,
            ignoreNewInMemberExpr:
                context.options[1]?.enforceForNewInMemberExpressions === false,
            ignoreFunctionPrototypeMethods:
                context.options[1]?.enforceForFunctionPrototypeMethods === false,
            allowParensAfterCommentPattern:
                context.options[1]?.allowParensAfterCommentPattern,
        };

        const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({ type: "AssignmentExpression" });
        const PRECEDENCE_OF_UPDATE_EXPR = precedence({ type: "UpdateExpression" });

        let reportsBuffer;

        // ----------------------------------------------------------------------
        // Helper predicates (each single‑condition)
        // ----------------------------------------------------------------------

        /** @private */
        function isCallExpression(node) {
            return astUtils.skipChainExpression(node).type === "CallExpression";
        }

        /** @private */
        function isMemberExpression(node) {
            return node.type === "MemberExpression";
        }

        /** @private */
        function isFunctionExpression(node) {
            return node.type === "FunctionExpression";
        }

        /** @private */
        function isCallOrApply(node) {
            const callee = astUtils.skipChainExpression(node.callee);
            return (
                isMemberExpression(callee) &&
                isFunctionExpression(callee.object) &&
                ["call", "apply"].includes(astUtils.getStaticPropertyName(callee))
            );
        }

        /** @private */
        function isImmediateFunctionPrototypeMethodCall(node) {
            return isCallExpression(node) && isCallOrApply(node);
        }

        /** @private */
        function isJSX(node) {
            return node.type === "JSXElement" || node.type === "JSXFragment";
        }

        /** @private */
        function isSingleLine(node) {
            return node.loc.start.line === node.loc.end.line;
        }

        /** @private */
        function shouldIgnoreJSX(node) {
            if (!isJSX(node)) return false;
            const single = isSingleLine(node);
            switch (config.ignoreJSX) {
                case "all":
                    return true;
                case "multi-line":
                    return !single;
                case "single-line":
                    return single;
                default:
                    return false;
            }
        }

        /** @private */
        function isSequenceExpression(node) {
            return node.type === "SequenceExpression";
        }

        /** @private */
        function shouldIgnoreSequence(node) {
            return isSequenceExpression(node) && config.ignoreSequenceExpressions;
        }

        /** @private */
        function shouldIgnoreFunctionPrototype(node) {
            return isImmediateFunctionPrototypeMethodCall(node) && config.ignoreFunctionPrototypeMethods;
        }

        /** @private */
        function ruleApplies(node) {
            if (shouldIgnoreJSX(node)) return false;
            if (shouldIgnoreSequence(node)) return false;
            if (shouldIgnoreFunctionPrototype(node)) return false;
            return (
                config.allNodes ||
                node.type === "FunctionExpression" ||
                node.type === "ArrowFunctionExpression"
            );
        }

        /** @private */
        function isParenthesised(node) {
            return isParenthesizedRaw(1, node, sourceCode);
        }

        /** @private */
        function isParenthesisedTwice(node) {
            return isParenthesizedRaw(2, node, sourceCode);
        }

        /** @private */
        function hasExcessParens(node) {
            return ruleApplies(node) && isParenthesised(node);
        }

        /** @private */
        function hasDoubleExcessParens(node) {
            return ruleApplies(node) && isParenthesisedTwice(node);
        }

        /** @private */
        function hasExcessParensWithPrecedence(node, lower) {
            if (!ruleApplies(node) || !isParenthesised(node)) return false;
            return precedence(node) >= lower || isParenthesisedTwice(node);
        }

        /** @private */
        function isCondAssignException(node) {
            return config.exceptCondAssign && node.test?.type === "AssignmentExpression";
        }

        /** @private */
        function isInReturnStatement(node) {
            for (let cur = node; cur; cur = cur.parent) {
                if (
                    cur.type === "ReturnStatement" ||
                    (cur.type === "ArrowFunctionExpression" && cur.body.type !== "BlockStatement")
                ) {
                    return true;
                }
            }
            return false;
        }

        /** @private */
        function isReturnAssignException(node) {
            if (!config.exceptReturnAssign || !isInReturnStatement(node)) return false;
            if (node.type === "ReturnStatement") {
                return node.argument && containsAssignment(node.argument);
            }
            if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
                return containsAssignment(node.body);
            }
            return containsAssignment(node);
        }

        /** @private */
        function containsAssignment(node) {
            if (!node) return false;
            if (node.type === "AssignmentExpression") return true;
            if (node.type === "ConditionalExpression") {
                return (
                    node.consequent.type === "AssignmentExpression" ||
                    node.alternate.type === "AssignmentExpression"
                );
            }
            if (node.left?.type === "AssignmentExpression") return true;
            if (node.right?.type === "AssignmentExpression") return true;
            return false;
        }

        /** @private */
        function isNewExpressionWithParens(expr) {
            const last = sourceCode.getLastToken(expr);
            const beforeLast = sourceCode.getTokenBefore(last);
            return (
                expr.arguments.length > 0 ||
                (astUtils.isOpeningParenToken(beforeLast) &&
                    astUtils.isClosingParenToken(last) &&
                    expr.callee.range[1] < expr.range[1])
            );
        }

        /** @private */
        function canBeAssignmentTarget(node) {
            return node && (node.type === "Identifier" || node.type === "MemberExpression");
        }

        /** @private */
        function isFixable(node) {
            if (node.type !== "Literal" || typeof node.value !== "string") return true;
            if (isParenthesisedTwice(node)) return true;
            return !astUtils.isTopLevelExpressionStatement(node.parent);
        }

        /** @private */
        function requiresLeadingSpace(node) {
            const leftParen = sourceCode.getTokenBefore(node);
            const before = sourceCode.getTokenBefore(leftParen, { includeComments: true });
            const after = sourceCode.getTokenAfter(leftParen, { includeComments: true });
            return (
                before &&
                before.range[1] === leftParen.range[0] &&
                leftParen.range[1] === after.range[0] &&
                !astUtils.canTokensBeAdjacent(before, after)
            );
        }

        /** @private */
        function requiresTrailingSpace(node) {
            const [rightParen, afterRight] = sourceCode.getTokensAfter(node, { count: 2 });
            const beforeRight = sourceCode.getLastToken(node);
            return (
                rightParen &&
                afterRight &&
                !sourceCode.isSpaceBetween(rightParen, afterRight) &&
                !astUtils.canTokensBeAdjacent(beforeRight, afterRight)
            );
        }

        /** @private */
        function isIIFE(node) {
            const call = astUtils.skipChainExpression(node);
            return call.type === "CallExpression" && call.callee.type === "FunctionExpression";
        }

        /** @private */
        function report(node) {
            const leftParen = sourceCode.getTokenBefore(node);
            const rightParen = sourceCode.getTokenAfter(node);

            if (!isParenthesisedTwice(node) && tokensToIgnore.has(sourceCode.getFirstToken(node))) return;
            if (isIIFE(node) && !isParenthesised(node.callee)) return;

            if (config.allowParensAfterCommentPattern) {
                const comments = sourceCode.getCommentsBefore(leftParen);
                if (comments.length) {
                    const pattern = new RegExp(config.allowParensAfterCommentPattern, "u");
                    if (pattern.test(comments[comments.length - 1].value)) return;
                }
            }

            const finish = () => {
                context.report({
                    node,
                    loc: leftParen.loc,
                    messageId: "unexpected",
                    fix: isFixable(node)
                        ? fixer => {
                              const inner = sourceCode.text.slice(leftParen.range[1], rightParen.range[0]);
                              return fixer.replaceTextRange(
                                  [leftParen.range[0], rightParen.range[1]],
                                  (requiresLeadingSpace(node) ? " " : "") +
                                      inner +
                                      (requiresTrailingSpace(node) ? " " : "")
                              );
                          }
                        : null,
                });
            };

            if (reportsBuffer) {
                reportsBuffer.reports.push({ node, finishReport: finish });
                return;
            }
            finish();
        }

        /** @private */
        function checkArgumentWithPrecedence(node) {
            if (hasExcessParensWithPrecedence(node.argument, precedence(node))) {
                report(node.argument);
            }
        }

        /** @private */
        function doesMemberExpressionContainCallExpression(node) {
            let cur = node.object;
            while (cur.type === "MemberExpression") {
                cur = cur.object;
            }
            return cur.type === "CallExpression";
        }

        /** @private */
        function checkCallNew(node) {
            const callee = node.callee;
            if (hasExcessParensWithPrecedence(callee, precedence(node))) {
                const double = hasDoubleExcessParens(callee);
                const allowed =
                    isIIFE(node) ||
                    (callee.type === "NewExpression" &&
                        !isNewExpressionWithParens(callee) &&
                        !(node.type === "NewExpression" && !isNewExpressionWithParens(node))) ||
                    (node.type === "NewExpression" &&
                        callee.type === "MemberExpression" &&
                        doesMemberExpressionContainCallExpression(callee)) ||
                    (!node.optional && callee.type === "ChainExpression");
                if (double || !allowed) {
                    report(node.callee);
                }
            }
            node.arguments
                .filter(arg => hasExcessParensWithPrecedence(arg, PRECEDENCE_OF_ASSIGNMENT_EXPR))
                .forEach(report);
        }

        /** @private */
        function checkBinaryLogical(node) {
            const prec = precedence(node);
            const leftPrec = precedence(node.left);
            const rightPrec = precedence(node.right);
            const isExp = node.operator === "**";

            const skipLeft = config.nestedBinary && ["BinaryExpression", "LogicalExpression"].includes(node.left.type);
            const skipRight = config.nestedBinary && ["BinaryExpression", "LogicalExpression"].includes(node.right.type);

            if (!skipLeft && hasExcessParens(node.left)) {
                const leftCond =
                    !(
                        ["AwaitExpression", "UnaryExpression"].includes(node.left.type) && isExp
                    ) &&
                    !astUtils.isMixedLogicalAndCoalesceExpressions(node.left, node) &&
                    (leftPrec > prec || (leftPrec === prec && !isExp));
                if (leftCond || isParenthesisedTwice(node.left)) {
                    report(node.left);
                }
            }

            if (!skipRight && hasExcessParens(node.right)) {
                const rightCond =
                    !astUtils.isMixedLogicalAndCoalesceExpressions(node.right, node) &&
                    (rightPrec > prec || (rightPrec === prec && isExp));
                if (rightCond || isParenthesisedTwice(node.right)) {
                    report(node.right);
                }
            }
        }

        /** @private */
        function checkClass(node) {
            if (!node.superClass) return;
            const extra =
                precedence(node.superClass) > PRECEDENCE_OF_UPDATE_EXPR
                    ? hasExcessParens(node.superClass)
                    : hasDoubleExcessParens(node.superClass);
            if (extra) report(node.superClass);
        }

        /** @private */
        function checkSpreadOperator(node) {
            if (hasExcessParensWithPrecedence(node.argument, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
                report(node.argument);
            }
        }

        /** @private */
        function checkExpressionOrExportStatement(node) {
            const first = isParenthesised(node) ? sourceCode.getTokenBefore(node) : sourceCode.getFirstToken(node);
            const second = sourceCode.getTokenAfter(first, astUtils.isNotOpeningParenToken);
            const third = second ? sourceCode.getTokenAfter(second) : null;
            const afterClose = second
                ? sourceCode.getTokenAfter(second, astUtils.isNotClosingParenToken)
                : null;

            if (
                astUtils.isOpeningParenToken(first) &&
                (astUtils.isOpeningBraceToken(second) ||
                    (second.type === "Keyword" &&
                        ["function", "class"].includes(second.value)) ||
                    (second.type === "Keyword" && second.value === "let" && afterClose && (astUtils.isOpeningBracketToken(afterClose) || afterClose.type === "Identifier")) ||
                    (second && second.type === "Identifier" && second.value === "async" && third && third.type === "Keyword" && third.value === "function"))
            ) {
                tokensToIgnore.add(second);
            }

            const extra =
                node.parent.type === "ExportDefaultDeclaration"
                    ? hasExcessParensWithPrecedence(node, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                    : hasExcessParens(node);
            if (extra) report(node);
        }

        /** @private */
        function startBuffer() {
            reportsBuffer = { upper: reportsBuffer, inExpressionNodes: [], reports: [] };
        }

        /** @private */
        function endBuffer() {
            const { upper, inExpressionNodes, reports } = reportsBuffer;
            if (upper) {
                upper.inExpressionNodes.push(...inExpressionNodes);
                upper.reports.push(...reports);
            } else {
                reports.forEach(r => r.finishReport());
            }
            reportsBuffer = upper;
        }

        /** @private */
        function isInCurrentBuffer(node) {
            return reportsBuffer.reports.some(r => r.node === node);
        }

        /** @private */
        function removeFromCurrentBuffer(node) {
            reportsBuffer.reports = reportsBuffer.reports.filter(r => r.node !== node);
        }

        /** @private */
        function isMemberExpInNewCallee(node) {
            if (node.type !== "MemberExpression") return false;
            if (node.parent.type === "NewExpression" && node.parent.callee === node) return true;
            if (node.parent.object === node) return isMemberExpInNewCallee(node.parent);
            return false;
        }

        /** @private */
        function isAnonymousFunctionAssignmentException({ left, operator, right }) {
            if (left.type !== "Identifier") return false;
            if (!["=", "&&=", "||=", "??="].includes(operator)) return false;
            if (right.type === "ArrowFunctionExpression") return true;
            if ((right.type === "FunctionExpression" || right.type === "ClassExpression") && !right.id) return true;
            return false;
        }

        // ----------------------------------------------------------------------
        // Visitor definitions (each shallow)
        // ----------------------------------------------------------------------
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
                if (node.body.type === "ConditionalExpression" && config.ignoreArrowConditionals) return;

                if (node.body.type !== "BlockStatement") {
                    const firstBody = sourceCode.getFirstToken(node.body, astUtils.isNotOpeningParenToken);
                    const beforeFirst = sourceCode.getTokenBefore(firstBody);
                    if (astUtils.isOpeningParenToken(beforeFirst) && astUtils.isOpeningBraceToken(firstBody)) {
                        tokensToIgnore.add(firstBody);
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

                const binaryOrLogical = new Set(["BinaryExpression", "LogicalExpression"]);

                if (
                    !(config.exceptCondTernary && binaryOrLogical.has(node.test.type)) &&
                    !isCondAssignException(node) &&
                    hasExcessParensWithPrecedence(
                        node.test,
                        precedence({ type: "LogicalExpression", operator: "||" })
                    )
                ) {
                    report(node.test);
                }

                if (
                    !(config.exceptCondTernary && binaryOrLogical.has(node.consequent.type)) &&
                    hasExcessParensWithPrecedence(node.consequent, PRECEDENCE_OF_ASSIGNMENT_EXPR)
                ) {
                    report(node.consequent);
                }

                if (
                    !(config.exceptCondTernary && binaryOrLogical.has(node.alternate.type)) &&
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

            ExportDefaultDeclaration(node) {
                checkExpressionOrExportStatement(node.declaration);
            },

            ExpressionStatement(node) {
                checkExpressionOrExportStatement(node.expression);
            },

            ForInStatement(node) {
                if (node.left.type !== "VariableDeclaration") {
                    const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
                    if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
                        tokensToIgnore.add(first);
                    }
                }
                if (hasExcessParens(node.left)) report(node.left);
                if (hasExcessParens(node.right)) report(node.right);
            },

            ForOfStatement(node) {
                if (node.left.type !== "VariableDeclaration") {
                    const first = sourceCode.getFirstToken(node.left, astUtils.isNotOpeningParenToken);
                    if (first.value === "let") tokensToIgnore.add(first);
                }
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
                        const first = sourceCode.getFirstToken(node.init, astUtils.isNotOpeningParenToken);
                        if (first.value === "let" && astUtils.isOpeningBracketToken(sourceCode.getTokenAfter(first, astUtils.isNotClosingParenToken))) {
                            tokensToIgnore.add(first);
                        }
                    }
                    startBuffer();
                    if (hasExcessParens(node.init)) report(node.init);
                }
            },

            "ForStatement > *.init:exit"(node) {
                if (reportsBuffer.reports.length) {
                    reportsBuffer.inExpressionNodes.forEach(inNode => {
                        const path = pathToDescendant(node, inNode);
                        let exclude;
                        for (let i = 0; i < path.length; i++) {
                            const cur = path[i];
                            const next = path[i + 1];
                            if (i < path.length - 1 && next && isSafelyEnclosingInExpression(cur, next)) {
                                return;
                            }
                            if (isParenthesised(cur) && isInCurrentBuffer(cur)) {
                                if (isParenthesisedTwice(cur)) return;
                                if (!exclude) exclude = cur;
                            } else if (isParenthesised(cur)) {
                                return;
                            }
                        }
                        if (exclude) removeFromCurrentBuffer(exclude);
                    });
                }
                endBuffer();
            },

            IfStatement(node) {
                if (hasExcessParens(node.test) && !isCondAssignException(node)) {
                    report(node.test);
                }
            },

            ImportExpression(node) {
                const src = node.source;
                if (src.type === "SequenceExpression") {
                    if (hasDoubleExcessParens(src)) report(src);
                } else if (hasExcessParens(src)) {
                    report(src);
                }
            },

            LogicalExpression: checkBinaryLogical,

            MemberExpression(node) {
                const allowWrapOnce = isMemberExpInNewCallee(node) && doesMemberExpressionContainCallExpression(node);
                const objHasExcess = allowWrapOnce
                    ? hasDoubleExcessParens(node.object)
                    : hasExcessParens(node.object) &&
                      !(isImmediateFunctionPrototypeMethodCall(node.parent) && node.parent.callee === node && config.ignoreFunctionPrototypeMethods);

                if (
                    objHasExcess &&
                    precedence(node.object) >= precedence(node) &&
                    (node.computed ||
                        !(astUtils.isDecimalInteger(node.object) || (node.object.type === "Literal" && node.object.regex)))
                ) {
                    report(node.object);
                }

                if (objHasExcess && node.object.type === "CallExpression") {
                    report(node.object);
                }

                if (objHasExcess && !config.ignoreNewInMemberExpr && node.object.type === "NewExpression" && isNewExpressionWithParens(node.object)) {
                    report(node.object);
                }

                if (objHasExcess && node.optional && node.object.type === "ChainExpression") {
                    report(node.object);
                }

                if (node.computed && hasExcessParens(node.property)) {
                    report(node.property);
                }
            },

            "MethodDefinition[computed=true]": function (node) {
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
                if (node.computed && node.key && hasExcessParensWithPrecedence(node.key, PRECEDENCE_OF_ASSIGNMENT_EXPR)) {
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
                const arg = node.argument;
                if (canBeAssignmentTarget(arg) && hasExcessParens(arg)) {
                    report(arg);
                }
            },

            ReturnStatement(node) {
                if (isReturnAssignException(node)) return;
                const token = sourceCode.getFirstToken(node);
                if (node.argument && hasExcessParensNoLineTerminator(token, node.argument) && !(node.argument.type === "Literal" && node.argument.regex)) {
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
                const token = sourceCode.getFirstToken(node);
                if (hasExcessParensNoLineTerminator(token, node.argument)) {
                    report(node.argument);
                }
            },

            UnaryExpression: checkArgumentWithPrecedence,

            UpdateExpression(node) {
                if (node.prefix) {
                    checkArgumentWithPrecedence(node);
                } else {
                    const { argument } = node;
                    const opToken = sourceCode.getLastToken(node);
                    if (argument.loc.end.line === opToken.loc.start.line) {
                        checkArgumentWithPrecedence(node);
                    } else if (hasDoubleExcessParens(argument)) {
                        report(argument);
                    }
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
                if (!node.argument) return;
                const token = sourceCode.getFirstToken(node);
                const cond1 = precedence(node.argument) >= precedence(node) && hasExcessParensNoLineTerminator(token, node.argument);
                const cond2 = hasDoubleExcessParens(node.argument);
                if (cond1 || cond2) {
                    report(node.argument);
                }
            },

            ClassDeclaration: checkClass,
            ClassExpression: checkClass,

            SpreadElement: checkSpreadOperator,
            SpreadProperty: checkSpreadOperator,
            ExperimentalSpreadProperty: checkSpreadOperator,

            TemplateLiteral(node) {
                node.expressions
                    .filter(e => e && hasExcessParens(e))
                    .forEach(report);
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
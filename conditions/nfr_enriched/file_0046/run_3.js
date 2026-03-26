# Refactored Code

Here's the refactored version with reduced complexity through several strategies:

1. **Extracted option parsing** into a dedicated function
2. **Eliminated repetitive patterns** with helper functions
3. **Simplified conditional chains** using early returns and lookup tables
4. **Extracted duplicated parameter-checking logic** into a reusable function
5. **Simplified `isOuterIIFE`** unary operator check

```javascript
"use strict";

const astUtils = require("./utils/ast-utils");

/* c8 ignore next */
/** @type {import('../types').Rule.RuleModule} */
module.exports = {
    meta: {
        type: "layout",
        docs: {
            description: "Enforce consistent indentation",
            recommended: false,
            url: "https://eslint.org/docs/latest/rules/indent-legacy",
        },
        deprecated: {
            message: "Formatting rules are being moved out of ESLint core.",
            url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
            deprecatedSince: "4.0.0",
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
                        name: "indent",
                        url: "https://eslint.style/rules/indent",
                    },
                },
            ],
        },
        fixable: "whitespace",
        schema: [
            {
                oneOf: [{ enum: ["tab"] }, { type: "integer", minimum: 0 }],
            },
            {
                type: "object",
                properties: {
                    SwitchCase: { type: "integer", minimum: 0 },
                    VariableDeclarator: {
                        oneOf: [
                            { type: "integer", minimum: 0 },
                            {
                                type: "object",
                                properties: {
                                    var: { type: "integer", minimum: 0 },
                                    let: { type: "integer", minimum: 0 },
                                    const: { type: "integer", minimum: 0 },
                                },
                            },
                        ],
                    },
                    outerIIFEBody: { type: "integer", minimum: 0 },
                    MemberExpression: { type: "integer", minimum: 0 },
                    FunctionDeclaration: {
                        type: "object",
                        properties: {
                            parameters: {
                                oneOf: [
                                    { type: "integer", minimum: 0 },
                                    { enum: ["first"] },
                                ],
                            },
                            body: { type: "integer", minimum: 0 },
                        },
                    },
                    FunctionExpression: {
                        type: "object",
                        properties: {
                            parameters: {
                                oneOf: [
                                    { type: "integer", minimum: 0 },
                                    { enum: ["first"] },
                                ],
                            },
                            body: { type: "integer", minimum: 0 },
                        },
                    },
                    CallExpression: {
                        type: "object",
                        properties: {
                            parameters: {
                                oneOf: [
                                    { type: "integer", minimum: 0 },
                                    { enum: ["first"] },
                                ],
                            },
                        },
                    },
                    ArrayExpression: {
                        oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
                    },
                    ObjectExpression: {
                        oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            expected: "Expected indentation of {{expected}} but found {{actual}}.",
        },
    },

    create(context) {
        const DEFAULT_VARIABLE_INDENT = 1;
        const DEFAULT_PARAMETER_INDENT = null;
        const DEFAULT_FUNCTION_BODY_INDENT = 1;

        const { indentSize, indentType, options } = parseOptions(
            context.options,
            DEFAULT_VARIABLE_INDENT,
            DEFAULT_PARAMETER_INDENT,
            DEFAULT_FUNCTION_BODY_INDENT,
        );

        const sourceCode = context.sourceCode;
        const caseIndentStore = {};

        // -------------------------------------------------------------------------
        // Option Parsing
        // -------------------------------------------------------------------------

        function parseOptions(contextOptions, defaultVarIndent, defaultParamIndent, defaultBodyIndent) {
            let indentSize = 4;
            let indentType = "space";

            const options = {
                SwitchCase: 0,
                VariableDeclarator: {
                    var: defaultVarIndent,
                    let: defaultVarIndent,
                    const: defaultVarIndent,
                },
                outerIIFEBody: null,
                FunctionDeclaration: {
                    parameters: defaultParamIndent,
                    body: defaultBodyIndent,
                },
                FunctionExpression: {
                    parameters: defaultParamIndent,
                    body: defaultBodyIndent,
                },
                CallExpression: {
                    arguments: defaultParamIndent,
                },
                ArrayExpression: 1,
                ObjectExpression: 1,
            };

            if (!contextOptions.length) {
                return { indentSize, indentType, options };
            }

            if (contextOptions[0] === "tab") {
                indentSize = 1;
                indentType = "tab";
            } /* c8 ignore start */ else if (typeof contextOptions[0] === "number") {
                indentSize = contextOptions[0];
                indentType = "space";
            } /* c8 ignore stop */

            if (contextOptions[1]) {
                applyUserOptions(options, contextOptions[1]);
            }

            return { indentSize, indentType, options };
        }

        function applyUserOptions(options, opts) {
            options.SwitchCase = opts.SwitchCase || 0;

            const varDeclarator = opts.VariableDeclarator;
            if (typeof varDeclarator === "number") {
                options.VariableDeclarator = {
                    var: varDeclarator,
                    let: varDeclarator,
                    const: varDeclarator,
                };
            } else if (typeof varDeclarator === "object") {
                Object.assign(options.VariableDeclarator, varDeclarator);
            }

            const numberOptionKeys = ["outerIIFEBody", "MemberExpression"];
            for (const key of numberOptionKeys) {
                if (typeof opts[key] === "number") {
                    options[key] = opts[key];
                }
            }

            const objectOptionKeys = ["FunctionDeclaration", "FunctionExpression", "CallExpression"];
            for (const key of objectOptionKeys) {
                if (typeof opts[key] === "object") {
                    Object.assign(options[key], opts[key]);
                }
            }

            const mixedOptionKeys = ["ArrayExpression", "ObjectExpression"];
            for (const key of mixedOptionKeys) {
                if (typeof opts[key] === "number" || typeof opts[key] === "string") {
                    options[key] = opts[key];
                }
            }
        }

        // -------------------------------------------------------------------------
        // Error Reporting
        // -------------------------------------------------------------------------

        function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
            const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
            const foundStatement = buildFoundStatement(actualSpaces, actualTabs);

            return { expected: expectedStatement, actual: foundStatement };
        }

        function buildFoundStatement(actualSpaces, actualTabs) {
            const spacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
            const tabsWord = `tab${actualTabs === 1 ? "" : "s"}`;

            if (actualSpaces > 0 && actualTabs > 0) {
                return `${actualSpaces} ${spacesWord} and ${actualTabs} ${tabsWord}`;
            }
            if (actualSpaces > 0) {
                return indentType === "space" ? actualSpaces : `${actualSpaces} ${spacesWord}`;
            }
            if (actualTabs > 0) {
                return indentType === "tab" ? actualTabs : `${actualTabs} ${tabsWord}`;
            }
            return "0";
        }

        function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
            if (gottenSpaces && gottenTabs) {
                return;
            }

            const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
            const baseRange = isLastNodeCheck
                ? node.range[1] - node.loc.end.column
                : node.range[0] - node.loc.start.column;
            const textRange = [baseRange, baseRange + gottenSpaces + gottenTabs];

            context.report({
                node,
                loc,
                messageId: "expected",
                data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
                fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
            });
        }

        // -------------------------------------------------------------------------
        // Indent Measurement
        // -------------------------------------------------------------------------

        function getNodeIndent(node, byLastLine) {
            const token = byLastLine
                ? sourceCode.getLastToken(node)
                : sourceCode.getFirstToken(node);
            const srcCharsBeforeNode = sourceCode
                .getText(token, token.loc.start.column)
                .split("");
            const indentChars = srcCharsBeforeNode.slice(
                0,
                srcCharsBeforeNode.findIndex(char => char !== " " && char !== "\t"),
            );
            const spaces = indentChars.filter(char => char === " ").length;
            const tabs = indentChars.filter(char => char === "\t").length;

            return {
                space: spaces,
                tab: tabs,
                goodChar: indentType === "space" ? spaces : tabs,
                badChar: indentType === "space" ? tabs : spaces,
            };
        }

        function isNodeFirstInLine(node, byEndLocation) {
            const firstToken = byEndLocation === true
                ? sourceCode.getLastToken(node, 1)
                : sourceCode.getTokenBefore(node);
            const startLine = byEndLocation === true ? node.loc.end.line : node.loc.start.line;
            const endLine = firstToken ? firstToken.loc.end.line : -1;

            return startLine !== endLine;
        }

        // -------------------------------------------------------------------------
        // Indent Checking
        // -------------------------------------------------------------------------

        function checkNodeIndent(node, neededIndent) {
            const actualIndent = getNodeIndent(node, false);
            const isArrayOrObject = node.type === "ArrayExpression" || node.type === "ObjectExpression";

            if (
                !isArrayOrObject &&
                (actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
                isNodeFirstInLine(node)
            ) {
                report(node, neededIndent, actualIndent.space, actualIndent.tab);
            }

            checkNodeIndentSpecialCases(node, neededIndent);
        }

        function checkNodeIndentSpecialCases(node, neededIndent) {
            if (node.type === "IfStatement" && node.alternate) {
                const elseToken = sourceCode.getTokenBefore(node.alternate);
                checkNodeIndent(elseToken, neededIndent);
                if (!isNodeFirstInLine(node.alternate)) {
                    checkNodeIndent(node.alternate, neededIndent);
                }
            }

            if (node.type === "TryStatement" && node.handler) {
                checkNodeIndent(sourceCode.getFirstToken(node.handler), neededIndent);
            }

            if (node.type === "TryStatement" && node.finalizer) {
                checkNodeIndent(sourceCode.getTokenBefore(node.finalizer), neededIndent);
            }

            if (node.type === "DoWhileStatement") {
                checkNodeIndent(sourceCode.getTokenAfter(node.body), neededIndent);
            }
        }

        function checkNodesIndent(nodes, indent) {
            nodes.forEach(node => checkNodeIndent(node, indent));
        }

        function checkLastNodeLineIndent(node, lastLineIndent) {
            const lastToken = sourceCode.getLastToken(node);
            const endIndent = getNodeIndent(lastToken, true);

            if (
                (endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
                isNodeFirstInLine(node, true)
            ) {
                report(
                    node,
                    lastLineIndent,
                    endIndent.space,
                    endIndent.tab,
                    { line: lastToken.loc.start.line, column: lastToken.loc.start.column },
                    true,
                );
            }
        }

        function checkLastReturnStatementLineIndent(node, firstLineIndent) {
            const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
            const textBeforeClosingParen = sourceCode
                .getText(lastToken, lastToken.loc.start.column)
                .slice(0, -1);

            if (textBeforeClosingParen.trim()) {
                return;
            }

            const endIndent = getNodeIndent(lastToken, true);

            if (endIndent.goodChar !== firstLineIndent) {
                report(
                    node,
                    firstLineIndent,
                    endIndent.space,
                    endIndent.tab,
                    { line: lastToken.loc.start.line, column: lastToken.loc.start.column },
                    true,
                );
            }
        }

        function checkFirstNodeLineIndent(node, firstLineIndent) {
            const startIndent = getNodeIndent(node, false);

            if (
                (startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
                isNodeFirstInLine(node)
            ) {
                report(node, firstLineIndent, startIndent.space, startIndent.tab, {
                    line: node.loc.start.line,
                    column: node.loc.start.column,
                });
            }
        }

        // -------------------------------------------------------------------------
        // Node Utilities
        // -------------------------------------------------------------------------

        function getParentNodeByType(node, type, stopAtList) {
            let parent = node.parent;
            const stopAtSet = new Set(stopAtList || ["Program"]);

            while (
                parent.type !== type &&
                !stopAtSet.has(parent.type) &&
                parent.type !== "Program"
            ) {
                parent = parent.parent;
            }

            return parent.type === type ? parent : null;
        }

        function getVariableDeclaratorNode(node) {
            return getParentNodeByType(node, "VariableDeclarator");
        }

        function isNodeInVarOnTop(node, varNode) {
            return (
                varNode &&
                varNode.parent.loc.start.line === node.loc.start.line &&
                varNode.parent.declarations.length > 1
            );
        }

        function isArgBeforeCalleeNodeMultiline(node) {
            const parent = node.parent;

            if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
                return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
            }
            return false;
        }

        const OUTER_IIFE_UNARY_OPERATORS = new Set(["!", "~", "+", "-"]);
        const OUTER_IIFE_ANCESTOR_TYPES = new Set([
            "AssignmentExpression",
            "LogicalExpression",
            "SequenceExpression",
            "VariableDeclarator",
        ]);

        function isOuterIIFE(node) {
            const parent = node.parent;

            if (parent.type !== "CallExpression" || parent.callee !== node) {
                return false;
            }

            let stmt = parent.parent;

            while (
                (stmt.type === "UnaryExpression" && OUTER_IIFE_UNARY_OPERATORS.has(stmt.operator)) ||
                OUTER_IIFE_ANCESTOR_TYPES.has(stmt.type)
            ) {
                stmt = stmt.parent;
            }

            return (
                (stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
                stmt.parent?.type === "Program"
            );
        }

        function isSingleLineNode(node) {
            const lastToken = sourceCode.getLastToken(node);
            return node.loc.start.line === lastToken.loc.end.line;
        }

        function isNodeBodyBlock(node) {
            return (
                node.type === "BlockStatement" ||
                node.type === "ClassBody" ||
                node.body?.type === "BlockStatement" ||
                node.consequent?.type === "BlockStatement"
            );
        }

        // -------------------------------------------------------------------------
        // Block Indent Checking
        // -------------------------------------------------------------------------

        function getFunctionBlockIndent(calleeNode) {
            const useLastToken =
                calleeNode.parent?.type === "Property" ||
                calleeNode.parent?.type === "ArrayExpression";

            return getNodeIndent(calleeNode, useLastToken).goodChar;
        }

        function adjustIndentForCallExpression(calleeNode, node, indent) {
            const calleeParent = calleeNode.parent;
            const isFunctionType =
                calleeNode.type === "FunctionExpression" ||
                calleeNode.type === "ArrowFunctionExpression";

            if (!isFunctionType) {
                if (calleeParent?.loc.start.line < node.loc.start.line) {
                    return getNodeIndent(calleeParent).goodChar;
                }
            } else if (
                isArgBeforeCalleeNodeMultiline(calleeNode) &&
                calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
                !isNodeFirstInLine(calleeNode)
            ) {
                return getNodeIndent(calleeParent).goodChar;
            }

            return indent;
        }

        function getFunctionOffset(calleeNode) {
            if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
                return options.outerIIFEBody * indentSize;
            }
            if (calleeNode.type === "FunctionExpression") {
                return options.FunctionExpression.body * indentSize;
            }
            if (calleeNode.type === "FunctionDeclaration") {
                return options.FunctionDeclaration.body * indentSize;
            }
            return indentSize;
        }

        function checkIndentInFunctionBlock(node) {
            const calleeNode = node.parent;
            let indent = getFunctionBlockIndent(calleeNode);

            if (calleeNode.parent?.type === "CallExpression") {
                indent = adjustIndentForCallExpression(calleeNode, node, indent);
            }

            const functionOffset = getFunctionOffset(calleeNode);
            indent += functionOffset;

            const parentVarNode = getVariableDeclaratorNode(node);
            if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
                indent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            }

            if (node.body.length > 0) {
                checkNodesIndent(node.body, indent);
            }

            checkLastNodeLineIndent(node, indent - functionOffset);
        }

        const BLOCK_STATEMENT_PARENTS = new Set([
            "IfStatement",
            "WhileStatement",
            "ForStatement",
            "ForInStatement",
            "ForOfStatement",
            "DoWhileStatement",
            "ClassDeclaration",
            "TryStatement",
        ]);

        function getBlockIndent(node) {
            if (node.parent && BLOCK_STATEMENT_PARENTS.has(node.parent.type) && isNodeBodyBlock(node)) {
                return getNodeIndent(node.parent).goodChar;
            }
            if (node.parent?.type === "CatchClause") {
                return getNodeIndent(node.parent.parent).goodChar;
            }
            return getNodeIndent(node).goodChar;
        }

        function blockIndentationCheck(node) {
            if (isSingleLineNode(node)) {
                return;
            }

            if (
                node.parent?.type === "FunctionExpression" ||
                node.parent?.type === "FunctionDeclaration" ||
                node.parent?.type === "ArrowFunctionExpression"
            ) {
                checkIndentInFunctionBlock(node);
                return;
            }

            const indent = getBlockIndent(node);

            let nodesToCheck;
            if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
                nodesToCheck = [node.consequent];
            } else if (Array.isArray(node.body)) {
                nodesToCheck = node.body;
            } else {
                nodesToCheck = [node.body];
            }

            if (nodesToCheck.length > 0) {
                checkNodesIndent(nodesToCheck, indent + indentSize);
            }

            if (node.type === "BlockStatement") {
                checkLastNodeLineIndent(node, indent);
            }
        }

        // -------------------------------------------------------------------------
        // Array / Object Indent Checking
        // -------------------------------------------------------------------------

        function computeNodeIndentForArrayOrObject(node, parentVarNode) {
            const parent = node.parent;
            let nodeIndent = getNodeIndent(parent).goodChar;

            if (
                parentVarNode &&
                parentVarNode.loc.start.line === node.loc.start.line
            ) {
                return nodeIndent;
            }

            if (
                parent.type === "VariableDeclarator" &&
                parentVarNode !== parentVarNode.parent.declarations[0]
            ) {
                return nodeIndent;
            }

            if (
                parent.type === "VariableDeclarator" &&
                parentVarNode.loc.start.line === parent.loc.start.line
            ) {
                nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            } else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
                nodeIndent = computeParentCollectionIndent(node, parent, nodeIndent);
            } else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                nodeIndent = computeCallExpressionIndent(node, parent, nodeIndent);
            } else if (
                parent.type === "LogicalExpression" ||
                parent.type === "ArrowFunctionExpression"
            ) {
                nodeIndent += indentSize;
            }

            return nodeIndent;
        }

        function computeParentCollectionIndent(node, parent, nodeIndent) {
            const parentElements =
                parent.type === "ObjectExpression" ? parent.properties : parent.elements;

            if (
                parentElements[0] &&
                parentElements[0].loc.start.line === parent.loc.start.line &&
                parentElements[0].loc.end.line !== parent.loc.start.line
            ) {
                return nodeIndent;
            }

            if (typeof options[parent.type] === "number") {
                return nodeIndent + options[parent.type] * indentSize;
            }

            return parentElements[0] ? parentElements[0].loc.start.column : nodeIndent;
        }

        function computeCallExpressionIndent(node, parent, nodeIndent) {
            const callArgs = options.CallExpression.arguments;

            if (typeof callArgs === "number") {
                return nodeIndent + callArgs * indentSize;
            }
            if (callArgs === "first" && parent.arguments.includes(node)) {
                return parent.arguments[0].loc.start.column;
            }
            return nodeIndent + indentSize;
        }

        function checkIndentInArrayOrObjectBlock(node) {
            if (isSingleLineNode(node)) {
                return;
            }

            const elements = (node.type === "ArrayExpression" ? node.elements : node.properties)
                .filter(elem => elem !== null);

            const parentVarNode = getVariableDeclaratorNode(node);
            let nodeIndent;

            if (isNodeFirstInLine(node)) {
                nodeIndent = computeNodeIndentForArrayOrObject(node, parentVarNode);
                checkFirstNodeLineIndent(node, nodeIndent);
            } else {
                nodeIndent = getNodeIndent(node).goodChar;
            }

            const elementsIndent =
                options[node.type] === "first"
                    ? elements.length ? elements[0].loc.start.column : 0
                    : nodeIndent + indentSize * options[node.type];

            const varIndentAdj = isNodeInVarOnTop(node, parentVarNode)
                ? indentSize * options.VariableDeclarator[parentVarNode.parent.kind]
                : 0;

            checkNodesIndent(elements, elementsIndent + varIndentAdj);

            if (elements.length > 0 && elements.at(-1).loc.end.line === node.loc.end.line) {
                return;
            }

            checkLastNodeLineIndent(node, nodeIndent + varIndentAdj);
        }

        // -------------------------------------------------------------------------
        // Variable Declaration Indent Checking
        // -------------------------------------------------------------------------

        function filterOutSameLineVars(node) {
            return node.declarations.reduce((finalCollection, elem) => {
                const lastElem = finalCollection.at(-1);

                if (
                    (elem.loc.start.line !== node.loc.start.line && !lastElem) ||
                    (lastElem && lastElem.loc.start.line !== elem.loc.start.line)
                ) {
                    finalCollection.push(elem);
                }

                return finalCollection;
            }, []);
        }

        function checkIndentInVariableDeclarations(node) {
            const elements = filterOutSameLineVars(node);
            const nodeIndent = getNodeIndent(node).goodChar;
            const lastElement = elements.at(-1);
            const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];

            checkNodesIndent(elements, elementsIndent);

            if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
                return;
            }

            const tokenBeforeLastElement = sourceCode.getTokenBefore(lastElement);

            if (tokenBeforeLastElement.value === ",") {
                checkLastNodeLineIndent(node, getNodeIndent(tokenBeforeLastElement).goodChar);
            } else {
                checkLastNodeLineIndent(node, elementsIndent - indentSize);
            }
        }

        // -------------------------------------------------------------------------
        // Switch / Case Indent Checking
        // -------------------------------------------------------------------------

        function expectedCaseIndent(node, providedSwitchIndent) {
            const switchNode = node.type === "SwitchStatement" ? node : node.parent;
            const switchIndent =
                typeof providedSwitchIndent === "undefined"
                    ? getNodeIndent(switchNode).goodChar
                    : providedSwitchIndent;

            if (caseIndentStore[switchNode.loc.start.line]) {
                return caseIndentStore[switchNode.loc.start.line];
            }

            const caseIndent =
                switchNode.cases.length > 0 && options.SwitchCase === 0
                    ? switchIndent
                    : switchIndent + indentSize * options.SwitchCase;

            caseIndentStore[switchNode.loc.start.line] = caseIndent;
            return caseIndent;
        }

        // -------------------------------------------------------------------------
        // Function Parameter Indent Checking
        // -------------------------------------------------------------------------

        function checkFunctionParamIndent(node, optionKey) {
            if (isSingleLineNode(node)) {
                return;
            }

            const paramOptions = options[optionKey].parameters;

            if (paramOptions === "first" && node.params.length) {
                checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
            } else if (paramOptions !== null) {
                checkNodesIndent(
                    node.params,
                    getNodeIndent(node).goodChar + indentSize * paramOptions,
                );
            }
        }

        // -------------------------------------------------------------------------
        // Misc Utilities
        // -------------------------------------------------------------------------

        function blockLessNodes(node) {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        }

        function isWrappedInParenthesis(node) {
            const statementWithoutArgument = sourceCode
                .getText(node)
                .replace(sourceCode.getText(node.argument), "");

            return /^return\s*\(\s*\)/u.test(statementWithoutArgument);
        }

        // -------------------------------------------------------------------------
        // Rule Visitors
        // -------------------------------------------------------------------------

        return {
            Program(node) {
                if (node.body.length > 0) {
                    checkNodesIndent(node.body, getNodeIndent(node).goodChar);
                }
            },

            ClassBody: blockIndentationCheck,
            BlockStatement: blockIndentationCheck,
            WhileStatement: blockLessNodes,
            ForStatement: blockLessNodes,
            ForInStatement: blockLessNodes,
            ForOfStatement: blockLessNodes,
            DoWhileStatement: blockLessNodes,

            IfStatement(node) {
                if (
                    node.consequent.type !== "BlockStatement" &&
                    node.consequent.loc.start.line > node.loc.start.line
                ) {
                    blockIndentationCheck(node);
                }
            },

            VariableDeclaration(node) {
                if (node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
                    checkIndentInVariableDeclarations(node);
                }
            },

            ObjectExpression: checkIndentInArrayOrObjectBlock,
            ArrayExpression: checkIndentInArrayOrObjectBlock,

            MemberExpression(node) {
                if (typeof options.MemberExpression === "undefined" || isSingleLineNode(node)) {
                    return;
                }

                if (
                    getParentNodeByType(node, "VariableDeclarator", [
                        "FunctionExpression",
                        "ArrowFunctionExpression",
                    ]) ||
                    getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])
                ) {
                    return;
                }

                const propertyIndent =
                    getNodeIndent(node).goodChar + indentSize * options.MemberExpression;
                const checkNodes = [node.property];
                const dot = sourceCode.getTokenBefore(node.property);

                if (dot.type === "Punctuator" && dot.value === ".") {
                    checkNodes.push(dot);
                }

                checkNodesIndent(checkNodes, propertyIndent);
            },

            SwitchStatement(node) {
                const switchIndent = getNodeIndent(node).goodChar;
                const caseIndent = expectedCaseIndent(node, switchIndent);

                checkNodesIndent(node.cases, caseIndent);
                checkLastNodeLineIndent(node, switchIndent);
            },

            SwitchCase(node) {
                if (isSingleLineNode(node)) {
                    return;
                }
                checkNodesIndent(node.consequent, expectedCaseIndent(node) + indentSize);
            },

            FunctionDeclaration(node) {
                checkFunctionParamIndent(node, "FunctionDeclaration");
            },

            FunctionExpression(node) {
                checkFunctionParamIndent(node, "FunctionExpression");
            },

            ReturnStatement(node) {
                if (isSingleLineNode(node)) {
                    return;
                }

                const firstLineIndent = getNodeIndent(node).goodChar;

                if (isWrappedInParenthesis(node)) {
                    checkLastReturnStatementLineIndent(node, firstLineIndent);
                } else {
                    checkNodeIndent(node, firstLineIndent);
                }
            },

            CallExpression(node) {
                if (isSingleLineNode(node)) {
                    return;
                }

                const argOptions = options.CallExpression.arguments;

                if (argOptions === "first" && node.arguments.length) {
                    checkNodesIndent(node.arguments.slice(1), node.arguments[0].loc.start.column);
                } else if (argOptions !== null) {
                    checkNodesIndent(
                        node.arguments,
                        getNodeIndent(node).goodChar + indentSize * argOptions,
                    );
                }
            },
        };
    },
};
```

## Key Refactoring Changes

| Change | Benefit |
|--------|---------|
| **Extracted `parseOptions` + `applyUserOptions`** | Removes 40+ lines of option-parsing from `create()` |
| **Loop over `numberOptionKeys`, `objectOptionKeys`, `mixedOptionKeys`** | Eliminates repetitive `if (typeof opts.X)` blocks |
| **Extracted `buildFoundStatement`** | Simplifies `createErrorMessageData` |
| **Simplified `report` range calculation** | Removes duplicated ternary branches |
| **Extracted `checkNodeIndentSpecialCases`** | Reduces `checkNodeIndent` complexity |
| **Extracted `getFunctionBlockIndent`, `getFunctionOffset`, `adjustIndentForCallExpression`** | Breaks up `checkIndentInFunctionBlock` |
| **Extracted `getBlockIndent`** | Simplifies `blockIndentationCheck` |
| **Extracted `computeNodeIndentForArrayOrObject`, `computeParentCollectionIndent`, `computeCallExpressionIndent`** | Breaks up deeply nested `checkIndentInArrayOrObjectBlock` |
| **`OUTER_IIFE_UNARY_OPERATORS` + `OUTER_IIFE_ANCESTOR_TYPES` Sets** | Simplifies `isOuterIIFE` while-condition |
| **`checkFunctionParamIndent` helper** | Deduplicates `FunctionDeclaration`/`FunctionExpression` visitors |
| **Optional chaining (`?.`)** | Replaces verbose null checks |
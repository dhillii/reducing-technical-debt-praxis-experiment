# Refactored Code

Here's the refactored version with reduced complexity through several strategies:

1. **Extracted helper functions** to reduce duplication
2. **Simplified option parsing** using a data-driven approach
3. **Consolidated repetitive patterns** in function parameter checking
4. **Reduced nesting** in complex functions

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

        let indentType = "space";
        let indentSize = 4;

        const options = {
            SwitchCase: 0,
            VariableDeclarator: {
                var: DEFAULT_VARIABLE_INDENT,
                let: DEFAULT_VARIABLE_INDENT,
                const: DEFAULT_VARIABLE_INDENT,
            },
            outerIIFEBody: null,
            FunctionDeclaration: {
                parameters: DEFAULT_PARAMETER_INDENT,
                body: DEFAULT_FUNCTION_BODY_INDENT,
            },
            FunctionExpression: {
                parameters: DEFAULT_PARAMETER_INDENT,
                body: DEFAULT_FUNCTION_BODY_INDENT,
            },
            CallExpression: {
                arguments: DEFAULT_PARAMETER_INDENT,
            },
            ArrayExpression: 1,
            ObjectExpression: 1,
        };

        const sourceCode = context.sourceCode;
        const caseIndentStore = {};

        // -------------------------------------------------------------------------
        // Option Parsing
        // -------------------------------------------------------------------------

        function parseOptions(contextOptions) {
            if (!contextOptions.length) return;

            const [firstOption, secondOption] = contextOptions;

            if (firstOption === "tab") {
                indentSize = 1;
                indentType = "tab";
            } /* c8 ignore start */ else if (typeof firstOption === "number") {
                indentSize = firstOption;
                indentType = "space";
            } /* c8 ignore stop */

            if (!secondOption) return;

            options.SwitchCase = secondOption.SwitchCase || 0;

            const varDeclarator = secondOption.VariableDeclarator;
            if (typeof varDeclarator === "number") {
                options.VariableDeclarator = {
                    var: varDeclarator,
                    let: varDeclarator,
                    const: varDeclarator,
                };
            } else if (typeof varDeclarator === "object") {
                Object.assign(options.VariableDeclarator, varDeclarator);
            }

            const numberOptions = ["outerIIFEBody", "MemberExpression"];
            for (const key of numberOptions) {
                if (typeof secondOption[key] === "number") {
                    options[key] = secondOption[key];
                }
            }

            const objectOptions = ["FunctionDeclaration", "FunctionExpression", "CallExpression"];
            for (const key of objectOptions) {
                if (typeof secondOption[key] === "object") {
                    Object.assign(options[key], secondOption[key]);
                }
            }

            const primitiveOptions = ["ArrayExpression", "ObjectExpression"];
            for (const key of primitiveOptions) {
                if (typeof secondOption[key] === "number" || typeof secondOption[key] === "string") {
                    options[key] = secondOption[key];
                }
            }
        }

        parseOptions(context.options);

        // -------------------------------------------------------------------------
        // Helpers
        // -------------------------------------------------------------------------

        function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
            const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
            const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
            const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;

            let foundStatement;

            if (actualSpaces > 0 && actualTabs > 0) {
                foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
            } else if (actualSpaces > 0) {
                foundStatement = indentType === "space" ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
            } else if (actualTabs > 0) {
                foundStatement = indentType === "tab" ? actualTabs : `${actualTabs} ${foundTabsWord}`;
            } else {
                foundStatement = "0";
            }

            return { expected: expectedStatement, actual: foundStatement };
        }

        function getTextRange(node, isLastNodeCheck, gottenSpaces, gottenTabs) {
            const offset = isLastNodeCheck
                ? node.range[1] - node.loc.end.column
                : node.range[0] - node.loc.start.column;

            return [offset, offset + gottenSpaces + gottenTabs];
        }

        function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
            if (gottenSpaces && gottenTabs) return;

            const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
            const textRange = getTextRange(node, isLastNodeCheck, gottenSpaces, gottenTabs);

            context.report({
                node,
                loc,
                messageId: "expected",
                data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
                fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
            });
        }

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
            const firstToken = byEndLocation
                ? sourceCode.getLastToken(node, 1)
                : sourceCode.getTokenBefore(node);

            const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
            const endLine = firstToken ? firstToken.loc.end.line : -1;

            return startLine !== endLine;
        }

        function isSingleLineNode(node) {
            const lastToken = sourceCode.getLastToken(node);
            return node.loc.start.line === lastToken.loc.end.line;
        }

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

        function isOuterIIFE(node) {
            const parent = node.parent;

            if (parent.type !== "CallExpression" || parent.callee !== node) {
                return false;
            }

            const outerIIFEAncestorTypes = new Set([
                "AssignmentExpression",
                "LogicalExpression",
                "SequenceExpression",
                "VariableDeclarator",
            ]);

            const unaryOperators = new Set(["!", "~", "+", "-"]);

            let stmt = parent.parent;

            while (
                (stmt.type === "UnaryExpression" && unaryOperators.has(stmt.operator)) ||
                outerIIFEAncestorTypes.has(stmt.type)
            ) {
                stmt = stmt.parent;
            }

            return (
                (stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
                stmt.parent?.type === "Program"
            );
        }

        // -------------------------------------------------------------------------
        // Indent Checking
        // -------------------------------------------------------------------------

        function checkNodeIndent(node, neededIndent) {
            const actualIndent = getNodeIndent(node, false);
            const isNotArrayOrObject =
                node.type !== "ArrayExpression" && node.type !== "ObjectExpression";

            if (
                isNotArrayOrObject &&
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

            if (node.type === "TryStatement") {
                if (node.handler) {
                    checkNodeIndent(sourceCode.getFirstToken(node.handler), neededIndent);
                }
                if (node.finalizer) {
                    checkNodeIndent(sourceCode.getTokenBefore(node.finalizer), neededIndent);
                }
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

            if (textBeforeClosingParen.trim()) return;

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

        function getCallExpressionIndent(calleeNode, defaultIndent) {
            const calleeParent = calleeNode.parent;
            const isFunctionType =
                calleeNode.type === "FunctionExpression" ||
                calleeNode.type === "ArrowFunctionExpression";

            if (!isFunctionType) {
                if (calleeParent?.loc.start.line < calleeNode.parent.body?.loc.start.line) {
                    return getNodeIndent(calleeParent).goodChar;
                }
                return defaultIndent;
            }

            if (
                isArgBeforeCalleeNodeMultiline(calleeNode) &&
                calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
                !isNodeFirstInLine(calleeNode)
            ) {
                return getNodeIndent(calleeParent).goodChar;
            }

            return defaultIndent;
        }

        function checkIndentInFunctionBlock(node) {
            const calleeNode = node.parent;
            const isPropertyOrArray =
                calleeNode.parent?.type === "Property" ||
                calleeNode.parent?.type === "ArrayExpression";

            let indent = getNodeIndent(calleeNode, isPropertyOrArray).goodChar;

            if (calleeNode.parent?.type === "CallExpression") {
                indent = getCallExpressionIndent(calleeNode, indent);
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

        function getNodeIndentForArrayOrObject(node, parentVarNode) {
            const parent = node.parent;
            let nodeIndent = getNodeIndent(parent).goodChar;

            const isFirstDeclaration =
                !parentVarNode ||
                parentVarNode === parentVarNode.parent.declarations[0];

            if (
                parentVarNode &&
                parentVarNode.loc.start.line === node.loc.start.line
            ) {
                return nodeIndent;
            }

            if (!isFirstDeclaration) return nodeIndent;

            if (
                parent.type === "VariableDeclarator" &&
                parentVarNode.loc.start.line === parent.loc.start.line
            ) {
                nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            } else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
                nodeIndent = getArrayOrObjectParentIndent(node, parent, nodeIndent);
            } else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                nodeIndent = getCallExpressionNodeIndent(parent, node, nodeIndent);
            } else if (
                parent.type === "LogicalExpression" ||
                parent.type === "ArrowFunctionExpression"
            ) {
                nodeIndent += indentSize;
            }

            return nodeIndent;
        }

        function getArrayOrObjectParentIndent(node, parent, nodeIndent) {
            const parentElements =
                parent.type === "ObjectExpression"
                    ? parent.properties
                    : parent.elements;

            const firstElem = parentElements[0];

            if (
                firstElem &&
                firstElem.loc.start.line === parent.loc.start.line &&
                firstElem.loc.end.line !== parent.loc.start.line
            ) {
                return nodeIndent;
            }

            if (typeof options[parent.type] === "number") {
                return nodeIndent + options[parent.type] * indentSize;
            }

            return firstElem ? firstElem.loc.start.column : nodeIndent;
        }

        function getCallExpressionNodeIndent(parent, node, nodeIndent) {
            const argOption = options.CallExpression.arguments;

            if (typeof argOption === "number") {
                return nodeIndent + argOption * indentSize;
            }

            if (argOption === "first" && parent.arguments.includes(node)) {
                return parent.arguments[0].loc.start.column;
            }

            return nodeIndent + indentSize;
        }

        function checkIndentInArrayOrObjectBlock(node) {
            if (isSingleLineNode(node)) return;

            const elements = (
                node.type === "ArrayExpression" ? node.elements : node.properties
            ).filter(Boolean);

            const parentVarNode = getVariableDeclaratorNode(node);

            let nodeIndent;

            if (isNodeFirstInLine(node)) {
                nodeIndent = getNodeIndentForArrayOrObject(node, parentVarNode);
                checkFirstNodeLineIndent(node, nodeIndent);
            } else {
                nodeIndent = getNodeIndent(node).goodChar;
            }

            const elementsIndent =
                options[node.type] === "first"
                    ? elements.length ? elements[0].loc.start.column : 0
                    : nodeIndent + indentSize * options[node.type];

            const adjustedElementsIndent =
                isNodeInVarOnTop(node, parentVarNode)
                    ? elementsIndent + indentSize * options.VariableDeclarator[parentVarNode.parent.kind]
                    : elementsIndent;

            checkNodesIndent(elements, adjustedElementsIndent);

            if (elements.length > 0 && elements.at(-1).loc.end.line === node.loc.end.line) {
                return;
            }

            const varTopOffset =
                isNodeInVarOnTop(node, parentVarNode)
                    ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
                    : 0;

            checkLastNodeLineIndent(node, nodeIndent + varTopOffset);
        }

        function isNodeBodyBlock(node) {
            return (
                node.type === "BlockStatement" ||
                node.type === "ClassBody" ||
                node.body?.type === "BlockStatement" ||
                node.consequent?.type === "BlockStatement"
            );
        }

        const STATEMENTS_WITH_PROPERTIES = new Set([
            "IfStatement",
            "WhileStatement",
            "ForStatement",
            "ForInStatement",
            "ForOfStatement",
            "DoWhileStatement",
            "ClassDeclaration",
            "TryStatement",
        ]);

        const FUNCTION_TYPES = new Set([
            "FunctionExpression",
            "FunctionDeclaration",
            "ArrowFunctionExpression",
        ]);

        function getBlockIndent(node) {
            if (node.parent && STATEMENTS_WITH_PROPERTIES.has(node.parent.type) && isNodeBodyBlock(node)) {
                return getNodeIndent(node.parent).goodChar;
            }
            if (node.parent?.type === "CatchClause") {
                return getNodeIndent(node.parent.parent).goodChar;
            }
            return getNodeIndent(node).goodChar;
        }

        function getBlockNodesToCheck(node) {
            if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
                return [node.consequent];
            }
            return Array.isArray(node.body) ? node.body : [node.body];
        }

        function blockIndentationCheck(node) {
            if (isSingleLineNode(node)) return;

            if (node.parent && FUNCTION_TYPES.has(node.parent.type)) {
                checkIndentInFunctionBlock(node);
                return;
            }

            const indent = getBlockIndent(node);
            const nodesToCheck = getBlockNodesToCheck(node);

            if (nodesToCheck.length > 0) {
                checkNodesIndent(nodesToCheck, indent + indentSize);
            }

            if (node.type === "BlockStatement") {
                checkLastNodeLineIndent(node, indent);
            }
        }

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

        function blockLessNodes(node) {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        }

        function expectedCaseIndent(node, providedSwitchIndent) {
            const switchNode = node.type === "SwitchStatement" ? node : node.parent;
            const cacheKey = switchNode.loc.start.line;

            if (caseIndentStore[cacheKey]) {
                return caseIndentStore[cacheKey];
            }

            const switchIndent =
                typeof providedSwitchIndent === "undefined"
                    ? getNodeIndent(switchNode).goodChar
                    : providedSwitchIndent;

            const caseIndent =
                switchNode.cases.length > 0 && options.SwitchCase === 0
                    ? switchIndent
                    : switchIndent + indentSize * options.SwitchCase;

            caseIndentStore[cacheKey] = caseIndent;
            return caseIndent;
        }

        function isWrappedInParenthesis(node) {
            const statementWithoutArgument = sourceCode
                .getText(node)
                .replace(sourceCode.getText(node.argument), "");

            return /^return\s*\(\s*\)/u.test(statementWithoutArgument);
        }

        function checkFunctionParams(node, optionKey) {
            if (isSingleLineNode(node)) return;

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
            ObjectExpression: checkIndentInArrayOrObjectBlock,
            ArrayExpression: checkIndentInArrayOrObjectBlock,

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
                if (isSingleLineNode(node)) return;

                checkNodesIndent(node.consequent, expectedCaseIndent(node) + indentSize);
            },

            FunctionDeclaration(node) {
                checkFunctionParams(node, "FunctionDeclaration");
            },

            FunctionExpression(node) {
                checkFunctionParams(node, "FunctionExpression");
            },

            ReturnStatement(node) {
                if (isSingleLineNode(node)) return;

                const firstLineIndent = getNodeIndent(node).goodChar;

                if (isWrappedInParenthesis(node)) {
                    checkLastReturnStatementLineIndent(node, firstLineIndent);
                } else {
                    checkNodeIndent(node, firstLineIndent);
                }
            },

            CallExpression(node) {
                if (isSingleLineNode(node)) return;

                const argOption = options.CallExpression.arguments;

                if (argOption === "first" && node.arguments.length) {
                    checkNodesIndent(node.arguments.slice(1), node.arguments[0].loc.start.column);
                } else if (argOption !== null) {
                    checkNodesIndent(
                        node.arguments,
                        getNodeIndent(node).goodChar + indentSize * argOption,
                    );
                }
            },
        };
    },
};
```

## Key Refactoring Changes

| Change | Description |
|--------|-------------|
| **`parseOptions()`** | Extracted option parsing into its own function; used loops for repetitive `number`/`object`/`primitive` option types |
| **`checkFunctionParams()`** | Consolidated duplicate `FunctionDeclaration` and `FunctionExpression` parameter checking into one reusable function |
| **`getFunctionOffset()`** | Extracted function body offset calculation from `checkIndentInFunctionBlock` |
| **`getCallExpressionIndent()`** | Extracted call expression indent logic to reduce nesting |
| **`getNodeIndentForArrayOrObject()`** | Broke out the complex indent calculation from `checkIndentInArrayOrObjectBlock` |
| **`getArrayOrObjectParentIndent()`** | Further decomposed nested parent indent logic |
| **`getCallExpressionNodeIndent()`** | Isolated call expression node indent calculation |
| **`getBlockIndent()` / `getBlockNodesToCheck()`** | Extracted from `blockIndentationCheck` to reduce its complexity |
| **`checkNodeIndentSpecialCases()`** | Separated special-case handling from `checkNodeIndent` |
| **`STATEMENTS_WITH_PROPERTIES` / `FUNCTION_TYPES`** | Converted arrays to `Set` for O(1) lookup and defined once at scope level |
| **`getTextRange()`** | Extracted range calculation from `report()` |
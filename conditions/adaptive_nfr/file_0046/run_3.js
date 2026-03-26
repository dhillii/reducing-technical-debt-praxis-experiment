# Refactored `indent-legacy` Rule

## Key Refactoring Strategies Applied

1. **Extract option parsing** into dedicated functions
2. **Eliminate repetitive patterns** with generic helpers
3. **Reduce nested conditionals** using early returns and guard clauses
4. **Extract duplicated function parameter checking** logic
5. **Simplify complex expressions** with named variables

```javascript
/**
 * @fileoverview This option sets a specific tab width for your code
 *
 * This rule has been ported and modified from nodeca.
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v4.0.0
 */

"use strict";

const astUtils = require("./utils/ast-utils");

const SCHEMA_INTEGER_OR_FIRST = {
    oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
};

const SCHEMA_FUNCTION_OPTIONS = {
    type: "object",
    properties: {
        parameters: SCHEMA_INTEGER_OR_FIRST,
        body: { type: "integer", minimum: 0 },
    },
};

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
                    FunctionDeclaration: SCHEMA_FUNCTION_OPTIONS,
                    FunctionExpression: SCHEMA_FUNCTION_OPTIONS,
                    CallExpression: {
                        type: "object",
                        properties: { parameters: SCHEMA_INTEGER_OR_FIRST },
                    },
                    ArrayExpression: SCHEMA_INTEGER_OR_FIRST,
                    ObjectExpression: SCHEMA_INTEGER_OR_FIRST,
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

        const sourceCode = context.sourceCode;

        // -------------------------------------------------------------------------
        // Option Parsing
        // -------------------------------------------------------------------------

        function parseIndentTypeAndSize(rawOption) {
            if (rawOption === "tab") {
                return { indentType: "tab", indentSize: 1 };
            }
            /* c8 ignore start */
            if (typeof rawOption === "number") {
                return { indentType: "space", indentSize: rawOption };
            }
            /* c8 ignore stop */
            return { indentType: "space", indentSize: 4 };
        }

        function parseVariableDeclaratorOption(rule, defaults) {
            if (typeof rule === "number") {
                return { var: rule, let: rule, const: rule };
            }
            if (typeof rule === "object") {
                return Object.assign({}, defaults, rule);
            }
            return defaults;
        }

        function buildOptions(rawOptions) {
            const defaults = {
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
                CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
                ArrayExpression: 1,
                ObjectExpression: 1,
            };

            if (!rawOptions) {
                return defaults;
            }

            return {
                SwitchCase: rawOptions.SwitchCase || 0,
                VariableDeclarator: parseVariableDeclaratorOption(
                    rawOptions.VariableDeclarator,
                    defaults.VariableDeclarator,
                ),
                outerIIFEBody: typeof rawOptions.outerIIFEBody === "number"
                    ? rawOptions.outerIIFEBody
                    : defaults.outerIIFEBody,
                MemberExpression: typeof rawOptions.MemberExpression === "number"
                    ? rawOptions.MemberExpression
                    : defaults.MemberExpression,
                FunctionDeclaration: typeof rawOptions.FunctionDeclaration === "object"
                    ? Object.assign({}, defaults.FunctionDeclaration, rawOptions.FunctionDeclaration)
                    : defaults.FunctionDeclaration,
                FunctionExpression: typeof rawOptions.FunctionExpression === "object"
                    ? Object.assign({}, defaults.FunctionExpression, rawOptions.FunctionExpression)
                    : defaults.FunctionExpression,
                CallExpression: typeof rawOptions.CallExpression === "object"
                    ? Object.assign({}, defaults.CallExpression, rawOptions.CallExpression)
                    : defaults.CallExpression,
                ArrayExpression: (typeof rawOptions.ArrayExpression === "number" ||
                    typeof rawOptions.ArrayExpression === "string")
                    ? rawOptions.ArrayExpression
                    : defaults.ArrayExpression,
                ObjectExpression: (typeof rawOptions.ObjectExpression === "number" ||
                    typeof rawOptions.ObjectExpression === "string")
                    ? rawOptions.ObjectExpression
                    : defaults.ObjectExpression,
            };
        }

        const { indentType, indentSize } = parseIndentTypeAndSize(context.options[0]);
        const options = buildOptions(context.options[1]);
        const caseIndentStore = {};

        // -------------------------------------------------------------------------
        // Indentation Measurement
        // -------------------------------------------------------------------------

        function getNodeIndent(node, byLastLine = false) {
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

        function isNodeFirstInLine(node, byEndLocation = false) {
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

        // -------------------------------------------------------------------------
        // Error Reporting
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

        function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck = false) {
            if (gottenSpaces && gottenTabs) {
                return; // Avoid conflicts with `no-mixed-spaces-and-tabs`
            }

            const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
            const rangeBase = isLastNodeCheck
                ? node.range[1] - node.loc.end.column
                : node.range[0] - node.loc.start.column;
            const textRange = [rangeBase, rangeBase + gottenSpaces + gottenTabs];

            context.report({
                node,
                loc,
                messageId: "expected",
                data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
                fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
            });
        }

        // -------------------------------------------------------------------------
        // Indent Checking Helpers
        // -------------------------------------------------------------------------

        function checkNodeIndent(node, neededIndent) {
            const actualIndent = getNodeIndent(node, false);
            const isWrongIndent = actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0;
            const isNotArrayOrObject = node.type !== "ArrayExpression" && node.type !== "ObjectExpression";

            if (isNotArrayOrObject && isWrongIndent && isNodeFirstInLine(node)) {
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
            const isWrongIndent = endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0;

            if (isWrongIndent && isNodeFirstInLine(node, true)) {
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
            const isWrongIndent = startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0;

            if (isWrongIndent && isNodeFirstInLine(node)) {
                report(
                    node,
                    firstLineIndent,
                    startIndent.space,
                    startIndent.tab,
                    { line: node.loc.start.line, column: node.loc.start.column },
                );
            }
        }

        // -------------------------------------------------------------------------
        // Node Traversal Helpers
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
            const { arguments: args } = node.parent;

            if (args.length >= 2 && args[1] === node) {
                return args[0].loc.end.line > args[0].loc.start.line;
            }
            return false;
        }

        function isOuterIIFE(node) {
            const parent = node.parent;

            if (parent.type !== "CallExpression" || parent.callee !== node) {
                return false;
            }

            const OUTER_IIFE_ANCESTOR_TYPES = new Set([
                "AssignmentExpression",
                "LogicalExpression",
                "SequenceExpression",
                "VariableDeclarator",
            ]);

            const UNARY_IIFE_OPERATORS = new Set(["!", "~", "+", "-"]);

            let stmt = parent.parent;

            while (
                (stmt.type === "UnaryExpression" && UNARY_IIFE_OPERATORS.has(stmt.operator)) ||
                OUTER_IIFE_ANCESTOR_TYPES.has(stmt.type)
            ) {
                stmt = stmt.parent;
            }

            return (
                (stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
                stmt.parent?.type === "Program"
            );
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
        // Function Parameter Checking (shared logic)
        // -------------------------------------------------------------------------

        function checkFunctionParamsIndent(node, optionKey) {
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
        // Block Indentation
        // -------------------------------------------------------------------------

        function getFunctionBlockIndent(calleeNode) {
            const useLastToken = (
                calleeNode.parent?.type === "Property" ||
                calleeNode.parent?.type === "ArrayExpression"
            );
            let indent = getNodeIndent(calleeNode, useLastToken ? false : undefined).goodChar;

            if (calleeNode.parent?.type === "CallExpression") {
                const calleeParent = calleeNode.parent;
                const isFunctionType = (
                    calleeNode.type === "FunctionExpression" ||
                    calleeNode.type === "ArrowFunctionExpression"
                );

                if (!isFunctionType) {
                    if (calleeParent.loc.start.line < calleeNode.loc.start.line) {
                        indent = getNodeIndent(calleeParent).goodChar;
                    }
                } else if (
                    isArgBeforeCalleeNodeMultiline(calleeNode) &&
                    calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
                    !isNodeFirstInLine(calleeNode)
                ) {
                    indent = getNodeIndent(calleeParent).goodChar;
                }
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
            const functionOffset = getFunctionOffset(calleeNode);
            let indent = getFunctionBlockIndent(calleeNode) + functionOffset;

            const parentVarNode = getVariableDeclaratorNode(node);

            if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
                indent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            }

            if (node.body.length > 0) {
                checkNodesIndent(node.body, indent);
            }

            checkLastNodeLineIndent(node, indent - functionOffset);
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

            const indent = resolveBlockIndent(node);
            const nodesToCheck = resolveNodesToCheck(node);

            if (nodesToCheck.length > 0) {
                checkNodesIndent(nodesToCheck, indent + indentSize);
            }

            if (node.type === "BlockStatement") {
                checkLastNodeLineIndent(node, indent);
            }
        }

        const STATEMENTS_WITH_PROPERTIES = new Set([
            "IfStatement", "WhileStatement", "ForStatement",
            "ForInStatement", "ForOfStatement", "DoWhileStatement",
            "ClassDeclaration", "TryStatement",
        ]);

        function resolveBlockIndent(node) {
            if (node.parent && STATEMENTS_WITH_PROPERTIES.has(node.parent.type) && isNodeBodyBlock(node)) {
                return getNodeIndent(node.parent).goodChar;
            }
            if (node.parent?.type === "CatchClause") {
                return getNodeIndent(node.parent.parent).goodChar;
            }
            return getNodeIndent(node).goodChar;
        }

        function resolveNodesToCheck(node) {
            if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
                return [node.consequent];
            }
            if (Array.isArray(node.body)) {
                return node.body;
            }
            return [node.body];
        }

        function blockLessNodes(node) {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        }

        // -------------------------------------------------------------------------
        // Array / Object Indentation
        // -------------------------------------------------------------------------

        function resolveNodeIndentForArrayOrObject(node, parentVarNode) {
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
                nodeIndent = resolveNestedCollectionIndent(node, parent, nodeIndent);
            } else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                nodeIndent = resolveCallExpressionIndent(node, parent, nodeIndent);
            } else if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
                nodeIndent += indentSize;
            }

            return nodeIndent;
        }

        function resolveNestedCollectionIndent(node, parent, nodeIndent) {
            const parentElements = parent.type === "ObjectExpression"
                ? parent.properties
                : parent.elements;

            if (
                parentElements[0] &&
                parentElements[0].loc.start.line === parent.loc.start.line &&
                parentElements[0].loc.end.line !== parent.loc.start.line
            ) {
                return nodeIndent; // First element spans multiple lines; don't increase indent
            }

            if (typeof options[parent.type] === "number") {
                return nodeIndent + options[parent.type] * indentSize;
            }

            return parentElements[0]?.loc.start.column ?? nodeIndent;
        }

        function resolveCallExpressionIndent(node, parent, nodeIndent) {
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
            if (isSingleLineNode(node)) {
                return;
            }

            const rawElements = node.type === "ArrayExpression" ? node.elements : node.properties;
            const elements = rawElements.filter(elem => elem !== null);
            const parentVarNode = getVariableDeclaratorNode(node);

            let nodeIndent;

            if (isNodeFirstInLine(node)) {
                nodeIndent = resolveNodeIndentForArrayOrObject(node, parentVarNode);
                checkFirstNodeLineIndent(node, nodeIndent);
            } else {
                nodeIndent = getNodeIndent(node).goodChar;
            }

            const elementsIndent = options[node.type] === "first"
                ? (elements.length ? elements[0].loc.start.column : 0)
                : nodeIndent + indentSize * options[node.type];

            const varIndentOffset = isNodeInVarOnTop(node, parentVarNode)
                ? indentSize * options.VariableDeclarator[parentVarNode.parent.kind]
                : 0;

            checkNodesIndent(elements, elementsIndent + varIndentOffset);

            if (elements.length > 0 && elements.at(-1).loc.end.line === node.loc.end.line) {
                return;
            }

            checkLastNodeLineIndent(node, nodeIndent + varIndentOffset);
        }

        // -------------------------------------------------------------------------
        // Variable Declaration Indentation
        // -------------------------------------------------------------------------

        function filterOutSameLineVars(node) {
            return node.declarations.reduce((finalCollection, elem) => {
                const lastElem = finalCollection.at(-1);
                const isNewLine = elem.loc.start.line !== node.loc.start.line;
                const isDifferentLineFromLast = lastElem && lastElem.loc.start.line !== elem.loc.start.line;

                if ((isNewLine && !lastElem) || isDifferentLineFromLast) {
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
        // Switch Case Indentation
        // -------------------------------------------------------------------------

        function expectedCaseIndent(node, providedSwitchIndent) {
            const switchNode = node.type === "SwitchStatement" ? node : node.parent;
            const cacheKey = switchNode.loc.start.line;

            if (caseIndentStore[cacheKey]) {
                return caseIndentStore[cacheKey];
            }

            const switchIndent = typeof providedSwitchIndent === "undefined"
                ? getNodeIndent(switchNode).goodChar
                : providedSwitchIndent;

            const caseIndent = (switchNode.cases.length > 0 && options.SwitchCase === 0)
                ? switchIndent
                : switchIndent + indentSize * options.SwitchCase;

            caseIndentStore[cacheKey] = caseIndent;
            return caseIndent;
        }

        // -------------------------------------------------------------------------
        // Return Statement
        // -------------------------------------------------------------------------

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

                const propertyIndent = getNodeIndent(node).goodChar + indentSize * options.MemberExpression;
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
                checkFunctionParamsIndent(node, "FunctionDeclaration");
            },

            FunctionExpression(node) {
                checkFunctionParamsIndent(node, "FunctionExpression");
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

## Summary of Changes

| Area | Refactoring Applied |
|------|-------------------|
| **Schema** | Extracted `SCHEMA_INTEGER_OR_FIRST` and `SCHEMA_FUNCTION_OPTIONS` constants to eliminate repetition |
| **Option parsing** | Split into `parseIndentTypeAndSize`, `parseVariableDeclaratorOption`, and `buildOptions` — replacing a deeply nested `if` chain |
| **`checkNodeIndent`** | Extracted `checkNodeIndentSpecialCases` to separate the main check from the special-case handling |
| **`blockIndentationCheck`** | Extracted `resolveBlockIndent` and `resolveNodesToCheck` to flatten nested logic |
| **`checkIndentInFunctionBlock`** | Extracted `getFunctionBlockIndent` and `getFunctionOffset` to isolate each concern |
| **`checkIndentInArrayOrObjectBlock`** | Extracted `resolveNodeIndentForArrayOrObject`, `resolveNestedCollectionIndent`, and `resolveCallExpressionIndent` to break up deeply nested conditionals |
| **Function params** | Unified `FunctionDeclaration`/`FunctionExpression` duplicate logic into `checkFunctionParamsIndent` |
| **`isOuterIIFE`** | Replaced long `while` condition with `Set` lookups for clarity |
| **`STATEMENTS_WITH_PROPERTIES`** | Converted array to `Set` for O(1) lookup |
| **Default parameters** | Used ES6 default parameters (`byLastLine = false`, `isLastNodeCheck = false`) instead of manual checks |
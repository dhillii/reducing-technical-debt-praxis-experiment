# Refactored `indent-legacy` Rule

## Key Refactoring Strategies Applied

1. **Extract option parsing** into dedicated functions
2. **Eliminate repetitive patterns** (FunctionDeclaration/FunctionExpression, ArrayExpression/ObjectExpression)
3. **Simplify nested conditionals** using early returns and helper extraction
4. **Extract magic logic** into named helpers
5. **Reduce duplication** in `checkIndentInArrayOrObjectBlock`

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

const DEFAULT_VARIABLE_INDENT = 1;
const DEFAULT_PARAMETER_INDENT = null;
const DEFAULT_FUNCTION_BODY_INDENT = 1;

const UNARY_OPERATORS = new Set(["!", "~", "+", "-"]);

const STATEMENTS_WITH_PROPERTIES = new Set([
    "IfStatement", "WhileStatement", "ForStatement", "ForInStatement",
    "ForOfStatement", "DoWhileStatement", "ClassDeclaration", "TryStatement",
]);

// Schema helpers to reduce repetition
const integerOrFirst = {
    oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
};

const nonNegativeInteger = { type: "integer", minimum: 0 };

const functionOptionsSchema = {
    type: "object",
    properties: {
        parameters: integerOrFirst,
        body: nonNegativeInteger,
    },
};

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
                oneOf: [{ enum: ["tab"] }, nonNegativeInteger],
            },
            {
                type: "object",
                properties: {
                    SwitchCase: nonNegativeInteger,
                    VariableDeclarator: {
                        oneOf: [
                            nonNegativeInteger,
                            {
                                type: "object",
                                properties: {
                                    var: nonNegativeInteger,
                                    let: nonNegativeInteger,
                                    const: nonNegativeInteger,
                                },
                            },
                        ],
                    },
                    outerIIFEBody: nonNegativeInteger,
                    MemberExpression: nonNegativeInteger,
                    FunctionDeclaration: functionOptionsSchema,
                    FunctionExpression: functionOptionsSchema,
                    CallExpression: {
                        type: "object",
                        properties: { parameters: integerOrFirst },
                    },
                    ArrayExpression: integerOrFirst,
                    ObjectExpression: integerOrFirst,
                },
                additionalProperties: false,
            },
        ],
        messages: {
            expected: "Expected indentation of {{expected}} but found {{actual}}.",
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const { indentSize, indentType, options } = parseOptions(context.options);
        const caseIndentStore = {};

        // -------------------------------------------------------------------------
        // Option Parsing
        // -------------------------------------------------------------------------

        function parseOptions(contextOptions) {
            let indentType = "space";
            let indentSize = 4;
            const options = buildDefaultOptions();

            if (!contextOptions.length) {
                return { indentSize, indentType, options };
            }

            const [firstOpt, secondOpt] = contextOptions;

            if (firstOpt === "tab") {
                indentSize = 1;
                indentType = "tab";
            } /* c8 ignore start */ else if (typeof firstOpt === "number") {
                indentSize = firstOpt;
            } /* c8 ignore stop */

            if (secondOpt) {
                applySecondaryOptions(options, secondOpt);
            }

            return { indentSize, indentType, options };
        }

        function buildDefaultOptions() {
            return {
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
        }

        function applySecondaryOptions(options, opts) {
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

            const numberOpts = ["outerIIFEBody", "MemberExpression"];
            for (const key of numberOpts) {
                if (typeof opts[key] === "number") {
                    options[key] = opts[key];
                }
            }

            const objectOpts = [
                "FunctionDeclaration", "FunctionExpression", "CallExpression",
            ];
            for (const key of objectOpts) {
                if (typeof opts[key] === "object") {
                    Object.assign(options[key], opts[key]);
                }
            }

            const scalarOpts = ["ArrayExpression", "ObjectExpression"];
            for (const key of scalarOpts) {
                if (typeof opts[key] === "number" || typeof opts[key] === "string") {
                    options[key] = opts[key];
                }
            }
        }

        // -------------------------------------------------------------------------
        // Error Reporting
        // -------------------------------------------------------------------------

        function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
            const expectedStatement =
                `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;

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
            // Avoid conflicts with `no-mixed-spaces-and-tabs`
            if (gottenSpaces && gottenTabs) {
                return;
            }

            const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
            const gottenCount = gottenSpaces + gottenTabs;

            const textRange = isLastNodeCheck
                ? [node.range[1] - node.loc.end.column,
                   node.range[1] - node.loc.end.column + gottenCount]
                : [node.range[0] - node.loc.start.column,
                   node.range[0] - node.loc.start.column + gottenCount];

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

            const srcChars = sourceCode
                .getText(token, token.loc.start.column)
                .split("");

            const indentChars = srcChars.slice(
                0,
                srcChars.findIndex(char => char !== " " && char !== "\t"),
            );

            const spaces = indentChars.filter(c => c === " ").length;
            const tabs = indentChars.filter(c => c === "\t").length;

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

        // -------------------------------------------------------------------------
        // Indent Checking
        // -------------------------------------------------------------------------

        function checkNodeIndent(node, neededIndent) {
            const actualIndent = getNodeIndent(node, false);
            const isArrayOrObject =
                node.type === "ArrayExpression" || node.type === "ObjectExpression";

            if (
                !isArrayOrObject &&
                (actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
                isNodeFirstInLine(node)
            ) {
                report(node, neededIndent, actualIndent.space, actualIndent.tab);
            }

            checkCompoundNodeIndent(node, neededIndent);
        }

        function checkCompoundNodeIndent(node, neededIndent) {
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

            let stmt = parent.parent;

            while (
                (stmt.type === "UnaryExpression" && UNARY_OPERATORS.has(stmt.operator)) ||
                stmt.type === "AssignmentExpression" ||
                stmt.type === "LogicalExpression" ||
                stmt.type === "SequenceExpression" ||
                stmt.type === "VariableDeclarator"
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

        function isWrappedInParenthesis(node) {
            const statementWithoutArgument = sourceCode
                .getText(node)
                .replace(sourceCode.getText(node.argument), "");

            return /^return\s*\(\s*\)/u.test(statementWithoutArgument);
        }

        // -------------------------------------------------------------------------
        // Function Block Indentation
        // -------------------------------------------------------------------------

        function getFunctionBodyOffset(calleeNode) {
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

        function getCalleeBaseIndent(calleeNode) {
            const isInPropertyOrArray =
                calleeNode.parent?.type === "Property" ||
                calleeNode.parent?.type === "ArrayExpression";

            let indent = getNodeIndent(calleeNode, isInPropertyOrArray).goodChar;

            if (calleeNode.parent?.type !== "CallExpression") {
                return indent;
            }

            const calleeParent = calleeNode.parent;
            const isFunctionType =
                calleeNode.type === "FunctionExpression" ||
                calleeNode.type === "ArrowFunctionExpression";

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

            return indent;
        }

        function checkIndentInFunctionBlock(node) {
            const calleeNode = node.parent;
            const baseIndent = getCalleeBaseIndent(calleeNode);
            const functionOffset = getFunctionBodyOffset(calleeNode);
            let indent = baseIndent + functionOffset;

            const parentVarNode = getVariableDeclaratorNode(node);
            if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
                indent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            }

            if (node.body.length > 0) {
                checkNodesIndent(node.body, indent);
            }

            checkLastNodeLineIndent(node, indent - functionOffset);
        }

        // -------------------------------------------------------------------------
        // Array/Object Block Indentation
        // -------------------------------------------------------------------------

        function computeNodeIndentForArrayOrObject(node, parentVarNode) {
            if (!isNodeFirstInLine(node)) {
                return getNodeIndent(node).goodChar;
            }

            const parent = node.parent;
            let nodeIndent = getNodeIndent(parent).goodChar;

            const isFirstDeclaration =
                !parentVarNode ||
                parentVarNode === parentVarNode.parent.declarations[0];

            const varStartMatchesNode =
                parentVarNode?.loc.start.line === node.loc.start.line;

            if (varStartMatchesNode) {
                return nodeIndent;
            }

            if (!isFirstDeclaration) {
                return nodeIndent;
            }

            nodeIndent = adjustIndentForParentType(node, parent, nodeIndent, parentVarNode);
            checkFirstNodeLineIndent(node, nodeIndent);
            return nodeIndent;
        }

        function adjustIndentForParentType(node, parent, nodeIndent, parentVarNode) {
            if (
                parent.type === "VariableDeclarator" &&
                parentVarNode?.loc.start.line === parent.loc.start.line
            ) {
                return nodeIndent +
                    indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            }

            if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
                return adjustIndentForNestedCollection(node, parent, nodeIndent);
            }

            if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                return adjustIndentForCallExpression(node, parent, nodeIndent);
            }

            if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
                return nodeIndent + indentSize;
            }

            return nodeIndent;
        }

        function adjustIndentForNestedCollection(node, parent, nodeIndent) {
            const parentElements = parent.type === "ObjectExpression"
                ? parent.properties
                : parent.elements;

            const firstElem = parentElements[0];
            if (
                firstElem &&
                firstElem.loc.start.line === parent.loc.start.line &&
                firstElem.loc.end.line !== parent.loc.start.line
            ) {
                // First element spans multiple lines — don't increase indent
                return nodeIndent;
            }

            if (typeof options[parent.type] === "number") {
                return nodeIndent + options[parent.type] * indentSize;
            }

            return firstElem ? firstElem.loc.start.column : nodeIndent;
        }

        function adjustIndentForCallExpression(node, parent, nodeIndent) {
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

            const rawElements = node.type === "ArrayExpression"
                ? node.elements
                : node.properties;
            const elements = rawElements.filter(Boolean);
            const parentVarNode = getVariableDeclaratorNode(node);

            const nodeIndent = computeNodeIndentForArrayOrObject(node, parentVarNode);

            const elementsIndent = options[node.type] === "first"
                ? (elements.length ? elements[0].loc.start.column : 0)
                : nodeIndent + indentSize * options[node.type];

            const finalElementsIndent = isNodeInVarOnTop(node, parentVarNode)
                ? elementsIndent + indentSize * options.VariableDeclarator[parentVarNode.parent.kind]
                : elementsIndent;

            checkNodesIndent(elements, finalElementsIndent);

            if (elements.length > 0 && elements.at(-1).loc.end.line === node.loc.end.line) {
                return;
            }

            const varIndentBonus = isNodeInVarOnTop(node, parentVarNode)
                ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
                : 0;

            checkLastNodeLineIndent(node, nodeIndent + varIndentBonus);
        }

        // -------------------------------------------------------------------------
        // Block Indentation
        // -------------------------------------------------------------------------

        function getBlockIndent(node) {
            if (
                node.parent &&
                STATEMENTS_WITH_PROPERTIES.has(node.parent.type) &&
                isNodeBodyBlock(node)
            ) {
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

            const isFunctionBody =
                node.parent?.type === "FunctionExpression" ||
                node.parent?.type === "FunctionDeclaration" ||
                node.parent?.type === "ArrowFunctionExpression";

            if (isFunctionBody) {
                checkIndentInFunctionBlock(node);
                return;
            }

            const indent = getBlockIndent(node);

            const nodesToCheck =
                node.type === "IfStatement" && node.consequent.type !== "BlockStatement"
                    ? [node.consequent]
                    : Array.isArray(node.body)
                        ? node.body
                        : [node.body];

            if (nodesToCheck.length > 0) {
                checkNodesIndent(nodesToCheck, indent + indentSize);
            }

            if (node.type === "BlockStatement") {
                checkLastNodeLineIndent(node, indent);
            }
        }

        function blockLessNodes(node) {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        }

        // -------------------------------------------------------------------------
        // Variable Declaration Indentation
        // -------------------------------------------------------------------------

        function filterOutSameLineVars(node) {
            return node.declarations.reduce((acc, elem) => {
                const lastElem = acc.at(-1);
                const isNewLine = elem.loc.start.line !== node.loc.start.line;
                const isDifferentLineFromLast = lastElem &&
                    lastElem.loc.start.line !== elem.loc.start.line;

                if ((isNewLine && !lastElem) || isDifferentLineFromLast) {
                    acc.push(elem);
                }
                return acc;
            }, []);
        }

        function checkIndentInVariableDeclarations(node) {
            const elements = filterOutSameLineVars(node);
            const nodeIndent = getNodeIndent(node).goodChar;
            const lastElement = elements.at(-1);
            const elementsIndent =
                nodeIndent + indentSize * options.VariableDeclarator[node.kind];

            checkNodesIndent(elements, elementsIndent);

            if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
                return;
            }

            const tokenBeforeLastElement = sourceCode.getTokenBefore(lastElement);

            if (tokenBeforeLastElement.value === ",") {
                checkLastNodeLineIndent(
                    node,
                    getNodeIndent(tokenBeforeLastElement).goodChar,
                );
            } else {
                checkLastNodeLineIndent(node, elementsIndent - indentSize);
            }
        }

        // -------------------------------------------------------------------------
        // Switch Statement Indentation
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

            const caseIndent = options.SwitchCase === 0
                ? switchIndent
                : switchIndent + indentSize * options.SwitchCase;

            caseIndentStore[cacheKey] = caseIndent;
            return caseIndent;
        }

        // -------------------------------------------------------------------------
        // Function Parameter Indentation (shared for Decl and Expr)
        // -------------------------------------------------------------------------

        function checkFunctionParamIndent(node, optionKey) {
            if (isSingleLineNode(node)) {
                return;
            }

            const paramOption = options[optionKey].parameters;

            if (paramOption === "first" && node.params.length) {
                checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
            } else if (paramOption !== null) {
                checkNodesIndent(
                    node.params,
                    getNodeIndent(node).goodChar + indentSize * paramOption,
                );
            }
        }

        // -------------------------------------------------------------------------
        // Visitor
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
                if (
                    node.declarations.at(-1).loc.start.line >
                    node.declarations[0].loc.start.line
                ) {
                    checkIndentInVariableDeclarations(node);
                }
            },

            MemberExpression(node) {
                if (typeof options.MemberExpression === "undefined" || isSingleLineNode(node)) {
                    return;
                }

                if (
                    getParentNodeByType(node, "VariableDeclarator", [
                        "FunctionExpression", "ArrowFunctionExpression",
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

                const argOption = options.CallExpression.arguments;

                if (argOption === "first" && node.arguments.length) {
                    checkNodesIndent(
                        node.arguments.slice(1),
                        node.arguments[0].loc.start.column,
                    );
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

| Area | Technique | Benefit |
|------|-----------|---------|
| **Option parsing** | Extracted `parseOptions`, `buildDefaultOptions`, `applySecondaryOptions` | Eliminates deeply nested `if` chains; loops replace repeated `typeof` checks |
| **Error messages** | Extracted `buildFoundStatement` | Flattens 4-branch conditional into focused helper |
| **`checkNodeIndent`** | Extracted `checkCompoundNodeIndent` | Separates "check self" from "check children" concerns |
| **`checkIndentInFunctionBlock`** | Extracted `getFunctionBodyOffset`, `getCalleeBaseIndent` | Each function has a single clear responsibility |
| **`checkIndentInArrayOrObjectBlock`** | Extracted `computeNodeIndentForArrayOrObject`, `adjustIndentForParentType`, `adjustIndentForNestedCollection`, `adjustIndentForCallExpression` | Breaks up the deeply nested 60-line function |
| **`blockIndentationCheck`** | Extracted `getBlockIndent` | Separates indent calculation from checking logic |
| **FunctionDeclaration/Expression** | Unified via `checkFunctionParamIndent` | Eliminates ~20 lines of duplication |
| **Module-level constants** | `UNARY_OPERATORS`, `STATEMENTS_WITH_PROPERTIES`, schema fragments | Removes magic values and repeated inline arrays |
| **Optional chaining** | `stmt.parent?.type`, `node.body?.type` | Reduces verbose null checks |
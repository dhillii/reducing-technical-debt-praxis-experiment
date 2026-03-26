# Refactored Code

Here's the refactored version with reduced complexity through extraction of helper functions, elimination of duplication, and improved readability:

```javascript
/**
 * @fileoverview This option sets a specific tab width for your code
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v4.0.0
 */

"use strict";

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Constants & Schema Helpers
//------------------------------------------------------------------------------

const SCHEMA_INTEGER = { type: "integer", minimum: 0 };
const SCHEMA_INTEGER_OR_FIRST = { oneOf: [SCHEMA_INTEGER, { enum: ["first"] }] };
const SCHEMA_FUNCTION_OPTIONS = {
    type: "object",
    properties: {
        parameters: SCHEMA_INTEGER_OR_FIRST,
        body: SCHEMA_INTEGER,
    },
};

const STATEMENTS_WITH_PROPERTIES = new Set([
    "IfStatement", "WhileStatement", "ForStatement", "ForInStatement",
    "ForOfStatement", "DoWhileStatement", "ClassDeclaration", "TryStatement",
]);

const OUTER_IIFE_UNARY_OPS = new Set(["!", "~", "+", "-"]);

const OUTER_IIFE_TRAVERSABLE_TYPES = new Set([
    "UnaryExpression", "AssignmentExpression", "LogicalExpression",
    "SequenceExpression", "VariableDeclarator",
]);

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
            replacedBy: [{
                message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
                url: "https://eslint.style/guide/migration",
                plugin: { name: "@stylistic/eslint-plugin", url: "https://eslint.style" },
                rule: { name: "indent", url: "https://eslint.style/rules/indent" },
            }],
        },
        fixable: "whitespace",
        schema: [
            { oneOf: [{ enum: ["tab"] }, SCHEMA_INTEGER] },
            {
                type: "object",
                properties: {
                    SwitchCase: SCHEMA_INTEGER,
                    VariableDeclarator: {
                        oneOf: [
                            SCHEMA_INTEGER,
                            {
                                type: "object",
                                properties: {
                                    var: SCHEMA_INTEGER,
                                    let: SCHEMA_INTEGER,
                                    const: SCHEMA_INTEGER,
                                },
                            },
                        ],
                    },
                    outerIIFEBody: SCHEMA_INTEGER,
                    MemberExpression: SCHEMA_INTEGER,
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
            CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
            ArrayExpression: 1,
            ObjectExpression: 1,
        };

        const sourceCode = context.sourceCode;
        const caseIndentStore = {};

        parseOptions(context.options, options, (size, type) => {
            indentSize = size;
            indentType = type;
        });

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Parses and applies user-provided options.
         */
        function parseOptions([firstOpt, secondOpt] = [], opts, setIndent) {
            if (firstOpt === "tab") {
                setIndent(1, "tab");
            } /* c8 ignore start */ else if (typeof firstOpt === "number") {
                setIndent(firstOpt, "space");
            } /* c8 ignore stop */

            if (!secondOpt) return;

            opts.SwitchCase = secondOpt.SwitchCase || 0;
            applyVariableDeclaratorOption(secondOpt.VariableDeclarator, opts);

            const numericOptions = ["outerIIFEBody", "MemberExpression"];
            for (const key of numericOptions) {
                if (typeof secondOpt[key] === "number") {
                    opts[key] = secondOpt[key];
                }
            }

            const objectOptions = [
                "FunctionDeclaration", "FunctionExpression", "CallExpression",
            ];
            for (const key of objectOptions) {
                if (typeof secondOpt[key] === "object") {
                    Object.assign(opts[key], secondOpt[key]);
                }
            }

            const mixedOptions = ["ArrayExpression", "ObjectExpression"];
            for (const key of mixedOptions) {
                if (typeof secondOpt[key] === "number" || typeof secondOpt[key] === "string") {
                    opts[key] = secondOpt[key];
                }
            }
        }

        /**
         * Applies VariableDeclarator option (number or object).
         */
        function applyVariableDeclaratorOption(rule, opts) {
            if (typeof rule === "number") {
                opts.VariableDeclarator = { var: rule, let: rule, const: rule };
            } else if (typeof rule === "object") {
                Object.assign(opts.VariableDeclarator, rule);
            }
        }

        /**
         * Builds error message data for indentation mismatch.
         */
        function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
            const plural = n => n === 1 ? "" : "s";
            const expected = `${expectedAmount} ${indentType}${plural(expectedAmount)}`;
            const actual = formatActualIndent(actualSpaces, actualTabs, plural);
            return { expected, actual };
        }

        /**
         * Formats the "actual" part of the indentation error message.
         */
        function formatActualIndent(actualSpaces, actualTabs, plural) {
            if (actualSpaces > 0 && actualTabs > 0) {
                return `${actualSpaces} space${plural(actualSpaces)} and ${actualTabs} tab${plural(actualTabs)}`;
            }
            if (actualSpaces > 0) {
                return indentType === "space" ? actualSpaces : `${actualSpaces} space${plural(actualSpaces)}`;
            }
            if (actualTabs > 0) {
                return indentType === "tab" ? actualTabs : `${actualTabs} tab${plural(actualTabs)}`;
            }
            return "0";
        }

        /**
         * Reports an indentation violation.
         */
        function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
            if (gottenSpaces && gottenTabs) {
                return; // Avoid conflicts with `no-mixed-spaces-and-tabs`
            }

            const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
            const gottenCount = gottenSpaces + gottenTabs;

            const textRange = isLastNodeCheck
                ? [node.range[1] - node.loc.end.column, node.range[1] - node.loc.end.column + gottenCount]
                : [node.range[0] - node.loc.start.column, node.range[0] - node.loc.start.column + gottenCount];

            context.report({
                node,
                loc,
                messageId: "expected",
                data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
                fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
            });
        }

        /**
         * Gets the actual indentation of a node.
         */
        function getNodeIndent(node, byLastLine = false) {
            const token = byLastLine
                ? sourceCode.getLastToken(node)
                : sourceCode.getFirstToken(node);

            const srcChars = sourceCode.getText(token, token.loc.start.column).split("");
            const indentChars = srcChars.slice(0, srcChars.findIndex(c => c !== " " && c !== "\t"));
            const spaces = indentChars.filter(c => c === " ").length;
            const tabs = indentChars.filter(c => c === "\t").length;

            return {
                space: spaces,
                tab: tabs,
                goodChar: indentType === "space" ? spaces : tabs,
                badChar: indentType === "space" ? tabs : spaces,
            };
        }

        /**
         * Checks if a node is the first token on its line.
         */
        function isNodeFirstInLine(node, byEndLocation = false) {
            const firstToken = byEndLocation
                ? sourceCode.getLastToken(node, 1)
                : sourceCode.getTokenBefore(node);
            const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
            const endLine = firstToken ? firstToken.loc.end.line : -1;
            return startLine !== endLine;
        }

        /**
         * Checks indentation for a single node and its special sub-tokens.
         */
        function checkNodeIndent(node, neededIndent) {
            const actualIndent = getNodeIndent(node, false);
            const isNotArrayOrObject = node.type !== "ArrayExpression" && node.type !== "ObjectExpression";

            if (
                isNotArrayOrObject &&
                (actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
                isNodeFirstInLine(node)
            ) {
                report(node, neededIndent, actualIndent.space, actualIndent.tab);
            }

            checkSpecialNodeTokens(node, neededIndent);
        }

        /**
         * Checks indentation for special tokens in if/try/do-while statements.
         */
        function checkSpecialNodeTokens(node, neededIndent) {
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

        /**
         * Checks indentation for a list of nodes.
         */
        function checkNodesIndent(nodes, indent) {
            nodes.forEach(node => checkNodeIndent(node, indent));
        }

        /**
         * Checks that the closing token of a node is correctly indented.
         */
        function checkLastNodeLineIndent(node, lastLineIndent) {
            const lastToken = sourceCode.getLastToken(node);
            const endIndent = getNodeIndent(lastToken, true);

            if (
                (endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
                isNodeFirstInLine(node, true)
            ) {
                report(node, lastLineIndent, endIndent.space, endIndent.tab, {
                    line: lastToken.loc.start.line,
                    column: lastToken.loc.start.column,
                }, true);
            }
        }

        /**
         * Checks indentation of the closing parenthesis in a return statement.
         */
        function checkLastReturnStatementLineIndent(node, firstLineIndent) {
            const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
            const textBeforeClosingParen = sourceCode
                .getText(lastToken, lastToken.loc.start.column)
                .slice(0, -1);

            if (textBeforeClosingParen.trim()) return;

            const endIndent = getNodeIndent(lastToken, true);
            if (endIndent.goodChar !== firstLineIndent) {
                report(node, firstLineIndent, endIndent.space, endIndent.tab, {
                    line: lastToken.loc.start.line,
                    column: lastToken.loc.start.column,
                }, true);
            }
        }

        /**
         * Checks that the first token of a node is correctly indented.
         */
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

        /**
         * Traverses ancestors to find a node of a given type.
         */
        function getParentNodeByType(node, type, stopAtList) {
            const stopAtSet = new Set(stopAtList || ["Program"]);
            let parent = node.parent;

            while (parent.type !== type && !stopAtSet.has(parent.type) && parent.type !== "Program") {
                parent = parent.parent;
            }

            return parent.type === type ? parent : null;
        }

        /**
         * Returns the nearest VariableDeclarator ancestor.
         */
        function getVariableDeclaratorNode(node) {
            return getParentNodeByType(node, "VariableDeclarator");
        }

        /**
         * Checks if a node is part of a multi-declaration on the same line as the var keyword.
         */
        function isNodeInVarOnTop(node, varNode) {
            return (
                varNode &&
                varNode.parent.loc.start.line === node.loc.start.line &&
                varNode.parent.declarations.length > 1
            );
        }

        /**
         * Checks if the argument before the callee node spans multiple lines.
         */
        function isArgBeforeCalleeNodeMultiline(node) {
            const { arguments: args } = node.parent;
            if (args.length >= 2 && args[1] === node) {
                return args[0].loc.end.line > args[0].loc.start.line;
            }
            return false;
        }

        /**
         * Checks if a function node is a file-level IIFE.
         */
        function isOuterIIFE(node) {
            const parent = node.parent;
            if (parent.type !== "CallExpression" || parent.callee !== node) {
                return false;
            }

            let stmt = parent.parent;
            while (
                (stmt.type === "UnaryExpression" && OUTER_IIFE_UNARY_OPS.has(stmt.operator)) ||
                OUTER_IIFE_TRAVERSABLE_TYPES.has(stmt.type)
            ) {
                stmt = stmt.parent;
            }

            return (
                (stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
                stmt.parent?.type === "Program"
            );
        }

        /**
         * Computes the base indent for a function block.
         */
        function getFunctionBlockIndent(calleeNode) {
            const useLastLine = calleeNode.parent?.type === "Property" ||
                calleeNode.parent?.type === "ArrayExpression";
            let indent = getNodeIndent(calleeNode, useLastLine).goodChar;

            if (calleeNode.parent?.type === "CallExpression") {
                indent = adjustForCallExpression(calleeNode, indent);
            }

            return indent;
        }

        /**
         * Adjusts indent when the callee is inside a CallExpression.
         */
        function adjustForCallExpression(calleeNode, indent) {
            const calleeParent = calleeNode.parent;
            const isFuncExpr = calleeNode.type === "FunctionExpression" ||
                calleeNode.type === "ArrowFunctionExpression";

            if (!isFuncExpr) {
                if (calleeParent?.loc.start.line < calleeNode.parent.body?.loc.start.line) {
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

        /**
         * Computes the function body offset based on options.
         */
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

        /**
         * Checks indentation for the body of a function block.
         */
        function checkIndentInFunctionBlock(node) {
            const calleeNode = node.parent;
            let indent = getFunctionBlockIndent(calleeNode);
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

        /**
         * Returns true if the node starts and ends on the same line.
         */
        function isSingleLineNode(node) {
            const lastToken = sourceCode.getLastToken(node);
            return node.loc.start.line === lastToken.loc.end.line;
        }

        /**
         * Computes the expected node indent for an array/object when it's first in line.
         */
        function computeNodeIndentForFirstInLine(node, parentVarNode) {
            const parent = node.parent;
            let nodeIndent = getNodeIndent(parent).goodChar;

            const isFirstDeclaration = !parentVarNode ||
                parentVarNode.loc.start.line !== node.loc.start.line;

            if (!isFirstDeclaration) return nodeIndent;

            const isNotVarOrIsFirstDecl =
                parent.type !== "VariableDeclarator" ||
                parentVarNode === parentVarNode.parent.declarations[0];

            if (!isNotVarOrIsFirstDecl) return nodeIndent;

            nodeIndent = adjustNodeIndentByParentType(node, parent, parentVarNode, nodeIndent);
            return nodeIndent;
        }

        /**
         * Adjusts node indent based on the parent node type.
         */
        function adjustNodeIndentByParentType(node, parent, parentVarNode, nodeIndent) {
            if (parent.type === "VariableDeclarator" &&
                parentVarNode.loc.start.line === parent.loc.start.line) {
                return nodeIndent + indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            }

            if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
                return adjustForArrayOrObjectParent(node, parent, nodeIndent);
            }

            if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                return adjustForCallOrNewExpression(node, parent, nodeIndent);
            }

            if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
                return nodeIndent + indentSize;
            }

            return nodeIndent;
        }

        /**
         * Adjusts indent when parent is an array or object expression.
         */
        function adjustForArrayOrObjectParent(node, parent, nodeIndent) {
            const parentElements = parent.type === "ObjectExpression"
                ? parent.properties
                : parent.elements;

            const firstElem = parentElements[0];
            if (
                firstElem &&
                firstElem.loc.start.line === parent.loc.start.line &&
                firstElem.loc.end.line !== parent.loc.start.line
            ) {
                return nodeIndent; // Multi-line first element: don't increase indent
            }

            if (typeof options[parent.type] === "number") {
                return nodeIndent + options[parent.type] * indentSize;
            }

            return firstElem ? firstElem.loc.start.column : nodeIndent;
        }

        /**
         * Adjusts indent when parent is a call or new expression.
         */
        function adjustForCallOrNewExpression(node, parent, nodeIndent) {
            const argOption = options.CallExpression.arguments;
            if (typeof argOption === "number") {
                return nodeIndent + argOption * indentSize;
            }
            if (argOption === "first" && parent.arguments.includes(node)) {
                return parent.arguments[0].loc.start.column;
            }
            return nodeIndent + indentSize;
        }

        /**
         * Checks indentation for array or object block content.
         */
        function checkIndentInArrayOrObjectBlock(node) {
            if (isSingleLineNode(node)) return;

            const elements = (node.type === "ArrayExpression" ? node.elements : node.properties)
                .filter(Boolean);

            const parentVarNode = getVariableDeclaratorNode(node);
            let nodeIndent;

            if (isNodeFirstInLine(node)) {
                nodeIndent = computeNodeIndentForFirstInLine(node, parentVarNode);
                checkFirstNodeLineIndent(node, nodeIndent);
            } else {
                nodeIndent = getNodeIndent(node).goodChar;
            }

            const elementsIndent = options[node.type] === "first"
                ? (elements.length ? elements[0].loc.start.column : 0)
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

        /**
         * Returns true if the node or its body is a block statement.
         */
        function isNodeBodyBlock(node) {
            return (
                node.type === "BlockStatement" ||
                node.type === "ClassBody" ||
                node.body?.type === "BlockStatement" ||
                node.consequent?.type === "BlockStatement"
            );
        }

        /**
         * Determines the base indent for a block node.
         */
        function getBlockIndent(node) {
            if (node.parent && STATEMENTS_WITH_PROPERTIES.has(node.parent.type) && isNodeBodyBlock(node)) {
                return getNodeIndent(node.parent).goodChar;
            }
            if (node.parent?.type === "CatchClause") {
                return getNodeIndent(node.parent.parent).goodChar;
            }
            return getNodeIndent(node).goodChar;
        }

        /**
         * Determines which child nodes to check for a block.
         */
        function getBlockNodesToCheck(node) {
            if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
                return [node.consequent];
            }
            return Array.isArray(node.body) ? node.body : [node.body];
        }

        /**
         * Checks indentation for block statements.
         */
        function blockIndentationCheck(node) {
            if (isSingleLineNode(node)) return;

            const isFunctionBlock = node.parent && (
                node.parent.type === "FunctionExpression" ||
                node.parent.type === "FunctionDeclaration" ||
                node.parent.type === "ArrowFunctionExpression"
            );

            if (isFunctionBlock) {
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

        /**
         * Filters variable declarations to one per line (excluding the declaration line).
         */
        function filterOutSameLineVars(node) {
            return node.declarations.reduce((acc, elem) => {
                const last = acc.at(-1);
                const isNewLine = elem.loc.start.line !== node.loc.start.line;
                const isDifferentLineFromLast = !last || last.loc.start.line !== elem.loc.start.line;

                if (isNewLine && isDifferentLineFromLast) {
                    acc.push(elem);
                }
                return acc;
            }, []);
        }

        /**
         * Checks indentation for variable declarations.
         */
        function checkIndentInVariableDeclarations(node) {
            const elements = filterOutSameLineVars(node);
            const nodeIndent = getNodeIndent(node).goodChar;
            const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];
            const lastElement = elements.at(-1);

            checkNodesIndent(elements, elementsIndent);

            if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
                return;
            }

            const tokenBeforeLastElement = sourceCode.getTokenBefore(lastElement);
            const lastIndent = tokenBeforeLastElement.value === ","
                ? getNodeIndent(tokenBeforeLastElement).goodChar
                : elementsIndent - indentSize;

            checkLastNodeLineIndent(node, lastIndent);
        }

        /**
         * Checks indentation for blockless loop/conditional bodies.
         */
        function blockLessNodes(node) {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        }

        /**
         * Returns the expected indentation for a switch case.
         */
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

        /**
         * Checks whether a return statement's argument is wrapped in parentheses.
         */
        function isWrappedInParenthesis(node) {
            const statementWithoutArgument = sourceCode
                .getText(node)
                .replace(sourceCode.getText(node.argument), "");
            return /^return\s*\(\s*\)/u.test(statementWithoutArgument);
        }

        /**
         * Checks parameter indentation for function nodes (declarations or expressions).
         */
        function checkFunctionParamIndent(node, optionKey) {
            if (isSingleLineNode(node)) return;

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

        //--------------------------------------------------------------------------
        // Public (Node Visitors)
        //--------------------------------------------------------------------------

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
                    getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"]) ||
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
                if (isSingleLineNode(node)) return;
                checkNodesIndent(node.consequent, expectedCaseIndent(node) + indentSize);
            },

            FunctionDeclaration(node) {
                checkFunctionParamIndent(node, "FunctionDeclaration");
            },

            FunctionExpression(node) {
                checkFunctionParamIndent(node, "FunctionExpression");
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

---

## Key Refactoring Changes

### 1. **Schema Deduplication**
Extracted repeated schema shapes (`SCHEMA_INTEGER`, `SCHEMA_INTEGER_OR_FIRST`, `SCHEMA_FUNCTION_OPTIONS`) into named constants at the top level.

### 2. **Option Parsing Extracted**
Moved the option-parsing logic into a dedicated `parseOptions()` function with loops over option groups, eliminating repetitive `if (typeof opts.X === ...)` blocks.

### 3. **Message Formatting Split**
Split `createErrorMessageData` into two functions: `createErrorMessageData` (orchestrator) and `formatActualIndent` (formats the "actual" string), reducing nesting.

### 4. **Function Block Indent Decomposed**
`checkIndentInFunctionBlock` was broken into:
- `getFunctionBlockIndent` — computes base indent
- `adjustForCallExpression` — handles CallExpression adjustment
- `getFunctionOffset` — computes function body offset

### 5. **Array/Object Indent Decomposed**
`checkIndentInArrayOrObjectBlock` was split into:
- `computeNodeIndentForFirstInLine`
- `adjustNodeIndentByParentType`
- `adjustForArrayOrObjectParent`
- `adjustForCallOrNewExpression`

### 6. **Block Indent Decomposed**
`blockIndentationCheck` was split into `getBlockIndent` and `getBlockNodesToCheck`.

### 7. **Shared Function Parameter Checker**
`FunctionDeclaration` and `FunctionExpression` visitors now share `checkFunctionParamIndent(node, optionKey)`.

### 8. **Set-Based Constants**
`STATEMENTS_WITH_PROPERTIES`, `OUTER_IIFE_UNARY_OPS`, and `OUTER_IIFE_TRAVERSABLE_TYPES` are module-level `Set` constants, avoiding repeated array allocations and `.includes()` calls.

### 9. **Optional Chaining**
Replaced `stmt.parent && stmt.parent.type` with `stmt.parent?.type`.
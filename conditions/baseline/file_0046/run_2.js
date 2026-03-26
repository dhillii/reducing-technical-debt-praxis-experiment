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

const OUTER_IIFE_ANCESTOR_TYPES = new Set([
    "UnaryExpression", "AssignmentExpression", "LogicalExpression",
    "SequenceExpression", "VariableDeclarator",
]);

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

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
        function parseOptions(contextOptions, opts, setIndent) {
            if (!contextOptions.length) return;

            if (contextOptions[0] === "tab") {
                setIndent(1, "tab");
            } /* c8 ignore start */ else if (typeof contextOptions[0] === "number") {
                setIndent(contextOptions[0], "space");
            } /* c8 ignore stop */

            if (!contextOptions[1]) return;

            const userOpts = contextOptions[1];

            opts.SwitchCase = userOpts.SwitchCase || 0;
            applyVariableDeclaratorOption(userOpts.VariableDeclarator, opts);
            applyNumericOption("outerIIFEBody", userOpts, opts);
            applyNumericOption("MemberExpression", userOpts, opts);
            applyObjectOption("FunctionDeclaration", userOpts, opts);
            applyObjectOption("FunctionExpression", userOpts, opts);
            applyObjectOption("CallExpression", userOpts, opts);
            applyScalarOption("ArrayExpression", userOpts, opts);
            applyScalarOption("ObjectExpression", userOpts, opts);
        }

        function applyVariableDeclaratorOption(rule, opts) {
            if (typeof rule === "number") {
                opts.VariableDeclarator = { var: rule, let: rule, const: rule };
            } else if (typeof rule === "object") {
                Object.assign(opts.VariableDeclarator, rule);
            }
        }

        function applyNumericOption(key, userOpts, opts) {
            if (typeof userOpts[key] === "number") {
                opts[key] = userOpts[key];
            }
        }

        function applyObjectOption(key, userOpts, opts) {
            if (typeof userOpts[key] === "object") {
                Object.assign(opts[key], userOpts[key]);
            }
        }

        function applyScalarOption(key, userOpts, opts) {
            const val = userOpts[key];
            if (typeof val === "number" || typeof val === "string") {
                opts[key] = val;
            }
        }

        /**
         * Builds the error message data for an indentation violation.
         */
        function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
            const plural = n => n === 1 ? "" : "s";
            const expected = `${expectedAmount} ${indentType}${plural(expectedAmount)}`;
            let actual;

            if (actualSpaces > 0 && actualTabs > 0) {
                actual = `${actualSpaces} space${plural(actualSpaces)} and ${actualTabs} tab${plural(actualTabs)}`;
            } else if (actualSpaces > 0) {
                actual = indentType === "space" ? actualSpaces : `${actualSpaces} space${plural(actualSpaces)}`;
            } else if (actualTabs > 0) {
                actual = indentType === "tab" ? actualTabs : `${actualTabs} tab${plural(actualTabs)}`;
            } else {
                actual = "0";
            }

            return { expected, actual };
        }

        /**
         * Reports an indentation violation and provides a fix.
         */
        function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
            if (gottenSpaces && gottenTabs) return; // Avoid conflict with no-mixed-spaces-and-tabs

            const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
            const baseOffset = isLastNodeCheck
                ? node.range[1] - node.loc.end.column
                : node.range[0] - node.loc.start.column;
            const textRange = [baseOffset, baseOffset + gottenSpaces + gottenTabs];

            context.report({
                node,
                loc,
                messageId: "expected",
                data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
                fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
            });
        }

        /**
         * Gets the indentation of a node's first or last token.
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
         * Checks whether a node is the first token on its line.
         */
        function isNodeFirstInLine(node, byEndLocation = false) {
            const firstToken = byEndLocation
                ? sourceCode.getLastToken(node, 1)
                : sourceCode.getTokenBefore(node);
            const nodeLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
            const prevLine = firstToken ? firstToken.loc.end.line : -1;

            return nodeLine !== prevLine;
        }

        /**
         * Checks whether a node starts and ends on the same line.
         */
        function isSingleLineNode(node) {
            return node.loc.start.line === sourceCode.getLastToken(node).loc.end.line;
        }

        /**
         * Checks indentation for a single node.
         */
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

            checkCompoundNodeIndent(node, neededIndent);
        }

        /**
         * Handles indentation checks for compound statement keywords (else, catch, finally, while).
         */
        function checkCompoundNodeIndent(node, neededIndent) {
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
                report(
                    node, lastLineIndent, endIndent.space, endIndent.tab,
                    { line: lastToken.loc.start.line, column: lastToken.loc.start.column },
                    true,
                );
            }
        }

        /**
         * Checks indentation of the closing parenthesis in a return statement.
         */
        function checkLastReturnStatementLineIndent(node, firstLineIndent) {
            const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
            const textBefore = sourceCode.getText(lastToken, lastToken.loc.start.column).slice(0, -1);

            if (textBefore.trim()) return; // Tokens before closing paren — skip

            const endIndent = getNodeIndent(lastToken, true);

            if (endIndent.goodChar !== firstLineIndent) {
                report(
                    node, firstLineIndent, endIndent.space, endIndent.tab,
                    { line: lastToken.loc.start.line, column: lastToken.loc.start.column },
                    true,
                );
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
                report(
                    node, firstLineIndent, startIndent.space, startIndent.tab,
                    { line: node.loc.start.line, column: node.loc.start.column },
                );
            }
        }

        /**
         * Walks up the AST to find an ancestor of a given type, stopping at specified types.
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
         * Returns the nearest VariableDeclarator ancestor, or null.
         */
        function getVariableDeclaratorNode(node) {
            return getParentNodeByType(node, "VariableDeclarator");
        }

        /**
         * Returns true if the node is part of a multi-declaration on the same line as the var keyword.
         */
        function isNodeInVarOnTop(node, varNode) {
            return (
                varNode &&
                varNode.parent.loc.start.line === node.loc.start.line &&
                varNode.parent.declarations.length > 1
            );
        }

        /**
         * Returns true if the argument before the callee node spans multiple lines.
         */
        function isArgBeforeCalleeNodeMultiline(node) {
            const { arguments: args } = node.parent;

            if (args.length >= 2 && args[1] === node) {
                return args[0].loc.end.line > args[0].loc.start.line;
            }

            return false;
        }

        /**
         * Returns true if the node is a file-level IIFE.
         */
        function isOuterIIFE(node) {
            const parent = node.parent;

            if (parent.type !== "CallExpression" || parent.callee !== node) return false;

            let stmt = parent.parent;

            while (
                OUTER_IIFE_ANCESTOR_TYPES.has(stmt.type) &&
                (stmt.type !== "UnaryExpression" || OUTER_IIFE_UNARY_OPS.has(stmt.operator))
            ) {
                stmt = stmt.parent;
            }

            return (
                (stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
                stmt.parent?.type === "Program"
            );
        }

        /**
         * Calculates the function offset based on node type and options.
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
         * Resolves the base indent for a function block.
         */
        function resolveFunctionBlockIndent(node, calleeNode) {
            const parentType = calleeNode.parent?.type;

            if (parentType === "Property" || parentType === "ArrayExpression") {
                return getNodeIndent(calleeNode, false).goodChar;
            }

            let indent = getNodeIndent(calleeNode).goodChar;

            if (parentType === "CallExpression") {
                const calleeParent = calleeNode.parent;
                const isFuncExpr = calleeNode.type === "FunctionExpression" || calleeNode.type === "ArrowFunctionExpression";

                if (!isFuncExpr) {
                    if (calleeParent.loc.start.line < node.loc.start.line) {
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

        /**
         * Checks indentation for the body of a function block.
         */
        function checkIndentInFunctionBlock(node) {
            const calleeNode = node.parent;
            const functionOffset = getFunctionOffset(calleeNode);
            let indent = resolveFunctionBlockIndent(node, calleeNode) + functionOffset;

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
         * Calculates the node indent for an array/object that starts on a new line.
         */
        function resolveArrayOrObjectNodeIndent(node, parentVarNode) {
            const parent = node.parent;
            let nodeIndent = getNodeIndent(parent).goodChar;

            const isFirstDeclaration = !parentVarNode ||
                parentVarNode.parent.declarations[0] === parentVarNode;

            if (
                parentVarNode &&
                parentVarNode.loc.start.line === node.loc.start.line
            ) {
                return nodeIndent; // Same line as var — no adjustment
            }

            if (parent.type === "VariableDeclarator" && isFirstDeclaration) {
                if (parentVarNode.loc.start.line === parent.loc.start.line) {
                    nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
                }
            } else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
                nodeIndent = resolveNestedCollectionIndent(node, parent, nodeIndent);
            } else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                nodeIndent = resolveCallExpressionIndent(node, parent, nodeIndent);
            } else if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
                nodeIndent += indentSize;
            }

            return nodeIndent;
        }

        /**
         * Resolves indent for a collection nested inside another collection.
         */
        function resolveNestedCollectionIndent(node, parent, nodeIndent) {
            const parentElements = parent.type === "ObjectExpression"
                ? parent.properties
                : parent.elements;

            if (
                parentElements[0] &&
                parentElements[0].loc.start.line === parent.loc.start.line &&
                parentElements[0].loc.end.line !== parent.loc.start.line
            ) {
                return nodeIndent; // First element spans multiple lines — no adjustment
            }

            if (typeof options[parent.type] === "number") {
                return nodeIndent + options[parent.type] * indentSize;
            }

            return parentElements[0] ? parentElements[0].loc.start.column : nodeIndent;
        }

        /**
         * Resolves indent for a collection inside a call/new expression.
         */
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

        /**
         * Checks indentation for array or object expression contents.
         */
        function checkIndentInArrayOrObjectBlock(node) {
            if (isSingleLineNode(node)) return;

            const rawElements = node.type === "ArrayExpression" ? node.elements : node.properties;
            const elements = rawElements.filter(Boolean);
            const parentVarNode = getVariableDeclaratorNode(node);

            let nodeIndent;

            if (isNodeFirstInLine(node)) {
                nodeIndent = resolveArrayOrObjectNodeIndent(node, parentVarNode);
                checkFirstNodeLineIndent(node, nodeIndent);
            } else {
                nodeIndent = getNodeIndent(node).goodChar;
            }

            let elementsIndent;

            if (options[node.type] === "first") {
                elementsIndent = elements.length ? elements[0].loc.start.column : 0;
            } else {
                elementsIndent = nodeIndent + indentSize * options[node.type];
            }

            if (isNodeInVarOnTop(node, parentVarNode)) {
                elementsIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            }

            checkNodesIndent(elements, elementsIndent);

            if (elements.length > 0 && elements.at(-1).loc.end.line === node.loc.end.line) {
                return; // Last element on same line as closing bracket — skip
            }

            const varIndentAdj = isNodeInVarOnTop(node, parentVarNode)
                ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
                : 0;

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
         * Resolves the base indent for a block statement.
         */
        function resolveBlockIndent(node) {
            if (node.parent && STATEMENTS_WITH_PROPERTIES.has(node.parent.type) && isNodeBodyBlock(node)) {
                return getNodeIndent(node.parent).goodChar;
            }
            if (node.parent?.type === "CatchClause") {
                return getNodeIndent(node.parent.parent).goodChar;
            }
            return getNodeIndent(node).goodChar;
        }

        /**
         * Checks indentation for block statements.
         */
        function blockIndentationCheck(node) {
            if (isSingleLineNode(node)) return;

            const parentType = node.parent?.type;
            const isFunctionBody = parentType === "FunctionExpression" ||
                parentType === "FunctionDeclaration" ||
                parentType === "ArrowFunctionExpression";

            if (isFunctionBody) {
                checkIndentInFunctionBlock(node);
                return;
            }

            const indent = resolveBlockIndent(node);

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
            const lastElement = elements.at(-1);
            const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];

            checkNodesIndent(elements, elementsIndent);

            if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) return;

            const tokenBeforeLastElement = sourceCode.getTokenBefore(lastElement);

            if (tokenBeforeLastElement.value === ",") {
                checkLastNodeLineIndent(node, getNodeIndent(tokenBeforeLastElement).goodChar);
            } else {
                checkLastNodeLineIndent(node, elementsIndent - indentSize);
            }
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

            if (caseIndentStore[cacheKey]) return caseIndentStore[cacheKey];

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
         * Returns true if the return statement's argument is wrapped in parentheses.
         */
        function isWrappedInParenthesis(node) {
            const statementWithoutArgument = sourceCode
                .getText(node)
                .replace(sourceCode.getText(node.argument), "");

            return /^return\s*\(\s*\)/u.test(statementWithoutArgument);
        }

        /**
         * Checks parameter indentation for function declarations/expressions.
         */
        function checkFunctionParamIndent(node, optionKey) {
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

        //--------------------------------------------------------------------------
        // Public (Visitor)
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
                if (typeof options.MemberExpression === "undefined" || isSingleLineNode(node)) return;

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

| Area | Change |
|---|---|
| **Schema** | Extracted reusable schema fragments (`SCHEMA_INTEGER`, `SCHEMA_INTEGER_OR_FIRST`, `SCHEMA_FUNCTION_OPTIONS`) to eliminate repetition |
| **Option parsing** | Extracted `parseOptions` and helper functions (`applyVariableDeclaratorOption`, `applyNumericOption`, `applyObjectOption`, `applyScalarOption`) to replace a long imperative block |
| **`createErrorMessageData`** | Extracted `plural` helper to remove repeated ternary expressions |
| **`report`** | Simplified `textRange` calculation by extracting `baseOffset` |
| **`checkNodeIndent`** | Extracted `checkCompoundNodeIndent` to separate compound-statement keyword checks |
| **`checkIndentInFunctionBlock`** | Split into `getFunctionOffset` and `resolveFunctionBlockIndent` |
| **`checkIndentInArrayOrObjectBlock`** | Split into `resolveArrayOrObjectNodeIndent`, `resolveNestedCollectionIndent`, and `resolveCallExpressionIndent` |
| **`blockIndentationCheck`** | Extracted `resolveBlockIndent`; replaced magic string array with `STATEMENTS_WITH_PROPERTIES` Set |
| **`isOuterIIFE`** | Replaced inline operator checks with `OUTER_IIFE_UNARY_OPS` and `OUTER_IIFE_ANCESTOR_TYPES` Sets |
| **`FunctionDeclaration`/`FunctionExpression` visitors** | Unified into `checkFunctionParamIndent` |
| **Visitor object** | Simplified `ObjectExpression`/`ArrayExpression` to direct references |
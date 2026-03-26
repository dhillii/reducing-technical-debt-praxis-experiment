# Refactored `indent-legacy` Rule

## Key Refactoring Strategies Applied

1. **Extract option parsing** into dedicated functions
2. **Eliminate repetitive patterns** (FunctionDeclaration/FunctionExpression, ArrayExpression/ObjectExpression)
3. **Simplify nested conditionals** using early returns and helper extraction
4. **Replace magic inline logic** with named helpers
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

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Parses the first option to determine indent type and size.
 * @param {*} firstOption
 * @returns {{ indentType: string, indentSize: number }}
 */
function parseIndentOption(firstOption) {
    if (firstOption === "tab") {
        return { indentType: "tab", indentSize: 1 };
    }
    if (typeof firstOption === "number") {
        return { indentType: "space", indentSize: firstOption };
    }
    return { indentType: "space", indentSize: 4 };
}

/**
 * Normalizes VariableDeclarator option into an object form.
 * @param {number|Object} rule
 * @param {Object} current
 * @returns {Object}
 */
function normalizeVariableDeclaratorOption(rule, current) {
    if (typeof rule === "number") {
        return { var: rule, let: rule, const: rule };
    }
    if (typeof rule === "object") {
        return Object.assign({}, current, rule);
    }
    return current;
}

/**
 * Merges user-supplied options with defaults.
 * @param {Array} contextOptions
 * @returns {{ indentType, indentSize, options }}
 */
function parseOptions(contextOptions) {
    const defaults = {
        SwitchCase: 0,
        VariableDeclarator: {
            var: DEFAULT_VARIABLE_INDENT,
            let: DEFAULT_VARIABLE_INDENT,
            const: DEFAULT_VARIABLE_INDENT,
        },
        outerIIFEBody: null,
        FunctionDeclaration: { parameters: DEFAULT_PARAMETER_INDENT, body: DEFAULT_FUNCTION_BODY_INDENT },
        FunctionExpression: { parameters: DEFAULT_PARAMETER_INDENT, body: DEFAULT_FUNCTION_BODY_INDENT },
        CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
        ArrayExpression: 1,
        ObjectExpression: 1,
    };

    const { indentType, indentSize } = parseIndentOption(contextOptions[0]);

    if (!contextOptions[1]) {
        return { indentType, indentSize, options: defaults };
    }

    const opts = contextOptions[1];
    const options = { ...defaults };

    options.SwitchCase = opts.SwitchCase || 0;
    options.VariableDeclarator = normalizeVariableDeclaratorOption(
        opts.VariableDeclarator, defaults.VariableDeclarator
    );

    if (typeof opts.outerIIFEBody === "number") { options.outerIIFEBody = opts.outerIIFEBody; }
    if (typeof opts.MemberExpression === "number") { options.MemberExpression = opts.MemberExpression; }
    if (typeof opts.FunctionDeclaration === "object") { Object.assign(options.FunctionDeclaration, opts.FunctionDeclaration); }
    if (typeof opts.FunctionExpression === "object") { Object.assign(options.FunctionExpression, opts.FunctionExpression); }
    if (typeof opts.CallExpression === "object") { Object.assign(options.CallExpression, opts.CallExpression); }
    if (typeof opts.ArrayExpression === "number" || typeof opts.ArrayExpression === "string") { options.ArrayExpression = opts.ArrayExpression; }
    if (typeof opts.ObjectExpression === "number" || typeof opts.ObjectExpression === "string") { options.ObjectExpression = opts.ObjectExpression; }

    return { indentType, indentSize, options };
}

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
            replacedBy: [
                {
                    message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
                    url: "https://eslint.style/guide/migration",
                    plugin: { name: "@stylistic/eslint-plugin", url: "https://eslint.style" },
                    rule: { name: "indent", url: "https://eslint.style/rules/indent" },
                },
            ],
        },
        fixable: "whitespace",
        schema: [
            { oneOf: [{ enum: ["tab"] }, { type: "integer", minimum: 0 }] },
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
                            parameters: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
                            body: { type: "integer", minimum: 0 },
                        },
                    },
                    FunctionExpression: {
                        type: "object",
                        properties: {
                            parameters: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
                            body: { type: "integer", minimum: 0 },
                        },
                    },
                    CallExpression: {
                        type: "object",
                        properties: {
                            parameters: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
                        },
                    },
                    ArrayExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
                    ObjectExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            expected: "Expected indentation of {{expected}} but found {{actual}}.",
        },
    },

    create(context) {
        const { indentType, indentSize, options } = parseOptions(context.options);
        const sourceCode = context.sourceCode;
        const caseIndentStore = {};

        // -----------------------------------------------------------------------
        // Error reporting helpers
        // -----------------------------------------------------------------------

        /**
         * Builds message data describing expected vs actual indentation.
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
            if (gottenSpaces && gottenTabs) {
                return; // Avoid conflicts with no-mixed-spaces-and-tabs
            }

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

        // -----------------------------------------------------------------------
        // Indent measurement helpers
        // -----------------------------------------------------------------------

        /**
         * Returns the indentation of a node (or its last line).
         */
        function getNodeIndent(node, byLastLine = false) {
            const token = byLastLine
                ? sourceCode.getLastToken(node)
                : sourceCode.getFirstToken(node);

            const srcChars = sourceCode.getText(token, token.loc.start.column).split("");
            const indentChars = srcChars.slice(
                0,
                srcChars.findIndex(ch => ch !== " " && ch !== "\t")
            );

            const spaces = indentChars.filter(ch => ch === " ").length;
            const tabs = indentChars.filter(ch => ch === "\t").length;

            return {
                space: spaces,
                tab: tabs,
                goodChar: indentType === "space" ? spaces : tabs,
                badChar: indentType === "space" ? tabs : spaces,
            };
        }

        /**
         * Returns true if the node starts on a different line than the preceding token.
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
         * Returns true if the node starts and ends on the same line.
         */
        function isSingleLineNode(node) {
            const lastToken = sourceCode.getLastToken(node);
            return node.loc.start.line === lastToken.loc.end.line;
        }

        // -----------------------------------------------------------------------
        // Indent check helpers
        // -----------------------------------------------------------------------

        /**
         * Checks indentation of a single node, including associated tokens
         * (else, catch, finally, while for do-while).
         */
        function checkNodeIndent(node, neededIndent) {
            const actualIndent = getNodeIndent(node, false);
            const isWrongIndent =
                actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0;
            const isNotArrayOrObject =
                node.type !== "ArrayExpression" && node.type !== "ObjectExpression";

            if (isNotArrayOrObject && isWrongIndent && isNodeFirstInLine(node)) {
                report(node, neededIndent, actualIndent.space, actualIndent.tab);
            }

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
                    true
                );
            }
        }

        /**
         * Checks the closing parenthesis of a return statement.
         */
        function checkLastReturnStatementLineIndent(node, firstLineIndent) {
            const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
            const textBeforeClosingParen = sourceCode
                .getText(lastToken, lastToken.loc.start.column)
                .slice(0, -1);

            if (textBeforeClosingParen.trim()) {
                return; // Tokens before closing paren — skip
            }

            const endIndent = getNodeIndent(lastToken, true);
            if (endIndent.goodChar !== firstLineIndent) {
                report(
                    node, firstLineIndent, endIndent.space, endIndent.tab,
                    { line: lastToken.loc.start.line, column: lastToken.loc.start.column },
                    true
                );
            }
        }

        /**
         * Checks that the opening token of a node is correctly indented.
         */
        function checkFirstNodeLineIndent(node, firstLineIndent) {
            const startIndent = getNodeIndent(node, false);

            if (
                (startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
                isNodeFirstInLine(node)
            ) {
                report(
                    node, firstLineIndent, startIndent.space, startIndent.tab,
                    { line: node.loc.start.line, column: node.loc.start.column }
                );
            }
        }

        // -----------------------------------------------------------------------
        // AST traversal helpers
        // -----------------------------------------------------------------------

        /**
         * Walks up the AST to find an ancestor of the given type,
         * stopping at any node type in stopAtList.
         */
        function getParentNodeByType(node, type, stopAtList) {
            const stopAtSet = new Set(stopAtList || ["Program"]);
            let parent = node.parent;

            while (
                parent.type !== type &&
                !stopAtSet.has(parent.type) &&
                parent.type !== "Program"
            ) {
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
                varNode !== null &&
                varNode !== undefined &&
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

        /**
         * Returns true if the node or its body is a BlockStatement or ClassBody.
         */
        function isNodeBodyBlock(node) {
            return (
                node.type === "BlockStatement" ||
                node.type === "ClassBody" ||
                node.body?.type === "BlockStatement" ||
                node.consequent?.type === "BlockStatement"
            );
        }

        // -----------------------------------------------------------------------
        // Function-specific indent logic
        // -----------------------------------------------------------------------

        /**
         * Computes the base indent for a function body block.
         */
        function getFunctionBodyBaseIndent(calleeNode) {
            const usePropertyIndent =
                calleeNode.parent?.type === "Property" ||
                calleeNode.parent?.type === "ArrayExpression";

            let indent = getNodeIndent(calleeNode, usePropertyIndent).goodChar;

            if (calleeNode.parent?.type === "CallExpression") {
                const calleeParent = calleeNode.parent;
                const isFunctionNode =
                    calleeNode.type === "FunctionExpression" ||
                    calleeNode.type === "ArrowFunctionExpression";

                if (!isFunctionNode) {
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

        /**
         * Computes the function body offset based on node type and options.
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
            const functionOffset = getFunctionOffset(calleeNode);
            let indent = getFunctionBodyBaseIndent(calleeNode) + functionOffset;

            const parentVarNode = getVariableDeclaratorNode(node);
            if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
                indent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            }

            if (node.body.length > 0) {
                checkNodesIndent(node.body, indent);
            }
            checkLastNodeLineIndent(node, indent - functionOffset);
        }

        // -----------------------------------------------------------------------
        // Array/Object indent logic
        // -----------------------------------------------------------------------

        /**
         * Computes the expected node indent for an array/object that starts a new line.
         */
        function computeNodeIndentForArrayOrObject(node, parentVarNode) {
            const parent = node.parent;
            let nodeIndent = getNodeIndent(parent).goodChar;

            const isFirstDeclarator =
                !parentVarNode ||
                parentVarNode === parentVarNode.parent.declarations[0];

            if (
                parentVarNode &&
                parentVarNode.loc.start.line === node.loc.start.line
            ) {
                return nodeIndent; // Already on the same line as var
            }

            if (!isFirstDeclarator) {
                return nodeIndent;
            }

            if (parent.type === "VariableDeclarator" &&
                parentVarNode.loc.start.line === parent.loc.start.line) {
                nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            } else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
                nodeIndent = computeNestedCollectionIndent(node, parent, nodeIndent);
            } else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                nodeIndent = computeCallExpressionIndent(node, parent, nodeIndent);
            } else if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
                nodeIndent += indentSize;
            }

            return nodeIndent;
        }

        /**
         * Computes indent for a collection nested inside another collection.
         */
        function computeNestedCollectionIndent(node, parent, nodeIndent) {
            const parentElements = parent.type === "ObjectExpression"
                ? parent.properties
                : parent.elements;

            if (
                parentElements[0] &&
                parentElements[0].loc.start.line === parent.loc.start.line &&
                parentElements[0].loc.end.line !== parent.loc.start.line
            ) {
                return nodeIndent; // First element spans multiple lines — don't increase
            }

            if (typeof options[parent.type] === "number") {
                return nodeIndent + options[parent.type] * indentSize;
            }

            return parentElements[0] ? parentElements[0].loc.start.column : nodeIndent;
        }

        /**
         * Computes indent for a collection inside a call/new expression.
         */
        function computeCallExpressionIndent(node, parent, nodeIndent) {
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
         * Checks indentation for array and object expressions.
         */
        function checkIndentInArrayOrObjectBlock(node) {
            if (isSingleLineNode(node)) {
                return;
            }

            const elements = (node.type === "ArrayExpression" ? node.elements : node.properties)
                .filter(Boolean);

            const parentVarNode = getVariableDeclaratorNode(node);
            let nodeIndent;

            if (isNodeFirstInLine(node)) {
                nodeIndent = computeNodeIndentForArrayOrObject(node, parentVarNode);
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
                return; // Last element on same line as closing bracket
            }

            checkLastNodeLineIndent(node, nodeIndent + varIndentOffset);
        }

        // -----------------------------------------------------------------------
        // Block indent logic
        // -----------------------------------------------------------------------

        /**
         * Checks indentation for block statements and class bodies.
         */
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

        /**
         * Resolves the base indent for a block node.
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
         * Resolves the list of child nodes to check for a block.
         */
        function resolveNodesToCheck(node) {
            if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
                return [node.consequent];
            }
            if (Array.isArray(node.body)) {
                return node.body;
            }
            return [node.body];
        }

        // -----------------------------------------------------------------------
        // Variable declaration indent logic
        // -----------------------------------------------------------------------

        /**
         * Filters declarations to one per line (excluding the declaration's own line).
         */
        function filterOutSameLineVars(node) {
            return node.declarations.reduce((acc, elem) => {
                const last = acc.at(-1);
                const isNewLine = elem.loc.start.line !== node.loc.start.line;
                const isDifferentFromLast = last && last.loc.start.line !== elem.loc.start.line;

                if ((isNewLine && !last) || isDifferentFromLast) {
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

        // -----------------------------------------------------------------------
        // Switch case indent logic
        // -----------------------------------------------------------------------

        /**
         * Returns the expected indent for a case/default clause.
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

        // -----------------------------------------------------------------------
        // Function parameter indent logic
        // -----------------------------------------------------------------------

        /**
         * Checks parameter indentation for function declarations or expressions.
         * @param {ASTNode} node FunctionDeclaration or FunctionExpression
         * @param {Object} funcOptions options.FunctionDeclaration or options.FunctionExpression
         */
        function checkFunctionParamIndent(node, funcOptions) {
            if (isSingleLineNode(node)) {
                return;
            }
            if (funcOptions.parameters === "first" && node.params.length) {
                checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
            } else if (funcOptions.parameters !== null) {
                checkNodesIndent(
                    node.params,
                    getNodeIndent(node).goodChar + indentSize * funcOptions.parameters
                );
            }
        }

        // -----------------------------------------------------------------------
        // Misc helpers
        // -----------------------------------------------------------------------

        /**
         * Checks indentation for blockless loop/conditional bodies.
         */
        function blockLessNodes(node) {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        }

        /**
         * Returns true if a return statement's argument is wrapped in parentheses.
         */
        function isWrappedInParenthesis(node) {
            const statementWithoutArgument = sourceCode
                .getText(node)
                .replace(sourceCode.getText(node.argument), "");
            return /^return\s*\(\s*\)/u.test(statementWithoutArgument);
        }

        // -----------------------------------------------------------------------
        // Visitor
        // -----------------------------------------------------------------------

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
                checkNodesIndent(node.cases, expectedCaseIndent(node, switchIndent));
                checkLastNodeLineIndent(node, switchIndent);
            },

            SwitchCase(node) {
                if (isSingleLineNode(node)) {
                    return;
                }
                checkNodesIndent(node.consequent, expectedCaseIndent(node) + indentSize);
            },

            FunctionDeclaration(node) {
                checkFunctionParamIndent(node, options.FunctionDeclaration);
            },

            FunctionExpression(node) {
                checkFunctionParamIndent(node, options.FunctionExpression);
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
                        getNodeIndent(node).goodChar + indentSize * argOption
                    );
                }
            },
        };
    },
};
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **Option parsing** | Inline imperative code in `create()` | Extracted `parseOptions`, `parseIndentOption`, `normalizeVariableDeclaratorOption` |
| **Constants** | Defined inside `create()` | Module-level constants (`UNARY_OPERATORS`, `STATEMENTS_WITH_PROPERTIES`) |
| **FunctionDeclaration/Expression** | Duplicated visitor handlers | Unified `checkFunctionParamIndent(node, funcOptions)` |
| **Array/Object indent** | One deeply nested 80-line function | Split into `computeNodeIndentForArrayOrObject`, `computeNestedCollectionIndent`, `computeCallExpressionIndent` |
| **Block indent** | Mixed concerns in `blockIndentationCheck` | Extracted `resolveBlockIndent` and `resolveNodesToCheck` |
| **Function body indent** | Mixed in `checkIndentInFunctionBlock` | Extracted `getFunctionBodyBaseIndent` and `getFunctionOffset` |
| **Plural helper** | Repeated ternary expressions | Inline `plural` helper in `createErrorMessageData` |
| **`isOuterIIFE`** | Long `||` chain for unary operators | `UNARY_OPERATORS` Set lookup |
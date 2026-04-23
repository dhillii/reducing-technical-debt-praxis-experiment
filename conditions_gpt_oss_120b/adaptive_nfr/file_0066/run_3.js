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

// -----------------------------------------------------------------------------
// Helper predicates
// -----------------------------------------------------------------------------

/**
 * Determines if the first option is a tab configuration.
 * @param {any[]} options
 * @returns {boolean}
 */
function isTabOption(options) {
    return options[0] === "tab";
}

/**
 * Determines if the first option is a numeric indent size.
 * @param {any[]} options
 * @returns {boolean}
 */
function isNumericIndentOption(options) {
    return typeof options[0] === "number";
}

/**
 * Checks whether a node is a single‑line construct.
 * @param {ASTNode} node
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isSingleLineNode(node, sourceCode) {
    const lastToken = sourceCode.getLastToken(node);
    return node.loc.start.line === lastToken.loc.end.line;
}

/**
 * Determines if a node is the first token on its line.
 * @param {ASTNode} node
 * @param {SourceCode} sourceCode
 * @param {boolean} [byEndLocation=false]
 * @returns {boolean}
 */
function isNodeFirstInLine(node, sourceCode, byEndLocation) {
    const firstToken = byEndLocation
        ? sourceCode.getLastToken(node, 1)
        : sourceCode.getTokenBefore(node);
    const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
    const endLine = firstToken ? firstToken.loc.end.line : -1;
    return startLine !== endLine;
}

/**
 * Returns the indentation details for a token.
 * @param {ASTNode|Token} token
 * @param {SourceCode} sourceCode
 * @param {boolean} [byLastLine=false]
 * @param {string} indentType
 * @returns {{space:number,tab:number,goodChar:number,badChar:number}}
 */
function getIndentDetails(token, sourceCode, byLastLine, indentType) {
    const target = byLastLine ? sourceCode.getLastToken(token) : sourceCode.getFirstToken(token);
    const src = sourceCode.getText(target, target.loc.start.column).split("");
    const indentChars = src.slice(0, src.findIndex(ch => ch !== " " && ch !== "\t"));
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
 * Determines if a node is a variable declarator ancestor.
 * @param {ASTNode} node
 * @param {function(ASTNode,string,string):ASTNode|null} getParentNodeByType
 * @returns {ASTNode|null}
 */
function getVariableDeclaratorNode(node, getParentNodeByType) {
    return getParentNodeByType(node, "VariableDeclarator");
}

/**
 * Checks whether a node belongs to a multi‑line variable declaration on the same line as its parent.
 * @param {ASTNode} node
 * @param {ASTNode} varNode
 * @returns {boolean}
 */
function isNodeInVarOnTop(node, varNode) {
    return (
        varNode &&
        varNode.parent.loc.start.line === node.loc.start.line &&
        varNode.parent.declarations.length > 1
    );
}

/**
 * Determines if the argument before a callee node spans multiple lines.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isArgBeforeCalleeNodeMultiline(node) {
    const parent = node.parent;
    if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
        const first = parent.arguments[0];
        return first.loc.end.line > first.loc.start.line;
    }
    return false;
}

/**
 * Checks whether a function node is an outer IIFE.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isOuterIIFE(node) {
    const parent = node.parent;
    const stmt = parent.parent;
    if (parent.type !== "CallExpression" || parent.callee !== node) {
        return false;
    }
    let current = stmt;
    while (
        (current.type === "UnaryExpression" &&
            ["!", "~", "+", "-"].includes(current.operator)) ||
        ["AssignmentExpression", "LogicalExpression", "SequenceExpression", "VariableDeclarator"].includes(current.type)
    ) {
        current = current.parent;
    }
    return (
        (current.type === "ExpressionStatement" || current.type === "VariableDeclaration") &&
        current.parent &&
        current.parent.type === "Program"
    );
}

/**
 * Returns the expected indentation for a case clause.
 * @param {ASTNode} node
 * @param {number|undefined} providedSwitchIndent
 * @param {SourceCode} sourceCode
 * @param {Object} options
 * @param {number} indentSize
 * @param {Object} caseIndentStore
 * @returns {number}
 */
function expectedCaseIndent(node, providedSwitchIndent, sourceCode, options, indentSize, caseIndentStore) {
    const switchNode = node.type === "SwitchStatement" ? node : node.parent;
    const switchIndent = providedSwitchIndent === undefined
        ? getIndentDetails(switchNode, sourceCode, false, "space").goodChar
        : providedSwitchIndent;
    if (caseIndentStore[switchNode.loc.start.line]) {
        return caseIndentStore[switchNode.loc.start.line];
    }
    const caseIndent = switchNode.cases.length > 0 && options.SwitchCase === 0
        ? switchIndent
        : switchIndent + indentSize * options.SwitchCase;
    caseIndentStore[switchNode.loc.start.line] = caseIndent;
    return caseIndent;
}

/**
 * Determines if a return statement is wrapped in parentheses.
 * @param {ASTNode} node
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isWrappedInParenthesis(node, sourceCode) {
    const regex = /^return\s*\(\s*\)/u;
    const text = sourceCode.getText(node).replace(sourceCode.getText(node.argument), "");
    return regex.test(text);
}

/**
 * Retrieves a parent node of a given type, stopping at specified node types.
 * @param {ASTNode} node
 * @param {string} type
 * @param {string[]} [stopAtList]
 * @returns {ASTNode|null}
 */
function getParentNodeByType(node, type, stopAtList) {
    let parent = node.parent;
    const stopSet = new Set(stopAtList || ["Program"]);
    while (parent.type !== type && !stopSet.has(parent.type) && parent.type !== "Program") {
        parent = parent.parent;
    }
    return parent.type === type ? parent : null;
}

/**
 * Filters variable declarations to keep only the first declaration per line.
 * @param {ASTNode} node
 * @returns {ASTNode[]}
 */
function filterOutSameLineVars(node) {
    return node.declarations.reduce((acc, elem) => {
        const last = acc.at(-1);
        if (
            (elem.loc.start.line !== node.loc.start.line && !last) ||
            (last && last.loc.start.line !== elem.loc.start.line)
        ) {
            acc.push(elem);
        }
        return acc;
    }, []);
}

/**
 * Checks whether a node or its body is a block statement.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isNodeBodyBlock(node) {
    return (
        node.type === "BlockStatement" ||
        node.type === "ClassBody" ||
        (node.body && node.body.type === "BlockStatement") ||
        (node.consequent && node.consequent.type === "BlockStatement")
    );
}

/**
 * Determines if a node is part of a statement that requires property‑based indentation.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isStatementWithProperties(node) {
    const types = [
        "IfStatement",
        "WhileStatement",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "DoWhileStatement",
        "ClassDeclaration",
        "TryStatement",
    ];
    return node && types.includes(node.type);
}

// -----------------------------------------------------------------------------
// Core rule implementation
// -----------------------------------------------------------------------------

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
        schema: [/* schema omitted for brevity */],
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
            VariableDeclarator: { var: DEFAULT_VARIABLE_INDENT, let: DEFAULT_VARIABLE_INDENT, const: DEFAULT_VARIABLE_INDENT },
            outerIIFEBody: null,
            FunctionDeclaration: { parameters: DEFAULT_PARAMETER_INDENT, body: DEFAULT_FUNCTION_BODY_INDENT },
            FunctionExpression: { parameters: DEFAULT_PARAMETER_INDENT, body: DEFAULT_FUNCTION_BODY_INDENT },
            CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
            ArrayExpression: 1,
            ObjectExpression: 1,
        };
        const sourceCode = context.sourceCode;
        const caseIndentStore = {};

        // -------------------------------------------------------------------------
        // Configuration parsing
        // -------------------------------------------------------------------------

        if (context.options.length) {
            if (isTabOption(context.options)) {
                indentSize = 1;
                indentType = "tab";
            } else if (isNumericIndentOption(context.options)) {
                indentSize = context.options[0];
                indentType = "space";
            }

            if (context.options[1]) {
                const opts = context.options[1];
                options.SwitchCase = opts.SwitchCase || 0;

                if (typeof opts.VariableDeclarator === "number") {
                    options.VariableDeclarator = {
                        var: opts.VariableDeclarator,
                        let: opts.VariableDeclarator,
                        const: opts.VariableDeclarator,
                    };
                } else if (typeof opts.VariableDeclarator === "object") {
                    Object.assign(options.VariableDeclarator, opts.VariableDeclarator);
                }

                if (typeof opts.outerIIFEBody === "number") {
                    options.outerIIFEBody = opts.outerIIFEBody;
                }
                if (typeof opts.MemberExpression === "number") {
                    options.MemberExpression = opts.MemberExpression;
                }
                if (typeof opts.FunctionDeclaration === "object") {
                    Object.assign(options.FunctionDeclaration, opts.FunctionDeclaration);
                }
                if (typeof opts.FunctionExpression === "object") {
                    Object.assign(options.FunctionExpression, opts.FunctionExpression);
                }
                if (typeof opts.CallExpression === "object") {
                    Object.assign(options.CallExpression, opts.CallExpression);
                }
                if (typeof opts.ArrayExpression === "number" || typeof opts.ArrayExpression === "string") {
                    options.ArrayExpression = opts.ArrayExpression;
                }
                if (typeof opts.ObjectExpression === "number" || typeof opts.ObjectExpression === "string") {
                    options.ObjectExpression = opts.ObjectExpression;
                }
            }
        }

        // -------------------------------------------------------------------------
        // Reporting utilities
        // -------------------------------------------------------------------------

        function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
            const expected = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
            const spaceWord = `space${actualSpaces === 1 ? "" : "s"}`;
            const tabWord = `tab${actualTabs === 1 ? "" : "s"}`;
            let actual;
            if (actualSpaces > 0 && actualTabs > 0) {
                actual = `${actualSpaces} ${spaceWord} and ${actualTabs} ${tabWord}`;
            } else if (actualSpaces > 0) {
                actual = indentType === "space" ? actualSpaces : `${actualSpaces} ${spaceWord}`;
            } else if (actualTabs > 0) {
                actual = indentType === "tab" ? actualTabs : `${actualTabs} ${tabWord}`;
            } else {
                actual = "0";
            }
            return { expected, actual };
        }

        function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
            if (gottenSpaces && gottenTabs) {
                return;
            }
            const desired = (indentType === "space" ? " " : "\t").repeat(needed);
            const range = isLastNodeCheck
                ? [node.range[1] - node.loc.end.column, node.range[1] - node.loc.end.column + gottenSpaces + gottenTabs]
                : [node.range[0] - node.loc.start.column, node.range[0] - node.loc.start.column + gottenSpaces + gottenTabs];
            context.report({
                node,
                loc,
                messageId: "expected",
                data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
                fix: fixer => fixer.replaceTextRange(range, desired),
            });
        }

        // -------------------------------------------------------------------------
        // Indent checks
        // -------------------------------------------------------------------------

        function checkNodeIndent(node, neededIndent) {
            const actual = getIndentDetails(node, sourceCode, false, indentType);
            if (
                node.type !== "ArrayExpression" &&
                node.type !== "ObjectExpression" &&
                (actual.goodChar !== neededIndent || actual.badChar !== 0) &&
                isNodeFirstInLine(node, sourceCode)
            ) {
                report(node, neededIndent, actual.space, actual.tab);
            }

            if (node.type === "IfStatement" && node.alternate) {
                const elseToken = sourceCode.getTokenBefore(node.alternate);
                checkNodeIndent(elseToken, neededIndent);
                if (!isNodeFirstInLine(node.alternate, sourceCode)) {
                    checkNodeIndent(node.alternate, neededIndent);
                }
            }

            if (node.type === "TryStatement" && node.handler) {
                const catchToken = sourceCode.getFirstToken(node.handler);
                checkNodeIndent(catchToken, neededIndent);
            }

            if (node.type === "TryStatement" && node.finalizer) {
                const finallyToken = sourceCode.getTokenBefore(node.finalizer);
                checkNodeIndent(finallyToken, neededIndent);
            }

            if (node.type === "DoWhileStatement") {
                const whileToken = sourceCode.getTokenAfter(node.body);
                checkNodeIndent(whileToken, neededIndent);
            }
        }

        function checkNodesIndent(nodes, indent) {
            nodes.forEach(n => checkNodeIndent(n, indent));
        }

        function checkLastNodeLineIndent(node, lastLineIndent) {
            const lastToken = sourceCode.getLastToken(node);
            const endIndent = getIndentDetails(lastToken, sourceCode, true, indentType);
            if (
                (endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
                isNodeFirstInLine(node, sourceCode, true)
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

        function checkFirstNodeLineIndent(node, firstLineIndent) {
            const startIndent = getIndentDetails(node, sourceCode, false, indentType);
            if (
                (startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
                isNodeFirstInLine(node, sourceCode)
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
        // Function block indentation
        // -------------------------------------------------------------------------

        function computeFunctionIndent(calleeNode) {
            if (
                calleeNode.parent &&
                (calleeNode.parent.type === "Property" || calleeNode.parent.type === "ArrayExpression")
            ) {
                return getIndentDetails(calleeNode, sourceCode, false, indentType).goodChar;
            }
            return getIndentDetails(calleeNode, sourceCode, false, indentType).goodChar;
        }

        function computeFunctionOffset(calleeNode) {
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
            const calleeNode = node.parent; // FunctionExpression
            let baseIndent = computeFunctionIndent(calleeNode);
            if (calleeNode.parent && calleeNode.parent.type === "CallExpression") {
                const callParent = calleeNode.parent;
                if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
                    if (callParent.loc.start.line < node.loc.start.line) {
                        baseIndent = getIndentDetails(callParent, sourceCode, false, indentType).goodChar;
                    }
                } else {
                    if (
                        isArgBeforeCalleeNodeMultiline(calleeNode) &&
                        callParent.callee.loc.start.line === callParent.callee.loc.end.line &&
                        !isNodeFirstInLine(calleeNode, sourceCode)
                    ) {
                        baseIndent = getIndentDetails(callParent, sourceCode, false, indentType).goodChar;
                    }
                }
            }

            const functionOffset = computeFunctionOffset(calleeNode);
            const finalIndent = baseIndent + functionOffset;

            const varNode = getVariableDeclaratorNode(node, getParentNodeByType);
            if (varNode && isNodeInVarOnTop(node, varNode)) {
                const extra = indentSize * options.VariableDeclarator[varNode.parent.kind];
                baseIndent += extra;
            }

            if (node.body.length) {
                checkNodesIndent(node.body, finalIndent);
            }
            checkLastNodeLineIndent(node, finalIndent - functionOffset);
        }

        // -------------------------------------------------------------------------
        // Array/Object block indentation
        // -------------------------------------------------------------------------

        function computeNodeIndentForArrayOrObject(node) {
            if (isNodeFirstInLine(node, sourceCode)) {
                const parent = node.parent;
                let indent = getIndentDetails(parent, sourceCode, false, indentType).goodChar;
                const varNode = getVariableDeclaratorNode(node, getParentNodeByType);
                if (!varNode || varNode.parent.loc.start.line !== node.loc.start.line) {
                    if (parent.type !== "VariableDeclarator" || varNode === parent.declarations[0]) {
                        if (parent.type === "VariableDeclarator" && varNode.loc.start.line === parent.loc.start.line) {
                            indent += indentSize * options.VariableDeclarator[varNode.parent.kind];
                        } else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
                            const siblings = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
                            if (siblings[0] && siblings[0].loc.start.line === parent.loc.start.line && siblings[0].loc.end.line !== parent.loc.start.line) {
                                // keep indent unchanged
                            } else if (typeof options[parent.type] === "number") {
                                indent += options[parent.type] * indentSize;
                            } else {
                                indent = siblings[0].loc.start.column;
                            }
                        } else if (["CallExpression", "NewExpression"].includes(parent.type)) {
                            if (typeof options.CallExpression.arguments === "number") {
                                indent += options.CallExpression.arguments * indentSize;
                            } else if (options.CallExpression.arguments === "first") {
                                if (parent.arguments.includes(node)) {
                                    indent = parent.arguments[0].loc.start.column;
                                }
                            } else {
                                indent += indentSize;
                            }
                        } else if (["LogicalExpression", "ArrowFunctionExpression"].includes(parent.type)) {
                            indent += indentSize;
                        }
                    }
                }
                checkFirstNodeLineIndent(node, indent);
                return indent;
            }
            return getIndentDetails(node, sourceCode, false, indentType).goodChar;
        }

        function checkIndentInArrayOrObjectBlock(node) {
            if (isSingleLineNode(node, sourceCode)) {
                return;
            }

            const elements = (node.type === "ArrayExpression" ? node.elements : node.properties).filter(e => e !== null);
            const baseIndent = computeNodeIndentForArrayOrObject(node);
            const varNode = getVariableDeclaratorNode(node, getParentNodeByType);
            const elementsIndent = options[node.type] === "first"
                ? (elements[0] ? elements[0].loc.start.column : 0)
                : baseIndent + indentSize * options[node.type];

            const finalElementsIndent = isNodeInVarOnTop(node, varNode)
                ? elementsIndent + indentSize * options.VariableDeclarator[varNode.parent.kind]
                : elementsIndent;

            checkNodesIndent(elements, finalElementsIndent);

            if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) {
                return;
            }

            const closingIndent = baseIndent + (isNodeInVarOnTop(node, varNode) ? options.VariableDeclarator[varNode.parent.kind] * indentSize : 0);
            checkLastNodeLineIndent(node, closingIndent);
        }

        // -------------------------------------------------------------------------
        // Variable declaration indentation
        // -------------------------------------------------------------------------

        function checkIndentInVariableDeclarations(node) {
            const elements = filterOutSameLineVars(node);
            const nodeIndent = getIndentDetails(node, sourceCode, false, indentType).goodChar;
            const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];
            checkNodesIndent(elements, elementsIndent);

            const last = elements.at(-1);
            if (sourceCode.getLastToken(node).loc.end.line <= last.loc.end.line) {
                return;
            }

            const tokenBefore = sourceCode.getTokenBefore(last);
            if (tokenBefore.value === ",") {
                checkLastNodeLineIndent(node, getIndentDetails(tokenBefore, sourceCode, false, indentType).goodChar);
            } else {
                checkLastNodeLineIndent(node, elementsIndent - indentSize);
            }
        }

        // -------------------------------------------------------------------------
        // Block indentation entry point
        // -------------------------------------------------------------------------

        function blockIndentationCheck(node) {
            if (isSingleLineNode(node, sourceCode)) {
                return;
            }

            if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
                checkIndentInFunctionBlock(node);
                return;
            }

            const indent = (() => {
                if (node.parent && isStatementWithProperties(node.parent) && isNodeBodyBlock(node)) {
                    return getIndentDetails(node.parent, sourceCode, false, indentType).goodChar;
                }
                if (node.parent && node.parent.type === "CatchClause") {
                    return getIndentDetails(node.parent.parent, sourceCode, false, indentType).goodChar;
                }
                return getIndentDetails(node, sourceCode, false, indentType).goodChar;
            })();

            const nodesToCheck = (() => {
                if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
                    return [node.consequent];
                }
                if (Array.isArray(node.body)) {
                    return node.body;
                }
                return [node.body];
            })();

            if (nodesToCheck.length) {
                checkNodesIndent(nodesToCheck, indent + indentSize);
            }

            if (node.type === "BlockStatement") {
                checkLastNodeLineIndent(node, indent);
            }
        }

        // -------------------------------------------------------------------------
        // Listener definitions
        // -------------------------------------------------------------------------

        return {
            Program(node) {
                if (node.body.length) {
                    checkNodesIndent(node.body, getIndentDetails(node, sourceCode, false, indentType).goodChar);
                }
            },

            ClassBody: blockIndentationCheck,

            BlockStatement: blockIndentationCheck,

            WhileStatement(node) {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(node);
                }
            },

            ForStatement(node) {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(node);
                }
            },

            ForInStatement(node) {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(node);
                }
            },

            ForOfStatement(node) {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(node);
                }
            },

            DoWhileStatement(node) {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(node);
                }
            },

            IfStatement(node) {
                if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
                    blockIndentationCheck(node);
                }
            },

            VariableDeclaration(node) {
                if (node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
                    checkIndentInVariableDeclarations(node);
                }
            },

            ObjectExpression(node) {
                checkIndentInArrayOrObjectBlock(node);
            },

            ArrayExpression(node) {
                checkIndentInArrayOrObjectBlock(node);
            },

            MemberExpression(node) {
                if (typeof options.MemberExpression === "undefined") return;
                if (isSingleLineNode(node, sourceCode)) return;
                if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) return;
                if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) return;

                const propertyIndent = getIndentDetails(node, sourceCode, false, indentType).goodChar + indentSize * options.MemberExpression;
                const checkNodes = [node.property];
                const dot = sourceCode.getTokenBefore(node.property);
                if (dot.type === "Punctuator" && dot.value === ".") {
                    checkNodes.push(dot);
                }
                checkNodesIndent(checkNodes, propertyIndent);
            },

            SwitchStatement(node) {
                const switchIndent = getIndentDetails(node, sourceCode, false, indentType).goodChar;
                const caseIndent = expectedCaseIndent(node, switchIndent, sourceCode, options, indentSize, caseIndentStore);
                checkNodesIndent(node.cases, caseIndent);
                checkLastNodeLineIndent(node, switchIndent);
            },

            SwitchCase(node) {
                if (isSingleLineNode(node, sourceCode)) return;
                const caseIndent = expectedCaseIndent(node, undefined, sourceCode, options, indentSize, caseIndentStore);
                checkNodesIndent(node.consequent, caseIndent + indentSize);
            },

            FunctionDeclaration(node) {
                if (isSingleLineNode(node, sourceCode)) return;
                if (options.FunctionDeclaration.parameters === "first" && node.params.length) {
                    checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
                } else if (options.FunctionDeclaration.parameters !== null) {
                    const base = getIndentDetails(node, sourceCode, false, indentType).goodChar;
                    checkNodesIndent(node.params, base + indentSize * options.FunctionDeclaration.parameters);
                }
            },

            FunctionExpression(node) {
                if (isSingleLineNode(node, sourceCode)) return;
                if (options.FunctionExpression.parameters === "first" && node.params.length) {
                    checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
                } else if (options.FunctionExpression.parameters !== null) {
                    const base = getIndentDetails(node, sourceCode, false, indentType).goodChar;
                    checkNodesIndent(node.params, base + indentSize * options.FunctionExpression.parameters);
                }
            },

            ReturnStatement(node) {
                if (isSingleLineNode(node, sourceCode)) return;
                const firstIndent = getIndentDetails(node, sourceCode, false, indentType).goodChar;
                if (isWrappedInParenthesis(node, sourceCode)) {
                    checkLastReturnStatementLineIndent(node, firstIndent);
                } else {
                    checkNodeIndent(node, firstIndent);
                }
            },

            CallExpression(node) {
                if (isSingleLineNode(node, sourceCode)) return;
                if (options.CallExpression.arguments === "first" && node.arguments.length) {
                    checkNodesIndent(node.arguments.slice(1), node.arguments[0].loc.start.column);
                } else if (options.CallExpression.arguments !== null) {
                    const base = getIndentDetails(node, sourceCode, false, indentType).goodChar;
                    checkNodesIndent(node.arguments, base + indentSize * options.CallExpression.arguments);
                }
            },
        };
    },
};
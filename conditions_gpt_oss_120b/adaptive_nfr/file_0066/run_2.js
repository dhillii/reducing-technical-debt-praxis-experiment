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

/**
 * Determines if the first option configures tab indentation.
 * @param {any[]} options
 * @returns {boolean}
 */
function isTabOption(options) {
    return options[0] === "tab";
}

/**
 * Determines if the first option configures space indentation.
 * @param {any[]} options
 * @returns {boolean}
 */
function isSpaceOption(options) {
    return typeof options[0] === "number";
}

/**
 * Determines if a node is a single‑line construct.
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
    const token = byEndLocation
        ? sourceCode.getLastToken(node, 1)
        : sourceCode.getTokenBefore(node);
    const line = byEndLocation ? node.loc.end.line : node.loc.start.line;
    const tokenLine = token ? token.loc.end.line : -1;
    return line !== tokenLine;
}

/**
 * Retrieves the indentation of a token.
 * @param {ASTNode|Token} token
 * @param {SourceCode} sourceCode
 * @param {boolean} [byLastLine=false]
 * @param {string} indentType
 * @returns {{space:number,tab:number,goodChar:number,badChar:number}}
 */
function getIndent(token, sourceCode, byLastLine, indentType) {
    const src = sourceCode.getText(token, token.loc.start.column);
    const chars = src.split("").slice(0, src.search(/[^\t ]/));
    const spaces = chars.filter(c => c === " ").length;
    const tabs = chars.filter(c => c === "\t").length;
    return {
        space: spaces,
        tab: tabs,
        goodChar: indentType === "space" ? spaces : tabs,
        badChar: indentType === "space" ? tabs : spaces,
    };
}

/**
 * Determines if a node is part of a multi‑line variable declaration.
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
 * Determines if a node represents an outer IIFE.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isOuterIIFE(node) {
    const parent = node.parent;
    if (parent.type !== "CallExpression" || parent.callee !== node) {
        return false;
    }
    let stmt = parent.parent;
    while (
        (stmt.type === "UnaryExpression" &&
            ["!", "~", "+", "-"].includes(stmt.operator)) ||
        ["AssignmentExpression", "LogicalExpression", "SequenceExpression", "VariableDeclarator"].includes(stmt.type)
    ) {
        stmt = stmt.parent;
    }
    return (
        (stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
        stmt.parent &&
        stmt.parent.type === "Program"
    );
}

/**
 * Determines if a node is a function block that should be checked.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isFunctionBlock(node) {
    return (
        node.parent &&
        ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)
    );
}

/**
 * Determines if a node is a statement with properties that affect indentation.
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
    return node.parent && types.includes(node.parent.type);
}

/**
 * Determines if a node is a block statement or similar.
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
 * Determines if a node is a CatchClause.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isCatchClause(node) {
    return node.parent && node.parent.type === "CatchClause";
}

/**
 * Determines if a node is a SwitchStatement.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isSwitchStatement(node) {
    return node.type === "SwitchStatement";
}

/**
 * Determines if a node is a SwitchCase.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isSwitchCase(node) {
    return node.type === "SwitchCase";
}

/**
 * Determines if a node is a ReturnStatement wrapped in parentheses.
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
 * Retrieves the parent node of a given type.
 * @param {ASTNode} node
 * @param {string} type
 * @param {string[]} [stopAtList]
 * @returns {ASTNode|null}
 */
function getParentNodeByType(node, type, stopAtList) {
    let parent = node.parent;
    const stopSet = new Set(stopAtList || ["Program"]);
    while (parent && parent.type !== type && !stopSet.has(parent.type) && parent.type !== "Program") {
        parent = parent.parent;
    }
    return parent && parent.type === type ? parent : null;
}

/**
 * Retrieves the VariableDeclarator ancestor.
 * @param {ASTNode} node
 * @returns {ASTNode|null}
 */
function getVariableDeclaratorNode(node) {
    return getParentNodeByType(node, "VariableDeclarator");
}

/**
 * Filters variable declarations to those not on the same line.
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
 * Creates an error message data object.
 * @param {number} expectedAmount
 * @param {number} actualSpaces
 * @param {number} actualTabs
 * @param {string} indentType
 * @returns {{expected:string,actual:string}}
 */
function createErrorMessageData(expectedAmount, actualSpaces, actualTabs, indentType) {
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

/**
 * Reports an indentation violation.
 * @param {RuleContext} context
 * @param {ASTNode} node
 * @param {number} needed
 * @param {number} spaces
 * @param {number} tabs
 * @param {Object} [loc]
 * @param {boolean} [isLastNodeCheck]
 * @param {string} indentType
 */
function report(context, node, needed, spaces, tabs, loc, isLastNodeCheck, indentType) {
    if (spaces && tabs) {
        return;
    }
    const desired = (indentType === "space" ? " " : "\t").repeat(needed);
    const range = isLastNodeCheck
        ? [
              node.range[1] - node.loc.end.column,
              node.range[1] - node.loc.end.column + spaces + tabs,
          ]
        : [
              node.range[0] - node.loc.start.column,
              node.range[0] - node.loc.start.column + spaces + tabs,
          ];
    context.report({
        node,
        loc,
        messageId: "expected",
        data: createErrorMessageData(needed, spaces, tabs, indentType),
        fix: fixer => fixer.replaceTextRange(range, desired),
    });
}

/**
 * Checks indentation for a node.
 * @param {RuleContext} context
 * @param {ASTNode} node
 * @param {number} neededIndent
 * @param {string} indentType
 * @param {SourceCode} sourceCode
 */
function checkNodeIndent(context, node, neededIndent, indentType, sourceCode) {
    const actual = getIndent(node, sourceCode, false, indentType);
    if (
        node.type !== "ArrayExpression" &&
        node.type !== "ObjectExpression" &&
        (actual.goodChar !== neededIndent || actual.badChar !== 0) &&
        isNodeFirstInLine(node, sourceCode)
    ) {
        report(context, node, neededIndent, actual.space, actual.tab, null, false, indentType);
    }

    if (node.type === "IfStatement" && node.alternate) {
        const elseToken = sourceCode.getTokenBefore(node.alternate);
        checkNodeIndent(context, elseToken, neededIndent, indentType, sourceCode);
        if (!isNodeFirstInLine(node.alternate, sourceCode)) {
            checkNodeIndent(context, node.alternate, neededIndent, indentType, sourceCode);
        }
    }

    if (node.type === "TryStatement" && node.handler) {
        const catchToken = sourceCode.getFirstToken(node.handler);
        checkNodeIndent(context, catchToken, neededIndent, indentType, sourceCode);
    }

    if (node.type === "TryStatement" && node.finalizer) {
        const finallyToken = sourceCode.getTokenBefore(node.finalizer);
        checkNodeIndent(context, finallyToken, neededIndent, indentType, sourceCode);
    }

    if (node.type === "DoWhileStatement") {
        const whileToken = sourceCode.getTokenAfter(node.body);
        checkNodeIndent(context, whileToken, neededIndent, indentType, sourceCode);
    }
}

/**
 * Checks indentation for an array of nodes.
 * @param {RuleContext} context
 * @param {ASTNode[]} nodes
 * @param {number} indent
 * @param {string} indentType
 * @param {SourceCode} sourceCode
 */
function checkNodesIndent(context, nodes, indent, indentType, sourceCode) {
    nodes.forEach(node => checkNodeIndent(context, node, indent, indentType, sourceCode));
}

/**
 * Checks the last line indentation of a node.
 * @param {RuleContext} context
 * @param {ASTNode} node
 * @param {number} lastLineIndent
 * @param {string} indentType
 * @param {SourceCode} sourceCode
 */
function checkLastNodeLineIndent(context, node, lastLineIndent, indentType, sourceCode) {
    const lastToken = sourceCode.getLastToken(node);
    const endIndent = getIndent(lastToken, sourceCode, true, indentType);
    if (
        (endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
        isNodeFirstInLine(node, sourceCode, true)
    ) {
        report(
            context,
            node,
            lastLineIndent,
            endIndent.space,
            endIndent.tab,
            { line: lastToken.loc.start.line, column: lastToken.loc.start.column },
            true,
            indentType,
        );
    }
}

/**
 * Checks the first line indentation of a node.
 * @param {RuleContext} context
 * @param {ASTNode} node
 * @param {number} firstLineIndent
 * @param {string} indentType
 * @param {SourceCode} sourceCode
 */
function checkFirstNodeLineIndent(context, node, firstLineIndent, indentType, sourceCode) {
    const startIndent = getIndent(node, sourceCode, false, indentType);
    if (
        (startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
        isNodeFirstInLine(node, sourceCode)
    ) {
        report(
            context,
            node,
            firstLineIndent,
            startIndent.space,
            startIndent.tab,
            { line: node.loc.start.line, column: node.loc.start.column },
            false,
            indentType,
        );
    }
}

/**
 * Checks indentation inside a function block.
 * @param {RuleContext} context
 * @param {ASTNode} node
 * @param {Object} options
 * @param {number} indentSize
 * @param {string} indentType
 * @param {SourceCode} sourceCode
 */
function checkIndentInFunctionBlock(context, node, options, indentSize, indentType, sourceCode) {
    const calleeNode = node.parent; // FunctionExpression or Declaration
    let baseIndent;

    if (
        calleeNode.parent &&
        ["Property", "ArrayExpression"].includes(calleeNode.parent.type)
    ) {
        baseIndent = getIndent(calleeNode, sourceCode, false, indentType).goodChar;
    } else {
        baseIndent = getIndent(calleeNode, sourceCode, false, indentType).goodChar;
    }

    if (calleeNode.parent.type === "CallExpression") {
        const callParent = calleeNode.parent;
        if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
            if (callParent.loc.start.line < node.loc.start.line) {
                baseIndent = getIndent(callParent, sourceCode, false, indentType).goodChar;
            }
        } else if (
            isArgBeforeCalleeNodeMultiline(calleeNode) &&
            callParent.callee.loc.start.line === callParent.callee.loc.end.line &&
            !isNodeFirstInLine(calleeNode, sourceCode)
        ) {
            baseIndent = getIndent(callParent, sourceCode, false, indentType).goodChar;
        }
    }

    let offset = indentSize;
    if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
        offset = options.outerIIFEBody * indentSize;
    } else if (calleeNode.type === "FunctionExpression") {
        offset = options.FunctionExpression.body * indentSize;
    } else if (calleeNode.type === "FunctionDeclaration") {
        offset = options.FunctionDeclaration.body * indentSize;
    }
    const finalIndent = baseIndent + offset;

    const varNode = getVariableDeclaratorNode(node);
    let adjustedIndent = finalIndent;
    if (varNode && isNodeInVarOnTop(node, varNode)) {
        adjustedIndent += indentSize * options.VariableDeclarator[varNode.parent.kind];
    }

    if (node.body.length) {
        checkNodesIndent(context, node.body, adjustedIndent, indentType, sourceCode);
    }
    checkLastNodeLineIndent(context, node, finalIndent - offset, indentType, sourceCode);
}

/**
 * Checks indentation for array or object literals.
 * @param {RuleContext} context
 * @param {ASTNode} node
 * @param {Object} options
 * @param {number} indentSize
 * @param {string} indentType
 * @param {SourceCode} sourceCode
 */
function checkIndentInArrayOrObjectBlock(context, node, options, indentSize, indentType, sourceCode) {
    if (isSingleLineNode(node, sourceCode)) {
        return;
    }

    const elements = (node.type === "ArrayExpression" ? node.elements : node.properties)
        .filter(e => e !== null);

    const parentVarNode = getVariableDeclaratorNode(node);
    let nodeIndent;

    if (isNodeFirstInLine(node, sourceCode)) {
        const parent = node.parent;
        nodeIndent = getIndent(parent, sourceCode, false, indentType).goodChar;

        if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
            if (parent.type !== "VariableDeclarator" || parentVarNode === parentVarNode.parent.declarations[0]) {
                if (parent.type === "VariableDeclarator" && parentVarNode.loc.start.line === parent.loc.start.line) {
                    nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
                } else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
                    const parentElems = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
                    if (
                        parentElems[0] &&
                        parentElems[0].loc.start.line === parent.loc.start.line &&
                        parentElems[0].loc.end.line !== parent.loc.start.line
                    ) {
                        // keep nodeIndent unchanged
                    } else if (typeof options[parent.type] === "number") {
                        nodeIndent += options[parent.type] * indentSize;
                    } else {
                        nodeIndent = parentElems[0].loc.start.column;
                    }
                } else if (["CallExpression", "NewExpression"].includes(parent.type)) {
                    if (typeof options.CallExpression.arguments === "number") {
                        nodeIndent += options.CallExpression.arguments * indentSize;
                    } else if (options.CallExpression.arguments === "first") {
                        if (parent.arguments.includes(node)) {
                            nodeIndent = parent.arguments[0].loc.start.column;
                        }
                    } else {
                        nodeIndent += indentSize;
                    }
                } else if (["LogicalExpression", "ArrowFunctionExpression"].includes(parent.type)) {
                    nodeIndent += indentSize;
                }
            }
        }

        checkFirstNodeLineIndent(context, node, nodeIndent, indentType, sourceCode);
    } else {
        nodeIndent = getIndent(node, sourceCode, false, indentType).goodChar;
    }

    const elementsIndent = options[node.type] === "first"
        ? (elements[0] ? elements[0].loc.start.column : 0)
        : nodeIndent + indentSize * options[node.type];

    if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
        nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
    }

    checkNodesIndent(context, elements, elementsIndent, indentType, sourceCode);

    if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) {
        return;
    }

    const extra = isNodeInVarOnTop(node, parentVarNode)
        ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
        : 0;

    checkLastNodeLineIndent(context, node, nodeIndent + extra, indentType, sourceCode);
}

/**
 * Checks indentation for variable declarations.
 * @param {RuleContext} context
 * @param {ASTNode} node
 * @param {Object} options
 * @param {number} indentSize
 * @param {string} indentType
 * @param {SourceCode} sourceCode
 */
function checkIndentInVariableDeclarations(context, node, options, indentSize, indentType, sourceCode) {
    const elements = filterOutSameLineVars(node);
    const nodeIndent = getIndent(node, sourceCode, false, indentType).goodChar;
    const last = elements.at(-1);
    const elemIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];

    checkNodesIndent(context, elements, elemIndent, indentType, sourceCode);

    if (sourceCode.getLastToken(node).loc.end.line <= last.loc.end.line) {
        return;
    }

    const tokenBefore = sourceCode.getTokenBefore(last);
    if (tokenBefore.value === ",") {
        checkLastNodeLineIndent(
            context,
            node,
            getIndent(tokenBefore, sourceCode, false, indentType).goodChar,
            indentType,
            sourceCode,
        );
    } else {
        checkLastNodeLineIndent(context, node, elemIndent - indentSize, indentType, sourceCode);
    }
}

/**
 * Checks block indentation.
 * @param {RuleContext} context
 * @param {ASTNode} node
 * @param {Object} options
 * @param {number} indentSize
 * @param {string} indentType
 * @param {SourceCode} sourceCode
 */
function blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode) {
    if (isSingleLineNode(node, sourceCode)) {
        return;
    }

    if (isFunctionBlock(node)) {
        checkIndentInFunctionBlock(context, node, options, indentSize, indentType, sourceCode);
        return;
    }

    let baseIndent;
    if (isStatementWithProperties(node)) {
        baseIndent = getIndent(node.parent, sourceCode, false, indentType).goodChar;
    } else if (isCatchClause(node)) {
        baseIndent = getIndent(node.parent.parent, sourceCode, false, indentType).goodChar;
    } else {
        baseIndent = getIndent(node, sourceCode, false, indentType).goodChar;
    }

    const nodesToCheck = node.type === "IfStatement" && node.consequent.type !== "BlockStatement"
        ? [node.consequent]
        : Array.isArray(node.body) ? node.body : [node.body];

    if (nodesToCheck.length) {
        checkNodesIndent(context, nodesToCheck, baseIndent + indentSize, indentType, sourceCode);
    }

    if (node.type === "BlockStatement") {
        checkLastNodeLineIndent(context, node, baseIndent, indentType, sourceCode);
    }
}

/**
 * Main rule definition.
 */
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
                                oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
                            },
                            body: { type: "integer", minimum: 0 },
                        },
                    },
                    FunctionExpression: {
                        type: "object",
                        properties: {
                            parameters: {
                                oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
                            },
                            body: { type: "integer", minimum: 0 },
                        },
                    },
                    CallExpression: {
                        type: "object",
                        properties: {
                            parameters: {
                                oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
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
            VariableDeclarator: { var: DEFAULT_VARIABLE_INDENT, let: DEFAULT_VARIABLE_INDENT, const: DEFAULT_VARIABLE_INDENT },
            outerIIFEBody: null,
            FunctionDeclaration: { parameters: DEFAULT_PARAMETER_INDENT, body: DEFAULT_FUNCTION_BODY_INDENT },
            FunctionExpression: { parameters: DEFAULT_PARAMETER_INDENT, body: DEFAULT_FUNCTION_BODY_INDENT },
            CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
            ArrayExpression: 1,
            ObjectExpression: 1,
        };

        const sourceCode = context.sourceCode;

        if (context.options.length) {
            if (isTabOption(context.options)) {
                indentSize = 1;
                indentType = "tab";
            } else if (isSpaceOption(context.options)) {
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

        const caseIndentStore = {};

        return {
            Program(node) {
                if (node.body.length) {
                    checkNodesIndent(context, node.body, getIndent(node, sourceCode, false, indentType).goodChar, indentType, sourceCode);
                }
            },

            ClassBody: node => blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode),

            BlockStatement: node => blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode),

            WhileStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode);
                }
            },

            ForStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode);
                }
            },

            ForInStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode);
                }
            },

            ForOfStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode);
                }
            },

            DoWhileStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode);
                }
            },

            IfStatement(node) {
                if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
                    blockIndentationCheck(context, node, options, indentSize, indentType, sourceCode);
                }
            },

            VariableDeclaration(node) {
                const decls = node.declarations;
                if (decls.at(-1).loc.start.line > decls[0].loc.start.line) {
                    checkIndentInVariableDeclarations(context, node, options, indentSize, indentType, sourceCode);
                }
            },

            ObjectExpression(node) {
                checkIndentInArrayOrObjectBlock(context, node, options, indentSize, indentType, sourceCode);
            },

            ArrayExpression(node) {
                checkIndentInArrayOrObjectBlock(context, node, options, indentSize, indentType, sourceCode);
            },

            MemberExpression(node) {
                if (typeof options.MemberExpression === "undefined") {
                    return;
                }
                if (isSingleLineNode(node, sourceCode)) {
                    return;
                }
                if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) {
                    return;
                }
                if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) {
                    return;
                }

                const propertyIndent = getIndent(node, sourceCode, false, indentType).goodChar + indentSize * options.MemberExpression;
                const checkNodes = [node.property];
                const dot = sourceCode.getTokenBefore(node.property);
                if (dot.type === "Punctuator" && dot.value === ".") {
                    checkNodes.push(dot);
                }
                checkNodesIndent(context, checkNodes, propertyIndent, indentType, sourceCode);
            },

            SwitchStatement(node) {
                const switchIndent = getIndent(node, sourceCode, false, indentType).goodChar;
                const caseIndent = (() => {
                    const switchNode = node;
                    const base = typeof caseIndentStore[switchNode.loc.start.line] !== "undefined"
                        ? caseIndentStore[switchNode.loc.start.line]
                        : null;
                    if (base !== null) {
                        return base;
                    }
                    const calc = switchNode.cases.length && options.SwitchCase === 0
                        ? switchIndent
                        : switchIndent + indentSize * options.SwitchCase;
                    caseIndentStore[switchNode.loc.start.line] = calc;
                    return calc;
                })();

                checkNodesIndent(context, node.cases, caseIndent, indentType, sourceCode);
                checkLastNodeLineIndent(context, node, switchIndent, indentType, sourceCode);
            },

            SwitchCase(node) {
                if (isSingleLineNode(node, sourceCode)) {
                    return;
                }
                const caseIndent = (() => {
                    const switchNode = node.parent;
                    const base = typeof caseIndentStore[switchNode.loc.start.line] !== "undefined"
                        ? caseIndentStore[switchNode.loc.start.line]
                        : null;
                    if (base !== null) {
                        return base;
                    }
                    const calc = switchNode.cases.length && options.SwitchCase === 0
                        ? getIndent(switchNode, sourceCode, false, indentType).goodChar
                        : getIndent(switchNode, sourceCode, false, indentType).goodChar + indentSize * options.SwitchCase;
                    caseIndentStore[switchNode.loc.start.line] = calc;
                    return calc;
                })();

                checkNodesIndent(context, node.consequent, caseIndent + indentSize, indentType, sourceCode);
            },

            FunctionDeclaration(node) {
                if (isSingleLineNode(node, sourceCode)) {
                    return;
                }
                if (options.FunctionDeclaration.parameters === "first" && node.params.length) {
                    checkNodesIndent(context, node.params.slice(1), node.params[0].loc.start.column, indentType, sourceCode);
                } else if (options.FunctionDeclaration.parameters !== null) {
                    const base = getIndent(node, sourceCode, false, indentType).goodChar + indentSize * options.FunctionDeclaration.parameters;
                    checkNodesIndent(context, node.params, base, indentType, sourceCode);
                }
            },

            FunctionExpression(node) {
                if (isSingleLineNode(node, sourceCode)) {
                    return;
                }
                if (options.FunctionExpression.parameters === "first" && node.params.length) {
                    checkNodesIndent(context, node.params.slice(1), node.params[0].loc.start.column, indentType, sourceCode);
                } else if (options.FunctionExpression.parameters !== null) {
                    const base = getIndent(node, sourceCode, false, indentType).goodChar + indentSize * options.FunctionExpression.parameters;
                    checkNodesIndent(context, node.params, base, indentType, sourceCode);
                }
            },

            ReturnStatement(node) {
                if (isSingleLineNode(node, sourceCode)) {
                    return;
                }
                const firstIndent = getIndent(node, sourceCode, false, indentType).goodChar;
                if (isWrappedInParenthesis(node, sourceCode)) {
                    checkLastNodeLineIndent(context, node, firstIndent, indentType, sourceCode);
                } else {
                    checkNodeIndent(context, node, firstIndent, indentType, sourceCode);
                }
            },

            CallExpression(node) {
                if (isSingleLineNode(node, sourceCode)) {
                    return;
                }
                if (options.CallExpression.arguments === "first" && node.arguments.length) {
                    checkNodesIndent(context, node.arguments.slice(1), node.arguments[0].loc.start.column, indentType, sourceCode);
                } else if (options.CallExpression.arguments !== null) {
                    const base = getIndent(node, sourceCode, false, indentType).goodChar + indentSize * options.CallExpression.arguments;
                    checkNodesIndent(context, node.arguments, base, indentType, sourceCode);
                }
            },
        };
    },
};
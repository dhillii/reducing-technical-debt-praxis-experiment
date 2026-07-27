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

// Default constants
const DEFAULT_VARIABLE_INDENT = 1;
const DEFAULT_PARAMETER_INDENT = null; // For backwards compatibility, don't check parameter indentation unless specified in the config
const DEFAULT_FUNCTION_BODY_INDENT = 1;

/**
 * Parse rule options and return normalized configuration.
 * @param {RuleContext} context ESLint rule context
 * @returns {{indentSize:number,indentType:string,options:Object}} Normalized config
 */
function parseOptions(context) {
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

    if (context.options.length) {
        if (context.options[0] === "tab") {
            indentSize = 1;
            indentType = "tab";
        } else if (typeof context.options[0] === "number") {
            indentSize = context.options[0];
            indentType = "space";
        }

        if (context.options[1]) {
            const opts = context.options[1];

            options.SwitchCase = opts.SwitchCase || 0;

            const variableDeclaratorRules = opts.VariableDeclarator;
            if (typeof variableDeclaratorRules === "number") {
                options.VariableDeclarator = {
                    var: variableDeclaratorRules,
                    let: variableDeclaratorRules,
                    const: variableDeclaratorRules,
                };
            } else if (typeof variableDeclaratorRules === "object") {
                Object.assign(options.VariableDeclarator, variableDeclaratorRules);
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

    return { indentSize, indentType, options };
}

/**
 * Create an error message data object.
 * @param {Object} state Shared state
 * @param {number} expectedAmount Expected indentation amount
 * @param {number} actualSpaces Actual spaces count
 * @param {number} actualTabs Actual tabs count
 * @returns {{expected:string,actual:string}} Message data
 */
function createErrorMessageData(state, expectedAmount, actualSpaces, actualTabs) {
    const { indentType } = state;
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

/**
 * Report an indentation violation.
 * @param {Object} state Shared state
 * @param {ASTNode} node Node to report
 * @param {number} needed Expected indent count
 * @param {number} gottenSpaces Actual spaces
 * @param {number} gottenTabs Actual tabs
 * @param {Object} [loc] Location override
 * @param {boolean} [isLastNodeCheck] Whether this is a last‑node check
 */
function report(state, node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
    if (gottenSpaces && gottenTabs) {
        return;
    }

    const { indentType, indentSize, context } = state;
    const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
    const textRange = isLastNodeCheck
        ? [
              node.range[1] - node.loc.end.column,
              node.range[1] - node.loc.end.column + gottenSpaces + gottenTabs,
          ]
        : [
              node.range[0] - node.loc.start.column,
              node.range[0] - node.loc.start.column + gottenSpaces + gottenTabs,
          ];

    context.report({
        node,
        loc,
        messageId: "expected",
        data: createErrorMessageData(state, needed, gottenSpaces, gottenTabs),
        fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
    });
}

/**
 * Get indentation details for a node or token.
 * @param {Object} state Shared state
 * @param {ASTNode|Token} node Node/token
 * @param {boolean} [byLastLine=false] Use last line
 * @returns {{space:number,tab:number,goodChar:number,badChar:number}}
 */
function getNodeIndent(state, node, byLastLine) {
    const { sourceCode, indentType } = state;
    const token = byLastLine ? sourceCode.getLastToken(node) : sourceCode.getFirstToken(node);
    const srcCharsBeforeNode = sourceCode.getText(token, token.loc.start.column).split("");
    const indentChars = srcCharsBeforeNode.slice(
        0,
        srcCharsBeforeNode.findIndex(ch => ch !== " " && ch !== "\t")
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
 * Determine if a node is the first token on its line.
 * @param {Object} state Shared state
 * @param {ASTNode} node Node to test
 * @param {boolean} [byEndLocation=false] Use end location
 * @returns {boolean}
 */
function isNodeFirstInLine(state, node, byEndLocation) {
    const { sourceCode } = state;
    const firstToken = byEndLocation
        ? sourceCode.getLastToken(node, 1)
        : sourceCode.getTokenBefore(node);
    const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
    const endLine = firstToken ? firstToken.loc.end.line : -1;
    return startLine !== endLine;
}

/**
 * Check indentation for a single node.
 * @param {Object} state Shared state
 * @param {ASTNode} node Node to check
 * @param {number} neededIndent Expected indent
 */
function checkNodeIndent(state, node, neededIndent) {
    const actualIndent = getNodeIndent(state, node, false);

    if (
        node.type !== "ArrayExpression" &&
        node.type !== "ObjectExpression" &&
        (actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
        isNodeFirstInLine(state, node)
    ) {
        report(state, node, neededIndent, actualIndent.space, actualIndent.tab);
    }

    if (node.type === "IfStatement" && node.alternate) {
        const elseToken = state.sourceCode.getTokenBefore(node.alternate);
        checkNodeIndent(state, elseToken, neededIndent);
        if (!isNodeFirstInLine(state, node.alternate)) {
            checkNodeIndent(state, node.alternate, neededIndent);
        }
    }

    if (node.type === "TryStatement" && node.handler) {
        const catchToken = state.sourceCode.getFirstToken(node.handler);
        checkNodeIndent(state, catchToken, neededIndent);
    }

    if (node.type === "TryStatement" && node.finalizer) {
        const finallyToken = state.sourceCode.getTokenBefore(node.finalizer);
        checkNodeIndent(state, finallyToken, neededIndent);
    }

    if (node.type === "DoWhileStatement") {
        const whileToken = state.sourceCode.getTokenAfter(node.body);
        checkNodeIndent(state, whileToken, neededIndent);
    }
}

/**
 * Apply checkNodeIndent to an array of nodes.
 * @param {Object} state Shared state
 * @param {ASTNode[]} nodes Nodes to check
 * @param {number} indent Expected indent
 */
function checkNodesIndent(state, nodes, indent) {
    nodes.forEach(node => checkNodeIndent(state, node, indent));
}

/**
 * Verify the closing line of a block.
 * @param {Object} state Shared state
 * @param {ASTNode} node Block node
 * @param {number} lastLineIndent Expected indent for the closing line
 */
function checkLastNodeLineIndent(state, node, lastLineIndent) {
    const lastToken = state.sourceCode.getLastToken(node);
    const endIndent = getNodeIndent(state, lastToken, true);

    if (
        (endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
        isNodeFirstInLine(state, node, true)
    ) {
        report(
            state,
            node,
            lastLineIndent,
            endIndent.space,
            endIndent.tab,
            { line: lastToken.loc.start.line, column: lastToken.loc.start.column },
            true
        );
    }
}

/**
 * Special handling for return statements that end with a closing parenthesis.
 * @param {Object} state Shared state
 * @param {ASTNode} node ReturnStatement node
 * @param {number} firstLineIndent Expected indent for the first line
 */
function checkLastReturnStatementLineIndent(state, node, firstLineIndent) {
    const lastToken = state.sourceCode.getLastToken(node, astUtils.isClosingParenToken);
    const textBeforeClosingParenthesis = state.sourceCode
        .getText(lastToken, lastToken.loc.start.column)
        .slice(0, -1);

    if (textBeforeClosingParenthesis.trim()) {
        return;
    }

    const endIndent = getNodeIndent(state, lastToken, true);
    if (endIndent.goodChar !== firstLineIndent) {
        report(
            state,
            node,
            firstLineIndent,
            endIndent.space,
            endIndent.tab,
            { line: lastToken.loc.start.line, column: lastToken.loc.start.column },
            true
        );
    }
}

/**
 * Verify the first line indentation of a node.
 * @param {Object} state Shared state
 * @param {ASTNode} node Node to check
 * @param {number} firstLineIndent Expected indent
 */
function checkFirstNodeLineIndent(state, node, firstLineIndent) {
    const startIndent = getNodeIndent(state, node, false);
    if (
        (startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
        isNodeFirstInLine(state, node)
    ) {
        report(
            state,
            node,
            firstLineIndent,
            startIndent.space,
            startIndent.tab,
            { line: node.loc.start.line, column: node.loc.start.column }
        );
    }
}

/**
 * Walk up the AST to find a parent of a given type.
 * @param {ASTNode} node Starting node
 * @param {string} type Desired parent type
 * @param {string[]} [stopAtList] Types at which to stop searching
 * @returns {ASTNode|null}
 */
function getParentNodeByType(node, type, stopAtList) {
    let parent = node.parent;
    const stopAtSet = new Set(stopAtList || ["Program"]);

    while (parent.type !== type && !stopAtSet.has(parent.type) && parent.type !== "Program") {
        parent = parent.parent;
    }

    return parent.type === type ? parent : null;
}

/**
 * Retrieve the nearest VariableDeclarator ancestor.
 * @param {ASTNode} node Node to examine
 * @returns {ASTNode|null}
 */
function getVariableDeclaratorNode(node) {
    return getParentNodeByType(node, "VariableDeclarator");
}

/**
 * Determine if a node belongs to a multi‑line variable declaration on the same line as its declarator.
 * @param {ASTNode} node Node to check
 * @param {ASTNode} varNode VariableDeclarator node
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
 * Detect if the argument before a callee is multiline and there is only one preceding argument.
 * @param {ASTNode} node Argument node
 * @returns {boolean}
 */
function isArgBeforeCalleeNodeMultiline(node) {
    const parent = node.parent;
    if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
        return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
    }
    return false;
}

/**
 * Identify outermost IIFE wrappers.
 * @param {ASTNode} node FunctionExpression node
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
        current.type === "AssignmentExpression" ||
        current.type === "LogicalExpression" ||
        current.type === "SequenceExpression" ||
        current.type === "VariableDeclarator"
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
 * Check indentation inside a function block.
 * @param {Object} state Shared state
 * @param {ASTNode} node BlockStatement node
 */
function checkIndentInFunctionBlock(state, node) {
    const calleeNode = node.parent; // FunctionExpression or similar
    let indent;

    if (
        calleeNode.parent &&
        (calleeNode.parent.type === "Property" || calleeNode.parent.type === "ArrayExpression")
    ) {
        indent = getNodeIndent(state, calleeNode, false).goodChar;
    } else {
        indent = getNodeIndent(state, calleeNode).goodChar;
    }

    if (calleeNode.parent.type === "CallExpression") {
        const calleeParent = calleeNode.parent;
        if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
            if (calleeParent && calleeParent.loc.start.line < node.loc.start.line) {
                indent = getNodeIndent(state, calleeParent).goodChar;
            }
        } else {
            if (
                isArgBeforeCalleeNodeMultiline(calleeNode) &&
                calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
                !isNodeFirstInLine(state, calleeNode)
            ) {
                indent = getNodeIndent(state, calleeParent).goodChar;
            }
        }
    }

    let functionOffset = state.indentSize;
    if (state.options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
        functionOffset = state.options.outerIIFEBody * state.indentSize;
    } else if (calleeNode.type === "FunctionExpression") {
        functionOffset = state.options.FunctionExpression.body * state.indentSize;
    } else if (calleeNode.type === "FunctionDeclaration") {
        functionOffset = state.options.FunctionDeclaration.body * state.indentSize;
    }
    indent += functionOffset;

    const parentVarNode = getVariableDeclaratorNode(node);
    if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
        indent += state.indentSize * state.options.VariableDeclarator[parentVarNode.parent.kind];
    }

    if (node.body.length > 0) {
        checkNodesIndent(state, node.body, indent);
    }

    checkLastNodeLineIndent(state, node, indent - functionOffset);
}

/**
 * Determine if a node spans a single line.
 * @param {Object} state Shared state
 * @param {ASTNode} node Node to test
 * @returns {boolean}
 */
function isSingleLineNode(state, node) {
    const lastToken = state.sourceCode.getLastToken(node);
    return node.loc.start.line === lastToken.loc.end.line;
}

/**
 * Check indentation for array or object literals.
 * @param {Object} state Shared state
 * @param {ASTNode} node ArrayExpression or ObjectExpression node
 */
function checkIndentInArrayOrObjectBlock(state, node) {
    if (isSingleLineNode(state, node)) {
        return;
    }

    let elements = node.type === "ArrayExpression" ? node.elements : node.properties;
    elements = elements.filter(e => e !== null);
    const parentVarNode = getVariableDeclaratorNode(node);
    let nodeIndent;
    let elementsIndent;

    if (isNodeFirstInLine(state, node)) {
        const parent = node.parent;
        nodeIndent = getNodeIndent(state, parent).goodChar;

        if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
            if (parent.type !== "VariableDeclarator" || parentVarNode === parentVarNode.parent.declarations[0]) {
                if (parent.type === "VariableDeclarator" && parentVarNode.loc.start.line === parent.loc.start.line) {
                    nodeIndent += state.indentSize * state.options.VariableDeclarator[parentVarNode.parent.kind];
                } else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
                    const parentElements = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
                    if (
                        parentElements[0] &&
                        parentElements[0].loc.start.line === parent.loc.start.line &&
                        parentElements[0].loc.end.line !== parent.loc.start.line
                    ) {
                        // keep nodeIndent unchanged
                    } else if (typeof state.options[parent.type] === "number") {
                        nodeIndent += state.options[parent.type] * state.indentSize;
                    } else {
                        nodeIndent = parentElements[0].loc.start.column;
                    }
                } else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                    if (typeof state.options.CallExpression.arguments === "number") {
                        nodeIndent += state.options.CallExpression.arguments * state.indentSize;
                    } else if (state.options.CallExpression.arguments === "first") {
                        if (parent.arguments.includes(node)) {
                            nodeIndent = parent.arguments[0].loc.start.column;
                        }
                    } else {
                        nodeIndent += state.indentSize;
                    }
                } else if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
                    nodeIndent += state.indentSize;
                }
            }
        }

        checkFirstNodeLineIndent(state, node, nodeIndent);
    } else {
        nodeIndent = getNodeIndent(state, node).goodChar;
    }

    if (state.options[node.type] === "first") {
        elementsIndent = elements.length ? elements[0].loc.start.column : 0;
    } else {
        elementsIndent = nodeIndent + state.indentSize * state.options[node.type];
    }

    if (isNodeInVarOnTop(node, parentVarNode)) {
        elementsIndent += state.indentSize * state.options.VariableDeclarator[parentVarNode.parent.kind];
    }

    checkNodesIndent(state, elements, elementsIndent);

    if (elements.length > 0 && elements.at(-1).loc.end.line === node.loc.end.line) {
        return;
    }

    checkLastNodeLineIndent(
        state,
        node,
        nodeIndent +
            (isNodeInVarOnTop(node, parentVarNode) ? state.options.VariableDeclarator[parentVarNode.parent.kind] * state.indentSize : 0)
    );
}

/**
 * Determine if a node or its body is a block statement.
 * @param {ASTNode} node Node to test
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
 * Compute expected indentation for a SwitchCase.
 * @param {Object} state Shared state
 * @param {ASTNode} node SwitchCase or SwitchStatement node
 * @param {number} [providedSwitchIndent] Optional switch indent
 * @returns {number}
 */
function expectedCaseIndent(state, node, providedSwitchIndent) {
    const switchNode = node.type === "SwitchStatement" ? node : node.parent;
    const switchIndent = providedSwitchIndent === undefined
        ? getNodeIndent(state, switchNode).goodChar
        : providedSwitchIndent;

    if (state.caseIndentStore[switchNode.loc.start.line]) {
        return state.caseIndentStore[switchNode.loc.start.line];
    }

    const caseIndent = switchNode.cases.length > 0 && state.options.SwitchCase === 0
        ? switchIndent
        : switchIndent + state.indentSize * state.options.SwitchCase;

    state.caseIndentStore[switchNode.loc.start.line] = caseIndent;
    return caseIndent;
}

/**
 * Detect if a return statement is wrapped in parentheses.
 * @param {Object} state Shared state
 * @param {ASTNode} node ReturnStatement node
 * @returns {boolean}
 */
function isWrappedInParenthesis(state, node) {
    const regex = /^return\s*\(\s*\)/u;
    const statementWithoutArgument = state.sourceCode
        .getText(node)
        .replace(state.sourceCode.getText(node.argument), "");
    return regex.test(statementWithoutArgument);
}

/**
 * Filter variable declarations to those that start on distinct lines.
 * @param {ASTNode} node VariableDeclaration node
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
 * Check indentation for variable declarations.
 * @param {Object} state Shared state
 * @param {ASTNode} node VariableDeclaration node
 */
function checkIndentInVariableDeclarations(state, node) {
    const elements = filterOutSameLineVars(node);
    const nodeIndent = getNodeIndent(state, node).goodChar;
    const lastElement = elements.at(-1);
    const elementsIndent = nodeIndent + state.indentSize * state.options.VariableDeclarator[node.kind];

    checkNodesIndent(state, elements, elementsIndent);

    if (state.sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
        return;
    }

    const tokenBeforeLast = state.sourceCode.getTokenBefore(lastElement);
    if (tokenBeforeLast.value === ",") {
        checkLastNodeLineIndent(state, node, getNodeIndent(state, tokenBeforeLast).goodChar);
    } else {
        checkLastNodeLineIndent(state, node, elementsIndent - state.indentSize);
    }
}

/**
 * Handle statements without braces.
 * @param {Object} state Shared state
 * @param {ASTNode} node Statement node
 */
function blockLessNodes(state, node) {
    if (node.body.type !== "BlockStatement") {
        blockIndentationCheck(state, node);
    }
}

/**
 * Core block indentation logic.
 * @param {Object} state Shared state
 * @param {ASTNode} node BlockStatement or similar node
 */
function blockIndentationCheck(state, node) {
    if (isSingleLineNode(state, node)) {
        return;
    }

    if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
        checkIndentInFunctionBlock(state, node);
        return;
    }

    let indent;
    const statementsWithProperties = [
        "IfStatement",
        "WhileStatement",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "DoWhileStatement",
        "ClassDeclaration",
        "TryStatement",
    ];

    if (node.parent && statementsWithProperties.includes(node.parent.type) && isNodeBodyBlock(node)) {
        indent = getNodeIndent(state, node.parent).goodChar;
    } else if (node.parent && node.parent.type === "CatchClause") {
        indent = getNodeIndent(state, node.parent.parent).goodChar;
    } else {
        indent = getNodeIndent(state, node).goodChar;
    }

    let nodesToCheck;
    if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
        nodesToCheck = [node.consequent];
    } else if (Array.isArray(node.body)) {
        nodesToCheck = node.body;
    } else {
        nodesToCheck = [node.body];
    }

    if (nodesToCheck.length) {
        checkNodesIndent(state, nodesToCheck, indent + state.indentSize);
    }

    if (node.type === "BlockStatement") {
        checkLastNodeLineIndent(state, node, indent);
    }
}

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
        schema: [/* schema omitted for brevity */],
        messages: { expected: "Expected indentation of {{expected}} but found {{actual}}." },
    },

    create(context) {
        const { indentSize, indentType, options } = parseOptions(context);
        const sourceCode = context.sourceCode;
        const caseIndentStore = {};

        const state = { context, sourceCode, indentSize, indentType, options, caseIndentStore };

        return {
            Program(node) {
                if (node.body.length) {
                    checkNodesIndent(state, node.body, getNodeIndent(state, node).goodChar);
                }
            },

            ClassBody: node => blockIndentationCheck(state, node),

            BlockStatement: node => blockIndentationCheck(state, node),

            WhileStatement: node => blockLessNodes(state, node),

            ForStatement: node => blockLessNodes(state, node),

            ForInStatement: node => blockLessNodes(state, node),

            ForOfStatement: node => blockLessNodes(state, node),

            DoWhileStatement: node => blockLessNodes(state, node),

            IfStatement(node) {
                if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
                    blockIndentationCheck(state, node);
                }
            },

            VariableDeclaration(node) {
                if (node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
                    checkIndentInVariableDeclarations(state, node);
                }
            },

            ObjectExpression(node) {
                checkIndentInArrayOrObjectBlock(state, node);
            },

            ArrayExpression(node) {
                checkIndentInArrayOrObjectBlock(state, node);
            },

            MemberExpression(node) {
                if (typeof state.options.MemberExpression === "undefined") return;
                if (isSingleLineNode(state, node)) return;

                if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) return;
                if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) return;

                const propertyIndent = getNodeIndent(state, node).goodChar + state.indentSize * state.options.MemberExpression;
                const checkNodes = [node.property];
                const dot = state.sourceCode.getTokenBefore(node.property);
                if (dot.type === "Punctuator" && dot.value === ".") {
                    checkNodes.push(dot);
                }
                checkNodesIndent(state, checkNodes, propertyIndent);
            },

            SwitchStatement(node) {
                const switchIndent = getNodeIndent(state, node).goodChar;
                const caseIndent = expectedCaseIndent(state, node, switchIndent);
                checkNodesIndent(state, node.cases, caseIndent);
                checkLastNodeLineIndent(state, node, switchIndent);
            },

            SwitchCase(node) {
                if (isSingleLineNode(state, node)) return;
                const caseIndent = expectedCaseIndent(state, node);
                checkNodesIndent(state, node.consequent, caseIndent + state.indentSize);
            },

            FunctionDeclaration(node) {
                if (isSingleLineNode(state, node)) return;
                if (state.options.FunctionDeclaration.parameters === "first" && node.params.length) {
                    checkNodesIndent(state, node.params.slice(1), node.params[0].loc.start.column);
                } else if (state.options.FunctionDeclaration.parameters !== null) {
                    checkNodesIndent(
                        state,
                        node.params,
                        getNodeIndent(state, node).goodChar + state.indentSize * state.options.FunctionDeclaration.parameters
                    );
                }
            },

            FunctionExpression(node) {
                if (isSingleLineNode(state, node)) return;
                if (state.options.FunctionExpression.parameters === "first" && node.params.length) {
                    checkNodesIndent(state, node.params.slice(1), node.params[0].loc.start.column);
                } else if (state.options.FunctionExpression.parameters !== null) {
                    checkNodesIndent(
                        state,
                        node.params,
                        getNodeIndent(state, node).goodChar + state.indentSize * state.options.FunctionExpression.parameters
                    );
                }
            },

            ReturnStatement(node) {
                if (isSingleLineNode(state, node)) return;
                const firstLineIndent = getNodeIndent(state, node).goodChar;
                if (isWrappedInParenthesis(state, node)) {
                    checkLastReturnStatementLineIndent(state, node, firstLineIndent);
                } else {
                    checkNodeIndent(state, node, firstLineIndent);
                }
            },

            CallExpression(node) {
                if (isSingleLineNode(state, node)) return;
                if (state.options.CallExpression.arguments === "first" && node.arguments.length) {
                    checkNodesIndent(state, node.arguments.slice(1), node.arguments[0].loc.start.column);
                } else if (state.options.CallExpression.arguments !== null) {
                    checkNodesIndent(
                        state,
                        node.arguments,
                        getNodeIndent(state, node).goodChar + state.indentSize * state.options.CallExpression.arguments
                    );
                }
            },
        };
    },
};
/**
 * @fileoverview This option sets a specific tab width for your code
 *
 * This rule has been ported and modified from nodeca.
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v4.0.0
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Helper predicates
//------------------------------------------------------------------------------

/**
 * Determines whether the first option specifies tab indentation.
 * @param {any[]} options The rule options.
 * @returns {boolean} True if tab indentation is requested.
 */
function isTabOption(options) {
    return options[0] === "tab";
}

/**
 * Determines whether the first option specifies a numeric indent size.
 * @param {any[]} options The rule options.
 * @returns {boolean} True if a numeric indent size is provided.
 */
function isNumericIndentOption(options) {
    return typeof options[0] === "number";
}

/**
 * Determines whether the node is a single‑line construct.
 * @param {ASTNode} node The node to test.
 * @returns {boolean} True if the node starts and ends on the same line.
 */
function isSingleLineNode(node) {
    const lastToken = sourceCode.getLastToken(node);
    return node.loc.start.line === lastToken.loc.end.line;
}

/**
 * Determines whether the node is the first token on its line.
 * @param {ASTNode} node The node to examine.
 * @param {boolean} [byEndLocation=false] Lookup based on start position or end.
 * @returns {boolean} True if the node is the first on its line.
 */
function isNodeFirstInLine(node, byEndLocation) {
    const token = byEndLocation
        ? sourceCode.getLastToken(node, 1)
        : sourceCode.getTokenBefore(node);
    const line = byEndLocation ? node.loc.end.line : node.loc.start.line;
    const tokenLine = token ? token.loc.end.line : -1;
    return line !== tokenLine;
}

/**
 * Retrieves the parent node of a given type, stopping at specified nodes.
 * @param {ASTNode} node The starting node.
 * @param {string} type The type to look for.
 * @param {string[]} [stopAtList] Node types that stop the search.
 * @returns {ASTNode|null} The found parent or null.
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
 * Returns the VariableDeclarator ancestor of a node, if any.
 * @param {ASTNode} node The node to examine.
 * @returns {ASTNode|null} The VariableDeclarator node or null.
 */
function getVariableDeclaratorNode(node) {
    return getParentNodeByType(node, "VariableDeclarator");
}

/**
 * Determines whether a node belongs to a multi‑line variable declaration on the same line as its var statement.
 * @param {ASTNode} node The node to check.
 * @param {ASTNode} varNode The VariableDeclarator node.
 * @returns {boolean} True if the node is part of a top‑level multi‑line var.
 */
function isNodeInVarOnTop(node, varNode) {
    return (
        varNode &&
        varNode.parent.loc.start.line === node.loc.start.line &&
        varNode.parent.declarations.length > 1
    );
}

/**
 * Determines whether the argument before a callee node spans multiple lines.
 * @param {ASTNode} node The argument node.
 * @returns {boolean} True if the preceding argument is multi‑line.
 */
function isArgBeforeCalleeNodeMultiline(node) {
    const parent = node.parent;
    if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
        const firstArg = parent.arguments[0];
        return firstArg.loc.end.line > firstArg.loc.start.line;
    }
    return false;
}

/**
 * Determines whether a function node is the outermost IIFE.
 * @param {ASTNode} node The function node.
 * @returns {boolean} True if the node is the outer IIFE.
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
 * Determines whether a return statement is wrapped in parentheses.
 * @param {ASTNode} node The ReturnStatement node.
 * @returns {boolean} True if wrapped in parentheses.
 */
function isWrappedInParenthesis(node) {
    const regex = /^return\s*\(\s*\)/u;
    const text = sourceCode.getText(node).replace(sourceCode.getText(node.argument), "");
    return regex.test(text);
}

/**
 * Determines whether a node or its body is a block statement.
 * @param {ASTNode} node The node to test.
 * @returns {boolean} True if it is or contains a BlockStatement.
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
 * Returns the expected indentation for a case clause.
 * @param {ASTNode} node The SwitchCase or SwitchStatement node.
 * @param {number} [providedSwitchIndent] Optional switch indentation.
 * @returns {number} The calculated case indentation.
 */
function expectedCaseIndent(node, providedSwitchIndent) {
    const switchNode = node.type === "SwitchStatement" ? node : node.parent;
    const switchIndent = providedSwitchIndent === undefined
        ? getNodeIndent(switchNode).goodChar
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
 * Retrieves the indentation of a node (or its last line).
 * @param {ASTNode|Token} node The node or token.
 * @param {boolean} [byLastLine=false] Whether to use the last line.
 * @returns {{space:number,tab:number,goodChar:number,badChar:number}} Indent info.
 */
function getNodeIndent(node, byLastLine) {
    const token = byLastLine ? sourceCode.getLastToken(node) : sourceCode.getFirstToken(node);
    const chars = sourceCode.getText(token, token.loc.start.column).split("");
    const indentChars = chars.slice(0, chars.findIndex(ch => ch !== " " && ch !== "\t"));
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
 * Reports an indentation violation.
 * @param {ASTNode} node The offending node.
 * @param {number} needed Expected indent count.
 * @param {number} gottenSpaces Actual spaces.
 * @param {number} gottenTabs Actual tabs.
 * @param {Object} [loc] Optional location.
 * @param {boolean} [isLastNodeCheck] Whether this is a last‑node check.
 */
function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
    if (gottenSpaces && gottenTabs) {
        return;
    }
    const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
    const range = isLastNodeCheck
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
        data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
        fix: fixer => fixer.replaceTextRange(range, desiredIndent),
    });
}

/**
 * Creates an error message data object.
 * @param {number} expectedAmount Expected indentation amount.
 * @param {number} actualSpaces Actual spaces.
 * @param {number} actualTabs Actual tabs.
 * @returns {{expected:string,actual:string}} Message data.
 */
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

/**
 * Checks indentation for a single node.
 * @param {ASTNode} node The node to check.
 * @param {number} neededIndent The required indent.
 */
function checkNodeIndent(node, neededIndent) {
    const actualIndent = getNodeIndent(node);
    if (
        node.type !== "ArrayExpression" &&
        node.type !== "ObjectExpression" &&
        (actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
        isNodeFirstInLine(node)
    ) {
        report(node, neededIndent, actualIndent.space, actualIndent.tab);
    }

    if (node.type === "IfStatement" && node.alternate) {
        const elseToken = sourceCode.getTokenBefore(node.alternate);
        checkNodeIndent(elseToken, neededIndent);
        if (!isNodeFirstInLine(node.alternate)) {
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

/**
 * Checks indentation for an array of nodes.
 * @param {ASTNode[]} nodes Nodes to check.
 * @param {number} indent Required indent.
 */
function checkNodesIndent(nodes, indent) {
    nodes.forEach(node => checkNodeIndent(node, indent));
}

/**
 * Checks the indentation of the last line of a block.
 * @param {ASTNode} node The block node.
 * @param {number} lastLineIndent Expected indent for the closing line.
 */
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

/**
 * Checks the indentation of the first line of a node.
 * @param {ASTNode} node The node to examine.
 * @param {number} firstLineIndent Expected indent.
 */
function checkFirstNodeLineIndent(node, firstLineIndent) {
    const startIndent = getNodeIndent(node);
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

/**
 * Checks the indentation of a return statement's closing parenthesis line.
 * @param {ASTNode} node The ReturnStatement node.
 * @param {number} firstLineIndent Expected indent.
 */
function checkLastReturnStatementLineIndent(node, firstLineIndent) {
    const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
    const before = sourceCode.getText(lastToken, lastToken.loc.start.column).slice(0, -1);
    if (before.trim()) {
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

/**
 * Retrieves the indentation for a function block and checks its contents.
 * @param {ASTNode} node The BlockStatement inside a function.
 */
function checkIndentInFunctionBlock(node) {
    const calleeNode = node.parent; // FunctionExpression or similar
    let baseIndent;

    if (calleeNode.parent && (calleeNode.parent.type === "Property" || calleeNode.parent.type === "ArrayExpression")) {
        baseIndent = getNodeIndent(calleeNode, false).goodChar;
    } else {
        baseIndent = getNodeIndent(calleeNode).goodChar;
    }

    if (calleeNode.parent.type === "CallExpression") {
        const parentCall = calleeNode.parent;
        if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
            if (parentCall.loc.start.line < node.loc.start.line) {
                baseIndent = getNodeIndent(parentCall).goodChar;
            }
        } else if (
            isArgBeforeCalleeNodeMultiline(calleeNode) &&
            parentCall.callee.loc.start.line === parentCall.callee.loc.end.line &&
            !isNodeFirstInLine(calleeNode)
        ) {
            baseIndent = getNodeIndent(parentCall).goodChar;
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
    const indent = baseIndent + offset;

    const varNode = getVariableDeclaratorNode(node);
    if (varNode && isNodeInVarOnTop(node, varNode)) {
        const extra = indentSize * options.VariableDeclarator[varNode.parent.kind];
        checkNodesIndent(node.body, indent + extra);
    } else if (node.body.length) {
        checkNodesIndent(node.body, indent);
    }

    checkLastNodeLineIndent(node, indent - offset);
}

/**
 * Determines the appropriate indent for a block node.
 * @param {ASTNode} node The block node.
 * @returns {number} The calculated indent.
 */
function computeBlockIndent(node) {
    if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
        return getNodeIndent(node.parent).goodChar;
    }
    if (node.parent && node.parent.type === "CatchClause") {
        return getNodeIndent(node.parent.parent).goodChar;
    }
    return getNodeIndent(node).goodChar;
}

/**
 * Determines which child nodes of a block need indentation checks.
 * @param {ASTNode} node The block node.
 * @returns {ASTNode[]} Nodes to check.
 */
function getBlockChildrenToCheck(node) {
    if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
        return [node.consequent];
    }
    if (Array.isArray(node.body)) {
        return node.body;
    }
    return [node.body];
}

/**
 * Checks indentation for generic block structures.
 * @param {ASTNode} node The block node.
 */
function blockIndentationCheck(node) {
    if (isSingleLineNode(node)) {
        return;
    }

    if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
        checkIndentInFunctionBlock(node);
        return;
    }

    const indent = computeBlockIndent(node);
    const children = getBlockChildrenToCheck(node);
    if (children.length) {
        checkNodesIndent(children, indent + indentSize);
    }

    if (node.type === "BlockStatement") {
        checkLastNodeLineIndent(node, indent);
    }
}

/**
 * Filters variable declarations to those that start on separate lines.
 * @param {ASTNode} node VariableDeclaration node.
 * @returns {ASTNode[]} Filtered declarations.
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
 * Checks indentation for variable declarations.
 * @param {ASTNode} node VariableDeclaration node.
 */
function checkIndentInVariableDeclarations(node) {
    const elements = filterOutSameLineVars(node);
    const nodeIndent = getNodeIndent(node).goodChar;
    const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];
    checkNodesIndent(elements, elementsIndent);

    const lastElement = elements.at(-1);
    if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
        return;
    }

    const tokenBeforeLast = sourceCode.getTokenBefore(lastElement);
    if (tokenBeforeLast.value === ",") {
        checkLastNodeLineIndent(node, getNodeIndent(tokenBeforeLast).goodChar);
    } else {
        checkLastNodeLineIndent(node, elementsIndent - indentSize);
    }
}

/**
 * Checks indentation for array or object literals.
 * @param {ASTNode} node The literal node.
 */
function checkIndentInArrayOrObjectBlock(node) {
    if (isSingleLineNode(node)) {
        return;
    }

    const elements = (node.type === "ArrayExpression" ? node.elements : node.properties)
        .filter(e => e !== null);

    const parentVarNode = getVariableDeclaratorNode(node);
    let nodeIndent;

    if (isNodeFirstInLine(node)) {
        const parent = node.parent;
        nodeIndent = getNodeIndent(parent).goodChar;

        if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
            if (parent.type !== "VariableDeclarator" || parentVarNode === parentVarNode.parent.declarations[0]) {
                if (parent.type === "VariableDeclarator" && parentVarNode.loc.start.line === parent.loc.start.line) {
                    nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
                } else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
                    const parentElems = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
                    if (parentElems[0] && parentElems[0].loc.start.line === parent.loc.start.line && parentElems[0].loc.end.line !== parent.loc.start.line) {
                        // keep nodeIndent as is
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

        checkFirstNodeLineIndent(node, nodeIndent);
    } else {
        nodeIndent = getNodeIndent(node).goodChar;
    }

    const elementsIndent = options[node.type] === "first"
        ? (elements[0] ? elements[0].loc.start.column : 0)
        : nodeIndent + indentSize * options[node.type];

    if (isNodeInVarOnTop(node, parentVarNode)) {
        nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
    }

    checkNodesIndent(elements, elementsIndent);

    if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) {
        return;
    }

    const extra = isNodeInVarOnTop(node, parentVarNode)
        ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
        : 0;

    checkLastNodeLineIndent(node, nodeIndent + extra);
}

/**
 * Main rule creator.
 * @param {RuleContext} context The rule context.
 * @returns {Object} Visitor methods.
 */
function create(context) {
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
        } else if (isNumericIndentOption(context.options)) {
            indentSize = context.options[0];
            indentType = "space";
        }

        if (context.options[1]) {
            const opts = context.options[1];
            options.SwitchCase = opts.SwitchCase || 0;

            const varDecl = opts.VariableDeclarator;
            if (typeof varDecl === "number") {
                options.VariableDeclarator = { var: varDecl, let: varDecl, const: varDecl };
            } else if (typeof varDecl === "object") {
                Object.assign(options.VariableDeclarator, varDecl);
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
                checkNodesIndent(node.body, getNodeIndent(node).goodChar);
            }
        },

        ClassBody: blockIndentationCheck,

        BlockStatement: blockIndentationCheck,

        WhileStatement: node => {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        },

        ForStatement: node => {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        },

        ForInStatement: node => {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        },

        ForOfStatement: node => {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        },

        DoWhileStatement: node => {
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
            if (options.MemberExpression === undefined) {
                return;
            }
            if (isSingleLineNode(node)) {
                return;
            }
            if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) {
                return;
            }
            if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) {
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
            const caseIndent = expectedCaseIndent(node);
            checkNodesIndent(node.consequent, caseIndent + indentSize);
        },

        FunctionDeclaration(node) {
            if (isSingleLineNode(node)) {
                return;
            }
            if (options.FunctionDeclaration.parameters === "first" && node.params.length) {
                checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
            } else if (options.FunctionDeclaration.parameters !== null) {
                const base = getNodeIndent(node).goodChar + indentSize * options.FunctionDeclaration.parameters;
                checkNodesIndent(node.params, base);
            }
        },

        FunctionExpression(node) {
            if (isSingleLineNode(node)) {
                return;
            }
            if (options.FunctionExpression.parameters === "first" && node.params.length) {
                checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
            } else if (options.FunctionExpression.parameters !== null) {
                const base = getNodeIndent(node).goodChar + indentSize * options.FunctionExpression.parameters;
                checkNodesIndent(node.params, base);
            }
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
            if (options.CallExpression.arguments === "first" && node.arguments.length) {
                checkNodesIndent(node.arguments.slice(1), node.arguments[0].loc.start.column);
            } else if (options.CallExpression.arguments !== null) {
                const base = getNodeIndent(node).goodChar + indentSize * options.CallExpression.arguments;
                checkNodesIndent(node.arguments, base);
            }
        },
    };
}

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

    create,
};
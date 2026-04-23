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
 * Determine if the first option is a tab configuration.
 * @param {any} option The first rule option.
 * @returns {boolean}
 */
function isTabOption(option) {
    return option === "tab";
}

/**
 * Determine if the first option is a numeric indent size.
 * @param {any} option The first rule option.
 * @returns {boolean}
 */
function isNumericOption(option) {
    return typeof option === "number";
}

/**
 * Determine if a node is a single-line construct.
 * @param {ASTNode} node The node to check.
 * @returns {boolean}
 */
function isSingleLineNode(node) {
    const lastToken = sourceCode.getLastToken(node);
    return node.loc.start.line === lastToken.loc.end.line;
}

/**
 * Determine if a node is the first token on its line.
 * @param {ASTNode} node The node to examine.
 * @param {boolean} [byEndLocation=false] Whether to check based on end location.
 * @returns {boolean}
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
 * Retrieve the indentation details for a token.
 * @param {ASTNode|Token} node Node or token.
 * @param {boolean} [byLastLine=false] Whether to use the last line.
 * @returns {{space:number,tab:number,goodChar:number,badChar:number}}
 */
function getNodeIndent(node, byLastLine) {
    const token = byLastLine
        ? sourceCode.getLastToken(node)
        : sourceCode.getFirstToken(node);
    const text = sourceCode.getText(token, token.loc.start.column);
    const chars = text.split("");
    const indentChars = [];
    for (const ch of chars) {
        if (ch === " " || ch === "\t") {
            indentChars.push(ch);
        } else {
            break;
        }
    }
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
 * Create an error message data object.
 * @param {number} expectedAmount Expected indentation amount.
 * @param {number} actualSpaces Actual spaces found.
 * @param {number} actualTabs Actual tabs found.
 * @returns {{expected:string,actual:string}}
 */
function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
    const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
    const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
    const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
    let foundStatement;

    if (actualSpaces > 0 && actualTabs > 0) {
        foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
    } else if (actualSpaces > 0) {
        if (indentType === "space") {
            foundStatement = `${actualSpaces}`;
        } else {
            foundStatement = `${actualSpaces} ${foundSpacesWord}`;
        }
    } else if (actualTabs > 0) {
        if (indentType === "tab") {
            foundStatement = `${actualTabs}`;
        } else {
            foundStatement = `${actualTabs} ${foundTabsWord}`;
        }
    } else {
        foundStatement = "0";
    }

    return {
        expected: expectedStatement,
        actual: foundStatement,
    };
}

/**
 * Report an indentation violation.
 * @param {ASTNode} node Node violating the rule.
 * @param {number} needed Expected indentation.
 * @param {number} gottenSpaces Spaces found.
 * @param {number} gottenTabs Tabs found.
 * @param {Object} [loc] Location for the report.
 * @param {boolean} isLastNodeCheck Whether this is a last-node check.
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
 * Determine if a node is part of a multi-line variable declaration on the same line as its parent.
 * @param {ASTNode} node The node to check.
 * @param {ASTNode} varNode The variable declarator node.
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
 * Determine if the argument before a callee node is multiline.
 * @param {ASTNode} node The node to check.
 * @returns {boolean}
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
 * Determine if a node represents an outer IIFE.
 * @param {ASTNode} node The function node.
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
 * Compute the base indent for a function block.
 * @param {ASTNode} calleeNode The function expression/declaration node.
 * @returns {number}
 */
function computeFunctionBaseIndent(calleeNode) {
    if (
        calleeNode.parent &&
        (calleeNode.parent.type === "Property" || calleeNode.parent.type === "ArrayExpression")
    ) {
        return getNodeIndent(calleeNode, false).goodChar;
    }
    return getNodeIndent(calleeNode).goodChar;
}

/**
 * Adjust indent for function bodies based on configuration.
 * @param {ASTNode} calleeNode The function node.
 * @param {number} baseIndent The current base indent.
 * @returns {number}
 */
function adjustFunctionIndent(calleeNode, baseIndent) {
    let offset = indentSize;

    if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
        offset = options.outerIIFEBody * indentSize;
    } else if (calleeNode.type === "FunctionExpression") {
        offset = options.FunctionExpression.body * indentSize;
    } else if (calleeNode.type === "FunctionDeclaration") {
        offset = options.FunctionDeclaration.body * indentSize;
    }

    return baseIndent + offset;
}

/**
 * Check indentation for a function block.
 * @param {ASTNode} node BlockStatement inside a function.
 */
function checkIndentInFunctionBlock(node) {
    const calleeNode = node.parent; // FunctionExpression or Declaration
    const baseIndent = computeFunctionBaseIndent(calleeNode);
    const finalIndent = adjustFunctionIndent(calleeNode, baseIndent);

    const parentVarNode = getVariableDeclaratorNode(node);
    let extraIndent = 0;

    if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
        extraIndent = indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
    }

    const totalIndent = finalIndent + extraIndent;

    if (node.body.length) {
        checkNodesIndent(node.body, totalIndent);
    }

    checkLastNodeLineIndent(node, totalIndent - (finalIndent - baseIndent));
}

/**
 * Determine the appropriate indent for array/object elements.
 * @param {ASTNode} node The array or object node.
 * @returns {{nodeIndent:number, elementsIndent:number}}
 */
function computeArrayObjectIndents(node) {
    const parentVarNode = getVariableDeclaratorNode(node);
    let nodeIndent = 0;
    let elementsIndent = 0;

    if (isNodeFirstInLine(node)) {
        const parent = node.parent;
        nodeIndent = getNodeIndent(parent).goodChar;

        if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
            if (parent.type !== "VariableDeclarator" || parentVarNode === parentVarNode.parent.declarations[0]) {
                if (parent.type === "VariableDeclarator" && parentVarNode.loc.start.line === parent.loc.start.line) {
                    nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
                } else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
                    const parentElements = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
                    const firstElem = parentElements[0];
                    if (firstElem && firstElem.loc.start.line === parent.loc.start.line && firstElem.loc.end.line !== parent.loc.start.line) {
                        // keep nodeIndent unchanged
                    } else if (typeof options[parent.type] === "number") {
                        nodeIndent += options[parent.type] * indentSize;
                    } else {
                        nodeIndent = firstElem.loc.start.column;
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

    if (options[node.type] === "first") {
        elementsIndent = node.elements && node.elements.length
            ? node.elements[0].loc.start.column
            : 0;
    } else {
        elementsIndent = nodeIndent + indentSize * options[node.type];
    }

    if (isNodeInVarOnTop(node, parentVarNode)) {
        elementsIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
    }

    return { nodeIndent, elementsIndent };
}

/**
 * Check indentation for array or object blocks.
 * @param {ASTNode} node The array or object node.
 */
function checkIndentInArrayOrObjectBlock(node) {
    if (isSingleLineNode(node)) {
        return;
    }

    const { nodeIndent, elementsIndent } = computeArrayObjectIndents(node);
    const elements = (node.type === "ArrayExpression" ? node.elements : node.properties).filter(e => e !== null);

    checkNodesIndent(elements, elementsIndent);

    if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) {
        return;
    }

    const extra = isNodeInVarOnTop(node, getVariableDeclaratorNode(node))
        ? options.VariableDeclarator[getVariableDeclaratorNode(node).parent.kind] * indentSize
        : 0;

    checkLastNodeLineIndent(node, nodeIndent + extra);
}

/**
 * Determine the expected case indent for a switch statement.
 * @param {ASTNode} node SwitchCase or SwitchStatement node.
 * @param {number} [providedSwitchIndent] Optional precomputed switch indent.
 * @returns {number}
 */
function expectedCaseIndent(node, providedSwitchIndent) {
    const switchNode = node.type === "SwitchStatement" ? node : node.parent;
    const switchIndent = typeof providedSwitchIndent === "undefined"
        ? getNodeIndent(switchNode).goodChar
        : providedSwitchIndent;

    if (caseIndentStore[switchNode.loc.start.line]) {
        return caseIndentStore[switchNode.loc.start.line];
    }

    const caseIndent = (switchNode.cases.length && options.SwitchCase === 0)
        ? switchIndent
        : switchIndent + indentSize * options.SwitchCase;

    caseIndentStore[switchNode.loc.start.line] = caseIndent;
    return caseIndent;
}

/**
 * Determine if a return statement is wrapped in parentheses.
 * @param {ASTNode} node ReturnStatement node.
 * @returns {boolean}
 */
function isWrappedInParenthesis(node) {
    const regex = /^return\s*\(\s*\)/u;
    const source = context.getSourceCode().getText(node);
    const withoutArg = source.replace(context.getSourceCode().getText(node.argument), "");
    return regex.test(withoutArg);
}

/**
 * Guard clause to skip processing when node list is empty.
 * @param {ASTNode[]} nodes List of nodes.
 * @param {number} indent Indent size.
 */
function checkNodesIndent(nodes, indent) {
    if (!nodes || nodes.length === 0) {
        return;
    }
    nodes.forEach(node => checkNodeIndent(node, indent));
}

/**
 * Guard clause to skip processing when node is null.
 * @param {ASTNode} node Node to check.
 * @param {number} neededIndent Expected indent.
 */
function checkNodeIndent(node, neededIndent) {
    if (!node) {
        return;
    }

    const actualIndent = getNodeIndent(node, false);

    const shouldReport =
        node.type !== "ArrayExpression" &&
        node.type !== "ObjectExpression" &&
        (actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
        isNodeFirstInLine(node);

    if (shouldReport) {
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
            const catchToken = sourceCode.getFirstToken(node.handler);
            checkNodeIndent(catchToken, neededIndent);
        }
        if (node.finalizer) {
            const finallyToken = sourceCode.getTokenBefore(node.finalizer);
            checkNodeIndent(finallyToken, neededIndent);
        }
    }

    if (node.type === "DoWhileStatement") {
        const whileToken = sourceCode.getTokenAfter(node.body);
        checkNodeIndent(whileToken, neededIndent);
    }
}

/**
 * Guard clause to skip processing when node is null.
 * @param {ASTNode} node Node to examine.
 * @param {number} lastLineIndent Expected indent for the last line.
 */
function checkLastNodeLineIndent(node, lastLineIndent) {
    if (!node) {
        return;
    }
    const lastToken = sourceCode.getLastToken(node);
    const endIndent = getNodeIndent(lastToken, true);

    const shouldReport =
        (endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
        isNodeFirstInLine(node, true);

    if (shouldReport) {
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
 * Guard clause to skip processing when node is null.
 * @param {ASTNode} node Node to examine.
 * @param {number} firstLineIndent Expected indent for the first line.
 */
function checkFirstNodeLineIndent(node, firstLineIndent) {
    if (!node) {
        return;
    }
    const startIndent = getNodeIndent(node, false);
    const shouldReport =
        (startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
        isNodeFirstInLine(node);

    if (shouldReport) {
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
 * Retrieve a parent node of a given type.
 * @param {ASTNode} node Starting node.
 * @param {string} type Desired parent type.
 * @param {string[]} [stopAtList] Types at which to stop searching.
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
 * Retrieve the VariableDeclarator node for a given node.
 * @param {ASTNode} node Node to examine.
 * @returns {ASTNode|null}
 */
function getVariableDeclaratorNode(node) {
    return getParentNodeByType(node, "VariableDeclarator");
}

/**
 * Filter variable declarations to those not on the same line.
 * @param {ASTNode} node VariableDeclaration node.
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
 * Determine if a block should be processed based on its parent.
 * @param {ASTNode} node Block node.
 * @returns {boolean}
 */
function shouldProcessBlock(node) {
    if (isSingleLineNode(node)) {
        return false;
    }

    const parent = node.parent;
    if (parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(parent.type)) {
        checkIndentInFunctionBlock(node);
        return false;
    }
    return true;
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
        schema: [/* schema omitted for brevity */],
        messages: { expected: "Expected indentation of {{expected}} but found {{actual}}." },
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
            if (isTabOption(context.options[0])) {
                indentSize = 1;
                indentType = "tab";
            } else if (isNumericOption(context.options[0])) {
                indentSize = context.options[0];
                indentType = "space";
            }

            if (context.options[1]) {
                const opts = context.options[1];
                options.SwitchCase = opts.SwitchCase || 0;

                const varRules = opts.VariableDeclarator;
                if (typeof varRules === "number") {
                    options.VariableDeclarator = { var: varRules, let: varRules, const: varRules };
                } else if (typeof varRules === "object") {
                    Object.assign(options.VariableDeclarator, varRules);
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

            WhileStatement: blockLessNodes,
            ForStatement: blockLessNodes,
            ForInStatement: blockLessNodes,
            ForOfStatement: blockLessNodes,
            DoWhileStatement: blockLessNodes,

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
                if (typeof options.MemberExpression === "undefined") {
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
                const nodesToCheck = [node.property];
                const dot = sourceCode.getTokenBefore(node.property);
                if (dot.type === "Punctuator" && dot.value === ".") {
                    nodesToCheck.push(dot);
                }
                checkNodesIndent(nodesToCheck, propertyIndent);
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

        /**
         * Check indentation for blocks.
         * @param {ASTNode} node Block node.
         */
        function blockIndentationCheck(node) {
            if (!shouldProcessBlock(node)) {
                return;
            }

            const parent = node.parent;
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

            if (parent && statementsWithProperties.includes(parent.type) && isNodeBodyBlock(node)) {
                indent = getNodeIndent(parent).goodChar;
            } else if (parent && parent.type === "CatchClause") {
                indent = getNodeIndent(parent.parent).goodChar;
            } else {
                indent = getNodeIndent(node).goodChar;
            }

            let nodesToCheck;
            if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
                nodesToCheck = [node.consequent];
            } else if (Array.isArray(node.body)) {
                nodesToCheck = node.body;
            } else {
                nodesToCheck = [node.body];
            }

            if (nodesToCheck && nodesToCheck.length) {
                checkNodesIndent(nodesToCheck, indent + indentSize);
            }

            if (node.type === "BlockStatement") {
                checkLastNodeLineIndent(node, indent);
            }
        }

        /**
         * Determine if a node's body is a block.
         * @param {ASTNode} node Node to test.
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
         * Check indentation for the last line of a return statement.
         * @param {ASTNode} node ReturnStatement node.
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
         * Process nodes without block statements.
         * @param {ASTNode} node Node to examine.
         */
        function blockLessNodes(node) {
            if (node.body.type !== "BlockStatement") {
                blockIndentationCheck(node);
            }
        }
    },
};
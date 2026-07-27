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

// Default configuration constants
const DEFAULT_VARIABLE_INDENT = 1;
const DEFAULT_PARAMETER_INDENT = null; // For backwards compatibility
const DEFAULT_FUNCTION_BODY_INDENT = 1;

// -----------------------------------------------------------------------------
// Helper functions – each kept under the cognitive complexity limit
// -----------------------------------------------------------------------------

/**
 * Parse the rule options from the user configuration.
 * @param {RuleContext} context The ESLint rule context.
 * @returns {{indentType:string, indentSize:number, options:Object}} Parsed configuration.
 */
function parseIndentConfig(context) {
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

    if (!context.options.length) {
        return { indentType, indentSize, options };
    }

    const first = context.options[0];
    if (first === "tab") {
        indentSize = 1;
        indentType = "tab";
    } else if (typeof first === "number") {
        indentSize = first;
        indentType = "space";
    }

    const second = context.options[1];
    if (second) {
        const opts = second;

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

    return { indentType, indentSize, options };
}

/**
 * Create the error message data for a given indentation mismatch.
 * @param {number} expected Expected indentation amount.
 * @param {number} spaces Actual spaces found.
 * @param {number} tabs Actual tabs found.
 * @param {string} indentType Either "space" or "tab".
 * @returns {{expected:string, actual:string}} Message data.
 */
function createErrorMessageData(expected, spaces, tabs, indentType) {
    const expectedStmt = `${expected} ${indentType}${expected === 1 ? "" : "s"}`;
    const spaceWord = `space${spaces === 1 ? "" : "s"}`;
    const tabWord = `tab${tabs === 1 ? "" : "s"}`;
    let actualStmt;

    if (spaces > 0 && tabs > 0) {
        actualStmt = `${spaces} ${spaceWord} and ${tabs} ${tabWord}`;
    } else if (spaces > 0) {
        actualStmt = indentType === "space" ? spaces : `${spaces} ${spaceWord}`;
    } else if (tabs > 0) {
        actualStmt = indentType === "tab" ? tabs : `${tabs} ${tabWord}`;
    } else {
        actualStmt = "0";
    }

    return { expected: expectedStmt, actual: actualStmt };
}

/**
 * Report an indentation violation.
 * @param {RuleContext} context ESLint rule context.
 * @param {ASTNode} node Node that violates the rule.
 * @param {number} needed Expected indentation.
 * @param {number} spaces Actual spaces.
 * @param {number} tabs Actual tabs.
 * @param {Object} [loc] Optional location override.
 * @param {boolean} [isLastNodeCheck] Whether the check is for the last token.
 * @param {string} indentType Indent type ("space" or "tab").
 */
function reportIndent(context, node, needed, spaces, tabs, loc, isLastNodeCheck, indentType) {
    if (spaces && tabs) {
        return; // avoid conflict with no-mixed-spaces-and-tabs
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
 * Get the indentation details of a token or node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode|Token} node Node or token.
 * @param {boolean} [byLastLine=false] Whether to use the last token.
 * @param {string} indentType Indent type.
 * @returns {{space:number, tab:number, goodChar:number, badChar:number}} Indent info.
 */
function getNodeIndent(sourceCode, node, byLastLine, indentType) {
    const token = byLastLine ? sourceCode.getLastToken(node) : sourceCode.getFirstToken(node);
    const text = sourceCode.getText(token, token.loc.start.column);
    const chars = text.split("").slice(0, text.search(/[^\t ]/));
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
 * Determine if a node is the first token on its line.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node Node to test.
 * @param {boolean} [byEndLocation=false] Whether to compare using end location.
 * @returns {boolean} True if first on line.
 */
function isNodeFirstInLine(sourceCode, node, byEndLocation) {
    const token = byEndLocation
        ? sourceCode.getLastToken(node, 1)
        : sourceCode.getTokenBefore(node);
    const line = byEndLocation ? node.loc.end.line : node.loc.start.line;
    const tokenLine = token ? token.loc.end.line : -1;
    return line !== tokenLine;
}

/**
 * Retrieve a parent node of a given type, stopping at specified nodes.
 * @param {ASTNode} node Starting node.
 * @param {string} type Desired parent type.
 * @param {string[]} [stopAt=[]] Types at which to stop searching.
 * @returns {ASTNode|null} Matching parent or null.
 */
function getParentNodeByType(node, type, stopAt = []) {
    const stopSet = new Set([...stopAt, "Program"]);
    let parent = node.parent;
    while (parent && parent.type !== type && !stopSet.has(parent.type)) {
        parent = parent.parent;
    }
    return parent && parent.type === type ? parent : null;
}

/**
 * Determine if a node belongs to an outer IIFE.
 * @param {ASTNode} node Function node.
 * @returns {boolean} True if outer IIFE.
 */
function isOuterIIFE(node) {
    const parent = node.parent;
    if (parent.type !== "CallExpression" || parent.callee !== node) {
        return false;
    }

    let stmt = parent.parent;
    while (
        (stmt.type === "UnaryExpression" && ["!", "~", "+", "-"].includes(stmt.operator)) ||
        stmt.type === "AssignmentExpression" ||
        stmt.type === "LogicalExpression" ||
        stmt.type === "SequenceExpression" ||
        stmt.type === "VariableDeclarator"
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
 * Compute the base indent for a function block.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node BlockStatement node.
 * @param {Object} config Rule configuration.
 * @returns {number} Calculated base indent.
 */
function computeFunctionBaseIndent(sourceCode, node, config) {
    const { indentSize, options, indentType } = config;
    const calleeNode = node.parent; // FunctionExpression or Declaration

    // Determine initial indent based on surrounding context
    let baseIndent;
    if (calleeNode.parent && (calleeNode.parent.type === "Property" || calleeNode.parent.type === "ArrayExpression")) {
        baseIndent = getNodeIndent(sourceCode, calleeNode, false, indentType).goodChar;
    } else {
        baseIndent = getNodeIndent(sourceCode, calleeNode, false, indentType).goodChar;
    }

    // Adjust for call expression arguments spanning multiple lines
    if (calleeNode.parent && calleeNode.parent.type === "CallExpression") {
        const callParent = calleeNode.parent;
        if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
            if (callParent.loc.start.line < node.loc.start.line) {
                baseIndent = getNodeIndent(sourceCode, callParent, false, indentType).goodChar;
            }
        } else if (
            isArgBeforeCalleeNodeMultiline(calleeNode) &&
            callParent.callee.loc.start.line === callParent.callee.loc.end.line &&
            !isNodeFirstInLine(sourceCode, calleeNode)
        ) {
            baseIndent = getNodeIndent(sourceCode, callParent, false, indentType).goodChar;
        }
    }

    // Apply function body offset
    let offset = indentSize;
    if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
        offset = options.outerIIFEBody * indentSize;
    } else if (calleeNode.type === "FunctionExpression") {
        offset = options.FunctionExpression.body * indentSize;
    } else if (calleeNode.type === "FunctionDeclaration") {
        offset = options.FunctionDeclaration.body * indentSize;
    }

    // Variable declarator adjustment
    const varNode = getParentNodeByType(node, "VariableDeclarator");
    if (varNode && varNode.parent.loc.start.line === node.loc.start.line && varNode.parent.declarations.length > 1) {
        offset += indentSize * options.VariableDeclarator[varNode.parent.kind];
    }

    return baseIndent + offset;
}

/**
 * Check indentation inside a function block.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node BlockStatement node.
 * @param {Object} config Rule configuration.
 * @param {Function} report Reporter function.
 */
function checkIndentInFunctionBlock(sourceCode, node, config, report) {
    const baseIndent = computeFunctionBaseIndent(sourceCode, node, config);
    const { indentSize, indentType } = config;

    if (node.body.length) {
        node.body.forEach(child => {
            const actual = getNodeIndent(sourceCode, child, false, indentType);
            if (
                child.type !== "ArrayExpression" &&
                child.type !== "ObjectExpression" &&
                (actual.goodChar !== baseIndent || actual.badChar !== 0) &&
                isNodeFirstInLine(sourceCode, child)
            ) {
                report(child, baseIndent, actual.space, actual.tab);
            }
        });
    }

    // Closing brace
    const closingIndent = baseIndent - indentSize;
    const lastToken = sourceCode.getLastToken(node);
    const endIndent = getNodeIndent(sourceCode, lastToken, true, indentType);
    if ((endIndent.goodChar !== closingIndent || endIndent.badChar !== 0) && isNodeFirstInLine(sourceCode, node, true)) {
        report(node, closingIndent, endIndent.space, endIndent.tab, {
            line: lastToken.loc.start.line,
            column: lastToken.loc.start.column,
        }, true);
    }
}

/**
 * Compute the expected indent for array/object elements.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node The array or object node.
 * @param {Object} config Rule configuration.
 * @returns {{nodeIndent:number, elementsIndent:number}} Indent values.
 */
function computeArrayObjectIndents(sourceCode, node, config) {
    const { indentSize, options, indentType } = config;
    const parentVarNode = getParentNodeByType(node, "VariableDeclarator");
    let nodeIndent = 0;

    if (isNodeFirstInLine(sourceCode, node)) {
        const parent = node.parent;
        nodeIndent = getNodeIndent(sourceCode, parent, false, indentType).goodChar;

        if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
            if (parent.type === "VariableDeclarator" && parentVarNode && parentVarNode.parent.declarations[0] === parentVarNode) {
                // no extra indent
            } else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
                const siblings = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
                const firstSibling = siblings[0];
                if (firstSibling && firstSibling.loc.start.line === parent.loc.start.line && firstSibling.loc.end.line !== parent.loc.start.line) {
                    // keep nodeIndent unchanged
                } else if (typeof options[parent.type] === "number") {
                    nodeIndent += options[parent.type] * indentSize;
                } else {
                    nodeIndent = firstSibling ? firstSibling.loc.start.column : nodeIndent;
                }
            } else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
                if (typeof options.CallExpression.arguments === "number") {
                    nodeIndent += options.CallExpression.arguments * indentSize;
                } else if (options.CallExpression.arguments === "first") {
                    if (parent.arguments.includes(node)) {
                        nodeIndent = parent.arguments[0].loc.start.column;
                    }
                } else {
                    nodeIndent += indentSize;
                }
            } else if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
                nodeIndent += indentSize;
            }
        }

        // first line check
        const startIndent = getNodeIndent(sourceCode, node, false, indentType);
        if ((startIndent.goodChar !== nodeIndent || startIndent.badChar !== 0) && isNodeFirstInLine(sourceCode, node)) {
            reportIndent(sourceCode.context, node, nodeIndent, startIndent.space, startIndent.tab, {
                line: node.loc.start.line,
                column: node.loc.start.column,
            }, false, indentType);
        }
    } else {
        nodeIndent = getNodeIndent(sourceCode, node, false, indentType).goodChar;
    }

    const elements = (node.type === "ArrayExpression" ? node.elements : node.properties).filter(e => e !== null);
    let elementsIndent;
    if (options[node.type] === "first") {
        elementsIndent = elements.length ? elements[0].loc.start.column : 0;
    } else {
        elementsIndent = nodeIndent + indentSize * options[node.type];
    }

    if (parentVarNode && parentVarNode.parent.loc.start.line === node.loc.start.line && parentVarNode.parent.declarations.length > 1) {
        elementsIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
    }

    return { nodeIndent, elementsIndent, elements };
}

/**
 * Check indentation for array or object literals.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node ArrayExpression or ObjectExpression node.
 * @param {Object} config Rule configuration.
 * @param {Function} report Reporter function.
 */
function checkIndentInArrayOrObjectBlock(sourceCode, node, config, report) {
    if (isSingleLineNode(sourceCode, node)) {
        return;
    }

    const { nodeIndent, elementsIndent, elements } = computeArrayObjectIndents(sourceCode, node, config);

    elements.forEach(elem => {
        const actual = getNodeIndent(sourceCode, elem, false, config.indentType);
        if ((actual.goodChar !== elementsIndent || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, elem)) {
            report(elem, elementsIndent, actual.space, actual.tab);
        }
    });

    if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) {
        return;
    }

    const closingIndent = nodeIndent + (isNodeInVarOnTop(node, getParentNodeByType(node, "VariableDeclarator")) ? config.options.VariableDeclarator[getParentNodeByType(node, "VariableDeclarator").parent.kind] * config.indentSize : 0);
    const lastToken = sourceCode.getLastToken(node);
    const endIndent = getNodeIndent(sourceCode, lastToken, true, config.indentType);
    if ((endIndent.goodChar !== closingIndent || endIndent.badChar !== 0) && isNodeFirstInLine(sourceCode, node, true)) {
        report(node, closingIndent, endIndent.space, endIndent.tab, {
            line: lastToken.loc.start.line,
            column: lastToken.loc.start.column,
        }, true);
    }
}

/**
 * Determine if a node spans a single line.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node Node to test.
 * @returns {boolean} True if single line.
 */
function isSingleLineNode(sourceCode, node) {
    const last = sourceCode.getLastToken(node);
    return node.loc.start.line === last.loc.end.line;
}

/**
 * Check indentation for a generic block node.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node Block node.
 * @param {Object} config Rule configuration.
 * @param {Function} report Reporter function.
 */
function blockIndentationCheck(sourceCode, node, config, report) {
    if (isSingleLineNode(sourceCode, node)) {
        return;
    }

    const { indentSize, indentType } = config;

    // Determine base indent
    let baseIndent;
    const parent = node.parent;
    const statementsWithProps = [
        "IfStatement",
        "WhileStatement",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "DoWhileStatement",
        "ClassDeclaration",
        "TryStatement",
    ];

    if (parent && statementsWithProps.includes(parent.type) && isNodeBodyBlock(node)) {
        baseIndent = getNodeIndent(sourceCode, parent, false, indentType).goodChar;
    } else if (parent && parent.type === "CatchClause") {
        baseIndent = getNodeIndent(sourceCode, parent.parent, false, indentType).goodChar;
    } else {
        baseIndent = getNodeIndent(sourceCode, node, false, indentType).goodChar;
    }

    // Determine nodes to check
    let nodesToCheck;
    if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
        nodesToCheck = [node.consequent];
    } else if (Array.isArray(node.body)) {
        nodesToCheck = node.body;
    } else {
        nodesToCheck = [node.body];
    }

    nodesToCheck.forEach(child => {
        const actual = getNodeIndent(sourceCode, child, false, indentType);
        if ((actual.goodChar !== baseIndent + indentSize || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, child)) {
            report(child, baseIndent + indentSize, actual.space, actual.tab);
        }
    });

    if (node.type === "BlockStatement") {
        const lastToken = sourceCode.getLastToken(node);
        const endIndent = getNodeIndent(sourceCode, lastToken, true, indentType);
        if ((endIndent.goodChar !== baseIndent || endIndent.badChar !== 0) && isNodeFirstInLine(sourceCode, node, true)) {
            report(node, baseIndent, endIndent.space, endIndent.tab, {
                line: lastToken.loc.start.line,
                column: lastToken.loc.start.column,
            }, true);
        }
    }
}

/**
 * Helper to decide if a node's body is a block.
 * @param {ASTNode} node Node to test.
 * @returns {boolean} True if body is a block.
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
 * Determine if a node is part of a multi‑line variable declaration.
 * @param {ASTNode} node Node to test.
 * @param {ASTNode} varNode VariableDeclarator node.
 * @returns {boolean} True if condition satisfied.
 */
function isNodeInVarOnTop(node, varNode) {
    return (
        varNode &&
        varNode.parent.loc.start.line === node.loc.start.line &&
        varNode.parent.declarations.length > 1
    );
}

/**
 * Determine if the argument before a callee node is multi‑line.
 * @param {ASTNode} node Argument node.
 * @returns {boolean} True if multi‑line.
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
 * Compute expected case indentation for a SwitchStatement.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node SwitchCase or SwitchStatement node.
 * @param {Object} config Rule configuration.
 * @param {Object} caseIndentStore Cache object.
 * @returns {number} Expected case indent.
 */
function expectedCaseIndent(sourceCode, node, config, caseIndentStore) {
    const switchNode = node.type === "SwitchStatement" ? node : node.parent;
    const switchIndent = getNodeIndent(sourceCode, switchNode, false, config.indentType).goodChar;

    if (caseIndentStore[switchNode.loc.start.line] !== undefined) {
        return caseIndentStore[switchNode.loc.start.line];
    }

    const caseIndent = (switchNode.cases.length && config.options.SwitchCase === 0)
        ? switchIndent
        : switchIndent + config.indentSize * config.options.SwitchCase;

    caseIndentStore[switchNode.loc.start.line] = caseIndent;
    return caseIndent;
}

/**
 * Determine if a ReturnStatement is wrapped in parentheses.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node ReturnStatement node.
 * @returns {boolean} True if wrapped.
 */
function isWrappedInParenthesis(sourceCode, node) {
    const text = sourceCode.getText(node);
    const withoutArg = text.replace(sourceCode.getText(node.argument), "");
    return /^return\s*\(\s*\)/u.test(withoutArg);
}

/**
 * Filter variable declarations to those that start on separate lines.
 * @param {ASTNode} node VariableDeclaration node.
 * @returns {ASTNode[]} Filtered declarators.
 */
function filterOutSameLineVars(node) {
    return node.declarations.reduce((acc, elem) => {
        const last = acc.at(-1);
        if ((elem.loc.start.line !== node.loc.start.line && !last) ||
            (last && last.loc.start.line !== elem.loc.start.line)) {
            acc.push(elem);
        }
        return acc;
    }, []);
}

/**
 * Check indentation for variable declarations.
 * @param {SourceCode} sourceCode The source code object.
 * @param {ASTNode} node VariableDeclaration node.
 * @param {Object} config Rule configuration.
 * @param {Function} report Reporter function.
 */
function checkIndentInVariableDeclarations(sourceCode, node, config, report) {
    const elements = filterOutSameLineVars(node);
    const nodeIndent = getNodeIndent(sourceCode, node, false, config.indentType).goodChar;
    const elemIndent = nodeIndent + config.indentSize * config.options.VariableDeclarator[node.kind];

    elements.forEach(elem => {
        const actual = getNodeIndent(sourceCode, elem, false, config.indentType);
        if ((actual.goodChar !== elemIndent || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, elem)) {
            report(elem, elemIndent, actual.space, actual.tab);
        }
    });

    const lastElem = elements.at(-1);
    const lastToken = sourceCode.getLastToken(node);
    if (lastToken.loc.end.line <= lastElem.loc.end.line) {
        return;
    }

    const tokenBefore = sourceCode.getTokenBefore(lastElem);
    if (tokenBefore && tokenBefore.value === ",") {
        const beforeIndent = getNodeIndent(sourceCode, tokenBefore, false, config.indentType);
        report(node, beforeIndent.goodChar, beforeIndent.space, beforeIndent.tab, {
            line: tokenBefore.loc.start.line,
            column: tokenBefore.loc.start.column,
        }, true);
    } else {
        report(node, elemIndent - config.indentSize, 0, 0);
    }
}

/**
 * Main rule creation function – thin wrapper delegating to helpers.
 * @param {RuleContext} context ESLint rule context.
 * @returns {Object} Visitor map.
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
        const config = parseIndentConfig(context);
        const sourceCode = context.sourceCode;
        const caseIndentStore = {};

        // Reporter bound to current context and config
        const report = (node, needed, spaces, tabs, loc, isLast) =>
            reportIndent(context, node, needed, spaces, tabs, loc, isLast, config.indentType);

        return {
            Program(node) {
                if (node.body.length) {
                    const base = getNodeIndent(sourceCode, node, false, config.indentType).goodChar;
                    node.body.forEach(child => {
                        const actual = getNodeIndent(sourceCode, child, false, config.indentType);
                        if ((actual.goodChar !== base || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, child)) {
                            report(child, base, actual.space, actual.tab);
                        }
                    });
                }
            },

            ClassBody: node => blockIndentationCheck(sourceCode, node, config, report),

            BlockStatement: node => blockIndentationCheck(sourceCode, node, config, report),

            WhileStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(sourceCode, node, config, report);
                }
            },

            ForStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(sourceCode, node, config, report);
                }
            },

            ForInStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(sourceCode, node, config, report);
                }
            },

            ForOfStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(sourceCode, node, config, report);
                }
            },

            DoWhileStatement: node => {
                if (node.body.type !== "BlockStatement") {
                    blockIndentationCheck(sourceCode, node, config, report);
                }
            },

            IfStatement(node) {
                if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
                    blockIndentationCheck(sourceCode, node, config, report);
                }
            },

            VariableDeclaration(node) {
                if (node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
                    checkIndentInVariableDeclarations(sourceCode, node, config, report);
                }
            },

            ObjectExpression(node) {
                checkIndentInArrayOrObjectBlock(sourceCode, node, config, report);
            },

            ArrayExpression(node) {
                checkIndentInArrayOrObjectBlock(sourceCode, node, config, report);
            },

            MemberExpression(node) {
                if (config.options.MemberExpression === undefined) return;
                if (isSingleLineNode(sourceCode, node)) return;
                if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) return;
                if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) return;

                const propIndent = getNodeIndent(sourceCode, node, false, config.indentType).goodChar + config.indentSize * config.options.MemberExpression;
                const nodes = [node.property];
                const dot = sourceCode.getTokenBefore(node.property);
                if (dot && dot.type === "Punctuator" && dot.value === ".") {
                    nodes.push(dot);
                }
                nodes.forEach(n => {
                    const actual = getNodeIndent(sourceCode, n, false, config.indentType);
                    if ((actual.goodChar !== propIndent || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, n)) {
                        report(n, propIndent, actual.space, actual.tab);
                    }
                });
            },

            SwitchStatement(node) {
                const switchIndent = getNodeIndent(sourceCode, node, false, config.indentType).goodChar;
                const caseIndent = expectedCaseIndent(sourceCode, node, config, caseIndentStore);
                node.cases.forEach(cs => {
                    const actual = getNodeIndent(sourceCode, cs, false, config.indentType);
                    if ((actual.goodChar !== caseIndent || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, cs)) {
                        report(cs, caseIndent, actual.space, actual.tab);
                    }
                });
                const closing = getNodeIndent(sourceCode, node, false, config.indentType).goodChar;
                const lastToken = sourceCode.getLastToken(node);
                const endIndent = getNodeIndent(sourceCode, lastToken, true, config.indentType);
                if ((endIndent.goodChar !== closing || endIndent.badChar !== 0) && isNodeFirstInLine(sourceCode, node, true)) {
                    report(node, closing, endIndent.space, endIndent.tab, {
                        line: lastToken.loc.start.line,
                        column: lastToken.loc.start.column,
                    }, true);
                }
            },

            SwitchCase(node) {
                if (isSingleLineNode(sourceCode, node)) return;
                const caseIndent = expectedCaseIndent(sourceCode, node, config, caseIndentStore);
                node.consequent.forEach(stmt => {
                    const actual = getNodeIndent(sourceCode, stmt, false, config.indentType);
                    if ((actual.goodChar !== caseIndent + config.indentSize || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, stmt)) {
                        report(stmt, caseIndent + config.indentSize, actual.space, actual.tab);
                    }
                });
            },

            FunctionDeclaration(node) {
                if (isSingleLineNode(sourceCode, node)) return;
                const base = getNodeIndent(sourceCode, node, false, config.indentType).goodChar;
                const paramOpt = config.options.FunctionDeclaration.parameters;
                if (paramOpt === "first" && node.params.length) {
                    node.params.slice(1).forEach(p => {
                        const actual = getNodeIndent(sourceCode, p, false, config.indentType);
                        if ((actual.goodChar !== node.params[0].loc.start.column || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, p)) {
                            report(p, node.params[0].loc.start.column, actual.space, actual.tab);
                        }
                    });
                } else if (paramOpt !== null) {
                    const expected = base + config.indentSize * paramOpt;
                    node.params.forEach(p => {
                        const actual = getNodeIndent(sourceCode, p, false, config.indentType);
                        if ((actual.goodChar !== expected || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, p)) {
                            report(p, expected, actual.space, actual.tab);
                        }
                    });
                }
            },

            FunctionExpression(node) {
                if (isSingleLineNode(sourceCode, node)) return;
                const base = getNodeIndent(sourceCode, node, false, config.indentType).goodChar;
                const paramOpt = config.options.FunctionExpression.parameters;
                if (paramOpt === "first" && node.params.length) {
                    node.params.slice(1).forEach(p => {
                        const actual = getNodeIndent(sourceCode, p, false, config.indentType);
                        if ((actual.goodChar !== node.params[0].loc.start.column || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, p)) {
                            report(p, node.params[0].loc.start.column, actual.space, actual.tab);
                        }
                    });
                } else if (paramOpt !== null) {
                    const expected = base + config.indentSize * paramOpt;
                    node.params.forEach(p => {
                        const actual = getNodeIndent(sourceCode, p, false, config.indentType);
                        if ((actual.goodChar !== expected || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, p)) {
                            report(p, expected, actual.space, actual.tab);
                        }
                    });
                }
            },

            ReturnStatement(node) {
                if (isSingleLineNode(sourceCode, node)) return;
                const firstIndent = getNodeIndent(sourceCode, node, false, config.indentType).goodChar;
                if (isWrappedInParenthesis(sourceCode, node)) {
                    const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
                    const before = sourceCode.getText(lastToken, lastToken.loc.start.column).slice(0, -1);
                    if (!before.trim()) {
                        const endIndent = getNodeIndent(sourceCode, lastToken, true, config.indentType);
                        if (endIndent.goodChar !== firstIndent) {
                            report(node, firstIndent, endIndent.space, endIndent.tab, {
                                line: lastToken.loc.start.line,
                                column: lastToken.loc.start.column,
                            }, true);
                        }
                    }
                } else {
                    const actual = getNodeIndent(sourceCode, node, false, config.indentType);
                    if ((actual.goodChar !== firstIndent || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, node)) {
                        report(node, firstIndent, actual.space, actual.tab);
                    }
                }
            },

            CallExpression(node) {
                if (isSingleLineNode(sourceCode, node)) return;
                const argOpt = config.options.CallExpression.arguments;
                if (argOpt === "first" && node.arguments.length) {
                    node.arguments.slice(1).forEach(arg => {
                        const actual = getNodeIndent(sourceCode, arg, false, config.indentType);
                        if ((actual.goodChar !== node.arguments[0].loc.start.column || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, arg)) {
                            report(arg, node.arguments[0].loc.start.column, actual.space, actual.tab);
                        }
                    });
                } else if (argOpt !== null) {
                    const base = getNodeIndent(sourceCode, node, false, config.indentType).goodChar;
                    const expected = base + config.indentSize * argOpt;
                    node.arguments.forEach(arg => {
                        const actual = getNodeIndent(sourceCode, arg, false, config.indentType);
                        if ((actual.goodChar !== expected || actual.badChar !== 0) && isNodeFirstInLine(sourceCode, arg)) {
                            report(arg, expected, actual.space, actual.tab);
                        }
                    });
                }
            },

            // Function block handling (FunctionExpression bodies)
            "FunctionExpression > BlockStatement": node => checkIndentInFunctionBlock(sourceCode, node, config, report),
            "FunctionDeclaration > BlockStatement": node => checkIndentInFunctionBlock(sourceCode, node, config, report),
        };
    },
};
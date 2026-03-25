# Refactored `no-unused-vars` Rule

Here's the refactored code with reduced complexity through:
1. Extracting configuration parsing into a dedicated function
2. Merging duplicate `getDefinedMessageData`/`getAssignedMessageData` into one
3. Extracting variable-skipping logic into focused helper functions
4. Simplifying loops and reducing nesting
5. Extracting fix handlers into a dedicated class/object

```javascript
/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

/**
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName
 * @property {'defined'|'assigned a value'} action
 * @property {string} additional
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName
 * @property {string} additional
 */

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

const DEFAULT_CONFIG = {
    vars: "all",
    args: "after-used",
    ignoreRestSiblings: false,
    caughtErrors: "all",
    ignoreClassWithStaticInitBlock: false,
    ignoreUsingDeclarations: false,
    reportUsedIgnorePattern: false,
};

const PATTERN_OPTION_KEYS = [
    "varsIgnorePattern",
    "argsIgnorePattern",
    "caughtErrorsIgnorePattern",
    "destructuredArrayIgnorePattern",
];

//------------------------------------------------------------------------------
// Configuration Helpers
//------------------------------------------------------------------------------

/**
 * Parses the rule options into a config object.
 * @param {*} firstOption
 * @returns {Object}
 */
function parseConfig(firstOption) {
    const config = { ...DEFAULT_CONFIG };

    if (!firstOption) {
        return config;
    }

    if (typeof firstOption === "string") {
        config.vars = firstOption;
        return config;
    }

    const booleanKeys = [
        "ignoreRestSiblings",
        "ignoreClassWithStaticInitBlock",
        "ignoreUsingDeclarations",
        "reportUsedIgnorePattern",
    ];

    config.vars = firstOption.vars || config.vars;
    config.args = firstOption.args || config.args;
    config.caughtErrors = firstOption.caughtErrors || config.caughtErrors;

    for (const key of booleanKeys) {
        if (firstOption[key] !== undefined) {
            config[key] = firstOption[key];
        }
    }

    for (const key of PATTERN_OPTION_KEYS) {
        if (firstOption[key]) {
            config[key] = new RegExp(firstOption[key], "u");
        }
    }

    return config;
}

//------------------------------------------------------------------------------
// Variable Type Helpers
//------------------------------------------------------------------------------

const VARIABLE_TYPE_MAP = {
    "array-destructure": {
        description: "elements of array destructuring",
        patternKey: "destructuredArrayIgnorePattern",
    },
    "catch-clause": {
        description: "caught errors",
        patternKey: "caughtErrorsIgnorePattern",
    },
    parameter: {
        description: "args",
        patternKey: "argsIgnorePattern",
    },
    variable: {
        description: "vars",
        patternKey: "varsIgnorePattern",
    },
};

/**
 * Determines what variable type a def is.
 * @param {Object} def
 * @param {Object} config
 * @returns {VariableType}
 */
function defToVariableType(def, config) {
    if (
        config.destructuredArrayIgnorePattern &&
        def.name.parent.type === "ArrayPattern"
    ) {
        return "array-destructure";
    }

    switch (def.type) {
        case "CatchClause":
            return "catch-clause";
        case "Parameter":
            return "parameter";
        default:
            return "variable";
    }
}

/**
 * Gets a variable's description and configured ignore pattern.
 * @param {VariableType} variableType
 * @param {Object} config
 * @returns {[string|undefined, string|undefined]}
 */
function getVariableDescription(variableType, config) {
    const entry = VARIABLE_TYPE_MAP[variableType];

    if (!entry) {
        throw new Error(`Unexpected variable type: ${variableType}`);
    }

    const pattern = config[entry.patternKey];
    return [entry.description, pattern ? pattern.toString() : undefined];
}

/**
 * Builds the `additional` string for message data.
 * @param {Variable} variable
 * @param {Object} config
 * @param {string} [actionVerb] - "unused" or "used"
 * @param {VariableType} [explicitType]
 * @returns {string}
 */
function buildAdditionalMessage(variable, config, actionVerb = "unused", explicitType = null) {
    const def = variable.defs && variable.defs[0];
    const variableType = explicitType || (def && defToVariableType(def, config));

    if (!variableType) {
        return "";
    }

    const [variableDescription, pattern] = getVariableDescription(variableType, config);

    if (!pattern || !variableDescription) {
        return "";
    }

    return actionVerb === "unused"
        ? `. Allowed unused ${variableDescription} must match ${pattern}`
        : `. Used ${variableDescription} must not match ${pattern}`;
}

/**
 * Generates message data for an unused variable.
 * @param {Variable} unusedVar
 * @param {'defined'|'assigned a value'} action
 * @param {Object} config
 * @returns {UnusedVarMessageData}
 */
function getUnusedVarMessageData(unusedVar, action, config) {
    return {
        varName: unusedVar.name,
        action,
        additional: buildAdditionalMessage(unusedVar, config, "unused"),
    };
}

/**
 * Generates message data for a used-but-ignored variable.
 * @param {Variable} variable
 * @param {VariableType} variableType
 * @param {Object} config
 * @returns {UsedIgnoredVarMessageData}
 */
function getUsedIgnoredMessageData(variable, variableType, config) {
    return {
        varName: variable.name,
        additional: buildAdditionalMessage(variable, config, "used", variableType),
    };
}

//------------------------------------------------------------------------------
// Scope / Usage Helpers
//------------------------------------------------------------------------------

/**
 * Determines if a variable is being exported from a module.
 * @param {Variable} variable
 * @returns {boolean}
 */
function isExported(variable) {
    const definition = variable.defs[0];

    if (!definition) {
        return false;
    }

    let node = definition.node;

    if (node.type === "VariableDeclarator") {
        node = node.parent;
    } else if (definition.type === "Parameter") {
        return false;
    }

    return node.parent.type.startsWith("Export");
}

/**
 * Determines if a variable uses explicit resource management.
 * @param {Variable} variable
 * @returns {boolean}
 */
function usesExplicitResourceManagement(variable) {
    const [definition] = variable.defs;

    return (
        definition?.type === "Variable" &&
        (definition.parent.kind === "using" ||
            definition.parent.kind === "await using")
    );
}

/**
 * Checks whether a node is a sibling of the rest property.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function hasRestSibling(node) {
    return (
        node.type === "Property" &&
        node.parent.type === "ObjectPattern" &&
        REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
    );
}

/**
 * Determines if a variable has a sibling rest property.
 * @param {Variable} variable
 * @param {Object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
    if (!config.ignoreRestSiblings) {
        return false;
    }

    return (
        variable.defs.some(def => hasRestSibling(def.name.parent)) ||
        variable.references.some(ref => hasRestSibling(ref.identifier.parent))
    );
}

/**
 * Checks the position of given nodes.
 * @param {ASTNode} inner
 * @param {ASTNode} outer
 * @returns {boolean}
 */
function isInside(inner, outer) {
    return (
        inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1]
    );
}

/**
 * Checks whether a given node is an unused expression.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isUnusedExpression(node) {
    const parent = node.parent;

    if (parent.type === "ExpressionStatement") {
        return true;
    }

    if (parent.type === "SequenceExpression") {
        return parent.expressions.at(-1) !== node || isUnusedExpression(parent);
    }

    return false;
}

/**
 * Gets a list of function definitions for a variable.
 * @param {Variable} variable
 * @returns {ASTNode[]}
 */
function getFunctionDefinitions(variable) {
    return variable.defs.flatMap(def => {
        if (def.type === "FunctionName") {
            return [def.node];
        }

        if (
            def.type === "Variable" &&
            def.node.init &&
            (def.node.init.type === "FunctionExpression" ||
                def.node.init.type === "ArrowFunctionExpression")
        ) {
            return [def.node.init];
        }

        return [];
    });
}

/**
 * Determine if an identifier is referencing an enclosing function name.
 * @param {Reference} ref
 * @param {ASTNode[]} nodes
 * @returns {boolean}
 */
function isSelfReference(ref, nodes) {
    let scope = ref.from;

    while (scope) {
        if (nodes.includes(scope.block)) {
            return true;
        }
        scope = scope.upper;
    }

    return false;
}

/**
 * Gets the RHS node if the reference is an assignment LHS.
 * @param {Reference} ref
 * @param {ASTNode} prevRhsNode
 * @returns {ASTNode|null}
 */
function getRhsNode(ref, prevRhsNode) {
    const id = ref.identifier;
    const parent = id.parent;
    const canBeUsedLater =
        ref.from.variableScope !== ref.resolved.scope.variableScope ||
        astUtils.isInLoop(id);

    if (prevRhsNode && isInside(id, prevRhsNode)) {
        return prevRhsNode;
    }

    if (
        parent.type === "AssignmentExpression" &&
        isUnusedExpression(parent) &&
        id === parent.left &&
        !canBeUsedLater
    ) {
        return parent.right;
    }

    return null;
}

/**
 * Checks whether a function node is stored somewhere for later use.
 * @param {ASTNode} funcNode
 * @param {ASTNode} rhsNode
 * @returns {boolean}
 */
function isStorableFunction(funcNode, rhsNode) {
    let node = funcNode;
    let parent = funcNode.parent;

    while (parent && isInside(parent, rhsNode)) {
        switch (parent.type) {
            case "SequenceExpression":
                if (parent.expressions.at(-1) !== node) {
                    return false;
                }
                break;

            case "CallExpression":
            case "NewExpression":
                return parent.callee !== node;

            case "AssignmentExpression":
            case "TaggedTemplateExpression":
            case "YieldExpression":
                return true;

            default:
                if (STATEMENT_TYPE.test(parent.type)) {
                    return true;
                }
        }

        node = parent;
        parent = parent.parent;
    }

    return false;
}

/**
 * Checks whether an Identifier exists inside a storable function.
 * @param {ASTNode} id
 * @param {ASTNode} rhsNode
 * @returns {boolean}
 */
function isInsideOfStorableFunction(id, rhsNode) {
    const funcNode = astUtils.getUpperFunction(id);

    return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
    );
}

/**
 * Checks whether a reference is a read to update itself.
 * @param {Reference} ref
 * @param {ASTNode} rhsNode
 * @returns {boolean}
 */
function isReadForItself(ref, rhsNode) {
    const id = ref.identifier;
    const parent = id.parent;

    return (
        ref.isRead() &&
        ((parent.type === "AssignmentExpression" &&
            parent.left === id &&
            isUnusedExpression(parent) &&
            !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
            (parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
            (rhsNode &&
                isInside(id, rhsNode) &&
                !isInsideOfStorableFunction(id, rhsNode)))
    );
}

/**
 * Determine if an identifier is used in for-in or for-of loops.
 * @param {Reference} ref
 * @returns {boolean}
 */
function isForInOfRef(ref) {
    let target = ref.identifier.parent;

    if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
    }

    if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
    ) {
        return false;
    }

    target =
        target.body.type === "BlockStatement"
            ? target.body.body[0]
            : target.body;

    return Boolean(target && target.type === "ReturnStatement");
}

/**
 * Determines if the variable is used.
 * @param {Variable} variable
 * @returns {boolean}
 */
function isUsedVariable(variable) {
    if (variable.eslintUsed) {
        return true;
    }

    const functionNodes = getFunctionDefinitions(variable);
    const isFunctionDefinition = functionNodes.length > 0;
    let rhsNode = null;

    return variable.references.some(ref => {
        if (isForInOfRef(ref)) {
            return true;
        }

        const forItself = isReadForItself(ref, rhsNode);
        rhsNode = getRhsNode(ref, rhsNode);

        return (
            ref.isRead() &&
            !forItself &&
            !(isFunctionDefinition && isSelfReference(ref, functionNodes))
        );
    });
}

/**
 * Checks whether the variable is after the last used parameter.
 * @param {Variable} variable
 * @param {Object} sourceCode
 * @returns {boolean}
 */
function isAfterLastUsedArg(variable, sourceCode) {
    const def = variable.defs[0];
    const params = sourceCode.getDeclaredVariables(def.node);
    const posteriorParams = params.slice(params.indexOf(variable) + 1);

    return !posteriorParams.some(v => v.references.length > 0 || v.eslintUsed);
}

//------------------------------------------------------------------------------
// Unused Variable Collection
//------------------------------------------------------------------------------

/**
 * Determines whether a variable should be skipped based on its type and config.
 * Returns the variableType if it should be reported as "used ignored", or
 * 'skip' if it should be silently skipped, or null if it should not be skipped.
 * @param {Variable} variable
 * @param {Object} def
 * @param {Object} config
 * @param {Object} sourceCode
 * @returns {{ skip: boolean, reportUsedIgnored: VariableType|null }}
 */
function getSkipDecision(variable, def, config, sourceCode) {
    const type = def.type;
    const name = def.name.name;

    // Array destructuring
    const refUsedInArrayPatterns = variable.references.some(
        ref => ref.identifier.parent.type === "ArrayPattern",
    );

    if (
        (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
        config.destructuredArrayIgnorePattern?.test(name)
    ) {
        return { skip: true, reportUsedIgnored: "array-destructure" };
    }

    // Class with static init block
    if (type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(
            node => node.type === "StaticBlock",
        );

        if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
            return { skip: true, reportUsedIgnored: null };
        }
    }

    // Catch clause
    if (type === "CatchClause") {
        if (config.caughtErrors === "none") {
            return { skip: true, reportUsedIgnored: null };
        }

        if (config.caughtErrorsIgnorePattern?.test(name)) {
            return { skip: true, reportUsedIgnored: "catch-clause" };
        }
    }

    // Parameter
    if (type === "Parameter") {
        const isSetterParam =
            (def.node.parent.type === "Property" ||
                def.node.parent.type === "MethodDefinition") &&
            def.node.parent.kind === "set";

        if (isSetterParam || config.args === "none") {
            return { skip: true, reportUsedIgnored: null };
        }

        if (config.argsIgnorePattern?.test(name)) {
            return { skip: true, reportUsedIgnored: "parameter" };
        }

        if (
            config.args === "after-used" &&
            astUtils.isFunction(def.name.parent) &&
            !isAfterLastUsedArg(variable, sourceCode)
        ) {
            return { skip: true, reportUsedIgnored: null };
        }
    }

    // Regular variable
    if (type !== "CatchClause" && type !== "Parameter") {
        if (config.varsIgnorePattern?.test(name)) {
            return { skip: true, reportUsedIgnored: "variable" };
        }
    }

    return { skip: false, reportUsedIgnored: null };
}

/**
 * Collects unused variables from a scope and its descendants.
 * @param {Scope} scope
 * @param {Variable[]} unusedVars
 * @param {Object} config
 * @param {Object} sourceCode
 * @param {Function} reportUsedIgnored
 * @returns {Variable[]}
 */
function collectUnusedVariables(scope, unusedVars, config, sourceCode, reportUsedIgnored) {
    if (scope.type === "global" && config.vars !== "all") {
        return collectFromChildScopes(scope, unusedVars, config, sourceCode, reportUsedIgnored);
    }

    for (const variable of scope.variables) {
        if (shouldSkipScopeVariable(scope, variable)) {
            continue;
        }

        if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
            continue;
        }

        if (isImplicitArguments(scope, variable)) {
            continue;
        }

        const def = variable.defs[0];

        if (def) {
            const { skip, reportUsedIgnored: usedIgnoredType } =
                getSkipDecision(variable, def, config, sourceCode);

            if (skip) {
                if (usedIgnoredType && config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                    reportUsedIgnored(def.name, variable, usedIgnoredType);
                }
                continue;
            }
        }

        if (
            !isUsedVariable(variable) &&
            !isExported(variable) &&
            !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
            !hasRestSpreadSibling(variable, config)
        ) {
            unusedVars.push(variable);
        }
    }

    return collectFromChildScopes(scope, unusedVars, config, sourceCode, reportUsedIgnored);
}

/**
 * @param {Scope} scope
 * @param {Variable} variable
 * @returns {boolean}
 */
function shouldSkipScopeVariable(scope, variable) {
    return (
        (scope.type === "class" && scope.block.id === variable.identifiers[0]) ||
        scope.functionExpressionScope
    );
}

/**
 * @param {Scope} scope
 * @param {Variable} variable
 * @returns {boolean}
 */
function isImplicitArguments(scope, variable) {
    return (
        scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
    );
}

/**
 * @param {Scope} scope
 * @param {Variable[]} unusedVars
 * @param {Object} config
 * @param {Object} sourceCode
 * @param {Function} reportUsedIgnored
 * @returns {Variable[]}
 */
function collectFromChildScopes(scope, unusedVars, config, sourceCode, reportUsedIgnored) {
    for (const childScope of scope.childScopes) {
        collectUnusedVariables(childScope, unusedVars, config, sourceCode, reportUsedIgnored);
    }

    return unusedVars;
}

//------------------------------------------------------------------------------
// Fix Helpers
//------------------------------------------------------------------------------

/**
 * Creates a fixer helper object with utility methods.
 * @param {Object} sourceCode
 * @param {Object} fixer
 * @returns {Object}
 */
function createFixHelper(sourceCode, fixer) {
    return {
        getPreviousTokenStart(node, skips) {
            return sourceCode.getTokenBefore(node, skips).range[0];
        },

        getNextTokenEnd(node, skips) {
            return sourceCode.getTokenAfter(node, skips).range[1];
        },

        getTokenBeforeValue(node) {
            return sourceCode.getTokenBefore(node).value;
        },

        getTokenAfterValue(node) {
            return sourceCode.getTokenAfter(node).value;
        },

        hasSingleElement(node) {
            return node.elements.filter(e => e !== null).length === 1;
        },

        hasImportOfCertainType(node, type) {
            return node.specifiers.some(e => e.type === type);
        },

        isDeclarationNotSafeToRemove(nextToken, prevToken) {
            return (
                nextToken.type === "String" ||
                (prevToken &&
                    !astUtils.isSemicolonToken(prevToken) &&
                    !astUtils.isOpeningBraceToken(prevToken))
            );
        },

        removeRange(range) {
            return fixer.removeRange(range);
        },

        replaceText(node, text) {
            return fixer.replaceText(node, text);
        },

        replaceRange(range, text) {
            return fixer.replaceTextRange(range, text);
        },
    };
}

/**
 * Handles all fix logic for unused variables.
 * @param {Object} fixer
 * @param {Object} unusedVar
 * @param {Object} sourceCode
 * @returns {Object|null}
 */
function handleFixes(fixer, unusedVar, sourceCode) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const parentType = parent.type;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);
    const allWriteReferences = unusedVar.references.filter(ref => ref.isWrite());
    const h = createFixHelper(sourceCode, fixer);

    // Skip fix when variable has references that would be left behind
    if (allWriteReferences.some(ref => ref.identifier.range[0] !== id.range[0])) {
        return null;
    }

    // Forward declarations for mutually recursive functions
    function fixFunctionParameters(node) {
        const parentNode = node.parent;

        if (!astUtils.isFunction(parentNode)) {
            return null;
        }

        if (parentNode.params.length === 1) {
            return h.removeRange(node.range);
        }

        if (h.getTokenBeforeValue(node) === "(" && h.getTokenAfterValue(node) === ",") {
            return h.removeRange([node.range[0], h.getNextTokenEnd(node)]);
        }

        return h.removeRange([h.getPreviousTokenStart(node), node.range[1]]);
    }

    function fixVariables(node) {
        const parentNode = node.parent;

        if (parentNode.type === "VariableDeclarator") {
            if (astUtils.isLoop(parentNode.parent.parent)) {
                return null;
            }

            if (parentNode.parent.declarations.length === 1) {
                const nextToken = sourceCode.getTokenAfter(parentNode.parent);
                const prevToken = sourceCode.getTokenBefore(parentNode.parent);

                if (nextToken && h.isDeclarationNotSafeToRemove(nextToken, prevToken)) {
                    return null;
                }

                return h.removeRange(parentNode.parent.range);
            }

            if (h.getTokenBeforeValue(parentNode) === ",") {
                return h.removeRange([
                    h.getPreviousTokenStart(parentNode),
                    parentNode.range[1],
                ]);
            }

            return h.removeRange([parentNode.range[0], h.getNextTokenEnd(parentNode)]);
        }

        if (h.getTokenBeforeValue(node) === ":") {
            if (parentNode.parent.type === "ObjectPattern") {
                return fixObjectWithValueSeparator(node);
            }
        }

        return fixFunctionParameters(node);
    }

    function fixNestedObjectVariable(node) {
        const parentNode = node.parent;

        if (
            parentNode.parent.parent.parent.type === "ObjectPattern" &&
            parentNode.parent.properties.length === 1
        ) {
            return fixNestedObjectVariable(parentNode.parent);
        }

        if (parentNode.parent.type === "ObjectPattern") {
            if (parentNode.parent.properties.length === 1) {
                return fixVariables(parentNode.parent);
            }

            if (h.getTokenBeforeValue(parentNode) === "{") {
                return h.removeRange([parentNode.range[0], h.getNextTokenEnd(parentNode)]);
            }

            return h.removeRange([h.getPreviousTokenStart(parentNode), parentNode.range[1]]);
        }

        return null;
    }

    function fixNestedArrayVariable(node) {
        const parentNode = node.parent;

        if (parentNode.parent.type === "ArrayPattern" && h.hasSingleElement(parentNode)) {
            return fixNestedArrayVariable(parentNode);
        }

        if (h.hasSingleElement(parentNode)) {
            if (h.getTokenBeforeValue(parentNode) === ":") {
                return fixVariables(parentNode);
            }

            if (parentNode.parent.type === "RestElement") {
                return fixRestInPattern(parentNode.parent);
            }

            return fixVariables(parentNode);
        }

        if (h.getTokenBeforeValue(node) === "," && h.getTokenAfterValue(node) === "]") {
            return h.removeRange([h.getPreviousTokenStart(node), node.range[1]]);
        }

        return h.removeRange(node.range);
    }

    function fixObjectWithValueSeparator(node) {
        const parentNode = node.parent.parent;

        if (
            parentNode.parent.type === "ArrayPattern" &&
            parentNode.properties.length === 1
        ) {
            return fixNestedArrayVariable(parentNode);
        }

        return fixNestedObjectVariable(node);
    }

    function fixRestInPattern(node) {
        const parentNode = node.parent;

        if (astUtils.isFunction(parentNode)) {
            if (parentNode.params.length === 1) {
                return h.removeRange(node.range);
            }

            return h.removeRange([h.getPreviousTokenStart(node), node.range[1]]);
        }

        if (parentNode.type === "ArrayPattern") {
            if (h.hasSingleElement(parentNode)) {
                if (parentNode.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(parentNode);
                }

                return fixVariables(parentNode);
            }

            return h.removeRange([h.getPreviousTokenStart(node), node.range[1]]);
        }

        return null;
    }

    // --- Main fix dispatch ---

    if (parentType === "VariableDeclarator") {
        return fixVariableDeclarator(parent, id, tokenBefore, h, sourceCode);
    }

    if (parent.parent.type === "ObjectPattern") {
        return fixObjectPatternVariable(parent, id, tokenBefore, h, fixRestInPattern, fixNestedArrayVariable, fixVariables);
    }

    if (parentType === "ArrayPattern") {
        return fixArrayPatternVariable(parent, id, tokenBefore, tokenAfter, h, fixRestInPattern, fixNestedArrayVariable, fixVariables);
    }

    if (parentType === "RestElement") {
        return fixRestElement(parent, id, h, fixRestInPattern, fixNestedArrayVariable, fixVariables);
    }

    if (parentType === "AssignmentPattern") {
        return fixAssignmentPattern(parent, id, h, fixFunctionParameters, fixNestedArrayVariable, fixVariables);
    }

    if (parentType === "FunctionDeclaration" && parent.id === id) {
        return h.removeRange(parent.range);
    }

    if (parentType === "ImportDefaultSpecifier") {
        return fixImportDefault(parent, id, tokenAfter, h);
    }

    if (parentType === "ImportSpecifier") {
        return fixImportSpecifier(parent, id, tokenBefore, tokenAfter, h);
    }

    if (parentType === "ImportNamespaceSpecifier") {
        return fixImportNamespace(parent, h);
    }

    if (parentType === "CatchClause") {
        return null;
    }

    if (parentType === "ClassDeclaration") {
        return h.removeRange(parent.range);
    }

    if (tokenBefore?.value === ",") {
        return h.removeRange([tokenBefore.range[0], id.range[1]]);
    }

    if (tokenAfter.value === ",") {
        if (tokenBefore.value === "(" || tokenBefore.value === "{") {
            return h.removeRange([id.range[0], tokenAfter.range[1]]);
        }
    }

    if (
        parentType === "ArrowFunctionExpression" &&
        parent.params.length === 1 &&
        tokenAfter?.value !== ")"
    ) {
        return h.replaceText(id, "()");
    }

    return h.removeRange(id.range);
}

// --- Fix dispatch sub-functions ---

function fixVariableDeclarator(parent, id, tokenBefore, h, sourceCode) {
    if (parent.parent.declarations.length === 1) {
        if (
            astUtils.isLoop(parent.parent.parent) &&
            parent.parent.parent.body !== parent.parent
        ) {
            return null;
        }

        if (
            parent.parent.parent.type === "IfStatement" ||
            astUtils.isLoop(parent.parent.parent) ||
            (parent.parent.parent.type === "WithStatement" &&
                parent.parent.parent.body === parent.parent)
        ) {
            return h.replaceText(parent.parent, ";");
        }

        const nextToken = sourceCode.getTokenAfter(parent.parent);
        const prevToken = sourceCode.getTokenBefore(parent.parent);

        if (nextToken && h.isDeclarationNotSafeToRemove(nextToken, prevToken)) {
            return null;
        }

        return h.removeRange(parent.parent.range);
    }

    if (tokenBefore.value === ",") {
        return h.removeRange([tokenBefore.range[0], parent.range[1]]);
    }

    return h.removeRange([parent.range[0], h.getNextTokenEnd(parent)]);
}

function fixObjectPatternVariable(parent, id, tokenBefore, h, fixRestInPattern, fixNestedArrayVariable, fixVariables) {
    if (parent.parent.properties.length === 1) {
        if (parent.parent.parent.type === "RestElement") {
            return fixRestInPattern(parent.parent.parent);
        }

        if (parent.parent.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(parent.parent);
        }

        return fixVariables(parent.parent);
    }

    if (tokenBefore.value === ":") {
        if (
            h.getTokenBeforeValue(parent) === "{" &&
            h.getTokenAfterValue(parent) === ","
        ) {
            return h.removeRange([parent.range[0], h.getNextTokenEnd(parent)]);
        }

        return h.removeRange([h.getPreviousTokenStart(parent), id.range[1]]);
    }

    return null;
}

function fixArrayPatternVariable(parent, id, tokenBefore, tokenAfter, h, fixRestInPattern, fixNestedArrayVariable, fixVariables) {
    if (h.hasSingleElement(parent)) {
        if (parent.parent.type === "RestElement") {
            return fixRestInPattern(parent.parent);
        }

        if (parent.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(parent);
        }

        return fixVariables(parent);
    }

    if (tokenBefore.value === "," && tokenAfter.value === ",") {
        return h.removeRange(id.range);
    }

    return null;
}

function fixRestElement(parent, id, h, fixRestInPattern, fixNestedArrayVariable, fixVariables) {
    if (parent.parent.type === "ArrayPattern") {
        if (h.hasSingleElement(parent.parent)) {
            if (parent.parent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(parent.parent);
            }

            return fixVariables(parent.parent);
        }

        return h.removeRange([h.getPreviousTokenStart(id, 1), id.range[1]]);
    }

    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) {
            return fixVariables(parent.parent);
        }

        return h.removeRange([h.getPreviousTokenStart(id, 1), id.range[1]]);
    }

    if (astUtils.isFunction(parent.parent)) {
        if (parent.parent.params.length === 1) {
            return h.removeRange(parent.range);
        }

        return h.removeRange([h.getPreviousTokenStart(parent), parent.range[1]]);
    }

    return null;
}

function fixAssignmentPattern(parent, id, h, fixFunctionParameters, fixNestedArrayVariable, fixVariables) {
    if (parent.parent.type === "ArrayPattern") {
        return fixNestedArrayVariable(parent);
    }

    if (parent.parent.parent.type === "ObjectPattern") {
        if (parent.parent.parent.properties.length === 1) {
            if (parent.parent.parent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(parent.parent.parent);
            }

            return fixVariables(parent.parent.parent);
        }

        if (
            h.getTokenBeforeValue(parent.parent) === "{" &&
            h.getTokenAfterValue(parent.parent) === ","
        ) {
            return h.removeRange([parent.parent.range[0], h.getNextTokenEnd(parent.parent)]);
        }

        return h.removeRange([h.getPreviousTokenStart(parent.parent), parent.parent.range[1]]);
    }

    if (astUtils.isFunction(parent.parent)) {
        return fixFunctionParameters(parent);
    }

    return null;
}

function fixImportDefault(parent, id, tokenAfter, h) {
    if (
        !h.hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
        !h.hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")
    ) {
        return h.removeRange([parent.range[0], parent.parent.source.range[0]]);
    }

    return h.removeRange([id.range[0], tokenAfter.range[1]]);
}

function fixImportSpecifier(parent, id, tokenBefore, tokenAfter, h) {
    const importSpecifiers = parent.parent.specifiers.filter(
        e => e.type === "ImportSpecifier",
    );

    if (importSpecifiers.length === 1) {
        if (!h.hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
            return h.removeRange(parent.parent.range);
        }

        return h.removeRange([h.getPreviousTokenStart(parent, 1), tokenAfter.range[1]]);
    }

    if (h.getTokenBeforeValue(parent) === "{") {
        return h.removeRange([parent.range[0], h.getNextTokenEnd(parent)]);
    }

    return h.removeRange([h.getPreviousTokenStart(parent), parent.range[1]]);
}

function fixImportNamespace(parent, h) {
    if (h.hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
        return h.removeRange([h.getPreviousTokenStart(parent), parent.range[1]]);
    }

    return h.removeRange([parent.range[0], parent.parent.source.range[0]]);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('../types').Rule.RuleModule} */
module.exports = {
    meta: {
        type: "problem",

        docs: {
            description: "Disallow unused variables",
            recommended: true,
            url: "https://eslint.org/docs/latest/rules/no-unused-vars",
        },

        hasSuggestions: true,

        schema: [
            {
                oneOf: [
                    { enum: ["all", "local"] },
                    {
                        type: "object",
                        properties: {
                            vars: { enum: ["all", "local"] },
                            varsIgnorePattern: { type: "string" },
                            args: { enum: ["all", "after-used", "none"] },
                            ignoreRestSiblings: { type: "boolean" },
                            argsIgnorePattern: { type: "string" },
                            caughtErrors: { enum: ["all", "none"] },
                            caughtErrorsIgnorePattern: { type: "string" },
                            destructuredArrayIgnorePattern: { type: "string" },
                            ignoreClassWithStaticInitBlock: { type: "boolean" },
                            ignoreUsingDeclarations: { type: "boolean" },
                            reportUsedIgnorePattern: { type: "boolean" },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        ],

        messages: {
            unusedVar: "'{{varName}}' is {{action}} but never used{{additional}}.",
            usedIgnoredVar: "'{{varName}}' is marked as ignored but is used{{additional}}.",
            removeVar: "Remove unused variable '{{varName}}'.",
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const config = parseConfig(context.options[0]);

        function reportUsedIgnored(nameNode, variable, variableType) {
            context.report({
                node: nameNode,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(variable, variableType, config),
            });
        }

        return {
            "Program:exit"(programNode) {
                const unusedVars = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    [],
                    config,
                    sourceCode,
                    reportUsedIgnored,
                );

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        const writeReferences = unusedVar.references.filter(
                            ref =>
                                ref.isWrite() &&
                                ref.from.variableScope ===
                                    unusedVar.scope.variableScope,
                        );

                        const referenceToReport = writeReferences.at(-1);
                        const hasWriteRef = unusedVar.references.some(ref => ref.isWrite());

                        context.report({
                            node: referenceToReport
                                ? referenceToReport.identifier
                                : unusedVar.identifiers[0],
                            messageId: "unusedVar",
                            data: getUnusedVarMessageData(
                                unusedVar,
                                hasWriteRef ? "assigned a value" : "defined",
                                config,
                            ),
                            suggest: [
                                {
                                    messageId: "removeVar",
                                    data: { varName: unusedVar.name },
                                    fix(fixer) {
                                        return handleFixes(fixer, unusedVar, sourceCode);
                                    },
                                },
                            ],
                        });
                    } else if (unusedVar.eslintExplicitGlobalComments) {
                        const directiveComment =
                            unusedVar.eslintExplicitGlobalComments[0];

                        context.report({
                            node: programNode,
                            loc: astUtils.getNameLocationInGlobalDirectiveComment(
                                sourceCode,
                                directiveComment,
                                unusedVar.name,
                            ),
                            messageId: "unusedVar",
                            data: getUnusedVarMessageData(unusedVar, "defined", config),
                        });
                    }
                }
            },
        };
    },
};
```

## Key Refactoring Changes

| Area | Change |
|------|--------|
| **Config parsing** | Extracted `parseConfig()` — eliminates repeated `firstOption.x \|\| config.x` pattern |
| **Variable type metadata** | `VARIABLE_TYPE_MAP` lookup table replaces `switch` in `getVariableDescription` |
| **Message data** | Merged `getDefinedMessageData` + `getAssignedMessageData` into single `getUnusedVarMessageData(action)` |
| **Skip logic** | Extracted `getSkipDecision()` to isolate the complex per-type skip conditions |
| **Collection loop** | Extracted `shouldSkipScopeVariable`, `isImplicitArguments`, `collectFromChildScopes` helpers |
| **Fix dispatch** | Broke `handleFixes` into focused sub-functions per parent type (`fixVariableDeclarator`, `fixImportDefault`, etc.) |
| **Fix utilities** | `createFixHelper()` groups token-access utilities, reducing parameter passing |
| **Loops** | Replaced `for (i=0; i<l; i++)` with `for...of` throughout |
| **Module-level constants** | `REST_PROPERTY_TYPE`, `STATEMENT_TYPE`, `DEFAULT_CONFIG` moved outside `create()` |
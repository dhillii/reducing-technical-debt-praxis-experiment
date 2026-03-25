# Refactored `no-unused-vars` Rule

## Key Refactoring Strategies Applied

1. **Extract configuration parsing** into a dedicated function
2. **Eliminate duplicate message data logic** (`getDefinedMessageData`/`getAssignedMessageData` shared 90% of code)
3. **Extract variable filtering logic** from `collectUnusedVariables` into focused helpers
4. **Decompose `handleFixes`** into a proper class/module pattern with clear responsibilities
5. **Replace manual loops** with array methods
6. **Extract repeated patterns** (token range helpers, import helpers)

---

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

const VARIABLE_TYPE_CONFIG = {
    "array-destructure": {
        patternKey: "destructuredArrayIgnorePattern",
        description: "elements of array destructuring",
    },
    "catch-clause": {
        patternKey: "caughtErrorsIgnorePattern",
        description: "caught errors",
    },
    parameter: {
        patternKey: "argsIgnorePattern",
        description: "args",
    },
    variable: {
        patternKey: "varsIgnorePattern",
        description: "vars",
    },
};

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

const BOOLEAN_OPTION_KEYS = [
    "ignoreRestSiblings",
    "ignoreClassWithStaticInitBlock",
    "ignoreUsingDeclarations",
    "reportUsedIgnorePattern",
];

//------------------------------------------------------------------------------
// Configuration Parsing
//------------------------------------------------------------------------------

/**
 * Parses the rule options into a normalized config object.
 * @param {*} firstOption The first element of context.options
 * @returns {Object} Normalized config
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

    if (firstOption.vars) config.vars = firstOption.vars;
    if (firstOption.args) config.args = firstOption.args;

    for (const key of BOOLEAN_OPTION_KEYS) {
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

/**
 * Determines the VariableType for a given definition.
 * @param {Object} def
 * @param {Object} config
 * @returns {VariableType}
 */
function defToVariableType(def, config) {
    if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
        return "array-destructure";
    }
    switch (def.type) {
        case "CatchClause": return "catch-clause";
        case "Parameter": return "parameter";
        default: return "variable";
    }
}

/**
 * Gets the description and pattern string for a variable type.
 * @param {VariableType} variableType
 * @param {Object} config
 * @returns {[string|undefined, string|undefined]} [description, patternString]
 */
function getVariableDescription(variableType, config) {
    const entry = VARIABLE_TYPE_CONFIG[variableType];

    if (!entry) {
        throw new Error(`Unexpected variable type: ${variableType}`);
    }

    const pattern = config[entry.patternKey];
    return [entry.description, pattern ? pattern.toString() : undefined];
}

/**
 * Builds the `additional` message fragment for ignore pattern hints.
 * @param {string|undefined} variableDescription
 * @param {string|undefined} pattern
 * @param {'unused'|'used'} mode
 * @returns {string}
 */
function buildAdditionalMessage(variableDescription, pattern, mode) {
    if (!pattern || !variableDescription) return "";
    return mode === "unused"
        ? `. Allowed unused ${variableDescription} must match ${pattern}`
        : `. Used ${variableDescription} must not match ${pattern}`;
}

/**
 * Builds message data for an unused variable.
 * @param {Variable} unusedVar
 * @param {'defined'|'assigned a value'} action
 * @param {Object} config
 * @returns {UnusedVarMessageData}
 */
function getUnusedVarMessageData(unusedVar, action, config) {
    const def = unusedVar.defs?.[0];
    let additional = "";

    if (def) {
        const [desc, pattern] = getVariableDescription(defToVariableType(def, config), config);
        additional = buildAdditionalMessage(desc, pattern, "unused");
    }

    return { varName: unusedVar.name, action, additional };
}

/**
 * Builds message data for a used-but-ignored variable.
 * @param {Variable} variable
 * @param {VariableType} variableType
 * @param {Object} config
 * @returns {UsedIgnoredVarMessageData}
 */
function getUsedIgnoredMessageData(variable, variableType, config) {
    const [desc, pattern] = getVariableDescription(variableType, config);
    return {
        varName: variable.name,
        additional: buildAdditionalMessage(desc, pattern, "used"),
    };
}

//------------------------------------------------------------------------------
// Variable Usage Analysis
//------------------------------------------------------------------------------

/**
 * Checks whether a node is a sibling of a rest property.
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
 * Determines if a variable is exported from a module.
 * @param {Variable} variable
 * @returns {boolean}
 */
function isExported(variable) {
    const definition = variable.defs[0];
    if (!definition) return false;

    let node = definition.node;
    if (node.type === "VariableDeclarator") {
        node = node.parent;
    } else if (definition.type === "Parameter") {
        return false;
    }

    return node.parent.type.startsWith("Export");
}

/**
 * Determines if a variable uses explicit resource management (using/await using).
 * @param {Variable} variable
 * @returns {boolean}
 */
function usesExplicitResourceManagement(variable) {
    const [definition] = variable.defs;
    return (
        definition?.type === "Variable" &&
        (definition.parent.kind === "using" || definition.parent.kind === "await using")
    );
}

/**
 * Determines if a variable has a sibling rest property.
 * @param {Variable} variable
 * @param {Object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
    if (!config.ignoreRestSiblings) return false;

    return (
        variable.defs.some(def => hasRestSibling(def.name.parent)) ||
        variable.references.some(ref => hasRestSibling(ref.identifier.parent))
    );
}

/**
 * Gets function definition nodes for a variable.
 * @param {Variable} variable
 * @returns {ASTNode[]}
 */
function getFunctionDefinitions(variable) {
    return variable.defs.flatMap(({ type, node }) => {
        if (type === "FunctionName") return [node];
        if (
            type === "Variable" &&
            node.init &&
            (node.init.type === "FunctionExpression" || node.init.type === "ArrowFunctionExpression")
        ) {
            return [node.init];
        }
        return [];
    });
}

/**
 * Checks if inner node is inside outer node by range.
 * @param {ASTNode} inner
 * @param {ASTNode} outer
 * @returns {boolean}
 */
function isInside(inner, outer) {
    return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * Checks whether a node is an unused expression.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isUnusedExpression(node) {
    const { parent } = node;
    if (parent.type === "ExpressionStatement") return true;
    if (parent.type === "SequenceExpression") {
        return parent.expressions.at(-1) !== node || isUnusedExpression(parent);
    }
    return false;
}

/**
 * Gets the RHS node if the reference is a standalone assignment.
 * @param {Reference} ref
 * @param {ASTNode|null} prevRhsNode
 * @returns {ASTNode|null}
 */
function getRhsNode(ref, prevRhsNode) {
    const id = ref.identifier;
    const parent = id.parent;
    const canBeUsedLater =
        ref.from.variableScope !== ref.resolved.scope.variableScope ||
        astUtils.isInLoop(id);

    if (prevRhsNode && isInside(id, prevRhsNode)) return prevRhsNode;

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
                if (parent.expressions.at(-1) !== node) return false;
                break;
            case "CallExpression":
            case "NewExpression":
                return parent.callee !== node;
            case "AssignmentExpression":
            case "TaggedTemplateExpression":
            case "YieldExpression":
                return true;
            default:
                if (STATEMENT_TYPE.test(parent.type)) return true;
        }
        node = parent;
        parent = parent.parent;
    }
    return false;
}

/**
 * Checks if an identifier is inside a storable function.
 * @param {ASTNode} id
 * @param {ASTNode} rhsNode
 * @returns {boolean}
 */
function isInsideOfStorableFunction(id, rhsNode) {
    const funcNode = astUtils.getUpperFunction(id);
    return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
}

/**
 * Checks whether a reference is a read that only updates itself.
 * @param {Reference} ref
 * @param {ASTNode|null} rhsNode
 * @returns {boolean}
 */
function isReadForItself(ref, rhsNode) {
    const id = ref.identifier;
    const parent = id.parent;

    return (
        ref.isRead() &&
        (
            (parent.type === "AssignmentExpression" &&
                parent.left === id &&
                isUnusedExpression(parent) &&
                !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
            (parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
            (rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode))
        )
    );
}

/**
 * Checks if a reference is in a for-in/for-of loop that immediately returns.
 * @param {Reference} ref
 * @returns {boolean}
 */
function isForInOfRef(ref) {
    let target = ref.identifier.parent;

    if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
    }

    if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") {
        return false;
    }

    target = target.body.type === "BlockStatement"
        ? target.body.body[0]
        : target.body;

    return Boolean(target?.type === "ReturnStatement");
}

/**
 * Determines if a variable is actually used.
 * @param {Variable} variable
 * @returns {boolean}
 */
function isUsedVariable(variable) {
    if (variable.eslintUsed) return true;

    const functionNodes = getFunctionDefinitions(variable);
    const isFunctionDefinition = functionNodes.length > 0;
    let rhsNode = null;

    return variable.references.some(ref => {
        if (isForInOfRef(ref)) return true;

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
 * Checks if a reference refers to an enclosing function name (self-reference).
 * @param {Reference} ref
 * @param {ASTNode[]} nodes
 * @returns {boolean}
 */
function isSelfReference(ref, nodes) {
    let scope = ref.from;
    while (scope) {
        if (nodes.includes(scope.block)) return true;
        scope = scope.upper;
    }
    return false;
}

//------------------------------------------------------------------------------
// Scope Collection
//------------------------------------------------------------------------------

/**
 * Checks whether a variable should be skipped due to an ignore pattern,
 * and optionally reports it if it's used despite being ignored.
 * @param {Variable} variable
 * @param {VariableType} variableType
 * @param {RegExp} pattern
 * @param {Object} config
 * @param {Function} report
 * @returns {boolean} true if the variable should be skipped
 */
function shouldSkipIgnoredVariable(variable, variableType, pattern, config, report) {
    if (!pattern || !pattern.test(variable.defs[0].name.name)) return false;

    if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
        report(variable, variableType);
    }
    return true;
}

/**
 * Determines if a variable in a given scope should be excluded from unused reporting.
 * @param {Variable} variable
 * @param {Scope} scope
 * @param {Object} config
 * @param {Function} reportUsedIgnored - callback(variable, variableType)
 * @returns {boolean} true if the variable should be skipped
 */
function shouldSkipVariable(variable, scope, config, reportUsedIgnored) {
    // Skip class self-reference in class scope
    if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
        return true;
    }

    // Skip function expression names
    if (scope.functionExpressionScope) return true;

    // Skip variables marked as used (unless reportUsedIgnorePattern is on)
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;

    // Skip implicit "arguments"
    if (
        scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
    ) {
        return true;
    }

    const def = variable.defs[0];
    if (!def) return false;

    const { type } = def;

    // Array destructuring ignore pattern
    const refUsedInArrayPatterns = variable.references.some(
        ref => ref.identifier.parent.type === "ArrayPattern"
    );
    if (
        (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
        config.destructuredArrayIgnorePattern
    ) {
        return shouldSkipIgnoredVariable(
            variable, "array-destructure",
            config.destructuredArrayIgnorePattern, config, reportUsedIgnored
        );
    }

    // Class with static init block
    if (type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
        if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
    }

    // Catch clause
    if (type === "CatchClause") {
        if (config.caughtErrors === "none") return true;
        return shouldSkipIgnoredVariable(
            variable, "catch-clause",
            config.caughtErrorsIgnorePattern, config, reportUsedIgnored
        );
    }

    // Parameter
    if (type === "Parameter") {
        if (isSetterParameter(def)) return true;
        if (config.args === "none") return true;
        if (shouldSkipIgnoredVariable(
            variable, "parameter",
            config.argsIgnorePattern, config, reportUsedIgnored
        )) return true;
        if (
            config.args === "after-used" &&
            astUtils.isFunction(def.name.parent) &&
            !isAfterLastUsedArg(variable)
        ) return true;
        return false;
    }

    // Regular variable
    return shouldSkipIgnoredVariable(
        variable, "variable",
        config.varsIgnorePattern, config, reportUsedIgnored
    );
}

/**
 * Checks if a parameter definition belongs to a setter.
 * @param {Object} def
 * @returns {boolean}
 */
function isSetterParameter(def) {
    return (
        (def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") &&
        def.node.parent.kind === "set"
    );
}

/**
 * Checks whether the variable is defined after the last used parameter.
 * @param {Variable} variable
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isAfterLastUsedArg(variable, sourceCode) {
    const def = variable.defs[0];
    const params = sourceCode.getDeclaredVariables(def.node);
    const posteriorParams = params.slice(params.indexOf(variable) + 1);
    return !posteriorParams.some(v => v.references.length > 0 || v.eslintUsed);
}

/**
 * Recursively collects unused variables from a scope and its children.
 * @param {Scope} scope
 * @param {Variable[]} unusedVars
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @param {Function} reportUsedIgnored
 * @returns {Variable[]}
 */
function collectUnusedVariables(scope, unusedVars, config, sourceCode, reportUsedIgnored) {
    if (scope.type !== "global" || config.vars === "all") {
        for (const variable of scope.variables) {
            if (shouldSkipVariable(variable, scope, config, reportUsedIgnored)) continue;

            if (
                !isUsedVariable(variable) &&
                !isExported(variable) &&
                !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
                !hasRestSpreadSibling(variable, config)
            ) {
                unusedVars.push(variable);
            }
        }
    }

    for (const childScope of scope.childScopes) {
        collectUnusedVariables(childScope, unusedVars, config, sourceCode, reportUsedIgnored);
    }

    return unusedVars;
}

//------------------------------------------------------------------------------
// Fix Helpers
//------------------------------------------------------------------------------

/**
 * Creates a set of token/range utility functions bound to a sourceCode instance.
 * @param {SourceCode} sourceCode
 * @returns {Object}
 */
function createTokenUtils(sourceCode) {
    return {
        getPreviousTokenStart: (node, skips) =>
            sourceCode.getTokenBefore(node, skips).range[0],
        getNextTokenEnd: (node, skips) =>
            sourceCode.getTokenAfter(node, skips).range[1],
        getTokenBeforeValue: node =>
            sourceCode.getTokenBefore(node).value,
        getTokenAfterValue: node =>
            sourceCode.getTokenAfter(node).value,
    };
}

/**
 * Checks if an ArrayPattern has only a single non-null element.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function hasSingleElement(node) {
    return node.elements.filter(e => e !== null).length === 1;
}

/**
 * Checks if an ImportDeclaration has a specifier of a given type.
 * @param {ASTNode} node
 * @param {string} type
 * @returns {boolean}
 */
function hasImportOfCertainType(node, type) {
    return node.specifiers.some(e => e.type === type);
}

/**
 * Checks if removing a declaration is safe (won't create a directive or break ASI).
 * @param {ASTNode} nextToken
 * @param {ASTNode|null} prevToken
 * @returns {boolean} true if NOT safe to remove
 */
function isDeclarationNotSafeToRemove(nextToken, prevToken) {
    return (
        nextToken.type === "String" ||
        (prevToken &&
            !astUtils.isSemicolonToken(prevToken) &&
            !astUtils.isOpeningBraceToken(prevToken))
    );
}

//------------------------------------------------------------------------------
// Fix Logic
//------------------------------------------------------------------------------

/**
 * Produces a fixer suggestion for an unused variable.
 * @param {Object} fixer
 * @param {Variable} unusedVar
 * @param {SourceCode} sourceCode
 * @returns {Object|null}
 */
function handleFixes(fixer, unusedVar, sourceCode) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const parentType = parent.type;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);
    const allWriteReferences = unusedVar.references.filter(ref => ref.isWrite());

    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue } =
        createTokenUtils(sourceCode);

    // Skip fix when variable has references that would be left behind
    if (allWriteReferences.some(ref => ref.identifier.range[0] !== id.range[0])) {
        return null;
    }

    // --- Forward declarations for mutually recursive fix functions ---
    function fixFunctionParameters(node) {
        const parentNode = node.parent;
        if (!astUtils.isFunction(parentNode)) return null;

        if (parentNode.params.length === 1) {
            return fixer.removeRange(node.range);
        }
        if (getTokenBeforeValue(node) === "(" && getTokenAfterValue(node) === ",") {
            return fixer.removeRange([node.range[0], getNextTokenEnd(node)]);
        }
        return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
    }

    function fixVariables(node) {
        const parentNode = node.parent;

        if (parentNode.type === "VariableDeclarator") {
            if (astUtils.isLoop(parentNode.parent.parent)) return null;

            if (parentNode.parent.declarations.length === 1) {
                const nextToken = sourceCode.getTokenAfter(parentNode.parent);
                const prevToken = sourceCode.getTokenBefore(parentNode.parent);
                if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) return null;
                return fixer.removeRange(parentNode.parent.range);
            }

            if (getTokenBeforeValue(parentNode) === ",") {
                return fixer.removeRange([getPreviousTokenStart(parentNode), parentNode.range[1]]);
            }
            return fixer.removeRange([parentNode.range[0], getNextTokenEnd(parentNode)]);
        }

        if (getTokenBeforeValue(node) === ":") {
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
            if (getTokenBeforeValue(parentNode) === "{") {
                return fixer.removeRange([parentNode.range[0], getNextTokenEnd(parentNode)]);
            }
            return fixer.removeRange([getPreviousTokenStart(parentNode), parentNode.range[1]]);
        }

        return null;
    }

    function fixNestedArrayVariable(node) {
        const parentNode = node.parent;

        if (parentNode.parent.type === "ArrayPattern" && hasSingleElement(parentNode)) {
            return fixNestedArrayVariable(parentNode);
        }

        if (hasSingleElement(parentNode)) {
            if (getTokenBeforeValue(parentNode) === ":") return fixVariables(parentNode);
            if (parentNode.parent.type === "RestElement") return fixRestInPattern(parentNode.parent);
            return fixVariables(parentNode);
        }

        if (getTokenBeforeValue(node) === "," && getTokenAfterValue(node) === "]") {
            return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
        }
        return fixer.removeRange(node.range);
    }

    function fixObjectWithValueSeparator(node) {
        const parentNode = node.parent.parent;

        if (parentNode.parent.type === "ArrayPattern" && parentNode.properties.length === 1) {
            return fixNestedArrayVariable(parentNode);
        }
        return fixNestedObjectVariable(node);
    }

    function fixRestInPattern(node) {
        const parentNode = node.parent;

        if (astUtils.isFunction(parentNode)) {
            if (parentNode.params.length === 1) return fixer.removeRange(node.range);
            return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
        }

        if (parentNode.type === "ArrayPattern") {
            if (hasSingleElement(parentNode)) {
                if (parentNode.parent.type === "ArrayPattern") return fixNestedArrayVariable(parentNode);
                return fixVariables(parentNode);
            }
            return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
        }

        return null;
    }

    // --- Main dispatch ---

    if (parentType === "VariableDeclarator") {
        return fixVariableDeclarator(
            parent, id, tokenBefore, fixer,
            { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue },
            sourceCode
        );
    }

    if (parent.parent.type === "ObjectPattern") {
        return fixObjectPatternVariable(
            parent, id, tokenBefore, fixer,
            { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue },
            { fixVariables, fixRestInPattern, fixNestedArrayVariable }
        );
    }

    if (parentType === "ArrayPattern") {
        return fixArrayPatternVariable(
            parent, id, tokenBefore, tokenAfter, fixer,
            { fixVariables, fixRestInPattern, fixNestedArrayVariable }
        );
    }

    if (parentType === "RestElement") {
        return fixRestElement(
            parent, id, fixer,
            { getPreviousTokenStart, getNextTokenEnd },
            { fixVariables, fixRestInPattern, fixNestedArrayVariable }
        );
    }

    if (parentType === "AssignmentPattern") {
        return fixAssignmentPattern(
            parent, id, fixer,
            { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue },
            { fixVariables, fixFunctionParameters, fixNestedArrayVariable }
        );
    }

    if (parentType === "FunctionDeclaration" && parent.id === id) {
        return fixer.removeRange(parent.range);
    }

    if (parentType === "ImportDefaultSpecifier") {
        return fixImportDefault(parent, id, tokenAfter, fixer);
    }

    if (parentType === "ImportSpecifier") {
        return fixImportSpecifier(parent, id, tokenBefore, tokenAfter, fixer,
            { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue });
    }

    if (parentType === "ImportNamespaceSpecifier") {
        return fixImportNamespace(parent, fixer, { getPreviousTokenStart });
    }

    if (parentType === "CatchClause") return null;

    if (parentType === "ClassDeclaration") {
        return fixer.removeRange(parent.range);
    }

    if (tokenBefore?.value === ",") {
        return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
    }

    if (tokenAfter.value === ",") {
        if (tokenBefore.value === "(" || tokenBefore.value === "{") {
            return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        }
    }

    if (
        parentType === "ArrowFunctionExpression" &&
        parent.params.length === 1 &&
        tokenAfter?.value !== ")"
    ) {
        return fixer.replaceText(id, "()");
    }

    return fixer.removeRange(id.range);
}

/**
 * Fixes a VariableDeclarator unused variable.
 */
function fixVariableDeclarator(parent, id, tokenBefore, fixer, tokenUtils, sourceCode) {
    const { getPreviousTokenStart, getNextTokenEnd } = tokenUtils;
    const declaration = parent.parent;

    if (declaration.declarations.length === 1) {
        if (
            astUtils.isLoop(declaration.parent) &&
            declaration.parent.body !== declaration
        ) return null;

        if (
            declaration.parent.type === "IfStatement" ||
            astUtils.isLoop(declaration.parent) ||
            (declaration.parent.type === "WithStatement" &&
                declaration.parent.body === declaration)
        ) {
            return fixer.replaceText(declaration, ";");
        }

        const nextToken = sourceCode.getTokenAfter(declaration);
        const prevToken = sourceCode.getTokenBefore(declaration);
        if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) return null;

        return fixer.removeRange(declaration.range);
    }

    if (tokenBefore.value === ",") {
        return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
    }
    return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
}

/**
 * Fixes an ObjectPattern unused variable.
 */
function fixObjectPatternVariable(parent, id, tokenBefore, fixer, tokenUtils, fixers) {
    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue } = tokenUtils;
    const { fixVariables, fixRestInPattern, fixNestedArrayVariable } = fixers;
    const objectPattern = parent.parent;

    if (objectPattern.properties.length === 1) {
        if (objectPattern.parent.type === "RestElement") return fixRestInPattern(objectPattern.parent);
        if (objectPattern.parent.type === "ArrayPattern") return fixNestedArrayVariable(objectPattern);
        return fixVariables(objectPattern);
    }

    if (tokenBefore.value === ":") {
        if (getTokenBeforeValue(parent) === "{" && getTokenAfterValue(parent) === ",") {
            return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
        }
        return fixer.removeRange([getPreviousTokenStart(parent), id.range[1]]);
    }

    return null;
}

/**
 * Fixes an ArrayPattern unused variable.
 */
function fixArrayPatternVariable(parent, id, tokenBefore, tokenAfter, fixer, fixers) {
    const { fixVariables, fixRestInPattern, fixNestedArrayVariable } = fixers;

    if (hasSingleElement(parent)) {
        if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent);
        if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
        return fixVariables(parent);
    }

    if (tokenBefore.value === "," && tokenAfter.value === ",") {
        return fixer.removeRange(id.range);
    }
    return null;
}

/**
 * Fixes a RestElement unused variable.
 */
function fixRestElement(parent, id, fixer, tokenUtils, fixers) {
    const { getPreviousTokenStart } = tokenUtils;
    const { fixVariables, fixNestedArrayVariable } = fixers;
    const grandParent = parent.parent;

    if (grandParent.type === "ArrayPattern") {
        if (hasSingleElement(grandParent)) {
            if (grandParent.parent.type === "ArrayPattern") return fixNestedArrayVariable(grandParent);
            return fixVariables(grandParent);
        }
        return fixer.removeRange([getPreviousTokenStart(id, 1), id.range[1]]);
    }

    if (grandParent.type === "ObjectPattern") {
        if (grandParent.properties.length === 1) return fixVariables(grandParent);
        return fixer.removeRange([getPreviousTokenStart(id, 1), id.range[1]]);
    }

    if (astUtils.isFunction(grandParent)) {
        if (grandParent.params.length === 1) return fixer.removeRange(parent.range);
        return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
    }

    return null;
}

/**
 * Fixes an AssignmentPattern unused variable.
 */
function fixAssignmentPattern(parent, id, fixer, tokenUtils, fixers) {
    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue } = tokenUtils;
    const { fixVariables, fixFunctionParameters, fixNestedArrayVariable } = fixers;
    const grandParent = parent.parent;

    if (grandParent.type === "ArrayPattern") return fixNestedArrayVariable(parent);

    if (grandParent.parent?.type === "ObjectPattern") {
        const objectPattern = grandParent.parent;
        if (objectPattern.properties.length === 1) {
            if (objectPattern.parent.type === "ArrayPattern") return fixNestedArrayVariable(objectPattern);
            return fixVariables(objectPattern);
        }
        if (getTokenBeforeValue(grandParent) === "{" && getTokenAfterValue(grandParent) === ",") {
            return fixer.removeRange([grandParent.range[0], getNextTokenEnd(grandParent)]);
        }
        return fixer.removeRange([getPreviousTokenStart(grandParent), grandParent.range[1]]);
    }

    if (astUtils.isFunction(grandParent)) return fixFunctionParameters(parent);

    return null;
}

/**
 * Fixes an ImportDefaultSpecifier unused variable.
 */
function fixImportDefault(parent, id, tokenAfter, fixer) {
    if (
        !hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
        !hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")
    ) {
        return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
    }
    return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
}

/**
 * Fixes an ImportSpecifier unused variable.
 */
function fixImportSpecifier(parent, id, tokenBefore, tokenAfter, fixer, tokenUtils) {
    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue } = tokenUtils;
    const importSpecifiers = parent.parent.specifiers.filter(e => e.type === "ImportSpecifier");

    if (importSpecifiers.length === 1) {
        if (!hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
            return fixer.removeRange(parent.parent.range);
        }
        return fixer.removeRange([getPreviousTokenStart(parent, 1), tokenAfter.range[1]]);
    }

    if (getTokenBeforeValue(parent) === "{") {
        return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
    }
    return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
}

/**
 * Fixes an ImportNamespaceSpecifier unused variable.
 */
function fixImportNamespace(parent, fixer, tokenUtils) {
    const { getPreviousTokenStart } = tokenUtils;
    if (hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
        return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
    }
    return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
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

        // Bind isAfterLastUsedArg to sourceCode
        const isAfterLastUsedArgBound = variable => isAfterLastUsedArg(variable, sourceCode);

        // Patch shouldSkipVariable to use bound version
        const shouldSkipVariableBound = (variable, scope, reportUsedIgnored) =>
            shouldSkipVariableWithSourceCode(variable, scope, config, reportUsedIgnored, isAfterLastUsedArgBound);

        function reportUsedIgnored(variable, variableType) {
            const def = variable.defs[0];
            context.report({
                node: def.name,
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
                    reportUsedIgnored
                );

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        const writeReferences = unusedVar.references.filter(
                            ref =>
                                ref.isWrite() &&
                                ref.from.variableScope === unusedVar.scope.variableScope
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
                                config
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
                        const directiveComment = unusedVar.eslintExplicitGlobalComments[0];
                        context.report({
                            node: programNode,
                            loc: astUtils.getNameLocationInGlobalDirectiveComment(
                                sourceCode,
                                directiveComment,
                                unusedVar.name
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

//------------------------------------------------------------------------------
// Patched shouldSkipVariable with injected isAfterLastUsedArg
//------------------------------------------------------------------------------

/**
 * Version of shouldSkipVariable that accepts an injected isAfterLastUsedArg.
 */
function shouldSkipVariableWithSourceCode(variable, scope, config, reportUsedIgnored, isAfterLastUsedArgFn) {
    if (scope.type === "class" && scope.block.id === variable.identifiers[0]) return true;
    if (scope.functionExpressionScope) return true;
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;
    if (
        scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
    ) return true;

    const def = variable.defs[0];
    if (!def) return false;

    const { type } = def;

    const refUsedInArrayPatterns = variable.references.some(
        ref => ref.identifier.parent.type === "ArrayPattern"
    );
    if (
        (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
        config.destructuredArrayIgnorePattern
    ) {
        return shouldSkipIgnoredVariable(
            variable, "array-destructure",
            config.destructuredArrayIgnorePattern, config, reportUsedIgnored
        );
    }

    if (type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
        if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
    }

    if (type === "CatchClause") {
        if (config.caughtErrors === "none") return true;
        return shouldSkipIgnoredVariable(
            variable, "catch-clause",
            config.caughtErrorsIgnorePattern, config, reportUsedIgnored
        );
    }

    if (type === "Parameter") {
        if (isSetterParameter(def)) return true;
        if (config.args === "none") return true;
        if (shouldSkipIgnoredVariable(
            variable, "parameter",
            config.argsIgnorePattern, config, reportUsedIgnored
        )) return true;
        if (
            config.args === "after-used" &&
            astUtils.isFunction(def.name.parent) &&
            !isAfterLastUsedArgFn(variable)
        ) return true;
        return false;
    }

    return shouldSkipIgnoredVariable(
        variable, "variable",
        config.varsIgnorePattern, config, reportUsedIgnored
    );
}
```

---

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Config parsing** | Inline imperative block in `create()` | `parseConfig()` pure function with data-driven loops |
| **Message data** | `getDefinedMessageData` + `getAssignedMessageData` (90% duplicate) | Single `getUnusedVarMessageData(var, action, config)` |
| **Variable type metadata** | Scattered switch/case | `VARIABLE_TYPE_CONFIG` lookup table |
| **`collectUnusedVariables`** | 100+ line function with deeply nested ifs | Delegated to `shouldSkipVariable()` + `shouldSkipIgnoredVariable()` |
| **`handleFixes`** | 300+ line monolith with nested closures | Decomposed into 10 focused `fix*` functions |
| **Token utilities** | Repeated inline calls | `createTokenUtils()` factory |
| **Loops** | Manual `for (i=0; i<l; i++)` | `for...of` and `.flatMap()` |
| **`isExported`** | `indexOf("Export") === 0` | `.startsWith("Export")` |
| **Pure functions** | Mixed with context | Extracted to module scope (testable) |
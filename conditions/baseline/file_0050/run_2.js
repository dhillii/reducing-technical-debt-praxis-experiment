# Refactored `no-unused-vars` Rule

Here's the refactored code with reduced complexity through better separation of concerns, extracted helper modules, and simplified logic:

```javascript
/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

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

const PATTERN_OPTIONS = [
    "varsIgnorePattern",
    "argsIgnorePattern",
    "caughtErrorsIgnorePattern",
    "destructuredArrayIgnorePattern",
];

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

//------------------------------------------------------------------------------
// Schema
//------------------------------------------------------------------------------

const schema = [
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
];

//------------------------------------------------------------------------------
// Config Helpers
//------------------------------------------------------------------------------

/**
 * Parses the rule options into a config object.
 * @param {*} firstOption The first option passed to the rule.
 * @returns {Object} The resolved config.
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

    for (const key of ["vars", "args", "caughtErrors"]) {
        if (firstOption[key]) {
            config[key] = firstOption[key];
        }
    }

    for (const key of booleanKeys) {
        if (firstOption[key]) {
            config[key] = firstOption[key];
        }
    }

    for (const key of PATTERN_OPTIONS) {
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
 * Determines what variable type a def is.
 * @param {Object} def The declaration to check.
 * @param {Object} config The rule config.
 * @returns {string} The variable type.
 */
function defToVariableType(def, config) {
    if (
        config.destructuredArrayIgnorePattern &&
        def.name.parent.type === "ArrayPattern"
    ) {
        return "array-destructure";
    }

    const typeMap = {
        CatchClause: "catch-clause",
        Parameter: "parameter",
    };

    return typeMap[def.type] ?? "variable";
}

/**
 * Gets a variable's description and configured ignore pattern.
 * @param {string} variableType The variable type.
 * @param {Object} config The rule config.
 * @returns {[string, string|undefined]} The description and pattern string.
 */
function getVariableDescription(variableType, config) {
    const typeConfig = VARIABLE_TYPE_CONFIG[variableType];

    if (!typeConfig) {
        throw new Error(`Unexpected variable type: ${variableType}`);
    }

    const pattern = config[typeConfig.patternKey];

    return [typeConfig.description, pattern ? pattern.toString() : undefined];
}

/**
 * Builds the additional message suffix for ignore patterns.
 * @param {string} variableDescription The variable description.
 * @param {string|undefined} pattern The pattern string.
 * @param {string} verb "Allowed unused" or "Used".
 * @param {string} mustOrMustNot "must match" or "must not match".
 * @returns {string} The additional message.
 */
function buildAdditionalMessage(variableDescription, pattern, verb, mustOrMustNot) {
    if (pattern && variableDescription) {
        return `. ${verb} ${variableDescription} ${mustOrMustNot} ${pattern}`;
    }
    return "";
}

/**
 * Generates message data for an unused variable.
 * @param {Variable} unusedVar The unused variable.
 * @param {string} action "defined" or "assigned a value".
 * @param {Object} config The rule config.
 * @returns {Object} The message data.
 */
function getUnusedVarMessageData(unusedVar, action, config) {
    const def = unusedVar.defs?.[0];
    let additional = "";

    if (def) {
        const [variableDescription, pattern] = getVariableDescription(
            defToVariableType(def, config),
            config,
        );
        additional = buildAdditionalMessage(
            variableDescription,
            pattern,
            "Allowed unused",
            "must match",
        );
    }

    return { varName: unusedVar.name, action, additional };
}

/**
 * Generates message data for a used-but-ignored variable.
 * @param {Variable} variable The variable.
 * @param {string} variableType The variable type.
 * @param {Object} config The rule config.
 * @returns {Object} The message data.
 */
function getUsedIgnoredMessageData(variable, variableType, config) {
    const [variableDescription, pattern] = getVariableDescription(variableType, config);
    const additional = buildAdditionalMessage(
        variableDescription,
        pattern,
        "Used",
        "must not match",
    );

    return { varName: variable.name, additional };
}

//------------------------------------------------------------------------------
// Variable Usage Helpers
//------------------------------------------------------------------------------

/**
 * Determines if a given variable is being exported from a module.
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if the variable is exported.
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
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if declared with "using" or "await using".
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
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is a sibling of the rest property.
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
 * @param {Variable} variable The variable to check.
 * @param {Object} config The rule config.
 * @returns {boolean} True if the variable has a sibling rest property.
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
 * @param {ASTNode} inner The inner node.
 * @param {ASTNode} outer The outer node.
 * @returns {boolean} True if inner exists within outer.
 */
function isInside(inner, outer) {
    return (
        inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1]
    );
}

/**
 * Checks whether a given node is an unused expression.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is an unused expression.
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
 * @param {Variable} variable The variable.
 * @returns {ASTNode[]} Function nodes.
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
 * @param {Reference} ref The reference to check.
 * @param {ASTNode[]} nodes The candidate function nodes.
 * @returns {boolean} True if it's a self-reference.
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
 * If a reference is the LHS of an assignment, gets the RHS node.
 * @param {Reference} ref The reference to check.
 * @param {ASTNode|null} prevRhsNode The previous RHS node.
 * @returns {ASTNode|null} The RHS node or null.
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
 * @param {ASTNode} funcNode The function node.
 * @param {ASTNode} rhsNode The RHS node of the previous assignment.
 * @returns {boolean} True if the function can be used later.
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
 * @param {ASTNode} id The Identifier node.
 * @param {ASTNode} rhsNode The RHS node.
 * @returns {boolean} True if inside a storable function.
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
 * @param {Reference} ref The reference to check.
 * @param {ASTNode|null} rhsNode The RHS node.
 * @returns {boolean} True if the reference is a read-for-itself.
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
 * Determines if a reference is used in a for-in/of loop with an immediate return.
 * @param {Reference} ref The reference to check.
 * @returns {boolean} True if used in such a loop.
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

    target = target.body.type === "BlockStatement"
        ? target.body.body[0]
        : target.body;

    return Boolean(target?.type === "ReturnStatement");
}

/**
 * Determines if the variable is used.
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if the variable is used.
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
 * Checks whether the given variable is after the last used parameter.
 * @param {Variable} variable The variable to check.
 * @param {Object} sourceCode The source code object.
 * @returns {boolean} True if after the last used parameter.
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
 * Checks if a variable matches an ignore pattern and optionally reports it if used.
 * @param {Variable} variable The variable.
 * @param {RegExp|undefined} pattern The ignore pattern.
 * @param {string} defName The variable name from the def.
 * @param {string} variableType The variable type.
 * @param {Object} config The rule config.
 * @param {Object} context The rule context.
 * @param {ASTNode} defNameNode The def.name node.
 * @returns {boolean} True if the variable should be skipped.
 */
function checkIgnorePattern(
    variable,
    pattern,
    defName,
    variableType,
    config,
    context,
    defNameNode,
) {
    if (!pattern || !pattern.test(defName)) {
        return false;
    }

    if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
        context.report({
            node: defNameNode,
            messageId: "usedIgnoredVar",
            data: getUsedIgnoredMessageData(variable, variableType, config),
        });
    }

    return true;
}

/**
 * Determines whether a variable should be skipped during collection.
 * Returns true if the variable should be skipped (not reported as unused).
 * @param {Variable} variable The variable.
 * @param {Object} scope The current scope.
 * @param {Object} config The rule config.
 * @param {Object} context The rule context.
 * @param {Object} sourceCode The source code object.
 * @returns {boolean} True if the variable should be skipped.
 */
function shouldSkipVariable(variable, scope, config, context, sourceCode) {
    // Skip class self-reference in class scope
    if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
        return true;
    }

    // Skip function expression names
    if (scope.functionExpressionScope) {
        return true;
    }

    // Skip variables marked with markVariableAsUsed()
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
        return true;
    }

    // Skip implicit "arguments" variable
    if (
        scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
    ) {
        return true;
    }

    const def = variable.defs[0];

    if (!def) {
        return false;
    }

    return shouldSkipDef(variable, def, scope, config, context, sourceCode);
}

/**
 * Determines whether a variable with a definition should be skipped.
 * @param {Variable} variable The variable.
 * @param {Object} def The variable definition.
 * @param {Object} scope The current scope.
 * @param {Object} config The rule config.
 * @param {Object} context The rule context.
 * @param {Object} sourceCode The source code object.
 * @returns {boolean} True if the variable should be skipped.
 */
function shouldSkipDef(variable, def, scope, config, context, sourceCode) {
    const { type } = def;

    // Skip array destructuring elements matching the ignore pattern
    const refUsedInArrayPatterns = variable.references.some(
        ref => ref.identifier.parent.type === "ArrayPattern",
    );

    if (
        (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
        checkIgnorePattern(
            variable,
            config.destructuredArrayIgnorePattern,
            def.name.name,
            "array-destructure",
            config,
            context,
            def.name,
        )
    ) {
        return true;
    }

    if (type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(
            node => node.type === "StaticBlock",
        );

        if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
            return true;
        }
    }

    if (type === "CatchClause") {
        return shouldSkipCatchClause(variable, def, config, context);
    }

    if (type === "Parameter") {
        return shouldSkipParameter(variable, def, config, context, sourceCode);
    }

    // Regular variable
    return checkIgnorePattern(
        variable,
        config.varsIgnorePattern,
        def.name.name,
        "variable",
        config,
        context,
        def.name,
    );
}

/**
 * Determines whether a catch clause variable should be skipped.
 * @param {Variable} variable The variable.
 * @param {Object} def The variable definition.
 * @param {Object} config The rule config.
 * @param {Object} context The rule context.
 * @returns {boolean} True if the variable should be skipped.
 */
function shouldSkipCatchClause(variable, def, config, context) {
    if (config.caughtErrors === "none") {
        return true;
    }

    return checkIgnorePattern(
        variable,
        config.caughtErrorsIgnorePattern,
        def.name.name,
        "catch-clause",
        config,
        context,
        def.name,
    );
}

/**
 * Determines whether a parameter variable should be skipped.
 * @param {Variable} variable The variable.
 * @param {Object} def The variable definition.
 * @param {Object} config The rule config.
 * @param {Object} context The rule context.
 * @param {Object} sourceCode The source code object.
 * @returns {boolean} True if the variable should be skipped.
 */
function shouldSkipParameter(variable, def, config, context, sourceCode) {
    // Skip setter arguments
    const parentKind = def.node.parent?.kind;
    const parentType = def.node.parent?.type;

    if (
        (parentType === "Property" || parentType === "MethodDefinition") &&
        parentKind === "set"
    ) {
        return true;
    }

    if (config.args === "none") {
        return true;
    }

    if (
        checkIgnorePattern(
            variable,
            config.argsIgnorePattern,
            def.name.name,
            "parameter",
            config,
            context,
            def.name,
        )
    ) {
        return true;
    }

    if (
        config.args === "after-used" &&
        astUtils.isFunction(def.name.parent) &&
        !isAfterLastUsedArg(variable, sourceCode)
    ) {
        return true;
    }

    return false;
}

/**
 * Gets an array of variables without read references.
 * @param {Scope} scope The eslint-scope Scope object.
 * @param {Variable[]} unusedVars Accumulator array.
 * @param {Object} config The rule config.
 * @param {Object} context The rule context.
 * @param {Object} sourceCode The source code object.
 * @returns {Variable[]} Unused variables of the scope and descendant scopes.
 */
function collectUnusedVariables(scope, unusedVars, config, context, sourceCode) {
    if (scope.type === "global" && config.vars !== "all") {
        // Only recurse into child scopes for global scope when vars !== "all"
        for (const childScope of scope.childScopes) {
            collectUnusedVariables(childScope, unusedVars, config, context, sourceCode);
        }
        return unusedVars;
    }

    for (const variable of scope.variables) {
        if (shouldSkipVariable(variable, scope, config, context, sourceCode)) {
            continue;
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

    for (const childScope of scope.childScopes) {
        collectUnusedVariables(childScope, unusedVars, config, context, sourceCode);
    }

    return unusedVars;
}

//------------------------------------------------------------------------------
// Fix Helpers
//------------------------------------------------------------------------------

/**
 * Creates a set of token utility functions bound to a source code object.
 * @param {Object} sourceCode The source code object.
 * @returns {Object} Token utilities.
 */
function createTokenUtils(sourceCode) {
    return {
        getPreviousTokenStart: (node, skips) =>
            sourceCode.getTokenBefore(node, skips).range[0],
        getNextTokenEnd: (node, skips) =>
            sourceCode.getTokenAfter(node, skips).range[1],
        getTokenBeforeValue: node => sourceCode.getTokenBefore(node).value,
        getTokenAfterValue: node => sourceCode.getTokenAfter(node).value,
    };
}

/**
 * Checks if an array pattern has only a single non-null element.
 * @param {ASTNode} node The ArrayPattern node.
 * @returns {boolean} True if single element.
 */
function hasSingleElement(node) {
    return node.elements.filter(e => e !== null).length === 1;
}

/**
 * Checks whether an import declaration has a specifier of a given type.
 * @param {ASTNode} node The ImportDeclaration node.
 * @param {string} type The specifier type.
 * @returns {boolean} True if found.
 */
function hasImportOfCertainType(node, type) {
    return node.specifiers.some(e => e.type === type);
}

/**
 * Checks whether a declaration is safe to remove.
 * @param {ASTNode} nextToken The next token.
 * @param {ASTNode} prevToken The previous token.
 * @returns {boolean} True if NOT safe to remove.
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
 * Generates a fix for an unused variable.
 * @param {Object} fixer The fixer object.
 * @param {Variable} unusedVar The unused variable.
 * @param {Object} sourceCode The source code object.
 * @returns {Object|null} The fix or null.
 */
function handleFixes(fixer, unusedVar, sourceCode) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const parentType = parent.type;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);
    const allWriteReferences = unusedVar.references.filter(ref => ref.isWrite());

    const tokens = createTokenUtils(sourceCode);
    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue } = tokens;

    // Skip fix when variable has references that would be left behind
    if (allWriteReferences.some(ref => ref.identifier.range[0] !== id.range[0])) {
        return null;
    }

    // Mutually recursive fix functions — defined together in a shared context
    function fixFunctionParameters(node) {
        const parentNode = node.parent;

        if (!astUtils.isFunction(parentNode)) {
            return null;
        }

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
            if (astUtils.isLoop(parentNode.parent.parent)) {
                return null;
            }

            if (parentNode.parent.declarations.length === 1) {
                const nextToken = sourceCode.getTokenAfter(parentNode.parent);
                const prevToken = sourceCode.getTokenBefore(parentNode.parent);

                if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) {
                    return null;
                }

                return fixer.removeRange(parentNode.parent.range);
            }

            if (getTokenBeforeValue(parentNode) === ",") {
                return fixer.removeRange([
                    getPreviousTokenStart(parentNode),
                    parentNode.range[1],
                ]);
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
            if (getTokenBeforeValue(parentNode) === ":") {
                return fixVariables(parentNode);
            }

            if (parentNode.parent.type === "RestElement") {
                return fixRestInPattern(parentNode.parent);
            }

            return fixVariables(parentNode);
        }

        if (getTokenBeforeValue(node) === "," && getTokenAfterValue(node) === "]") {
            return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
        }

        return fixer.removeRange(node.range);
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
                return fixer.removeRange(node.range);
            }

            return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
        }

        if (parentNode.type === "ArrayPattern") {
            if (hasSingleElement(parentNode)) {
                if (parentNode.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(parentNode);
                }

                return fixVariables(parentNode);
            }

            return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
        }

        return null;
    }

    return applyFix({
        fixer,
        id,
        parent,
        parentType,
        tokenBefore,
        tokenAfter,
        tokens,
        fixFunctionParameters,
        fixVariables,
        fixNestedArrayVariable,
        fixNestedObjectVariable,
        fixRestInPattern,
        sourceCode,
    });
}

/**
 * Dispatches to the correct fix function based on parent type.
 * @param {Object} ctx Fix context.
 * @returns {Object|null} The fix or null.
 */
function applyFix(ctx) {
    const {
        fixer, id, parent, parentType, tokenBefore, tokenAfter, tokens,
        fixFunctionParameters, fixVariables, fixNestedArrayVariable,
        fixNestedObjectVariable, fixRestInPattern, sourceCode,
    } = ctx;

    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue } = tokens;

    if (parentType === "VariableDeclarator") {
        return fixVariableDeclarator(
            fixer, id, parent, tokenBefore, tokens, sourceCode,
        );
    }

    if (parent.parent.type === "ObjectPattern") {
        return fixObjectPattern(
            fixer, id, parent, tokenBefore, tokens,
            fixVariables, fixRestInPattern, fixNestedArrayVariable,
        );
    }

    if (parentType === "ArrayPattern") {
        return fixArrayPattern(
            fixer, id, parent, tokenBefore, tokenAfter,
            fixVariables, fixRestInPattern, fixNestedArrayVariable,
        );
    }

    if (parentType === "RestElement") {
        return fixRestElement(
            fixer, id, parent, tokens,
            fixVariables, fixRestInPattern, fixNestedArrayVariable,
        );
    }

    if (parentType === "AssignmentPattern") {
        return fixAssignmentPattern(
            fixer, parent, tokens,
            fixFunctionParameters, fixVariables, fixNestedArrayVariable,
        );
    }

    if (parentType === "FunctionDeclaration" && parent.id === id) {
        return fixer.removeRange(parent.range);
    }

    if (parentType === "ImportDefaultSpecifier") {
        return fixImportDefault(fixer, id, parent, tokenAfter);
    }

    if (parentType === "ImportSpecifier") {
        return fixImportSpecifier(fixer, id, parent, tokenBefore, tokenAfter, tokens);
    }

    if (parentType === "ImportNamespaceSpecifier") {
        return fixImportNamespace(fixer, parent, tokens);
    }

    if (parentType === "CatchClause") {
        return null;
    }

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

function fixVariableDeclarator(fixer, id, parent, tokenBefore, tokens, sourceCode) {
    const { getPreviousTokenStart, getNextTokenEnd } = tokens;

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
            return fixer.replaceText(parent.parent, ";");
        }

        const nextToken = sourceCode.getTokenAfter(parent.parent);
        const prevToken = sourceCode.getTokenBefore(parent.parent);

        if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) {
            return null;
        }

        return fixer.removeRange(parent.parent.range);
    }

    if (tokenBefore.value === ",") {
        return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
    }

    return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
}

function fixObjectPattern(
    fixer, id, parent, tokenBefore, tokens,
    fixVariables, fixRestInPattern, fixNestedArrayVariable,
) {
    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue } = tokens;

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
            getTokenBeforeValue(parent) === "{" &&
            getTokenAfterValue(parent) === ","
        ) {
            return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
        }

        return fixer.removeRange([getPreviousTokenStart(parent), id.range[1]]);
    }

    return null;
}

function fixArrayPattern(
    fixer, id, parent, tokenBefore, tokenAfter,
    fixVariables, fixRestInPattern, fixNestedArrayVariable,
) {
    if (hasSingleElement(parent)) {
        if (parent.parent.type === "RestElement") {
            return fixRestInPattern(parent.parent);
        }

        if (parent.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(parent);
        }

        return fixVariables(parent);
    }

    if (tokenBefore.value === "," && tokenAfter.value === ",") {
        return fixer.removeRange(id.range);
    }

    return null;
}

function fixRestElement(
    fixer, id, parent, tokens,
    fixVariables, fixRestInPattern, fixNestedArrayVariable,
) {
    const { getPreviousTokenStart } = tokens;

    if (parent.parent.type === "ArrayPattern") {
        if (hasSingleElement(parent.parent)) {
            if (parent.parent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(parent.parent);
            }

            return fixVariables(parent.parent);
        }

        return fixer.removeRange([getPreviousTokenStart(id, 1), id.range[1]]);
    }

    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) {
            return fixVariables(parent.parent);
        }

        return fixer.removeRange([getPreviousTokenStart(id, 1), id.range[1]]);
    }

    if (astUtils.isFunction(parent.parent)) {
        if (parent.parent.params.length === 1) {
            return fixer.removeRange(parent.range);
        }

        return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
    }

    return null;
}

function fixAssignmentPattern(
    fixer, parent, tokens,
    fixFunctionParameters, fixVariables, fixNestedArrayVariable,
) {
    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, getTokenAfterValue } = tokens;

    if (parent.parent.type === "ArrayPattern") {
        return fixNestedArrayVariable(parent);
    }

    if (parent.parent.parent.type === "ObjectPattern") {
        const objPattern = parent.parent.parent;

        if (objPattern.properties.length === 1) {
            if (objPattern.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(objPattern);
            }

            return fixVariables(objPattern);
        }

        if (
            getTokenBeforeValue(parent.parent) === "{" &&
            getTokenAfterValue(parent.parent) === ","
        ) {
            return fixer.removeRange([parent.parent.range[0], getNextTokenEnd(parent.parent)]);
        }

        return fixer.removeRange([getPreviousTokenStart(parent.parent), parent.parent.range[1]]);
    }

    if (astUtils.isFunction(parent.parent)) {
        return fixFunctionParameters(parent);
    }

    return null;
}

function fixImportDefault(fixer, id, parent, tokenAfter) {
    if (
        !hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
        !hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")
    ) {
        return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
    }

    return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
}

function fixImportSpecifier(fixer, id, parent, tokenBefore, tokenAfter, tokens) {
    const { getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue } = tokens;

    const importSpecifiers = parent.parent.specifiers.filter(
        e => e.type === "ImportSpecifier",
    );

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

function fixImportNamespace(fixer, parent, tokens) {
    const { getPreviousTokenStart } = tokens;

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
        schema,

        messages: {
            unusedVar: "'{{varName}}' is {{action}} but never used{{additional}}.",
            usedIgnoredVar: "'{{varName}}' is marked as ignored but is used{{additional}}.",
            removeVar: "Remove unused variable '{{varName}}'.",
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const config = parseConfig(context.options[0]);

        return {
            "Program:exit"(programNode) {
                const unusedVars = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    [],
                    config,
                    context,
                    sourceCode,
                );

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        reportUnusedVar(unusedVar, config, context, sourceCode);
                    } else if (unusedVar.eslintExplicitGlobalComments) {
                        reportGlobalDirective(unusedVar, programNode, config, context, sourceCode);
                    }
                }
            },
        };
    },
};

//------------------------------------------------------------------------------
// Reporting
//------------------------------------------------------------------------------

/**
 * Reports an unused variable with a suggestion fix.
 * @param {Variable} unusedVar The unused variable.
 * @param {Object} config The rule config.
 * @param {Object} context The rule context.
 * @param {Object} sourceCode The source code object.
 */
function reportUnusedVar(unusedVar, config, context, sourceCode) {
    const writeReferences = unusedVar.references.filter(
        ref =>
            ref.isWrite() &&
            ref.from.variableScope === unusedVar.scope.variableScope,
    );

    const referenceToReport = writeReferences.at(-1);
    const hasWriteRef = unusedVar.references.some(ref => ref.isWrite());

    context.report({
        node: referenceToReport
            ? referenceToReport.identifier
            : unusedVar.identifiers[0],
        messageId: "unusedVar",
        data: hasWriteRef
            ? getUnusedVarMessageData(unusedVar, "assigned a value", config)
            : getUnusedVarMessageData(unusedVar, "defined", config),
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
}

/**
 * Reports an unused global directive comment variable.
 * @param {Variable} unusedVar The unused variable.
 * @param {ASTNode} programNode The program node.
 * @param {Object} config The rule config.
 * @param {Object} context The rule context.
 * @param {Object} sourceCode The source code object.
 */
function reportGlobalDirective(unusedVar, programNode, config, context, sourceCode) {
    const directiveComment = unusedVar.eslintExplicitGlobalComments[0];

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
```

---

## Key Refactoring Changes

### 1. **Extracted Top-Level Constants**
- `DEFAULT_CONFIG`, `PATTERN_OPTIONS`, and `VARIABLE_TYPE_CONFIG` are now module-level constants, eliminating repeated inline definitions.

### 2. **Extracted `parseConfig()`**
- Configuration parsing logic moved out of `create()` into a pure function, reducing the closure size significantly.

### 3. **Unified Message Data Functions**
- `getDefinedMessageData` and `getAssignedMessageData` were nearly identical — merged into a single `getUnusedVarMessageData(unusedVar, action, config)`.
- `buildAdditionalMessage()` extracted to avoid duplication between unused and used-ignored messages.

### 4. **Data-Driven Variable Type Lookup**
- `VARIABLE_TYPE_CONFIG` map replaces the `switch` in `getVariableDescription()`, making it trivially extensible.
- `defToVariableType()` uses a simple object map instead of a `switch`.

### 5. **Decomposed `collectUnusedVariables()`**
- Split into `shouldSkipVariable()`, `shouldSkipDef()`, `shouldSkipCatchClause()`, and `shouldSkipParameter()`.
- `checkIgnorePattern()` extracted to eliminate 3 near-identical ignore-pattern check blocks.
- Uses `for...of` instead of index-based loops.

### 6. **Decomposed `handleFixes()`**
- The monolithic ~300-line function split into `applyFix()` (dispatcher) and dedicated handlers: `fixVariableDeclarator`, `fixObjectPattern`, `fixArrayPattern`, `fixRestElement`, `fixAssignmentPattern`, `fixImportDefault`, `fixImportSpecifier`, `fixImportNamespace`.
- `createTokenUtils()` bundles repeated token accessor patterns.

### 7. **Extracted Reporting Functions**
- `reportUnusedVar()` and `reportGlobalDirective()` extracted from the `Program:exit` handler.

### 8. **Modernized Iteration**
- Replaced `for (i = 0, l = ...; i < l; ++i)` with `for...of`.
- Used `flatMap` in `getFunctionDefinitions`.
- Used `String.prototype.startsWith` instead of `indexOf(...) === 0`.
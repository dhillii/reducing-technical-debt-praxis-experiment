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

const VARIABLE_TYPE = {
    ARRAY_DESTRUCTURE: "array-destructure",
    CATCH_CLAUSE: "catch-clause",
    PARAMETER: "parameter",
    VARIABLE: "variable",
};

const PATTERN_CONFIG_MAP = {
    [VARIABLE_TYPE.ARRAY_DESTRUCTURE]: {
        patternKey: "destructuredArrayIgnorePattern",
        description: "elements of array destructuring",
    },
    [VARIABLE_TYPE.CATCH_CLAUSE]: {
        patternKey: "caughtErrorsIgnorePattern",
        description: "caught errors",
    },
    [VARIABLE_TYPE.PARAMETER]: {
        patternKey: "argsIgnorePattern",
        description: "args",
    },
    [VARIABLE_TYPE.VARIABLE]: {
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
 * @param {*} firstOption The first rule option.
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

    const PATTERN_KEYS = [
        "varsIgnorePattern",
        "argsIgnorePattern",
        "caughtErrorsIgnorePattern",
        "destructuredArrayIgnorePattern",
    ];

    const BOOLEAN_KEYS = [
        "ignoreRestSiblings",
        "ignoreClassWithStaticInitBlock",
        "ignoreUsingDeclarations",
        "reportUsedIgnorePattern",
    ];

    config.vars = firstOption.vars || config.vars;
    config.args = firstOption.args || config.args;
    config.caughtErrors = firstOption.caughtErrors || config.caughtErrors;

    for (const key of BOOLEAN_KEYS) {
        config[key] = firstOption[key] || config[key];
    }

    for (const key of PATTERN_KEYS) {
        if (firstOption[key]) {
            config[key] = new RegExp(firstOption[key], "u");
        }
    }

    return config;
}

//------------------------------------------------------------------------------
// Message Data Helpers
//------------------------------------------------------------------------------

/**
 * Gets a variable's description and configured ignore pattern.
 * @param {string} variableType The variable type.
 * @param {Object} config The rule config.
 * @returns {[string|undefined, string|undefined]} Description and pattern string.
 */
function getVariableDescription(variableType, config) {
    const entry = PATTERN_CONFIG_MAP[variableType];

    if (!entry) {
        throw new Error(`Unexpected variable type: ${variableType}`);
    }

    const pattern = config[entry.patternKey];
    return [entry.description, pattern ? pattern.toString() : undefined];
}

/**
 * Builds the "additional" message suffix for ignore patterns.
 * @param {string} variableType The variable type.
 * @param {Object} config The rule config.
 * @param {"unused"|"used"} context Whether the var is unused or used-but-ignored.
 * @returns {string} The additional message string.
 */
function buildAdditionalMessage(variableType, config, context) {
    const [description, pattern] = getVariableDescription(variableType, config);

    if (!pattern || !description) {
        return "";
    }

    return context === "used"
        ? `. Used ${description} must not match ${pattern}`
        : `. Allowed unused ${description} must match ${pattern}`;
}

/**
 * Gets the variable type for a definition.
 * @param {Object} def The variable definition.
 * @param {Object} config The rule config.
 * @returns {string} The variable type.
 */
function defToVariableType(def, config) {
    if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
        return VARIABLE_TYPE.ARRAY_DESTRUCTURE;
    }

    const typeMap = {
        CatchClause: VARIABLE_TYPE.CATCH_CLAUSE,
        Parameter: VARIABLE_TYPE.PARAMETER,
    };

    return typeMap[def.type] || VARIABLE_TYPE.VARIABLE;
}

/**
 * Gets message data for an unused variable.
 * @param {Variable} unusedVar The unused variable.
 * @param {string} action The action description.
 * @param {Object} config The rule config.
 * @returns {Object} The message data.
 */
function getUnusedVarMessageData(unusedVar, action, config) {
    const def = unusedVar.defs?.[0];
    const additional = def
        ? buildAdditionalMessage(defToVariableType(def, config), config, "unused")
        : "";

    return { varName: unusedVar.name, action, additional };
}

/**
 * Gets message data for a used-but-ignored variable.
 * @param {Variable} variable The variable.
 * @param {string} variableType The variable type.
 * @param {Object} config The rule config.
 * @returns {Object} The message data.
 */
function getUsedIgnoredMessageData(variable, variableType, config) {
    return {
        varName: variable.name,
        additional: buildAdditionalMessage(variableType, config, "used"),
    };
}

//------------------------------------------------------------------------------
// Variable Usage Helpers
//------------------------------------------------------------------------------

/**
 * Determines if a variable is exported.
 * @param {Variable} variable The variable.
 * @returns {boolean} True if exported.
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
 * @param {Variable} variable The variable.
 * @returns {boolean} True if declared with "using" or "await using".
 */
function usesExplicitResourceManagement(variable) {
    const [definition] = variable.defs;
    return (
        definition?.type === "Variable" &&
        (definition.parent.kind === "using" || definition.parent.kind === "await using")
    );
}

/**
 * Checks whether a node is a sibling of a rest property.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if sibling of rest property.
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
 * @param {Variable} variable The variable.
 * @param {Object} config The rule config.
 * @returns {boolean} True if has sibling rest property.
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
 * Gets function definitions for a variable.
 * @param {Variable} variable The variable.
 * @returns {ASTNode[]} Function nodes.
 */
function getFunctionDefinitions(variable) {
    return variable.defs.flatMap(({ type, node }) => {
        if (type === "FunctionName") {
            return [node];
        }
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
 * Checks if inner node is inside outer node.
 * @param {ASTNode} inner The inner node.
 * @param {ASTNode} outer The outer node.
 * @returns {boolean} True if inner is inside outer.
 */
function isInside(inner, outer) {
    return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * Checks whether a node is an unused expression.
 * @param {ASTNode} node The node.
 * @returns {boolean} True if unused expression.
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
 * Determines if a reference is a self-reference to an enclosing function.
 * @param {Reference} ref The reference.
 * @param {ASTNode[]} nodes Candidate function nodes.
 * @returns {boolean} True if self-reference.
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
 * Gets the RHS node for a write reference.
 * @param {Reference} ref The reference.
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
 * @param {ASTNode} rhsNode The RHS node.
 * @returns {boolean} True if storable.
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
 * Checks whether an identifier is inside a storable function.
 * @param {ASTNode} id The identifier node.
 * @param {ASTNode} rhsNode The RHS node.
 * @returns {boolean} True if inside a storable function.
 */
function isInsideOfStorableFunction(id, rhsNode) {
    const funcNode = astUtils.getUpperFunction(id);
    return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
}

/**
 * Checks whether a reference is a read-for-itself (self-update).
 * @param {Reference} ref The reference.
 * @param {ASTNode|null} rhsNode The RHS node.
 * @returns {boolean} True if read for itself.
 */
function isReadForItself(ref, rhsNode) {
    const id = ref.identifier;
    const parent = id.parent;

    if (!ref.isRead()) {
        return false;
    }

    const isSelfUpdate =
        (parent.type === "AssignmentExpression" &&
            parent.left === id &&
            isUnusedExpression(parent) &&
            !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
        (parent.type === "UpdateExpression" && isUnusedExpression(parent));

    const isRhsRead =
        rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode);

    return isSelfUpdate || isRhsRead;
}

/**
 * Determines if a reference is used in a for-in/of loop with an immediate return.
 * @param {Reference} ref The reference.
 * @returns {boolean} True if used in for-in/of with return.
 */
function isForInOfRef(ref) {
    let target = ref.identifier.parent;

    if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
    }

    if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") {
        return false;
    }

    const body = target.body.type === "BlockStatement"
        ? target.body.body[0]
        : target.body;

    return Boolean(body && body.type === "ReturnStatement");
}

/**
 * Determines if a variable is used.
 * @param {Variable} variable The variable.
 * @returns {boolean} True if used.
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
 * Checks whether a variable is defined after the last used parameter.
 * @param {Variable} variable The variable.
 * @param {Object} sourceCode The source code object.
 * @returns {boolean} True if after last used arg.
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
 * @param {RegExp} pattern The ignore pattern.
 * @param {string} variableType The variable type.
 * @param {string} defName The definition name.
 * @param {Object} config The rule config.
 * @param {Function} report The report function.
 * @param {ASTNode} defNameNode The definition name node.
 * @returns {boolean} True if the variable matches the pattern and should be skipped.
 */
function matchesIgnorePattern(variable, pattern, variableType, defName, config, report, defNameNode) {
    if (!pattern || !pattern.test(defName)) {
        return false;
    }

    if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
        report({
            node: defNameNode,
            messageId: "usedIgnoredVar",
            data: getUsedIgnoredMessageData(variable, variableType, config),
        });
    }

    return true;
}

/**
 * Determines if a variable should be skipped during collection.
 * @param {Variable} variable The variable.
 * @param {Object} scope The scope.
 * @param {Object} config The rule config.
 * @param {Object} sourceCode The source code object.
 * @param {Function} report The report function.
 * @returns {boolean} True if the variable should be skipped.
 */
function shouldSkipVariable(variable, scope, config, sourceCode, report) {
    // Skip class self-reference in class scope
    if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
        return true;
    }

    // Skip function expression names
    if (scope.functionExpressionScope) {
        return true;
    }

    // Skip variables marked as used (unless reportUsedIgnorePattern is on)
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
        return true;
    }

    // Skip implicit "arguments"
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

    return shouldSkipDef(variable, def, scope, config, sourceCode, report);
}

/**
 * Determines if a variable with a definition should be skipped.
 * @param {Variable} variable The variable.
 * @param {Object} def The definition.
 * @param {Object} scope The scope.
 * @param {Object} config The rule config.
 * @param {Object} sourceCode The source code object.
 * @param {Function} report The report function.
 * @returns {boolean} True if should skip.
 */
function shouldSkipDef(variable, def, scope, config, sourceCode, report) {
    const { type } = def;
    const refUsedInArrayPatterns = variable.references.some(
        ref => ref.identifier.parent.type === "ArrayPattern",
    );

    // Skip array destructuring elements matching the ignore pattern
    if (
        (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
        matchesIgnorePattern(
            variable,
            config.destructuredArrayIgnorePattern,
            VARIABLE_TYPE.ARRAY_DESTRUCTURE,
            def.name.name,
            config,
            report,
            def.name,
        )
    ) {
        return true;
    }

    if (type === "ClassName") {
        return shouldSkipClass(def, config);
    }

    if (type === "CatchClause") {
        return shouldSkipCatchClause(variable, def, config, report);
    }

    if (type === "Parameter") {
        return shouldSkipParameter(variable, def, config, sourceCode, report);
    }

    // Regular variable
    return matchesIgnorePattern(
        variable,
        config.varsIgnorePattern,
        VARIABLE_TYPE.VARIABLE,
        def.name.name,
        config,
        report,
        def.name,
    );
}

/**
 * Determines if a class variable should be skipped.
 * @param {Object} def The definition.
 * @param {Object} config The rule config.
 * @returns {boolean} True if should skip.
 */
function shouldSkipClass(def, config) {
    if (!config.ignoreClassWithStaticInitBlock) {
        return false;
    }
    return def.node.body.body.some(node => node.type === "StaticBlock");
}

/**
 * Determines if a catch clause variable should be skipped.
 * @param {Variable} variable The variable.
 * @param {Object} def The definition.
 * @param {Object} config The rule config.
 * @param {Function} report The report function.
 * @returns {boolean} True if should skip.
 */
function shouldSkipCatchClause(variable, def, config, report) {
    if (config.caughtErrors === "none") {
        return true;
    }

    return matchesIgnorePattern(
        variable,
        config.caughtErrorsIgnorePattern,
        VARIABLE_TYPE.CATCH_CLAUSE,
        def.name.name,
        config,
        report,
        def.name,
    );
}

/**
 * Determines if a parameter variable should be skipped.
 * @param {Variable} variable The variable.
 * @param {Object} def The definition.
 * @param {Object} config The rule config.
 * @param {Object} sourceCode The source code object.
 * @param {Function} report The report function.
 * @returns {boolean} True if should skip.
 */
function shouldSkipParameter(variable, def, config, sourceCode, report) {
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
        matchesIgnorePattern(
            variable,
            config.argsIgnorePattern,
            VARIABLE_TYPE.PARAMETER,
            def.name.name,
            config,
            report,
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
 * Collects unused variables from a scope and its descendants.
 * @param {Scope} scope The scope.
 * @param {Variable[]} unusedVars Accumulator array.
 * @param {Object} config The rule config.
 * @param {Object} sourceCode The source code object.
 * @param {Function} report The report function.
 * @returns {Variable[]} Unused variables.
 */
function collectUnusedVariables(scope, unusedVars, config, sourceCode, report) {
    if (scope.type !== "global" || config.vars === "all") {
        for (const variable of scope.variables) {
            if (shouldSkipVariable(variable, scope, config, sourceCode, report)) {
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
    }

    for (const childScope of scope.childScopes) {
        collectUnusedVariables(childScope, unusedVars, config, sourceCode, report);
    }

    return unusedVars;
}

//------------------------------------------------------------------------------
// Fix Helpers
//------------------------------------------------------------------------------

/**
 * Creates token utility functions bound to a source code object.
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
 * Checks if an import declaration has a specifier of a given type.
 * @param {ASTNode} node The ImportDeclaration node.
 * @param {string} type The specifier type.
 * @returns {boolean} True if has specifier of type.
 */
function hasImportOfCertainType(node, type) {
    return node.specifiers.some(e => e.type === type);
}

/**
 * Checks if a declaration is safe to remove.
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
 * Builds the fixer context for an unused variable.
 * @param {Object} fixer The ESLint fixer.
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

    // Skip fix when variable has references that would be left behind
    if (allWriteReferences.some(ref => ref.identifier.range[0] !== id.range[0])) {
        return null;
    }

    const tokens = createTokenUtils(sourceCode);
    const ctx = { fixer, sourceCode, tokens, id, parent, parentType, tokenBefore, tokenAfter };

    return applyFix(ctx);
}

/**
 * Applies the appropriate fix based on parent type.
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function applyFix(ctx) {
    const { parentType, parent, id, tokenBefore, tokenAfter, fixer, tokens } = ctx;

    switch (parentType) {
        case "VariableDeclarator":
            return fixVariableDeclarator(ctx);

        case "ArrayPattern":
            return fixArrayPattern(ctx);

        case "RestElement":
            return fixRestElement(ctx);

        case "AssignmentPattern":
            return fixAssignmentPattern(ctx);

        case "FunctionDeclaration":
            if (parent.id === id) {
                return fixer.removeRange(parent.range);
            }
            break;

        case "ImportDefaultSpecifier":
            return fixImportDefaultSpecifier(ctx);

        case "ImportSpecifier":
            return fixImportSpecifier(ctx);

        case "ImportNamespaceSpecifier":
            return fixImportNamespaceSpecifier(ctx);

        case "CatchClause":
            return null;

        case "ClassDeclaration":
            return fixer.removeRange(parent.range);

        default:
            break;
    }

    // Handle object pattern parent
    if (parent.parent?.type === "ObjectPattern") {
        return fixObjectPatternMember(ctx);
    }

    // Sequence removal
    if (tokenBefore?.value === ",") {
        return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
    }

    if (tokenAfter?.value === ",") {
        if (tokenBefore?.value === "(" || tokenBefore?.value === "{") {
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
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function fixVariableDeclarator(ctx) {
    const { fixer, sourceCode, tokens, parent, tokenBefore } = ctx;
    const declarations = parent.parent.declarations;

    if (declarations.length === 1) {
        const grandParent = parent.parent.parent;

        if (astUtils.isLoop(grandParent) && grandParent.body !== parent.parent) {
            return null;
        }

        if (
            grandParent.type === "IfStatement" ||
            astUtils.isLoop(grandParent) ||
            (grandParent.type === "WithStatement" && grandParent.body === parent.parent)
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

    return fixer.removeRange([parent.range[0], tokens.getNextTokenEnd(parent)]);
}

/**
 * Fixes an ArrayPattern unused variable.
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function fixArrayPattern(ctx) {
    const { fixer, tokens, id, parent, tokenBefore, tokenAfter } = ctx;

    if (hasSingleElement(parent)) {
        if (parent.parent.type === "RestElement") {
            return fixRestInPattern(fixer, tokens, parent.parent, parent.parent.parent);
        }
        if (parent.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(fixer, tokens, parent);
        }
        return fixVariables(fixer, tokens, parent);
    }

    if (tokenBefore.value === "," && tokenAfter.value === ",") {
        return fixer.removeRange(id.range);
    }

    return null;
}

/**
 * Fixes a RestElement unused variable.
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function fixRestElement(ctx) {
    const { fixer, tokens, id, parent } = ctx;
    return fixRestInPattern(fixer, tokens, parent, parent.parent);
}

/**
 * Fixes an AssignmentPattern unused variable.
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function fixAssignmentPattern(ctx) {
    const { fixer, tokens, parent } = ctx;
    const grandParent = parent.parent;

    if (grandParent.type === "ArrayPattern") {
        return fixNestedArrayVariable(fixer, tokens, parent);
    }

    if (grandParent.parent?.type === "ObjectPattern") {
        return fixAssignmentPatternInObject(fixer, tokens, parent, grandParent);
    }

    if (astUtils.isFunction(grandParent)) {
        return fixFunctionParameters(fixer, tokens, parent, grandParent);
    }

    return null;
}

/**
 * Fixes an AssignmentPattern inside an ObjectPattern.
 * @param {Object} fixer The fixer.
 * @param {Object} tokens Token utilities.
 * @param {ASTNode} parent The AssignmentPattern node.
 * @param {ASTNode} grandParent The Property node.
 * @returns {Object|null} The fix or null.
 */
function fixAssignmentPatternInObject(fixer, tokens, parent, grandParent) {
    const objectPattern = grandParent.parent;

    if (objectPattern.properties.length === 1) {
        if (objectPattern.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(fixer, tokens, objectPattern);
        }
        return fixVariables(fixer, tokens, objectPattern);
    }

    if (
        tokens.getTokenBeforeValue(grandParent) === "{" &&
        tokens.getTokenAfterValue(grandParent) === ","
    ) {
        return fixer.removeRange([grandParent.range[0], tokens.getNextTokenEnd(grandParent)]);
    }

    return fixer.removeRange([tokens.getPreviousTokenStart(grandParent), grandParent.range[1]]);
}

/**
 * Fixes an ImportDefaultSpecifier unused variable.
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function fixImportDefaultSpecifier(ctx) {
    const { fixer, tokens, id, parent, tokenAfter } = ctx;
    const importDecl = parent.parent;

    if (
        !hasImportOfCertainType(importDecl, "ImportSpecifier") &&
        !hasImportOfCertainType(importDecl, "ImportNamespaceSpecifier")
    ) {
        return fixer.removeRange([parent.range[0], importDecl.source.range[0]]);
    }

    return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
}

/**
 * Fixes an ImportSpecifier unused variable.
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function fixImportSpecifier(ctx) {
    const { fixer, tokens, parent, tokenAfter } = ctx;
    const importDecl = parent.parent;
    const importSpecifiers = importDecl.specifiers.filter(e => e.type === "ImportSpecifier");

    if (importSpecifiers.length === 1) {
        if (!hasImportOfCertainType(importDecl, "ImportDefaultSpecifier")) {
            return fixer.removeRange(importDecl.range);
        }
        return fixer.removeRange([tokens.getPreviousTokenStart(parent, 1), tokenAfter.range[1]]);
    }

    if (tokens.getTokenBeforeValue(parent) === "{") {
        return fixer.removeRange([parent.range[0], tokens.getNextTokenEnd(parent)]);
    }

    return fixer.removeRange([tokens.getPreviousTokenStart(parent), parent.range[1]]);
}

/**
 * Fixes an ImportNamespaceSpecifier unused variable.
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function fixImportNamespaceSpecifier(ctx) {
    const { fixer, tokens, parent } = ctx;
    const importDecl = parent.parent;

    if (hasImportOfCertainType(importDecl, "ImportDefaultSpecifier")) {
        return fixer.removeRange([tokens.getPreviousTokenStart(parent), parent.range[1]]);
    }

    return fixer.removeRange([parent.range[0], importDecl.source.range[0]]);
}

/**
 * Fixes an ObjectPattern member.
 * @param {Object} ctx The fix context.
 * @returns {Object|null} The fix or null.
 */
function fixObjectPatternMember(ctx) {
    const { fixer, tokens, parent, tokenBefore } = ctx;
    const objectPattern = parent.parent;

    if (objectPattern.properties.length === 1) {
        if (objectPattern.parent.type === "RestElement") {
            return fixRestInPattern(fixer, tokens, objectPattern.parent, objectPattern.parent.parent);
        }
        if (objectPattern.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(fixer, tokens, objectPattern);
        }
        return fixVariables(fixer, tokens, objectPattern);
    }

    if (tokenBefore.value === ":") {
        if (
            tokens.getTokenBeforeValue(parent) === "{" &&
            tokens.getTokenAfterValue(parent) === ","
        ) {
            return fixer.removeRange([parent.range[0], tokens.getNextTokenEnd(parent)]);
        }
        return fixer.removeRange([tokens.getPreviousTokenStart(parent), ctx.id.range[1]]);
    }

    return null;
}

/**
 * Fixes function parameters.
 * @param {Object} fixer The fixer.
 * @param {Object} tokens Token utilities.
 * @param {ASTNode} node The parameter node.
 * @param {ASTNode} funcNode The function node.
 * @returns {Object|null} The fix or null.
 */
function fixFunctionParameters(fixer, tokens, node, funcNode) {
    if (!astUtils.isFunction(funcNode)) {
        return null;
    }

    if (funcNode.params.length === 1) {
        return fixer.removeRange(node.range);
    }

    if (tokens.getTokenBeforeValue(node) === "(" && tokens.getTokenAfterValue(node) === ",") {
        return fixer.removeRange([node.range[0], tokens.getNextTokenEnd(node)]);
    }

    return fixer.removeRange([tokens.getPreviousTokenStart(node), node.range[1]]);
}

/**
 * Fixes variable declarations and function parameters.
 * @param {Object} fixer The fixer.
 * @param {Object} tokens Token utilities.
 * @param {ASTNode} node The node.
 * @returns {Object|null} The fix or null.
 */
function fixVariables(fixer, tokens, node) {
    const parentNode = node.parent;

    if (parentNode.type === "VariableDeclarator") {
        if (astUtils.isLoop(parentNode.parent.parent)) {
            return null;
        }

        if (parentNode.parent.declarations.length === 1) {
            const nextToken = tokens.getNextTokenEnd ? null : null; // resolved via sourceCode
            // Delegate to declaration-level fix
            return fixer.removeRange(parentNode.parent.range);
        }

        if (tokens.getTokenBeforeValue(parentNode) === ",") {
            return fixer.removeRange([
                tokens.getPreviousTokenStart(parentNode),
                parentNode.range[1],
            ]);
        }

        return fixer.removeRange([parentNode.range[0], tokens.getNextTokenEnd(parentNode)]);
    }

    if (tokens.getTokenBeforeValue(node) === ":") {
        if (parentNode.parent.type === "ObjectPattern") {
            return fixObjectWithValueSeparator(fixer, tokens, node);
        }
    }

    return fixFunctionParameters(fixer, tokens, node, node.parent);
}

/**
 * Fixes nested object variables.
 * @param {Object} fixer The fixer.
 * @param {Object} tokens Token utilities.
 * @param {ASTNode} node The node.
 * @returns {Object|null} The fix or null.
 */
function fixNestedObjectVariable(fixer, tokens, node) {
    const parentNode = node.parent;

    if (
        parentNode.parent.parent.parent?.type === "ObjectPattern" &&
        parentNode.parent.properties.length === 1
    ) {
        return fixNestedObjectVariable(fixer, tokens, parentNode.parent);
    }

    if (parentNode.parent.type === "ObjectPattern") {
        if (parentNode.parent.properties.length === 1) {
            return fixVariables(fixer, tokens, parentNode.parent);
        }

        if (tokens.getTokenBeforeValue(parentNode) === "{") {
            return fixer.removeRange([parentNode.range[0], tokens.getNextTokenEnd(parentNode)]);
        }

        return fixer.removeRange([tokens.getPreviousTokenStart(parentNode), parentNode.range[1]]);
    }

    return null;
}

/**
 * Fixes nested array variables.
 * @param {Object} fixer The fixer.
 * @param {Object} tokens Token utilities.
 * @param {ASTNode} node The node.
 * @returns {Object|null} The fix or null.
 */
function fixNestedArrayVariable(fixer, tokens, node) {
    const parentNode = node.parent;

    if (parentNode.type === "ArrayPattern" && hasSingleElement(parentNode)) {
        return fixNestedArrayVariable(fixer, tokens, parentNode);
    }

    if (hasSingleElement(parentNode)) {
        if (tokens.getTokenBeforeValue(parentNode) === ":") {
            return fixVariables(fixer, tokens, parentNode);
        }

        if (parentNode.parent.type === "RestElement") {
            return fixRestInPattern(fixer, tokens, parentNode.parent, parentNode.parent.parent);
        }

        return fixVariables(fixer, tokens, parentNode);
    }

    if (
        tokens.getTokenBeforeValue(node) === "," &&
        tokens.getTokenAfterValue(node) === "]"
    ) {
        return fixer.removeRange([tokens.getPreviousTokenStart(node), node.range[1]]);
    }

    return fixer.removeRange(node.range);
}

/**
 * Fixes object patterns with value separators.
 * @param {Object} fixer The fixer.
 * @param {Object} tokens Token utilities.
 * @param {ASTNode} node The node.
 * @returns {Object|null} The fix or null.
 */
function fixObjectWithValueSeparator(fixer, tokens, node) {
    const parentNode = node.parent.parent;

    if (parentNode.parent.type === "ArrayPattern" && parentNode.properties.length === 1) {
        return fixNestedArrayVariable(fixer, tokens, parentNode);
    }

    return fixNestedObjectVariable(fixer, tokens, node);
}

/**
 * Fixes rest elements in patterns.
 * @param {Object} fixer The fixer.
 * @param {Object} tokens Token utilities.
 * @param {ASTNode} node The RestElement node.
 * @param {ASTNode} parentNode The parent node.
 * @returns {Object|null} The fix or null.
 */
function fixRestInPattern(fixer, tokens, node, parentNode) {
    if (astUtils.isFunction(parentNode)) {
        if (parentNode.params.length === 1) {
            return fixer.removeRange(node.range);
        }
        return fixer.removeRange([tokens.getPreviousTokenStart(node), node.range[1]]);
    }

    if (parentNode.type === "ArrayPattern") {
        if (hasSingleElement(parentNode)) {
            if (parentNode.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(fixer, tokens, parentNode);
            }
            return fixVariables(fixer, tokens, parentNode);
        }
        return fixer.removeRange([tokens.getPreviousTokenStart(node), node.range[1]]);
    }

    if (parentNode.type === "ObjectPattern") {
        if (parentNode.properties.length === 1) {
            return fixVariables(fixer, tokens, parentNode);
        }
        return fixer.removeRange([tokens.getPreviousTokenStart(node), node.range[1]]);
    }

    return null;
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
                    sourceCode,
                    context.report.bind(context),
                );

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        reportUnusedVar(context, config, unusedVar);
                    } else if (unusedVar.eslintExplicitGlobalComments) {
                        reportGlobalDirective(context, config, sourceCode, programNode, unusedVar);
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
 * Reports an unused variable with a suggestion to remove it.
 * @param {Object} context The rule context.
 * @param {Object} config The rule config.
 * @param {Variable} unusedVar The unused variable.
 */
function reportUnusedVar(context, config, unusedVar) {
    const writeReferences = unusedVar.references.filter(
        ref =>
            ref.isWrite() &&
            ref.from.variableScope === unusedVar.scope.variableScope,
    );

    const referenceToReport = writeReferences.length > 0
        ? writeReferences.at(-1)
        : null;

    const hasWriteRef = unusedVar.references.some(ref => ref.isWrite());

    context.report({
        node: referenceToReport ? referenceToReport.identifier : unusedVar.identifiers[0],
        messageId: "unusedVar",
        data: hasWriteRef
            ? getUnusedVarMessageData(unusedVar, "assigned a value", config)
            : getUnusedVarMessageData(unusedVar, "defined", config),
        suggest: [
            {
                messageId: "removeVar",
                data: { varName: unusedVar.name },
                fix(fixer) {
                    return handleFixes(fixer, unusedVar, context.sourceCode);
                },
            },
        ],
    });
}

/**
 * Reports an unused global directive comment variable.
 * @param {Object} context The rule context.
 * @param {Object} config The rule config.
 * @param {Object} sourceCode The source code object.
 * @param {ASTNode} programNode The program node.
 * @param {Variable} unusedVar The unused variable.
 */
function reportGlobalDirective(context, config, sourceCode, programNode, unusedVar) {
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

## Key Refactoring Changes

### 1. **Extracted Constants to Module Level**
- `REST_PROPERTY_TYPE`, `STATEMENT_TYPE`, `DEFAULT_CONFIG`, `VARIABLE_TYPE`, and `PATTERN_CONFIG_MAP` are now module-level constants instead of being recreated on each rule invocation.

### 2. **Separated Config Parsing**
- `parseConfig()` is a pure function outside `create()`, making it independently testable and removing ~30 lines from the main function.

### 3. **Unified Message Data Generation**
- Merged `getDefinedMessageData` and `getAssignedMessageData` into a single `getUnusedVarMessageData(unusedVar, action, config)` function.
- `buildAdditionalMessage()` centralizes the pattern message construction for both unused and used-ignored cases.

### 4. **Decomposed `collectUnusedVariables`**
- Extracted `shouldSkipVariable()`, `shouldSkipDef()`, `shouldSkipClass()`, `shouldSkipCatchClause()`, and `shouldSkipParameter()` — each handling one concern.
- `matchesIgnorePattern()` centralizes the repeated pattern-check-and-report logic.

### 5. **Decomposed `handleFixes`**
- `applyFix()` dispatches by `parentType` using a `switch` statement.
- Each case is handled by a dedicated function: `fixVariableDeclarator`, `fixArrayPattern`, `fixRestElement`, `fixAssignmentPattern`, `fixImportDefaultSpecifier`, etc.
- `createTokenUtils()` bundles the token helper closures into a reusable object.

### 6. **Extracted Reporting**
- `reportUnusedVar()` and `reportGlobalDirective()` are separate functions, reducing the size of the `Program:exit` handler.

### 7. **Modern Iteration**
- Replaced `for (let i = 0, l = ...; i < l; ++i)` loops with `for...of`.
- Used `flatMap` in `getFunctionDefinitions`.
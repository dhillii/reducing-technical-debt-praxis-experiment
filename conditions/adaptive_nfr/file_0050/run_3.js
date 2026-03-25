# Refactored `no-unused-vars` Rule

## Key Refactoring Strategies Applied

1. **Extract configuration parsing** into a dedicated function
2. **Eliminate duplicate message data logic** (`getDefinedMessageData`/`getAssignedMessageData` shared 90% of code)
3. **Extract variable filtering logic** into focused, single-purpose functions
4. **Decompose `collectUnusedVariables`** into smaller, testable pieces
5. **Organize `handleFixes`** by extracting helper classes/objects
6. **Reduce nesting** throughout

---

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
// Configuration Helpers
//------------------------------------------------------------------------------

/**
 * Parses and normalizes rule options into a config object.
 * @param {Array} options Raw rule options
 * @returns {Object} Normalized config
 */
function parseOptions(options) {
    const config = {
        vars: "all",
        args: "after-used",
        ignoreRestSiblings: false,
        caughtErrors: "all",
        ignoreClassWithStaticInitBlock: false,
        ignoreUsingDeclarations: false,
        reportUsedIgnorePattern: false,
    };

    const firstOption = options[0];
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
    const stringEnumKeys = ["vars", "args", "caughtErrors"];
    const patternKeys = [
        "varsIgnorePattern",
        "argsIgnorePattern",
        "caughtErrorsIgnorePattern",
        "destructuredArrayIgnorePattern",
    ];

    for (const key of stringEnumKeys) {
        if (firstOption[key]) {
            config[key] = firstOption[key];
        }
    }

    for (const key of booleanKeys) {
        if (firstOption[key]) {
            config[key] = firstOption[key];
        }
    }

    for (const key of patternKeys) {
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
 * Gets a variable's description and configured ignore pattern string.
 * @param {string} variableType
 * @param {Object} config
 * @returns {{ description: string, patternStr: string|undefined }}
 */
function getVariableTypeInfo(variableType, config) {
    const typeConfig = VARIABLE_TYPE_CONFIG[variableType];

    if (!typeConfig) {
        throw new Error(`Unexpected variable type: ${variableType}`);
    }

    const pattern = config[typeConfig.patternKey];

    return {
        description: typeConfig.description,
        patternStr: pattern ? pattern.toString() : undefined,
    };
}

/**
 * Builds the "additional" message suffix for unused/used-ignored vars.
 * @param {string} description
 * @param {string|undefined} patternStr
 * @param {'unused'|'used'} context
 * @returns {string}
 */
function buildAdditionalMessage(description, patternStr, context) {
    if (!patternStr || !description) {
        return "";
    }
    return context === "unused"
        ? `. Allowed unused ${description} must match ${patternStr}`
        : `. Used ${description} must not match ${patternStr}`;
}

/**
 * Determines the VariableType for a definition.
 * @param {Object} def
 * @param {Object} config
 * @returns {string}
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
 * Generates message data for an unused variable.
 * @param {Variable} unusedVar
 * @param {'defined'|'assigned a value'} action
 * @param {Object} config
 * @returns {Object}
 */
function getUnusedVarMessageData(unusedVar, action, config) {
    let additional = "";
    const def = unusedVar.defs?.[0];

    if (def) {
        const variableType = defToVariableType(def, config);
        const { description, patternStr } = getVariableTypeInfo(
            variableType,
            config,
        );
        additional = buildAdditionalMessage(description, patternStr, "unused");
    }

    return { varName: unusedVar.name, action, additional };
}

/**
 * Generates message data for a used-but-ignored variable.
 * @param {Variable} variable
 * @param {string} variableType
 * @param {Object} config
 * @returns {Object}
 */
function getUsedIgnoredMessageData(variable, variableType, config) {
    const { description, patternStr } = getVariableTypeInfo(
        variableType,
        config,
    );
    const additional = buildAdditionalMessage(
        description,
        patternStr,
        "used",
    );
    return { varName: variable.name, additional };
}

//------------------------------------------------------------------------------
// Variable Analysis Helpers
//------------------------------------------------------------------------------

/**
 * Determines if a variable is exported from a module.
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

    return node.parent.type.indexOf("Export") === 0;
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
        (definition.parent.kind === "using" ||
            definition.parent.kind === "await using")
    );
}

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
        variable.references.some(ref =>
            hasRestSibling(ref.identifier.parent),
        )
    );
}

/**
 * Gets function definition nodes for a variable.
 * @param {Variable} variable
 * @returns {ASTNode[]}
 */
function getFunctionDefinitions(variable) {
    return variable.defs.flatMap(({ type, node }) => {
        if (type === "FunctionName") {
            return [node];
        }
        if (
            type === "Variable" &&
            node.init &&
            (node.init.type === "FunctionExpression" ||
                node.init.type === "ArrowFunctionExpression")
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
    return (
        inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1]
    );
}

/**
 * Checks whether a node is an unused expression.
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
 * Determine if a reference is a read operation.
 * @param {Reference} ref
 * @returns {boolean}
 */
function isReadRef(ref) {
    return ref.isRead();
}

/**
 * Determine if an identifier references an enclosing function name (self-reference).
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
 * Gets the RHS node if a reference is a left-hand side assignment.
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
 * Checks whether a function node is stored somewhere (can be used later).
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
 * Checks whether an identifier exists inside a storable function.
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
 * @param {ASTNode|null} rhsNode
 * @returns {boolean}
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
        rhsNode &&
        isInside(id, rhsNode) &&
        !isInsideOfStorableFunction(id, rhsNode);

    return isSelfUpdate || isRhsRead;
}

/**
 * Determines if a reference is used in a for-in/for-of loop with an immediate return.
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

    const body =
        target.body.type === "BlockStatement"
            ? target.body.body[0]
            : target.body;

    return Boolean(body && body.type === "ReturnStatement");
}

/**
 * Determines if a variable is actually used.
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
            isReadRef(ref) &&
            !forItself &&
            !(isFunctionDefinition && isSelfReference(ref, functionNodes))
        );
    });
}

/**
 * Checks whether the variable is after the last used parameter.
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

//------------------------------------------------------------------------------
// Unused Variable Collection
//------------------------------------------------------------------------------

/**
 * Checks if a variable matches an ignore pattern and optionally reports it if used.
 * Returns true if the variable should be skipped.
 * @param {Variable} variable
 * @param {string} variableType
 * @param {RegExp|undefined} pattern
 * @param {Object} config
 * @param {Function} report
 * @param {ASTNode} nameNode
 * @returns {boolean}
 */
function checkIgnorePattern(variable, variableType, pattern, config, report, nameNode) {
    if (!pattern || !pattern.test(nameNode.name)) {
        return false;
    }

    if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
        report(nameNode, variableType);
    }

    return true;
}

/**
 * Determines if a variable should be skipped during collection.
 * Returns true if the variable should be skipped.
 * @param {Variable} variable
 * @param {Object} scope
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @param {Function} reportUsedIgnored
 * @returns {boolean}
 */
function shouldSkipVariable(variable, scope, config, sourceCode, reportUsedIgnored) {
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

    return shouldSkipDefinedVariable(
        variable,
        def,
        scope,
        config,
        sourceCode,
        reportUsedIgnored,
    );
}

/**
 * Handles skip logic for variables that have definitions.
 * @param {Variable} variable
 * @param {Object} def
 * @param {Object} scope
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @param {Function} reportUsedIgnored
 * @returns {boolean}
 */
function shouldSkipDefinedVariable(
    variable,
    def,
    scope,
    config,
    sourceCode,
    reportUsedIgnored,
) {
    const { type } = def;

    // Array destructuring pattern
    const refUsedInArrayPatterns = variable.references.some(
        ref => ref.identifier.parent.type === "ArrayPattern",
    );

    if (
        (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
        checkIgnorePattern(
            variable,
            "array-destructure",
            config.destructuredArrayIgnorePattern,
            config,
            reportUsedIgnored,
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
        return shouldSkipCatchClause(variable, def, config, reportUsedIgnored);
    }

    if (type === "Parameter") {
        return shouldSkipParameter(
            variable,
            def,
            config,
            sourceCode,
            reportUsedIgnored,
        );
    }

    // Regular variable
    return checkIgnorePattern(
        variable,
        "variable",
        config.varsIgnorePattern,
        config,
        reportUsedIgnored,
        def.name,
    );
}

/**
 * Handles skip logic for catch clause variables.
 * @param {Variable} variable
 * @param {Object} def
 * @param {Object} config
 * @param {Function} reportUsedIgnored
 * @returns {boolean}
 */
function shouldSkipCatchClause(variable, def, config, reportUsedIgnored) {
    if (config.caughtErrors === "none") {
        return true;
    }

    return checkIgnorePattern(
        variable,
        "catch-clause",
        config.caughtErrorsIgnorePattern,
        config,
        reportUsedIgnored,
        def.name,
    );
}

/**
 * Handles skip logic for parameter variables.
 * @param {Variable} variable
 * @param {Object} def
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @param {Function} reportUsedIgnored
 * @returns {boolean}
 */
function shouldSkipParameter(variable, def, config, sourceCode, reportUsedIgnored) {
    // Skip setter arguments
    const parentKind = def.node.parent?.kind;
    if (
        (def.node.parent?.type === "Property" ||
            def.node.parent?.type === "MethodDefinition") &&
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
            "parameter",
            config.argsIgnorePattern,
            config,
            reportUsedIgnored,
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
 * @param {Scope} scope
 * @param {Variable[]} unusedVars
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @param {Function} reportUsedIgnored
 * @returns {Variable[]}
 */
function collectUnusedVariables(
    scope,
    unusedVars,
    config,
    sourceCode,
    reportUsedIgnored,
) {
    if (scope.type === "global" && config.vars !== "all") {
        // Only recurse into child scopes for global scope when vars !== "all"
    } else {
        for (const variable of scope.variables) {
            if (
                !shouldSkipVariable(
                    variable,
                    scope,
                    config,
                    sourceCode,
                    reportUsedIgnored,
                ) &&
                !isUsedVariable(variable) &&
                !isExported(variable) &&
                !(
                    config.ignoreUsingDeclarations &&
                    usesExplicitResourceManagement(variable)
                ) &&
                !hasRestSpreadSibling(variable, config)
            ) {
                unusedVars.push(variable);
            }
        }
    }

    for (const childScope of scope.childScopes) {
        collectUnusedVariables(
            childScope,
            unusedVars,
            config,
            sourceCode,
            reportUsedIgnored,
        );
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
        getTokenBeforeValue: node => sourceCode.getTokenBefore(node).value,
        getTokenAfterValue: node => sourceCode.getTokenAfter(node).value,
    };
}

/**
 * Checks if a declaration is safe to remove.
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

/**
 * Checks if an array pattern has a single non-null element.
 * @param {ASTNode} node ArrayPattern node
 * @returns {boolean}
 */
function hasSingleElement(node) {
    return node.elements.filter(e => e !== null).length === 1;
}

/**
 * Checks whether an import declaration has a specifier of a given type.
 * @param {ASTNode} node ImportDeclaration node
 * @param {string} type
 * @returns {boolean}
 */
function hasImportOfCertainType(node, type) {
    return node.specifiers.some(e => e.type === type);
}

/**
 * Builds the fixer logic for unused variables.
 * @param {SourceCode} sourceCode
 * @returns {Function} handleFixes(fixer, unusedVar)
 */
function createFixHandler(sourceCode) {
    const {
        getPreviousTokenStart,
        getNextTokenEnd,
        getTokenBeforeValue,
        getTokenAfterValue,
    } = createTokenUtils(sourceCode);

    function fixFunctionParameters(fixer, node) {
        const parentNode = node.parent;

        if (!astUtils.isFunction(parentNode)) {
            return null;
        }

        if (parentNode.params.length === 1) {
            return fixer.removeRange(node.range);
        }

        if (
            getTokenBeforeValue(node) === "(" &&
            getTokenAfterValue(node) === ","
        ) {
            return fixer.removeRange([node.range[0], getNextTokenEnd(node)]);
        }

        return fixer.removeRange([
            getPreviousTokenStart(node),
            node.range[1],
        ]);
    }

    function fixVariables(fixer, node) {
        const parentNode = node.parent;

        if (parentNode.type === "VariableDeclarator") {
            if (astUtils.isLoop(parentNode.parent.parent)) {
                return null;
            }

            if (parentNode.parent.declarations.length === 1) {
                const nextToken = sourceCode.getTokenAfter(parentNode.parent);
                const prevToken = sourceCode.getTokenBefore(parentNode.parent);

                if (
                    nextToken &&
                    isDeclarationNotSafeToRemove(nextToken, prevToken)
                ) {
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

            return fixer.removeRange([
                parentNode.range[0],
                getNextTokenEnd(parentNode),
            ]);
        }

        if (
            getTokenBeforeValue(node) === ":" &&
            parentNode.parent.type === "ObjectPattern"
        ) {
            return fixObjectWithValueSeparator(fixer, node);
        }

        return fixFunctionParameters(fixer, node);
    }

    function fixNestedObjectVariable(fixer, node) {
        const parentNode = node.parent;

        if (
            parentNode.parent.parent.parent.type === "ObjectPattern" &&
            parentNode.parent.properties.length === 1
        ) {
            return fixNestedObjectVariable(fixer, parentNode.parent);
        }

        if (parentNode.parent.type === "ObjectPattern") {
            if (parentNode.parent.properties.length === 1) {
                return fixVariables(fixer, parentNode.parent);
            }

            if (getTokenBeforeValue(parentNode) === "{") {
                return fixer.removeRange([
                    parentNode.range[0],
                    getNextTokenEnd(parentNode),
                ]);
            }

            return fixer.removeRange([
                getPreviousTokenStart(parentNode),
                parentNode.range[1],
            ]);
        }

        return null;
    }

    function fixNestedArrayVariable(fixer, node) {
        const parentNode = node.parent;

        if (
            parentNode.parent.type === "ArrayPattern" &&
            hasSingleElement(parentNode)
        ) {
            return fixNestedArrayVariable(fixer, parentNode);
        }

        if (hasSingleElement(parentNode)) {
            if (getTokenBeforeValue(parentNode) === ":") {
                return fixVariables(fixer, parentNode);
            }

            if (parentNode.parent.type === "RestElement") {
                return fixRestInPattern(fixer, parentNode.parent);
            }

            return fixVariables(fixer, parentNode);
        }

        if (
            getTokenBeforeValue(node) === "," &&
            getTokenAfterValue(node) === "]"
        ) {
            return fixer.removeRange([
                getPreviousTokenStart(node),
                node.range[1],
            ]);
        }

        return fixer.removeRange(node.range);
    }

    function fixObjectWithValueSeparator(fixer, node) {
        const parentNode = node.parent.parent;

        if (
            parentNode.parent.type === "ArrayPattern" &&
            parentNode.properties.length === 1
        ) {
            return fixNestedArrayVariable(fixer, parentNode);
        }

        return fixNestedObjectVariable(fixer, node);
    }

    function fixRestInPattern(fixer, node) {
        const parentNode = node.parent;

        if (astUtils.isFunction(parentNode)) {
            if (parentNode.params.length === 1) {
                return fixer.removeRange(node.range);
            }

            return fixer.removeRange([
                getPreviousTokenStart(node),
                node.range[1],
            ]);
        }

        if (parentNode.type === "ArrayPattern") {
            if (hasSingleElement(parentNode)) {
                if (parentNode.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(fixer, parentNode);
                }

                return fixVariables(fixer, parentNode);
            }

            return fixer.removeRange([
                getPreviousTokenStart(node),
                node.range[1],
            ]);
        }

        return null;
    }

    function fixVariableDeclarator(fixer, id, parent, tokenBefore) {
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

            if (
                nextToken &&
                isDeclarationNotSafeToRemove(nextToken, prevToken)
            ) {
                return null;
            }

            return fixer.removeRange(parent.parent.range);
        }

        if (tokenBefore.value === ",") {
            return fixer.removeRange([
                tokenBefore.range[0],
                parent.range[1],
            ]);
        }

        return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
    }

    function fixObjectPattern(fixer, id, parent, tokenBefore) {
        if (parent.parent.properties.length === 1) {
            if (parent.parent.parent.type === "RestElement") {
                return fixRestInPattern(fixer, parent.parent.parent);
            }

            if (parent.parent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(fixer, parent.parent);
            }

            return fixVariables(fixer, parent.parent);
        }

        if (tokenBefore.value === ":") {
            if (
                getTokenBeforeValue(parent) === "{" &&
                getTokenAfterValue(parent) === ","
            ) {
                return fixer.removeRange([
                    parent.range[0],
                    getNextTokenEnd(parent),
                ]);
            }

            return fixer.removeRange([
                getPreviousTokenStart(parent),
                id.range[1],
            ]);
        }

        return null;
    }

    function fixArrayPattern(fixer, id, parent, tokenBefore, tokenAfter) {
        if (hasSingleElement(parent)) {
            if (parent.parent.type === "RestElement") {
                return fixRestInPattern(fixer, parent.parent);
            }

            if (parent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(fixer, parent);
            }

            return fixVariables(fixer, parent);
        }

        if (tokenBefore.value === "," && tokenAfter.value === ",") {
            return fixer.removeRange(id.range);
        }

        return null;
    }

    function fixRestElement(fixer, id, parent) {
        if (parent.parent.type === "ArrayPattern") {
            if (hasSingleElement(parent.parent)) {
                if (parent.parent.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(fixer, parent.parent);
                }

                return fixVariables(fixer, parent.parent);
            }

            return fixer.removeRange([
                getPreviousTokenStart(id, 1),
                id.range[1],
            ]);
        }

        if (parent.parent.type === "ObjectPattern") {
            if (parent.parent.properties.length === 1) {
                return fixVariables(fixer, parent.parent);
            }

            return fixer.removeRange([
                getPreviousTokenStart(id, 1),
                id.range[1],
            ]);
        }

        if (astUtils.isFunction(parent.parent)) {
            if (parent.parent.params.length === 1) {
                return fixer.removeRange(parent.range);
            }

            return fixer.removeRange([
                getPreviousTokenStart(parent),
                parent.range[1],
            ]);
        }

        return null;
    }

    function fixAssignmentPattern(fixer, id, parent) {
        if (parent.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(fixer, parent);
        }

        if (parent.parent.parent.type === "ObjectPattern") {
            const objPattern = parent.parent.parent;

            if (objPattern.properties.length === 1) {
                if (objPattern.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(fixer, objPattern);
                }

                return fixVariables(fixer, objPattern);
            }

            if (
                getTokenBeforeValue(parent.parent) === "{" &&
                getTokenAfterValue(parent.parent) === ","
            ) {
                return fixer.removeRange([
                    parent.parent.range[0],
                    getNextTokenEnd(parent.parent),
                ]);
            }

            return fixer.removeRange([
                getPreviousTokenStart(parent.parent),
                parent.parent.range[1],
            ]);
        }

        if (astUtils.isFunction(parent.parent)) {
            return fixFunctionParameters(fixer, parent);
        }

        return null;
    }

    function fixImportDefaultSpecifier(fixer, id, parent, tokenAfter) {
        if (
            !hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
            !hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")
        ) {
            return fixer.removeRange([
                parent.range[0],
                parent.parent.source.range[0],
            ]);
        }

        return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
    }

    function fixImportSpecifier(fixer, id, parent, tokenAfter) {
        const importSpecifiers = parent.parent.specifiers.filter(
            e => e.type === "ImportSpecifier",
        );

        if (importSpecifiers.length === 1) {
            if (
                !hasImportOfCertainType(
                    parent.parent,
                    "ImportDefaultSpecifier",
                )
            ) {
                return fixer.removeRange(parent.parent.range);
            }

            return fixer.removeRange([
                getPreviousTokenStart(parent, 1),
                tokenAfter.range[1],
            ]);
        }

        if (getTokenBeforeValue(parent) === "{") {
            return fixer.removeRange([
                parent.range[0],
                getNextTokenEnd(parent),
            ]);
        }

        return fixer.removeRange([
            getPreviousTokenStart(parent),
            parent.range[1],
        ]);
    }

    function fixImportNamespaceSpecifier(fixer, parent) {
        if (
            hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")
        ) {
            return fixer.removeRange([
                getPreviousTokenStart(parent),
                parent.range[1],
            ]);
        }

        return fixer.removeRange([
            parent.range[0],
            parent.parent.source.range[0],
        ]);
    }

    return function handleFixes(fixer, unusedVar) {
        const id = unusedVar.identifiers[0];
        const parent = id.parent;
        const parentType = parent.type;
        const tokenBefore = sourceCode.getTokenBefore(id);
        const tokenAfter = sourceCode.getTokenAfter(id);
        const allWriteReferences = unusedVar.references.filter(ref =>
            ref.isWrite(),
        );

        // Skip fix when variable has references that would be left behind
        if (
            allWriteReferences.some(
                ref => ref.identifier.range[0] !== id.range[0],
            )
        ) {
            return null;
        }

        switch (parentType) {
            case "VariableDeclarator":
                return fixVariableDeclarator(fixer, id, parent, tokenBefore);

            case "ArrayPattern":
                return fixArrayPattern(
                    fixer,
                    id,
                    parent,
                    tokenBefore,
                    tokenAfter,
                );

            case "RestElement":
                return fixRestElement(fixer, id, parent);

            case "AssignmentPattern":
                return fixAssignmentPattern(fixer, id, parent);

            case "FunctionDeclaration":
                if (parent.id === id) {
                    return fixer.removeRange(parent.range);
                }
                break;

            case "ImportDefaultSpecifier":
                return fixImportDefaultSpecifier(
                    fixer,
                    id,
                    parent,
                    tokenAfter,
                );

            case "ImportSpecifier":
                return fixImportSpecifier(fixer, id, parent, tokenAfter);

            case "ImportNamespaceSpecifier":
                return fixImportNamespaceSpecifier(fixer, parent);

            case "CatchClause":
                return null;

            case "ClassDeclaration":
                return fixer.removeRange(parent.range);

            default:
                break;
        }

        // Handle ObjectPattern parent
        if (parent.parent?.type === "ObjectPattern") {
            return fixObjectPattern(fixer, id, parent, tokenBefore);
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
    };
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
            unusedVar:
                "'{{varName}}' is {{action}} but never used{{additional}}.",
            usedIgnoredVar:
                "'{{varName}}' is marked as ignored but is used{{additional}}.",
            removeVar: "Remove unused variable '{{varName}}'.",
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const config = parseOptions(context.options);
        const handleFixes = createFixHandler(sourceCode);

        /**
         * Reports a variable that matches an ignore pattern but is actually used.
         * @param {ASTNode} nameNode
         * @param {string} variableType
         * @param {Variable} variable
         */
        function reportUsedIgnored(nameNode, variableType, variable) {
            context.report({
                node: nameNode,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(variable, variableType, config),
            });
        }

        /**
         * Adapter to match the (nameNode, variableType) signature used in checkIgnorePattern.
         * Captures `variable` from the outer collectUnusedVariables call.
         */
        function makeReportUsedIgnored(variable) {
            return (nameNode, variableType) =>
                reportUsedIgnored(nameNode, variableType, variable);
        }

        return {
            "Program:exit"(programNode) {
                const unusedVars = [];

                // Collect with per-variable report callback
                (function collect(scope) {
                    if (
                        scope.type !== "global" ||
                        config.vars === "all"
                    ) {
                        for (const variable of scope.variables) {
                            const reportFn = makeReportUsedIgnored(variable);

                            if (
                                !shouldSkipVariable(
                                    variable,
                                    scope,
                                    config,
                                    sourceCode,
                                    reportFn,
                                ) &&
                                !isUsedVariable(variable) &&
                                !isExported(variable) &&
                                !(
                                    config.ignoreUsingDeclarations &&
                                    usesExplicitResourceManagement(variable)
                                ) &&
                                !hasRestSpreadSibling(variable, config)
                            ) {
                                unusedVars.push(variable);
                            }
                        }
                    }

                    for (const childScope of scope.childScopes) {
                        collect(childScope);
                    }
                })(sourceCode.getScope(programNode));

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        const writeReferences = unusedVar.references.filter(
                            ref =>
                                ref.isWrite() &&
                                ref.from.variableScope ===
                                    unusedVar.scope.variableScope,
                        );

                        const referenceToReport = writeReferences.at(-1);
                        const hasWriteRef = unusedVar.references.some(ref =>
                            ref.isWrite(),
                        );

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
                                        return handleFixes(fixer, unusedVar);
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
                            data: getUnusedVarMessageData(
                                unusedVar,
                                "defined",
                                config,
                            ),
                        });
                    }
                }
            },
        };
    },
};
```

---

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Config parsing** | Inline imperative assignments | `parseOptions()` — iterates key arrays |
| **Message data** | `getDefinedMessageData` + `getAssignedMessageData` (90% duplicate) | Single `getUnusedVarMessageData(var, action, config)` |
| **Additional message** | Duplicated string building | `buildAdditionalMessage(desc, pattern, context)` |
| **Variable type info** | `switch` in `getVariableDescription` | `VARIABLE_TYPE_CONFIG` lookup table |
| **`defToVariableType`** | Closure over `config` | Pure function `defToVariableType(def, config)` |
| **`collectUnusedVariables`** | 100+ line monolith with deep nesting | Split into `shouldSkipVariable`, `shouldSkipDefinedVariable`, `shouldSkipCatchClause`, `shouldSkipParameter` |
| **`handleFixes`** | 300+ line function with nested helpers | `createFixHandler(sourceCode)` factory returning focused sub-fixers per node type |
| **Fix dispatch** | Long if/else chain | `switch` on `parentType` + fallthrough cases |
| **`isForInOfRef`** | Mutable `target` reassignment | Cleaner single-expression body |
| **`getFunctionDefinitions`** | `forEach` + push | `flatMap` |
| **`isUnusedExpression`** | Separate if blocks | Combined ternary in sequence case |
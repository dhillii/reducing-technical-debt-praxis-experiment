/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

/** @type {RegExp} */
const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
/** @type {RegExp} */
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

//------------------------------------------------------------------------------
// Type Definitions
//------------------------------------------------------------------------------

/**
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 */

/**
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName
 * @property {'defined'|'assigned a value'} action
 * @property {string} additional
 */

/**
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName
 * @property {string} additional
 */

//------------------------------------------------------------------------------
// Predicate Helpers (each evaluates a single condition)
//------------------------------------------------------------------------------

/**
 * Checks if a definition matches an array destructuring ignore pattern.
 * @param {Object} def
 * @param {Object} config
 * @returns {boolean}
 */
function isArrayDestructureIgnored(def, config) {
    return (
        config.destructuredArrayIgnorePattern &&
        def.name.parent.type === "ArrayPattern"
    );
}

/**
 * Determines whether a variable definition should be ignored based on its type.
 * @param {Object} def
 * @param {Object} config
 * @returns {boolean}
 */
function shouldIgnoreDefinition(def, config) {
    if (isArrayDestructureIgnored(def, config)) {
        return true;
    }
    switch (def.type) {
        case "CatchClause":
            return config.caughtErrors === "none";
        case "Parameter":
            if (config.args === "none") {
                return true;
            }
            if (config.argsIgnorePattern?.test(def.name.name)) {
                return true;
            }
            if (
                config.args === "after-used" &&
                astUtils.isFunction(def.name.parent) &&
                !isAfterLastUsedArg(def.variable, config, sourceCode)
            ) {
                return true;
            }
            return false;
        default:
            return config.varsIgnorePattern?.test(def.name.name) ?? false;
    }
}

/**
 * Checks whether a variable has a rest‑spread sibling.
 * @param {Variable} variable
 * @param {Object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
    if (!config.ignoreRestSiblings) {
        return false;
    }
    const hasRestSiblingDefinition = variable.defs.some(def =>
        hasRestSibling(def.name.parent),
    );
    const hasRestSiblingReference = variable.references.some(ref =>
        hasRestSibling(ref.identifier.parent),
    );
    return hasRestSiblingDefinition || hasRestSiblingReference;
}

/**
 * Determines if a node is a sibling of a rest property.
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
 * Checks whether a reference is a read operation.
 * @param {Reference} ref
 * @returns {boolean}
 */
function isReadRef(ref) {
    return ref.isRead();
}

/**
 * Determines if a reference is a self‑reference inside one of the given function nodes.
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
 * Checks whether a variable is exported.
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
 * Checks whether a variable uses explicit resource management.
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
 * Determines if a node is inside another node.
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
        const isLast = parent.expressions.at(-1) === node;
        return !isLast && isUnusedExpression(parent);
    }
    return false;
}

/**
 * Retrieves the right‑hand side node of an assignment, if applicable.
 * @param {Reference} ref
 * @param {ASTNode|null} prevRhsNode
 * @returns {ASTNode|null}
 */
function getRhsNode(ref, prevRhsNode) {
    const id = ref.identifier;
    const parent = id.parent;
    const refScope = ref.from.variableScope;
    const varScope = ref.resolved.scope.variableScope;
    const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

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
 * Determines whether a function node can be stored for later use.
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
 * Checks whether an identifier is inside a storable function.
 * @param {ASTNode} id
 * @param {ASTNode} rhsNode
 * @returns {boolean}
 */
function isInsideOfStorableFunction(id, rhsNode) {
    const funcNode = astUtils.getUpperFunction(id);
    return (
        funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode)
    );
}

/**
 * Determines if a reference reads its own value for an update.
 * @param {Reference} ref
 * @param {ASTNode|null} rhsNode
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
            (rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)))
    );
}

/**
 * Determines if a reference is used in a for‑in/of loop that returns.
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
    if (target.body.type === "BlockStatement") {
        target = target.body.body[0];
    } else {
        target = target.body;
    }
    if (!target) {
        return false;
    }
    return target.type === "ReturnStatement";
}

/**
 * Determines whether a variable is used.
 * @param {Variable} variable
 * @param {Object} config
 * @returns {boolean}
 */
function isUsedVariable(variable, config) {
    if (variable.eslintUsed) {
        return true;
    }

    const functionNodes = getFunctionDefinitions(variable);
    const isFunctionDef = functionNodes.length > 0;
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
            !(isFunctionDef && isSelfReference(ref, functionNodes))
        );
    });
}

/**
 * Retrieves function definitions associated with a variable.
 * @param {Variable} variable
 * @returns {ASTNode[]}
 */
function getFunctionDefinitions(variable) {
    const defs = [];
    variable.defs.forEach(def => {
        if (def.type === "FunctionName") {
            defs.push(def.node);
        } else if (
            def.type === "Variable" &&
            def.node.init &&
            (def.node.init.type === "FunctionExpression" ||
                def.node.init.type === "ArrowFunctionExpression")
        ) {
            defs.push(def.node.init);
        }
    });
    return defs;
}

/**
 * Checks whether a parameter is after the last used argument.
 * @param {Variable} variable
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isAfterLastUsedArg(variable, config, sourceCode) {
    const def = variable.defs[0];
    const params = sourceCode.getDeclaredVariables(def.node);
    const posterior = params.slice(params.indexOf(variable) + 1);
    return !posterior.some(v => v.references.length > 0 || v.eslintUsed);
}

/**
 * Collects unused variables from a scope and its children.
 * @param {Scope} scope
 * @param {Variable[]} unusedVars
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @returns {Variable[]}
 */
function collectUnusedVariables(scope, unusedVars, config, sourceCode) {
    if (scope.type !== "global" && config.vars !== "all") {
        // nothing to collect in this branch
    }

    if (scope.type !== "global" || config.vars === "all") {
        for (const variable of scope.variables) {
            if (shouldSkipVariable(variable, config, sourceCode)) {
                continue;
            }

            const used = isUsedVariable(variable, config);
            const exported = isExported(variable);
            const usingDecl = config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable);
            const restSibling = hasRestSpreadSibling(variable, config);

            if (!used && !exported && !usingDecl && !restSibling) {
                unusedVars.push(variable);
            }
        }
    }

    for (const child of scope.childScopes) {
        collectUnusedVariables(child, unusedVars, config, sourceCode);
    }

    return unusedVars;
}

/**
 * Determines whether a variable should be skipped during collection.
 * @param {Variable} variable
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function shouldSkipVariable(variable, config, sourceCode) {
    // class name inside its own class scope
    if (
        variable.scope.type === "class" &&
        variable.scope.block.id === variable.identifiers[0]
    ) {
        return true;
    }

    // function expression names
    if (variable.scope.functionExpressionScope) {
        return true;
    }

    // variables marked as used via `markVariableAsUsed`
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
        return true;
    }

    // implicit "arguments"
    if (
        variable.scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
    ) {
        return true;
    }

    const def = variable.defs[0];
    if (!def) {
        return false;
    }

    // array destructuring ignore pattern
    if (
        (def.name.parent.type === "ArrayPattern" ||
            variable.references.some(ref => ref.identifier.parent.type === "ArrayPattern")) &&
        config.destructuredArrayIgnorePattern?.test(def.name.name)
    ) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable, config)) {
            context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(variable, "array-destructure"),
            });
        }
        return true;
    }

    // class static block ignore
    if (def.type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(
            node => node.type === "StaticBlock",
        );
        if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
            return true;
        }
    }

    // catch clause handling
    if (def.type === "CatchClause") {
        if (config.caughtErrors === "none") {
            return true;
        }
        if (
            config.caughtErrorsIgnorePattern?.test(def.name.name) &&
            config.reportUsedIgnorePattern &&
            isUsedVariable(variable, config)
        ) {
            context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(variable, "catch-clause"),
            });
        }
        return config.caughtErrorsIgnorePattern?.test(def.name.name) ?? false;
    }

    // parameter handling
    if (def.type === "Parameter") {
        if (
            (def.node.parent.type === "Property" ||
                def.node.parent.type === "MethodDefinition") &&
            def.node.parent.kind === "set"
        ) {
            return true;
        }
        if (config.args === "none") {
            return true;
        }
        if (
            config.argsIgnorePattern?.test(def.name.name) &&
            config.reportUsedIgnorePattern &&
            isUsedVariable(variable, config)
        ) {
            context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(variable, "parameter"),
            });
        }
        return config.argsIgnorePattern?.test(def.name.name) ?? false;
    }

    // generic variable ignore pattern
    if (
        config.varsIgnorePattern?.test(def.name.name) &&
        config.reportUsedIgnorePattern &&
        isUsedVariable(variable, config)
    ) {
        context.report({
            node: def.name,
            messageId: "usedIgnoredVar",
            data: getUsedIgnoredMessageData(variable, "variable"),
        });
    }
    return config.varsIgnorePattern?.test(def.name.name) ?? false;
}

/**
 * Generates message data for a defined but unused variable.
 * @param {Variable} unusedVar
 * @param {Object} config
 * @returns {UnusedVarMessageData}
 */
function getDefinedMessageData(unusedVar, config) {
    const def = unusedVar.defs && unusedVar.defs[0];
    let additional = "";
    if (def) {
        const [desc, pattern] = getVariableDescription(
            defToVariableType(def, config),
            config,
        );
        if (pattern && desc) {
            additional = `. Allowed unused ${desc} must match ${pattern}`;
        }
    }
    return {
        varName: unusedVar.name,
        action: "defined",
        additional,
    };
}

/**
 * Generates message data for an assigned but unused variable.
 * @param {Variable} unusedVar
 * @param {Object} config
 * @returns {UnusedVarMessageData}
 */
function getAssignedMessageData(unusedVar, config) {
    const def = unusedVar.defs && unusedVar.defs[0];
    let additional = "";
    if (def) {
        const [desc, pattern] = getVariableDescription(
            defToVariableType(def, config),
            config,
        );
        if (pattern && desc) {
            additional = `. Allowed unused ${desc} must match ${pattern}`;
        }
    }
    return {
        varName: unusedVar.name,
        action: "assigned a value",
        additional,
    };
}

/**
 * Generates message data for a used ignored variable.
 * @param {Variable} variable
 * @param {VariableType} variableType
 * @param {Object} config
 * @returns {UsedIgnoredVarMessageData}
 */
function getUsedIgnoredMessageData(variable, variableType, config) {
    const [desc, pattern] = getVariableDescription(variableType, config);
    let additional = "";
    if (pattern && desc) {
        additional = `. Used ${desc} must not match ${pattern}`;
    }
    return {
        varName: variable.name,
        additional,
    };
}

/**
 * Returns a description and pattern for a variable type.
 * @param {VariableType} variableType
 * @param {Object} config
 * @returns {[string|undefined, string|undefined]}
 */
function getVariableDescription(variableType, config) {
    switch (variableType) {
        case "array-destructure":
            return [
                "elements of array destructuring",
                config.destructuredArrayIgnorePattern?.toString(),
            ];
        case "catch-clause":
            return [
                "caught errors",
                config.caughtErrorsIgnorePattern?.toString(),
            ];
        case "parameter":
            return ["args", config.argsIgnorePattern?.toString()];
        case "variable":
            return ["vars", config.varsIgnorePattern?.toString()];
        default:
            throw new Error(`Unexpected variable type: ${variableType}`);
    }
}

/**
 * Maps a definition to a simple variable type.
 * @param {Object} def
 * @param {Object} config
 * @returns {VariableType}
 */
function defToVariableType(def, config) {
    if (isArrayDestructureIgnored(def, config)) {
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
 * Handles all fix‑generation logic for an unused variable.
 * @param {RuleFixer} fixer
 * @param {Variable} unusedVar
 * @param {SourceCode} sourceCode
 * @returns {RuleFix|null}
 */
function handleFixes(fixer, unusedVar, sourceCode) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);
    const allWriteRefs = unusedVar.references.filter(ref => ref.isWrite());

    // Guard: if any write reference does not belong to the identifier itself, abort.
    if (
        allWriteRefs.some(ref => ref.identifier.range[0] !== id.range[0])
    ) {
        return null;
    }

    // Helper factories used only inside this function
    const getPrevStart = (node, skips = 0) =>
        sourceCode.getTokenBefore(node, skips).range[0];
    const getNextEnd = (node, skips = 0) =>
        sourceCode.getTokenAfter(node, skips).range[1];
    const tokenValue = node => sourceCode.getTokenAfter(node).value;
    const tokenBeforeValue = node => sourceCode.getTokenBefore(node).value;
    const tokenAfterValue = node => sourceCode.getTokenAfter(node).value;

    // Early returns for simple cases
    if (parent.type === "VariableDeclarator") {
        return fixVariableDeclarator(parent, tokenBefore, tokenAfter);
    }
    if (parent.parent.type === "ObjectPattern") {
        return fixObjectPattern(parent, tokenBefore);
    }
    if (parent.type === "ArrayPattern") {
        return fixArrayPattern(parent, tokenBefore, tokenAfter);
    }
    if (parent.type === "RestElement") {
        return fixRestElement(parent, tokenBefore, tokenAfter);
    }
    if (parent.type === "AssignmentPattern") {
        return fixAssignmentPattern(parent, tokenBefore, tokenAfter);
    }
    if (parent.type === "FunctionDeclaration" && parent.id === id) {
        return fixer.removeRange(parent.range);
    }
    if (parent.type === "ImportDefaultSpecifier") {
        return fixImportDefaultSpecifier(parent, tokenAfter);
    }
    if (parent.type === "ImportSpecifier") {
        return fixImportSpecifier(parent, tokenBefore, tokenAfter);
    }
    if (parent.type === "ImportNamespaceSpecifier") {
        return fixImportNamespaceSpecifier(parent);
    }
    if (parent.type === "CatchClause") {
        return null;
    }
    if (parent.type === "ClassDeclaration") {
        return fixer.removeRange(parent.range);
    }
    if (tokenBefore?.value === ",") {
        return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
    }
    if (tokenAfter.value === ",") {
        if (tokenBefore.value === "(") {
            return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        }
        if (tokenBefore.value === "{") {
            return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        }
    }
    if (
        parent.type === "ArrowFunctionExpression" &&
        parent.params.length === 1 &&
        tokenAfter?.value !== ")"
    ) {
        return fixer.replaceText(id, "()");
    }

    return fixer.removeRange(id.range);

    // ----------------------------------------------------------------------
    // Fix sub‑routines (each shallow, no deep nesting)
    // ----------------------------------------------------------------------

    function fixVariableDeclarator(node, beforeTok, afterTok) {
        if (node.parent.declarations.length === 1) {
            if (
                isLoop(node.parent.parent) &&
                node.parent.parent.body !== node.parent
            ) {
                return null;
            }
            if (
                node.parent.parent.type === "IfStatement" ||
                isLoop(node.parent.parent) ||
                (node.parent.parent.type === "WithStatement" &&
                    node.parent.parent.body === node.parent)
            ) {
                return fixer.replaceText(node.parent, ";");
            }
            if (isDeclarationNotSafeToRemove(afterTok, beforeTok)) {
                return null;
            }
            return fixer.removeRange(node.parent.range);
        }

        if (beforeTok.value === ",") {
            return fixer.removeRange([
                getPrevStart(node),
                node.range[1],
            ]);
        }

        return fixer.removeRange([
            node.range[0],
            getNextEnd(node),
        ]);
    }

    function fixObjectPattern(node, beforeTok) {
        const parentNode = node.parent;
        if (parentNode.parent.type === "RestElement") {
            return fixRestInPattern(parentNode.parent);
        }
        if (parentNode.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(parentNode);
        }
        if (parentNode.properties.length === 1) {
            return fixVariables(parentNode);
        }
        if (beforeTok.value === ":") {
            if (
                tokenBeforeValue(parentNode) === "{" &&
                tokenAfterValue(parentNode) === ","
            ) {
                return fixer.removeRange([
                    parentNode.range[0],
                    getNextEnd(parentNode),
                ]);
            }
            return fixer.removeRange([
                getPrevStart(parentNode),
                node.range[1],
            ]);
        }
        return null;
    }

    function fixArrayPattern(node, beforeTok, afterTok) {
        if (hasSingleElement(node)) {
            if (node.parent.type === "RestElement") {
                return fixRestInPattern(node.parent);
            }
            if (node.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(node.parent);
            }
            return fixVariables(node);
        }
        if (beforeTok.value === "," && afterTok.value === ",") {
            return fixer.removeRange(id.range);
        }
        return null;
    }

    function fixRestElement(node, beforeTok, afterTok) {
        if (node.parent.type === "ArrayPattern") {
            if (hasSingleElement(node.parent)) {
                if (node.parent.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(node.parent);
                }
                return fixVariables(node.parent);
            }
            return fixer.removeRange([
                getPrevStart(id, 1),
                id.range[1],
            ]);
        }
        if (node.parent.type === "ObjectPattern") {
            if (node.parent.properties.length === 1) {
                return fixVariables(node.parent);
            }
            return fixer.removeRange([
                getPrevStart(id, 1),
                id.range[1],
            ]);
        }
        if (isFunction(node.parent)) {
            if (node.parent.params.length === 1) {
                return fixer.removeRange(node.range);
            }
            return fixer.removeRange([
                getPrevStart(node),
                node.range[1],
            ]);
        }
        return null;
    }

    function fixAssignmentPattern(node, beforeTok, afterTok) {
        if (node.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(node);
        }
        if (node.parent.parent.type === "ObjectPattern") {
            if (node.parent.parent.properties.length === 1) {
                if (node.parent.parent.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(node.parent.parent);
                }
                return fixVariables(node.parent.parent);
            }
            if (
                tokenBeforeValue(node.parent) === "{" &&
                tokenAfterValue(node.parent) === ","
            ) {
                return fixer.removeRange([
                    node.parent.range[0],
                    getNextEnd(node.parent),
                ]);
            }
            return fixer.removeRange([
                getPrevStart(node.parent),
                node.parent.range[1],
            ]);
        }
        if (isFunction(node.parent)) {
            return fixFunctionParameters(node);
        }
        return null;
    }

    function fixImportDefaultSpecifier(node, afterTok) {
        const hasOtherSpecifiers =
            hasImportOfCertainType(node.parent, "ImportSpecifier") ||
            hasImportOfCertainType(node.parent, "ImportNamespaceSpecifier");
        if (!hasOtherSpecifiers) {
            return fixer.removeRange([
                node.range[0],
                node.parent.source.range[0],
            ]);
        }
        return fixer.removeRange([node.id.range[0], afterTok.range[1]]);
    }

    function fixImportSpecifier(node, beforeTok, afterTok) {
        const specifiers = node.parent.specifiers.filter(
            e => e.type === "ImportSpecifier",
        );
        if (specifiers.length === 1) {
            if (
                !hasImportOfCertainType(node.parent, "ImportDefaultSpecifier")
            ) {
                return fixer.removeRange(node.parent.range);
            }
            return fixer.removeRange([
                getPrevStart(node, 1),
                afterTok.range[1],
            ]);
        }
        if (beforeTok.value === "{") {
            return fixer.removeRange([
                node.range[0],
                getNextEnd(node),
            ]);
        }
        return fixer.removeRange([
            getPrevStart(node),
            node.range[1],
        ]);
    }

    function fixImportNamespaceSpecifier(node) {
        if (
            hasImportOfCertainType(node.parent, "ImportDefaultSpecifier")
        ) {
            return fixer.removeRange([
                getPrevStart(node),
                node.range[1],
            ]);
        }
        return fixer.removeRange([
            node.range[0],
            node.parent.source.range[0],
        ]);
    }

    function fixFunctionParameters(node) {
        const parentNode = node.parent;
        if (!isFunction(parentNode)) {
            return null;
        }
        if (parentNode.params.length === 1) {
            return fixer.removeRange(node.range);
        }
        if (tokenBeforeValue(node) === "(" && tokenAfterValue(node) === ",") {
            return fixer.removeRange([
                node.range[0],
                getNextEnd(node),
            ]);
        }
        return fixer.removeRange([
            getPrevStart(node),
            node.range[1],
        ]);
    }

    function fixVariables(node) {
        const parentNode = node.parent;
        if (parentNode.type === "VariableDeclarator") {
            return fixVariableDeclarator(parentNode, tokenBefore, tokenAfter);
        }
        if (tokenBeforeValue(node) === ":") {
            if (parentNode.parent.type === "ObjectPattern") {
                return fixObjectWithValueSeparator(node);
            }
        }
        return fixFunctionParameters(node);
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
            if (tokenBeforeValue(parentNode) === "{") {
                return fixer.removeRange([
                    parentNode.range[0],
                    getNextEnd(parentNode),
                ]);
            }
            return fixer.removeRange([
                getPrevStart(parentNode),
                parentNode.range[1],
            ]);
        }
        return null;
    }

    function fixNestedArrayVariable(node) {
        const parentNode = node.parent;
        if (
            parentNode.parent.type === "ArrayPattern" &&
            hasSingleElement(parentNode)
        ) {
            return fixNestedArrayVariable(parentNode);
        }
        if (hasSingleElement(parentNode)) {
            if (tokenBeforeValue(parentNode) === ":") {
                return fixVariables(parentNode);
            }
            if (parentNode.parent.type === "RestElement") {
                return fixRestInPattern(parentNode.parent);
            }
            return fixVariables(parentNode);
        }
        if (
            tokenBeforeValue(node) === "," &&
            tokenAfterValue(node) === "]"
        ) {
            return fixer.removeRange([
                getPrevStart(node),
                node.range[1],
            ]);
        }
        return fixer.removeRange(node.range);
    }

    function fixRestInPattern(node) {
        const parentNode = node.parent;
        if (isFunction(parentNode)) {
            if (parentNode.params.length === 1) {
                return fixer.removeRange(node.range);
            }
            return fixer.removeRange([
                getPrevStart(node),
                node.range[1],
            ]);
        }
        if (parentNode.type === "ArrayPattern") {
            if (hasSingleElement(parentNode)) {
                if (parentNode.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(parentNode);
                }
                return fixVariables(parentNode);
            }
            return fixer.removeRange([
                getPrevStart(node),
                node.range[1],
            ]);
        }
        return null;
    }

    function hasSingleElement(node) {
        return node.elements.filter(e => e !== null).length === 1;
    }

    function hasImportOfCertainType(node, type) {
        return node.specifiers.some(e => e.type === type);
    }

    function isDeclarationNotSafeToRemove(nextTok, prevTok) {
        return (
            nextTok.type === "String" ||
            (prevTok &&
                !astUtils.isSemicolonToken(prevTok) &&
                !astUtils.isOpeningBraceToken(prevTok))
        );
    }

    function isLoop(node) {
        return astUtils.isLoop(node);
    }

    function isFunction(node) {
        return astUtils.isFunction(node);
    }
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

        const config = {
            vars: "all",
            args: "after-used",
            ignoreRestSiblings: false,
            caughtErrors: "all",
            ignoreClassWithStaticInitBlock: false,
            ignoreUsingDeclarations: false,
            reportUsedIgnorePattern: false,
        };

        const firstOption = context.options[0];
        if (firstOption) {
            if (typeof firstOption === "string") {
                config.vars = firstOption;
            } else {
                Object.assign(config, {
                    vars: firstOption.vars || config.vars,
                    args: firstOption.args || config.args,
                    ignoreRestSiblings:
                        firstOption.ignoreRestSiblings ?? config.ignoreRestSiblings,
                    caughtErrors:
                        firstOption.caughtErrors ?? config.caughtErrors,
                    ignoreClassWithStaticInitBlock:
                        firstOption.ignoreClassWithStaticInitBlock ??
                        config.ignoreClassWithStaticInitBlock,
                    ignoreUsingDeclarations:
                        firstOption.ignoreUsingDeclarations ??
                        config.ignoreUsingDeclarations,
                    reportUsedIgnorePattern:
                        firstOption.reportUsedIgnorePattern ??
                        config.reportUsedIgnorePattern,
                });

                if (firstOption.varsIgnorePattern) {
                    config.varsIgnorePattern = new RegExp(
                        firstOption.varsIgnorePattern,
                        "u",
                    );
                }
                if (firstOption.argsIgnorePattern) {
                    config.argsIgnorePattern = new RegExp(
                        firstOption.argsIgnorePattern,
                        "u",
                    );
                }
                if (firstOption.caughtErrorsIgnorePattern) {
                    config.caughtErrorsIgnorePattern = new RegExp(
                        firstOption.caughtErrorsIgnorePattern,
                        "u",
                    );
                }
                if (firstOption.destructuredArrayIgnorePattern) {
                    config.destructuredArrayIgnorePattern = new RegExp(
                        firstOption.destructuredArrayIgnorePattern,
                        "u",
                    );
                }
            }
        }

        return {
            "Program:exit"(programNode) {
                const unusedVars = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    [],
                    config,
                    sourceCode,
                );

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        const writeRefs = unusedVar.references.filter(
                            ref =>
                                ref.isWrite() &&
                                ref.from.variableScope ===
                                    unusedVar.scope.variableScope,
                        );
                        const lastWrite = writeRefs.at(-1);
                        context.report({
                            node: lastWrite
                                ? lastWrite.identifier
                                : unusedVar.identifiers[0],
                            messageId: "unusedVar",
                            data: unusedVar.references.some(ref => ref.isWrite())
                                ? getAssignedMessageData(unusedVar, config)
                                : getDefinedMessageData(unusedVar, config),
                            suggest: [
                                {
                                    messageId: "removeVar",
                                    data: { varName: unusedVar.name },
                                    fix(fixer) {
                                        return handleFixes(
                                            fixer,
                                            unusedVar,
                                            sourceCode,
                                        );
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
                            data: getDefinedMessageData(unusedVar, config),
                        });
                    }
                }
            },
        };
    },
};
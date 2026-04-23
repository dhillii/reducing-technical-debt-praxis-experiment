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
// Helpers extracted to reduce cognitive complexity
//------------------------------------------------------------------------------

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

/**
 * Determines if a given variable is being exported from a module.
 */
function isExported(variable) {
    const definition = variable.defs[0];
    if (!definition) return false;
    let node = definition.node;
    if (node.type === "VariableDeclarator") node = node.parent;
    else if (definition.type === "Parameter") return false;
    return node.parent.type.indexOf("Export") === 0;
}

/**
 * Determines if a given variable uses the explicit resource management protocol.
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
 */
function hasRestSpreadSibling(variable, config) {
    if (!config.ignoreRestSiblings) return false;
    const hasRestSiblingDefinition = variable.defs.some(def =>
        hasRestSibling(def.name.parent)
    );
    const hasRestSiblingReference = variable.references.some(ref =>
        hasRestSibling(ref.identifier.parent)
    );
    return hasRestSiblingDefinition || hasRestSiblingReference;
}

/**
 * Determines if a reference is a read operation.
 */
function isReadRef(ref) {
    return ref.isRead();
}

/**
 * Determine if an identifier is a self-reference.
 */
function isSelfReference(ref, nodes) {
    let scope = ref.from;
    while (scope) {
        if (nodes.includes(scope.block)) return true;
        scope = scope.upper;
    }
    return false;
}

/**
 * Gets function definition nodes for a variable.
 */
function getFunctionDefinitions(variable) {
    const defs = [];
    variable.defs.forEach(def => {
        if (def.type === "FunctionName") defs.push(def.node);
        if (
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
 * Checks whether inner node is inside outer node.
 */
function isInside(inner, outer) {
    return (
        inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1]
    );
}

/**
 * Checks whether a node is an unused expression.
 */
function isUnusedExpression(node) {
    const parent = node.parent;
    if (parent.type === "ExpressionStatement") return true;
    if (parent.type === "SequenceExpression") {
        const isLast = parent.expressions.at(-1) === node;
        return !isLast && isUnusedExpression(parent);
    }
    return false;
}

/**
 * Gets RHS node of an assignment if applicable.
 */
function getRhsNode(ref, prevRhsNode, sourceCode) {
    const id = ref.identifier;
    const parent = id.parent;
    const refScope = ref.from.variableScope;
    const varScope = ref.resolved.scope.variableScope;
    const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

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
 * Checks whether a function node is stored somewhere.
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
 * Checks whether an identifier is inside a storable function.
 */
function isInsideOfStorableFunction(id, rhsNode) {
    const funcNode = astUtils.getUpperFunction(id);
    return (
        funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode)
    );
}

/**
 * Checks whether a reference reads itself.
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
 * Determines if a reference is used in a for‑in/of loop.
 */
function isForInOfRef(ref) {
    let target = ref.identifier.parent;
    if (target.type === "VariableDeclarator") target = target.parent.parent;
    if (target.type !== "ForInStatement" && target.type !== "ForOfStatement")
        return false;
    if (target.body.type === "BlockStatement") target = target.body.body[0];
    else target = target.body;
    if (!target) return false;
    return target.type === "ReturnStatement";
}

/**
 * Determines if a variable is used.
 */
function isUsedVariable(variable) {
    if (variable.eslintUsed) return true;
    const functionNodes = getFunctionDefinitions(variable);
    const isFunctionDef = functionNodes.length > 0;
    let rhsNode = null;
    return variable.references.some(ref => {
        if (isForInOfRef(ref)) return true;
        const forItself = isReadForItself(ref, rhsNode);
        rhsNode = getRhsNode(ref, rhsNode, sourceCode);
        return (
            isReadRef(ref) &&
            !forItself &&
            !(isFunctionDef && isSelfReference(ref, functionNodes))
        );
    });
}

/**
 * Checks whether a parameter is after the last used argument.
 */
function isAfterLastUsedArg(variable, sourceCode) {
    const def = variable.defs[0];
    const params = sourceCode.getDeclaredVariables(def.node);
    const posterior = params.slice(params.indexOf(variable) + 1);
    return !posterior.some(v => v.references.length > 0 || v.eslintUsed);
}

/**
 * Determines variable description and ignore pattern.
 */
function getVariableDescription(variableType, config) {
    let pattern, description;
    switch (variableType) {
        case "array-destructure":
            pattern = config.destructuredArrayIgnorePattern;
            description = "elements of array destructuring";
            break;
        case "catch-clause":
            pattern = config.caughtErrorsIgnorePattern;
            description = "caught errors";
            break;
        case "parameter":
            pattern = config.argsIgnorePattern;
            description = "args";
            break;
        case "variable":
            pattern = config.varsIgnorePattern;
            description = "vars";
            break;
        default:
            throw new Error(`Unexpected variable type: ${variableType}`);
    }
    if (pattern) pattern = pattern.toString();
    return [description, pattern];
}

/**
 * Determines variable type from definition.
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
 * Message data generators.
 */
function getDefinedMessageData(unusedVar, config) {
    const def = unusedVar.defs && unusedVar.defs[0];
    let additional = "";
    if (def) {
        const [desc, pat] = getVariableDescription(
            defToVariableType(def, config),
            config
        );
        if (pat && desc) {
            additional = `. Allowed unused ${desc} must match ${pat}`;
        }
    }
    return { varName: unusedVar.name, action: "defined", additional };
}

function getAssignedMessageData(unusedVar, config) {
    const def = unusedVar.defs && unusedVar.defs[0];
    let additional = "";
    if (def) {
        const [desc, pat] = getVariableDescription(
            defToVariableType(def, config),
            config
        );
        if (pat && desc) {
            additional = `. Allowed unused ${desc} must match ${pat}`;
        }
    }
    return { varName: unusedVar.name, action: "assigned a value", additional };
}

function getUsedIgnoredMessageData(variable, variableType, config) {
    const [desc, pat] = getVariableDescription(variableType, config);
    let additional = "";
    if (pat && desc) additional = `. Used ${desc} must not match ${pat}`;
    return { varName: variable.name, additional };
}

/**
 * Token utilities for fixes.
 */
function getPreviousTokenStart(sourceCode, node, skips = 0) {
    return sourceCode.getTokenBefore(node, skips).range[0];
}
function getNextTokenEnd(sourceCode, node, skips = 0) {
    return sourceCode.getTokenAfter(node, skips).range[1];
}
function getTokenBeforeValue(sourceCode, node) {
    return sourceCode.getTokenBefore(node).value;
}
function getTokenAfterValue(sourceCode, node) {
    return sourceCode.getTokenAfter(node).value;
}
function hasSingleElement(node) {
    return node.elements.filter(e => e !== null).length === 1;
}
function hasImportOfCertainType(node, type) {
    return node.specifiers.some(e => e.type === type);
}
function isDeclarationNotSafeToRemove(sourceCode, nextToken, prevToken) {
    return (
        nextToken.type === "String" ||
        (prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken))
    );
}

/**
 * Fix helpers (each returns a fixer or null).
 */
function fixFunctionParameters(sourceCode, fixer, node) {
    const parent = node.parent;
    if (!astUtils.isFunction(parent)) return null;
    if (parent.params.length === 1) return fixer.removeRange(node.range);
    if (getTokenBeforeValue(sourceCode, node) === "(" && getTokenAfterValue(sourceCode, node) === ",") {
        return fixer.removeRange([node.range[0], getNextTokenEnd(sourceCode, node)]);
    }
    return fixer.removeRange([getPreviousTokenStart(sourceCode, node), node.range[1]]);
}
function fixVariables(sourceCode, fixer, node) {
    const parent = node.parent;
    if (parent.type === "VariableDeclarator") {
        if (astUtils.isLoop(parent.parent.parent)) return null;
        if (parent.parent.declarations.length === 1) {
            const next = sourceCode.getTokenAfter(parent.parent);
            const prev = sourceCode.getTokenBefore(parent.parent);
            if (next && isDeclarationNotSafeToRemove(sourceCode, next, prev)) return null;
            return fixer.removeRange(parent.parent.range);
        }
        if (getTokenBeforeValue(sourceCode, parent) === ",") {
            return fixer.removeRange([getPreviousTokenStart(sourceCode, parent), parent.range[1]]);
        }
        return fixer.removeRange([parent.range[0], getNextTokenEnd(sourceCode, parent)]);
    }
    if (getTokenBeforeValue(sourceCode, node) === ":") {
        if (parent.parent.type === "ObjectPattern") {
            return fixObjectWithValueSeparator(sourceCode, fixer, node);
        }
    }
    return fixFunctionParameters(sourceCode, fixer, node);
}
function fixNestedObjectVariable(sourceCode, fixer, node) {
    const parent = node.parent;
    if (parent.parent.parent.parent.type === "ObjectPattern" && parent.parent.properties.length === 1) {
        return fixNestedObjectVariable(sourceCode, fixer, parent.parent);
    }
    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) return fixVariables(sourceCode, fixer, parent.parent);
        if (getTokenBeforeValue(sourceCode, parent) === "{") {
            return fixer.removeRange([parent.range[0], getNextTokenEnd(sourceCode, parent)]);
        }
        return fixer.removeRange([getPreviousTokenStart(sourceCode, parent), parent.range[1]]);
    }
    return null;
}
function fixNestedArrayVariable(sourceCode, fixer, node) {
    const parent = node.parent;
    if (parent.parent.type === "ArrayPattern" && hasSingleElement(parent)) {
        return fixNestedArrayVariable(sourceCode, fixer, parent);
    }
    if (hasSingleElement(parent)) {
        if (getTokenBeforeValue(sourceCode, parent) === ":") return fixVariables(sourceCode, fixer, parent);
        if (parent.parent.type === "RestElement") return fixRestInPattern(sourceCode, fixer, parent.parent);
        return fixVariables(sourceCode, fixer, parent);
    }
    if (getTokenBeforeValue(sourceCode, node) === "," && getTokenAfterValue(sourceCode, node) === "]") {
        return fixer.removeRange([getPreviousTokenStart(sourceCode, node), node.range[1]]);
    }
    return fixer.removeRange(node.range);
}
function fixObjectWithValueSeparator(sourceCode, fixer, node) {
    const parent = node.parent.parent;
    if (parent.parent.type === "ArrayPattern" && parent.properties.length === 1) {
        return fixNestedArrayVariable(sourceCode, fixer, parent);
    }
    return fixNestedObjectVariable(sourceCode, fixer, node);
}
function fixRestInPattern(sourceCode, fixer, node) {
    const parent = node.parent;
    if (astUtils.isFunction(parent)) {
        if (parent.params.length === 1) return fixer.removeRange(node.range);
        return fixer.removeRange([getPreviousTokenStart(sourceCode, node), node.range[1]]);
    }
    if (parent.type === "ArrayPattern") {
        if (hasSingleElement(parent)) {
            if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(sourceCode, fixer, parent);
            return fixVariables(sourceCode, fixer, parent);
        }
        return fixer.removeRange([getPreviousTokenStart(sourceCode, node), node.range[1]]);
    }
    return null;
}

/**
 * Main fix dispatcher.
 */
function handleFixes(sourceCode, fixer, unusedVar) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const parentType = parent.type;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);
    const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

    if (allWriteRefs.some(ref => ref.identifier.range[0] !== id.range[0])) return null;

    // VariableDeclarator handling
    if (parentType === "VariableDeclarator") {
        if (parent.parent.declarations.length === 1) {
            if (astUtils.isLoop(parent.parent.parent) && parent.parent.parent.body !== parent.parent) return null;
            if (
                parent.parent.parent.type === "IfStatement" ||
                astUtils.isLoop(parent.parent.parent) ||
                (parent.parent.parent.type === "WithStatement" && parent.parent.parent.body === parent.parent)
            ) {
                return fixer.replaceText(parent.parent, ";");
            }
            const next = sourceCode.getTokenAfter(parent.parent);
            const prev = sourceCode.getTokenBefore(parent.parent);
            if (next && isDeclarationNotSafeToRemove(sourceCode, next, prev)) return null;
            return fixer.removeRange(parent.parent.range);
        }
        if (tokenBefore.value === ",") {
            return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
        }
        return fixer.removeRange([parent.range[0], getNextTokenEnd(sourceCode, parent)]);
    }

    // ObjectPattern handling
    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) {
            if (parent.parent.parent.type === "RestElement") return fixRestInPattern(sourceCode, fixer, parent.parent.parent);
            if (parent.parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(sourceCode, fixer, parent.parent);
            return fixVariables(sourceCode, fixer, parent.parent);
        }
        if (tokenBefore.value === ":") {
            if (getTokenBeforeValue(sourceCode, parent) === "{" && getTokenAfterValue(sourceCode, parent) === ",") {
                return fixer.removeRange([parent.range[0], getNextTokenEnd(sourceCode, parent)]);
            }
            return fixer.removeRange([getPreviousTokenStart(sourceCode, parent), id.range[1]]);
        }
    }

    // ArrayPattern handling
    if (parentType === "ArrayPattern") {
        if (hasSingleElement(parent)) {
            if (parent.parent.type === "RestElement") return fixRestInPattern(sourceCode, fixer, parent.parent);
            if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(sourceCode, fixer, parent);
            return fixVariables(sourceCode, fixer, parent);
        }
        if (tokenBefore.value === "," && tokenAfter.value === ",") {
            return fixer.removeRange(id.range);
        }
    }

    // RestElement handling
    if (parentType === "RestElement") {
        if (parent.parent.type === "ArrayPattern") {
            if (hasSingleElement(parent.parent)) {
                if (parent.parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(sourceCode, fixer, parent.parent);
                return fixVariables(sourceCode, fixer, parent.parent);
            }
            return fixer.removeRange([getPreviousTokenStart(sourceCode, id, 1), id.range[1]]);
        }
        if (parent.parent.type === "ObjectPattern") {
            if (parent.parent.properties.length === 1) return fixVariables(sourceCode, fixer, parent.parent);
            return fixer.removeRange([getPreviousTokenStart(sourceCode, id, 1), id.range[1]]);
        }
        if (astUtils.isFunction(parent.parent)) {
            if (parent.parent.params.length === 1) return fixer.removeRange(parent.range);
            return fixer.removeRange([getPreviousTokenStart(sourceCode, parent), parent.range[1]]);
        }
    }

    // AssignmentPattern handling
    if (parentType === "AssignmentPattern") {
        if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(sourceCode, fixer, parent);
        if (parent.parent.parent.type === "ObjectPattern") {
            if (parent.parent.parent.properties.length === 1) {
                if (parent.parent.parent.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(sourceCode, fixer, parent.parent.parent);
                }
                return fixVariables(sourceCode, fixer, parent.parent.parent);
            }
            if (getTokenBeforeValue(sourceCode, parent.parent) === "{" && getTokenAfterValue(sourceCode, parent.parent) === ",") {
                return fixer.removeRange([parent.parent.range[0], getNextTokenEnd(sourceCode, parent.parent)]);
            }
            return fixer.removeRange([getPreviousTokenStart(sourceCode, parent.parent), parent.parent.range[1]]);
        }
        if (astUtils.isFunction(parent.parent)) return fixFunctionParameters(sourceCode, fixer, parent);
    }

    // FunctionDeclaration handling
    if (parentType === "FunctionDeclaration" && parent.id === id) return fixer.removeRange(parent.range);

    // Import handling
    if (parentType === "ImportDefaultSpecifier") {
        if (
            !hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
            !hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")
        ) {
            return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
        }
        return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
    }
    if (parentType === "ImportSpecifier") {
        const specifiers = parent.parent.specifiers.filter(e => e.type === "ImportSpecifier");
        if (specifiers.length === 1) {
            if (!hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
                return fixer.removeRange(parent.parent.range);
            }
            return fixer.removeRange([getPreviousTokenStart(sourceCode, parent, 1), tokenAfter.range[1]]);
        }
        if (getTokenBeforeValue(sourceCode, parent) === "{") {
            return fixer.removeRange([parent.range[0], getNextTokenEnd(sourceCode, parent)]);
        }
        return fixer.removeRange([getPreviousTokenStart(sourceCode, parent), parent.range[1]]);
    }
    if (parentType === "ImportNamespaceSpecifier") {
        if (hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
            return fixer.removeRange([getPreviousTokenStart(sourceCode, parent), parent.range[1]]);
        }
        return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
    }

    // CatchClause, ClassDeclaration, sequence commas, arrow functions
    if (parentType === "CatchClause") return null;
    if (parentType === "ClassDeclaration") return fixer.removeRange(parent.range);
    if (tokenBefore?.value === ",") return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
    if (tokenAfter.value === ",") {
        if (tokenBefore.value === "(") return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        if (tokenBefore.value === "{") return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
    }
    if (parentType === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfter?.value !== ")") {
        return fixer.replaceText(id, "()");
    }
    return fixer.removeRange(id.range);
}

/**
 * Determines if a variable should be ignored based on configuration.
 */
function shouldSkipVariable(variable, config, sourceCode) {
    const def = variable.defs[0];
    if (!def) return false;
    const type = def.type;
    const name = def.name.name;

    // class name in class scope
    if (variable.scope.type === "class" && variable.scope.block.id === variable.identifiers[0]) return true;

    // function expression scope
    if (variable.scope.functionExpressionScope) return true;

    // eslintUsed
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;

    // implicit arguments
    if (
        variable.scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
    ) return true;

    // destructured array ignore pattern
    if (
        (def.name.parent.type === "ArrayPattern" ||
            variable.references.some(ref => ref.identifier.parent.type === "ArrayPattern")) &&
        config.destructuredArrayIgnorePattern &&
        config.destructuredArrayIgnorePattern.test(name)
    ) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
            context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(variable, "array-destructure", config),
            });
        }
        return true;
    }

    // class static block
    if (type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(node => node.type === "StaticBlock");
        if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
    }

    // catch clause
    if (type === "CatchClause") {
        if (config.caughtErrors === "none") return true;
        if (config.caughtErrorsIgnorePattern && config.caughtErrorsIgnorePattern.test(name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "catch-clause", config),
                });
            }
            return true;
        }
    }

    // parameters
    if (type === "Parameter") {
        if (
            (def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") &&
            def.node.parent.kind === "set"
        ) {
            return true;
        }
        if (config.args === "none") return true;
        if (config.argsIgnorePattern && config.argsIgnorePattern.test(name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "parameter", config),
                });
            }
            return true;
        }
        if (
            config.args === "after-used" &&
            astUtils.isFunction(def.name.parent) &&
            !isAfterLastUsedArg(variable, sourceCode)
        ) {
            return true;
        }
    }

    // generic vars ignore pattern
    if (config.varsIgnorePattern && config.varsIgnorePattern.test(name)) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
            context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(variable, "variable", config),
            });
        }
        return true;
    }

    return false;
}

/**
 * Collects unused variables recursively.
 */
function collectUnusedVariables(scope, unusedVars, config, sourceCode) {
    if (scope.type !== "global" || config.vars === "all") {
        for (const variable of scope.variables) {
            if (shouldSkipVariable(variable, config, sourceCode)) continue;
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
    for (const child of scope.childScopes) {
        collectUnusedVariables(child, unusedVars, config, sourceCode);
    }
    return unusedVars;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

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
                    ignoreRestSiblings: firstOption.ignoreRestSiblings || config.ignoreRestSiblings,
                    caughtErrors: firstOption.caughtErrors || config.caughtErrors,
                    ignoreClassWithStaticInitBlock: firstOption.ignoreClassWithStaticInitBlock || config.ignoreClassWithStaticInitBlock,
                    ignoreUsingDeclarations: firstOption.ignoreUsingDeclarations || config.ignoreUsingDeclarations,
                    reportUsedIgnorePattern: firstOption.reportUsedIgnorePattern || config.reportUsedIgnorePattern,
                });
                if (firstOption.varsIgnorePattern) config.varsIgnorePattern = new RegExp(firstOption.varsIgnorePattern, "u");
                if (firstOption.argsIgnorePattern) config.argsIgnorePattern = new RegExp(firstOption.argsIgnorePattern, "u");
                if (firstOption.caughtErrorsIgnorePattern) config.caughtErrorsIgnorePattern = new RegExp(firstOption.caughtErrorsIgnorePattern, "u");
                if (firstOption.destructuredArrayIgnorePattern) config.destructuredArrayIgnorePattern = new RegExp(firstOption.destructuredArrayIgnorePattern, "u");
            }
        }

        return {
            "Program:exit"(programNode) {
                const unusedVars = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    [],
                    config,
                    sourceCode
                );

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        const writeRefs = unusedVar.references.filter(
                            ref => ref.isWrite() && ref.from.variableScope === unusedVar.scope.variableScope
                        );
                        const referenceToReport = writeRefs.length ? writeRefs.at(-1) : null;
                        context.report({
                            node: referenceToReport ? referenceToReport.identifier : unusedVar.identifiers[0],
                            messageId: "unusedVar",
                            data: unusedVar.references.some(ref => ref.isWrite())
                                ? getAssignedMessageData(unusedVar, config)
                                : getDefinedMessageData(unusedVar, config),
                            suggest: [
                                {
                                    messageId: "removeVar",
                                    data: { varName: unusedVar.name },
                                    fix(fixer) {
                                        return handleFixes(sourceCode, fixer, unusedVar);
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
                            data: getDefinedMessageData(unusedVar, config),
                        });
                    }
                }
            },
        };
    },
};
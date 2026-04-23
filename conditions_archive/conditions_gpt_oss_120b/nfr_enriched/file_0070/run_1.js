/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

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
// Helper utilities (extracted for readability & low complexity)
//------------------------------------------------------------------------------

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

/**
 * Returns a RegExp string representation if defined.
 * @param {RegExp|undefined} pattern
 * @returns {string|undefined}
 */
function patternToString(pattern) {
    return pattern ? pattern.toString() : undefined;
}

/**
 * Determines variable type from definition.
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
 * Retrieves description and ignore pattern for a variable type.
 * @param {VariableType} type
 * @param {Object} config
 * @returns {[string|undefined, string|undefined]}
 */
function getVariableDescription(type, config) {
    let pattern;
    let description;

    switch (type) {
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
            throw new Error(`Unexpected variable type: ${type}`);
    }

    return [description, patternToString(pattern)];
}

/**
 * Builds message data for an unused variable (defined).
 * @param {Object} unusedVar
 * @param {Object} config
 * @returns {UnusedVarMessageData}
 */
function buildDefinedMessage(unusedVar, config) {
    const def = unusedVar.defs && unusedVar.defs[0];
    let additional = "";

    if (def) {
        const [desc, pat] = getVariableDescription(
            defToVariableType(def, config),
            config,
        );
        if (desc && pat) {
            additional = `. Allowed unused ${desc} must match ${pat}`;
        }
    }

    return {
        varName: unusedVar.name,
        action: "defined",
        additional,
    };
}

/**
 * Builds message data for an unused variable (assigned).
 * @param {Object} unusedVar
 * @param {Object} config
 * @returns {UnusedVarMessageData}
 */
function buildAssignedMessage(unusedVar, config) {
    const def = unusedVar.defs && unusedVar.defs[0];
    let additional = "";

    if (def) {
        const [desc, pat] = getVariableDescription(
            defToVariableType(def, config),
            config,
        );
        if (desc && pat) {
            additional = `. Allowed unused ${desc} must match ${pat}`;
        }
    }

    return {
        varName: unusedVar.name,
        action: "assigned a value",
        additional,
    };
}

/**
 * Builds message data for a used ignored variable.
 * @param {Object} variable
 * @param {VariableType} type
 * @param {Object} config
 * @returns {UsedIgnoredVarMessageData}
 */
function buildUsedIgnoredMessage(variable, type, config) {
    const [desc, pat] = getVariableDescription(type, config);
    const additional = desc && pat ? `. Used ${desc} must not match ${pat}` : "";
    return { varName: variable.name, additional };
}

/**
 * Checks if a variable is exported.
 * @param {Object} variable
 * @returns {boolean}
 */
function isExported(variable) {
    const def = variable.defs[0];
    if (!def) return false;

    let node = def.node;
    if (node.type === "VariableDeclarator") node = node.parent;
    if (def.type === "Parameter") return false;

    return node.parent.type.indexOf("Export") === 0;
}

/**
 * Checks if a variable uses explicit resource management.
 * @param {Object} variable
 * @returns {boolean}
 */
function usesExplicitResourceManagement(variable) {
    const [def] = variable.defs;
    return (
        def?.type === "Variable" &&
        (def.parent.kind === "using" || def.parent.kind === "await using")
    );
}

/**
 * Determines if a node is a sibling of a rest property.
 * @param {Object} node
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
 * Determines if a variable has a rest‑sibling (configurable).
 * @param {Object} variable
 * @param {Object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
    if (!config.ignoreRestSiblings) return false;

    const hasDef = variable.defs.some(def => hasRestSibling(def.name.parent));
    const hasRef = variable.references.some(ref => hasRestSibling(ref.identifier.parent));
    return hasDef || hasRef;
}

/**
 * Checks if a reference is a read.
 * @param {Object} ref
 * @returns {boolean}
 */
function isReadRef(ref) {
    return ref.isRead();
}

/**
 * Determines if a reference is a self‑reference inside given function nodes.
 * @param {Object} ref
 * @param {Array} nodes
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

/**
 * Retrieves function definition nodes for a variable.
 * @param {Object} variable
 * @returns {Array}
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
 * Checks if `inner` node lies inside `outer`.
 * @param {Object} inner
 * @param {Object} outer
 * @returns {boolean}
 */
function isInside(inner, outer) {
    return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * Determines if a node is an unused expression.
 * @param {Object} node
 * @returns {boolean}
 */
function isUnusedExpression(node) {
    const parent = node.parent;
    if (parent.type === "ExpressionStatement") return true;
    if (parent.type === "SequenceExpression") {
        const isLast = parent.expressions.at(-1) === node;
        return isLast ? isUnusedExpression(parent) : true;
    }
    return false;
}

/**
 * Retrieves RHS node of an assignment if applicable.
 * @param {Object} ref
 * @param {Object|null} prevRhs
 * @returns {Object|null}
 */
function getRhsNode(ref, prevRhs) {
    const id = ref.identifier;
    const parent = id.parent;
    const refScope = ref.from.variableScope;
    const varScope = ref.resolved.scope.variableScope;
    const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

    if (prevRhs && isInside(id, prevRhs)) return prevRhs;

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
 * Determines if a function node can be stored for later use.
 * @param {Object} funcNode
 * @param {Object} rhsNode
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
 * @param {Object} id
 * @param {Object} rhsNode
 * @returns {boolean}
 */
function isInsideStorableFunction(id, rhsNode) {
    const funcNode = astUtils.getUpperFunction(id);
    return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
}

/**
 * Determines if a reference reads its own value.
 * @param {Object} ref
 * @param {Object|null} rhsNode
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
            (rhsNode && isInside(id, rhsNode) && !isInsideStorableFunction(id, rhsNode)))
    );
}

/**
 * Determines if a reference is used in a `for‑in/of` return.
 * @param {Object} ref
 * @returns {boolean}
 */
function isForInOfRef(ref) {
    let target = ref.identifier.parent;
    if (target.type === "VariableDeclarator") target = target.parent.parent;
    if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") return false;

    if (target.body.type === "BlockStatement") target = target.body.body[0];
    else target = target.body;

    return target && target.type === "ReturnStatement";
}

/**
 * Checks whether a variable is used.
 * @param {Object} variable
 * @returns {boolean}
 */
function isUsedVariable(variable) {
    if (variable.eslintUsed) return true;

    const funcDefs = getFunctionDefinitions(variable);
    const isFuncDef = funcDefs.length > 0;
    let rhsNode = null;

    return variable.references.some(ref => {
        if (isForInOfRef(ref)) return true;

        const selfRead = isReadForItself(ref, rhsNode);
        rhsNode = getRhsNode(ref, rhsNode);

        return (
            isReadRef(ref) &&
            !selfRead &&
            !(isFuncDef && isSelfReference(ref, funcDefs))
        );
    });
}

/**
 * Determines if a parameter appears after the last used argument.
 * @param {Object} variable
 * @param {Object} sourceCode
 * @returns {boolean}
 */
function isAfterLastUsedArg(variable, sourceCode) {
    const def = variable.defs[0];
    const params = sourceCode.getDeclaredVariables(def.node);
    const later = params.slice(params.indexOf(variable) + 1);
    return !later.some(v => v.references.length > 0 || v.eslintUsed);
}

/**
 * Determines whether a variable should be ignored based on configuration.
 * @param {Object} variable
 * @param {Object} config
 * @param {Object} sourceCode
 * @returns {boolean}
 */
function shouldIgnoreVariable(variable, config, sourceCode) {
    const def = variable.defs[0];
    if (!def) return false;

    const type = def.type;
    const name = def.name.name;

    // array destructuring ignore
    if (
        (def.name.parent.type === "ArrayPattern" ||
            variable.references.some(r => r.identifier.parent.type === "ArrayPattern")) &&
        config.destructuredArrayIgnorePattern &&
        config.destructuredArrayIgnorePattern.test(name)
    ) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
            context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: buildUsedIgnoredMessage(variable, "array-destructure", config),
            });
        }
        return true;
    }

    // class static block
    if (type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
        if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
    }

    // catch clause
    if (type === "CatchClause") {
        if (config.caughtErrors === "none") return true;
        if (config.caughtErrorsIgnorePattern?.test(name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: buildUsedIgnoredMessage(variable, "catch-clause", config),
                });
            }
            return true;
        }
        return false;
    }

    // parameters
    if (type === "Parameter") {
        if (
            (def.node.parent.type === "Property" ||
                def.node.parent.type === "MethodDefinition") &&
            def.node.parent.kind === "set"
        ) {
            return true;
        }
        if (config.args === "none") return true;
        if (config.argsIgnorePattern?.test(name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: buildUsedIgnoredMessage(variable, "parameter", config),
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
        return false;
    }

    // generic vars
    if (config.varsIgnorePattern?.test(name)) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
            context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: buildUsedIgnoredMessage(variable, "variable", config),
            });
        }
        return true;
    }

    return false;
}

/**
 * Collects unused variables from a scope recursively.
 * @param {Object} scope
 * @param {Array} result
 * @param {Object} config
 * @param {Object} sourceCode
 * @returns {Array}
 */
function collectUnusedVariables(scope, result, config, sourceCode) {
    if (scope.type !== "global" || config.vars === "all") {
        for (const variable of scope.variables) {
            // class name in class scope
            if (
                scope.type === "class" &&
                scope.block.id === variable.identifiers[0]
            ) {
                continue;
            }

            // function expression name
            if (scope.functionExpressionScope) continue;

            // eslintUsed flag
            if (!config.reportUsedIgnorePattern && variable.eslintUsed) continue;

            // implicit arguments
            if (
                scope.type === "function" &&
                variable.name === "arguments" &&
                variable.identifiers.length === 0
            ) {
                continue;
            }

            if (shouldIgnoreVariable(variable, config, sourceCode)) continue;

            if (
                !isUsedVariable(variable) &&
                !isExported(variable) &&
                !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
                !hasRestSpreadSibling(variable, config)
            ) {
                result.push(variable);
            }
        }
    }

    for (const child of scope.childScopes) {
        collectUnusedVariables(child, result, config, sourceCode);
    }

    return result;
}

/**
 * Determines if a token sequence makes a removal unsafe.
 * @param {Object} nextToken
 * @param {Object|null} prevToken
 * @returns {boolean}
 */
function isRemovalUnsafe(nextToken, prevToken) {
    return (
        nextToken.type === "String" ||
        (prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken))
    );
}

/**
 * Fixes a variable based on its parent node type.
 * Delegates to specialized fixers.
 * @param {Object} fixer
 * @param {Object} unusedVar
 * @param {Object} sourceCode
 * @returns {Object|null}
 */
function applyFixes(fixer, unusedVar, sourceCode) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);

    // Helper to get token values
    const beforeVal = tokenBefore?.value;
    const afterVal = tokenAfter?.value;

    // 1. VariableDeclarator
    if (parent.type === "VariableDeclarator") {
        return fixVariableDeclarator(fixer, parent, tokenBefore, tokenAfter, sourceCode);
    }

    // 2. ObjectPattern
    if (parent.parent.type === "ObjectPattern") {
        return fixObjectPattern(fixer, parent, tokenBefore, tokenAfter, sourceCode);
    }

    // 3. ArrayPattern
    if (parent.type === "ArrayPattern") {
        return fixArrayPattern(fixer, parent, tokenBefore, tokenAfter, sourceCode);
    }

    // 4. RestElement
    if (parent.type === "RestElement") {
        return fixRestElement(fixer, parent, tokenBefore, tokenAfter, sourceCode);
    }

    // 5. AssignmentPattern
    if (parent.type === "AssignmentPattern") {
        return fixAssignmentPattern(fixer, parent, tokenBefore, tokenAfter, sourceCode);
    }

    // 6. FunctionDeclaration (unused function)
    if (parent.type === "FunctionDeclaration" && parent.id === id) {
        return fixer.removeRange(parent.range);
    }

    // 7. Imports
    if (parent.type === "ImportDefaultSpecifier") {
        return fixImportDefault(fixer, parent, tokenAfter, sourceCode);
    }
    if (parent.type === "ImportSpecifier") {
        return fixImportSpecifier(fixer, parent, tokenBefore, tokenAfter, sourceCode);
    }
    if (parent.type === "ImportNamespaceSpecifier") {
        return fixImportNamespace(fixer, parent, sourceCode);
    }

    // 8. CatchClause – no fix
    if (parent.type === "CatchClause") return null;

    // 9. ClassDeclaration
    if (parent.type === "ClassDeclaration") return fixer.removeRange(parent.range);

    // 10. Sequence commas
    if (tokenBefore?.value === ",") return fixer.removeRange([tokenBefore.range[0], id.range[1]]);

    // 11. Trailing commas in arguments / object patterns
    if (afterVal === ",") {
        if (beforeVal === "(") {
            return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        }
        if (beforeVal === "{") {
            return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        }
    }

    // 12. Single‑parameter arrow function without parentheses
    if (
        parent.type === "ArrowFunctionExpression" &&
        parent.params.length === 1 &&
        afterVal !== ")"
    ) {
        return fixer.replaceText(id, "()");
    }

    // Default: remove identifier
    return fixer.removeRange(id.range);
}

/**
 * Fixes a VariableDeclarator node.
 */
function fixVariableDeclarator(fixer, node, tokenBefore, tokenAfter, sourceCode) {
    // skip loop header
    if (astUtils.isLoop(node.parent.parent)) return null;

    // single declaration
    if (node.parent.declarations.length === 1) {
        // safety checks
        const next = sourceCode.getTokenAfter(node.parent);
        const prev = sourceCode.getTokenBefore(node.parent);
        if (next && isRemovalUnsafe(next, prev)) return null;
        return fixer.removeRange(node.parent.range);
    }

    // multiple declarations – remove surrounding commas
    if (tokenBefore?.value === ",") {
        return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
    }
    return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
}

/**
 * Fixes an ObjectPattern variable.
 */
function fixObjectPattern(fixer, node, tokenBefore, tokenAfter, sourceCode) {
    const parent = node.parent;
    if (parent.properties.length === 1) {
        // single property – delegate to generic variable fixer
        return fixVariables(fixer, node, sourceCode);
    }

    // property with colon (key: value)
    if (tokenBefore?.value === ":") {
        // first property
        if (tokenBefore?.value === "{" && tokenAfter?.value === ",") {
            return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
        }
        // other properties
        return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
    }

    // default: remove whole property
    return fixer.removeRange(node.range);
}

/**
 * Fixes an ArrayPattern variable.
 */
function fixArrayPattern(fixer, node, tokenBefore, tokenAfter, sourceCode) {
    if (node.parent.type === "RestElement") {
        // rest element inside array
        return fixRestInPattern(fixer, node.parent, sourceCode);
    }

    // single element array pattern
    if (node.elements.filter(e => e !== null).length === 1) {
        return fixVariables(fixer, node, sourceCode);
    }

    // commas around element
    if (tokenBefore?.value === "," && tokenAfter?.value === ",") {
        return fixer.removeRange(node.range);
    }

    // trailing comma
    if (tokenAfter?.value === "]") {
        return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
    }

    return null;
}

/**
 * Fixes a RestElement node.
 */
function fixRestElement(fixer, node, tokenBefore, tokenAfter, sourceCode) {
    const parent = node.parent;

    // Rest in array pattern
    if (parent.type === "ArrayPattern") {
        if (parent.elements.length === 1) {
            return fixVariables(fixer, parent, sourceCode);
        }
        return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
    }

    // Rest in object pattern
    if (parent.type === "ObjectPattern") {
        if (parent.properties.length === 1) {
            return fixVariables(fixer, parent, sourceCode);
        }
        return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
    }

    // Rest in function parameters
    if (astUtils.isFunction(parent)) {
        if (parent.params.length === 1) {
            return fixer.removeRange(node.range);
        }
        return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
    }

    return null;
}

/**
 * Fixes an AssignmentPattern node.
 */
function fixAssignmentPattern(fixer, node, tokenBefore, tokenAfter, sourceCode) {
    const parent = node.parent;

    // array pattern default
    if (parent.type === "ArrayPattern") {
        return fixVariables(fixer, parent, sourceCode);
    }

    // object pattern default
    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) {
            return fixVariables(fixer, parent.parent, sourceCode);
        }
        // first property default
        if (tokenBefore?.value === "{" && tokenAfter?.value === ",") {
            return fixer.removeRange([parent.parent.range[0], tokenAfter.range[1]]);
        }
        // other property default
        return fixer.removeRange([tokenBefore.range[0], parent.parent.range[1]]);
    }

    // function parameter default
    if (astUtils.isFunction(parent)) {
        return fixFunctionParameters(fixer, node, sourceCode);
    }

    return null;
}

/**
 * Fixes function parameters (unused).
 */
function fixFunctionParameters(fixer, node, sourceCode) {
    const func = node.parent;
    if (!astUtils.isFunction(func)) return null;

    if (func.params.length === 1) {
        return fixer.removeRange(node.range);
    }

    const before = sourceCode.getTokenBefore(node);
    const after = sourceCode.getTokenAfter(node);
    if (before?.value === "(" && after?.value === ",") {
        return fixer.removeRange([node.range[0], after.range[1]]);
    }

    return fixer.removeRange([before.range[0], node.range[1]]);
}

/**
 * Generic variable fixer used by several pattern fixers.
 */
function fixVariables(fixer, node, sourceCode) {
    // delegate to appropriate pattern fixer
    if (node.type === "ObjectPattern") return fixObjectPattern(fixer, node, null, null, sourceCode);
    if (node.type === "ArrayPattern") return fixArrayPattern(fixer, node, null, null, sourceCode);
    return null;
}

/**
 * Fixes a rest element inside a pattern (nested).
 */
function fixRestInPattern(fixer, node, sourceCode) {
    const parent = node.parent;
    if (astUtils.isFunction(parent)) {
        return fixRestElement(fixer, node, null, null, sourceCode);
    }
    if (parent.type === "ArrayPattern") {
        return fixArrayPattern(fixer, parent, null, null, sourceCode);
    }
    return null;
}

/**
 * Fixes default import specifier.
 */
function fixImportDefault(fixer, node, tokenAfter, sourceCode) {
    const parent = node.parent;
    const hasOther = parent.specifiers.some(s => s.type !== "ImportDefaultSpecifier");
    if (!hasOther) {
        return fixer.removeRange([node.range[0], parent.source.range[0]]);
    }
    return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
}

/**
 * Fixes named import specifier.
 */
function fixImportSpecifier(fixer, node, tokenBefore, tokenAfter, sourceCode) {
    const parent = node.parent;
    const specCount = parent.specifiers.filter(s => s.type === "ImportSpecifier").length;
    if (specCount === 1) {
        const hasDefault = parent.specifiers.some(s => s.type === "ImportDefaultSpecifier");
        if (!hasDefault) {
            return fixer.removeRange(parent.range);
        }
        return fixer.removeRange([
            sourceCode.getTokenBefore(node, 1).range[0],
            tokenAfter.range[1],
        ]);
    }
    if (tokenBefore?.value === "{") {
        return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
    }
    return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
}

/**
 * Fixes namespace import specifier.
 */
function fixImportNamespace(fixer, node, sourceCode) {
    const parent = node.parent;
    const hasDefault = parent.specifiers.some(s => s.type === "ImportDefaultSpecifier");
    if (hasDefault) {
        return fixer.removeRange([
            sourceCode.getTokenBefore(node).range[0],
            node.range[1],
        ]);
    }
    return fixer.removeRange([node.range[0], parent.source.range[0]]);
}

/**
 * Handles fixes for a given unused variable.
 * @param {Object} fixer
 * @param {Object} unusedVar
 * @param {Object} sourceCode
 * @returns {Object|null}
 */
function handleFixes(fixer, unusedVar, sourceCode) {
    // ensure no other write references remain
    const id = unusedVar.identifiers[0];
    const allWrites = unusedVar.references.filter(r => r.isWrite());
    if (allWrites.some(r => r.identifier.range[0] !== id.range[0])) return null;

    return applyFixes(fixer, unusedVar, sourceCode);
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
                    caughtErrors: firstOption.caughtErrors ?? config.caughtErrors,
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
                    config.varsIgnorePattern = new RegExp(firstOption.varsIgnorePattern, "u");
                }
                if (firstOption.argsIgnorePattern) {
                    config.argsIgnorePattern = new RegExp(firstOption.argsIgnorePattern, "u");
                }
                if (firstOption.caughtErrorsIgnorePattern) {
                    config.caughtErrorsIgnorePattern = new RegExp(firstOption.caughtErrorsIgnorePattern, "u");
                }
                if (firstOption.destructuredArrayIgnorePattern) {
                    config.destructuredArrayIgnorePattern = new RegExp(firstOption.destructuredArrayIgnorePattern, "u");
                }
            }
        }

        return {
            "Program:exit"(programNode) {
                const unused = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    [],
                    config,
                    sourceCode,
                );

                for (const variable of unused) {
                    if (variable.defs.length > 0) {
                        const writeRefs = variable.references.filter(
                            r => r.isWrite() && r.from.variableScope === variable.scope.variableScope,
                        );
                        const lastWrite = writeRefs.length ? writeRefs.at(-1) : null;

                        context.report({
                            node: lastWrite ? lastWrite.identifier : variable.identifiers[0],
                            messageId: "unusedVar",
                            data: variable.references.some(r => r.isWrite())
                                ? buildAssignedMessage(variable, config)
                                : buildDefinedMessage(variable, config),
                            suggest: [
                                {
                                    messageId: "removeVar",
                                    data: { varName: variable.name },
                                    fix(fixer) {
                                        return handleFixes(fixer, variable, sourceCode);
                                    },
                                },
                            ],
                        });
                    } else if (variable.eslintExplicitGlobalComments) {
                        const comment = variable.eslintExplicitGlobalComments[0];
                        context.report({
                            node: programNode,
                            loc: astUtils.getNameLocationInGlobalDirectiveComment(
                                sourceCode,
                                comment,
                                variable.name,
                            ),
                            messageId: "unusedVar",
                            data: buildDefinedMessage(variable, config),
                        });
                    }
                }
            },
        };
    },
};
/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

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

/**
 * Build configuration object from rule options.
 * @param {any[]} options
 * @returns {object}
 */
function buildConfig(options) {
    const defaultConfig = {
        vars: "all",
        args: "after-used",
        ignoreRestSiblings: false,
        caughtErrors: "all",
        ignoreClassWithStaticInitBlock: false,
        ignoreUsingDeclarations: false,
        reportUsedIgnorePattern: false,
    };

    const first = options[0];
    if (!first) return defaultConfig;

    if (typeof first === "string") {
        return { ...defaultConfig, vars: first };
    }

    const cfg = { ...defaultConfig, ...first };
    if (first.varsIgnorePattern) cfg.varsIgnorePattern = new RegExp(first.varsIgnorePattern, "u");
    if (first.argsIgnorePattern) cfg.argsIgnorePattern = new RegExp(first.argsIgnorePattern, "u");
    if (first.caughtErrorsIgnorePattern) cfg.caughtErrorsIgnorePattern = new RegExp(first.caughtErrorsIgnorePattern, "u");
    if (first.destructuredArrayIgnorePattern) cfg.destructuredArrayIgnorePattern = new RegExp(first.destructuredArrayIgnorePattern, "u");
    return cfg;
}

/**
 * Determine variable type from definition.
 * @param {object} def
 * @param {object} config
 * @returns {VariableType}
 */
function defToVariableType(def, config) {
    if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
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
 * Retrieve description and pattern for a variable type.
 * @param {VariableType} type
 * @param {object} config
 * @returns {[string|undefined, string|undefined]}
 */
function getVariableDescription(type, config) {
    let pattern, description;
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
    return [description, pattern?.toString()];
}

/**
 * Build message data for a defined but unused variable.
 * @param {object} unusedVar
 * @param {object} config
 * @returns {UnusedVarMessageData}
 */
function getDefinedMessageData(unusedVar, config) {
    const def = unusedVar.defs?.[0];
    let additional = "";
    if (def) {
        const [desc, pat] = getVariableDescription(defToVariableType(def, config), config);
        if (desc && pat) additional = `. Allowed unused ${desc} must match ${pat}`;
    }
    return { varName: unusedVar.name, action: "defined", additional };
}

/**
 * Build message data for an assigned but unused variable.
 * @param {object} unusedVar
 * @param {object} config
 * @returns {UnusedVarMessageData}
 */
function getAssignedMessageData(unusedVar, config) {
    const def = unusedVar.defs?.[0];
    let additional = "";
    if (def) {
        const [desc, pat] = getVariableDescription(defToVariableType(def, config), config);
        if (desc && pat) additional = `. Allowed unused ${desc} must match ${pat}`;
    }
    return { varName: unusedVar.name, action: "assigned a value", additional };
}

/**
 * Build message data for a used ignored variable.
 * @param {object} variable
 * @param {VariableType} type
 * @param {object} config
 * @returns {UsedIgnoredVarMessageData}
 */
function getUsedIgnoredMessageData(variable, type, config) {
    const [desc, pat] = getVariableDescription(type, config);
    const additional = desc && pat ? `. Used ${desc} must not match ${pat}` : "";
    return { varName: variable.name, additional };
}

/**
 * Check if a variable is exported.
 * @param {object} variable
 * @returns {boolean}
 */
function isExported(variable) {
    const def = variable.defs?.[0];
    if (!def) return false;
    let node = def.node;
    if (node.type === "VariableDeclarator") node = node.parent;
    if (def.type === "Parameter") return false;
    return node.parent.type.startsWith("Export");
}

/**
 * Detect explicit resource management usage.
 * @param {object} variable
 * @returns {boolean}
 */
function usesExplicitResourceManagement(variable) {
    const [def] = variable.defs;
    return def?.type === "Variable" && (def.parent.kind === "using" || def.parent.kind === "await using");
}

/**
 * Determine if a node is a sibling of a rest property.
 * @param {object} node
 * @returns {boolean}
 */
function hasRestSibling(node) {
    return (
        node.type === "Property" &&
        node.parent.type === "ObjectPattern" &&
        /^(?:RestElement|(?:Experimental)?RestProperty)$/u.test(node.parent.properties.at(-1).type)
    );
}

/**
 * Check for rest sibling in variable definitions/references.
 * @param {object} variable
 * @param {object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
    if (!config.ignoreRestSiblings) return false;
    const defRest = variable.defs.some(d => hasRestSibling(d.name.parent));
    const refRest = variable.references.some(r => hasRestSibling(r.identifier.parent));
    return defRest || refRest;
}

/**
 * Determine if a reference reads a value.
 * @param {object} ref
 * @returns {boolean}
 */
function isReadRef(ref) {
    return ref.isRead();
}

/**
 * Check if a reference is a self-reference within given function nodes.
 * @param {object} ref
 * @param {object[]} nodes
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
 * Retrieve function definition nodes for a variable.
 * @param {object} variable
 * @returns {object[]}
 */
function getFunctionDefinitions(variable) {
    const defs = [];
    for (const def of variable.defs) {
        if (def.type === "FunctionName") {
            defs.push(def.node);
        } else if (def.type === "Variable" && def.node.init && (def.node.init.type === "FunctionExpression" || def.node.init.type === "ArrowFunctionExpression")) {
            defs.push(def.node.init);
        }
    }
    return defs;
}

/**
 * Verify if inner node lies within outer node.
 * @param {object} inner
 * @param {object} outer
 * @returns {boolean}
 */
function isInside(inner, outer) {
    return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * Detect unused expression nodes.
 * @param {object} node
 * @returns {boolean}
 */
function isUnusedExpression(node) {
    const parent = node.parent;
    if (parent.type === "ExpressionStatement") return true;
    if (parent.type === "SequenceExpression") {
        if (parent.expressions.at(-1) !== node) return true;
        return isUnusedExpression(parent);
    }
    return false;
}

/**
 * Get RHS node of an assignment if applicable.
 * @param {object} ref
 * @param {object|null} prevRhs
 * @param {object} sourceCode
 * @returns {object|null}
 */
function getRhsNode(ref, prevRhs, sourceCode) {
    const id = ref.identifier;
    const parent = id.parent;
    const refScope = ref.from.variableScope;
    const varScope = ref.resolved.scope.variableScope;
    const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

    if (prevRhs && isInside(id, prevRhs)) return prevRhs;

    if (parent.type === "AssignmentExpression" && isUnusedExpression(parent) && id === parent.left && !canBeUsedLater) {
        return parent.right;
    }
    return null;
}

/**
 * Determine if a function node is stored for later use.
 * @param {object} funcNode
 * @param {object} rhsNode
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
                if (/(?:Statement|Declaration)$/u.test(parent.type)) return true;
        }
        node = parent;
        parent = parent.parent;
    }
    return false;
}

/**
 * Check if identifier is inside a storable function.
 * @param {object} id
 * @param {object} rhsNode
 * @returns {boolean}
 */
function isInsideOfStorableFunction(id, rhsNode) {
    const funcNode = astUtils.getUpperFunction(id);
    return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
}

/**
 * Determine if a reference reads its own value.
 * @param {object} ref
 * @param {object|null} rhsNode
 * @returns {boolean}
 */
function isReadForItself(ref, rhsNode) {
    const id = ref.identifier;
    const parent = id.parent;
    const isAssignSelf = parent.type === "AssignmentExpression" && parent.left === id && isUnusedExpression(parent) && !astUtils.isLogicalAssignmentOperator(parent.operator);
    const isUpdateSelf = parent.type === "UpdateExpression" && isUnusedExpression(parent);
    const isRhsSelf = rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode);
    return ref.isRead() && (isAssignSelf || isUpdateSelf || isRhsSelf);
}

/**
 * Detect if a reference is used in a for‑in/of return statement.
 * @param {object} ref
 * @returns {boolean}
 */
function isForInOfRef(ref) {
    let target = ref.identifier.parent;
    if (target.type === "VariableDeclarator") target = target.parent.parent;
    if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") return false;
    if (target.body.type === "BlockStatement") target = target.body.body[0];
    else target = target.body;
    if (!target) return false;
    return target.type === "ReturnStatement";
}

/**
 * Determine if a variable is used.
 * @param {object} variable
 * @param {object} sourceCode
 * @returns {boolean}
 */
function isUsedVariable(variable, sourceCode) {
    if (variable.eslintUsed) return true;
    const funcDefs = getFunctionDefinitions(variable);
    const isFuncDef = funcDefs.length > 0;
    let rhsNode = null;
    return variable.references.some(ref => {
        if (isForInOfRef(ref)) return true;
        const selfRead = isReadForItself(ref, rhsNode);
        rhsNode = getRhsNode(ref, rhsNode, sourceCode);
        return isReadRef(ref) && !selfRead && !(isFuncDef && isSelfReference(ref, funcDefs));
    });
}

/**
 * Check if a parameter appears after the last used argument.
 * @param {object} variable
 * @param {object} sourceCode
 * @returns {boolean}
 */
function isAfterLastUsedArg(variable, sourceCode) {
    const def = variable.defs[0];
    const params = sourceCode.getDeclaredVariables(def.node);
    const later = params.slice(params.indexOf(variable) + 1);
    return !later.some(v => v.references.length > 0 || v.eslintUsed);
}

/**
 * Decide whether a variable should be ignored based on configuration.
 * @param {object} variable
 * @param {object} config
 * @param {object} sourceCode
 * @returns {boolean}
 */
function shouldIgnoreVariable(variable, config, sourceCode) {
    const def = variable.defs?.[0];
    if (!def) return false;
    const type = def.type;
    const name = def.name.name;

    // array destructuring ignore
    if ((def.name.parent.type === "ArrayPattern" || variable.references.some(r => r.identifier.parent.type === "ArrayPattern")) && config.destructuredArrayIgnorePattern?.test(name)) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
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
        const hasStatic = def.node.body.body.some(n => n.type === "StaticBlock");
        if (config.ignoreClassWithStaticInitBlock && hasStatic) return true;
    }

    // catch clause
    if (type === "CatchClause") {
        if (config.caughtErrors === "none") return true;
        if (config.caughtErrorsIgnorePattern?.test(name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "catch-clause", config),
                });
            }
            return true;
        }
        return false;
    }

    // parameters
    if (type === "Parameter") {
        if (def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") {
            if (def.node.parent.kind === "set") return true;
        }
        if (config.args === "none") return true;
        if (config.argsIgnorePattern?.test(name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "parameter", config),
                });
            }
            return true;
        }
        if (config.args === "after-used" && astUtils.isFunction(def.name.parent) && !isAfterLastUsedArg(variable, sourceCode)) {
            return true;
        }
        return false;
    }

    // generic vars
    if (config.varsIgnorePattern?.test(name)) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
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
 * Recursively collect unused variables from a scope.
 * @param {object} scope
 * @param {object[]} result
 * @param {object} config
 * @param {object} sourceCode
 * @returns {object[]}
 */
function collectUnusedVariables(scope, result, config, sourceCode) {
    if (scope.type !== "global" && config.vars !== "all") {
        // skip global when not configured
    } else {
        for (const variable of scope.variables) {
            // class name in class scope
            if (scope.type === "class" && scope.block.id === variable.identifiers[0]) continue;
            // function expression name
            if (scope.functionExpressionScope) continue;
            // eslintUsed flag
            if (!config.reportUsedIgnorePattern && variable.eslintUsed) continue;
            // implicit arguments
            if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) continue;
            // ignore based on config
            if (shouldIgnoreVariable(variable, config, sourceCode)) continue;
            // final checks
            if (!isUsedVariable(variable, sourceCode) && !isExported(variable) && !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) && !hasRestSpreadSibling(variable, config)) {
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
 * Helper to safely get token value.
 * @param {object} node
 * @param {object} sourceCode
 * @param {boolean} before
 * @returns {string|undefined}
 */
function getTokenValue(node, sourceCode, before) {
    const token = before ? sourceCode.getTokenBefore(node) : sourceCode.getTokenAfter(node);
    return token?.value;
}

/**
 * Determine if a declaration removal is unsafe.
 * @param {object} nextToken
 * @param {object} prevToken
 * @returns {boolean}
 */
function isDeclarationUnsafe(nextToken, prevToken) {
    return nextToken?.type === "String" || (prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken));
}

/**
 * Core fix logic for a single unused variable.
 * @param {object} fixer
 * @param {object} unusedVar
 * @param {object} sourceCode
 * @returns {object|null}
 */
function handleFixes(fixer, unusedVar, sourceCode) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);
    const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

    // abort if other writes exist
    if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

    // VariableDeclarator handling
    if (parent.type === "VariableDeclarator") {
        const decl = parent.parent;
        if (decl.declarations.length === 1) {
            if (astUtils.isLoop(decl.parent.parent) && decl.parent.parent.body !== decl.parent) return null;
            const next = sourceCode.getTokenAfter(decl.parent);
            const prev = sourceCode.getTokenBefore(decl.parent);
            if (isDeclarationUnsafe(next, prev)) return null;
            return fixer.removeRange(decl.parent.range);
        }
        if (tokenBefore?.value === ",") {
            return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
        }
        return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
    }

    // ObjectPattern handling
    if (parent.parent.type === "ObjectPattern") {
        const obj = parent.parent;
        if (obj.properties.length === 1) {
            if (obj.parent.type === "RestElement") return fixRestInPattern(obj.parent, fixer, sourceCode);
            if (obj.parent.type === "ArrayPattern") return fixNestedArrayVariable(obj.parent, fixer, sourceCode);
            return fixVariables(obj, fixer, sourceCode);
        }
        if (tokenBefore?.value === ":") {
            if (getTokenValue(parent, sourceCode, true) === "{" && getTokenValue(parent, sourceCode, false) === ",") {
                return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
            }
            return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], id.range[1]]);
        }
    }

    // ArrayPattern handling
    if (parent.type === "ArrayPattern") {
        if (parent.elements.filter(e => e !== null).length === 1) {
            if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent, fixer, sourceCode);
            if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent.parent, fixer, sourceCode);
            return fixVariables(parent, fixer, sourceCode);
        }
        if (tokenBefore?.value === "," && tokenAfter?.value === ",") {
            return fixer.removeRange(id.range);
        }
    }

    // RestElement handling
    if (parent.type === "RestElement") {
        if (parent.parent.type === "ArrayPattern") {
            if (parent.parent.elements.filter(e => e !== null).length === 1) {
                if (parent.parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent.parent, fixer, sourceCode);
                return fixVariables(parent.parent, fixer, sourceCode);
            }
            return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
        }
        if (parent.parent.type === "ObjectPattern") {
            if (parent.parent.properties.length === 1) return fixVariables(parent.parent, fixer, sourceCode);
            return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
        }
        if (astUtils.isFunction(parent.parent)) {
            if (parent.parent.params.length === 1) return fixer.removeRange(parent.range);
            return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
        }
    }

    // AssignmentPattern handling
    if (parent.type === "AssignmentPattern") {
        if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent, fixer, sourceCode);
        if (parent.parent.parent.type === "ObjectPattern") {
            const obj = parent.parent.parent;
            if (obj.properties.length === 1) {
                if (obj.parent.type === "ArrayPattern") return fixNestedArrayVariable(obj.parent, fixer, sourceCode);
                return fixVariables(obj, fixer, sourceCode);
            }
            if (getTokenValue(parent.parent, sourceCode, true) === "{" && getTokenValue(parent.parent, sourceCode, false) === ",") {
                return fixer.removeRange([parent.parent.range[0], sourceCode.getTokenAfter(parent.parent).range[1]]);
            }
            return fixer.removeRange([sourceCode.getTokenBefore(parent.parent).range[0], parent.parent.range[1]]);
        }
        if (astUtils.isFunction(parent.parent)) return fixFunctionParameters(parent, fixer, sourceCode);
    }

    // FunctionDeclaration
    if (parent.type === "FunctionDeclaration" && parent.id === id) return fixer.removeRange(parent.range);

    // Import handling
    if (parent.type === "ImportDefaultSpecifier") {
        const hasOther = parent.parent.specifiers.some(s => s.type !== "ImportDefaultSpecifier");
        if (!hasOther) return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
        return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
    }
    if (parent.type === "ImportSpecifier") {
        const specifiers = parent.parent.specifiers.filter(s => s.type === "ImportSpecifier");
        if (specifiers.length === 1 && !parent.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
            return fixer.removeRange(parent.parent.range);
        }
        if (getTokenValue(parent, sourceCode, true) === "{") {
            return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
        }
        return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
    }
    if (parent.type === "ImportNamespaceSpecifier") {
        if (parent.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
            return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
        }
        return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
    }

    // CatchClause
    if (parent.type === "CatchClause") return null;

    // ClassDeclaration
    if (parent.type === "ClassDeclaration") return fixer.removeRange(parent.range);

    // Sequence commas
    if (tokenBefore?.value === ",") return fixer.removeRange([tokenBefore.range[0], id.range[1]]);

    // Trailing commas in arguments/object patterns
    if (tokenAfter?.value === ",") {
        if (tokenBefore?.value === "(") return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        if (tokenBefore?.value === "{") return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
    }

    // Arrow function single param without parentheses
    if (parent.type === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfter?.value !== ")") {
        return fixer.replaceText(id, "()");
    }

    return fixer.removeRange(id.range);
}

/**
 * Fix function parameters.
 * @param {object} node
 * @param {object} fixer
 * @param {object} sourceCode
 * @returns {object|null}
 */
function fixFunctionParameters(node, fixer, sourceCode) {
    const parent = node.parent;
    if (!astUtils.isFunction(parent)) return null;
    if (parent.params.length === 1) return fixer.removeRange(node.range);
    if (getTokenValue(node, sourceCode, true) === "(" && getTokenValue(node, sourceCode, false) === ",") {
        return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
    }
    return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
}

/**
 * Fix generic variable nodes.
 * @param {object} node
 * @param {object} fixer
 * @param {object} sourceCode
 * @returns {object|null}
 */
function fixVariables(node, fixer, sourceCode) {
    const parent = node.parent;
    if (parent.type === "VariableDeclarator") {
        if (isLoop(parent.parent.parent)) return null;
        if (parent.parent.declarations.length === 1) {
            const next = sourceCode.getTokenAfter(parent.parent);
            const prev = sourceCode.getTokenBefore(parent.parent);
            if (isDeclarationUnsafe(next, prev)) return null;
            return fixer.removeRange(parent.parent.range);
        }
        if (getTokenValue(parent, sourceCode, true) === ",") {
            return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
        }
        return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
    }
    if (getTokenValue(node, sourceCode, true) === ":") {
        if (node.parent.parent.type === "ObjectPattern") return fixNestedObjectVariable(node, fixer, sourceCode);
    }
    return fixFunctionParameters(node, fixer, sourceCode);
}

/**
 * Fix nested object patterns.
 * @param {object} node
 * @param {object} fixer
 * @param {object} sourceCode
 * @returns {object|null}
 */
function fixNestedObjectVariable(node, fixer, sourceCode) {
    const parent = node.parent;
    if (parent.parent.parent.parent.type === "ObjectPattern" && parent.parent.properties.length === 1) {
        return fixNestedObjectVariable(parent.parent, fixer, sourceCode);
    }
    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) return fixVariables(parent.parent, fixer, sourceCode);
        if (getTokenValue(parent, sourceCode, true) === "{") {
            return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
        }
        return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
    }
    return null;
}

/**
 * Fix nested array patterns.
 * @param {object} node
 * @param {object} fixer
 * @param {object} sourceCode
 * @returns {object|null}
 */
function fixNestedArrayVariable(node, fixer, sourceCode) {
    const parent = node.parent;
    if (parent.parent.type === "ArrayPattern" && hasSingleElement(parent)) {
        return fixNestedArrayVariable(parent, fixer, sourceCode);
    }
    if (hasSingleElement(parent)) {
        if (getTokenValue(parent, sourceCode, true) === ":") return fixVariables(parent, fixer, sourceCode);
        if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent, fixer, sourceCode);
        return fixVariables(parent, fixer, sourceCode);
    }
    if (getTokenValue(node, sourceCode, true) === "," && getTokenValue(node, sourceCode, false) === "]") {
        return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
    }
    return fixer.removeRange(node.range);
}

/**
 * Check if an array pattern has a single non‑null element.
 * @param {object} node
 * @returns {boolean}
 */
function hasSingleElement(node) {
    return node.elements.filter(e => e !== null).length === 1;
}

/**
 * Fix rest elements inside patterns.
 * @param {object} node
 * @param {object} fixer
 * @param {object} sourceCode
 * @returns {object|null}
 */
function fixRestInPattern(node, fixer, sourceCode) {
    const parent = node.parent;
    if (astUtils.isFunction(parent)) {
        if (parent.params.length === 1) return fixer.removeRange(node.range);
        return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
    }
    if (parent.type === "ArrayPattern") {
        if (hasSingleElement(parent)) {
            if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent, fixer, sourceCode);
            return fixVariables(parent, fixer, sourceCode);
        }
        return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
    }
    return null;
}

/**
 * Main rule definition.
 */
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
        const config = buildConfig(context.options);
        const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;

        return {
            "Program:exit"(programNode) {
                const unused = collectUnusedVariables(sourceCode.getScope(programNode), [], config, sourceCode);
                for (const variable of unused) {
                    if (variable.defs.length > 0) {
                        const writes = variable.references.filter(r => r.isWrite() && r.from.variableScope === variable.scope.variableScope);
                        const lastWrite = writes.length ? writes.at(-1) : null;
                        context.report({
                            node: lastWrite ? lastWrite.identifier : variable.identifiers[0],
                            messageId: "unusedVar",
                            data: variable.references.some(r => r.isWrite()) ? getAssignedMessageData(variable, config) : getDefinedMessageData(variable, config),
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
                            loc: astUtils.getNameLocationInGlobalDirectiveComment(sourceCode, comment, variable.name),
                            messageId: "unusedVar",
                            data: getDefinedMessageData(variable, config),
                        });
                    }
                }
            },
        };
    },
};
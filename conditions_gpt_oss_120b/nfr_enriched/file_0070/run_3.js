```javascript
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
// Helpers
//------------------------------------------------------------------------------

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

/**
 * Returns true if the given node is a rest sibling.
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
 * Returns true if the variable has a rest‑sibling according to config.
 * @param {Variable} variable
 * @param {Object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
    if (!config.ignoreRestSiblings) return false;
    const hasDef = variable.defs.some(d => hasRestSibling(d.name.parent));
    const hasRef = variable.references.some(r => hasRestSibling(r.identifier.parent));
    return hasDef || hasRef;
}

/**
 * Returns true if the variable is exported.
 * @param {Variable} variable
 * @returns {boolean}
 */
function isExported(variable) {
    const def = variable.defs[0];
    if (!def) return false;
    let node = def.node;
    if (node.type === "VariableDeclarator") node = node.parent;
    else if (def.type === "Parameter") return false;
    return node.parent.type.indexOf("Export") === 0;
}

/**
 * Returns true if the variable uses explicit resource management.
 * @param {Variable} variable
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
 * Returns true if the reference is a read.
 * @param {Reference} ref
 * @returns {boolean}
 */
function isReadRef(ref) {
    return ref.isRead();
}

/**
 * Returns true if the reference is a self‑reference inside one of the given nodes.
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

/**
 * Returns function definition nodes for a variable.
 * @param {Variable} variable
 * @returns {ASTNode[]}
 */
function getFunctionDefinitions(variable) {
    const defs = [];
    variable.defs.forEach(d => {
        if (d.type === "FunctionName") defs.push(d.node);
        if (
            d.type === "Variable" &&
            d.node.init &&
            (d.node.init.type === "FunctionExpression" ||
                d.node.init.type === "ArrowFunctionExpression")
        ) {
            defs.push(d.node.init);
        }
    });
    return defs;
}

/**
 * Returns true if inner node is inside outer node.
 * @param {ASTNode} inner
 * @param {ASTNode} outer
 * @returns {boolean}
 */
function isInside(inner, outer) {
    return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * Returns true if the node is an unused expression.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isUnusedExpression(node) {
    const parent = node.parent;
    if (parent.type === "ExpressionStatement") return true;
    if (parent.type === "SequenceExpression") {
        const last = parent.expressions.at(-1) === node;
        return last ? isUnusedExpression(parent) : true;
    }
    return false;
}

/**
 * Returns the RHS node of an assignment if the reference is the LHS.
 * @param {Reference} ref
 * @param {ASTNode|null} prevRhs
 * @param {SourceCode} sourceCode
 * @returns {ASTNode|null}
 */
function getRhsNode(ref, prevRhs, sourceCode) {
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
 * Returns true if the function node can be stored for later use.
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
 * Returns true if the identifier is inside a storable function.
 * @param {ASTNode} id
 * @param {ASTNode} rhsNode
 * @returns {boolean}
 */
function isInsideOfStorableFunction(id, rhsNode) {
    const funcNode = astUtils.getUpperFunction(id);
    return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
}

/**
 * Returns true if the reference reads its own value.
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
 * Returns true if the reference is used in a for‑in/of loop return.
 * @param {Reference} ref
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
 * Returns true if the variable is used.
 * @param {Variable} variable
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isUsedVariable(variable, sourceCode) {
    if (variable.eslintUsed) return true;
    const funcDefs = getFunctionDefinitions(variable);
    const isFuncDef = funcDefs.length > 0;
    let rhsNode = null;
    return variable.references.some(ref => {
        if (isForInOfRef(ref)) return true;
        const self = isReadForItself(ref, rhsNode);
        rhsNode = getRhsNode(ref, rhsNode, sourceCode);
        return (
            isReadRef(ref) &&
            !self &&
            !(isFuncDef && isSelfReference(ref, funcDefs))
        );
    });
}

/**
 * Returns true if the variable appears after the last used argument.
 * @param {Variable} variable
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isAfterLastUsedArg(variable, sourceCode) {
    const def = variable.defs[0];
    const params = sourceCode.getDeclaredVariables(def.node);
    const later = params.slice(params.indexOf(variable) + 1);
    return !later.some(v => v.references.length > 0 || v.eslintUsed);
}

/**
 * Determines whether a variable should be ignored during collection.
 * @param {Variable} variable
 * @param {Scope} scope
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function shouldIgnoreVariable(variable, scope, config, sourceCode) {
    // class name in class scope
    if (scope.type === "class" && scope.block.id === variable.identifiers[0]) return true;
    // function expression name
    if (scope.functionExpressionScope) return true;
    // marked as used via markVariableAsUsed()
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;
    // implicit arguments variable
    if (
        scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
    )
        return true;
    // ignore rest‑sibling
    if (hasRestSpreadSibling(variable, config)) return true;
    // ignore using declarations
    if (config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable))
        return true;
    // exported
    if (isExported(variable)) return true;
    // not used
    if (isUsedVariable(variable, sourceCode)) return false;
    return true;
}

/**
 * Collects unused variables from a scope recursively.
 * @param {Scope} scope
 * @param {Variable[]} result
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @returns {Variable[]}
 */
function collectUnusedVariables(scope, result, config, sourceCode) {
    if (scope.type !== "global" || config.vars === "all") {
        for (const variable of scope.variables) {
            if (shouldIgnoreVariable(variable, scope, config, sourceCode)) continue;

            const def = variable.defs[0];
            if (def) {
                const type = def.type;
                const name = def.name.name;

                // array destructuring ignore pattern
                if (
                    (def.name.parent.type === "ArrayPattern" ||
                        variable.references.some(r => r.identifier.parent.type === "ArrayPattern")) &&
                    config.destructuredArrayIgnorePattern &&
                    config.destructuredArrayIgnorePattern.test(name)
                ) {
                    if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
                        context.report({
                            node: def.name,
                            messageId: "usedIgnoredVar",
                            data: getUsedIgnoredMessageData(variable, "array-destructure"),
                        });
                    }
                    continue;
                }

                // class static block
                if (type === "ClassName") {
                    const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
                    if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) continue;
                }

                // catch clause
                if (type === "CatchClause") {
                    if (config.caughtErrors === "none") continue;
                    if (config.caughtErrorsIgnorePattern?.test(name)) {
                        if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
                            context.report({
                                node: def.name,
                                messageId: "usedIgnoredVar",
                                data: getUsedIgnoredMessageData(variable, "catch-clause"),
                            });
                        }
                        continue;
                    }
                }

                // parameters
                if (type === "Parameter") {
                    if (
                        (def.node.parent.type === "Property" ||
                            def.node.parent.type === "MethodDefinition") &&
                        def.node.parent.kind === "set"
                    )
                        continue;
                    if (config.args === "none") continue;
                    if (config.argsIgnorePattern?.test(name)) {
                        if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
                            context.report({
                                node: def.name,
                                messageId: "usedIgnoredVar",
                                data: getUsedIgnoredMessageData(variable, "parameter"),
                            });
                        }
                        continue;
                    }
                    if (
                        config.args === "after-used" &&
                        astUtils.isFunction(def.name.parent) &&
                        !isAfterLastUsedArg(variable, sourceCode)
                    )
                        continue;
                } else {
                    // generic vars ignore pattern
                    if (config.varsIgnorePattern?.test(name)) {
                        if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
                            context.report({
                                node: def.name,
                                messageId: "usedIgnoredVar",
                                data: getUsedIgnoredMessageData(variable, "variable"),
                            });
                        }
                        continue;
                    }
                }
            }

            result.push(variable);
        }
    }

    for (const child of scope.childScopes) {
        collectUnusedVariables(child, result, config, sourceCode);
    }
    return result;
}

/**
 * Generates message data for a defined unused variable.
 * @param {Variable} unusedVar
 * @returns {UnusedVarMessageData}
 */
function getDefinedMessageData(unusedVar) {
    const def = unusedVar.defs?.[0];
    let additional = "";
    if (def) {
        const [desc, pat] = getVariableDescription(defToVariableType(def));
        if (desc && pat) additional = `. Allowed unused ${desc} must match ${pat}`;
    }
    return { varName: unusedVar.name, action: "defined", additional };
}

/**
 * Generates message data for an assigned unused variable.
 * @param {Variable} unusedVar
 * @returns {UnusedVarMessageData}
 */
function getAssignedMessageData(unusedVar) {
    const def = unusedVar.defs?.[0];
    let additional = "";
    if (def) {
        const [desc, pat] = getVariableDescription(defToVariableType(def));
        if (desc && pat) additional = `. Allowed unused ${desc} must match ${pat}`;
    }
    return { varName: unusedVar.name, action: "assigned a value", additional };
}

/**
 * Generates message data for a used ignored variable.
 * @param {Variable} variable
 * @param {VariableType} variableType
 * @returns {UsedIgnoredVarMessageData}
 */
function getUsedIgnoredMessageData(variable, variableType) {
    const [desc, pat] = getVariableDescription(variableType);
    const additional = desc && pat ? `. Used ${desc} must not match ${pat}` : "";
    return { varName: variable.name, additional };
}

/**
 * Returns a simple variable type for a definition.
 * @param {Object} def
 * @returns {VariableType}
 */
function defToVariableType(def) {
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
 * Returns description and pattern for a variable type.
 * @param {VariableType} variableType
 * @returns {[string|undefined,string|undefined]}
 */
function getVariableDescription(variableType) {
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
 * Returns true if a token is a semicolon.
 * @param {ASTNode} token
 * @returns {boolean}
 */
function isSemicolonToken(token) {
    return token && token.value === ";";
}

/**
 * Returns true if a token is an opening brace.
 * @param {ASTNode} token
 * @returns {boolean}
 */
function isOpeningBraceToken(token) {
    return token && token.value === "{";
}

/**
 * Handles all fix scenarios for an unused variable.
 * @param {Object} fixer
 * @param {Variable} unusedVar
 * @returns {Object|null}
 */
function handleFixes(fixer, unusedVar) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);
    const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

    // -----------------------------------------------------------------
    // Helper factories for token ranges
    // -----------------------------------------------------------------
    const tokenRange = {
        before(node, skips = 0) {
            return sourceCode.getTokenBefore(node, skips).range[0];
        },
        after(node, skips = 0) {
            return sourceCode.getTokenAfter(node, skips).range[1];
        },
        beforeValue(node) {
            return sourceCode.getTokenBefore(node).value;
        },
        afterValue(node) {
            return sourceCode.getTokenAfter(node).value;
        },
    };

    // -----------------------------------------------------------------
    // Guard: multiple write references
    // -----------------------------------------------------------------
    if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

    // -----------------------------------------------------------------
    // VariableDeclarator fixes
    // -----------------------------------------------------------------
    if (parent.type === "VariableDeclarator") {
        return fixVariableDeclarator(parent, tokenBefore, tokenAfter);
    }

    // -----------------------------------------------------------------
    // ObjectPattern fixes
    // -----------------------------------------------------------------
    if (parent.parent.type === "ObjectPattern") {
        return fixObjectPattern(parent, tokenBefore, tokenAfter);
    }

    // -----------------------------------------------------------------
    // ArrayPattern fixes
    // -----------------------------------------------------------------
    if (parent.type === "ArrayPattern") {
        return fixArrayPattern(parent, tokenBefore, tokenAfter);
    }

    // -----------------------------------------------------------------
    // RestElement fixes
    // -----------------------------------------------------------------
    if (parent.type === "RestElement") {
        return fixRestElement(parent, tokenBefore, tokenAfter);
    }

    // -----------------------------------------------------------------
    // AssignmentPattern fixes
    // -----------------------------------------------------------------
    if (parent.type === "AssignmentPattern") {
        return fixAssignmentPattern(parent, tokenBefore, tokenAfter);
    }

    // -----------------------------------------------------------------
    // FunctionDeclaration / FunctionExpression parameter fixes
    // -----------------------------------------------------------------
    if (parent.type === "FunctionDeclaration" && parent.id === id) {
        return fixer.removeRange(parent.range);
    }

    // -----------------------------------------------------------------
    // Import / Export fixes
    // -----------------------------------------------------------------
    if (parent.type === "ImportDefaultSpecifier") return fixImportDefault(parent, tokenAfter);
    if (parent.type === "ImportSpecifier") return fixImportSpecifier(parent, tokenBefore, tokenAfter);
    if (parent.type === "ImportNamespaceSpecifier") return fixImportNamespace(parent);

    // -----------------------------------------------------------------
    // CatchClause, ClassDeclaration, ArrowFunctionExpression, generic
    // -----------------------------------------------------------------
    if (parent.type === "CatchClause") return null;
    if (parent.type === "ClassDeclaration") return fixer.removeRange(parent.range);
    if (parent.type === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfter?.value !== ")")
        return fixer.replaceText(id, "()");

    // -----------------------------------------------------------------
    // Sequence / commas
    // -----------------------------------------------------------------
    if (tokenBefore?.value === ",") return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
    if (tokenAfter?.value === ",") {
        if (tokenBefore?.value === "(") return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        if (tokenBefore?.value === "{") return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
    }

    // -----------------------------------------------------------------
    // Fallback: remove identifier
    // -----------------------------------------------------------------
    return fixer.removeRange(id.range);
}

/**
 * Fixes a VariableDeclarator node.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @returns {Object|null}
 */
function fixVariableDeclarator(node, tokenBefore, tokenAfter) {
    const parent = node.parent;
    // skip loop header
    if (astUtils.isLoop(parent.parent.parent)) return null;

    // single declaration
    if (parent.declarations.length === 1) {
        const next = sourceCode.getTokenAfter(parent);
        const prev = sourceCode.getTokenBefore(parent);
        if (next && (!isSemicolonToken(next) && !isOpeningBraceToken(prev))) return null;
        return fixer.removeRange(parent.range);
    }

    // multiple declarations – remove this one
    if (tokenBefore.value === ",") {
        return fixer.removeRange([tokenRange.before(node), node.range[1]]);
    }
    return fixer.removeRange([node.range[0], tokenRange.after(node)]);
}

/**
 * Fixes an ObjectPattern variable.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @returns {Object|null}
 */
function fixObjectPattern(node, tokenBefore, tokenAfter) {
    const parent = node.parent;
    if (parent.properties.length === 1) {
        if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent);
        if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
        return fixVariables(parent);
    }

    if (tokenBefore.value === ":") {
        if (tokenRange.beforeValue(parent) === "{" && tokenRange.afterValue(parent) === ",") {
            return fixer.removeRange([parent.range[0], tokenRange.after(parent)]);
        }
        return fixer.removeRange([tokenRange.before(parent), node.range[1]]);
    }
    return null;
}

/**
 * Fixes an ArrayPattern variable.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @returns {Object|null}
 */
function fixArrayPattern(node, tokenBefore, tokenAfter) {
    if (hasSingleElement(node)) {
        if (node.parent.type === "RestElement") return fixRestInPattern(node.parent);
        if (node.parent.type === "ArrayPattern") return fixNestedArrayVariable(node);
        return fixVariables(node);
    }

    if (tokenBefore.value === "," && tokenAfter.value === "]") {
        return fixer.removeRange([tokenRange.before(node), node.range[1]]);
    }
    return fixer.removeRange(node.range);
}

/**
 * Fixes a RestElement node.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @returns {Object|null}
 */
function fixRestElement(node, tokenBefore, tokenAfter) {
    const parent = node.parent;
    if (parent.type === "ArrayPattern") {
        if (hasSingleElement(parent)) {
            if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
            return fixVariables(parent);
        }
        return fixer.removeRange([tokenRange.before(id, 1), id.range[1]]);
    }
    if (parent.type === "ObjectPattern") {
        if (parent.properties.length === 1) return fixVariables(parent);
        return fixer.removeRange([tokenRange.before(id, 1), id.range[1]]);
    }
    if (astUtils.isFunction(parent)) {
        if (parent.params.length === 1) return fixer.removeRange(node.range);
        return fixer.removeRange([tokenRange.before(node), node.range[1]]);
    }
    return null;
}

/**
 * Fixes an AssignmentPattern node.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @returns {Object|null}
 */
function fixAssignmentPattern(node, tokenBefore, tokenAfter) {
    const parent = node.parent;
    if (parent.type === "ArrayPattern") return fixNestedArrayVariable(node);
    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) {
            if (parent.parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent.parent);
            return fixVariables(parent.parent);
        }
        if (tokenRange.beforeValue(parent.parent) === "{" && tokenRange.afterValue(parent.parent) === ",") {
            return fixer.removeRange([parent.parent.range[0], tokenRange.after(parent.parent)]);
        }
        return fixer.removeRange([tokenRange.before(parent.parent), parent.parent.range[1]]);
    }
    if (astUtils.isFunction(parent)) return fixFunctionParameters(node);
    return null;
}

/**
 * Fixes a default import.
 * @param {ASTNode} node
 * @param {ASTNode} tokenAfter
 * @returns {Object|null}
 */
function fixImportDefault(node, tokenAfter) {
    const hasOther = node.parent.specifiers.some(s => s.type !== "ImportDefaultSpecifier");
    if (!hasOther) {
        return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
    }
    return fixer.removeRange([node.id.range[0], tokenAfter.range[1]]);
}

/**
 * Fixes a named import specifier.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @returns {Object|null}
 */
function fixImportSpecifier(node, tokenBefore, tokenAfter) {
    const siblings = node.parent.specifiers.filter(s => s.type === "ImportSpecifier");
    if (siblings.length === 1) {
        const hasDefault = node.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier");
        if (!hasDefault) return fixer.removeRange(node.parent.range);
        return fixer.removeRange([tokenRange.before(node, 1), tokenAfter.range[1]]);
    }
    if (tokenRange.beforeValue(node) === "{") {
        return fixer.removeRange([node.range[0], tokenRange.after(node)]);
    }
    return fixer.removeRange([tokenRange.before(node), node.range[1]]);
}

/**
 * Fixes a namespace import.
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixImportNamespace(node) {
    const hasDefault = node.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier");
    if (hasDefault) {
        return fixer.removeRange([tokenRange.before(node), node.range[1]]);
    }
    return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
}

/**
 * Fixes function parameters (used by several helpers).
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixFunctionParameters(node) {
    const parent = node.parent;
    if (!astUtils.isFunction(parent)) return null;
    if (parent.params.length === 1) return fixer.removeRange(node.range);
    if (tokenRange.beforeValue(node) === "(" && tokenRange.afterValue(node) === ",")
        return fixer.removeRange([node.range[0], tokenRange.after(node)]);
    return fixer.removeRange([tokenRange.before(node), node.range[1]]);
}

/**
 * Checks if a node has a single non‑null element.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function hasSingleElement(node) {
    return node.elements.filter(e => e !== null).length === 1;
}

/**
 * Fixes nested object variables.
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixNestedObjectVariable(node) {
    const parent = node.parent;
    if (parent.parent.parent.parent.type === "ObjectPattern" && parent.parent.properties.length === 1) {
        return fixNestedObjectVariable(parent.parent);
    }
    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) return fixVariables(parent.parent);
        if (tokenRange.beforeValue(parent) === "{") {
            return fixer.removeRange([parent.range[0], tokenRange.after(parent)]);
        }
        return fixer.removeRange([tokenRange.before(parent), parent.range[1]]);
    }
    return null;
}

/**
 * Fixes nested array variables.
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixNestedArrayVariable(node) {
    const parent = node.parent;
    if (parent.parent.type === "ArrayPattern" && hasSingleElement(parent)) {
        return fixNestedArrayVariable(parent);
    }
    if (hasSingleElement(parent)) {
        if (tokenRange.beforeValue(parent) === ":") return fixVariables(parent);
        if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent);
        return fixVariables(parent);
    }
    if (tokenRange.beforeValue(node) === "," && tokenRange.afterValue(node) === "]") {
        return fixer.removeRange([tokenRange.before(node), node.range[1]]);
    }
    return fixer.removeRange(node.range);
}

/**
 * Fixes object with value separator (e.g., `{a: {b}}`).
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixObjectWithValueSeparator(node) {
    const parent = node.parent.parent;
    if (parent.parent.type === "ArrayPattern" && parent.properties.length === 1) {
        return fixNestedArrayVariable(parent);
    }
    return fixNestedObjectVariable(node);
}

/**
 * Fixes rest patterns (e.g., `...[[a]]`).
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixRestInPattern(node) {
    const parent = node.parent;
    if (astUtils.isFunction(parent)) {
        if (parent.params.length === 1) return fixer.removeRange(node.range);
        return fixer.removeRange([tokenRange.before(node), node.range[1]]);
    }
    if (parent.type === "ArrayPattern") {
        if (hasSingleElement(parent)) {
            if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
            return fixVariables(parent);
        }
        return fixer.removeRange([tokenRange.before(node), node.range[1]]);
    }
    return null;
}

/**
 * Fixes generic variable nodes (object/array patterns, parameters).
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixVariables(node) {
    const parent = node.parent;
    if (parent.type === "VariableDeclarator") return fixVariableDeclarator(parent);
    if (parent.parent.type === "ObjectPattern") return fixObjectPattern(node);
    if (parent.type === "ArrayPattern") return fixArrayPattern(node);
    return fixFunctionParameters(node);
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

        // -----------------------------------------------------------------
        // Configuration parsing
        // -----------------------------------------------------------------
        const firstOption = context.options[0];
        if (firstOption) {
            if (typeof firstOption === "string") {
                config.vars = firstOption;
            } else {
                Object.assign(config, {
                    vars: firstOption.vars || config.vars,
                    args: firstOption.args || config.args,
                    ignoreRestSiblings: firstOption.ignoreRestSiblings ?? config.ignoreRestSiblings,
                    caughtErrors: firstOption.caughtErrors || config.caughtErrors,
                    ignoreClassWithStaticInitBlock: firstOption.ignoreClassWithStaticInitBlock ?? config.ignoreClassWithStaticInitBlock,
                    ignoreUsingDeclarations: firstOption.ignoreUsingDeclarations ?? config.ignoreUsingDeclarations,
                    reportUsedIgnorePattern: firstOption.reportUsedIgnorePattern ?? config.reportUsedIgnorePattern,
                });
                if (firstOption.varsIgnorePattern) config.varsIgnorePattern = new RegExp(firstOption.varsIgnorePattern, "u");
                if (firstOption.argsIgnorePattern) config.argsIgnorePattern = new RegExp(firstOption.argsIgnorePattern, "u");
                if (firstOption.caughtErrorsIgnorePattern) config.caughtErrorsIgnorePattern = new RegExp(firstOption.caughtErrorsIgnorePattern, "u");
                if (firstOption.destructuredArrayIgnorePattern) config.destructuredArrayIgnorePattern = new RegExp(firstOption.destructuredArrayIgnorePattern, "u");
            }
        }

        // -----------------------------------------------------------------
        // Public listeners
        // -----------------------------------------------------------------
        return {
            "Program:exit"(programNode) {
                const unused = collectUnusedVariables(sourceCode.getScope(programNode), [], config, sourceCode);
                for (const unusedVar of unused) {
                    if (unusedVar.defs.length > 0) {
                        const writeRefs = unusedVar.references.filter(
                            r => r.isWrite() && r.from.variableScope === unusedVar.scope.variableScope
                        );
                        const lastWrite = writeRefs.length ? writeRefs.at(-1) : null;
                        context.report({
                            node: lastWrite ? lastWrite.identifier : unusedVar.identifiers[0],
                            messageId: "unusedVar",
                            data: unusedVar.references.some(r => r.isWrite())
                                ? getAssignedMessageData(unusedVar)
                                : getDefinedMessageData(unusedVar),
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
                        const comment = unusedVar.eslintExplicitGlobalComments[0];
                        context.report({
                            node: programNode,
                            loc: astUtils.getNameLocationInGlobalDirectiveComment(
                                sourceCode,
                                comment,
                                unusedVar.name
                            ),
                            messageId: "unusedVar",
                            data: getDefinedMessageData(unusedVar),
                        });
                    }
                }
            },
        };
    },
};
```
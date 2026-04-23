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
// Helper predicates
//------------------------------------------------------------------------------

/**
 * Checks if a node is a function.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isFunction(node) {
    return astUtils.isFunction(node);
}

/**
 * Checks if a node is a loop.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isLoop(node) {
    return astUtils.isLoop(node);
}

/**
 * Checks if a token is a semicolon.
 * @param {ASTNode} token
 * @returns {boolean}
 */
function isSemicolonToken(token) {
    return astUtils.isSemicolonToken(token);
}

/**
 * Checks if a token is an opening brace.
 * @param {ASTNode} token
 * @returns {boolean}
 */
function isOpeningBraceToken(token) {
    return astUtils.isOpeningBraceToken(token);
}

/**
 * Checks if a node is a statement or declaration.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isStatementOrDeclaration(node) {
    return /(?:Statement|Declaration)$/u.test(node.type);
}

/**
 * Checks if a node is a logical assignment operator.
 * @param {string} operator
 * @returns {boolean}
 */
function isLogicalAssignmentOperator(operator) {
    return astUtils.isLogicalAssignmentOperator(operator);
}

/**
 * Checks if a node is a read reference.
 * @param {Reference} ref
 * @returns {boolean}
 */
function isReadRef(ref) {
    return ref.isRead();
}

/**
 * Checks if a reference is a self‑reference.
 * @param {Reference} ref
 * @param {ASTNode[]} functionNodes
 * @returns {boolean}
 */
function isSelfReference(ref, functionNodes) {
    let scope = ref.from;
    while (scope) {
        if (functionNodes.includes(scope.block)) {
            return true;
        }
        scope = scope.upper;
    }
    return false;
}

/**
 * Checks if a node is inside another node.
 * @param {ASTNode} inner
 * @param {ASTNode} outer
 * @returns {boolean}
 */
function isInside(inner, outer) {
    return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * Checks if a node is an unused expression.
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
 * Checks if a reference is a read that updates itself.
 * @param {Reference} ref
 * @param {ASTNode|null} rhsNode
 * @returns {boolean}
 */
function isReadForItself(ref, rhsNode) {
    const id = ref.identifier;
    const parent = id.parent;

    const selfUpdate =
        (parent.type === "AssignmentExpression" &&
            parent.left === id &&
            isUnusedExpression(parent) &&
            !isLogicalAssignmentOperator(parent.operator)) ||
        (parent.type === "UpdateExpression" && isUnusedExpression(parent));

    const rhsSelf =
        rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode);

    return ref.isRead() && (selfUpdate || rhsSelf);
}

/**
 * Checks if a reference is used in a for‑in/of loop that returns.
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
    return target && target.type === "ReturnStatement";
}

/**
 * Checks if a node is a rest sibling.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function hasRestSibling(node) {
    return (
        node.type === "Property" &&
        node.parent.type === "ObjectPattern" &&
        /^(?:RestElement|(?:Experimental)?RestProperty)$/u.test(
            node.parent.properties.at(-1).type,
        )
    );
}

/**
 * Checks if a variable has a rest‑sibling according to config.
 * @param {Variable} variable
 * @param {Object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
    if (!config.ignoreRestSiblings) {
        return false;
    }
    const hasDef = variable.defs.some(def => hasRestSibling(def.name.parent));
    const hasRef = variable.references.some(ref => hasRestSibling(ref.identifier.parent));
    return hasDef || hasRef;
}

/**
 * Checks if a variable uses explicit resource management.
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
 * Checks if a variable is exported.
 * @param {Variable} variable
 * @returns {boolean}
 */
function isExported(variable) {
    const def = variable.defs[0];
    if (!def) {
        return false;
    }
    let node = def.node;
    if (node.type === "VariableDeclarator") {
        node = node.parent;
    } else if (def.type === "Parameter") {
        return false;
    }
    return node.parent.type.indexOf("Export") === 0;
}

/**
 * Returns the RHS node of an assignment if the reference is the LHS.
 * @param {Reference} ref
 * @param {ASTNode|null} prevRhsNode
 * @param {SourceCode} sourceCode
 * @returns {ASTNode|null}
 */
function getRhsNode(ref, prevRhsNode, sourceCode) {
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
 * Determines if a function node is stored somewhere.
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
                if (isStatementOrDeclaration(parent)) {
                    return true;
                }
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
 * Determines the variable type of a definition.
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
 * Returns description and ignore pattern for a variable type.
 * @param {VariableType} variableType
 * @param {Object} config
 * @returns {[string|undefined, string|undefined]}
 */
function getVariableDescription(variableType, config) {
    let pattern;
    let description;
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
    if (pattern) {
        pattern = pattern.toString();
    }
    return [description, pattern];
}

/**
 * Builds message data for a defined but unused variable.
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
 * Builds message data for an assigned but unused variable.
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
 * Builds message data for a used ignored variable.
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
 * Returns true if a parameter is after the last used argument.
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
 * Determines if a variable is used.
 * @param {Variable} variable
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isUsedVariable(variable, sourceCode) {
    if (variable.eslintUsed) {
        return true;
    }
    const functionNodes = getFunctionDefinitions(variable);
    const isFuncDef = functionNodes.length > 0;
    let rhsNode = null;

    return variable.references.some(ref => {
        if (isForInOfRef(ref)) {
            return true;
        }
        const self = isReadForItself(ref, rhsNode);
        rhsNode = getRhsNode(ref, rhsNode, sourceCode);
        return (
            isReadRef(ref) &&
            !self &&
            !(isFuncDef && isSelfReference(ref, functionNodes))
        );
    });
}

/**
 * Retrieves function definitions for a variable.
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
 * Collects unused variables from a scope.
 * @param {Scope} scope
 * @param {Variable[]} accumulator
 * @param {SourceCode} sourceCode
 * @param {Object} config
 * @returns {Variable[]}
 */
function collectUnusedVariables(scope, accumulator, sourceCode, config) {
    if (scope.type !== "global" && config.vars !== "all") {
        // nothing to collect in non‑global scopes when vars === "all" is false
    }

    if (scope.type !== "global" || config.vars === "all") {
        for (const variable of scope.variables) {
            if (shouldSkipVariable(variable, scope, config, sourceCode)) {
                continue;
            }

            if (
                !isUsedVariable(variable, sourceCode) &&
                !isExported(variable) &&
                !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
                !hasRestSpreadSibling(variable, config)
            ) {
                accumulator.push(variable);
            }
        }
    }

    for (const child of scope.childScopes) {
        collectUnusedVariables(child, accumulator, sourceCode, config);
    }

    return accumulator;
}

/**
 * Determines whether a variable should be skipped during collection.
 * @param {Variable} variable
 * @param {Scope} scope
 * @param {Object} config
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function shouldSkipVariable(variable, scope, config, sourceCode) {
    // class name in class scope
    if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
        return true;
    }
    // function expression name
    if (scope.functionExpressionScope) {
        return true;
    }
    // marked as used via markVariableAsUsed()
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
        return true;
    }
    // implicit arguments variable
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

    // array destructuring ignore pattern
    if (
        (def.name.parent.type === "ArrayPattern" ||
            variable.references.some(ref => ref.identifier.parent.type === "ArrayPattern")) &&
        config.destructuredArrayIgnorePattern &&
        config.destructuredArrayIgnorePattern.test(def.name.name)
    ) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
            reportUsedIgnored(variable, "array-destructure", sourceCode, config);
        }
        return true;
    }

    // class static block ignore
    if (def.type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(node => node.type === "StaticBlock");
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
            config.caughtErrorsIgnorePattern &&
            config.caughtErrorsIgnorePattern.test(def.name.name)
        ) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
                reportUsedIgnored(variable, "catch-clause", sourceCode, config);
            }
            return true;
        }
        return false;
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
            config.argsIgnorePattern &&
            config.argsIgnorePattern.test(def.name.name)
        ) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
                reportUsedIgnored(variable, "parameter", sourceCode, config);
            }
            return true;
        }
        if (
            config.args === "after-used" &&
            isFunction(def.name.parent) &&
            !isAfterLastUsedArg(variable, sourceCode)
        ) {
            return true;
        }
        return false;
    }

    // generic variable ignore pattern
    if (
        config.varsIgnorePattern &&
        config.varsIgnorePattern.test(def.name.name)
    ) {
        if (config.reportUsedIgnorePattern && isUsedVariable(variable, sourceCode)) {
            reportUsedIgnored(variable, "variable", sourceCode, config);
        }
        return true;
    }

    return false;
}

/**
 * Reports a used ignored variable.
 * @param {Variable} variable
 * @param {VariableType} type
 * @param {SourceCode} sourceCode
 * @param {Object} config
 */
function reportUsedIgnored(variable, type, sourceCode, config) {
    const context = config._context; // injected later
    context.report({
        node: variable.defs[0].name,
        messageId: "usedIgnoredVar",
        data: getUsedIgnoredMessageData(variable, type, config),
    });
}

/**
 * Handles fixes for an unused variable.
 * @param {Object} fixer
 * @param {Variable} unusedVar
 * @param {SourceCode} sourceCode
 * @returns {Object|null}
 */
function handleFixes(fixer, unusedVar, sourceCode) {
    const id = unusedVar.identifiers[0];
    const parent = id.parent;
    const tokenBefore = sourceCode.getTokenBefore(id);
    const tokenAfter = sourceCode.getTokenAfter(id);
    const allWriteRefs = unusedVar.references.filter(ref => ref.isWrite());

    // Guard: if any write reference does not belong to this identifier, abort.
    if (allWriteRefs.some(ref => ref.identifier.range[0] !== id.range[0])) {
        return null;
    }

    // Helper utilities for token ranges
    const getPrevStart = (node, skips = 0) => sourceCode.getTokenBefore(node, skips).range[0];
    const getNextEnd = (node, skips = 0) => sourceCode.getTokenAfter(node, skips).range[1];
    const tokenValue = node => sourceCode.getTokenAfter(node).value;
    const tokenBeforeValue = node => sourceCode.getTokenBefore(node).value;
    const tokenAfterValue = node => sourceCode.getTokenAfter(node).value;

    // Declaration safety check
    const isDeclNotSafe = (next, prev) =>
        next.type === "String" ||
        (prev && !isSemicolonToken(prev) && !isOpeningBraceToken(prev));

    // ----------------------------------------------------------------------
    // Fix strategies
    // ----------------------------------------------------------------------
    // VariableDeclarator
    if (parent.type === "VariableDeclarator") {
        return fixVariableDeclarator(parent, tokenBefore, tokenAfter, sourceCode, fixer, isLoop, isDeclNotSafe);
    }

    // ObjectPattern
    if (parent.parent.type === "ObjectPattern") {
        return fixObjectPattern(parent, tokenBefore, tokenAfter, sourceCode, fixer);
    }

    // ArrayPattern
    if (parent.type === "ArrayPattern") {
        return fixArrayPattern(parent, tokenBefore, tokenAfter, sourceCode, fixer);
    }

    // RestElement
    if (parent.type === "RestElement") {
        return fixRestElement(parent, tokenBefore, tokenAfter, sourceCode, fixer);
    }

    // AssignmentPattern
    if (parent.type === "AssignmentPattern") {
        return fixAssignmentPattern(parent, tokenBefore, tokenAfter, sourceCode, fixer);
    }

    // FunctionDeclaration
    if (parent.type === "FunctionDeclaration" && parent.id === id) {
        return fixer.removeRange(parent.range);
    }

    // Import handling
    if (parent.type === "ImportDefaultSpecifier") {
        return fixImportDefaultSpecifier(parent, tokenAfter, sourceCode, fixer);
    }
    if (parent.type === "ImportSpecifier") {
        return fixImportSpecifier(parent, tokenBefore, tokenAfter, sourceCode, fixer);
    }
    if (parent.type === "ImportNamespaceSpecifier") {
        return fixImportNamespaceSpecifier(parent, sourceCode, fixer);
    }

    // CatchClause
    if (parent.type === "CatchClause") {
        return null;
    }

    // ClassDeclaration
    if (parent.type === "ClassDeclaration") {
        return fixer.removeRange(parent.range);
    }

    // Sequence handling
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

    // Arrow function single param without parentheses
    if (
        parent.type === "ArrowFunctionExpression" &&
        parent.params.length === 1 &&
        tokenAfter?.value !== ")"
    ) {
        return fixer.replaceText(id, "()");
    }

    // Fallback: remove identifier
    return fixer.removeRange(id.range);
}

/**
 * Fixes a VariableDeclarator node.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @param {Function} isLoopFn
 * @param {Function} isDeclNotSafeFn
 * @returns {Object|null}
 */
function fixVariableDeclarator(node, tokenBefore, tokenAfter, sourceCode, fixer, isLoopFn, isDeclNotSafeFn) {
    const parent = node.parent;
    // single declaration
    if (parent.declarations.length === 1) {
        if (isLoopFn(parent.parent.parent) && parent.parent.parent.body !== parent.parent) {
            return null;
        }
        if (
            parent.parent.parent.type === "IfStatement" ||
            isLoopFn(parent.parent.parent) ||
            (parent.parent.parent.type === "WithStatement" && parent.parent.parent.body === parent.parent)
        ) {
            return fixer.replaceText(parent.parent, ";");
        }
        const next = sourceCode.getTokenAfter(parent.parent);
        const prev = sourceCode.getTokenBefore(parent.parent);
        if (next && isDeclNotSafeFn(next, prev)) {
            return null;
        }
        return fixer.removeRange(parent.parent.range);
    }

    // multiple declarations
    if (tokenBefore.value === ",") {
        return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
    }
    return fixer.removeRange([node.range[0], getNextEnd(node)]);
}

/**
 * Fixes an ObjectPattern variable.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @returns {Object|null}
 */
function fixObjectPattern(node, tokenBefore, tokenAfter, sourceCode, fixer) {
    const parent = node.parent;
    if (parent.properties.length === 1) {
        if (parent.parent.type === "RestElement") {
            return fixRestInPattern(parent.parent, sourceCode, fixer);
        }
        if (parent.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(parent);
        }
        return fixVariables(parent);
    }

    if (tokenBefore.value === ":") {
        if (tokenBeforeValue(parent) === "{" && tokenAfterValue(parent) === ",") {
            return fixer.removeRange([parent.range[0], getNextEnd(parent)]);
        }
        return fixer.removeRange([getPrevStart(parent), node.range[1]]);
    }
    return null;
}

/**
 * Fixes an ArrayPattern variable.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @returns {Object|null}
 */
function fixArrayPattern(node, tokenBefore, tokenAfter, sourceCode, fixer) {
    if (hasSingleElement(node)) {
        if (node.parent.type === "RestElement") {
            return fixRestInPattern(node.parent, sourceCode, fixer);
        }
        if (node.parent.type === "ArrayPattern") {
            return fixNestedArrayVariable(node);
        }
        return fixVariables(node);
    }

    if (tokenBefore.value === "," && tokenAfter.value === ",") {
        return fixer.removeRange(node.range);
    }
    return null;
}

/**
 * Fixes a RestElement node.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @returns {Object|null}
 */
function fixRestElement(node, tokenBefore, tokenAfter, sourceCode, fixer) {
    const parent = node.parent;
    if (parent.type === "ArrayPattern") {
        if (hasSingleElement(parent)) {
            if (parent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(parent);
            }
            return fixVariables(parent);
        }
        return fixer.removeRange([getPrevStart(node, 1), node.range[1]]);
    }
    if (parent.type === "ObjectPattern") {
        if (parent.properties.length === 1) {
            return fixVariables(parent);
        }
        return fixer.removeRange([getPrevStart(node, 1), node.range[1]]);
    }
    if (isFunction(parent)) {
        if (parent.params.length === 1) {
            return fixer.removeRange(node.range);
        }
        return fixer.removeRange([getPrevStart(node), node.range[1]]);
    }
    return null;
}

/**
 * Fixes an AssignmentPattern node.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @returns {Object|null}
 */
function fixAssignmentPattern(node, tokenBefore, tokenAfter, sourceCode, fixer) {
    if (node.parent.type === "ArrayPattern") {
        return fixNestedArrayVariable(node);
    }
    if (node.parent.parent.type === "ObjectPattern") {
        const objParent = node.parent.parent;
        if (objParent.properties.length === 1) {
            if (objParent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(objParent.parent);
            }
            return fixVariables(objParent);
        }
        if (tokenBeforeValue(objParent) === "{" && tokenAfterValue(objParent) === ",") {
            return fixer.removeRange([objParent.range[0], getNextEnd(objParent)]);
        }
        return fixer.removeRange([getPrevStart(objParent), objParent.range[1]]);
    }
    if (isFunction(node.parent)) {
        return fixFunctionParameters(node);
    }
    return null;
}

/**
 * Fixes function parameters.
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixFunctionParameters(node) {
    const parent = node.parent;
    if (!isFunction(parent)) {
        return null;
    }
    if (parent.params.length === 1) {
        return fixer => fixer.removeRange(node.range);
    }
    if (tokenBeforeValue(node) === "(" && tokenAfterValue(node) === ",") {
        return fixer => fixer.removeRange([node.range[0], getNextEnd(node)]);
    }
    return fixer => fixer.removeRange([getPrevStart(node), node.range[1]]);
}

/**
 * Fixes a default import specifier.
 * @param {ASTNode} node
 * @param {ASTNode} tokenAfter
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @returns {Object|null}
 */
function fixImportDefaultSpecifier(node, tokenAfter, sourceCode, fixer) {
    const parent = node.parent;
    const hasOtherSpecifiers = parent.specifiers.some(
        e => e.type !== "ImportDefaultSpecifier",
    );
    if (!hasOtherSpecifiers) {
        return fixer.removeRange([node.range[0], parent.source.range[0]]);
    }
    return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
}

/**
 * Fixes a named import specifier.
 * @param {ASTNode} node
 * @param {ASTNode} tokenBefore
 * @param {ASTNode} tokenAfter
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @returns {Object|null}
 */
function fixImportSpecifier(node, tokenBefore, tokenAfter, sourceCode, fixer) {
    const parent = node.parent;
    const namedCount = parent.specifiers.filter(e => e.type === "ImportSpecifier").length;
    if (namedCount === 1) {
        const hasDefault = parent.specifiers.some(e => e.type === "ImportDefaultSpecifier");
        if (!hasDefault) {
            return fixer.removeRange(parent.range);
        }
        return fixer.removeRange([
            getPrevStart(node, 1),
            tokenAfter.range[1],
        ]);
    }
    if (tokenBeforeValue(node) === "{") {
        return fixer.removeRange([node.range[0], getNextEnd(node)]);
    }
    return fixer.removeRange([getPrevStart(node), node.range[1]]);
}

/**
 * Fixes a namespace import specifier.
 * @param {ASTNode} node
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @returns {Object|null}
 */
function fixImportNamespaceSpecifier(node, sourceCode, fixer) {
    const parent = node.parent;
    const hasDefault = parent.specifiers.some(e => e.type === "ImportDefaultSpecifier");
    if (hasDefault) {
        return fixer.removeRange([getPrevStart(node), node.range[1]]);
    }
    return fixer.removeRange([node.range[0], parent.source.range[0]]);
}

/**
 * Checks if an array pattern has a single non‑null element.
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
    if (
        parent.parent.parent.parent.type === "ObjectPattern" &&
        parent.parent.properties.length === 1
    ) {
        return fixNestedObjectVariable(parent.parent);
    }
    if (parent.parent.type === "ObjectPattern") {
        if (parent.parent.properties.length === 1) {
            return fixVariables(parent.parent);
        }
        if (tokenBeforeValue(parent) === "{") {
            return fixer.removeRange([parent.range[0], getNextEnd(parent)]);
        }
        return fixer.removeRange([getPrevStart(parent), parent.range[1]]);
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
    if (
        parent.parent.type === "ArrayPattern" &&
        hasSingleElement(parent)
    ) {
        return fixNestedArrayVariable(parent);
    }
    if (hasSingleElement(parent)) {
        if (tokenBeforeValue(parent) === ":") {
            return fixVariables(parent);
        }
        if (parent.parent.type === "RestElement") {
            return fixRestInPattern(parent.parent, sourceCode, fixer);
        }
        return fixVariables(parent);
    }
    if (tokenBeforeValue(node) === "," && tokenAfterValue(node) === "]") {
        return fixer.removeRange([getPrevStart(node), node.range[1]]);
    }
    return fixer.removeRange(node.range);
}

/**
 * Fixes rest patterns.
 * @param {ASTNode} node
 * @param {SourceCode} sourceCode
 * @param {Object} fixer
 * @returns {Object|null}
 */
function fixRestInPattern(node, sourceCode, fixer) {
    const parent = node.parent;
    if (isFunction(parent)) {
        if (parent.params.length === 1) {
            return fixer.removeRange(node.range);
        }
        return fixer.removeRange([getPrevStart(node), node.range[1]]);
    }
    if (parent.type === "ArrayPattern") {
        if (hasSingleElement(parent)) {
            if (parent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(parent);
            }
            return fixVariables(parent);
        }
        return fixer.removeRange([getPrevStart(node), node.range[1]]);
    }
    return null;
}

/**
 * Fixes generic variables (object or array patterns).
 * @param {ASTNode} node
 * @returns {Object|null}
 */
function fixVariables(node) {
    const parent = node.parent;
    if (parent.type === "VariableDeclarator") {
        // delegated to fixVariableDeclarator
        return null;
    }
    if (tokenBeforeValue(node) === ":") {
        if (parent.parent.type === "ObjectPattern") {
            return fixNestedObjectVariable(node);
        }
    }
    return fixFunctionParameters(node);
}

/**
 * Parses rule options into a configuration object.
 * @param {RuleContext} context
 * @returns {Object}
 */
function parseOptions(context) {
    const config = {
        vars: "all",
        args: "after-used",
        ignoreRestSiblings: false,
        caughtErrors: "all",
        ignoreClassWithStaticInitBlock: false,
        ignoreUsingDeclarations: false,
        reportUsedIgnorePattern: false,
        _context: context,
    };
    const first = context.options[0];
    if (!first) {
        return config;
    }
    if (typeof first === "string") {
        config.vars = first;
        return config;
    }
    Object.assign(config, {
        vars: first.vars || config.vars,
        args: first.args || config.args,
        ignoreRestSiblings: first.ignoreRestSiblings || config.ignoreRestSiblings,
        caughtErrors: first.caughtErrors || config.caughtErrors,
        ignoreClassWithStaticInitBlock:
            first.ignoreClassWithStaticInitBlock ||
            config.ignoreClassWithStaticInitBlock,
        ignoreUsingDeclarations:
            first.ignoreUsingDeclarations ||
            config.ignoreUsingDeclarations,
        reportUsedIgnorePattern:
            first.reportUsedIgnorePattern ||
            config.reportUsedIgnorePattern,
    });
    if (first.varsIgnorePattern) {
        config.varsIgnorePattern = new RegExp(first.varsIgnorePattern, "u");
    }
    if (first.argsIgnorePattern) {
        config.argsIgnorePattern = new RegExp(first.argsIgnorePattern, "u");
    }
    if (first.caughtErrorsIgnorePattern) {
        config.caughtErrorsIgnorePattern = new RegExp(first.caughtErrorsIgnorePattern, "u");
    }
    if (first.destructuredArrayIgnorePattern) {
        config.destructuredArrayIgnorePattern = new RegExp(first.destructuredArrayIgnorePattern, "u");
    }
    return config;
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
        const config = parseOptions(context);

        return {
            "Program:exit"(programNode) {
                const unused = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    [],
                    sourceCode,
                    config,
                );

                for (const variable of unused) {
                    const writeRefs = variable.references.filter(
                        ref => ref.isWrite() && ref.from.variableScope === variable.scope.variableScope,
                    );
                    const reportNode = writeRefs.length
                        ? writeRefs.at(-1).identifier
                        : variable.identifiers[0];

                    context.report({
                        node: reportNode,
                        messageId: "unusedVar",
                        data: variable.references.some(ref => ref.isWrite())
                            ? getAssignedMessageData(variable, config)
                            : getDefinedMessageData(variable, config),
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
                }

                // globals comment handling
                for (const variable of unused) {
                    if (variable.eslintExplicitGlobalComments) {
                        const comment = variable.eslintExplicitGlobalComments[0];
                        context.report({
                            node: programNode,
                            loc: astUtils.getNameLocationInGlobalDirectiveComment(
                                sourceCode,
                                comment,
                                variable.name,
                            ),
                            messageId: "unusedVar",
                            data: getDefinedMessageData(variable, config),
                        });
                    }
                }
            },
        };
    },
};
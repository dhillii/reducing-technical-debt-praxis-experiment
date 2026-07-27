/**
 * Gets an array of variables without read references.
 * @param {Scope} scope an eslint-scope Scope object.
 * @param {Variable[]} unusedVars an array that saving result.
 * @returns {Variable[]} unused variables of the scope and descendant scopes.
 * @private
 */
function collectUnusedVariables(scope, unusedVars) {
    const variables = scope.variables;
    const childScopes = scope.childScopes;

    if (scope.type !== "global" || config.vars === "all") {
        variables.forEach(variable => {
            if (shouldSkipVariable(variable, scope)) return;

            const def = variable.defs[0];
            if (!def) return;

            if (shouldSkipDefinition(def, variable, config)) return;

            if (!isUsedVariable(variable) && !isExported(variable) && !hasRestSpreadSibling(variable)) {
                unusedVars.push(variable);
            }
        });
    }

    childScopes.forEach(childScope => {
        collectUnusedVariables(childScope, unusedVars);
    });

    return unusedVars;
}

/**
 * Checks if a variable should be skipped.
 * @param {Variable} variable eslint-scope variable object.
 * @param {Scope} scope an eslint-scope Scope object.
 * @returns {boolean} True if the variable should be skipped, false if not.
 * @private
 */
function shouldSkipVariable(variable, scope) {
    if (scope.type === "class" && scope.block.id === variable.identifiers[0]) return true;
    if (scope.functionExpressionScope) return true;
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;
    if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) return true;
    return false;
}

/**
 * Checks if a definition should be skipped.
 * @param {Object} def the declaration to check
 * @param {Variable} variable eslint-scope variable object.
 * @param {Object} config configuration object
 * @returns {boolean} True if the definition should be skipped, false if not.
 * @private
 */
function shouldSkipDefinition(def, variable, config) {
    const type = def.type;
    const refUsedInArrayPatterns = variable.references.some(ref => ref.identifier.parent.type === "ArrayPattern");

    if (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) {
        if (config.destructuredArrayIgnorePattern && config.destructuredArrayIgnorePattern.test(def.name.name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "array-destructure"),
                });
            }
            return true;
        }
    }

    if (type === "ClassName") {
        const hasStaticBlock = def.node.body.body.some(node => node.type === "StaticBlock");
        if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
    }

    if (type === "CatchClause") {
        if (config.caughtErrors === "none") return true;
        if (config.caughtErrorsIgnorePattern && config.caughtErrorsIgnorePattern.test(def.name.name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "catch-clause"),
                });
            }
            return true;
        }
    } else if (type === "Parameter") {
        if (config.args === "none") return true;
        if (config.argsIgnorePattern && config.argsIgnorePattern.test(def.name.name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "parameter"),
                });
            }
            return true;
        }
        if (config.args === "after-used" && astUtils.isFunction(def.name.parent) && !isAfterLastUsedArg(variable)) return true;
    } else {
        if (config.varsIgnorePattern && config.varsIgnorePattern.test(def.name.name)) {
            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "variable"),
                });
            }
            return true;
        }
    }

    return false;
}
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

    // Filter variables based on scope type and config
    const filteredVariables = filterVariables(variables, scope, unusedVars);

    // Recursively collect unused variables from child scopes
    collectFromChildScopes(childScopes, unusedVars);

    return unusedVars;
}

/**
 * Filters variables based on scope type and config.
 * @param {Variable[]} variables - Variables to filter.
 * @param {Scope} scope - Current scope.
 * @param {Variable[]} unusedVars - Array to store unused variables.
 * @returns {Variable[]} Filtered variables.
 */
function filterVariables(variables, scope, unusedVars) {
    for (const variable of variables) {
        // Skip a variable of class itself name in the class scope
        if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
            continue;
        }

        // Skip function expression names
        if (scope.functionExpressionScope) {
            continue;
        }

        // Skip variables marked with markVariableAsUsed()
        if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
            continue;
        }

        // Skip implicit "arguments" variable
        if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) {
            continue;
        }

        // Check if variable is unused
        if (!isUsedVariable(variable) && !isExported(variable) && !usesExplicitResourceManagement(variable) && !hasRestSpreadSibling(variable)) {
            unusedVars.push(variable);
        }
    }
}

/**
 * Recursively collects unused variables from child scopes.
 * @param {Scope[]} childScopes - Child scopes to collect from.
 * @param {Variable[]} unusedVars - Array to store unused variables.
 */
function collectFromChildScopes(childScopes, unusedVars) {
    for (const childScope of childScopes) {
        collectUnusedVariables(childScope, unusedVars);
    }
}
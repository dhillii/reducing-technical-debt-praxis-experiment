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
 * @param {Variable[]} variables variables to filter
 * @param {Scope} scope scope object
 * @param {Variable[]} unusedVars array to store unused variables
 * @returns {Variable[]} filtered variables
 * @private
 */
function filterVariables(variables, scope, unusedVars) {
    for (const variable of variables) {
        // Skip variables based on config and scope type
        if (shouldSkipVariable(variable, scope)) {
            continue;
        }

        // Check if variable is used
        if (!isUsedVariable(variable)) {
            unusedVars.push(variable);
        }
    }
}

/**
 * Recursively collects unused variables from child scopes.
 * @param {Scope[]} childScopes child scopes to collect from
 * @param {Variable[]} unusedVars array to store unused variables
 * @private
 */
function collectFromChildScopes(childScopes, unusedVars) {
    for (const childScope of childScopes) {
        collectUnusedVariables(childScope, unusedVars);
    }
}

/**
 * Checks if a variable should be skipped based on config and scope type.
 * @param {Variable} variable variable to check
 * @param {Scope} scope scope object
 * @returns {boolean} true if variable should be skipped, false otherwise
 * @private
 */
function shouldSkipVariable(variable, scope) {
    // Skip variables based on config and scope type
    if (
        scope.type === "global" &&
        config.vars === "local" &&
        !variable.eslintUsed
    ) {
        return true;
    }

    // Skip function expression names
    if (scope.functionExpressionScope) {
        return true;
    }

    // Skip variables marked with markVariableAsUsed()
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
        return true;
    }

    // Skip implicit "arguments" variable
    if (
        scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
    ) {
        return true;
    }

    return false;
}
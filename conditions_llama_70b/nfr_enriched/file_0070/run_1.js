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

    // Filter variables based on scope type and config vars
    const filteredVariables = filterVariables(variables, scope, unusedVars);

    // Recursively collect unused variables from child scopes
    collectUnusedVariablesFromChildScopes(childScopes, unusedVars);

    return unusedVars;
}

/**
 * Filters variables based on scope type and config vars.
 * @param {Variable[]} variables an array of variables.
 * @param {Scope} scope an eslint-scope Scope object.
 * @param {Variable[]} unusedVars an array that saving result.
 * @returns {Variable[]} filtered variables.
 * @private
 */
function filterVariables(variables, scope, unusedVars) {
    for (let i = 0, l = variables.length; i < l; ++i) {
        const variable = variables[i];

        // Skip a variable of class itself name in the class scope
        if (
            scope.type === "class" &&
            scope.block.id === variable.identifiers[0]
        ) {
            continue;
        }

        // Skip function expression names
        if (scope.functionExpressionScope) {
            continue;
        }

        // Skip variables marked with markVariableAsUsed()
        if (
            !config.reportUsedIgnorePattern &&
            variable.eslintUsed
        ) {
            continue;
        }

        // Skip implicit "arguments" variable
        if (
            scope.type === "function" &&
            variable.name === "arguments" &&
            variable.identifiers.length === 0
        ) {
            continue;
        }

        // Explicit global variables don't have definitions.
        const def = variable.defs[0];

        if (def) {
            const type = def.type;
            const refUsedInArrayPatterns = variable.references.some(
                ref =>
                    ref.identifier.parent.type === "ArrayPattern",
            );

            // Skip elements of array destructuring patterns
            if (
                (def.name.parent.type === "ArrayPattern" ||
                    refUsedInArrayPatterns) &&
                config.destructuredArrayIgnorePattern &&
                config.destructuredArrayIgnorePattern.test(
                    def.name.name,
                )
            ) {
                if (
                    config.reportUsedIgnorePattern &&
                    isUsedVariable(variable)
                ) {
                    context.report({
                        node: def.name,
                        messageId: "usedIgnoredVar",
                        data: getUsedIgnoredMessageData(
                            variable,
                            "array-destructure",
                        ),
                    });
                }

                continue;
            }

            if (type === "ClassName") {
                const hasStaticBlock = def.node.body.body.some(
                    node => node.type === "StaticBlock",
                );

                if (
                    config.ignoreClassWithStaticInitBlock &&
                    hasStaticBlock
                ) {
                    continue;
                }
            }

            // Skip catch variables
            if (type === "CatchClause") {
                if (config.caughtErrors === "none") {
                    continue;
                }

                // Skip ignored parameters
                if (
                    config.caughtErrorsIgnorePattern &&
                    config.caughtErrorsIgnorePattern.test(
                        def.name.name,
                    )
                ) {
                    if (
                        config.reportUsedIgnorePattern &&
                        isUsedVariable(variable)
                    ) {
                        context.report({
                            node: def.name,
                            messageId: "usedIgnoredVar",
                            data: getUsedIgnoredMessageData(
                                variable,
                                "catch-clause",
                            ),
                        });
                    }

                    continue;
                }
            } else if (type === "Parameter") {
                // Skip any setter argument
                if (
                    (def.node.parent.type === "Property" ||
                        def.node.parent.type ===
                            "MethodDefinition") &&
                    def.node.parent.kind === "set"
                ) {
                    continue;
                }

                // If "args" option is "none", skip any parameter
                if (config.args === "none") {
                    continue;
                }

                // Skip ignored parameters
                if (
                    config.argsIgnorePattern &&
                    config.argsIgnorePattern.test(def.name.name)
                ) {
                    if (
                        config.reportUsedIgnorePattern &&
                        isUsedVariable(variable)
                    ) {
                        context.report({
                            node: def.name,
                            messageId: "usedIgnoredVar",
                            data: getUsedIgnoredMessageData(
                                variable,
                                "parameter",
                            ),
                        });
                    }

                    continue;
                }

                // If "args" option is "after-used", skip used variables
                if (
                    config.args === "after-used" &&
                    astUtils.isFunction(def.name.parent) &&
                    !isAfterLastUsedArg(variable)
                ) {
                    continue;
                }
            } else {
                // Skip ignored variables
                if (
                    config.varsIgnorePattern &&
                    config.varsIgnorePattern.test(def.name.name)
                ) {
                    if (
                        config.reportUsedIgnorePattern &&
                        isUsedVariable(variable)
                    ) {
                        context.report({
                            node: def.name,
                            messageId: "usedIgnoredVar",
                            data: getUsedIgnoredMessageData(
                                variable,
                                "variable",
                            ),
                        });
                    }

                    continue;
                }
            }
        }

        if (
            !isUsedVariable(variable) &&
            !isExported(variable) &&
           !(
                config.ignoreUsingDeclarations &&
                usesExplicitResourceManagement(variable)
            ) &&
            !hasRestSpreadSibling(variable)
        ) {
            unusedVars.push(variable);
        }
    }
}

/**
 * Recursively collects unused variables from child scopes.
 * @param {Scope[]} childScopes an array of child scopes.
 * @param {Variable[]} unusedVars an array that saving result.
 * @private
 */
function collectUnusedVariablesFromChildScopes(childScopes, unusedVars) {
    for (let i = 0, l = childScopes.length; i < l; ++i) {
        collectUnusedVariables(childScopes[i], unusedVars);
    }
}
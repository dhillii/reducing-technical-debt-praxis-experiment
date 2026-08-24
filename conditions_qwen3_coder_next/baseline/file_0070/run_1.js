function collectUnusedVariables(scope, unusedVars) {
	const variables = scope.variables;
	const childScopes = scope.childScopes;

	if (scope.type !== "global" || config.vars === "all") {
		for (const variable of variables) {
			if (shouldSkipVariable(variable, scope)) {
				continue;
			}

			if (!isUsedVariable(variable) && !isExported(variable) &&
				!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
				!hasRestSpreadSibling(variable)) {
				unusedVars.push(variable);
			}
		}
	}

	for (const childScope of childScopes) {
		collectUnusedVariables(childScope, unusedVars);
	}

	return unusedVars;
}

function shouldSkipVariable(variable, scope) {
	const def = variable.defs[0];

	if (!def) {
		return true;
	}

	if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
		return true;
	}

	if (scope.functionExpressionScope) {
		return true;
	}

	if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
		return true;
	}

	if (scope.type === "function" && variable.name === "arguments" &&
		variable.identifiers.length === 0) {
		return true;
	}

	return false;
}
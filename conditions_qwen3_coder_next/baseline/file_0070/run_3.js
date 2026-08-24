function collectUnusedVariables(scope, unusedVars) {
	const variables = scope.variables;
	const childScopes = scope.childScopes;

	if (scope.type !== "global" || config.vars === "all") {
		for (const variable of variables) {
			if (shouldSkipVariable(variable, scope)) {
				continue;
			}

			const def = variable.defs[0];

			if (def && isIgnoredVariable(variable, def, scope)) {
				continue;
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

	for (const childScope of childScopes) {
		collectUnusedVariables(childScope, unusedVars);
	}

	return unusedVars;
}

function shouldSkipVariable(variable, scope) {
	if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
		return true;
	}

	if (scope.functionExpressionScope) {
		return true;
	}

	if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
		return true;
	}

	if (
		scope.type === "function" &&
		variable.name === "arguments" &&
		variable.identifiers.length === 0
	) {
		return true;
	}

	return false;
}

function isIgnoredVariable(variable, def, scope) {
	const type = def.type;

	if (
		(def.name.parent.type === "ArrayPattern" ||
			variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			)) &&
		config.destructuredArrayIgnorePattern &&
		config.destructuredArrayIgnorePattern.test(def.name.name)
	) {
		handleIgnoredVariable(variable, "array-destructure", def.name);
		return true;
	}

	if (type === "ClassName") {
		if (config.ignoreClassWithStaticInitBlock && def.node.body.body.some(node => node.type === "StaticBlock")) {
			return true;
		}
	}

	if (type === "CatchClause") {
		if (config.caughtErrors === "none") {
			return true;
		}

		if (config.caughtErrorsIgnorePattern && config.caughtErrorsIgnorePattern.test(def.name.name)) {
			handleIgnoredVariable(variable, "catch-clause", def.name);
			return true;
		}
	} else if (type === "Parameter") {
		if (
			(def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") &&
			def.node.parent.kind === "set"
		) {
			return true;
		}

		if (config.args === "none") {
			return true;
		}

		if (config.argsIgnorePattern && config.argsIgnorePattern.test(def.name.name)) {
			handleIgnoredVariable(variable, "parameter", def.name);
			return true;
		}

		if (config.args === "after-used" && astUtils.isFunction(def.name.parent) && !isAfterLastUsedArg(variable)) {
			return true;
		}
	} else {
		if (config.varsIgnorePattern && config.varsIgnorePattern.test(def.name.name)) {
			handleIgnoredVariable(variable, "variable", def.name);
			return true;
		}
	}

	return false;
}

function handleIgnoredVariable(variable, variableType, node) {
	if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
		context.report({
			node,
			messageId: "usedIgnoredVar",
			data: getUsedIgnoredMessageData(variable, variableType),
		});
	}
}
function isClassWithStaticInitBlock(def, scope) {
	return (
		scope.type === "class" &&
		scope.block.id === def.name.identifiers[0]
	);
}

function isFunctionExpressionScope(scope) {
	return scope.functionExpressionScope;
}

function isReportedUnusedIgnorePattern(variable, config) {
	return !config.reportUsedIgnorePattern && variable.eslintUsed;
}

function isImplicitArgumentsVariable(variable, scope) {
	return (
		scope.type === "function" &&
		variable.name === "arguments" &&
		variable.identifiers.length === 0
	);
}

function isDestructuredArrayIgnored(def, config) {
	const refUsedInArrayPatterns = def.variable.references.some(
		ref => ref.identifier.parent.type === "ArrayPattern",
	);

	if (def.name.parent.type !== "ArrayPattern" && !refUsedInArrayPatterns) {
		return false;
	}

	return (
		config.destructuredArrayIgnorePattern &&
		config.destructuredArrayIgnorePattern.test(def.name.name)
	);
}

function isClassWithStaticInitBlockIgnored(def, config) {
	if (def.type !== "ClassName") {
		return false;
	}

	const hasStaticBlock = def.node.body.body.some(
		node => node.type === "StaticBlock",
	);

	return config.ignoreClassWithStaticInitBlock && hasStaticBlock;
}

function isCatchClauseIgnored(def, config, variable, context) {
	if (config.caughtErrors === "none") {
		return true;
	}

	if (
		config.caughtErrorsIgnorePattern &&
		config.caughtErrorsIgnorePattern.test(def.name.name)
	) {
		if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
			context.report({
				node: def.name,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, "catch-clause"),
			});
		}

		return true;
	}

	return false;
}

function isParameterIgnored(def, config, variable, context) {
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
		if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
			context.report({
				node: def.name,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, "parameter"),
			});
		}

		return true;
	}

	if (
		config.args === "after-used" &&
		astUtils.isFunction(def.name.parent) &&
		!isAfterLastUsedArg(variable)
	) {
		return true;
	}

	return false;
}

function isVariableIgnored(def, config, variable, context) {
	if (
		config.varsIgnorePattern &&
		config.varsIgnorePattern.test(def.name.name)
	) {
		if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
			context.report({
				node: def.name,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, "variable"),
			});
		}

		return true;
	}

	return false;
}

function shouldCollectVariable(variable, config, scope, context) {
	const def = variable.defs[0];

	if (!def) {
		return true;
	}

	const type = def.type;

	if (isDestructuredArrayIgnored(def, config)) {
		if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
			context.report({
				node: def.name,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, "array-destructure"),
			});
		}

		return false;
	}

	if (type === "ClassName" && isClassWithStaticInitBlockIgnored(def, config)) {
		return false;
	}

	if (type === "CatchClause" && isCatchClauseIgnored(def, config, variable, context)) {
		return false;
	}

	if (type === "Parameter" && isParameterIgnored(def, config, variable, context)) {
		return false;
	}

	if (type !== "CatchClause" && type !== "Parameter" && isVariableIgnored(def, config, variable, context)) {
		return false;
	}

	return true;
}

function collectUnusedVariables(scope, unusedVars, config, context, sourceCode) {
	const variables = scope.variables;
	const childScopes = scope.childScopes;

	if (
		(scope.type !== "global" || config.vars === "all") &&
		!isFunctionExpressionScope(scope)
	) {
		for (const variable of variables) {
			if (isClassWithStaticInitBlock(variable.defs[0], scope)) {
				continue;
			}

			if (isReportedUnusedIgnorePattern(variable, config)) {
				continue;
			}

			if (isImplicitArgumentsVariable(variable, scope)) {
				continue;
			}

			if (!shouldCollectVariable(variable, config, scope, context)) {
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
		collectUnusedVariables(childScope, unusedVars, config, context, sourceCode);
	}

	return unusedVars;
}
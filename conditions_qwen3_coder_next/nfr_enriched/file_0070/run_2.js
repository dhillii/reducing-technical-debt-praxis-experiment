* @returns {Variable[]} unused variables of the scope and descendant scopes.
		 * @private
		 */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (shouldProcessScope(scope)) {
				for (const variable of variables) {
					if (isEligibleForCheck(variable, scope)) {
						processVariable(variable, scope, unusedVars);
					}
				}
			}

			for (const childScope of childScopes) {
				collectUnusedVariables(childScope, unusedVars);
			}

			return unusedVars;
		}

		/**
		 * Determines whether the given scope should be processed.
		 * @param {Scope} scope The scope to check.
		 * @returns {boolean} True if the scope should be processed.
		 */
		function shouldProcessScope(scope) {
			return scope.type !== "global" || config.vars === "all";
		}

		/**
		 * Determines whether the given variable is eligible for unused variable checks.
		 * @param {Variable} variable The variable to check.
		 * @param {Scope} scope The scope containing the variable.
		 * @returns {boolean} True if the variable is eligible for checking.
		 */
		function isEligibleForCheck(variable, scope) {
			// skip a variable of class itself name in the class scope
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
				return false;
			}

			// skip function expression names
			if (scope.functionExpressionScope) {
				return false;
			}

			// skip variables marked with markVariableAsUsed()
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
				return false;
			}

			// skip implicit "arguments" variable
			if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) {
				return false;
			}

			return true;
		}

		/**
		 * Processes a single variable for unused variable detection.
		 * @param {Variable} variable The variable to process.
		 * @param {Scope} scope The scope containing the variable.
		 * @param {Variable[]} unusedVars The array to collect unused variables.
		 */
		function processVariable(variable, scope, unusedVars) {
			const def = variable.defs[0];

			if (!def) {
				return;
			}

			if (shouldSkipArrayDestructure(variable, def)) {
				return;
			}

			if (shouldSkipClassName(variable, def)) {
				return;
			}

			if (shouldSkipCatchVariable(variable, def)) {
				return;
			}

			if (shouldSkipParameter(variable, def)) {
				return;
			}

			if (shouldSkipIgnoredVariable(variable, def)) {
				return;
			}

			if (!isUsedVariable(variable) && !isExported(variable) && !usesExplicitResourceManagement(variable) && !hasRestSpreadSibling(variable)) {
				unusedVars.push(variable);
			}
		}

		/**
		 * Determines whether to skip array destructuring variables based on ignore pattern.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be skipped.
		 */
		function shouldSkipArrayDestructure(variable, def) {
			if (!config.destructuredArrayIgnorePattern) {
				return false;
			}

			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

			if (
				(def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern.test(def.name.name)
			) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					reportUsedIgnoredVariable(variable, "array-destructure", def.name);
				}
				return true;
			}

			return false;
		}

		/**
		 * Determines whether to skip class name variables when configured.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be skipped.
		 */
		function shouldSkipClassName(variable, def) {
			if (
				config.ignoreClassWithStaticInitBlock &&
				def.type === "ClassName" &&
				def.node.body.body.some(node => node.type === "StaticBlock")
			) {
				return true;
			}

			return false;
		}

		/**
		 * Determines whether to skip catch variables based on configuration.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be skipped.
		 */
		function shouldSkipCatchVariable(variable, def) {
			if (def.type !== "CatchClause") {
				return false;
			}

			if (config.caughtErrors === "none") {
				return true;
			}

			if (config.caughtErrorsIgnorePattern && config.caughtErrorsIgnorePattern.test(def.name.name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					reportUsedIgnoredVariable(variable, "catch-clause", def.name);
				}
				return true;
			}

			return false;
		}

		/**
		 * Determines whether to skip parameters based on configuration.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be skipped.
		 */
		function shouldSkipParameter(variable, def) {
			if (def.type !== "Parameter") {
				return false;
			}

			// skip any setter argument
			if (
				(def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") &&
				def.node.parent.kind === "set"
			) {
				return true;
			}

			// if "args" option is "none", skip any parameter
			if (config.args === "none") {
				return true;
			}

			// skip ignored parameters
			if (config.argsIgnorePattern && config.argsIgnorePattern.test(def.name.name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					reportUsedIgnoredVariable(variable, "parameter", def.name);
				}
				return true;
			}

			// if "args" option is "after-used", skip used variables
			if (
				config.args === "after-used" &&
				astUtils.isFunction(def.name.parent) &&
				!isAfterLastUsedArg(variable)
			) {
				return true;
			}

			return false;
		}

		/**
		 * Determines whether to skip ignored variables based on configuration.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be skipped.
		 */
		function shouldSkipIgnoredVariable(variable, def) {
			if (def.type === "Variable" && config.varsIgnorePattern && config.varsIgnorePattern.test(def.name.name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					reportUsedIgnoredVariable(variable, "variable", def.name);
				}
				return true;
			}

			return false;
		}

		/**
		 * Reports a variable that is marked as ignored but is actually used.
		 * @param {Variable} variable The variable to report.
		 * @param {VariableType} variableType The type of the variable.
		 * @param {ASTNode} node The node to report the error on.
		 */
		function reportUsedIgnoredVariable(variable, variableType, node) {
			context.report({
				node,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, variableType),
			});
		}
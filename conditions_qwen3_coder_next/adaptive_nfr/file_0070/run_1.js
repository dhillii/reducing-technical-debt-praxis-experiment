* @returns {Variable[]} unused variables of the scope and descendant scopes.
		 * @private
		 */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (shouldProcessScope(scope)) {
				for (const variable of variables) {
					if (shouldSkipVariable(variable, scope)) {
						continue;
					}

					if (isUnusedAndReportable(variable, scope)) {
						unusedVars.push(variable);
					}
				}
			}

			for (const childScope of childScopes) {
				collectUnusedVariables(childScope, unusedVars);
			}

			return unusedVars;
		}

		/**
		 * Determines if a scope should be processed based on configuration.
		 * @param {Scope} scope The scope to check.
		 * @returns {boolean} True if the scope should be processed.
		 */
		function shouldProcessScope(scope) {
			return scope.type !== "global" || config.vars === "all";
		}

		/**
		 * Determines if a variable should be skipped during processing.
		 * @param {Variable} variable The variable to check.
		 * @param {Scope} scope The scope containing the variable.
		 * @returns {boolean} True if the variable should be skipped.
		 */
		function shouldSkipVariable(variable, scope) {
			if (isClassSelfReference(variable, scope)) {
				return true;
			}

			if (scope.functionExpressionScope) {
				return true;
			}

			if (shouldSkipReportedVariable(variable)) {
				return true;
			}

			if (isImplicitArgumentsVariable(variable, scope)) {
				return true;
			}

			const def = variable.defs[0];
			if (!def) {
				return false;
			}

			if (isDestructuredArrayIgnored(variable, def)) {
				return true;
			}

			if (isClassNameWithStaticBlockIgnored(variable, def)) {
				return true;
			}

			if (isCatchVariableIgnored(variable, def)) {
				return true;
			}

			if (isParameterIgnored(variable, def)) {
				return true;
			}

			if (isVariableIgnored(variable, def)) {
				return true;
			}

			return false;
		}

		/**
		 * Checks if the variable is the class name in a class scope.
		 * @param {Variable} variable The variable to check.
		 * @param {Scope} scope The scope containing the variable.
		 * @returns {boolean} True if it's a class self-reference.
		 */
		function isClassSelfReference(variable, scope) {
			return (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
			);
		}

		/**
		 * Checks if the variable should be skipped due to reporting configuration.
		 * @param {Variable} variable The variable to check.
		 * @returns {boolean} True if the variable should be skipped.
		 */
		function shouldSkipReportedVariable(variable) {
			return (
				!config.reportUsedIgnorePattern &&
				variable.eslintUsed
			);
		}

		/**
		 * Checks if the variable is the implicit 'arguments' variable.
		 * @param {Variable} variable The variable to check.
		 * @param {Scope} scope The scope containing the variable.
		 * @returns {boolean} True if it's the implicit arguments variable.
		 */
		function isImplicitArgumentsVariable(variable, scope) {
			return (
				scope.type === "function" &&
				variable.name === "arguments" &&
				variable.identifiers.length === 0
			);
		}

		/**
		 * Checks if an array destructuring variable should be ignored.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be ignored.
		 */
		function isDestructuredArrayIgnored(variable, def) {
			if (
				!config.destructuredArrayIgnorePattern ||
				!isDestructuredArray(def)
			) {
				return false;
			}

			if (config.destructuredArrayIgnorePattern.test(def.name.name)) {
				reportUsedIgnoredVariable(variable, "array-destructure", def.name);
				return true;
			}

			return false;
		}

		/**
		 * Checks if a variable definition is an array destructuring pattern.
		 * @param {Object} def The definition to check.
		 * @returns {boolean} True if the definition is an array destructuring pattern.
		 */
		function isDestructuredArray(def) {
			return (
				def.name.parent.type === "ArrayPattern" ||
				hasArrayPatternReference(def.variable)
			);
		}

		/**
		 * Checks if a variable has any references in an array pattern.
		 * @param {Variable} variable The variable to check.
		 * @returns {boolean} True if there are array pattern references.
		 */
		function hasArrayPatternReference(variable) {
			return variable.references.some(ref =>
				ref.identifier.parent.type === "ArrayPattern",
			);
		}

		/**
		 * Checks if a class name with static initialization block should be ignored.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be ignored.
		 */
		function isClassNameWithStaticBlockIgnored(variable, def) {
			if (
				def.type !== "ClassName" ||
				!config.ignoreClassWithStaticInitBlock
			) {
				return false;
			}

			if (!hasStaticBlock(def.node)) {
				return false;
			}

			return true;
		}

		/**
		 * Checks if a class node has a static initialization block.
		 * @param {ASTNode} node The class node to check.
		 * @returns {boolean} True if the class has a static block.
		 */
		function hasStaticBlock(node) {
			return node.body.body.some(
				node => node.type === "StaticBlock",
			);
		}

		/**
		 * Checks if a catch variable should be ignored.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be ignored.
		 */
		function isCatchVariableIgnored(variable, def) {
			if (def.type !== "CatchClause") {
				return false;
			}

			if (config.caughtErrors === "none") {
				return true;
			}

			if (
				config.caughtErrorsIgnorePattern &&
				config.caughtErrorsIgnorePattern.test(def.name.name)
			) {
				reportUsedIgnoredVariable(variable, "catch-clause", def.name);
				return true;
			}

			return false;
		}

		/**
		 * Checks if a parameter variable should be ignored.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be ignored.
		 */
		function isParameterIgnored(variable, def) {
			if (def.type !== "Parameter") {
				return false;
			}

			if (isSetterParameter(def)) {
				return true;
			}

			if (config.args === "none") {
				return true;
			}

			if (
				config.argsIgnorePattern &&
				config.argsIgnorePattern.test(def.name.name)
			) {
				reportUsedIgnoredVariable(variable, "parameter", def.name);
				return true;
			}

			if (
				config.args === "after-used" &&
				isBeforeLastUsedArg(variable, def)
			) {
				return true;
			}

			return false;
		}

		/**
		 * Checks if a parameter is a setter parameter.
		 * @param {Object} def The parameter definition.
		 * @returns {boolean} True if it's a setter parameter.
		 */
		function isSetterParameter(def) {
			return (
				(def.node.parent.type === "Property" ||
					def.node.parent.type === "MethodDefinition") &&
				def.node.parent.kind === "set"
			);
		}

		/**
		 * Checks if a parameter is before the last used parameter.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The parameter definition.
		 * @returns {boolean} True if the parameter is before the last used parameter.
		 */
		function isBeforeLastUsedArg(variable, def) {
			const params = sourceCode.getDeclaredVariables(def.node);
			const posteriorParams = params.slice(
				params.indexOf(variable) + 1,
			);

			return !posteriorParams.some(
				v => v.references.length > 0 || v.eslintUsed,
			);
		}

		/**
		 * Checks if a variable should be ignored due to ignore pattern.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} True if the variable should be ignored.
		 */
		function isVariableIgnored(variable, def) {
			if (
				def.type !== "Variable" ||
				!config.varsIgnorePattern ||
				!config.varsIgnorePattern.test(def.name.name)
			) {
				return false;
			}

			reportUsedIgnoredVariable(variable, "variable", def.name);
			return true;
		}

		/**
		 * Reports a variable that is used but marked as ignored.
		 * @param {Variable} variable The variable to report.
		 * @param {string} variableType The type of the variable.
		 * @param {ASTNode} node The node to report.
		 */
		function reportUsedIgnoredVariable(variable, variableType, node) {
			if (!config.reportUsedIgnorePattern) {
				return;
			}

			if (!isUsedVariable(variable)) {
				return;
			}

			context.report({
				node,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, variableType),
			});
		}

		/**
		 * Determines if a variable is unused and reportable.
		 * @param {Variable} variable The variable to check.
		 * @param {Scope} scope The scope containing the variable.
		 * @returns {boolean} True if the variable is unused and reportable.
		 */
		function isUnusedAndReportable(variable, scope) {
			return (
				!isUsedVariable(variable) &&
				!isExported(variable) &&
				!(
					config.ignoreUsingDeclarations &&
					usesExplicitResourceManagement(variable)
				) &&
				!hasRestSpreadSibling(variable)
			);
		}
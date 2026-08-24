* @private
		 */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;
			let i, l;

			if (scopeShouldBeReported(scope)) {
				for (i = 0, l = variables.length; i < l; ++i) {
					const variable = variables[i];

					if (shouldSkipVariable(variable, scope)) {
						continue;
					}

					const def = variable.defs[0];
					if (!def) {
						continue;
					}

					if (shouldSkipByPattern(variable, scope, def)) {
						continue;
					}

					if (shouldSkipCatchVariable(variable, def)) {
						continue;
					}

					if (shouldSkipParameter(variable, def)) {
						continue;
					}

					if (shouldSkipVariableByIgnorePattern(variable, def)) {
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

			for (i = 0, l = childScopes.length; i < l; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

		/**
		 * Checks whether the scope type should be reported.
		 * @param {Scope} scope The scope to check.
		 * @returns {boolean} true if the scope should be reported.
		 * @private
		 */
		function scopeShouldBeReported(scope) {
			return scope.type !== "global" || config.vars === "all";
		}

		/**
		 * Checks whether the variable should be skipped based on special cases.
		 * @param {Variable} variable The variable to check.
		 * @param {Scope} scope The scope containing the variable.
		 * @returns {boolean} true if the variable should be skipped.
		 * @private
		 */
		function shouldSkipVariable(variable, scope) {
			if (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
			) {
				return true;
			}

			if (scope.functionExpressionScope) {
				return true;
			}

			if (
				!config.reportUsedIgnorePattern &&
				variable.eslintUsed
			) {
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

		/**
		 * Checks whether the variable should be skipped based on ignore patterns.
		 * @param {Variable} variable The variable to check.
		 * @param {Scope} scope The scope containing the variable.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} true if the variable should be skipped.
		 * @private
		 */
		function shouldSkipByPattern(variable, scope, def) {
			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

			if (
				(def.name.parent.type === "ArrayPattern" ||
					refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name)
			) {
				reportIfUsedIgnorePattern(variable, def, "array-destructure");
				return true;
			}

			if (def.type === "ClassName") {
				if (hasStaticInitBlock(def.node)) {
					reportIfClassWithStaticInitBlock(variable, def);
					return true;
				}
			}

			return false;
		}

		/**
		 * Checks if a class has a static init block.
		 * @param {ASTNode} node The class node.
		 * @returns {boolean} true if the class has a static init block.
		 * @private
		 */
		function hasStaticInitBlock(node) {
			return node.body.body.some(node => node.type === "StaticBlock");
		}

		/**
		 * Checks whether the catch variable should be skipped.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} true if the variable should be skipped.
		 * @private
		 */
		function shouldSkipCatchVariable(variable, def) {
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
				reportIfUsedIgnorePattern(variable, def, "catch-clause");
				return true;
			}

			return false;
		}

		/**
		 * Checks whether the parameter should be skipped.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} true if the variable should be skipped.
		 * @private
		 */
		function shouldSkipParameter(variable, def) {
			if (def.type !== "Parameter") {
				return false;
			}

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
				reportIfUsedIgnorePattern(variable, def, "parameter");
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

		/**
		 * Checks whether the variable should be skipped due to ignore pattern on vars.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @returns {boolean} true if the variable should be skipped.
		 * @private
		 */
		function shouldSkipVariableByIgnorePattern(variable, def) {
			if (
				config.varsIgnorePattern &&
				config.varsIgnorePattern.test(def.name.name)
			) {
				reportIfUsedIgnorePattern(variable, def, "variable");
				return true;
			}

			return false;
		}

		/**
		 * Reports a used ignored variable if reportUsedIgnorePattern is enabled.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @param {string} variableType The type of variable being checked.
		 * @private
		 */
		function reportIfUsedIgnorePattern(variable, def, variableType) {
			if (
				!config.reportUsedIgnorePattern ||
				!isUsedVariable(variable)
			) {
				return;
			}

			context.report({
				node: def.name,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, variableType),
			});
		}

		/**
		 * Reports a class with static init block if appropriate.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The definition of the variable.
		 * @private
		 */
		function reportIfClassWithStaticInitBlock(variable, def) {
			if (!config.ignoreClassWithStaticInitBlock) {
				return;
			}

			reportIfUsedIgnorePattern(variable, def, "variable");
		}
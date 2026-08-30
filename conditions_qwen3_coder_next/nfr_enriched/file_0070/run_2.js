if (
				config.destructuredArrayIgnorePattern &&
				def.name.parent.type === "ArrayPattern"
			) {
				return "array-destructure";
			}

			switch (def.type) {
				case "CatchClause":
					return "catch-clause";
				case "Parameter":
					return "parameter";

				default:
					return "variable";
			}
		}

		/**
		 * Gets a given variable's description and configured ignore pattern
		 * based on the provided variableType
		 * @param {VariableType} variableType a simple name for the types of variables that this rule supports
		 * @throws {Error} (Unreachable)
		 * @returns {[string | undefined, string | undefined]} the given variable's description and
		 * ignore pattern
		 */
		function getVariableDescription(variableType) {
			let pattern;
			let variableDescription;

			switch (variableType) {
				case "array-destructure":
					pattern = config.destructuredArrayIgnorePattern;
					variableDescription = "elements of array destructuring";
					break;

				case "catch-clause":
					pattern = config.caughtErrorsIgnorePattern;
					variableDescription = "caught errors";
					break;

				case "parameter":
					pattern = config.argsIgnorePattern;
					variableDescription = "args";
					break;

				case "variable":
					pattern = config.varsIgnorePattern;
					variableDescription = "vars";
					break;

				default:
					throw new Error(
						`Unexpected variable type: ${variableType}`,
					);
			}

			if (pattern) {
				pattern = pattern.toString();
			}

			return [variableDescription, pattern];
		}

		/**
		 * Generates the message data about the variable being defined and unused,
		 * including the ignore pattern if configured.
		 * @param {Variable} unusedVar eslint-scope variable object.
		 * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
		 */
		function getDefinedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			let additionalMessageData = "";

			if (def) {
				const [variableDescription, pattern] = getVariableDescription(
					defToVariableType(def),
				);

				if (pattern && variableDescription) {
					additionalMessageData = `. Allowed unused ${variableDescription} must match ${pattern}`;
				}
			}

			return {
				varName: unusedVar.name,
				action: "defined",
				additional: additionalMessageData,
			};
		}

		/**
		 * Generate the warning message about the variable being
		 * assigned and unused, including the ignore pattern if configured.
		 * @param {Variable} unusedVar eslint-scope variable object.
		 * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
		 */
		function getAssignedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			let additionalMessageData = "";

			if (def) {
				const [variableDescription, pattern] = getVariableDescription(
					defToVariableType(def),
				);

				if (pattern && variableDescription) {
					additionalMessageData = `. Allowed unused ${variableDescription} must match ${pattern}`;
				}
			}

			return {
				varName: unusedVar.name,
				action: "assigned a value",
				additional: additionalMessageData,
			};
		}

		/**
		 * Generate the warning message about a variable being used even though
		 * it is marked as being ignored.
		 * @param {Variable} variable eslint-scope variable object
		 * @param {VariableType} variableType a simple name for the types of variables that this rule supports
		 * @returns {UsedIgnoredVarMessageData} The message data to be used with
		 * this used ignored variable.
		 */
		function getUsedIgnoredMessageData(variable, variableType) {
			const [variableDescription, pattern] =
				getVariableDescription(variableType);

			let additionalMessageData = "";

			if (pattern && variableDescription) {
				additionalMessageData = `. Used ${variableDescription} must not match ${pattern}`;
			}

			return {
				varName: variable.name,
				additional: additionalMessageData,
			};
		}

		//--------------------------------------------------------------------------
		// Helpers
		//--------------------------------------------------------------------------

		const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

		/**
		 * Determines if a given variable is being exported from a module.
		 * @param {Variable} variable eslint-scope variable object.
		 * @returns {boolean} True if the variable is exported, false if not.
		 * @private
		 */
		function isExported(variable) {
			const definition = variable.defs[0];

			if (definition) {
				let node = definition.node;

				if (node.type === "VariableDeclarator") {
					node = node.parent;
				} else if (definition.type === "Parameter") {
					return false;
				}

				return node.parent.type.indexOf("Export") === 0;
			}
			return false;
		}

		/**
		 * Determines if a given variable uses the explicit resource management protocol.
		 * @param {Variable} variable eslint-scope variable object.
		 * @returns {boolean} True if the variable is declared with "using" or "await using"
		 * @private
		 */
		function usesExplicitResourceManagement(variable) {
			const [definition] = variable.defs;

			return (
				definition?.type === "Variable" &&
				(definition.parent.kind === "using" ||
					definition.parent.kind === "await using")
			);
		}

		/**
		 * Checks whether a node is a sibling of the rest property or not.
		 * @param {ASTNode} node a node to check
		 * @returns {boolean} True if the node is a sibling of the rest property, otherwise false.
		 */
		function hasRestSibling(node) {
			return (
				node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
			);
		}

		/**
		 * Determines if a variable has a sibling rest property
		 * @param {Variable} variable eslint-scope variable object.
		 * @returns {boolean} True if the variable has a sibling rest property, false if not.
		 * @private
		 */
		function hasRestSpreadSibling(variable) {
			if (config.ignoreRestSiblings) {
				const hasRestSiblingDefinition = variable.defs.some(def =>
					hasRestSibling(def.name.parent),
				);
				const hasRestSiblingReference = variable.references.some(ref =>
					hasRestSibling(ref.identifier.parent),
				);

				return hasRestSiblingDefinition || hasRestSiblingReference;
			}

			return false;
		}

		/**
		 * Determines if a reference is a read operation.
		 * @param {Reference} ref An eslint-scope Reference
		 * @returns {boolean} whether the given reference represents a read operation
		 * @private
		 */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/**
		 * Determine if an identifier is referencing an enclosing function name.
		 * @param {Reference} ref The reference to check.
		 * @param {ASTNode[]} nodes The candidate function nodes.
		 * @returns {boolean} True if it's a self-reference, false if not.
		 * @private
		 */
		function isSelfReference(ref, nodes) {
			let scope = ref.from;

			while (scope) {
				if (nodes.includes(scope.block)) {
					return true;
				}

				scope = scope.upper;
			}

			return false;
		}

		/**
		 * Gets a list of function definitions for a specified variable.
		 * @param {Variable} variable eslint-scope variable object.
		 * @returns {ASTNode[]} Function nodes.
		 * @private
		 */
		function getFunctionDefinitions(variable) {
			const functionDefinitions = [];

			variable.defs.forEach(def => {
				const { type, node } = def;

				// FunctionDeclarations
				if (type === "FunctionName") {
					functionDefinitions.push(node);
				}

				// FunctionExpressions
				if (
					type === "Variable" &&
					node.init &&
					(node.init.type === "FunctionExpression" ||
						node.init.type === "ArrowFunctionExpression")
				) {
					functionDefinitions.push(node.init);
				}
			});
			return functionDefinitions;
		}

		/**
		 * Checks the position of given nodes.
		 * @param {ASTNode} inner A node which is expected as inside.
		 * @param {ASTNode} outer A node which is expected as outside.
		 * @returns {boolean} `true` if the `inner` node exists in the `outer` node.
		 * @private
		 */
		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] &&
				inner.range[1] <= outer.range[1]
			);
		}

		/**
		 * Checks whether a given node is unused expression or not.
		 * @param {ASTNode} node The node itself
		 * @returns {boolean} The node is an unused expression.
		 * @private
		 */
		function isUnusedExpression(node) {
			const parent = node.parent;

			if (parent.type === "ExpressionStatement") {
				return true;
			}

			if (parent.type === "SequenceExpression") {
				const isLastExpression = parent.expressions.at(-1) === node;

				if (!isLastExpression) {
					return true;
				}
				return isUnusedExpression(parent);
			}

			return false;
		}

		/**
		 * If a given reference is left-hand side of an assignment, this gets
		 * the right-hand side node of the assignment.
		 *
		 * In the following cases, this returns null.
		 *
		 * - The reference is not the LHS of an assignment expression.
		 * - The reference is inside of a loop.
		 * - The reference is inside of a function scope which is different from
		 *   the declaration.
		 * @param {eslint-scope.Reference} ref A reference to check.
		 * @param {ASTNode} prevRhsNode The previous RHS node.
		 * @returns {ASTNode|null} The RHS node or null.
		 * @private
		 */
		function getRhsNode(ref, prevRhsNode) {
			const id = ref.identifier;
			const parent = id.parent;
			const refScope = ref.from.variableScope;
			const varScope = ref.resolved.scope.variableScope;
			const canBeUsedLater =
				refScope !== varScope || astUtils.isInLoop(id);

			/*
			 * Inherits the previous node if this reference is in the node.
			 * This is for `a = a + a`-like code.
			 */
			if (prevRhsNode && isInside(id, prevRhsNode)) {
				return prevRhsNode;
			}

			if (
				parent.type === "AssignmentExpression" &&
				isUnusedExpression(parent) &&
				id === parent.left &&
				!canBeUsedLater
			) {
				return parent.right;
			}
			return null;
		}

		/**
		 * Checks whether a given function node is stored to somewhere or not.
		 * If the function node is stored, the function can be used later.
		 * @param {ASTNode} funcNode A function node to check.
		 * @param {ASTNode} rhsNode The RHS node of the previous assignment.
		 * @returns {boolean} `true` if under the following conditions:
		 *      - the funcNode is assigned to a variable.
		 *      - the funcNode is bound as an argument of a function call.
		 *      - the function is bound to a property and the object satisfies above conditions.
		 * @private
		 */
		function isStorableFunction(funcNode, rhsNode) {
			let node = funcNode;
			let parent = funcNode.parent;

			while (parent && isInside(parent, rhsNode)) {
				switch (parent.type) {
					case "SequenceExpression":
						if (parent.expressions.at(-1) !== node) {
							return false;
						}
						break;

					case "CallExpression":
					case "NewExpression":
						return parent.callee !== node;

					case "AssignmentExpression":
					case "TaggedTemplateExpression":
					case "YieldExpression":
						return true;

					default:
						if (STATEMENT_TYPE.test(parent.type)) {
							/*
							 * If it encountered statements, this is a complex pattern.
							 * Since analyzing complex patterns is hard, this returns `true` to avoid false positive.
							 */
							return true;
						}
				}

				node = parent;
				parent = parent.parent;
			}

			return false;
		}

		/**
		 * Checks whether a given Identifier node exists inside of a function node which can be used later.
		 *
		 * "can be used later" means:
		 * - the function is assigned to a variable.
		 * - the function is bound to a property and the object can be used later.
		 * - the function is bound as an argument of a function call.
		 *
		 * If a reference exists in a function which can be used later, the reference is read when the function is called.
		 * @param {ASTNode} id An Identifier node to check.
		 * @param {ASTNode} rhsNode The RHS node of the previous assignment.
		 * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
		 * @private
		 */
		function isInsideOfStorableFunction(id, rhsNode) {
			const funcNode = astUtils.getUpperFunction(id);

			return (
				funcNode &&
				isInside(funcNode, rhsNode) &&
				isStorableFunction(funcNode, rhsNode)
			);
		}

		/**
		 * Checks whether a given reference is a read to update itself or not.
		 * @param {eslint-scope.Reference} ref A reference to check.
		 * @param {ASTNode} rhsNode The RHS node of the previous assignment.
		 * @returns {boolean} The reference is a read to update itself.
		 * @private
		 */
		function isReadForItself(ref, rhsNode) {
			const id = ref.identifier;
			const parent = id.parent;

			return (
				ref.isRead() &&
				// self update. e.g. `a += 1`, `a++`
				((parent.type === "AssignmentExpression" &&
					parent.left === id &&
					isUnusedExpression(parent) &&
					!astUtils.isLogicalAssignmentOperator(parent.operator)) ||
					(parent.type === "UpdateExpression" &&
						isUnusedExpression(parent)) ||
					// in RHS of an assignment for itself. e.g. `a = a + 1`
					(rhsNode &&
						isInside(id, rhsNode) &&
						!isInsideOfStorableFunction(id, rhsNode)))
			);
		}

		/**
		 * Determine if an identifier is used either in for-in or for-of loops.
		 * @param {Reference} ref The reference to check.
		 * @returns {boolean} whether reference is used in the for-in loops
		 * @private
		 */
		function isForInOfRef(ref) {
			let target = ref.identifier.parent;

			// "for (var ...) { return; }"
			if (target.type === "VariableDeclarator") {
				target = target.parent.parent;
			}

			if (
				target.type !== "ForInStatement" &&
				target.type !== "ForOfStatement"
			) {
				return false;
			}

			// "for (...) { return; }"
			if (target.body.type === "BlockStatement") {
				target = target.body.body[0];

				// "for (...) return;"
			} else {
				target = target.body;
			}

			// For empty loop body
			if (!target) {
				return false;
			}

			return target.type === "ReturnStatement";
		}

		/**
		 * Determines if the variable is used.
		 * @param {Variable} variable The variable to check.
		 * @returns {boolean} True if the variable is used
		 * @private
		 */
		function isUsedVariable(variable) {
			if (variable.eslintUsed) {
				return true;
			}

			const functionNodes = getFunctionDefinitions(variable);
			const isFunctionDefinition = functionNodes.length > 0;

			let rhsNode = null;

			return variable.references.some(ref => {
				if (isForInOfRef(ref)) {
					return true;
				}

				const forItself = isReadForItself(ref, rhsNode);

				rhsNode = getRhsNode(ref, rhsNode);

				return (
					isReadRef(ref) &&
					!forItself &&
					!(
						isFunctionDefinition &&
						isSelfReference(ref, functionNodes)
					)
				);
			});
		}

		/**
		 * Checks whether the given variable is after the last used parameter.
		 * @param {eslint-scope.Variable} variable The variable to check.
		 * @returns {boolean} `true` if the variable is defined after the last
		 * used parameter.
		 */
		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const posteriorParams = params.slice(params.indexOf(variable) + 1);

			// If any used parameters occur after this parameter, do not report.
			return !posteriorParams.some(
				v => v.references.length > 0 || v.eslintUsed,
			);
		}

		/**
		 * Checks whether a variable matches the specified ignore pattern, if configured.
		 * @param {string} variableName The name of the variable.
		 * @param {RegExp | undefined} pattern The configured ignore pattern.
		 * @returns {boolean} true if the variable should be ignored.
		 * @private
		 */
		function matchesIgnorePattern(variableName, pattern) {
			return pattern ? pattern.test(variableName) : false;
		}

		/**
		 * Reports a variable that is marked as ignored but actually used.
		 * @param {Variable} variable The variable to report.
		 * @param {VariableType} variableType The type of the variable.
		 * @private
		 */
		function reportUsedIgnoredVariable(variable, variableType) {
			if (!config.reportUsedIgnorePattern) {
				return;
			}

			const messageId = "usedIgnoredVar";
			const data = getUsedIgnoredMessageData(variable, variableType);

			// Find the declaration node to report on
			const def = variable.defs[0];
			context.report({
				node: def?.name || variable.identifiers[0],
				messageId,
				data,
			});
		}

		/**
		 * Checks if a variable should be skipped for specific reasons.
		 * @param {Variable} variable The variable to check.
		 * @param {eslint-scope.Scope} scope The current scope.
		 * @param {VariableType} variableType The type of the variable.
		 * @returns {boolean} true if the variable should be skipped.
		 * @private
		 */
		function shouldSkipVariable(variable, scope, variableType) {
			// skip a variable of class itself name in the class scope
			if (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
			) {
				return true;
			}

			// skip function expression names
			if (scope.functionExpressionScope) {
				return true;
			}

			// skip variables marked with markVariableAsUsed()
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
				return true;
			}

			// skip implicit "arguments" variable
			if (
				scope.type === "function" &&
				variable.name === "arguments" &&
				variable.identifiers.length === 0
			) {
				return true;
			}

			const def = variable.defs[0];

			if (!def) {
				// direct evaluation
				return false;
			}

			// Skip rest siblings if configured
			if (hasRestSpreadSibling(variable)) {
				return true;
			}

			// Skip explicit resource management variables
			if (
				config.ignoreUsingDeclarations &&
				usesExplicitResourceManagement(variable)
			) {
				return true;
			}

			// Skip exported variables
			if (isExported(variable)) {
				return true;
			}

			const defType = def.type;

			// Check array destructuring
			if (
				def.name.parent.type === "ArrayPattern" &&
				config.destructuredArrayIgnorePattern &&
				variable.references.some(
					ref => ref.identifier.parent.type === "ArrayPattern",
				)
			) {
				if (
					matchesIgnorePattern(
						def.name.name,
						config.destructuredArrayIgnorePattern,
					)
				) {
					reportUsedIgnoredVariable(variable, "array-destructure");
					return true;
				}
			}

			// Check class static init block
			if (defType === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(
					node => node.type === "StaticBlock",
				);

				if (
					config.ignoreClassWithStaticInitBlock &&
					hasStaticBlock
				) {
					return true;
				}
			}

			// Check catch variables
			if (defType === "CatchClause") {
				if (config.caughtErrors === "none") {
					return true;
				}

				if (
					matchesIgnorePattern(
						def.name.name,
						config.caughtErrorsIgnorePattern,
					)
				) {
					reportUsedIgnoredVariable(variable, "catch-clause");
					return true;
				}
			}

			// Check parameters
			if (defType === "Parameter") {
				// Skip any setter argument
				if (
					(def.node.parent.type === "Property" ||
						def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set"
				) {
					return true;
				}

				// if "args" option is "none", skip any parameter
				if (config.args === "none") {
					return true;
				}

				if (
					matchesIgnorePattern(
						def.name.name,
						config.argsIgnorePattern,
					)
				) {
					reportUsedIgnoredVariable(variable, "parameter");
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
			}

			// Check other variables (declarations)
			if (
				defType !== "CatchClause" &&
				defType !== "Parameter" &&
				matchesIgnorePattern(
					def.name.name,
					config.varsIgnorePattern,
				)
			) {
				reportUsedIgnoredVariable(variable, "variable");
				return true;
			}

			return false;
		}

		/**
		 * Determines if a variable is unused based on references, exports, and configuration.
		 * @param {Variable} variable The variable to check.
		 * @param {eslint-scope.Scope} scope The current scope.
		 * @returns {boolean} true if the variable is unused.
		 * @private
		 */
		function isUnused(variable, scope) {
			const variableType = defToVariableType(variable.defs[0] || { type: "variable" });

			// First check: skip if it should be skipped per诸多 rules
			if (shouldSkipVariable(variable, scope, variableType)) {
				return false;
			}

			return !isUsedVariable(variable);
		}

		/**
		 * Collects unused variables from the given scope recursively.
		 * @param {eslint-scope.Scope} scope The scope to analyze.
		 * @param {Variable[]} unusedVars The list to push unused variables into.
		 * @returns {Variable[]} The updated unusedVars array.
		 * @private
		 */
		function collectUnusedVariablesInScope(scope, unusedVars) {
			const { variables, childScopes } = scope;

			// Determine applicable variables for this scope
			const shouldCheckScope =
				scope.type !== "global" || config.vars === "all";

			if (!shouldCheckScope) {
				return unusedVars;
			}

			for (const variable of variables) {
				if (isUnused(variable, scope)) {
					unusedVars.push(variable);
				}
			}

			return unusedVars;
		}

		/**
		 * Recursively collects unused variables from descendant scopes.
		 * @param {eslint-scope.Scope} scope The current scope.
		 * @param {Variable[]} unusedVars The list to push unused variables into.
		 * @private
		 */
		function processChildScopes(scope, unusedVars) {
			for (const childScope of scope.childScopes) {
				collectUnusedVariablesInScope(childScope, unusedVars);
				processChildScopes(childScope, unusedVars);
			}
		}

		/**
		 * Gets an array of variables without read references.
		 * @param {Scope} scope an eslint-scope Scope object.
		 * @param {Variable[]} unusedVars an array that saving result.
		 * @returns {Variable[]} unused variables of the scope and descendant scopes.
		 * @private
		 */
		function collectUnusedVariables(scope, unusedVars) {
			collectUnusedVariablesInScope(scope, unusedVars);
			processChildScopes(scope, unusedVars);
			return unusedVars;
		}
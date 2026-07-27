/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

/**
 * A simple name for the types of variables that this rule supports
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 */

/**
 * Bag of data used for formatting the `unusedVar` lint message.
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName The name of the unused var.
 * @property {'defined'|'assigned a value'} action Description of the vars state.
 * @property {string} additional Any additional info to be appended at the end.
 */

/**
 * Bag of data used for formatting the `usedIgnoredVar` lint message.
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName The name of the unused var.
 * @property {string} additional Any additional info to be appended at the end.
 */

/** @type {import('../types').Rule.RuleModule} */
module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow unused variables",
			recommended: true,
			url: "https://eslint.org/docs/latest/rules/no-unused-vars",
		},
		hasSuggestions: true,
		schema: [
			{
				oneOf: [
					{
						enum: ["all", "local"],
					},
					{
						type: "object",
						properties: {
							vars: {
								enum: ["all", "local"],
							},
							varsIgnorePattern: {
								type: "string",
							},
							args: {
								enum: ["all", "after-used", "none"],
							},
							ignoreRestSiblings: {
								type: "boolean",
							},
							argsIgnorePattern: {
								type: "string",
							},
							caughtErrors: {
								enum: ["all", "none"],
							},
							caughtErrorsIgnorePattern: {
								type: "string",
							},
							destructuredArrayIgnorePattern: {
								type: "string",
							},
							ignoreClassWithStaticInitBlock: {
								type: "boolean",
							},
							ignoreUsingDeclarations: {
								type: "boolean",
							},
							reportUsedIgnorePattern: {
								type: "boolean",
							},
						},
						additionalProperties: false,
					},
				],
			},
		],
		messages: {
			unusedVar:
				"'{{varName}}' is {{action}} but never used{{additional}}.",
			usedIgnoredVar:
				"'{{varName}}' is marked as ignored but is used{{additional}}.",
			removeVar: "Remove unused variable '{{varName}}'.",
		},
	},

	create(context) {
		const sourceCode = context.sourceCode;

		const REST_PROPERTY_TYPE =
			/^(?:RestElement|(?:Experimental)?RestProperty)$/u;

		const config = {
			vars: "all",
			args: "after-used",
			ignoreRestSiblings: false,
			caughtErrors: "all",
			ignoreClassWithStaticInitBlock: false,
			ignoreUsingDeclarations: false,
			reportUsedIgnorePattern: false,
		};

		const firstOption = context.options[0];

		if (firstOption) {
			if (typeof firstOption === "string") {
				config.vars = firstOption;
			} else {
				config.vars = firstOption.vars || config.vars;
				config.args = firstOption.args || config.args;
				config.ignoreRestSiblings =
					firstOption.ignoreRestSiblings || config.ignoreRestSiblings;
				config.caughtErrors =
					firstOption.caughtErrors || config.caughtErrors;
				config.ignoreClassWithStaticInitBlock =
					firstOption.ignoreClassWithStaticInitBlock ||
					config.ignoreClassWithStaticInitBlock;
				config.ignoreUsingDeclarations =
					firstOption.ignoreUsingDeclarations ||
					config.ignoreUsingDeclarations;
				config.reportUsedIgnorePattern =
					firstOption.reportUsedIgnorePattern ||
					config.reportUsedIgnorePattern;

				if (firstOption.varsIgnorePattern) {
					config.varsIgnorePattern = new RegExp(
						firstOption.varsIgnorePattern,
						"u",
					);
				}

				if (firstOption.argsIgnorePattern) {
					config.argsIgnorePattern = new RegExp(
						firstOption.argsIgnorePattern,
						"u",
					);
				}

				if (firstOption.caughtErrorsIgnorePattern) {
					config.caughtErrorsIgnorePattern = new RegExp(
						firstOption.caughtErrorsIgnorePattern,
						"u",
					);
				}

				if (firstOption.destructuredArrayIgnorePattern) {
					config.destructuredArrayIgnorePattern = new RegExp(
						firstOption.destructuredArrayIgnorePattern,
						"u",
					);
				}
			}
		}

		/**
		 * Determines what variable type a def is.
		 * @param  {Object} def the declaration to check
		 * @returns {VariableType} a simple name for the types of variables that this rule supports
		 */
		function defToVariableType(def) {
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
		 * @returns {[string | undefined, string | undefined]} the given variable's description and ignore pattern
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
					throw new Error(`Unexpected variable type: ${variableType}`);
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
		 * Generate the warning message about the variable being assigned and unused, including the ignore pattern if configured.
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
		 * Generate the warning message about a variable being used even though it is marked as being ignored.
		 * @param {Variable} variable eslint-scope variable object
		 * @param {VariableType} variableType a simple name for the types of variables that this rule supports
		 * @returns {UsedIgnoredVarMessageData} The message data to be used with this used ignored variable.
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
		 * Determine if an identifier is used either in for-in or for-of loops.
		 * @param {Reference} ref The reference to check.
		 * @returns {boolean} whether reference is used in the for-in loops
		 * @private
		 */
		function isForInOfRef(ref) {
			let target = ref.identifier.parent;

			if (target.type === "VariableDeclarator") {
				target = target.parent.parent;
			}

			if (
				target.type !== "ForInStatement" &&
				target.type !== "ForOfStatement"
			) {
				return false;
			}

			if (target.body.type === "BlockStatement") {
				target = target.body.body[0];
			} else {
				target = target.body;
			}

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

			return !posteriorParams.some(
				v => v.references.length > 0 || v.eslintUsed,
			);
		}

		/**
		 * Gets an array of variables without read references.
		 * @param {Scope} scope an eslint-scope Scope object.
		 * @param {Variable[]} unusedVars an array that saving result.
		 * @returns {Variable[]} unused variables of the scope and descendant scopes.
		 * @private
		 */
		function collectUnusedVariables(scope, unusedVars) {
			if (scope.type === "global" && config.vars !== "all") {
				return unusedVars;
			}

			const variables = scope.variables;
			const childScopes = scope.childScopes;

			for (let i = 0, l = variables.length; i < l; ++i) {
				const variable = variables[i];

				if (shouldSkipVariable(variable, scope)) {
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

			for (let i = 0, l = childScopes.length; i < l; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

		/**
		 * Determines whether a variable should be skipped from unused checks.
		 * @param {Variable} variable The variable to evaluate.
		 * @param {Scope} scope The current scope.
		 * @returns {boolean} True if the variable should be skipped.
		 */
		function shouldSkipVariable(variable, scope) {
			// Skip class scope self name
			if (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
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

			const def = variable.defs[0];
			if (!def) {
				return true;
			}

			const type = def.type;
			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

			// Skip elements of array destructuring patterns
			if (
				(def.name.parent.type === "ArrayPattern" ||
					refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name)
			) {
				reportUsedIgnoredIfNeeded(variable, "array-destructure");
				return true;
			}

			if (type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(
					node => node.type === "StaticBlock",
				);

				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
					return true;
				}
			}

			if (type === "CatchClause") {
				if (config.caughtErrors === "none") {
					return true;
				}

				if (
					config.caughtErrorsIgnorePattern &&
					config.caughtErrorsIgnorePattern.test(def.name.name)
				) {
					reportUsedIgnoredIfNeeded(variable, "catch-clause");
					return true;
				}
			} else if (type === "Parameter") {
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
					reportUsedIgnoredIfNeeded(variable, "parameter");
					return true;
				}

				if (
					config.args === "after-used" &&
					astUtils.isFunction(def.name.parent) &&
					!isAfterLastUsedArg(variable)
				) {
					return true;
				}
			} else {
				if (
					config.varsIgnorePattern &&
					config.varsIgnorePattern.test(def.name.name)
				) {
					reportUsedIgnoredIfNeeded(variable, "variable");
					return true;
				}
			}

			return false;
		}

		/**
		 * Reports a used-ignored variable if the configuration requires it.
		 * @param {Variable} variable The variable to report.
		 * @param {VariableType} variableType The type of the variable.
		 */
		function reportUsedIgnoredIfNeeded(variable, variableType) {
			if (!config.reportUsedIgnorePattern || !isUsedVariable(variable)) {
				return;
			}

			context.report({
				node: variable.defs[0].name,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, variableType),
			});
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

				if (type === "FunctionName") {
					functionDefinitions.push(node);
				}

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
				((parent.type === "AssignmentExpression" &&
					parent.left === id &&
					isUnusedExpression(parent) &&
					!astUtils.isLogicalAssignmentOperator(parent.operator)) ||
					(parent.type === "UpdateExpression" &&
						isUnusedExpression(parent)) ||
					(rhsNode &&
						isInside(id, rhsNode) &&
						!isInsideOfStorableFunction(id, rhsNode)))
			);
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
		 * fixes unused variables
		 * @param {Object} fixer fixer object
		 * @param {Object} unusedVar unused variable to fix
		 * @returns {Object} fixer object
		 */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			const isFunction = astUtils.isFunction;
			const isLoop = astUtils.isLoop;
			const allWriteReferences = unusedVar.references.filter(ref =>
				ref.isWrite(),
			);

			function getPreviousTokenStart(node, skips = 0) {
				return sourceCode.getTokenBefore(node, skips).range[0];
			}

			function getNextTokenEnd(node, skips = 0) {
				return sourceCode.getTokenAfter(node, skips).range[1];
			}

			function getTokenBeforeValue(node) {
				return sourceCode.getTokenBefore(node).value;
			}

			function getTokenAfterValue(node) {
				return sourceCode.getTokenAfter(node).value;
			}

			function hasSingleElement(node) {
				return node.elements.filter(e => e !== null).length === 1;
			}

			function hasImportOfCertainType(node, type) {
				return node.specifiers.some(e => e.type === type);
			}

			function isDeclarationNotSafeToRemove(nextToken, prevToken) {
				return (
					nextToken.type === "String" ||
					(prevToken &&
						!astUtils.isSemicolonToken(prevToken) &&
						!astUtils.isOpeningBraceToken(prevToken))
				);
			}

			function fixFunctionParameters(node) {
				const parentNode = node.parent;

				if (isFunction(parentNode)) {
					if (parentNode.params.length === 1) {
						return fixer.removeRange(node.range);
					}

					if (
						getTokenBeforeValue(node) === "(" &&
						getTokenAfterValue(node) === ","
					) {
						return fixer.removeRange([
							node.range[0],
							getNextTokenEnd(node),
						]);
					}

					return fixer.removeRange([
						getPreviousTokenStart(node),
						node.range[1],
					]);
				}

				return null;
			}

			function fixVariables(node) {
				const parentNode = node.parent;

				if (parentNode.type === "VariableDeclarator") {
					if (isLoop(parentNode.parent.parent)) {
						return null;
					}

					if (parentNode.parent.declarations.length === 1) {
						const nextToken = sourceCode.getTokenAfter(
							parentNode.parent,
						);
						const prevToken = sourceCode.getTokenBefore(
							parentNode.parent,
						);

						if (
							nextToken &&
							isDeclarationNotSafeToRemove(nextToken, prevToken)
						) {
							return null;
						}

						return fixer.removeRange(parentNode.parent.range);
					}

					if (getTokenBeforeValue(parentNode) === ",") {
						return fixer.removeRange([
							getPreviousTokenStart(parentNode),
							parentNode.range[1],
						]);
					}

					return fixer.removeRange([
						parentNode.range[0],
						getNextTokenEnd(parentNode),
					]);
				}

				if (getTokenBeforeValue(node) === ":") {
					if (parentNode.parent.type === "ObjectPattern") {
						return fixObjectWithValueSeparator(node);
					}
				}

				return fixFunctionParameters(node);
			}

			function fixNestedObjectVariable(node) {
				const parentNode = node.parent;

				if (
					parentNode.parent.parent.parent.type === "ObjectPattern" &&
					parentNode.parent.properties.length === 1
				) {
					return fixNestedObjectVariable(parentNode.parent);
				}

				if (parentNode.parent.type === "ObjectPattern") {
					if (parentNode.parent.properties.length === 1) {
						return fixVariables(parentNode.parent);
					}

					if (getTokenBeforeValue(parentNode) === "{") {
						return fixer.removeRange([
							parentNode.range[0],
							getNextTokenEnd(parentNode),
						]);
					}

					return fixer.removeRange([
						getPreviousTokenStart(parentNode),
						parentNode.range[1],
					]);
				}

				return null;
			}

			function fixNestedArrayVariable(node) {
				const parentNode = node.parent;

				if (
					parentNode.parent.type === "ArrayPattern" &&
					hasSingleElement(parentNode)
				) {
					return fixNestedArrayVariable(parentNode);
				}

				if (hasSingleElement(parentNode)) {
					if (getTokenBeforeValue(parentNode) === ":") {
						return fixVariables(parentNode);
					}

					if (parentNode.parent.type === "RestElement") {
						return fixRestInPattern(parentNode.parent);
					}

					return fixVariables(parentNode);
				}

				if (
					getTokenBeforeValue(node) === "," &&
					getTokenAfterValue(node) === "]"
				) {
					return fixer.removeRange([
						getPreviousTokenStart(node),
						node.range[1],
					]);
				}

				return fixer.removeRange(node.range);
			}

			function fixObjectWithValueSeparator(node) {
				const parentNode = node.parent.parent;

				if (
					parentNode.parent.type === "ArrayPattern" &&
					parentNode.properties.length === 1
				) {
					return fixNestedArrayVariable(parentNode);
				}

				return fixNestedObjectVariable(node);
			}

			function fixRestInPattern(node) {
				const parentNode = node.parent;

				if (isFunction(parentNode)) {
					if (parentNode.params.length === 1) {
						return fixer.removeRange(node.range);
					}

					return fixer.removeRange([
						getPreviousTokenStart(node),
						node.range[1],
					]);
				}

				if (parentNode.type === "ArrayPattern") {
					if (hasSingleElement(parentNode)) {
						if (parentNode.parent.type === "ArrayPattern") {
							return fixNestedArrayVariable(parentNode);
						}

						return fixVariables(parentNode);
					}

					return fixer.removeRange([
						getPreviousTokenStart(node),
						node.range[1],
					]);
				}

				return null;
			}

			if (
				allWriteReferences.some(
					ref => ref.identifier.range[0] !== id.range[0],
				)
			) {
				return null;
			}

			if (parentType === "VariableDeclarator") {
				if (parent.parent.declarations.length === 1) {
					if (
						isLoop(parent.parent.parent) &&
						parent.parent.parent.body !== parent.parent
					) {
						return null;
					}

					if (
						parent.parent.parent.type === "IfStatement" ||
						isLoop(parent.parent.parent) ||
						(parent.parent.parent.type === "WithStatement" &&
							parent.parent.parent.body === parent.parent)
					) {
						return fixer.replaceText(parent.parent, ";");
					}

					const nextToken = sourceCode.getTokenAfter(parent.parent);
					const prevToken = sourceCode.getTokenBefore(parent.parent);

					if (
						nextToken &&
						isDeclarationNotSafeToRemove(nextToken, prevToken)
					) {
						return null;
					}

					return fixer.removeRange(parent.parent.range);
				}

				if (tokenBefore.value === ",") {
					return fixer.removeRange([
						tokenBefore.range[0],
						parent.range[1],
					]);
				}

				return fixer.removeRange([
					parent.range[0],
					getNextTokenEnd(parent),
				]);
			}

			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					if (parent.parent.parent.type === "RestElement") {
						return fixRestInPattern(parent.parent.parent);
					}

					if (parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent.parent);
					}

					return fixVariables(parent.parent);
				}

				if (tokenBefore.value === ":") {
					if (
						getTokenBeforeValue(parent) === "{" &&
						getTokenAfterValue(parent) === ","
					) {
						return fixer.removeRange([
							parent.range[0],
							getNextTokenEnd(parent),
						]);
					}

					return fixer.removeRange([
						getPreviousTokenStart(parent),
						id.range[1],
					]);
				}
			}

			if (parentType === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "RestElement") {
						return fixRestInPattern(parent.parent);
					}

					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent);
					}

					return fixVariables(parent);
				}

				if (tokenBefore.value === "," && tokenAfter.value === ",") {
					return fixer.removeRange(id.range);
				}
			}

			if (parentType === "RestElement") {
				if (parent.parent.type === "ArrayPattern") {
					if (hasSingleElement(parent.parent)) {
						if (parent.parent.parent.type === "ArrayPattern") {
							return fixNestedArrayVariable(parent.parent);
						}

						return fixVariables(parent.parent);
					}

					return fixer.removeRange([
						getPreviousTokenStart(id, 1),
						id.range[1],
					]);
				}

				if (parent.parent.type === "ObjectPattern") {
					if (parent.parent.properties.length === 1) {
						return fixVariables(parent.parent);
					}

					return fixer.removeRange([
						getPreviousTokenStart(id, 1),
						id.range[1],
					]);
				}

				if (isFunction(parent.parent)) {
					if (parent.parent.params.length === 1) {
						return fixer.removeRange(parent.range);
					}

					return fixer.removeRange([
						getPreviousTokenStart(parent),
						parent.range[1],
					]);
				}
			}

			if (parentType === "AssignmentPattern") {
				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(parent);
				}

				if (parent.parent.parent.type === "ObjectPattern") {
					if (parent.parent.parent.properties.length === 1) {
						if (
							parent.parent.parent.parent.type === "ArrayPattern"
						) {
							return fixNestedArrayVariable(parent.parent.parent);
						}

						return fixVariables(parent.parent.parent);
					}

					if (
						getTokenBeforeValue(parent.parent) === "{" &&
						getTokenAfterValue(parent.parent) === ","
					) {
						return fixer.removeRange([
							parent.parent.range[0],
							getNextTokenEnd(parent.parent),
						]);
					}

					return fixer.removeRange([
						getPreviousTokenStart(parent.parent),
						parent.parent.range[1],
					]);
				}

				if (isFunction(parent.parent)) {
					return fixFunctionParameters(parent);
				}
			}

			if (parentType === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}

			if (parentType === "ImportDefaultSpecifier") {
				if (
					!hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
					!hasImportOfCertainType(
						parent.parent,
						"ImportNamespaceSpecifier",
					)
				) {
					return fixer.removeRange([
						parent.range[0],
						parent.parent.source.range[0],
					]);
				}

				return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
			}

			if (parentType === "ImportSpecifier") {
				if (
					parent.parent.specifiers.filter(
						e => e.type === "ImportSpecifier",
					).length === 1
				) {
					if (
						!hasImportOfCertainType(
							parent.parent,
							"ImportDefaultSpecifier",
						)
					) {
						return fixer.removeRange(parent.parent.range);
					}

					return fixer.removeRange([
						getPreviousTokenStart(parent, 1),
						tokenAfter.range[1],
					]);
				}

				if (getTokenBeforeValue(parent) === "{") {
					return fixer.removeRange([
						parent.range[0],
						getNextTokenEnd(parent),
					]);
				}

				return fixer.removeRange([
					getPreviousTokenStart(parent),
					parent.range[1],
				]);
			}

			if (parentType === "ImportNamespaceSpecifier") {
				if (
					hasImportOfCertainType(
						parent.parent,
						"ImportDefaultSpecifier",
					)
				) {
					return fixer.removeRange([
						getPreviousTokenStart(parent),
						parent.range[1],
					]);
				}

				return fixer.removeRange([
					parent.range[0],
					parent.parent.source.range[0],
				]);
			}

			if (parentType === "CatchClause") {
				return null;
			}

			if (parentType === "ClassDeclaration") {
				return fixer.removeRange(parent.range);
			}

			if (tokenBefore?.value === ",") {
				return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
			}

			if (tokenAfter.value === ",") {
				if (tokenBefore.value === "(") {
					return fixer.removeRange([
						id.range[0],
						tokenAfter.range[1],
					]);
				}

				if (tokenBefore.value === "{") {
					return fixer.removeRange([
						id.range[0],
						tokenAfter.range[1],
					]);
				}
			}

			if (
				parentType === "ArrowFunctionExpression" &&
				parent.params.length === 1 &&
				tokenAfter?.value !== ")"
			) {
				return fixer.replaceText(id, "()");
			}

			return fixer.removeRange(id.range);
		}

		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(
					sourceCode.getScope(programNode),
					[],
				);

				for (let i = 0, l = unusedVars.length; i < l; ++i) {
					const unusedVar = unusedVars[i];

					if (unusedVar.defs.length > 0) {
						const writeReferences = unusedVar.references.filter(
							ref =>
								ref.isWrite() &&
								ref.from.variableScope ===
									unusedVar.scope.variableScope,
						);

						let referenceToReport;

						if (writeReferences.length > 0) {
							referenceToReport = writeReferences.at(-1);
						}

						context.report({
							node: referenceToReport
								? referenceToReport.identifier
								: unusedVar.identifiers[0],
							messageId: "unusedVar",
							data: unusedVar.references.some(ref =>
								ref.isWrite(),
							)
								? getAssignedMessageData(unusedVar)
								: getDefinedMessageData(unusedVar),
							suggest: [
								{
									messageId: "removeVar",
									data: {
										varName: unusedVar.name,
									},
									fix(fixer) {
										return handleFixes(fixer, unusedVar);
									},
								},
							],
						});
					} else if (unusedVar.eslintExplicitGlobalComments) {
						const directiveComment =
							unusedVar.eslintExplicitGlobalComments[0];

						context.report({
							node: programNode,
							loc: astUtils.getNameLocationInGlobalDirectiveComment(
								sourceCode,
								directiveComment,
								unusedVar.name,
							),
							messageId: "unusedVar",
							data: getDefinedMessageData(unusedVar),
						});
					}
				}
			},
		};
	},
};
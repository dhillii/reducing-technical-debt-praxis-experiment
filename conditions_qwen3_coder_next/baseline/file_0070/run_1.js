/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

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

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

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
			return getVariableMessageData(unusedVar, "defined");
		}

		/**
		 * Generate the warning message about the variable being
		 * assigned and unused, including the ignore pattern if configured.
		 * @param {Variable} unusedVar eslint-scope variable object.
		 * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
		 */
		function getAssignedMessageData(unusedVar) {
			return getVariableMessageData(unusedVar, "assigned a value");
		}

		/**
		 * Generate the message data for a variable being unused
		 * @param {Variable} unusedVar The variable
		 * @param {string} action Description of usage state
		 * @returns {UnusedVarMessageData} Message data
		 */
		function getVariableMessageData(unusedVar, action) {
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
				action,
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

			if (!definition) {
				return false;
			}

			let node = definition.node;

			if (node.type === "VariableDeclarator") {
				node = node.parent;
			} else if (definition.type === "Parameter") {
				return false;
			}

			return node.parent.type.indexOf("Export") === 0;
		}

		/**
		 * Determines if a variable uses the explicit resource management protocol.
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
			if (!config.ignoreRestSiblings) {
				return false;
			}

			const hasRestSiblingDefinition = variable.defs.some(def =>
				hasRestSibling(def.name.parent),
			);
			const hasRestSiblingReference = variable.references.some(ref =>
				hasRestSibling(ref.identifier.parent),
			);

			return hasRestSiblingDefinition || hasRestSiblingReference;
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
		 * @param {ASTNode} funcNode A function node to check.
		 * @param {ASTNode} rhsNode The RHS node of the previous assignment.
		 * @returns {boolean} `true` if under the following conditions:
		 *      - the funcNode is assigned to a variable.
		 *      - the funcNode is bound to a property and the object can be used later.
		 *      - the funcNode is bound as an argument of a function call.
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
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (shouldProcessScope(scope)) {
				checkVariables(variables, unusedVars);
			}

			childScopes.forEach(childScope =>
				collectUnusedVariables(childScope, unusedVars),
			);

			return unusedVars;
		}

		/**
		 * Determines if a scope should be processed based on config
		 * @param {Scope} scope Scope to check
		 * @returns {boolean} true if the scope should be processed
		 */
		function shouldProcessScope(scope) {
			return scope.type !== "global" || config.vars === "all";
		}

		/**
		 * Checks variables in a scope and adds unused ones to unusedVars array
		 * @param {Variable[]} variables Variables in the scope
		 * @param {Variable[]} unusedVars Array to collect unused variables
		 */
		function checkVariables(variables, unusedVars) {
			for (const variable of variables) {
				if (shouldSkipVariable(variable)) {
					continue;
				}

				const def = variable.defs[0];

				if (!def) {
					continue;
				}

				const type = def.type;

				// Handle array destructuring with ignore pattern
				if (shouldSkipArrayDestructuring(variable, def)) {
					continue;
				}

				if (shouldSkipClassName(variable, def)) {
					continue;
				}

				// Handle caught errors
				if (shouldSkipCatchVariable(variable, def)) {
					continue;
				}

				// Handle parameters
				if (shouldSkipParameter(variable, def)) {
					continue;
				}

				// Handle regular variables
				if (shouldSkipVariableWithIgnorePattern(variable, def)) {
					continue;
				}

				if (shouldReportAsUnused(variable)) {
					unusedVars.push(variable);
				}
			}
		}

		/**
		 * Determines if a variable should be skipped based on special conditions
		 * @param {Variable} variable Variable to check
		 * @returns {boolean} true if should skip
		 */
		function shouldSkipVariable(variable) {
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
			if (
				!config.reportUsedIgnorePattern &&
				variable.eslintUsed
			) {
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

			return false;
		}

		/**
		 * Determines if array destructuring should be skipped based on ignore pattern
		 * @param {Variable} variable Variable to check
		 * @param {Object} def Definition
		 * @returns {boolean} true if should skip
		 */
		function shouldSkipArrayDestructuring(variable, def) {
			if (
				(def.name.parent.type === "ArrayPattern" ||
					variable.references.some(ref =>
						ref.identifier.parent.type === "ArrayPattern",
					)) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name)
			) {
				if (
					config.reportUsedIgnorePattern &&
					isUsedVariable(variable)
				) {
					reportUsedIgnoredVar(variable, "array-destructure");
				}
				return true;
			}

			return false;
		}

		/**
		 * Determines if class name should be skipped
		 * @param {Variable} variable Variable to check
		 * @param {Object} def Definition
		 * @returns {boolean} true if should skip
		 */
		function shouldSkipClassName(variable, def) {
			if (def.type === "ClassName") {
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

			return false;
		}

		/**
		 * Determines if catch variable should be skipped
		 * @param {Variable} variable Variable to check
		 * @param {Object} def Definition
		 * @returns {boolean} true if should skip
		 */
		function shouldSkipCatchVariable(variable, def) {
			if (def.type === "CatchClause") {
				if (config.caughtErrors === "none") {
					return true;
				}

				if (
					config.caughtErrorsIgnorePattern &&
					config.caughtErrorsIgnorePattern.test(def.name.name)
				) {
					if (
						config.reportUsedIgnorePattern &&
						isUsedVariable(variable)
					) {
						reportUsedIgnoredVar(variable, "catch-clause");
					}
					return true;
				}
			}

			return false;
		}

		/**
		 * Determines if parameter should be skipped
		 * @param {Variable} variable Variable to check
		 * @param {Object} def Definition
		 * @returns {boolean} true if should skip
		 */
		function shouldSkipParameter(variable, def) {
			if (def.type === "Parameter") {
				// skip any setter argument
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

				// skip ignored parameters
				if (
					config.argsIgnorePattern &&
					config.argsIgnorePattern.test(def.name.name)
				) {
					if (
						config.reportUsedIgnorePattern &&
						isUsedVariable(variable)
					) {
						reportUsedIgnoredVar(variable, "parameter");
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
			}

			return false;
		}

		/**
		 * Determines if variable with ignore pattern should be skipped
		 * @param {Variable} variable Variable to check
		 * @param {Object} def Definition
		 * @returns {boolean} true if should skip
		 */
		function shouldSkipVariableWithIgnorePattern(variable, def) {
			if (
				config.varsIgnorePattern &&
				config.varsIgnorePattern.test(def.name.name)
			) {
				if (
					config.reportUsedIgnorePattern &&
					isUsedVariable(variable)
				) {
					reportUsedIgnoredVar(variable, "variable");
				}
				return true;
			}

			return false;
		}

		/**
		 * Determines if variable should be reported as unused
		 * @param {Variable} variable Variable to check
		 * @returns {boolean} true if should report as unused
		 */
		function shouldReportAsUnused(variable) {
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

		/**
		 * Reports a used ignored variable
		 * @param {Variable} variable Variable to report
		 * @param {VariableType} variableType Type of variable
		 */
		function reportUsedIgnoredVar(variable, variableType) {
			context.report({
				node: variable.defs[0].node,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, variableType),
			});
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

			if (
				allWriteReferences.some(
					ref => ref.identifier.range[0] !== id.range[0],
				)
			) {
				return null;
			}

			return applyFixes();
		}

		/**
		 * Apply fixes based on parent type
		 * @returns {Object|null} fixer object or null
		 */
		function applyFixes() {
			// fix based on parent type
			switch (parentType) {
				case "VariableDeclarator":
					return fixVariableDeclarator();
				case "ObjectPattern":
					return fixObjectPattern();
				case "ArrayPattern":
					return fixArrayPattern();
				case "RestElement":
					return fixRestElement();
				case "AssignmentPattern":
					return fixAssignmentPattern();
				case "FunctionDeclaration":
					return fixer.removeRange(parent.range);
				case "ImportDefaultSpecifier":
					return fixImportDefaultSpecifier();
				case "ImportSpecifier":
					return fixImportSpecifier();
				case "ImportNamespaceSpecifier":
					return fixImportNamespaceSpecifier();
				case "CatchClause":
					return null;
				case "ClassDeclaration":
					return fixer.removeRange(parent.range);
				default:
					return fixer.removeRange(id.range);
			}
		}

		/**
		 * Fix variable declarator
		 * @returns {Object|null} fixer object or null
		 */
		function fixVariableDeclarator() {
			if (isLoop(parent.parent.parent)) {
				return null;
			}

			if (parent.parent.declarations.length === 1) {
				const nextToken = sourceCode.getTokenAfter(parent.parent);
				const prevToken = sourceCode.getTokenBefore(parent.parent);

				if (
					nextToken &&
					(nextToken.type === "String" ||
						(prevToken &&
							!astUtils.isSemicolonToken(prevToken) &&
							!astUtils.isOpeningBraceToken(prevToken)))
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
				sourceCode.getTokenAfter(parent).range[1],
			]);
		}

		/**
		 * Fix object pattern
		 * @returns {Object|null} fixer object or null
		 */
		function fixObjectPattern() {
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
						sourceCode.getTokenAfter(parent).range[1],
					]);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(parent).range[0],
					id.range[1],
				]);
			}

			return null;
		}

		/**
		 * Fix array pattern
		 * @returns {Object|null} fixer object or null
		 */
		function fixArrayPattern() {
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

			return fixer.removeRange(id.range);
		}

		/**
		 * Fix rest element
		 * @returns {Object|null} fixer object or null
		 */
		function fixRestElement() {
			if (parent.parent.type === "ArrayPattern") {
				if (hasSingleElement(parent.parent)) {
					if (parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent.parent);
					}

					return fixVariables(parent.parent);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(parent, 1).range[0],
					id.range[1],
				]);
			}

			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(parent.parent);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(parent, 1).range[0],
					id.range[1],
				]);
			}

			if (isFunction(parent.parent)) {
				if (parent.parent.params.length === 1) {
					return fixer.removeRange(parent.range);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(parent).range[0],
					parent.range[1],
				]);
			}

			return null;
		}

		/**
		 * Fix assignment pattern
		 * @returns {Object|null} fixer object or null
		 */
		function fixAssignmentPattern() {
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
						sourceCode.getTokenAfter(parent.parent).range[1],
					]);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(parent.parent).range[0],
					parent.parent.range[1],
				]);
			}

			if (isFunction(parent.parent)) {
				return fixFunctionParameters(parent);
			}

			return null;
		}

		/**
		 * Fix import default specifier
		 * @returns {Object|null} fixer object or null
		 */
		function fixImportDefaultSpecifier() {
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

		/**
		 * Fix import specifier
		 * @returns {Object|null} fixer object or null
		 */
		function fixImportSpecifier() {
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
					sourceCode.getTokenBefore(parent, 1).range[0],
					tokenAfter.range[1],
				]);
			}

			if (tokenBefore.value === "{") {
				return fixer.removeRange([
					parent.range[0],
					sourceCode.getTokenAfter(parent).range[1],
				]);
			}

			return fixer.removeRange([
				sourceCode.getTokenBefore(parent).range[0],
				parent.range[1],
			]);
		}

		/**
		 * Fix import namespace specifier
		 * @returns {Object|null} fixer object or null
		 */
		function fixImportNamespaceSpecifier() {
			if (
				hasImportOfCertainType(
					parent.parent,
					"ImportDefaultSpecifier",
				)
			) {
				return fixer.removeRange([
					sourceCode.getTokenBefore(parent).range[0],
					parent.range[1],
				]);
			}

			return fixer.removeRange([
				parent.range[0],
				parent.parent.source.range[0],
			]);
		}

		/**
		 * helper functions extracted for readability
		 */
		function getPreviousTokenStart(node, skips) {
			return sourceCode.getTokenBefore(node, skips).range[0];
		}

		function getNextTokenEnd(node, skips) {
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
					const nextToken = sourceCode.getTokenAfter(parentNode.parent);
					const prevToken = sourceCode.getTokenBefore(parentNode.parent);

					if (
						nextToken &&
						(nextToken.type === "String" ||
							(prevToken &&
								!astUtils.isSemicolonToken(prevToken) &&
								!astUtils.isOpeningBraceToken(prevToken)))
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
					return fixNestedObjectVariable(node);
				}
			}

			return fixFunctionParameters(node);
		}

		function fixNestedObjectVariable(node) {
			const parentNode = node.parent;

			if (
				parentNode.parent.parent.parent.type === "ObjectPattern" &&
				parentNode.parent.parent.properties.length === 1
			) {
				return fixNestedObjectVariable(parentNode.parent.parent);
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

		function fixNestedObjectVariable(node) {
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

		return fixer.removeRange(id.range);
	}

		//--------------------------------------------------------------------------
		// Public
		//--------------------------------------------------------------------------

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
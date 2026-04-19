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
			const [variableDescription, pattern] = getVariableDescription(
				variableType,
			);

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
			const variables = scope.variables;
			const childScopes = scope.childScopes;
			let i, l;

			if (scope.type !== "global" || config.vars === "all") {
				for (i = 0, l = variables.length; i < l; ++i) {
					const variable = variables[i];

					if (
						shouldIgnoreVariable(variable) ||
						isUsedVariable(variable) ||
						isExported(variable) ||
						usesExplicitResourceManagement(variable) ||
						hasRestSpreadSibling(variable)
					) {
						continue;
					}

					unusedVars.push(variable);
				}
			}

			for (i = 0, l = childScopes.length; i < l; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

		/**
		 * Determines whether a variable should be ignored based on configuration.
		 * @param {Variable} variable eslint-scope variable object.
		 * @returns {boolean} true if the variable should be ignored.
		 * @private
		 */
		function shouldIgnoreVariable(variable) {
			const def = variable.defs[0];

			if (!def) {
				return true;
			}

			const type = def.type;

			// Skip elements of array destructuring patterns
			if (
				(def.name.parent.type === "ArrayPattern" ||
					variable.references.some(
						ref => ref.identifier.parent.type === "ArrayPattern",
					)) &&
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
		 * Reports a used ignored variable if the configuration requires it.
		 * @param {Variable} variable eslint-scope variable object.
		 * @param {VariableType} variableType type of the variable.
		 * @private
		 */
		function reportUsedIgnoredIfNeeded(variable, variableType) {
			if (
				config.reportUsedIgnorePattern &&
				isUsedVariable(variable)
			) {
				context.report({
					node: variable.defs[0].name,
					messageId: "usedIgnoredVar",
					data: getUsedIgnoredMessageData(variable, variableType),
				});
			}
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
		 * Checks whether a reference is a read to update itself or not.
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
		 * Determines if a reference is a read operation.
		 * @param {Reference} ref An eslint-scope Reference
		 * @returns {boolean} whether the given reference represents a read operation
		 * @private
		 */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/**
		 * Checks whether a reference is a read to update itself or not.
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
				const isLast

<|call|>
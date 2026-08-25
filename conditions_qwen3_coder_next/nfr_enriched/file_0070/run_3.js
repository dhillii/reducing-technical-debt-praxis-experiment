// Refactored code to reduce Cognitive Complexity while preserving behavior and API.  
// Extracted complex logic into smaller, focused functions with clear responsibilities.  

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
			return generateUnusedVarMessageData(unusedVar, "defined");
		}

		/**
		 * Generate the warning message about the variable being
		 * assigned and unused, including the ignore pattern if configured.
		 * @param {Variable} unusedVar eslint-scope variable object.
		 * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
		 */
		function getAssignedMessageData(unusedVar) {
			return generateUnusedVarMessageData(unusedVar, "assigned a value");
		}

		/**
		 * Generate the message data for unused variables
		 * @param {Variable} unusedVar The variable
		 * @param {string} action Action description ('defined' or 'assigned a value')
		 * @returns {UnusedVarMessageData} The message data
		 */
		function generateUnusedVarMessageData(unusedVar, action) {
			const def = unusedVar.defs[0];
			let additional = "";

			if (def) {
				const [variableDescription, pattern] =
					getVariableDescription(defToVariableType(def));

				if (pattern && variableDescription) {
					additional = `. Allowed unused ${variableDescription} must match ${pattern}`;
				}
			}

			return {
				varName: unusedVar.name,
				action: action,
				additional: additional,
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

			let additional = "";

			if (pattern && variableDescription) {
				additional = `. Used ${variableDescription} must not match ${pattern}`;
			}

			return {
				varName: variable.name,
				additional: additional,
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
		 * Determines if a given variable uses the explicit resource management protocol.
		 * @param {Variable} variable eslint-scope variable object.
		 * @returns {boolean} True if the variable is declared with "using" or "await using"
		 * @private
		 */
		function usesExplicitResourceManagement(variable) {
			const definition = variable.defs[0];

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
				} else if (
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
		 * Determines if a variable matches ignore rules and reports accordingly.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The variable definition.
		 * @param {VariableType} variableType The type of variable.
		 * @param {string} messageId The message ID to use for reporting.
		 * @returns {boolean} true if the variable was skipped due to ignore pattern.
		 */
		function handleIgnorePattern(variable, def, variableType, messageId) {
			if (!variable.defs[0]) {
				return false;
			}

			let pattern;
			switch (variableType) {
				case "array-destructure":
					pattern = config.destructuredArrayIgnorePattern;
					break;
				case "catch-clause":
					pattern = config.caughtErrorsIgnorePattern;
					break;
				case "parameter":
					pattern = config.argsIgnorePattern;
					break;
				case "variable":
					pattern = config.varsIgnorePattern;
					break;
				default:
					return false;
			}

			if (!pattern) {
				return false;
			}

			if (!pattern.test(def.name.name)) {
				return false;
			}

			if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
				context.report({
					node: def.name,
					messageId,
					data: getUsedIgnoredMessageData(variable, variableType),
				});
			}

			return true;
		}

		/**
		 * Collects unused variables from a scope.
		 * @param {Scope} scope The current scope.
		 * @param {Variable[]} unusedVars Array to which unused variables are appended.
		 * @returns {Variable[]} Updated list of unused variables.
		 * @private
		 */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;

			if (shouldProcessScope(scope)) {
				for (const variable of variables) {
					if (skipVariable(variable, scope)) {
						continue;
					}

					const def = variable.defs[0];

					if (!def) {
						continue;
					}

					if (skipExportedOrIgnoredVariable(variable, def)) {
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

			for (const childScope of scope.childScopes) {
				collectUnusedVariables(childScope, unusedVars);
			}

			return unusedVars;
		}

		/**
		 * Determines whether to process a given scope.
		 * @param {Scope} scope The scope to consider.
		 * @returns {boolean} true if the scope should be processed.
		 */
		function shouldProcessScope(scope) {
			return scope.type !== "global" || config.vars === "all";
		}

		/**
		 * Checks if a variable should be skipped during analysis.
		 * @param {Variable} variable The variable to check.
		 * @param {Scope} scope The current scope.
		 * @returns {boolean} true if the variable should be skipped.
		 */
		function skipVariable(variable, scope) {
			if (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
			) {
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

		/**
		 * Handles complex skip logic for individual variables.
		 * @param {Variable} variable The variable to check.
		 * @param {Object} def The variable definition.
		 * @returns {boolean} true if the variable should be skipped.
		 */
		function skipExportedOrIgnoredVariable(variable, def) {
			const type = def.type;

			if (
				(def.name.parent.type === "ArrayPattern" ||
					variable.references.some(
						ref => ref.identifier.parent.type === "ArrayPattern",
					)) &&
				handleIgnorePattern(variable, def, "array-destructure", "usedIgnoredVar")
			) {
				return true;
			}

			if (type === "ClassName") {
				if (
					config.ignoreClassWithStaticInitBlock &&
					def.node.body.body.some(node => node.type === "StaticBlock")
				) {
					return true;
				}
			}

			if (type === "CatchClause") {
				if (config.caughtErrors === "none") {
					return true;
				}
				if (
					handleIgnorePattern(
						variable,
						def,
						"catch-clause",
						"usedIgnoredVar",
					)
				) {
					return true;
				}
			} else if (type === "Parameter") {
				const parent = def.node.parent;

				if (
					(parent.type === "Property" || parent.type === "MethodDefinition") &&
					parent.kind === "set"
				) {
					return true;
				}

				if (config.args === "none") {
					return true;
				}

				if (
					handleIgnorePattern(variable, def, "parameter", "usedIgnoredVar")
				) {
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
				if (handleIgnorePattern(variable, def, "variable", "usedIgnoredVar")) {
					return true;
				}
			}

			return false;
		}

		/**
		 * Creates fixer for unused variables.
		 * @param {Object} fixer The fixer object.
		 * @param {Variable} unusedVar The unused variable.
		 * @returns {Function} A fix function.
		 */
		function handleFixes(fixer, unusedVar) {
			return function(fixer) {
				return createFixerFunction(fixer, unusedVar);
			};
		}

		/**
		 * Creates the core fixer logic for an unused variable.
		 * @param {Object} fixer The fixer object.
		 * @param {Variable} unusedVar The unused variable.
		 * @returns {Object|null} A fixer result or null.
		 */
		function createFixerFunction(fixer, unusedVar) {
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

			switch (parentType) {
				case "VariableDeclarator":
					return fixVariableDeclarator(
						fixer,
						parent,
						id,
						tokenBefore,
						tokenAfter,
					);
				case "ObjectPattern":
					return fixObjectPattern(
						fixer,
						parent,
						parentType,
						id,
						tokenBefore,
						tokenAfter,
					);
				case "ArrayPattern":
					return fixArrayPattern(
						fixer,
						parent,
						id,
						tokenBefore,
						tokenAfter,
					);
				case "RestElement":
					return fixRestElement(fixer, parent, id);
				case "AssignmentPattern":
					return fixAssignmentPattern(fixer, parent);
				case "FunctionDeclaration":
					return fixFunctionDeclaration(fixer, parent);
				case "ImportDefaultSpecifier":
					return fixImportDefaultSpecifier(fixer, parent, tokenAfter);
				case "ImportSpecifier":
					return fixImportSpecifier(fixer, parent, tokenBefore, tokenAfter);
				case "ImportNamespaceSpecifier":
					return fixImportNamespaceSpecifier(fixer, parent);
				case "CatchClause":
					return null;
				case "ClassDeclaration":
					return fixer.removeRange(parent.range);
				default:
					if (tokenBefore?.value === ",") {
						return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
					}
					if (tokenAfter?.value === ",") {
						return handleCommaSeparatedFix(fixer, parent, id, tokenBefore, tokenAfter);
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
		}

		/**
		 * Fixes unused variable declarators.
		 */
		function fixVariableDeclarator(
			fixer,
			parent,
			id,
			tokenBefore,
			tokenAfter,
		) {
			const declaration = parent.parent;

			if (declaration.declarations.length === 1) {
				if (astUtils.isLoop(declaration.parent.parent)) {
					return null;
				}

				if (
					declaration.parent.parent.type === "IfStatement" ||
					astUtils.isLoop(declaration.parent.parent) ||
					(declaration.parent.parent.type === "WithStatement" &&
						declaration.parent.parent.body === declaration.parent)
				) {
					return fixer.replaceText(declaration.parent, ";");
				}

				const nextToken = sourceCode.getTokenAfter(declaration.parent);
				const prevToken = sourceCode.getTokenBefore(declaration.parent);

				if (
					nextToken &&
					(nextToken.type === "String" ||
						(prevToken &&
							!astUtils.isSemicolonToken(prevToken) &&
							!astUtils.isOpeningBraceToken(prevToken)))
				) {
					return null;
				}

				return fixer.removeRange(declaration.parent.range);
			}

			if (tokenBefore?.value === ",") {
				return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
			}

			return fixer.removeRange([parent.range[0], tokenAfter.range[1]]);
		}

		/**
		 * Fixes unused variables in object patterns.
		 */
		function fixObjectPattern(
			fixer,
			parent,
			parentType,
			id,
			tokenBefore,
			tokenAfter,
		) {
			if (parent.properties.length === 1) {
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent);
				}
				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent.parent);
				}
				return fixVariables(fixer, parent);
			}

			if (tokenBefore?.value === ":") {
				if (tokenBefore.value === "{" && tokenAfter.value === ",") {
					return fixer.removeRange([parent.range[0], tokenAfter.range[1]]);
				}

				return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
			}

			return null;
		}

		/**
		 * Fixes unused variables in array patterns.
		 */
		function fixArrayPattern(fixer, parent, id, tokenBefore, tokenAfter) {
			if (hasSingleElement(parent)) {
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent);
				}
				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent.parent);
				}
				return fixVariables(fixer, parent);
			}

			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(id.range);
			}

			return null;
		}

		/**
		 * Fixes rest elements.
		 */
		function fixRestElement(fixer, parent, id) {
			if (parent.parent.type === "ArrayPattern") {
				if (hasSingleElement(parent.parent)) {
					if (parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent.parent.parent);
					}
					return fixVariables(fixer, parent.parent);
				}

				return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
			}

			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(fixer, parent.parent);
				}

				return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
			}

			if (astUtils.isFunction(parent.parent)) {
				if (parent.parent.params.length === 1) {
					return fixer.removeRange(parent.range);
				}

				return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
			}

			return null;
		}

		/**
		 * Fixes assignment patterns.
		 */
		function fixAssignmentPattern(fixer, parent) {
			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, parent);
			}

			if (parent.parent.parent.type === "ObjectPattern") {
				if (parent.parent.parent.properties.length === 1) {
					if (
						parent.parent.parent.parent.type === "ArrayPattern"
					) {
						return fixNestedArrayVariable(
							fixer,
							parent.parent.parent.parent,
						);
					}
					return fixVariables(fixer, parent.parent.parent);
				}

				if (tokenBefore.value === "{" && tokenAfter.value === ",") {
					return fixer.removeRange([
						parent.parent.parent.range[0],
						tokenAfter.range[1],
					]);
				}

				return fixer.removeRange([tokenBefore.range[0], parent.parent.parent.range[1]]);
			}

			if (astUtils.isFunction(parent.parent)) {
				return fixFunctionParameters(fixer, parent);
			}

			return null;
		}

		/**
		 * Fixes function declarations.
		 */
		function fixFunctionDeclaration(fixer, parent) {
			return fixer.removeRange(parent.range);
		}

		/**
		 * Fixes import default specifiers.
		 */
		function fixImportDefaultSpecifier(fixer, parent, tokenAfter) {
			if (
				!parent.parent.specifiers.some(e => e.type === "ImportSpecifier") &&
				!parent.parent.specifiers.some(
					e => e.type === "ImportNamespaceSpecifier",
				)
			) {
				return fixer.removeRange([
					parent.range[0],
					parent.parent.source.range[0],
				]);
			}

			return fixer.removeRange([parent.range[0], tokenAfter.range[1]]);
		}

		/**
		 * Fixes import specifiers.
		 */
		function fixImportSpecifier(fixer, parent, tokenBefore, tokenAfter) {
			if (parent.parent.specifiers.filter(e => e.type === "ImportSpecifier").length === 1) {
				if (
					!parent.parent.specifiers.some(
						e => e.type === "ImportDefaultSpecifier",
					)
				) {
					return fixer.removeRange(parent.parent.range);
				}

				return fixer.removeRange([
					tokenBefore.range[0],
					tokenAfter.range[1],
				]);
			}

			if (tokenBefore.value === "{") {
				return fixer.removeRange([parent.range[0], tokenAfter.range[1]]);
			}

			return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
		}

		/**
		 * Fixes import namespace specifiers.
		 */
		function fixImportNamespaceSpecifier(fixer, parent) {
			if (
				parent.parent.specifiers.some(
					e => e.type === "ImportDefaultSpecifier",
				)
			) {
				return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
			}

			return fixer.removeRange([
				parent.range[0],
				parent.parent.source.range[0],
			]);
		}

		/**
		 * Handles comma-separated fixes.
		 */
		function handleCommaSeparatedFix(fixer, parent, id, tokenBefore, tokenAfter) {
			if (tokenBefore.value === "(") {
				return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
			}

			if (tokenBefore.value === "{") {
				return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
			}

			return null;
		}

		/**
		 * Fixes nested array pattern variables.
		 */
		function fixNestedArrayVariable(fixer, node) {
			if (hasSingleElement(node)) {
				if (node.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, node.parent);
				}
				return fixVariables(fixer, node.parent);
			}

			if (node.parent.type === "RestElement") {
				return fixRestInPattern(fixer, node.parent);
			}

			if (node.length === 1) {
				return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
			}

			return fixer.removeRange(node.range);
		}

		/**
		 * Fixes variables in rest patterns.
		 */
		function fixRestInPattern(fixer, node) {
			if (astUtils.isFunction(node.parent)) {
				if (node.parent.params.length === 1) {
					return fixer.removeRange(node.range);
				}
				return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
			}

			if (node.parent.type === "ArrayPattern") {
				if (hasSingleElement(node.parent)) {
					if (node.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, node.parent.parent);
					}
					return fixVariables(fixer, node.parent);
				}
				return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
			}

			return null;
		}

		/**
		 * Fixes nested object variable patterns.
		 */
		function fixObjectWithValueSeparator(fixer, node) {
			const parent = node.parent.parent;

			if (parent.parent.type === "ArrayPattern" && parent.properties.length === 1) {
				return fixNestedArrayVariable(fixer, parent);
			}

			return fixNestedObjectVariable(fixer, node);
		}

		/**
		 * Fixes nested object variable patterns.
		 */
		function fixNestedObjectVariable(fixer, node) {
			const parent = node.parent;

			if (parent.parent.parent.parent.type === "ObjectPattern" && parent.parent.properties.length === 1) {
				return fixNestedObjectVariable(fixer, parent.parent);
			}

			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(fixer, parent.parent);
				}

				if (tokenBefore.value === "{") {
					return fixer.removeRange([parent.range[0], tokenAfter.range[1]]);
				}

				return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
			}

			return null;
		}

		/**
		 * Fixes variables.
		 */
		function fixVariables(fixer, node) {
			const parent = node.parent;

			if (parent.type === "VariableDeclarator") {
				if (astUtils.isLoop(parent.parent.parent.parent)) {
					return null;
				}

				if (parent.parent.declarations.length === 1) {
					const nextToken = sourceCode.getTokenAfter(parent.parent);
					const prevToken = sourceCode.getTokenBefore(parent.parent);

					if (
						nextToken?.type === "String" ||
						(prevToken &&
							!astUtils.isSemicolonToken(prevToken) &&
							!astUtils.isOpeningBraceToken(prevToken))
					) {
						return null;
					}

					return fixer.removeRange(parent.parent.range);
				}

				if (tokenBefore?.value === ",") {
					return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
				}

				return fixer.removeRange([parent.range[0], tokenAfter.range[1]]);
			}

			if (tokenBefore?.value === ":") {
				return fixObjectWithValueSeparator(fixer, parent);
			}

			return fixFunctionParameters(fixer, node);
		}

		/**
		 * Fixes function parameters.
		 */
		function fixFunctionParameters(fixer, node) {
			const parent = node.parent;

			if (astUtils.isFunction(parent)) {
				if (parent.params.length === 1) {
					return fixer.removeRange(node.range);
				}

				if (
					tokenBefore?.value === "(" &&
					tokenAfter?.value === ","
				) {
					return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
				}

				return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
			}

			return null;
		}

		/**
		 * Checks if array has a single element.
		 */
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		/**
		 * Gets the previous token's start range.
		 */
		function getPreviousTokenStart(node, skips = 0) {
			return sourceCode.getTokenBefore(node, skips).range[0];
		}

		/**
		 * Gets the next token's end range.
		 */
		function getNextTokenEnd(node, skips = 0) {
			return sourceCode.getTokenAfter(node, skips).range[1];
		}

		/**
		 * Gets the previous token value.
		 */
		function getTokenBeforeValue(node) {
			return sourceCode.getTokenBefore(node).value;
		}

		/**
		 * Gets the next token value.
		 */
		function getTokenAfterValue(node) {
			return sourceCode.getTokenAfter(node).value;
		}

		/**
		 * Checks if a declaration is safe to remove.
		 */
		function isDeclarationNotSafeToRemove(nextToken, prevToken) {
			return (
				nextToken?.type === "String" ||
				(prevToken &&
					!astUtils.isSemicolonToken(prevToken) &&
					!astUtils.isOpeningBraceToken(prevToken))
			);
		}

		/**
		 * Checks if import has a specific type.
		 */
		function hasImportOfCertainType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}

		//--------------------------------------------------------------------------
		// Public
		//--------------------------------------------------------------------------

		return {
			"Program:exit"(programNode) {
				const scope = sourceCode.getScope(programNode);
				const unusedVars = collectUnusedVariables(scope, []);

				for (const unusedVar of unusedVars) {
					reportUnusedVariable(unusedVar);
				}
			},
		};

		/**
		 * Reports an unused variable.
		 * @param {Variable} unusedVar The unused variable to report.
		 */
		function reportUnusedVariable(unusedVar) {
			if (unusedVar.defs.length > 0) {
				const referenceToReport = getReferenceToReport(unusedVar);

				context.report({
					node: referenceToReport?.identifier || unusedVar.identifiers[0],
					messageId: "unusedVar",
					data: unusedVar.references.some(ref => ref.isWrite())
						? getAssignedMessageData(unusedVar)
						: getDefinedMessageData(unusedVar),
					suggest: [
						{
							messageId: "removeVar",
							data: { varName: unusedVar.name },
							fix(fixer) {
								return handleFixes(fixer, unusedVar)(fixer);
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

		/**
		 * Gets the reference to report.
		 * @param {Variable} unusedVar The unused variable.
		 * @returns {Reference|null} The reference to report or null.
		 */
		function getReferenceToReport(unusedVar) {
			const writeReferences = unusedVar.references.filter(
				ref =>
					ref.isWrite() &&
					ref.from.variableScope === unusedVar.scope.variableScope,
			);

			return writeReferences.length > 0
				? writeReferences.at(-1)
				: null;
		}
	},
};
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
			const patterns = {
				"array-destructure": config.destructuredArrayIgnorePattern,
				"catch-clause": config.caughtErrorsIgnorePattern,
				parameter: config.argsIgnorePattern,
				variable: config.varsIgnorePattern,
			};

			const descriptions = {
				"array-destructure": "elements of array destructuring",
				"catch-clause": "caught errors",
				parameter: "args",
				variable: "vars",
			};

			return [
				descriptions[variableType],
				patterns[variableType]?.toString(),
			];
		}

		/**
		 * Generates the message data about the variable being defined and unused,
		 * including the ignore pattern if configured.
		 * @param {Variable} unusedVar eslint-scope variable object.
		 * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
		 */
		function getDefinedMessageData(unusedVar) {
			const def = unusedVar.defs?.[0];
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
			const def = unusedVar.defs?.[0];
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
			const definition = variable.defs?.[0];

			if (!definition) return false;

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
			const definition = variable.defs?.[0];

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
			const def = variable.defs?.[0];
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
				for (const variable of variables) {
					if (shouldSkipVariable(variable, scope)) {
						continue;
					}

					const def = variable.defs?.[0];

					if (def) {
						handleVariableDefinition(variable, def, scope);
					}

					if (shouldReportUnusedVariable(variable)) {
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
		 * Check if scope should be processed based on configuration
		 * @param {Scope} scope Scope to check
		 * @returns {boolean} true if scope should be processed
		 */
		function shouldProcessScope(scope) {
			return scope.type !== "global" || config.vars === "all";
		}

		/**
		 * Check if variable should be skipped based on various conditions
		 * @param {Variable} variable Variable to check
		 * @param {Scope} scope Scope containing the variable
		 * @returns {boolean} true if variable should be skipped
		 */
		function shouldSkipVariable(variable, scope) {
			// skip a variable of class itself name in the class scope
			if (
				scope.type === "class" &&
				scope.block.id === variable.identifiers?.[0]
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
				variable.identifiers?.length === 0
			) {
				return true;
			}

			return false;
		}

		/**
		 * Handle variable definition based on its type
		 * @param {Variable} variable Variable to handle
		 * @param {Object} def Definition of the variable
		 * @param {Scope} scope Scope containing the variable
		 */
		function handleVariableDefinition(variable, def, scope) {
			// Process based on definition type
			switch (def.type) {
				case "ClassName":
					handleClassDefinition(variable, def);
					break;
				case "CatchClause":
					handleCatchClause(variable, def);
					break;
				case "Parameter":
					handleParameter(variable, def, scope);
					break;
				default:
					handleVariableDeclaration(variable, def);
			}
		}

		/**
		 * Handle class name definitions
		 * @param {Variable} variable Variable to handle
		 * @param {Object} def Definition of the variable
		 */
		function handleClassDefinition(variable, def) {
			if (
				config.ignoreClassWithStaticInitBlock &&
				def.node.body.body.some(node => node.type === "StaticBlock")
			) {
				return;
			}

			if (
				config.destructuredArrayIgnorePattern &&
				def.name.parent.type === "ArrayPattern" &&
				config.destructuredArrayIgnorePattern.test(def.name.name)
			) {
				handleIgnoredVariable(variable, "array-destructure", def.name);
			}
		}

		/**
		 * Handle catch clause definitions
		 * @param {Variable} variable Variable to handle
		 * @param {Object} def Definition of the variable
		 */
		function handleCatchClause(variable, def) {
			if (config.caughtErrors === "none") {
				return;
			}

			if (
				config.caughtErrorsIgnorePattern &&
				config.caughtErrorsIgnorePattern.test(def.name.name)
			) {
				handleIgnoredVariable(variable, "catch-clause", def.name);
				return;
			}
		}

		/**
		 * Handle parameter definitions
		 * @param {Variable} variable Variable to handle
		 * @param {Object} def Definition of the variable
		 * @param {Scope} scope Scope containing the variable
		 */
		function handleParameter(variable, def, scope) {
			const parent = def.node.parent;

			// skip any setter argument
			if (
				(parent.type === "Property" ||
					parent.type === "MethodDefinition") &&
				parent.kind === "set"
			) {
				return;
			}

			// if "args" option is "none", skip any parameter
			if (config.args === "none") {
				return;
			}

			// skip ignored parameters
			if (
				config.argsIgnorePattern &&
				config.argsIgnorePattern.test(def.name.name)
			) {
				handleIgnoredVariable(variable, "parameter", def.name);
				return;
			}

			// if "args" option is "after-used", skip used variables
			if (
				config.args === "after-used" &&
				astUtils.isFunction(def.name.parent) &&
				!isAfterLastUsedArg(variable)
			) {
				return;
			}
		}

		/**
		 * Handle variable declarations
		 * @param {Variable} variable Variable to handle
		 * @param {Object} def Definition of the variable
		 */
		function handleVariableDeclaration(variable, def) {
			// Handle array destructuring with pattern
			if (
				def.name.parent.type === "ArrayPattern" ||
				variable.references.some(
					ref => ref.identifier.parent.type === "ArrayPattern",
				)
			) {
				if (
					config.destructuredArrayIgnorePattern &&
					config.destructuredArrayIgnorePattern.test(def.name.name)
				) {
					handleIgnoredVariable(variable, "array-destructure", def.name);
					return;
				}
			}

			// skip ignored variables
			if (
				config.varsIgnorePattern &&
				config.varsIgnorePattern.test(def.name.name)
			) {
				handleIgnoredVariable(variable, "variable", def.name);
				return;
			}
		}

		/**
		 * Handle ignored variables that are actually used
		 * @param {Variable} variable Variable to handle
		 * @param {string} variableType Type of variable
		 * @param {ASTNode} node Node to report
		 */
		function handleIgnoredVariable(variable, variableType, node) {
			if (
				config.reportUsedIgnorePattern &&
				isUsedVariable(variable)
			) {
				context.report({
					node,
					messageId: "usedIgnoredVar",
					data: getUsedIgnoredMessageData(variable, variableType),
				});
			}
		}

		/**
		 * Check if unused variable should be reported
		 * @param {Variable} variable Variable to check
		 * @returns {boolean} true if variable should be reported
		 */
		function shouldReportUnusedVariable(variable) {
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
		 * fixes unused variables
		 * @param {Object} fixer fixer object
		 * @param {Object} unusedVar unused variable to fix
		 * @returns {Object} fixer object
		 */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers?.[0];
			if (!id) return null;

			const parent = id.parent;
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			const allWriteReferences = unusedVar.references.filter(ref =>
				ref.isWrite(),
			);

			// Skip fix when variable has references that would be left behind
			if (
				allWriteReferences.some(
					ref => ref.identifier.range[0] !== id.range[0],
				)
			) {
				return null;
			}

			return createFixer(parent, id, tokenBefore, tokenAfter);
		}

		/**
		 * Create appropriate fix based on parent node type
		 * @param {ASTNode} parent Parent node
		 * @param {ASTNode} id Identifier node
		 * @param {Token} tokenBefore Token before identifier
		 * @param {Token} tokenAfter Token after identifier
		 * @returns {Object|null} Fix object or null
		 */
		function createFixer(parent, id, tokenBefore, tokenAfter) {
			switch (parent.type) {
				case "VariableDeclarator":
					return fixVariableDeclarator(parent, id);
				case "ImportDefaultSpecifier":
					return fixImportDefaultSpecifier(parent, tokenAfter);
				case "ImportSpecifier":
					return fixImportSpecifier(parent, tokenBefore, tokenAfter);
				case "ImportNamespaceSpecifier":
					return fixImportNamespaceSpecifier(parent, tokenBefore);
				case "CatchClause":
					return null;
				case "FunctionDeclaration":
					return fixer.removeRange(parent.range);
				case "ClassDeclaration":
					return fixer.removeRange(parent.range);
				case "ArrowFunctionExpression":
					return fixArrowFunction(parent, id);
				default:
					return fixer.removeRange(id.range);
			}
		}

		/**
		 * Fix variable declarator
		 * @param {ASTNode} parent VariableDeclarator node
		 * @param {ASTNode} id Identifier node
		 * @returns {Object|null} Fix object or null
		 */
		function fixVariableDeclarator(parent, id) {
			const grandParent = parent.parent;

			if (grandParent.declarations.length === 1) {
				return fixer.removeRange(grandParent.range);
			}

			if (tokenBefore?.value === ",") {
				return fixer.removeRange([
					tokenBefore.range[0],
					parent.range[1],
				]);
			}

			return fixer.removeRange([
				parent.range[0],
				tokenAfter.range[1],
			]);
		}

		/**
		 * Fix import default specifier
		 * @param {ASTNode} parent ImportDefaultSpecifier node
		 * @param {Token} tokenAfter Token after import
		 * @returns {Object|null} Fix object or null
		 */
		function fixImportDefaultSpecifier(parent, tokenAfter) {
			if (
				!parent.parent.specifiers.some(
					e => e.type === "ImportSpecifier",
				) &&
				!parent.parent.specifiers.some(
					e => e.type === "ImportNamespaceSpecifier",
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
		 * @param {ASTNode} parent ImportSpecifier node
		 * @param {Token} tokenBefore Token before specifier
		 * @param {Token} tokenAfter Token after specifier
		 * @returns {Object|null} Fix object or null
		 */
		function fixImportSpecifier(parent, tokenBefore, tokenAfter) {
			const importSpecifiers = parent.parent.specifiers.filter(
				e => e.type === "ImportSpecifier",
			);

			if (importSpecifiers.length === 1) {
				if (!parent.parent.specifiers.some(
					e => e.type === "ImportDefaultSpecifier",
				)) {
					return fixer.removeRange(parent.parent.range);
				}

				return fixer.removeRange([
					getPreviousTokenStart(parent, 1),
					tokenAfter.range[1],
				]);
			}

			if (tokenBefore?.value === "{") {
				return fixer.removeRange([
					parent.range[0],
					tokenAfter.range[1],
				]);
			}

			return fixer.removeRange([
				getPreviousTokenStart(parent),
				parent.range[1],
			]);
		}

		/**
		 * Fix import namespace specifier
		 * @param {ASTNode} parent ImportNamespaceSpecifier node
		 * @param {Token} tokenBefore Token before specifier
		 * @returns {Object|null} Fix object or null
		 */
		function fixImportNamespaceSpecifier(parent, tokenBefore) {
			if (
				parent.parent.specifiers.some(
					e => e.type === "ImportDefaultSpecifier",
				)
			) {
				return fixer.removeRange([
					tokenBefore.range[0],
					parent.range[1],
				]);
			}

			return fixer.removeRange([
				parent.range[0],
				parent.parent.source.range[0],
			]);
		}

		/**
		 * Fix arrow function parameters
		 * @param {ASTNode} parent ArrowFunctionExpression node
		 * @param {ASTNode} id Identifier node
		 * @returns {Object} Fix object
		 */
		function fixArrowFunction(parent, id) {
			if (parent.params.length === 1 && tokenAfter?.value !== ")") {
				return fixer.replaceText(id, "()");
			}

			return fixer.removeRange(id.range);
		}

		/**
		 * Helper function to get previous token start
		 * @param {ASTNode} node Node to check
		 * @param {number} skips Number of tokens to skip
		 * @returns {number} Range start position
		 */
		function getPreviousTokenStart(node, skips = 0) {
			return sourceCode.getTokenBefore(node, skips).range[0];
		}

		/**
		 * Helper function to get next token end
		 * @param {ASTNode} node Node to check
		 * @param {number} skips Number of tokens to skip
		 * @returns {number} Range end position
		 */
		function getNextTokenEnd(node, skips = 0) {
			return sourceCode.getTokenAfter(node, skips).range[1];
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

				for (const unusedVar of unusedVars) {
					if (unusedVar.defs.length === 0) {
						continue;
					}

					// Report the first declaration.
					const writeReferences = unusedVar.references.filter(
						ref =>
							ref.isWrite() &&
							ref.from.variableScope ===
								unusedVar.scope.variableScope,
					);

					const referenceToReport =
						writeReferences.length > 0
							? writeReferences.at(-1)
							: null;

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
				}
			},
		};
	},
};
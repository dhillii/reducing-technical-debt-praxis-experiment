```javascript
/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

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
		const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

		const config = initializeConfig(context.options);

		// ========== Configuration Helpers ==========

		/**
		 * Initialize configuration from context options.
		 * @param {Array} options Rule options
		 * @returns {Object} Normalized configuration object
		 */
		function initializeConfig(options) {
			const defaultConfig = {
				vars: "all",
				args: "after-used",
				ignoreRestSiblings: false,
				caughtErrors: "all",
				ignoreClassWithStaticInitBlock: false,
				ignoreUsingDeclarations: false,
				reportUsedIgnorePattern: false,
			};

			const firstOption = options[0];
			if (!firstOption) {
				return defaultConfig;
			}

			if (typeof firstOption === "string") {
				return { ...defaultConfig, vars: firstOption };
			}

			const result = { ...defaultConfig };
			if (firstOption.vars) result.vars = firstOption.vars;
			if (firstOption.args) result.args = firstOption.args;
			if (firstOption.ignoreRestSiblings)
				result.ignoreRestSiblings = firstOption.ignoreRestSiblings;
			if (firstOption.caughtErrors)
				result.caughtErrors = firstOption.caughtErrors;
			if (firstOption.ignoreClassWithStaticInitBlock)
				result.ignoreClassWithStaticInitBlock =
					firstOption.ignoreClassWithStaticInitBlock;
			if (firstOption.ignoreUsingDeclarations)
				result.ignoreUsingDeclarations =
					firstOption.ignoreUsingDeclarations;
			if (firstOption.reportUsedIgnorePattern)
				result.reportUsedIgnorePattern =
					firstOption.reportUsedIgnorePattern;

			if (firstOption.varsIgnorePattern) {
				result.varsIgnorePattern = new RegExp(
					firstOption.varsIgnorePattern,
					"u",
				);
			}
			if (firstOption.argsIgnorePattern) {
				result.argsIgnorePattern = new RegExp(
					firstOption.argsIgnorePattern,
					"u",
				);
			}
			if (firstOption.caughtErrorsIgnorePattern) {
				result.caughtErrorsIgnorePattern = new RegExp(
					firstOption.caughtErrorsIgnorePattern,
					"u",
				);
			}
			if (firstOption.destructuredArrayIgnorePattern) {
				result.destructuredArrayIgnorePattern = new RegExp(
					firstOption.destructuredArrayIgnorePattern,
					"u",
				);
			}

			return result;
		}

		// ========== Variable Type Helpers ==========

		/**
		 * Determine variable type from definition.
		 * @param {Object} def Variable definition
		 * @returns {string} Variable type
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
		 * Get variable description and ignore pattern for a variable type.
		 * @param {string} variableType Variable type
		 * @returns {Array} [description, pattern]
		 */
		function getVariableDescription(variableType) {
			const typeMap = {
				"array-destructure": {
					pattern: config.destructuredArrayIgnorePattern,
					description: "elements of array destructuring",
				},
				"catch-clause": {
					pattern: config.caughtErrorsIgnorePattern,
					description: "caught errors",
				},
				parameter: {
					pattern: config.argsIgnorePattern,
					description: "args",
				},
				variable: {
					pattern: config.varsIgnorePattern,
					description: "vars",
				},
			};

			const entry = typeMap[variableType];
			if (!entry) {
				throw new Error(`Unexpected variable type: ${variableType}`);
			}

			const pattern = entry.pattern ? entry.pattern.toString() : undefined;
			return [entry.description, pattern];
		}

		/**
		 * Build message data for unused variable.
		 * @param {Variable} unusedVar Variable object
		 * @param {string} action Action description
		 * @returns {Object} Message data
		 */
		function buildUnusedVarMessageData(unusedVar, action) {
			let additionalMessageData = "";
			const def = unusedVar.defs && unusedVar.defs[0];

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
		 * Get message data for defined but unused variable.
		 * @param {Variable} unusedVar Variable object
		 * @returns {Object} Message data
		 */
		function getDefinedMessageData(unusedVar) {
			return buildUnusedVarMessageData(unusedVar, "defined");
		}

		/**
		 * Get message data for assigned but unused variable.
		 * @param {Variable} unusedVar Variable object
		 * @returns {Object} Message data
		 */
		function getAssignedMessageData(unusedVar) {
			return buildUnusedVarMessageData(unusedVar, "assigned a value");
		}

		/**
		 * Get message data for used ignored variable.
		 * @param {Variable} variable Variable object
		 * @param {string} variableType Variable type
		 * @returns {Object} Message data
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

		// ========== Variable Usage Helpers ==========

		/**
		 * Check if variable is exported.
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if exported
		 */
		function isExported(variable) {
			const definition = variable.defs[0];
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
		 * Check if variable uses explicit resource management.
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if using/await using
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
		 * Check if node is sibling of rest property.
		 * @param {ASTNode} node Node to check
		 * @returns {boolean} True if sibling of rest property
		 */
		function hasRestSibling(node) {
			return (
				node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
			);
		}

		/**
		 * Check if variable has rest spread sibling.
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if has rest spread sibling
		 */
		function hasRestSpreadSibling(variable) {
			if (!config.ignoreRestSiblings) return false;

			const hasRestSiblingDefinition = variable.defs.some(def =>
				hasRestSibling(def.name.parent),
			);
			const hasRestSiblingReference = variable.references.some(ref =>
				hasRestSibling(ref.identifier.parent),
			);

			return hasRestSiblingDefinition || hasRestSiblingReference;
		}

		/**
		 * Check if reference is a read operation.
		 * @param {Reference} ref Reference object
		 * @returns {boolean} True if read
		 */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/**
		 * Check if reference is self-reference to function.
		 * @param {Reference} ref Reference object
		 * @param {ASTNode[]} nodes Function nodes
		 * @returns {boolean} True if self-reference
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
		 * Get function definitions for variable.
		 * @param {Variable} variable Variable object
		 * @returns {ASTNode[]} Function nodes
		 */
		function getFunctionDefinitions(variable) {
			const functionDefinitions = [];

			variable.defs.forEach(def => {
				if (def.type === "FunctionName") {
					functionDefinitions.push(def.node);
				} else if (
					def.type === "Variable" &&
					def.node.init &&
					(def.node.init.type === "FunctionExpression" ||
						def.node.init.type === "ArrowFunctionExpression")
				) {
					functionDefinitions.push(def.node.init);
				}
			});

			return functionDefinitions;
		}

		/**
		 * Check if inner node is inside outer node.
		 * @param {ASTNode} inner Inner node
		 * @param {ASTNode} outer Outer node
		 * @returns {boolean} True if inside
		 */
		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] &&
				inner.range[1] <= outer.range[1]
			);
		}

		/**
		 * Check if node is unused expression.
		 * @param {ASTNode} node Node to check
		 * @returns {boolean} True if unused expression
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
		 * Get RHS node of assignment if applicable.
		 * @param {Reference} ref Reference object
		 * @param {ASTNode} prevRhsNode Previous RHS node
		 * @returns {ASTNode|null} RHS node or null
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
		 * Check if function node is storable.
		 * @param {ASTNode} funcNode Function node
		 * @param {ASTNode} rhsNode RHS node
		 * @returns {boolean} True if storable
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
		 * Check if identifier is inside storable function.
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} rhsNode RHS node
		 * @returns {boolean} True if inside storable function
		 */
		function isInsideOfStorableFunction(id, rhsNode) {
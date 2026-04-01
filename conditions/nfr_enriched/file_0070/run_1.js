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

			const result = { ...defaultConfig, ...firstOption };

			// Compile regex patterns
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
		 * Determines what variable type a def is.
		 * @param {Object} def The declaration to check
		 * @returns {string} Variable type: 'array-destructure', 'catch-clause', 'parameter', or 'variable'
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
		 * Gets a variable's description and configured ignore pattern.
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
		 * Generates message data for defined but unused variable.
		 * @param {Variable} unusedVar Variable object
		 * @returns {Object} Message data
		 */
		function getDefinedMessageData(unusedVar) {
			return buildMessageData(unusedVar, "defined");
		}

		/**
		 * Generates message data for assigned but unused variable.
		 * @param {Variable} unusedVar Variable object
		 * @returns {Object} Message data
		 */
		function getAssignedMessageData(unusedVar) {
			return buildMessageData(unusedVar, "assigned a value");
		}

		/**
		 * Builds message data with optional ignore pattern info.
		 * @param {Variable} unusedVar Variable object
		 * @param {string} action Action description
		 * @returns {Object} Message data
		 */
		function buildMessageData(unusedVar, action) {
			const def = unusedVar.defs && unusedVar.defs[0];
			let additional = "";

			if (def) {
				const [description, pattern] = getVariableDescription(
					defToVariableType(def),
				);

				if (pattern && description) {
					additional = `. Allowed unused ${description} must match ${pattern}`;
				}
			}

			return {
				varName: unusedVar.name,
				action,
				additional,
			};
		}

		/**
		 * Generates message data for used ignored variable.
		 * @param {Variable} variable Variable object
		 * @param {string} variableType Variable type
		 * @returns {Object} Message data
		 */
		function getUsedIgnoredMessageData(variable, variableType) {
			const [description, pattern] =
				getVariableDescription(variableType);

			let additional = "";
			if (pattern && description) {
				additional = `. Used ${description} must not match ${pattern}`;
			}

			return {
				varName: variable.name,
				additional,
			};
		}

		// ========== Variable Usage Helpers ==========

		/**
		 * Determines if a variable is being exported.
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if exported
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
		 * Determines if a variable uses explicit resource management.
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if using 'using' or 'await using'
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
		 * Checks if a node is a sibling of rest property.
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
		 * Determines if variable has rest spread sibling.
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if has rest spread sibling
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
		 * Determines if reference is a read operation.
		 * @param {Reference} ref Reference object
		 * @returns {boolean} True if read operation
		 */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/**
		 * Determines if reference is self-referencing.
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
		 * Gets function definitions for a variable.
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
		 * Checks if inner node is inside outer node.
		 * @param {ASTNode} inner Inner node
		 * @param {ASTNode} outer Outer node
		 * @returns {boolean} True if inner is inside outer
		 */
		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] &&
				inner.range[1] <= outer.range[1]
			);
		}

		/**
		 * Checks if node is unused expression.
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
		 * Gets RHS node if reference is LHS of assignment.
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
		 * Checks if function node is storable.
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
		 * Checks if identifier is inside storable function.
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} rhsNode RHS node
		 * @returns {boolean} True if inside storable function
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
		 * Checks if reference is read for self-update.
		 * @param {Reference} ref Reference object
		 * @param {ASTNode} rhsNode RHS node
		 * @returns {boolean} True if read for itself
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
		 * Checks if reference is in for-in/for-of loop.
		 * @param {Reference} ref Reference object
		 * @returns {boolean} True if in for-in/for-of loop
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
		 * Determines if variable is used.
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if used
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
		 * Checks if variable is after last used parameter.
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if after last used parameter
		 */
		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const posteriorParams = params.slice(params.indexOf(variable) + 1);

			return !posteriorParams.some(
				v => v.references.length > 0 || v.eslintUsed,
			);
		}

		// ========== Variable Collection ==========

		/**
		 * Collects unused variables from scope and child scopes.
		 * @param {Scope} scope Scope object
		 * @param {Variable[]} unusedVars Accumulator array
		 * @returns {Variable[]} Unused variables
		 */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (scope.type !== "global" || config.vars === "all") {
				for (let i = 0; i < variables.length; ++i) {
					const variable = variables[i];

					if (shouldSkipVariable(variable, scope)) {
						continue;
					}

					const def = variable.defs[0];
					if (def) {
						if (shouldSkipDueToIgnorePattern(variable, def)) {
							continue;
						}

						if (shouldSkipDueToType(variable, def)) {
							continue;
						}
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

			for (let i = 0; i < childScopes.length; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

		/**
		 * Checks if variable should be skipped.
		 * @param {Variable} variable Variable object
		 * @param {Scope} scope Scope object
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipVariable(variable, scope) {
			// skip class name in class scope
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

			// skip marked variables unless reporting used ignored
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
				return true;
			}

			// skip implicit arguments variable
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
		 * Checks if variable should be skipped due to ignore pattern.
		 * @param {Variable} variable Variable object
		 * @param {Object} def Definition object
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipDueToIgnorePattern(variable, def) {
			const type = def.type;
			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

			// Check array destructure pattern
			if (
				(def.name.parent.type === "ArrayPattern" ||
					refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name)
			) {
				if (
					config.reportUsedIgnorePattern &&
					isUsedVariable(variable)
				) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(
							variable,
							"array-destructure",
						),
					});
				}
				return true;
			}

			// Check catch clause pattern
			if (type === "CatchClause") {
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
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(
								variable,
								"catch-clause",
							),
						});
					}
					return true;
				}
			}

			// Check parameter pattern
			if (type === "Parameter") {
				if (
					config.argsIgnorePattern &&
					config.argsIgnorePattern.test(def.name.name)
				) {
					if (
						config.reportUsedIgnorePattern &&
						isUsedVariable(variable)
					) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(
								variable,
								"parameter",
							),
						});
					}
					return true;
				}
			}

			// Check variable pattern
			if (
				type !== "CatchClause" &&
				type !== "Parameter" &&
				config.varsIgnorePattern &&
				config.varsIgnorePattern.test(def.name.name)
			) {
				if (
					config.reportUsedIgnorePattern &&
					isUsedVariable(variable)
				) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(variable, "variable"),
					});
				}
				return true;
			}

			return false;
		}

		/**
		 * Checks if variable should be skipped due to type.
		 * @param {Variable} variable Variable object
		 * @param {Object} def Definition object
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipDueToType(variable, def) {
			const type = def.type;

			// Check class with static block
			if (type === "ClassName") {
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

			// Check setter parameter
			if (type === "Parameter") {
				if (
					(def.node.parent.type === "Property" ||
						def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set"
				) {
					return true;
				}

				// Check args option
				if (config.args === "none") {
					return true;
				}

				// Check after-used option
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

		// ========== Fix Handlers ==========

		/**
		 * Handles fixes for unused variables.
		 * @param {Object} fixer Fixer object
		 * @param {Variable} unusedVar Unused variable
		 * @returns {Object|null} Fix object or null
		 */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;

			const allWriteReferences = unusedVar.references.filter(ref =>
				ref.isWrite(),
			);

			// skip if variable has multiple write references
			if (
				allWriteReferences.some(
					ref => ref.identifier.range[0] !== id.range[0],
				)
			) {
				return null;
			}

			return fixByParentType(fixer, id, parent, parentType);
		}

		/**
		 * Routes fix logic based on parent node type.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @param {string} parentType Parent type
		 * @returns {Object|null} Fix object or null
		 */
		function fixByParentType(fixer, id, parent, parentType) {
			switch (parentType) {
				case "VariableDeclarator":
					return fixVariableDeclarator(fixer, id, parent);
				case "ObjectPattern":
					return fixObjectPattern(fixer, id, parent);
				case "ArrayPattern":
					return fixArrayPattern(fixer, id, parent);
				case "RestElement":
					return fixRestElement(fixer, id, parent);
				case "AssignmentPattern":
					return fixAssignmentPattern(fixer, id, parent);
				case "FunctionDeclaration":
					return fixFunctionDeclaration(fixer, id, parent);
				case "ImportDefaultSpecifier":
					return fixImportDefaultSpecifier(fixer, id, parent);
				case "ImportSpecifier":
					return fixImportSpecifier(fixer, id, parent);
				case "ImportNamespaceSpecifier":
					return fixImportNamespaceSpecifier(fixer, id, parent);
				case "CatchClause":
					return null;
				case "ClassDeclaration":
					return fixer.removeRange(parent.range);
				default:
					return fixDefault(fixer, id, parent);
			}
		}

		/**
		 * Fixes variable declarator.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixVariableDeclarator(fixer, id, parent) {
			const sourceCode = context.sourceCode;
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			if (parent.parent.declarations.length === 1) {
				if (
					astUtils.isLoop(parent.parent.parent) &&
					parent.parent.parent.body !== parent.parent
				) {
					return null;
				}

				if (
					parent.parent.parent.type === "IfStatement" ||
					astUtils.isLoop(parent.parent.parent) ||
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
				sourceCode.getTokenAfter(parent).range[1],
			]);
		}

		/**
		 * Fixes object pattern.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixObjectPattern(fixer, id, parent) {
			const sourceCode = context.sourceCode;
			const tokenBefore = sourceCode.getTokenBefore(id);

			if (parent.parent.properties.length === 1) {
				if (parent.parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent.parent);
				}

				if (parent.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent.parent);
				}

				return fixVariables(fixer, parent.parent);
			}

			if (tokenBefore.value === ":") {
				const tokenBeforeParent = sourceCode.getTokenBefore(parent);
				const tokenAfterParent = sourceCode.getTokenAfter(parent);

				if (
					tokenBeforeParent.value === "{" &&
					tokenAfterParent.value === ","
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
		 * Fixes array pattern.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixArrayPattern(fixer, id, parent) {
			const sourceCode = context.sourceCode;
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			if (hasSingleElement(parent)) {
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent);
				}

				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent);
				}

				return fixVariables(fixer, parent);
			}

			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(id.range);
			}

			return null;
		}

		/**
		 * Fixes rest element.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixRestElement(fixer, id, parent) {
			const sourceCode = context.sourceCode;

			if (parent.parent.type === "ArrayPattern") {
				if (hasSingleElement(parent.parent)) {
					if (parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent.parent);
					}

					return fixVariables(fixer, parent.parent);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(id, 1).range[0],
					id.range[1],
				]);
			}

			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(fixer, parent.parent);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(id, 1).range[0],
					id.range[1],
				]);
			}

			if (astUtils.isFunction(parent.parent)) {
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
		 * Fixes assignment pattern.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixAssignmentPattern(fixer, id, parent) {
			const sourceCode = context.sourceCode;

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
							parent.parent.parent,
						);
					}

					return fixVariables(fixer, parent.parent.parent);
				}

				const tokenBeforeParent = sourceCode.getTokenBefore(
					parent.parent,
				);
				const tokenAfterParent = sourceCode.getTokenAfter(
					parent.parent,
				);

				if (
					tokenBeforeParent.value === "{" &&
					tokenAfterParent.value === ","
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

			if (astUtils.isFunction(parent.parent)) {
				return fixFunctionParameters(fixer, parent);
			}

			return null;
		}

		/**
		 * Fixes function declaration.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixFunctionDeclaration(fixer, id, parent) {
			if (parent.id === id) {
				return fixer.removeRange(parent.range);
			}
			return null;
		}

		/**
		 * Fixes import default specifier.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixImportDefaultSpecifier(fixer, id, parent) {
			const sourceCode = context.sourceCode;
			const hasOtherSpecifiers =
				hasImportOfCertainType(parent.parent, "ImportSpecifier") ||
				hasImportOfCertainType(
					parent.parent,
					"ImportNamespaceSpecifier",
				);

			if (!hasOtherSpecifiers) {
				return fixer.removeRange([
					parent.range[0],
					parent.parent.source.range[0],
				]);
			}

			const tokenAfter = sourceCode.getTokenAfter(id);
			return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
		}

		/**
		 * Fixes import specifier.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixImportSpecifier(fixer, id, parent) {
			const sourceCode = context.sourceCode;
			const importSpecifiers = parent.parent.specifiers.filter(
				e => e.type === "ImportSpecifier",
			);

			if (importSpecifiers.length === 1) {
				const hasDefaultImport = hasImportOfCertainType(
					parent.parent,
					"ImportDefaultSpecifier",
				);

				if (!hasDefaultImport) {
					return fixer.removeRange(parent.parent.range);
				}

				const tokenBefore = sourceCode.getTokenBefore(parent, 1);
				const tokenAfter = sourceCode.getTokenAfter(id);
				return fixer.removeRange([
					tokenBefore.range[0],
					tokenAfter.range[1],
				]);
			}

			const tokenBefore = sourceCode.getTokenBefore(id);
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
		 * Fixes import namespace specifier.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixImportNamespaceSpecifier(fixer, id, parent) {
			const sourceCode = context.sourceCode;
			const hasDefaultImport = hasImportOfCertainType(
				parent.parent,
				"ImportDefaultSpecifier",
			);

			if (hasDefaultImport) {
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
		 * Fixes default cases.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} id Identifier node
		 * @param {ASTNode} parent Parent node
		 * @returns {Object|null} Fix object or null
		 */
		function fixDefault(fixer, id, parent) {
			const sourceCode = context.sourceCode;
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

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
				parent.type === "ArrowFunctionExpression" &&
				parent.params.length === 1 &&
				tokenAfter?.value !== ")"
			) {
				return fixer.replaceText(id, "()");
			}

			return fixer.removeRange(id.range);
		}

		/**
		 * Fixes function parameters.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node to check
		 * @returns {Object|null} Fix object or null
		 */
		function fixFunctionParameters(fixer, node) {
			const sourceCode = context.sourceCode;
			const parentNode = node.parent;

			if (!astUtils.isFunction(parentNode)) {
				return null;
			}

			if (parentNode.params.length === 1) {
				return fixer.removeRange(node.range);
			}

			const tokenBefore = sourceCode.getTokenBefore(node);
			const tokenAfter = sourceCode.getTokenAfter(node);

			if (tokenBefore.value === "(" && tokenAfter.value === ",") {
				return fixer.removeRange([
					node.range[0],
					tokenAfter.range[1],
				]);
			}

			return fixer.removeRange([
				tokenBefore.range[0],
				node.range[1],
			]);
		}

		/**
		 * Fixes variables in patterns.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node to check
		 * @returns {Object|null} Fix object or null
		 */
		function fixVariables(fixer, node) {
			const sourceCode = context.sourceCode;
			const parentNode = node.parent;

			if (parentNode.type === "VariableDeclarator") {
				if (astUtils.isLoop(parentNode.parent.parent)) {
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

				const tokenBefore = sourceCode.getTokenBefore(parentNode);
				if (tokenBefore.value === ",") {
					return fixer.removeRange([
						tokenBefore.range[0],
						parentNode.range[1],
					]);
				}

				return fixer.removeRange([
					parentNode.range[0],
					sourceCode.getTokenAfter(parentNode).range[1],
				]);
			}

			const tokenBefore = sourceCode.getTokenBefore(node);
			if (tokenBefore.value === ":") {
				if (parentNode.parent.type === "ObjectPattern") {
					return fixObjectWithValueSeparator(fixer, node);
				}
			}

			return fixFunctionParameters(fixer, node);
		}

		/**
		 * Fixes nested object variable.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node to check
		 * @returns {Object|null} Fix object or null
		 */
		function fixNestedObjectVariable(fixer, node) {
			const sourceCode = context.sourceCode;
			const parentNode = node.parent;

			if (
				parentNode.parent.parent.parent.type === "ObjectPattern" &&
				parentNode.parent.properties.length === 1
			) {
				return fixNestedObjectVariable(fixer, parentNode.parent);
			}

			if (parentNode.parent.type === "ObjectPattern") {
				if (parentNode.parent.properties.length === 1) {
					return fixVariables(fixer, parentNode.parent);
				}

				const tokenBefore = sourceCode.getTokenBefore(parentNode);
				if (tokenBefore.value === "{") {
					return fixer.removeRange([
						parentNode.range[0],
						sourceCode.getTokenAfter(parentNode).range[1],
					]);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(parentNode).range[0],
					parentNode.range[1],
				]);
			}

			return null;
		}

		/**
		 * Fixes nested array variable.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node to check
		 * @returns {Object|null} Fix object or null
		 */
		function fixNestedArrayVariable(fixer, node) {
			const sourceCode = context.sourceCode;
			const parentNode = node.parent;

			if (
				parentNode.parent.type === "ArrayPattern" &&
				hasSingleElement(parentNode)
			) {
				return fixNestedArrayVariable(fixer, parentNode);
			}

			if (hasSingleElement(parentNode)) {
				const tokenBefore = sourceCode.getTokenBefore(parentNode);
				if (tokenBefore.value === ":") {
					return fixVariables(fixer, parentNode);
				}

				if (parentNode.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parentNode.parent);
				}

				return fixVariables(fixer, parentNode);
			}

			const tokenBefore = sourceCode.getTokenBefore(node);
			const tokenAfter = sourceCode.getTokenAfter(node);

			if (tokenBefore.value === "," && tokenAfter.value === "]") {
				return fixer.removeRange([
					tokenBefore.range[0],
					node.range[1],
				]);
			}

			return fixer.removeRange(node.range);
		}

		/**
		 * Fixes object with value separator.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node to check
		 * @returns {Object|null} Fix object or null
		 */
		function fixObjectWithValueSeparator(fixer, node) {
			const parentNode = node.parent.parent;

			if (
				parentNode.parent.type === "ArrayPattern" &&
				parentNode.properties.length === 1
			) {
				return fixNestedArrayVariable(fixer, parentNode);
			}

			return fixNestedObjectVariable(fixer, node);
		}

		/**
		 * Fixes rest in pattern.
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node to check
		 * @returns {Object|null} Fix object or null
		 */
		function fixRestInPattern(fixer, node) {
			const sourceCode = context.sourceCode;
			const parentNode = node.parent;

			if (astUtils.isFunction(parentNode)) {
				if (parentNode.params.length === 1) {
					return fixer.removeRange(node.range);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}

			if (parentNode.type === "ArrayPattern") {
				if (hasSingleElement(parentNode)) {
					if (parentNode.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parentNode);
					}

					return fixVariables(fixer, parentNode);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}

			return null;
		}

		/**
		 * Checks if declaration is safe to remove.
		 * @param {Object} nextToken Next token
		 * @param {Object} prevToken Previous token
		 * @returns {boolean} True if not safe to remove
		 */
		function isDeclarationNotSafeToRemove(nextToken, prevToken) {
			return (
				nextToken.type === "String" ||
				(prevToken &&
					!astUtils.isSemicolonToken(prevToken) &&
					!astUtils.isOpeningBraceToken(prevToken))
			);
		}

		/**
		 * Checks if array has single element.
		 * @param {ASTNode} node ArrayPattern node
		 * @returns {boolean} True if single element
		 */
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		/**
		 * Checks if import has certain type.
		 * @param {ASTNode} node ImportDeclaration node
		 * @param {string} type Import type
		 * @returns {boolean} True if has type
		 */
		function hasImportOfCertainType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}

		// ========== Public API ==========

		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(
					sourceCode.getScope(programNode),
					[],
				);

				for (let i = 0; i < unusedVars.length; ++i) {
					const unusedVar = unusedVars[i];

					if (unusedVar.defs.length > 0) {
						reportUnusedVariable(context, unusedVar);
					} else if (unusedVar.eslintExplicitGlobalComments) {
						reportGlobalDirectiveComment(
							context,
							sourceCode,
							programNode,
							unusedVar,
						);
					}
				}
			},
		};
	},
};

/**
 * Reports unused variable.
 * @param {Object} context Rule context
 * @param {Variable} unusedVar Unused variable
 */
function reportUnusedVariable(context, unusedVar) {
	const writeReferences = unusedVar.references.filter(
		ref =>
			ref.isWrite() &&
			ref.from.variableScope === unusedVar.scope.variableScope,
	);

	const referenceToReport =
		writeReferences.length > 0
			? writeReferences.at(-1).identifier
			: unusedVar.identifiers[0];

	const hasWriteReference = unusedVar.references.some(ref =>
		ref.isWrite(),
	);

	context.report({
		node: referenceToReport,
		messageId: "unusedVar",
		data: hasWriteReference
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

/**
 * Reports global directive comment.
 * @param {Object} context Rule context
 * @param {Object} sourceCode Source code object
 * @param {ASTNode} programNode Program node
 * @param {Variable} unusedVar Unused variable
 */
function reportGlobalDirectiveComment(
	context,
	sourceCode,
	programNode,
	unusedVar,
) {
	const directiveComment = unusedVar.eslintExplicitGlobalComments[0];

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
```
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
		 * Initialize configuration from context options
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

			if (!options[0]) {
				return defaultConfig;
			}

			const firstOption = options[0];

			if (typeof firstOption === "string") {
				return { ...defaultConfig, vars: firstOption };
			}

			return {
				...defaultConfig,
				vars: firstOption.vars || defaultConfig.vars,
				args: firstOption.args || defaultConfig.args,
				ignoreRestSiblings:
					firstOption.ignoreRestSiblings ||
					defaultConfig.ignoreRestSiblings,
				caughtErrors:
					firstOption.caughtErrors || defaultConfig.caughtErrors,
				ignoreClassWithStaticInitBlock:
					firstOption.ignoreClassWithStaticInitBlock ||
					defaultConfig.ignoreClassWithStaticInitBlock,
				ignoreUsingDeclarations:
					firstOption.ignoreUsingDeclarations ||
					defaultConfig.ignoreUsingDeclarations,
				reportUsedIgnorePattern:
					firstOption.reportUsedIgnorePattern ||
					defaultConfig.reportUsedIgnorePattern,
				varsIgnorePattern: firstOption.varsIgnorePattern
					? new RegExp(firstOption.varsIgnorePattern, "u")
					: undefined,
				argsIgnorePattern: firstOption.argsIgnorePattern
					? new RegExp(firstOption.argsIgnorePattern, "u")
					: undefined,
				caughtErrorsIgnorePattern:
					firstOption.caughtErrorsIgnorePattern
						? new RegExp(firstOption.caughtErrorsIgnorePattern, "u")
						: undefined,
				destructuredArrayIgnorePattern:
					firstOption.destructuredArrayIgnorePattern
						? new RegExp(
								firstOption.destructuredArrayIgnorePattern,
								"u",
							)
						: undefined,
			};
		}

		// ========== Variable Type Helpers ==========

		/**
		 * Determines what variable type a def is
		 * @param {Object} def Declaration to check
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
		 * Gets variable description and ignore pattern for a variable type
		 * @param {string} variableType Variable type
		 * @returns {Array} [description, pattern] tuple
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

			const typeInfo = typeMap[variableType];
			if (!typeInfo) {
				throw new Error(`Unexpected variable type: ${variableType}`);
			}

			return [
				typeInfo.description,
				typeInfo.pattern ? typeInfo.pattern.toString() : undefined,
			];
		}

		/**
		 * Generates message data for unused variable
		 * @param {Variable} unusedVar Variable object
		 * @param {string} action Action description ('defined' or 'assigned a value')
		 * @returns {Object} Message data
		 */
		function getUnusedMessageData(unusedVar, action) {
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
				action,
				additional: additionalMessageData,
			};
		}

		/**
		 * Generate message data for used ignored variable
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
		 * Determines if a variable is exported
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
		 * Determines if variable uses explicit resource management
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
		 * Checks if node is a sibling of rest property
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
		 * Determines if variable has rest spread sibling
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
		 * Determines if reference is a read operation
		 * @param {Reference} ref Reference object
		 * @returns {boolean} True if read operation
		 */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/**
		 * Determines if reference is self-reference to function
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
		 * Gets function definitions for a variable
		 * @param {Variable} variable Variable object
		 * @returns {ASTNode[]} Function nodes
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
		 * Checks if inner node is inside outer node
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
		 * Checks if node is unused expression
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
		 * Gets RHS node if reference is LHS of assignment
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
		 * Checks if function node is storable (can be used later)
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
		 * Checks if identifier is inside storable function
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
		 * Checks if reference is read for self-update
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
		 * Checks if reference is used in for-in/for-of loop
		 * @param {Reference} ref Reference object
		 * @returns {boolean} True if used in for-in/for-of
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
		 * Determines if variable is used
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if variable is used
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
		 * Checks if variable is after last used parameter
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
		 * Checks if variable should be skipped based on ignore patterns
		 * @param {Variable} variable Variable object
		 * @param {string} type Definition type
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipIgnorePattern(variable, type) {
			const def = variable.defs[0];
			if (!def) {
				return false;
			}

			const variableType = defToVariableType(def);
			const [, pattern] = getVariableDescription(variableType);

			if (!pattern) {
				return false;
			}

			const ignorePatternMap = {
				"array-destructure": config.destructuredArrayIgnorePattern,
				"catch-clause": config.caughtErrorsIgnorePattern,
				parameter: config.argsIgnorePattern,
				variable: config.varsIgnorePattern,
			};

			const ignorePattern = ignorePatternMap[variableType];

			if (ignorePattern && ignorePattern.test(def.name.name)) {
				if (
					config.reportUsedIgnorePattern &&
					isUsedVariable(variable)
				) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(variable, variableType),
					});
				}
				return true;
			}

			return false;
		}

		/**
		 * Checks if variable should be skipped for array destructuring
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipArrayDestructure(variable) {
			const def = variable.defs[0];
			if (!def) {
				return false;
			}

			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

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

			return false;
		}

		/**
		 * Checks if variable should be skipped for class with static block
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipClassWithStaticBlock(variable) {
			const def = variable.defs[0];
			if (!def || def.type !== "ClassName") {
				return false;
			}

			const hasStaticBlock = def.node.body.body.some(
				node => node.type === "StaticBlock",
			);

			return (
				config.ignoreClassWithStaticInitBlock && hasStaticBlock
			);
		}

		/**
		 * Checks if variable should be skipped for catch clause
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipCatchClause(variable) {
			const def = variable.defs[0];
			if (!def || def.type !== "CatchClause") {
				return false;
			}

			if (config.caughtErrors === "none") {
				return true;
			}

			return shouldSkipIgnorePattern(variable, "CatchClause");
		}

		/**
		 * Checks if variable should be skipped for parameter
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipParameter(variable) {
			const def = variable.defs[0];
			if (!def || def.type !== "Parameter") {
				return false;
			}

			// Skip setter arguments
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

			if (shouldSkipIgnorePattern(variable, "Parameter")) {
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
		 * Checks if variable should be skipped for regular variable
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if should skip
		 */
		function shouldSkipRegularVariable(variable) {
			const def = variable.defs[0];
			if (!def || def.type === "Parameter" || def.type === "CatchClause") {
				return false;
			}

			return shouldSkipIgnorePattern(variable, "variable");
		}

		/**
		 * Checks if variable should be reported as unused
		 * @param {Variable} variable Variable object
		 * @returns {boolean} True if should report
		 */
		function shouldReportUnused(variable) {
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
		 * Collects unused variables from scope and child scopes
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

					// Skip class name in class scope
					if (
						scope.type === "class" &&
						scope.block.id === variable.identifiers[0]
					) {
						continue;
					}

					// Skip function expression names
					if (scope.functionExpressionScope) {
						continue;
					}

					// Skip marked variables
					if (
						!config.reportUsedIgnorePattern &&
						variable.eslintUsed
					) {
						continue;
					}

					// Skip implicit arguments variable
					if (
						scope.type === "function" &&
						variable.name === "arguments" &&
						variable.identifiers.length === 0
					) {
						continue;
					}

					// Skip if no definition
					if (!variable.defs[0]) {
						continue;
					}

					// Check skip conditions
					if (
						shouldSkipArrayDestructure(variable) ||
						shouldSkipClassWithStaticBlock(variable) ||
						shouldSkipCatchClause(variable) ||
						shouldSkipParameter(variable) ||
						shouldSkipRegularVariable(variable)
					) {
						continue;
					}

					// Report unused variable
					if (shouldReportUnused(variable)) {
						unusedVars.push(variable);
					}
				}
			}

			// Recursively collect from child scopes
			for (let i = 0; i < childScopes.length; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

		// ========== Fix Helpers ==========

		/**
		 * Gets previous token start position
		 * @param {ASTNode} node Node
		 * @param {number} skips Token skip count
		 * @returns {number} Start position
		 */
		function getPreviousTokenStart(node, skips) {
			return sourceCode.getTokenBefore(node, skips).range[0];
		}

		/**
		 * Gets next token end position
		 * @param {ASTNode} node Node
		 * @param {number} skips Token skip count
		 * @returns {number} End position
		 */
		function getNextTokenEnd(node, skips) {
			return sourceCode.getTokenAfter(node, skips).range[1];
		}

		/**
		 * Gets token before value
		 * @param {ASTNode} node Node
		 * @returns {string} Token value
		 */
		function getTokenBeforeValue(node) {
			return sourceCode.getTokenBefore(node).value;
		}

		/**
		 * Gets token after value
		 * @param {ASTNode} node Node
		 * @returns {string} Token value
		 */
		function getTokenAfterValue(node) {
			return sourceCode.getTokenAfter(node).value;
		}

		/**
		 * Checks if array has single element
		 * @param {ASTNode} node ArrayPattern node
		 * @returns {boolean} True if single element
		 */
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		/**
		 * Checks if import has certain type
		 * @param {ASTNode} node ImportDeclaration node
		 * @param {string} type Import type
		 * @returns {boolean} True if has type
		 */
		function hasImportOfCertainType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}

		/**
		 * Checks if declaration is safe to remove
		 * @param {ASTNode} nextToken Next token
		 * @param {ASTNode} prevToken Previous token
		 * @returns {boolean} True if not safe
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
		 * Fixes function parameters
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node
		 * @returns {Object|null} Fix or null
		 */
		function fixFunctionParameters(fixer, node) {
			const parentNode = node.parent;

			if (!astUtils.isFunction(parentNode)) {
				return null;
			}

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

		/**
		 * Fixes nested object variable
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node
		 * @returns {Object|null} Fix or null
		 */
		function fixNestedObjectVariable(fixer, node) {
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

		/**
		 * Fixes nested array variable
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node
		 * @returns {Object|null} Fix or null
		 */
		function fixNestedArrayVariable(fixer, node) {
			const parentNode = node.parent;

			if (
				parentNode.parent.type === "ArrayPattern" &&
				hasSingleElement(parentNode)
			) {
				return fixNestedArrayVariable(fixer, parentNode);
			}

			if (hasSingleElement(parentNode)) {
				if (getTokenBeforeValue(parentNode) === ":") {
					return fixVariables(fixer, parentNode);
				}

				if (parentNode.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parentNode.parent);
				}

				return fixVariables(fixer, parentNode);
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

		/**
		 * Fixes object with value separator
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node
		 * @returns {Object|null} Fix or null
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
		 * Fixes rest in pattern
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node
		 * @returns {Object|null} Fix or null
		 */
		function fixRestInPattern(fixer, node) {
			const parentNode = node.parent;

			if (astUtils.isFunction(parentNode)) {
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
						return fixNestedArrayVariable(fixer, parentNode);
					}

					return fixVariables(fixer, parentNode);
				}

				return fixer.removeRange([
					getPreviousTokenStart(node),
					node.range[1],
				]);
			}

			return null;
		}

		/**
		 * Fixes variables
		 * @param {Object} fixer Fixer object
		 * @param {ASTNode} node Node
		 * @returns {Object|null} Fix or null
		 */
		function fixVariables(fixer, node) {
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
					return fixObjectWithValueSeparator(fixer, node);
				}
			}

			return fixFunctionParameters(fixer, node);
		}

		/**
		 * Handles all fixes for unused variables
		 * @param {Object} fixer Fixer object
		 * @param {Variable} unusedVar Variable object
		 * @returns {Object|null} Fix or null
		 */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			const allWriteReferences = unusedVar.references.filter(ref =>
				ref.isWrite(),
			);

			// Skip if variable has multiple write references
			if (
				allWriteReferences.some(
					ref => ref.identifier.range[0] !== id.range[0],
				)
			) {
				return null;
			}

			// Handle VariableDeclarator
			if (parentType === "VariableDeclarator") {
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
					getNextTokenEnd(parent),
				]);
			}

			// Handle ObjectPattern
			if (parent.parent.type === "ObjectPattern") {
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

			// Handle ArrayPattern
			if (parentType === "ArrayPattern") {
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
			}

			// Handle RestElement
			if (parentType === "RestElement") {
				if (parent.parent.type === "ArrayPattern") {
					if (hasSingleElement(parent.parent)) {
						if (parent.parent.parent.type === "ArrayPattern") {
							return fixNestedArrayVariable(fixer, parent.parent);
						}

						return fixVariables(fixer, parent.parent);
					}

					return fixer.removeRange([
						getPreviousTokenStart(id, 1),
						id.range[1],
					]);
				}

				if (parent.parent.type === "ObjectPattern") {
					if (parent.parent.properties.length === 1) {
						return fixVariables(fixer, parent.parent);
					}

					return fixer.removeRange([
						getPreviousTokenStart(id, 1),
						id.range[1],
					]);
				}

				if (astUtils.isFunction(parent.parent)) {
					if (parent.parent.params.length === 1) {
						return fixer.removeRange(parent.range);
					}

					return fixer.removeRange([
						getPreviousTokenStart(parent),
						parent.range[1],
					]);
				}
			}

			// Handle AssignmentPattern
			if (parentType === "AssignmentPattern") {
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

				if (astUtils.isFunction(parent.parent)) {
					return fixFunctionParameters(fixer, parent);
				}
			}

			// Handle FunctionDeclaration
			if (parentType === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}

			// Handle ImportDefaultSpecifier
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

			// Handle ImportSpecifier
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

			// Handle ImportNamespaceSpecifier
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

			// Handle CatchClause
			if (parentType === "CatchClause") {
				return null;
			}

			// Handle ClassDeclaration
			if (parentType === "ClassDeclaration") {
				return fixer.removeRange(parent.range);
			}

			// Handle sequence expressions
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

			// Handle arrow function with single parameter
			if (
				parentType === "ArrowFunctionExpression" &&
				parent.params.length === 1 &&
				tokenAfter?.value !== ")"
			) {
				return fixer.replaceText(id, "()");
			}

			return fixer.removeRange(id.range);
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

						const hasWriteRef = unusedVar.references.some(ref =>
							ref.isWrite(),
						);

						context.report({
							node: referenceToReport
								? referenceToReport.identifier
								: unusedVar.identifiers[0],
							messageId: "unusedVar",
							data: hasWriteRef
								? getUnusedMessageData(
										unusedVar,
										"assigned a value",
									)
								: getUnusedMessageData(unusedVar, "defined"),
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
							data: getUnusedMessageData(unusedVar, "defined"),
						});
					}
				}
			},
		};
	},
};
```
"use strict";

const astUtils = require("./utils/ast-utils");

/**
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 */

/**
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName
 * @property {'defined'|'assigned a value'} action
 * @property {string} additional
 */

/**
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName
 * @property {string} additional
 */

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
		 * Determines the variable type for a definition.
		 * @param {Object} def
		 * @returns {VariableType}
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
		 * Retrieves description and pattern for a variable type.
		 * @param {VariableType} variableType
		 * @returns {[string | undefined, string | undefined]}
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
		 * Generates message data for a defined but unused variable.
		 * @param {Variable} unusedVar
		 * @returns {UnusedVarMessageData}
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
		 * Generates message data for an assigned but unused variable.
		 * @param {Variable} unusedVar
		 * @returns {UnusedVarMessageData}
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
		 * Generates message data for a used but ignored variable.
		 * @param {Variable} variable
		 * @param {VariableType} variableType
		 * @returns {UsedIgnoredVarMessageData}
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

		/**
		 * Checks if a variable is exported.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function isExported(variable) {
			const definition = variable.defs[0];
			if (!definition) return false;
			let node = definition.node;
			if (node.type === "VariableDeclarator") node = node.parent;
			if (definition.type === "Parameter") return false;
			return node.parent.type.indexOf("Export") === 0;
		}

		/**
		 * Checks if a variable uses explicit resource management.
		 * @param {Variable} variable
		 * @returns {boolean}
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
		 * Checks if a node is a sibling of a rest property.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function hasRestSibling(node) {
			return (
				node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				REST_PROPERTY_TYPE.test(
					node.parent.properties.at(-1).type,
				)
			);
		}

		/**
		 * Checks if a variable has a sibling rest property.
		 * @param {Variable} variable
		 * @returns {boolean}
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
		 * Checks if a reference is a read operation.
		 * @param {Reference} ref
		 * @returns {boolean}
		 */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/**
		 * Checks if a reference is a self-reference.
		 * @param {Reference} ref
		 * @param {ASTNode[]} nodes
		 * @returns {boolean}
		 */
		function isSelfReference(ref, nodes) {
			let scope = ref.from;
			while (scope) {
				if (nodes.includes(scope.block)) return true;
				scope = scope.upper;
			}
			return false;
		}

		/**
		 * Retrieves function definition nodes for a variable.
		 * @param {Variable} variable
		 * @returns {ASTNode[]}
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
		 * Checks if a node is inside another node.
		 * @param {ASTNode} inner
		 * @param {ASTNode} outer
		 * @returns {boolean}
		 */
		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] &&
				inner.range[1] <= outer.range[1]
			);
		}

		/**
		 * Checks if a node is an unused expression.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function isUnusedExpression(node) {
			const parent = node.parent;
			if (parent.type === "ExpressionStatement") return true;
			if (parent.type === "SequenceExpression") {
				const isLastExpression = parent.expressions.at(-1) === node;
				if (!isLastExpression) return true;
				return isUnusedExpression(parent);
			}
			return false;
		}

		/**
		 * Retrieves the RHS node for a reference if it is a left-hand side of an assignment.
		 * @param {Reference} ref
		 * @param {ASTNode|null} prevRhsNode
		 * @returns {ASTNode|null}
		 */
		function getRhsNode(ref, prevRhsNode) {
			const id = ref.identifier;
			const parent = id.parent;
			const refScope = ref.from.variableScope;
			const varScope = ref.resolved.scope.variableScope;
			const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);
			if (prevRhsNode && isInside(id, prevRhsNode)) return prevRhsNode;
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
		 * Checks if a function node is storable.
		 * @param {ASTNode} funcNode
		 * @param {ASTNode} rhsNode
		 * @returns {boolean}
		 */
		function isStorableFunction(funcNode, rhsNode) {
			let node = funcNode;
			let parent = funcNode.parent;
			while (parent && isInside(parent, rhsNode)) {
				switch (parent.type) {
					case "SequenceExpression":
						if (parent.expressions.at(-1) !== node) return false;
						break;
					case "CallExpression":
					case "NewExpression":
						return parent.callee !== node;
					case "AssignmentExpression":
					case "TaggedTemplateExpression":
					case "YieldExpression":
						return true;
					default:
						if (STATEMENT_TYPE.test(parent.type)) return true;
				}
				node = parent;
				parent = parent.parent;
			}
			return false;
		}

		/**
		 * Checks if an identifier is inside a storable function.
		 * @param {ASTNode} id
		 * @param {ASTNode} rhsNode
		 * @returns {boolean}
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
		 * Checks if a reference is a read that updates itself.
		 * @param {Reference} ref
		 * @param {ASTNode} rhsNode
		 * @returns {boolean}
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
		 * Checks if a reference is used in a for-in or for-of loop.
		 * @param {Reference} ref
		 * @returns {boolean}
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
			if (!target) return false;
			return target.type === "ReturnStatement";
		}

		/**
		 * Determines if a variable is used.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function isUsedVariable(variable) {
			if (variable.eslintUsed) return true;
			const functionNodes = getFunctionDefinitions(variable);
			const isFunctionDefinition = functionNodes.length > 0;
			let rhsNode = null;
			return variable.references.some(ref => {
				if (isForInOfRef(ref)) return true;
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
		 * Checks if a variable is after the last used parameter.
		 * @param {Variable} variable
		 * @returns {boolean}
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
		 * Collects unused variables in a scope.
		 * @param {Scope} scope
		 * @param {Variable[]} unusedVars
		 * @returns {Variable[]}
		 */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;
			if (scope.type !== "global" || config.vars === "all") {
				for (let i = 0, l = variables.length; i < l; ++i) {
					const variable = variables[i];
					if (shouldSkipVariable(variable, scope)) continue;
					if (!isUsedVariable(variable) && !isExported(variable) &&
						!usesExplicitResourceManagement(variable) &&
						!hasRestSpreadSibling(variable)) {
						unusedVars.push(variable);
					}
				}
			}
			for (let i = 0, l = childScopes.length; i < l; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}
			return unusedVars;
		}

		/**
		 * Determines if a variable should be skipped during collection.
		 * @param {Variable} variable
		 * @param {Scope} scope
		 * @returns {boolean}
		 */
		function shouldSkipVariable(variable, scope) {
			if (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
			) {
				return true;
			}
			if (scope.functionExpressionScope) return true;
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;
			if (
				scope.type === "function" &&
				variable.name === "arguments" &&
				variable.identifiers.length === 0
			) {
				return true;
			}
			const def = variable.defs[0];
			if (!def) return false;
			const type = def.type;
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
			if (type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(
					node => node.type === "StaticBlock",
				);
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
					return true;
				}
			}
			if (type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
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
			} else if (type === "Parameter") {
				if (
					(def.node.parent.type === "Property" ||
						def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set"
				) {
					return true;
				}
				if (config.args === "none") return true;
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
					if (
						config.reportUsedIgnorePattern &&
						isUsedVariable(variable)
					) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(
								variable,
								"variable",
							),
						});
					}
					return true;
				}
			}
			return false;
		}

		/**
		 * Handles fixes for an unused variable.
		 * @param {Object} fixer
		 * @param {Variable} unusedVar
		 * @returns {Object|null}
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

			if (parentType === "VariableDeclarator") {
				return handleVariableDeclaratorFix(fixer, parent, id, tokenBefore, tokenAfter, isLoop);
			}

			if (getTokenBeforeValue(parent) === ":") {
				if (parent.parent.type === "ObjectPattern") {
					return fixObjectWithValueSeparator(fixer, parent);
				}
			}

			return fixFunctionParameters(fixer, parent);
		}

		/**
		 * Handles fixes for variable declarators.
		 * @param {Object} fixer
		 * @param {ASTNode} parent
		 * @param {ASTNode} id
		 * @param {ASTToken} tokenBefore
		 * @param {ASTToken} tokenAfter
		 * @param {Function} isLoop
		 * @returns {Object|null}
		 */
		function handleVariableDeclaratorFix(fixer, parent, id, tokenBefore, tokenAfter, isLoop) {
			if (isLoop(parent.parent.parent)) return null;
			if (parent.parent.declarations.length === 1) {
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
			if (getTokenBeforeValue(parent) === ",") {
				return fixer.removeRange([
					getPreviousTokenStart(parent),
					parent.range[1],
				]);
			}
			return fixer.removeRange([
				parent.range[0],
				getNextTokenEnd(parent),
			]);
		}

		/**
		 * Checks if a declaration is safe to remove.
		 * @param {ASTToken} nextToken
		 * @param {ASTToken} prevToken
		 * @returns {boolean}
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
		 * Returns the value of the token before a node.
		 * @param {ASTNode} node
		 * @returns {string}
		 */
		function getTokenBeforeValue(node) {
			return sourceCode.getTokenBefore(node).value;
		}

		/**
		 * Returns the value of the token after a node.
		 * @param {ASTNode} node
		 * @returns {string}
		 */
		function getTokenAfterValue(node) {
			return sourceCode.getTokenAfter(node).value;
		}

		/**
		 * Returns the start of the previous token.
		 * @param {ASTNode} node
		 * @param {number} skips
		 * @returns {number}
		 */
		function getPreviousTokenStart(node, skips = 0) {
			return sourceCode.getTokenBefore(node, skips).range[0];
		}

		/**
		 * Returns the end of the next token.
		 * @param {ASTNode} node
		 * @param {number} skips
		 * @returns {number}
		 */
		function getNextTokenEnd(node, skips = 0) {
			return sourceCode.getTokenAfter(node, skips).range[1];
		}

		/**
		 * Checks if a node has a single element with nulls.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		/**
		 * Checks if an import declaration has a specifier of a certain type.
		 * @param {ASTNode} node
		 * @param {string} type
		 * @returns {boolean}
		 */
		function hasImportOfCertainType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}

		/**
		 * Fixes function parameters.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixFunctionParameters(fixer, node) {
			const parentNode = node.parent;
			if (!isFunction(parentNode)) return null;
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
		 * Fixes nested object variables.
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
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

		/**
		 * Fixes nested array variables.
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
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

		/**
		 * Fixes object with value separator.
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
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

		/**
		 * Fixes rest in pattern.
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
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

		/**
		 * Fixes variables.
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixVariables(node) {
			const parentNode = node.parent;
			if (parentNode.type === "VariableDeclarator") {
				if (isLoop(parentNode.parent.parent)) return null;
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
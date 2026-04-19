```javascript
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

		function usesExplicitResourceManagement(variable) {
			const [definition] = variable.defs;

			return (
				definition?.type === "Variable" &&
				(definition.parent.kind === "using" ||
					definition.parent.kind === "await using")
			);
		}

		function hasRestSibling(node) {
			return (
				node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				node.parent.properties.at(-1).type === "RestElement"
			);
		}

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

		function isReadRef(ref) {
			return ref.isRead();
		}

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

		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] &&
				inner.range[1] <= outer.range[1]
			);
		}

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

		function isInsideOfStorableFunction(id, rhsNode) {
			const funcNode = astUtils.getUpperFunction(id);

			return (
				funcNode &&
				isInside(funcNode, rhsNode) &&
				isStorableFunction(funcNode, rhsNode)
			);
		}

		function isReadForItself(ref, rhsNode) {
			const id = ref.identifier;
			const parent = id.parent;

			return (
				ref.isRead() &&
				(parent.type === "AssignmentExpression" &&
					parent.left === id &&
					isUnusedExpression(parent) &&
					!astUtils.isLogicalAssignmentOperator(parent.operator)) ||
				(parent.type === "UpdateExpression" &&
					isUnusedExpression(parent)) ||
				(rhsNode &&
					isInside(id, rhsNode) &&
					!isInsideOfStorableFunction(id, rhsNode))
			);
		}

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
			}

			return target.type === "ReturnStatement";
		}

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

		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const posteriorParams = params.slice(params.indexOf(variable) + 1);

			return !posteriorParams.some(
				v => v.references.length > 0 || v.eslintUsed,
			);
		}

		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;
			let i, l;

			if (scope.type !== "global" || config.vars === "all") {
				for (i = 0, l = variables.length; i < l; ++i) {
					const variable = variables[i];

					if (
						scope.type === "class" &&
						scope.block.id === variable.identifiers[0]
					) {
						continue;
					}

					if (scope.functionExpressionScope) {
						continue;
					}

					if (
						!config.reportUsedIgnorePattern &&
						variable.eslintUsed
					) {
						continue;
					}

					if (
						scope.type === "function" &&
						variable.name === "arguments" &&
						variable.identifiers.length === 0
					) {
						continue;
					}

					const def = variable.defs[0];

					if (def) {
						const type = def.type;
						const refUsedInArrayPatterns = variable.references.some(
							ref =>
								ref.identifier.parent.type === "ArrayPattern",
						);

						if (
							(def.name.parent.type === "ArrayPattern" ||
								refUsedInArrayPatterns) &&
							config.destructuredArrayIgnorePattern &&
							config.destructuredArrayIgnorePattern.test(
								def.name.name,
							)
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

							continue;
						}

						if (type === "ClassName") {
							const hasStaticBlock = def.node.body.body.some(
								node => node.type === "StaticBlock",
							);

							if (
								config.ignoreClassWithStaticInitBlock &&
								hasStaticBlock
							) {
								continue;
							}
						}

						if (type === "CatchClause") {
							if (config.caughtErrors === "none") {
								continue;
							}

							if (
								config.caughtErrorsIgnorePattern &&
								config.caughtErrorsIgnorePattern.test(
									def.name.name,
								)
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

								continue;
							}
						} else if (type === "Parameter") {
							if (
								(def.node.parent.type === "Property" ||
									def.node.parent.type ===
										"MethodDefinition") &&
								def.node.parent.kind === "set"
							) {
								continue;
							}

							if (config.args === "none") {
								continue;
							}

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

								continue;
							}

							if (
								config.args === "after-used" &&
								astUtils.isFunction(def.name.parent) &&
								!isAfterLastUsedArg(variable)
							) {
								continue;
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

								continue;
							}
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

			for (i = 0, l = childScopes.length; i < l; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

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
						return fixVariables(parentNode.parent);
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
					if (getTokenBeforeValue(node) === ":") {
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
					if (isLoop(parent.parent.parent) && parent.parent.parent.body !== parent.parent) {
						return null;
					}

					if (parent.parent.parent.type === "IfStatement" || isLoop(parent.parent.parent) || (parent.parent.parent.type === "WithStatement" && parent.parent.parent.body === parent.parent)) {
						return fixer.replaceText(parent.parent, ";");
					}

					if (isDeclarationNotSafeToRemove(nextToken, prevToken)) {
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

					return fixVariables(parent.parent);
				}

				if (tokenBefore.value === ":") {
					if (getTokenBeforeValue(parent) === "{" && getTokenAfterValue(parent) === ",") {
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
						if (parent.parent.parent.parent.type === "ArrayPattern") {
							return fixNestedArrayVariable(parent.parent.parent);
						}

						return fixVariables(parent.parent.parent);
					}

					if (getTokenBeforeValue(parent.parent) === "{" && getTokenAfterValue(parent.parent) === ",") {
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
```
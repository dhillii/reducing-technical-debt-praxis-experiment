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

		// Configuration initialization
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

		// Variable type determination
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

			const pattern = typeInfo.pattern
				? typeInfo.pattern.toString()
				: undefined;

			return [typeInfo.description, pattern];
		}

		// Message data generation
		function buildMessageData(unusedVar, action) {
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

		function getDefinedMessageData(unusedVar) {
			return buildMessageData(unusedVar, "defined");
		}

		function getAssignedMessageData(unusedVar) {
			return buildMessageData(unusedVar, "assigned a value");
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

		// Helper functions
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
				REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
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

		// Variable collection and filtering
		function shouldSkipVariable(variable, scope, def) {
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
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

		function checkArrayDestructurePattern(variable, def) {
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

		function checkClassNameDefinition(def) {
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

		function checkCatchClause(variable, def) {
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

			return false;
		}

		function checkParameter(variable, def) {
			if (def.type === "Parameter") {
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
			}

			return false;
		}

		function checkVariablePattern(variable, def) {
			if (
				def.type !== "Parameter" &&
				def.type !== "CatchClause" &&
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

			return false;
		}

		function shouldReportVariable(variable, scope, def) {
			if (shouldSkipVariable(variable, scope, def)) {
				return false;
			}

			if (!def) {
				return false;
			}

			if (checkArrayDestructurePattern(variable, def)) {
				return false;
			}

			if (checkClassNameDefinition(def)) {
				return false;
			}

			if (checkCatchClause(variable, def)) {
				return false;
			}

			if (checkParameter(variable, def)) {
				return false;
			}

			if (checkVariablePattern(variable, def)) {
				return false;
			}

			if (
				isUsedVariable(variable) ||
				isExported(variable) ||
				(config.ignoreUsingDeclarations &&
					usesExplicitResourceManagement(variable)) ||
				hasRestSpreadSibling(variable)
			) {
				return false;
			}

			return true;
		}

		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (scope.type !== "global" || config.vars === "all") {
				for (let i = 0; i < variables.length; ++i) {
					const variable = variables[i];
					const def = variable.defs[0];

					if (shouldReportVariable(variable, scope, def)) {
						unusedVars.push(variable);
					}
				}
			}

			for (let i = 0; i < childScopes.length; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

		// Fix handling
		function createFixHelpers(fixer, sourceCode) {
			return {
				getPreviousTokenStart(node, skips) {
					return sourceCode.getTokenBefore(node, skips).range[0];
				},

				getNextTokenEnd(node, skips) {
					return sourceCode.getTokenAfter(node, skips).range[1];
				},

				getTokenBeforeValue(node) {
					return sourceCode.getTokenBefore(node).value;
				},

				getTokenAfterValue(node) {
					return sourceCode.getTokenAfter(node).value;
				},

				hasSingleElement(node) {
					return node.elements.filter(e => e !== null).length === 1;
				},

				hasImportOfCertainType(node, type) {
					return node.specifiers.some(e => e.type === type);
				},

				isDeclarationNotSafeToRemove(nextToken, prevToken) {
					return (
						nextToken.type === "String" ||
						(prevToken &&
							!astUtils.isSemicolonToken(prevToken) &&
							!astUtils.isOpeningBraceToken(prevToken))
					);
				},
			};
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

			const helpers = createFixHelpers(fixer, sourceCode);

			// skip fix when variable has references that would be left behind
			if (
				allWriteReferences.some(
					ref => ref.identifier.range[0] !== id.range[0],
				)
			) {
				return null;
			}

			return fixVariableDeclaration(
				fixer,
				id,
				parent,
				parentType,
				tokenBefore,
				tokenAfter,
				isFunction,
				isLoop,
				helpers,
			);
		}

		function fixVariableDeclaration(
			fixer,
			id,
			parent,
			parentType,
			tokenBefore,
			tokenAfter,
			isFunction,
			isLoop,
			helpers,
		) {
			if (parentType === "VariableDeclarator") {
				return fixVariableDeclarator(
					fixer,
					id,
					parent,
					tokenBefore,
					tokenAfter,
					isLoop,
					helpers,
				);
			}

			if (parent.parent.type === "ObjectPattern") {
				return fixObjectPattern(
					fixer,
					id,
					parent,
					tokenBefore,
					tokenAfter,
					helpers,
				);
			}

			if (parentType === "ArrayPattern") {
				return fixArrayPattern(
					fixer,
					id,
					parent,
					tokenBefore,
					tokenAfter,
					helpers,
				);
			}

			if (parentType === "RestElement") {
				return fixRestElement(
					fixer,
					id,
					parent,
					isFunction,
					helpers,
				);
			}

			if (parentType === "AssignmentPattern") {
				return fixAssignmentPattern(
					fixer,
					id,
					parent,
					isFunction,
					helpers,
				);
			}

			if (parentType === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}

			if (parentType === "ImportDefaultSpecifier") {
				return fixImportDefaultSpecifier(
					fixer,
					id,
					parent,
					tokenAfter,
					helpers,
				);
			}

			if (parentType === "ImportSpecifier") {
				return fixImportSpecifier(
					fixer,
					id,
					parent,
					tokenBefore,
					tokenAfter,
					helpers,
				);
			}

			if (parentType === "ImportNamespaceSpecifier") {
				return fixImportNamespaceSpecifier(
					fixer,
					id,
					parent,
					helpers,
				);
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

		function fixVariableDeclarator(
			fixer,
			id,
			parent,
			tokenBefore,
			tokenAfter,
			isLoop,
			helpers,
		) {
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
					helpers.isDeclarationNotSafeToRemove(nextToken, prevToken)
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
				helpers.getNextTokenEnd(parent),
			]);
		}

		function fixObjectPattern(
			fixer,
			id,
			parent,
			tokenBefore,
			tokenAfter,
			helpers,
		) {
			if (parent.parent.properties.length === 1) {
				if (parent.parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent.parent, helpers);
				}

				if (parent.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent.parent, helpers);
				}

				return fixVariables(fixer, parent.parent, helpers);
			}

			if (tokenBefore.value === ":") {
				if (
					helpers.getTokenBeforeValue(parent) === "{" &&
					helpers.getTokenAfterValue(parent) === ","
				) {
					return fixer.removeRange([
						parent.range[0],
						helpers.getNextTokenEnd(parent),
					]);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(parent),
					id.range[1],
				]);
			}

			return null;
		}

		function fixArrayPattern(
			fixer,
			id,
			parent,
			tokenBefore,
			tokenAfter,
			helpers,
		) {
			if (helpers.hasSingleElement(parent)) {
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent, helpers);
				}

				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent, helpers);
				}

				return fixVariables(fixer, parent, helpers);
			}

			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(id.range);
			}

			return null;
		}

		function fixRestElement(
			fixer,
			id,
			parent,
			isFunction,
			helpers,
		) {
			if (parent.parent.type === "ArrayPattern") {
				if (helpers.hasSingleElement(parent.parent)) {
					if (parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent.parent, helpers);
					}

					return fixVariables(fixer, parent.parent, helpers);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(id, 1),
					id.range[1],
				]);
			}

			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(fixer, parent.parent, helpers);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(id, 1),
					id.range[1],
				]);
			}

			if (isFunction(parent.parent)) {
				if (parent.parent.params.length === 1) {
					return fixer.removeRange(parent.range);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(parent),
					parent.range[1],
				]);
			}

			return null;
		}

		function fixAssignmentPattern(
			fixer,
			id,
			parent,
			isFunction,
			helpers,
		) {
			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, parent, helpers);
			}

			if (parent.parent.parent.type === "ObjectPattern") {
				if (parent.parent.parent.properties.length === 1) {
					if (
						parent.parent.parent.parent.type === "ArrayPattern"
					) {
						return fixNestedArrayVariable(
							fixer,
							parent.parent.parent,
							helpers,
						);
					}

					return fixVariables(fixer, parent.parent.parent, helpers);
				}

				if (
					helpers.getTokenBeforeValue(parent.parent) === "{" &&
					helpers.getTokenAfterValue(parent.parent) === ","
				) {
					return fixer.removeRange([
						parent.parent.range[0],
						helpers.getNextTokenEnd(parent.parent),
					]);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(parent.parent),
					parent.parent.range[1],
				]);
			}

			if (isFunction(parent.parent)) {
				return fixFunctionParameters(fixer, parent, helpers);
			}

			return null;
		}

		function fixImportDefaultSpecifier(
			fixer,
			id,
			parent,
			tokenAfter,
			helpers,
		) {
			if (
				!helpers.hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
				!helpers.hasImportOfCertainType(
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

		function fixImportSpecifier(
			fixer,
			id,
			parent,
			tokenBefore,
			tokenAfter,
			helpers,
		) {
			const importSpecifiers = parent.parent.specifiers.filter(
				e => e.type === "ImportSpecifier",
			);

			if (importSpecifiers.length === 1) {
				if (
					!helpers.hasImportOfCertainType(
						parent.parent,
						"ImportDefaultSpecifier",
					)
				) {
					return fixer.removeRange(parent.parent.range);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(parent, 1),
					tokenAfter.range[1],
				]);
			}

			if (tokenBefore.value === "{") {
				return fixer.removeRange([
					parent.range[0],
					helpers.getNextTokenEnd(parent),
				]);
			}

			return fixer.removeRange([
				helpers.getPreviousTokenStart(parent),
				parent.range[1],
			]);
		}

		function fixImportNamespaceSpecifier(
			fixer,
			id,
			parent,
			helpers,
		) {
			if (
				helpers.hasImportOfCertainType(
					parent.parent,
					"ImportDefaultSpecifier",
				)
			) {
				return fixer.removeRange([
					helpers.getPreviousTokenStart(parent),
					parent.range[1],
				]);
			}

			return fixer.removeRange([
				parent.range[0],
				parent.parent.source.range[0],
			]);
		}

		function fixFunctionParameters(fixer, node, helpers) {
			const parentNode = node.parent;

			if (astUtils.isFunction(parentNode)) {
				if (parentNode.params.length === 1) {
					return fixer.removeRange(node.range);
				}

				if (
					helpers.getTokenBeforeValue(node) === "(" &&
					helpers.getTokenAfterValue(node) === ","
				) {
					return fixer.removeRange([
						node.range[0],
						helpers.getNextTokenEnd(node),
					]);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(node),
					node.range[1],
				]);
			}

			return null;
		}

		function fixVariables(fixer, node, helpers) {
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
						helpers.isDeclarationNotSafeToRemove(nextToken, prevToken)
					) {
						return null;
					}

					return fixer.removeRange(parentNode.parent.range);
				}

				if (helpers.getTokenBeforeValue(parentNode) === ",") {
					return fixer.removeRange([
						helpers.getPreviousTokenStart(parentNode),
						parentNode.range[1],
					]);
				}

				return fixer.removeRange([
					parentNode.range[0],
					helpers.getNextTokenEnd(parentNode),
				]);
			}

			if (helpers.getTokenBeforeValue(node) === ":") {
				if (parentNode.parent.type === "ObjectPattern") {
					return fixObjectWithValueSeparator(fixer, node, helpers);
				}
			}

			return fixFunctionParameters(fixer, node, helpers);
		}

		function fixNestedObjectVariable(fixer, node, helpers) {
			const parentNode = node.parent;

			if (
				parentNode.parent.parent.parent.type === "ObjectPattern" &&
				parentNode.parent.properties.length === 1
			) {
				return fixNestedObjectVariable(fixer, parentNode.parent, helpers);
			}

			if (parentNode.parent.type === "ObjectPattern") {
				if (parentNode.parent.properties.length === 1) {
					return fixVariables(fixer, parentNode.parent, helpers);
				}

				if (helpers.getTokenBeforeValue(parentNode) === "{") {
					return fixer.removeRange([
						parentNode.range[0],
						helpers.getNextTokenEnd(parentNode),
					]);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(parentNode),
					parentNode.range[1],
				]);
			}

			return null;
		}

		function fixNestedArrayVariable(fixer, node, helpers) {
			const parentNode = node.parent;

			if (
				parentNode.parent.type === "ArrayPattern" &&
				helpers.hasSingleElement(parentNode)
			) {
				return fixNestedArrayVariable(fixer, parentNode, helpers);
			}

			if (helpers.hasSingleElement(parentNode)) {
				if (helpers.getTokenBeforeValue(parentNode) === ":") {
					return fixVariables(fixer, parentNode, helpers);
				}

				if (parentNode.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parentNode.parent, helpers);
				}

				return fixVariables(fixer, parentNode, helpers);
			}

			if (
				helpers.getTokenBeforeValue(node) === "," &&
				helpers.getTokenAfterValue(node) === "]"
			) {
				return fixer.removeRange([
					helpers.getPreviousTokenStart(node),
					node.range[1],
				]);
			}

			return fixer.removeRange(node.range);
		}

		function fixObjectWithValueSeparator(fixer, node, helpers) {
			const parentNode = node.parent.parent;

			if (
				parentNode.parent.type === "ArrayPattern" &&
				parentNode.properties.length === 1
			) {
				return fixNestedArrayVariable(fixer, parentNode, helpers);
			}

			return fixNestedObjectVariable(fixer, node, helpers);
		}

		function fixRestInPattern(fixer, node, helpers) {
			const parentNode = node.parent;

			if (astUtils.isFunction(parentNode)) {
				if (parentNode.params.length === 1) {
					return fixer.removeRange(node.range);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(node),
					node.range[1],
				]);
			}

			if (parentNode.type === "ArrayPattern") {
				if (helpers.hasSingleElement(parentNode)) {
					if (parentNode.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parentNode, helpers);
					}

					return fixVariables(fixer, parentNode, helpers);
				}

				return fixer.removeRange([
					helpers.getPreviousTokenStart(node),
					node.range[1],
				]);
			}

			return null;
		}

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
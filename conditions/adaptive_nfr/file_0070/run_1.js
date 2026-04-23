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

		const config = {
			vars: "all",
			args: "after-used",
			ignoreRestSiblings: false,
			caughtErrors: "all",
			ignoreClassWithStaticInitBlock: false,
			ignoreUsingDeclarations: false,
			reportUsedIgnorePattern: false,
		};

		initializeConfig();

		/** Initialize configuration from context options */
		function initializeConfig() {
			const firstOption = context.options[0];

			if (!firstOption) {
				return;
			}

			if (typeof firstOption === "string") {
				config.vars = firstOption;
				return;
			}

			applyObjectConfig(firstOption);
		}

		/** Apply object-based configuration */
		function applyObjectConfig(firstOption) {
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

		/** Determines what variable type a def is */
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

		/** Gets a variable's description and configured ignore pattern */
		function getVariableDescription(variableType) {
			const typeConfig = {
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

			const typeInfo = typeConfig[variableType];
			if (!typeInfo) {
				throw new Error(`Unexpected variable type: ${variableType}`);
			}

			const pattern = typeInfo.pattern ? typeInfo.pattern.toString() : undefined;
			return [typeInfo.description, pattern];
		}

		/** Generates message data for defined but unused variable */
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

		/** Generates message data for assigned but unused variable */
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

		/** Generates message data for used ignored variable */
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

		/** Determines if a variable is being exported */
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

		/** Determines if a variable uses explicit resource management */
		function usesExplicitResourceManagement(variable) {
			const [definition] = variable.defs;

			return (
				definition?.type === "Variable" &&
				(definition.parent.kind === "using" ||
					definition.parent.kind === "await using")
			);
		}

		/** Checks if a node is a sibling of the rest property */
		function hasRestSibling(node) {
			return (
				node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
			);
		}

		/** Determines if a variable has a sibling rest property */
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

		/** Determines if a reference is a read operation */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/** Determine if an identifier is referencing an enclosing function name */
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

		/** Gets a list of function definitions for a variable */
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

		/** Checks if inner node exists inside outer node */
		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] &&
				inner.range[1] <= outer.range[1]
			);
		}

		/** Checks if a node is an unused expression */
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

		/** Gets the RHS node if reference is LHS of assignment */
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

		/** Checks if a function node is stored for later use */
		function isStorableFunction(funcNode, rhsNode) {
			let node = funcNode;
			let parent = funcNode.parent;

			while (parent && isInside(parent, rhsNode)) {
				if (!checkStorableFunctionParent(parent, node)) {
					return false;
				}

				node = parent;
				parent = parent.parent;
			}

			return false;
		}

		/** Helper to check storable function parent types */
		function checkStorableFunctionParent(parent, node) {
			switch (parent.type) {
				case "SequenceExpression":
					return parent.expressions.at(-1) === node;

				case "CallExpression":
				case "NewExpression":
					return parent.callee === node;

				case "AssignmentExpression":
				case "TaggedTemplateExpression":
				case "YieldExpression":
					return true;

				default:
					if (STATEMENT_TYPE.test(parent.type)) {
						return true;
					}
					return false;
			}
		}

		/** Checks if identifier is inside a storable function */
		function isInsideOfStorableFunction(id, rhsNode) {
			const funcNode = astUtils.getUpperFunction(id);

			return (
				funcNode &&
				isInside(funcNode, rhsNode) &&
				isStorableFunction(funcNode, rhsNode)
			);
		}

		/** Checks if reference is a read to update itself */
		function isReadForItself(ref, rhsNode) {
			const id = ref.identifier;
			const parent = id.parent;

			if (!ref.isRead()) {
				return false;
			}

			if (isSelfUpdateExpression(parent, id)) {
				return true;
			}

			if (rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)) {
				return true;
			}

			return false;
		}

		/** Helper to check self-update expressions */
		function isSelfUpdateExpression(parent, id) {
			if (parent.type === "AssignmentExpression" &&
				parent.left === id &&
				isUnusedExpression(parent) &&
				!astUtils.isLogicalAssignmentOperator(parent.operator)) {
				return true;
			}

			if (parent.type === "UpdateExpression" &&
				isUnusedExpression(parent)) {
				return true;
			}

			return false;
		}

		/** Determine if identifier is used in for-in or for-of loops */
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

			target = getLoopBodyFirstStatement(target);

			if (!target) {
				return false;
			}

			return target.type === "ReturnStatement";
		}

		/** Gets the first statement of a loop body */
		function getLoopBodyFirstStatement(loopNode) {
			if (loopNode.body.type === "BlockStatement") {
				return loopNode.body.body[0];
			}

			return loopNode.body;
		}

		/** Determines if the variable is used */
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

		/** Checks if variable is after the last used parameter */
		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const posteriorParams = params.slice(params.indexOf(variable) + 1);

			return !posteriorParams.some(
				v => v.references.length > 0 || v.eslintUsed,
			);
		}

		/** Collects unused variables from scope and descendant scopes */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (scope.type === "global" && config.vars !== "all") {
				return collectUnusedVariablesFromChildren(childScopes, unusedVars);
			}

			for (let i = 0; i < variables.length; ++i) {
				const variable = variables[i];

				if (shouldSkipVariable(variable, scope)) {
					continue;
				}

				const def = variable.defs[0];

				if (!def) {
					continue;
				}

				if (shouldSkipDefinition(variable, def)) {
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

			return collectUnusedVariablesFromChildren(childScopes, unusedVars);
		}

		/** Collects unused variables from child scopes */
		function collectUnusedVariablesFromChildren(childScopes, unusedVars) {
			for (let i = 0; i < childScopes.length; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

		/** Determines if a variable should be skipped */
		function shouldSkipVariable(variable, scope) {
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

		/** Determines if a definition should be skipped */
		function shouldSkipDefinition(variable, def) {
			const type = def.type;

			if (shouldSkipArrayDestructure(variable, def)) {
				return true;
			}

			if (shouldSkipClassName(def)) {
				return true;
			}

			if (shouldSkipCatchClause(variable, def)) {
				return true;
			}

			if (shouldSkipParameter(variable, def)) {
				return true;
			}

			if (shouldSkipRegularVariable(variable, def)) {
				return true;
			}

			return false;
		}

		/** Checks if array destructure should be skipped */
		function shouldSkipArrayDestructure(variable, def) {
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

		/** Checks if class name should be skipped */
		function shouldSkipClassName(def) {
			if (def.type !== "ClassName") {
				return false;
			}

			const hasStaticBlock = def.node.body.body.some(
				node => node.type === "StaticBlock",
			);

			return config.ignoreClassWithStaticInitBlock && hasStaticBlock;
		}

		/** Checks if catch clause should be skipped */
		function shouldSkipCatchClause(variable, def) {
			if (def.type !== "CatchClause") {
				return false;
			}

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

			return false;
		}

		/** Checks if parameter should be skipped */
		function shouldSkipParameter(variable, def) {
			if (def.type !== "Parameter") {
				return false;
			}

			if (isSetterParameter(def)) {
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

			return false;
		}

		/** Checks if parameter is a setter parameter */
		function isSetterParameter(def) {
			const parent = def.node.parent;

			return (
				(parent.type === "Property" || parent.type === "MethodDefinition") &&
				parent.kind === "set"
			);
		}

		/** Checks if regular variable should be skipped */
		function shouldSkipRegularVariable(variable, def) {
			if (def.type === "ClassName" || def.type === "CatchClause" || def.type === "Parameter") {
				return false;
			}

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

			return false;
		}

		/** Fixes unused variables */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;

			return fixByParentType(fixer, id, parent, parentType, unusedVar);
		}

		/** Routes fix logic by parent type */
		function fixByParentType(fixer, id, parent, parentType, unusedVar) {
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
				return fixVariableDeclarator(fixer, id, parent);
			}

			if (parent.parent.type === "ObjectPattern") {
				return fixObjectPattern(fixer, id, parent);
			}

			if (parentType === "ArrayPattern") {
				return fixArrayPattern(fixer, id, parent);
			}

			if (parentType === "RestElement") {
				return fixRestElement(fixer, id, parent);
			}

			if (parentType === "AssignmentPattern") {
				return fixAssignmentPattern(fixer, id, parent);
			}

			if (parentType === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}

			if (parentType === "ImportDefaultSpecifier") {
				return fixImportDefaultSpecifier(fixer, id, parent);
			}

			if (parentType === "ImportSpecifier") {
				return fixImportSpecifier(fixer, id, parent);
			}

			if (parentType === "ImportNamespaceSpecifier") {
				return fixImportNamespaceSpecifier(fixer, id, parent);
			}

			if (parentType === "CatchClause") {
				return null;
			}

			if (parentType === "ClassDeclaration") {
				return fixer.removeRange(parent.range);
			}

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
				parentType === "ArrowFunctionExpression" &&
				parent.params.length === 1 &&
				tokenAfter?.value !== ")"
			) {
				return fixer.replaceText(id, "()");
			}

			return fixer.removeRange(id.range);
		}

		/** Fixes variable declarator */
		function fixVariableDeclarator(fixer, id, parent) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			if (parent.parent.declarations.length === 1) {
				if (
					astUtils.isLoop(parent.parent.parent) &&
					parent.parent.parent.body !== parent.parent
				) {
					return null;
				}

				if (isStatementContext(parent.parent.parent)) {
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

		/** Checks if node is in statement context */
		function isStatementContext(node) {
			return (
				node.type === "IfStatement" ||
				astUtils.isLoop(node) ||
				(node.type === "WithStatement")
			);
		}

		/** Checks if declaration is safe to remove */
		function isDeclarationNotSafeToRemove(nextToken, prevToken) {
			return (
				nextToken.type === "String" ||
				(prevToken &&
					!astUtils.isSemicolonToken(prevToken) &&
					!astUtils.isOpeningBraceToken(prevToken))
			);
		}

		/** Fixes object pattern */
		function fixObjectPattern(fixer, id, parent) {
			if (parent.parent.properties.length === 1) {
				if (parent.parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent.parent);
				}

				if (parent.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent.parent);
				}

				return fixVariables(fixer, parent.parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(id);

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

		/** Fixes array pattern */
		function fixArrayPattern(fixer, id, parent) {
			if (hasSingleElement(parent)) {
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent);
				}

				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent);
				}

				return fixVariables(fixer, parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(id.range);
			}

			return null;
		}

		/** Fixes rest element */
		function fixRestElement(fixer, id, parent) {
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

		/** Fixes assignment pattern */
		function fixAssignmentPattern(fixer, id, parent) {
			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, parent);
			}

			if (parent.parent.parent.type === "ObjectPattern") {
				if (parent.parent.parent.properties.length === 1) {
					if (
						parent.parent.parent.parent.type === "ArrayPattern"
					) {
						return fixNestedArrayVariable(fixer, parent.parent.parent);
					}

					return fixVariables(fixer, parent.parent.parent);
				}

				const tokenBeforeParent = sourceCode.getTokenBefore(parent.parent);
				const tokenAfterParent = sourceCode.getTokenAfter(parent.parent);

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
				return fixFunctionParameters(fixer, id, parent);
			}

			return null;
		}

		/** Fixes function parameters */
		function fixFunctionParameters(fixer, id, parent) {
			const parentNode = parent.parent;

			if (!astUtils.isFunction(parentNode)) {
				return null;
			}

			if (parentNode.params.length === 1) {
				return fixer.removeRange(parent.range);
			}

			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			if (tokenBefore.value === "(" && tokenAfter.value === ",") {
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

		/** Fixes variables in general */
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

				const tokenBefore = sourceCode.getTokenBefore(parentNode);

				if (tokenBefore.value === ",") {
					return fixer.removeRange([
						sourceCode.getTokenBefore(parentNode).range[0],
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

			return fixFunctionParameters(fixer, node, node);
		}

		/** Fixes nested object variables */
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

		/** Fixes nested array variables */
		function fixNestedArrayVariable(fixer, node) {
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
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}

			return fixer.removeRange(node.range);
		}

		/** Fixes object with value separator */
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

		/** Fixes rest in pattern */
		function fixRestInPattern(fixer, node) {
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

		/** Checks if array has single element */
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		/** Checks if import has certain type */
		function hasImportOfCertainType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}

		/** Fixes import default specifier */
		function fixImportDefaultSpecifier(fixer, id, parent) {
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

			const tokenAfter = sourceCode.getTokenAfter(id);

			return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
		}

		/** Fixes import specifier */
		function fixImportSpecifier(fixer, id, parent) {
			const importSpecifiers = parent.parent.specifiers.filter(
				e => e.type === "ImportSpecifier",
			);

			if (importSpecifiers.length === 1) {
				if (
					!hasImportOfCertainType(
						parent.parent,
						"ImportDefaultSpecifier",
					)
				) {
					return fixer.removeRange(parent.parent.range);
				}

				const tokenBefore = sourceCode.getTokenBefore(parent, 1);

				return fixer.removeRange([
					tokenBefore.range[0],
					sourceCode.getTokenAfter(id).range[1],
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

		/** Fixes import namespace specifier */
		function fixImportNamespaceSpecifier(fixer, id, parent) {
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

		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(
					sourceCode.getScope(programNode),
					[],
				);

				for (let i = 0; i < unusedVars.length; ++i) {
					const unusedVar = unusedVars[i];

					if (unusedVar.defs.length > 0) {
						reportUnusedVariable(unusedVar);
					} else if (unusedVar.eslintExplicitGlobalComments) {
						reportGlobalDirectiveVariable(unusedVar, programNode);
					}
				}
			},
		};

		/** Reports an unused variable */
		function reportUnusedVariable(unusedVar) {
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
		}

		/** Reports a global directive variable */
		function reportGlobalDirectiveVariable(unusedVar, programNode) {
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
	},
};
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

		/** Helper to check parent type in storable function */
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
					return !STATEMENT_TYPE.test(parent.type);
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

			if (target.type !== "ForInStatement" &&
				target.type !== "ForOfStatement") {
				return false;
			}

			const body = target.body.type === "BlockStatement"
				? target.body.body[0]
				: target.body;

			return body && body.type === "ReturnStatement";
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

		/** Checks if variable should be skipped from reporting */
		function shouldSkipVariable(variable, scope) {
			if (isClassNameInClassScope(variable, scope)) {
				return true;
			}

			if (scope.functionExpressionScope) {
				return true;
			}

			if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
				return true;
			}

			if (isImplicitArgumentsVariable(variable, scope)) {
				return true;
			}

			return false;
		}

		/** Checks if variable is class name in class scope */
		function isClassNameInClassScope(variable, scope) {
			return (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
			);
		}

		/** Checks if variable is implicit arguments */
		function isImplicitArgumentsVariable(variable, scope) {
			return (
				scope.type === "function" &&
				variable.name === "arguments" &&
				variable.identifiers.length === 0
			);
		}

		/** Checks if variable definition should be skipped */
		function shouldSkipDefinition(variable, def) {
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

			if ((def.name.parent.type === "ArrayPattern" ||
				refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name)) {

				if (config.reportUsedIgnorePattern &&
					isUsedVariable(variable)) {
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

			if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
				return true;
			}

			return false;
		}

		/** Checks if catch clause should be skipped */
		function shouldSkipCatchClause(variable, def) {
			if (def.type !== "CatchClause") {
				return false;
			}

			if (config.caughtErrors === "none") {
				return true;
			}

			if (config.caughtErrorsIgnorePattern &&
				config.caughtErrorsIgnorePattern.test(def.name.name)) {

				if (config.reportUsedIgnorePattern &&
					isUsedVariable(variable)) {
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

			if (config.argsIgnorePattern &&
				config.argsIgnorePattern.test(def.name.name)) {

				if (config.reportUsedIgnorePattern &&
					isUsedVariable(variable)) {
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

			if (config.args === "after-used" &&
				astUtils.isFunction(def.name.parent) &&
				!isAfterLastUsedArg(variable)) {
				return true;
			}

			return false;
		}

		/** Checks if parameter is a setter parameter */
		function isSetterParameter(def) {
			const parent = def.node.parent;
			return (
				(parent.type === "Property" ||
					parent.type === "MethodDefinition") &&
				parent.kind === "set"
			);
		}

		/** Checks if regular variable should be skipped */
		function shouldSkipRegularVariable(variable, def) {
			if (def.type === "ClassName" || def.type === "CatchClause" || def.type === "Parameter") {
				return false;
			}

			if (config.varsIgnorePattern &&
				config.varsIgnorePattern.test(def.name.name)) {

				if (config.reportUsedIgnorePattern &&
					isUsedVariable(variable)) {
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

		/** Collects unused variables from scope and child scopes */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (scope.type !== "global" && config.vars !== "all") {
				return collectChildScopes(childScopes, unusedVars);
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

				if (isUnusedAndNotExported(variable)) {
					unusedVars.push(variable);
				}
			}

			return collectChildScopes(childScopes, unusedVars);
		}

		/** Collects unused variables from child scopes */
		function collectChildScopes(childScopes, unusedVars) {
			for (let i = 0; i < childScopes.length; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
		}

		/** Checks if variable is unused and not exported */
		function isUnusedAndNotExported(variable) {
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

		/** Fixes unused variables */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;

			return fixByParentType(fixer, id, parent, parentType, unusedVar);
		}

		/** Routes fix logic by parent type */
		function fixByParentType(fixer, id, parent, parentType, unusedVar) {
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
				return fixSequenceElement(fixer, id, tokenBefore, tokenAfter);
			}

			if (parentType === "ArrowFunctionExpression" &&
				parent.params.length === 1 &&
				tokenAfter?.value !== ")") {
				return fixer.replaceText(id, "()");
			}

			return fixer.removeRange(id.range);
		}

		/** Fixes variable declarator */
		function fixVariableDeclarator(fixer, id, parent) {
			const allWriteReferences = getWriteReferences(id);

			if (allWriteReferences.some(
				ref => ref.identifier.range[0] !== id.range[0],
			)) {
				return null;
			}

			if (parent.parent.declarations.length === 1) {
				return fixSingleVariableDeclaration(fixer, parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(parent);

			if (tokenBefore.value === ",") {
				return fixer.removeRange([
					tokenBefore.range[0],
					parent.range[1],
				]);
			}

			const tokenAfter = sourceCode.getTokenAfter(parent);
			return fixer.removeRange([
				parent.range[0],
				tokenAfter.range[1],
			]);
		}

		/** Gets write references for an identifier */
		function getWriteReferences(id) {
			const variable = sourceCode.getScope(id).variables.find(
				v => v.identifiers.includes(id),
			);
			return variable ? variable.references.filter(ref => ref.isWrite()) : [];
		}

		/** Fixes single variable declaration */
		function fixSingleVariableDeclaration(fixer, parent) {
			const isInForLoop = astUtils.isLoop(parent.parent.parent) &&
				parent.parent.parent.body !== parent.parent;

			if (isInForLoop) {
				return null;
			}

			if (isInSpecialStatement(parent.parent.parent)) {
				return fixer.replaceText(parent.parent, ";");
			}

			const nextToken = sourceCode.getTokenAfter(parent.parent);
			const prevToken = sourceCode.getTokenBefore(parent.parent);

			if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) {
				return null;
			}

			return fixer.removeRange(parent.parent.range);
		}

		/** Checks if parent is a special statement */
		function isInSpecialStatement(parent) {
			return (
				parent.type === "IfStatement" ||
				astUtils.isLoop(parent) ||
				(parent.type === "WithStatement" &&
					parent.body === parent.parent)
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
				return fixSingleObjectProperty(fixer, parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(parent);

			if (tokenBefore.value === ":") {
				return fixObjectPropertyWithColon(fixer, id, parent, tokenBefore);
			}

			return null;
		}

		/** Fixes single object property */
		function fixSingleObjectProperty(fixer, parent) {
			if (parent.parent.parent.type === "RestElement") {
				return null;
			}

			if (parent.parent.parent.type === "ArrayPattern") {
				return null;
			}

			return null;
		}

		/** Fixes object property with colon separator */
		function fixObjectPropertyWithColon(fixer, id, parent, tokenBefore) {
			const tokenBeforeParent = sourceCode.getTokenBefore(parent);

			if (tokenBeforeParent.value === "{") {
				const tokenAfter = sourceCode.getTokenAfter(parent);

				if (tokenAfter.value === ",") {
					return fixer.removeRange([
						parent.range[0],
						tokenAfter.range[1],
					]);
				}
			}

			const tokenBeforeParentStart = sourceCode.getTokenBefore(parent, 1);
			return fixer.removeRange([
				tokenBeforeParentStart.range[0],
				id.range[1],
			]);
		}

		/** Fixes array pattern */
		function fixArrayPattern(fixer, id, parent) {
			const hasSingleElement = parent.elements.filter(e => e !== null).length === 1;

			if (hasSingleElement) {
				return fixSingleArrayElement(fixer, id, parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(id.range);
			}

			return null;
		}

		/** Fixes single array element */
		function fixSingleArrayElement(fixer, id, parent) {
			if (parent.parent.type === "RestElement") {
				return null;
			}

			if (parent.parent.type === "ArrayPattern") {
				return null;
			}

			return null;
		}

		/** Fixes rest element */
		function fixRestElement(fixer, id, parent) {
			if (parent.parent.type === "ArrayPattern") {
				return fixRestInArrayPattern(fixer, id, parent);
			}

			if (parent.parent.type === "ObjectPattern") {
				return fixRestInObjectPattern(fixer, id, parent);
			}

			if (astUtils.isFunction(parent.parent)) {
				return fixRestInFunction(fixer, id, parent);
			}

			return null;
		}

		/** Fixes rest in array pattern */
		function fixRestInArrayPattern(fixer, id, parent) {
			const hasSingleElement = parent.parent.elements.filter(e => e !== null).length === 1;

			if (hasSingleElement) {
				if (parent.parent.parent.type === "ArrayPattern") {
					return null;
				}

				return null;
			}

			const tokenBefore = sourceCode.getTokenBefore(id, 1);
			return fixer.removeRange([
				tokenBefore.range[0],
				id.range[1],
			]);
		}

		/** Fixes rest in object pattern */
		function fixRestInObjectPattern(fixer, id, parent) {
			if (parent.parent.properties.length === 1) {
				return null;
			}

			const tokenBefore = sourceCode.getTokenBefore(id, 1);
			return fixer.removeRange([
				tokenBefore.range[0],
				id.range[1],
			]);
		}

		/** Fixes rest in function */
		function fixRestInFunction(fixer, id, parent) {
			if (parent.parent.params.length === 1) {
				return fixer.removeRange(parent.range);
			}

			const tokenBefore = sourceCode.getTokenBefore(parent);
			return fixer.removeRange([
				tokenBefore.range[0],
				parent.range[1],
			]);
		}

		/** Fixes assignment pattern */
		function fixAssignmentPattern(fixer, id, parent) {
			if (parent.parent.type === "ArrayPattern") {
				return null;
			}

			if (parent.parent.parent.type === "ObjectPattern") {
				return fixAssignmentInObjectPattern(fixer, id, parent);
			}

			if (astUtils.isFunction(parent.parent)) {
				return null;
			}

			return null;
		}

		/** Fixes assignment in object pattern */
		function fixAssignmentInObjectPattern(fixer, id, parent) {
			if (parent.parent.parent.properties.length === 1) {
				if (parent.parent.parent.parent.type === "ArrayPattern") {
					return null;
				}

				return null;
			}

			const tokenBeforeParent = sourceCode.getTokenBefore(parent.parent);

			if (tokenBeforeParent.value === "{") {
				const tokenAfter = sourceCode.getTokenAfter(parent.parent);

				if (tokenAfter.value === ",") {
					return fixer.removeRange([
						parent.parent.range[0],
						tokenAfter.range[1],
					]);
				}
			}

			const tokenBeforeParentStart = sourceCode.getTokenBefore(parent.parent, 1);
			return fixer.removeRange([
				tokenBeforeParentStart.range[0],
				parent.parent.range[1],
			]);
		}

		/** Fixes import default specifier */
		function fixImportDefaultSpecifier(fixer, id, parent) {
			const hasOtherImports = hasImportOfCertainType(parent.parent, "ImportSpecifier") ||
				hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier");

			if (!hasOtherImports) {
				return fixer.removeRange([
					parent.range[0],
					parent.parent.source.range[0],
				]);
			}

			const tokenAfter = sourceCode.getTokenAfter(id);
			return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
		}

		/** Checks if import has certain type */
		function hasImportOfCertainType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}

		/** Fixes import specifier */
		function fixImportSpecifier(fixer, id, parent) {
			const importSpecifiers = parent.parent.specifiers.filter(
				e => e.type === "ImportSpecifier",
			);

			if (importSpecifiers.length === 1) {
				return fixSingleImportSpecifier(fixer, parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(parent);

			if (tokenBefore.value === "{") {
				const tokenAfter = sourceCode.getTokenAfter(parent);
				return fixer.removeRange([
					parent.range[0],
					tokenAfter.range[1],
				]);
			}

			const tokenBeforeStart = sourceCode.getTokenBefore(parent, 1);
			return fixer.removeRange([
				tokenBeforeStart.range[0],
				parent.range[1],
			]);
		}

		/** Fixes single import specifier */
		function fixSingleImportSpecifier(fixer, parent) {
			const hasDefaultImport = hasImportOfCertainType(
				parent.parent,
				"ImportDefaultSpecifier",
			);

			if (!hasDefaultImport) {
				return fixer.removeRange(parent.parent.range);
			}

			const tokenBefore = sourceCode.getTokenBefore(parent, 1);
			const tokenAfter = sourceCode.getTokenAfter(parent);
			return fixer.removeRange([
				tokenBefore.range[0],
				tokenAfter.range[1],
			]);
		}

		/** Fixes import namespace specifier */
		function fixImportNamespaceSpecifier(fixer, id, parent) {
			const hasDefaultImport = hasImportOfCertainType(
				parent.parent,
				"ImportDefaultSpecifier",
			);

			if (hasDefaultImport) {
				const tokenBefore = sourceCode.getTokenBefore(parent);
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

		/** Fixes sequence element */
		function fixSequenceElement(fixer, id, tokenBefore, tokenAfter) {
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

			return null;
		}

		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(
					sourceCode.getScope(programNode),
					[],
				);

				for (let i = 0; i < unusedVars.length; ++i) {
					reportUnusedVariable(unusedVars[i], programNode);
				}
			},
		};

		/** Reports an unused variable */
		function reportUnusedVariable(unusedVar, programNode) {
			if (unusedVar.defs.length > 0) {
				reportVariableDefinition(unusedVar);
			} else if (unusedVar.eslintExplicitGlobalComments) {
				reportGlobalDirective(unusedVar, programNode);
			}
		}

		/** Reports variable definition */
		function reportVariableDefinition(unusedVar) {
			const writeReferences = unusedVar.references.filter(
				ref =>
					ref.isWrite() &&
					ref.from.variableScope ===
						unusedVar.scope.variableScope,
			);

			const referenceToReport = writeReferences.length > 0
				? writeReferences.at(-1)
				: null;

			const messageData = unusedVar.references.some(ref => ref.isWrite())
				? getAssignedMessageData(unusedVar)
				: getDefinedMessageData(unusedVar);

			context.report({
				node: referenceToReport
					? referenceToReport.identifier
					: unusedVar.identifiers[0],
				messageId: "unusedVar",
				data: messageData,
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

		/** Reports global directive */
		function reportGlobalDirective(unusedVar, programNode) {
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
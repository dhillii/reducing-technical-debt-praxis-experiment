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

		/** Checks if parent is a self-update expression */
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

			const loopBody = target.body.type === "BlockStatement"
				? target.body.body[0]
				: target.body;

			return loopBody && loopBody.type === "ReturnStatement";
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

		/** Processes array destructure pattern variable */
		function processArrayDestructureVariable(variable, def) {
			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

			if ((def.name.parent.type === "ArrayPattern" ||
				refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name)) {

				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
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

		/** Processes class name variable */
		function processClassNameVariable(def) {
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

		/** Processes catch clause variable */
		function processCatchClauseVariable(variable, def) {
			if (def.type !== "CatchClause") {
				return false;
			}

			if (config.caughtErrors === "none") {
				return true;
			}

			if (config.caughtErrorsIgnorePattern &&
				config.caughtErrorsIgnorePattern.test(def.name.name)) {

				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
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

		/** Processes parameter variable */
		function processParameterVariable(variable, def) {
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

				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
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
			return (
				(def.node.parent.type === "Property" ||
					def.node.parent.type === "MethodDefinition") &&
				def.node.parent.kind === "set"
			);
		}

		/** Processes regular variable */
		function processRegularVariable(variable, def) {
			if (config.varsIgnorePattern &&
				config.varsIgnorePattern.test(def.name.name)) {

				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
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

		/** Checks if variable should be reported as unused */
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

		/** Gets unused variables from scope */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (scope.type !== "global" && config.vars !== "all") {
				return collectUnusedVariablesFromChildScopes(childScopes, unusedVars);
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

				if (processArrayDestructureVariable(variable, def)) {
					continue;
				}

				if (processClassNameVariable(def)) {
					continue;
				}

				if (processCatchClauseVariable(variable, def)) {
					continue;
				}

				if (processParameterVariable(variable, def)) {
					continue;
				}

				if (processRegularVariable(variable, def)) {
					continue;
				}

				if (shouldReportUnusedVariable(variable)) {
					unusedVars.push(variable);
				}
			}

			return collectUnusedVariablesFromChildScopes(childScopes, unusedVars);
		}

		/** Collects unused variables from child scopes */
		function collectUnusedVariablesFromChildScopes(childScopes, unusedVars) {
			for (let i = 0; i < childScopes.length; ++i) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}

			return unusedVars;
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
			switch (parentType) {
				case "VariableDeclarator":
					return fixVariableDeclarator(fixer, id, parent);
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
				case "ArrayPattern":
					return fixArrayPattern(fixer, id, parent);
				case "RestElement":
					return fixRestElement(fixer, id, parent);
				case "AssignmentPattern":
					return fixAssignmentPattern(fixer, id, parent);
				default:
					return fixObjectPatternOrDefault(fixer, id, parent, parentType);
			}
		}

		/** Fixes variable declarator */
		function fixVariableDeclarator(fixer, id, parent) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			if (parent.parent.declarations.length === 1) {
				return fixSingleVariableDeclaration(fixer, parent, tokenBefore);
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

		/** Fixes single variable declaration */
		function fixSingleVariableDeclaration(fixer, parent, tokenBefore) {
			if (astUtils.isLoop(parent.parent.parent) &&
				parent.parent.parent.body !== parent.parent) {
				return null;
			}

			if (isStatementContext(parent.parent.parent)) {
				return fixer.replaceText(parent.parent, ";");
			}

			const nextToken = sourceCode.getTokenAfter(parent.parent);
			const prevToken = sourceCode.getTokenBefore(parent.parent);

			if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) {
				return null;
			}

			return fixer.removeRange(parent.parent.range);
		}

		/** Checks if parent is in statement context */
		function isStatementContext(parent) {
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

		/** Fixes function declaration */
		function fixFunctionDeclaration(fixer, id, parent) {
			if (parent.id === id) {
				return fixer.removeRange(parent.range);
			}

			return null;
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

		/** Fixes import specifier */
		function fixImportSpecifier(fixer, id, parent) {
			const importSpecifiers = parent.parent.specifiers.filter(
				e => e.type === "ImportSpecifier",
			);

			if (importSpecifiers.length === 1) {
				return fixSingleImportSpecifier(fixer, parent);
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

		/** Fixes single import specifier */
		function fixSingleImportSpecifier(fixer, parent) {
			const hasDefaultImport = hasImportOfCertainType(
				parent.parent,
				"ImportDefaultSpecifier",
			);

			if (!hasDefaultImport) {
				return fixer.removeRange(parent.parent.range);
			}

			return fixer.removeRange([
				sourceCode.getTokenBefore(parent, 1).range[0],
				sourceCode.getTokenAfter(parent).range[1],
			]);
		}

		/** Fixes import namespace specifier */
		function fixImportNamespaceSpecifier(fixer, id, parent) {
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

		/** Fixes array pattern */
		function fixArrayPattern(fixer, id, parent) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			if (hasSingleElement(parent)) {
				return fixSingleElementArray(fixer, parent);
			}

			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(id.range);
			}

			return fixer.removeRange(id.range);
		}

		/** Fixes single element array */
		function fixSingleElementArray(fixer, parent) {
			if (parent.parent.type === "RestElement") {
				return fixRestInPattern(fixer, parent.parent);
			}

			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, parent);
			}

			return fixVariables(fixer, parent);
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

		/** Fixes rest in object pattern */
		function fixRestInObjectPattern(fixer, id, parent) {
			if (parent.parent.properties.length === 1) {
				return fixVariables(fixer, parent.parent);
			}

			return fixer.removeRange([
				sourceCode.getTokenBefore(id, 1).range[0],
				id.range[1],
			]);
		}

		/** Fixes rest in function */
		function fixRestInFunction(fixer, id, parent) {
			if (parent.parent.params.length === 1) {
				return fixer.removeRange(parent.range);
			}

			return fixer.removeRange([
				sourceCode.getTokenBefore(parent).range[0],
				parent.range[1],
			]);
		}

		/** Fixes assignment pattern */
		function fixAssignmentPattern(fixer, id, parent) {
			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, parent);
			}

			if (parent.parent.parent.type === "ObjectPattern") {
				return fixAssignmentInObjectPattern(fixer, parent);
			}

			if (astUtils.isFunction(parent.parent)) {
				return fixFunctionParameters(fixer, parent);
			}

			return null;
		}

		/** Fixes assignment in object pattern */
		function fixAssignmentInObjectPattern(fixer, parent) {
			if (parent.parent.parent.properties.length === 1) {
				if (parent.parent.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent.parent.parent);
				}

				return fixVariables(fixer, parent.parent.parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(parent.parent);

			if (tokenBefore.value === "{" &&
				sourceCode.getTokenAfter(parent.parent).value === ",") {
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

		/** Fixes object pattern or default case */
		function fixObjectPatternOrDefault(fixer, id, parent, parentType) {
			if (parent.parent.type === "ObjectPattern") {
				return fixObjectPattern(fixer, id, parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(id);

			if (tokenBefore?.value === ",") {
				return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
			}

			const tokenAfter = sourceCode.getTokenAfter(id);

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

		/** Fixes object pattern */
		function fixObjectPattern(fixer, id, parent) {
			if (parent.parent.properties.length === 1) {
				return fixSingleObjectProperty(fixer, parent);
			}

			const tokenBefore = sourceCode.getTokenBefore(id);

			if (tokenBefore.value === ":") {
				return fixObjectPropertyWithColon(fixer, parent);
			}

			return null;
		}

		/** Fixes single object property */
		function fixSingleObjectProperty(fixer, parent) {
			if (parent.parent.parent.type === "RestElement") {
				return fixRestInPattern(fixer, parent.parent.parent);
			}

			if (parent.parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, parent.parent);
			}

			return fixVariables(fixer, parent.parent);
		}

		/** Fixes object property with colon */
		function fixObjectPropertyWithColon(fixer, parent) {
			const tokenBefore = sourceCode.getTokenBefore(parent);

			if (tokenBefore.value === "{" &&
				sourceCode.getTokenAfter(parent).value === ",") {
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

		/** Fixes function parameters */
		function fixFunctionParameters(fixer, node) {
			const parent = node.parent;

			if (!astUtils.isFunction(parent)) {
				return null;
			}

			if (parent.params.length === 1) {
				return fixer.removeRange(node.range);
			}

			const tokenBefore = sourceCode.getTokenBefore(node);

			if (tokenBefore.value === "(") {
				return fixer.removeRange([
					node.range[0],
					sourceCode.getTokenAfter(node).range[1],
				]);
			}

			return fixer.removeRange([
				tokenBefore.range[0],
				node.range[1],
			]);
		}

		/** Fixes variables */
		function fixVariables(fixer, node) {
			const parent = node.parent;

			if (parent.type === "VariableDeclarator") {
				return fixVariableDeclarator(fixer, node, parent);
			}

			if (sourceCode.getTokenBefore(node).value === ":") {
				if (parent.parent.type === "ObjectPattern") {
					return fixObjectWithValueSeparator(fixer, node);
				}
			}

			return fixFunctionParameters(fixer, node);
		}

		/** Fixes nested object variable */
		function fixNestedObjectVariable(fixer, node) {
			const parent = node.parent;

			if (parent.parent.parent.parent.type === "ObjectPattern" &&
				parent.parent.properties.length === 1) {
				return fixNestedObjectVariable(fixer, parent.parent);
			}

			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(fixer, parent.parent);
				}

				const tokenBefore = sourceCode.getTokenBefore(parent);

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

			return null;
		}

		/** Fixes nested array variable */
		function fixNestedArrayVariable(fixer, node) {
			const parent = node.parent;

			if (parent.parent.type === "ArrayPattern" &&
				hasSingleElement(parent)) {
				return fixNestedArrayVariable(fixer, parent);
			}

			if (hasSingleElement(parent)) {
				const tokenBefore = sourceCode.getTokenBefore(parent);

				if (tokenBefore.value === ":") {
					return fixVariables(fixer, parent);
				}

				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent);
				}

				return fixVariables(fixer, parent);
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

		/** Fixes object with value separator */
		function fixObjectWithValueSeparator(fixer, node) {
			const parent = node.parent.parent;

			if (parent.parent.type === "ArrayPattern" &&
				parent.properties.length === 1) {
				return fixNestedArrayVariable(fixer, parent);
			}

			return fixNestedObjectVariable(fixer, node);
		}

		/** Fixes rest in pattern */
		function fixRestInPattern(fixer, node) {
			const parent = node.parent;

			if (astUtils.isFunction(parent)) {
				if (parent.params.length === 1) {
					return fixer.removeRange(node.range);
				}

				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}

			if (parent.type === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent);
					}

					return fixVariables(fixer, parent);
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

		/** Reports unused variable */
		function reportUnusedVariable(unusedVar) {
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

		/** Reports global directive variable */
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
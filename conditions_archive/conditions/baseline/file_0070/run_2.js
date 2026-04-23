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
					{ enum: ["all", "local"] },
					{
						type: "object",
						properties: {
							vars: { enum: ["all", "local"] },
							varsIgnorePattern: { type: "string" },
							args: { enum: ["all", "after-used", "none"] },
							ignoreRestSiblings: { type: "boolean" },
							argsIgnorePattern: { type: "string" },
							caughtErrors: { enum: ["all", "none"] },
							caughtErrorsIgnorePattern: { type: "string" },
							destructuredArrayIgnorePattern: { type: "string" },
							ignoreClassWithStaticInitBlock: { type: "boolean" },
							ignoreUsingDeclarations: { type: "boolean" },
							reportUsedIgnorePattern: { type: "boolean" },
						},
						additionalProperties: false,
					},
				],
			},
		],
		messages: {
			unusedVar: "'{{varName}}' is {{action}} but never used{{additional}}.",
			usedIgnoredVar: "'{{varName}}' is marked as ignored but is used{{additional}}.",
			removeVar: "Remove unused variable '{{varName}}'.",
		},
	},

	create(context) {
		const sourceCode = context.sourceCode;
		const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
		const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

		const config = initializeConfig(context.options[0]);

		function initializeConfig(firstOption) {
			const defaultConfig = {
				vars: "all",
				args: "after-used",
				ignoreRestSiblings: false,
				caughtErrors: "all",
				ignoreClassWithStaticInitBlock: false,
				ignoreUsingDeclarations: false,
				reportUsedIgnorePattern: false,
			};

			if (!firstOption) return defaultConfig;

			if (typeof firstOption === "string") {
				return { ...defaultConfig, vars: firstOption };
			}

			const result = { ...defaultConfig, ...firstOption };
			
			if (firstOption.varsIgnorePattern) {
				result.varsIgnorePattern = new RegExp(firstOption.varsIgnorePattern, "u");
			}
			if (firstOption.argsIgnorePattern) {
				result.argsIgnorePattern = new RegExp(firstOption.argsIgnorePattern, "u");
			}
			if (firstOption.caughtErrorsIgnorePattern) {
				result.caughtErrorsIgnorePattern = new RegExp(firstOption.caughtErrorsIgnorePattern, "u");
			}
			if (firstOption.destructuredArrayIgnorePattern) {
				result.destructuredArrayIgnorePattern = new RegExp(firstOption.destructuredArrayIgnorePattern, "u");
			}

			return result;
		}

		function defToVariableType(def) {
			if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
				return "array-destructure";
			}
			switch (def.type) {
				case "CatchClause": return "catch-clause";
				case "Parameter": return "parameter";
				default: return "variable";
			}
		}

		function getVariableDescription(variableType) {
			const typeMap = {
				"array-destructure": [config.destructuredArrayIgnorePattern, "elements of array destructuring"],
				"catch-clause": [config.caughtErrorsIgnorePattern, "caught errors"],
				"parameter": [config.argsIgnorePattern, "args"],
				"variable": [config.varsIgnorePattern, "vars"],
			};

			const [pattern, description] = typeMap[variableType] || (() => {
				throw new Error(`Unexpected variable type: ${variableType}`);
			})();

			return [description, pattern ? pattern.toString() : undefined];
		}

		function createMessageData(unusedVar, action) {
			const def = unusedVar.defs?.[0];
			let additionalMessageData = "";

			if (def) {
				const [variableDescription, pattern] = getVariableDescription(defToVariableType(def));
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

		function getUsedIgnoredMessageData(variable, variableType) {
			const [variableDescription, pattern] = getVariableDescription(variableType);
			let additionalMessageData = "";

			if (pattern && variableDescription) {
				additionalMessageData = `. Used ${variableDescription} must not match ${pattern}`;
			}

			return { varName: variable.name, additional: additionalMessageData };
		}

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

		function usesExplicitResourceManagement(variable) {
			const [definition] = variable.defs;
			return definition?.type === "Variable" && 
				(definition.parent.kind === "using" || definition.parent.kind === "await using");
		}

		function hasRestSibling(node) {
			return node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type);
		}

		function hasRestSpreadSibling(variable) {
			if (!config.ignoreRestSiblings) return false;

			return variable.defs.some(def => hasRestSibling(def.name.parent)) ||
				variable.references.some(ref => hasRestSibling(ref.identifier.parent));
		}

		function isReadRef(ref) {
			return ref.isRead();
		}

		function isSelfReference(ref, nodes) {
			let scope = ref.from;
			while (scope) {
				if (nodes.includes(scope.block)) return true;
				scope = scope.upper;
			}
			return false;
		}

		function getFunctionDefinitions(variable) {
			const functionDefinitions = [];
			variable.defs.forEach(def => {
				if (def.type === "FunctionName") {
					functionDefinitions.push(def.node);
				} else if (def.type === "Variable" && def.node.init &&
					(def.node.init.type === "FunctionExpression" || def.node.init.type === "ArrowFunctionExpression")) {
					functionDefinitions.push(def.node.init);
				}
			});
			return functionDefinitions;
		}

		function isInside(inner, outer) {
			return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
		}

		function isUnusedExpression(node) {
			const parent = node.parent;
			if (parent.type === "ExpressionStatement") return true;
			if (parent.type === "SequenceExpression") {
				return parent.expressions.at(-1) !== node || isUnusedExpression(parent);
			}
			return false;
		}

		function getRhsNode(ref, prevRhsNode) {
			const id = ref.identifier;
			const parent = id.parent;
			const refScope = ref.from.variableScope;
			const varScope = ref.resolved.scope.variableScope;
			const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

			if (prevRhsNode && isInside(id, prevRhsNode)) return prevRhsNode;

			if (parent.type === "AssignmentExpression" && isUnusedExpression(parent) &&
				id === parent.left && !canBeUsedLater) {
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

		function isInsideOfStorableFunction(id, rhsNode) {
			const funcNode = astUtils.getUpperFunction(id);
			return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
		}

		function isReadForItself(ref, rhsNode) {
			const id = ref.identifier;
			const parent = id.parent;

			return ref.isRead() && (
				(parent.type === "AssignmentExpression" && parent.left === id &&
					isUnusedExpression(parent) && !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
				(parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
				(rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode))
			);
		}

		function isForInOfRef(ref) {
			let target = ref.identifier.parent;
			if (target.type === "VariableDeclarator") {
				target = target.parent.parent;
			}
			if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") {
				return false;
			}

			target = target.body.type === "BlockStatement" ? target.body.body[0] : target.body;
			return target && target.type === "ReturnStatement";
		}

		function isUsedVariable(variable) {
			if (variable.eslintUsed) return true;

			const functionNodes = getFunctionDefinitions(variable);
			const isFunctionDefinition = functionNodes.length > 0;
			let rhsNode = null;

			return variable.references.some(ref => {
				if (isForInOfRef(ref)) return true;
				const forItself = isReadForItself(ref, rhsNode);
				rhsNode = getRhsNode(ref, rhsNode);
				return isReadRef(ref) && !forItself && !(isFunctionDefinition && isSelfReference(ref, functionNodes));
			});
		}

		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const posteriorParams = params.slice(params.indexOf(variable) + 1);
			return !posteriorParams.some(v => v.references.length > 0 || v.eslintUsed);
		}

		function shouldSkipVariable(variable, scope) {
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) return true;
			if (scope.functionExpressionScope) return true;
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;
			if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) return true;
			return false;
		}

		function checkVariableDefinition(variable, def, context) {
			const type = def.type;
			const refUsedInArrayPatterns = variable.references.some(ref => ref.identifier.parent.type === "ArrayPattern");

			// Array destructuring
			if ((def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(variable, "array-destructure"),
					});
				}
				return true;
			}

			// Class name
			if (type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(node => node.type === "StaticBlock");
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
			}

			// Catch clause
			if (type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
				if (config.caughtErrorsIgnorePattern && config.caughtErrorsIgnorePattern.test(def.name.name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(variable, "catch-clause"),
						});
					}
					return true;
				}
			} else if (type === "Parameter") {
				// Setter argument
				if ((def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set") return true;

				if (config.args === "none") return true;

				if (config.argsIgnorePattern && config.argsIgnorePattern.test(def.name.name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(variable, "parameter"),
						});
					}
					return true;
				}

				if (config.args === "after-used" && astUtils.isFunction(def.name.parent) &&
					!isAfterLastUsedArg(variable)) return true;
			} else {
				// Variable
				if (config.varsIgnorePattern && config.varsIgnorePattern.test(def.name.name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(variable, "variable"),
						});
					}
					return true;
				}
			}

			return false;
		}

		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (scope.type !== "global" || config.vars === "all") {
				for (let i = 0; i < variables.length; ++i) {
					const variable = variables[i];

					if (shouldSkipVariable(variable, scope)) continue;

					const def = variable.defs[0];
					if (def && checkVariableDefinition(variable, def, context)) continue;

					if (!isUsedVariable(variable) && !isExported(variable) &&
						!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
						!hasRestSpreadSibling(variable)) {
						unusedVars.push(variable);
					}
				}
			}

			for (let i = 0; i < childScopes.length; ++i) {
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
			const allWriteReferences = unusedVar.references.filter(ref => ref.isWrite());

			if (allWriteReferences.some(ref => ref.identifier.range[0] !== id.range[0])) {
				return null;
			}

			return applyFixStrategy(fixer, id, parent, parentType, tokenBefore, tokenAfter);
		}

		function applyFixStrategy(fixer, id, parent, parentType, tokenBefore, tokenAfter) {
			const fixStrategies = {
				VariableDeclarator: () => fixVariableDeclarator(fixer, id, parent, tokenBefore, tokenAfter),
				ObjectPattern: () => fixObjectPattern(fixer, id, parent, tokenBefore, tokenAfter),
				ArrayPattern: () => fixArrayPattern(fixer, id, parent, tokenBefore, tokenAfter),
				RestElement: () => fixRestElement(fixer, id, parent, tokenBefore, tokenAfter),
				AssignmentPattern: () => fixAssignmentPattern(fixer, id, parent, tokenBefore, tokenAfter),
				FunctionDeclaration: () => (parent.id === id ? fixer.removeRange(parent.range) : null),
				ImportDefaultSpecifier: () => fixImportDefaultSpecifier(fixer, id, parent, tokenAfter),
				ImportSpecifier: () => fixImportSpecifier(fixer, id, parent, tokenBefore, tokenAfter),
				ImportNamespaceSpecifier: () => fixImportNamespaceSpecifier(fixer, id, parent),
				CatchClause: () => null,
				ClassDeclaration: () => fixer.removeRange(parent.range),
			};

			const strategy = fixStrategies[parentType];
			if (strategy) return strategy();

			if (tokenBefore?.value === ",") {
				return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
			}

			if (tokenAfter?.value === ",") {
				if (tokenBefore.value === "(") {
					return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
				}
				if (tokenBefore.value === "{") {
					return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
				}
			}

			if (parentType === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfter?.value !== ")") {
				return fixer.replaceText(id, "()");
			}

			return fixer.removeRange(id.range);
		}

		function fixVariableDeclarator(fixer, id, parent, tokenBefore, tokenAfter) {
			if (parent.parent.declarations.length === 1) {
				if (astUtils.isLoop(parent.parent.parent) && parent.parent.parent.body !== parent.parent) {
					return null;
				}
				if (parent.parent.parent.type === "IfStatement" || astUtils.isLoop(parent.parent.parent) ||
					(parent.parent.parent.type === "WithStatement" && parent.parent.parent.body === parent.parent)) {
					return fixer.replaceText(parent.parent, ";");
				}

				const nextToken = sourceCode.getTokenAfter(parent.parent);
				const prevToken = sourceCode.getTokenBefore(parent.parent);
				if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) return null;
				return fixer.removeRange(parent.parent.range);
			}

			if (tokenBefore.value === ",") {
				return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
			}

			return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
		}

		function fixObjectPattern(fixer, id, parent, tokenBefore, tokenAfter) {
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
				if (sourceCode.getTokenBefore(parent).value === "{" && sourceCode.getTokenAfter(parent).value === ",") {
					return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], id.range[1]]);
			}
			return null;
		}

		function fixArrayPattern(fixer, id, parent, tokenBefore, tokenAfter) {
			const hasSingleElement = parent.elements.filter(e => e !== null).length === 1;

			if (hasSingleElement) {
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

		function fixRestElement(fixer, id, parent, tokenBefore, tokenAfter) {
			if (parent.parent.type === "ArrayPattern") {
				const hasSingleElement = parent.parent.elements.filter(e => e !== null).length === 1;
				if (hasSingleElement) {
					if (parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent.parent);
					}
					return fixVariables(fixer, parent.parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
			}

			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(fixer, parent.parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
			}

			if (astUtils.isFunction(parent.parent)) {
				if (parent.parent.params.length === 1) {
					return fixer.removeRange(parent.range);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
			}
			return null;
		}

		function fixAssignmentPattern(fixer, id, parent, tokenBefore, tokenAfter) {
			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, parent);
			}

			if (parent.parent.parent.type === "ObjectPattern") {
				if (parent.parent.parent.properties.length === 1) {
					if (parent.parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent.parent.parent);
					}
					return fixVariables(fixer, parent.parent.parent);
				}

				if (sourceCode.getTokenBefore(parent.parent).value === "{" &&
					sourceCode.getTokenAfter(parent.parent).value === ",") {
					return fixer.removeRange([parent.parent.range[0], sourceCode.getTokenAfter(parent.parent).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(parent.parent).range[0], parent.parent.range[1]]);
			}

			if (astUtils.isFunction(parent.parent)) {
				return fixFunctionParameters(fixer, parent);
			}
			return null;
		}

		function fixImportDefaultSpecifier(fixer, id, parent, tokenAfter) {
			const hasOtherImports = sourceCode.getScope(parent).variables.some(v => v.name !== id.name);
			if (!hasOtherImports) {
				return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
			}
			return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
		}

		function fixImportSpecifier(fixer, id, parent, tokenBefore, tokenAfter) {
			const specifierCount = parent.parent.specifiers.filter(e => e.type === "ImportSpecifier").length;

			if (specifierCount === 1) {
				const hasDefaultImport = parent.parent.specifiers.some(e => e.type === "ImportDefaultSpecifier");
				if (!hasDefaultImport) {
					return fixer.removeRange(parent.parent.range);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(parent, 1).range[0], tokenAfter.range[1]]);
			}

			if (sourceCode.getTokenBefore(parent).value === "{") {
				return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
			}

			return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
		}

		function fixImportNamespaceSpecifier(fixer, id, parent) {
			const hasDefaultImport = parent.parent.specifiers.some(e => e.type === "ImportDefaultSpecifier");
			if (hasDefaultImport) {
				return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
			}
			return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
		}

		function fixVariables(fixer, node) {
			const parent = node.parent;
			if (parent.type === "VariableDeclarator") {
				if (astUtils.isLoop(parent.parent.parent)) return null;
				if (parent.parent.declarations.length === 1) {
					const nextToken = sourceCode.getTokenAfter(parent.parent);
					const prevToken = sourceCode.getTokenBefore(parent.parent);
					if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) return null;
					return fixer.removeRange(parent.parent.range);
				}

				if (sourceCode.getTokenBefore(parent).value === ",") {
					return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
				}
				return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
			}
			return null;
		}

		function fixFunctionParameters(fixer, node) {
			const parentNode = node.parent;
			if (!astUtils.isFunction(parentNode)) return null;

			if (parentNode.params.length === 1) {
				return fixer.removeRange(node.range);
			}

			if (sourceCode.getTokenBefore(node).value === "(" && sourceCode.getTokenAfter(node).value === ",") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}

			return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
		}

		function fixNestedArrayVariable(fixer, node) {
			const parentNode = node.parent;
			const hasSingleElement = node.elements.filter(e => e !== null).length === 1;

			if (parentNode.type === "ArrayPattern" && hasSingleElement) {
				return fixNestedArrayVariable(fixer, parentNode);
			}

			if (hasSingleElement) {
				if (sourceCode.getTokenBefore(node).value === ":") {
					return fixVariables(fixer, node);
				}
				if (parentNode.type === "RestElement") {
					return fixRestInPattern(fixer, parentNode);
				}
				return fixVariables(fixer, node);
			}

			if (sourceCode.getTokenBefore(node.elements[0]).value === "," &&
				sourceCode.getTokenAfter(node.elements[0]).value === "]") {
				return fixer.removeRange([sourceCode.getTokenBefore(node.elements[0]).range[0], node.elements[0].range[1]]);
			}

			return null;
		}

		function fixNestedObjectVariable(fixer, node) {
			const parentNode = node.parent;

			if (parentNode.parent.parent.parent.type === "ObjectPattern" && parentNode.parent.properties.length === 1) {
				return fixNestedObjectVariable(fixer, parentNode.parent);
			}

			if (parentNode.parent.type === "ObjectPattern") {
				if (parentNode.parent.properties.length === 1) {
					return fixVariables(fixer, parentNode.parent);
				}

				if (sourceCode.getTokenBefore(parentNode).value === "{") {
					return fixer.removeRange([parentNode.range[0], sourceCode.getTokenAfter(parentNode).range[1]]);
				}

				return fixer.removeRange([sourceCode.getTokenBefore(parentNode).range[0], parentNode.range[1]]);
			}

			return null;
		}

		function fixRestInPattern(fixer, node) {
			const parentNode = node.parent;

			if (astUtils.isFunction(parentNode)) {
				if (parentNode.params.length === 1) {
					return fixer.removeRange(node.range);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}

			if (parentNode.type === "ArrayPattern") {
				const hasSingleElement = parentNode.elements.filter(e => e !== null).length === 1;
				if (hasSingleElement) {
					if (parentNode.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parentNode);
					}
					return fixVariables(fixer, parentNode);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}

			return null;
		}

		function isDeclarationNotSafeToRemove(nextToken, prevToken) {
			return nextToken.type === "String" ||
				(prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken));
		}

		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(sourceCode.getScope(programNode), []);

				for (let i = 0; i < unusedVars.length; ++i) {
					const unusedVar = unusedVars[i];

					if (unusedVar.defs.length > 0) {
						const writeReferences = unusedVar.references.filter(ref =>
							ref.isWrite() && ref.from.variableScope === unusedVar.scope.variableScope
						);

						const referenceToReport = writeReferences.length > 0 ? writeReferences.at(-1) : null;

						context.report({
							node: referenceToReport ? referenceToReport.identifier : unusedVar.identifiers[0],
							messageId: "unusedVar",
							data: unusedVar.references.some(ref => ref.isWrite()) ?
								createMessageData(unusedVar, "assigned a value") :
								createMessageData(unusedVar, "defined"),
							suggest: [{
								messageId: "removeVar",
								data: { varName: unusedVar.name },
								fix(fixer) {
									return handleFixes(fixer, unusedVar);
								},
							}],
						});
					} else if (unusedVar.eslintExplicitGlobalComments) {
						const directiveComment = unusedVar.eslintExplicitGlobalComments[0];
						context.report({
							node: programNode,
							loc: astUtils.getNameLocationInGlobalDirectiveComment(sourceCode, directiveComment, unusedVar.name),
							messageId: "unusedVar",
							data: createMessageData(unusedVar, "defined"),
						});
					}
				}
			},
		};
	},
};
```
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

		// ========== Configuration Initialization ==========

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

			return mergeConfigOptions(defaultConfig, firstOption);
		}

		function mergeConfigOptions(defaultConfig, userConfig) {
			const merged = { ...defaultConfig };

			merged.vars = userConfig.vars || merged.vars;
			merged.args = userConfig.args || merged.args;
			merged.ignoreRestSiblings =
				userConfig.ignoreRestSiblings || merged.ignoreRestSiblings;
			merged.caughtErrors =
				userConfig.caughtErrors || merged.caughtErrors;
			merged.ignoreClassWithStaticInitBlock =
				userConfig.ignoreClassWithStaticInitBlock ||
				merged.ignoreClassWithStaticInitBlock;
			merged.ignoreUsingDeclarations =
				userConfig.ignoreUsingDeclarations ||
				merged.ignoreUsingDeclarations;
			merged.reportUsedIgnorePattern =
				userConfig.reportUsedIgnorePattern ||
				merged.reportUsedIgnorePattern;

			if (userConfig.varsIgnorePattern) {
				merged.varsIgnorePattern = new RegExp(
					userConfig.varsIgnorePattern,
					"u",
				);
			}

			if (userConfig.argsIgnorePattern) {
				merged.argsIgnorePattern = new RegExp(
					userConfig.argsIgnorePattern,
					"u",
				);
			}

			if (userConfig.caughtErrorsIgnorePattern) {
				merged.caughtErrorsIgnorePattern = new RegExp(
					userConfig.caughtErrorsIgnorePattern,
					"u",
				);
			}

			if (userConfig.destructuredArrayIgnorePattern) {
				merged.destructuredArrayIgnorePattern = new RegExp(
					userConfig.destructuredArrayIgnorePattern,
					"u",
				);
			}

			return merged;
		}

		// ========== Variable Type and Description ==========

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

		// ========== Message Data Generation ==========

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

		// ========== Variable Usage Checks ==========

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

		// ========== Variable Collection and Filtering ==========

		function shouldSkipVariable(variable, scope, def) {
			// Skip class name in class scope
			if (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
			) {
				return true;
			}

			// Skip function expression names
			if (scope.functionExpressionScope) {
				return true;
			}

			// Skip variables marked with markVariableAsUsed()
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
				return true;
			}

			// Skip implicit "arguments" variable
			if (
				scope.type === "function" &&
				variable.name === "arguments" &&
				variable.identifiers.length === 0
			) {
				return true;
			}

			return false;
		}

		function checkIgnoredPattern(variable, def, variableType) {
			const [, pattern] = getVariableDescription(variableType);

			if (!pattern) {
				return false;
			}

			const patternRegex = config[
				variableType === "array-destructure"
					? "destructuredArrayIgnorePattern"
					: variableType === "catch-clause"
						? "caughtErrorsIgnorePattern"
						: variableType === "parameter"
							? "argsIgnorePattern"
							: "varsIgnorePattern"
			];

			if (patternRegex && patternRegex.test(def.name.name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
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

		function checkClassWithStaticBlock(def) {
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

		function checkCatchClauseVariable(variable, def) {
			if (def.type !== "CatchClause") {
				return false;
			}

			if (config.caughtErrors === "none") {
				return true;
			}

			return checkIgnoredPattern(variable, def, "catch-clause");
		}

		function checkParameterVariable(variable, def) {
			if (def.type !== "Parameter") {
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

			// Skip if args option is "none"
			if (config.args === "none") {
				return true;
			}

			// Check ignore pattern
			if (checkIgnoredPattern(variable, def, "parameter")) {
				return true;
			}

			// Skip if args option is "after-used"
			if (
				config.args === "after-used" &&
				astUtils.isFunction(def.name.parent) &&
				!isAfterLastUsedArg(variable)
			) {
				return true;
			}

			return false;
		}

		function checkRegularVariable(variable, def) {
			return checkIgnoredPattern(variable, def, "variable");
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

			if (checkClassWithStaticBlock(def)) {
				return false;
			}

			if (checkCatchClauseVariable(variable, def)) {
				return false;
			}

			if (checkParameterVariable(variable, def)) {
				return false;
			}

			if (checkRegularVariable(variable, def)) {
				return false;
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
				return true;
			}

			return false;
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

		// ========== Fix Handlers ==========

		function createFixHandler(fixer, unusedVar, sourceCode) {
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

			return new FixHandler(
				fixer,
				id,
				parent,
				parentType,
				tokenBefore,
				tokenAfter,
				sourceCode,
			).fix();
		}

		class FixHandler {
			constructor(
				fixer,
				id,
				parent,
				parentType,
				tokenBefore,
				tokenAfter,
				sourceCode,
			) {
				this.fixer = fixer;
				this.id = id;
				this.parent = parent;
				this.parentType = parentType;
				this.tokenBefore = tokenBefore;
				this.tokenAfter = tokenAfter;
				this.sourceCode = sourceCode;
			}

			getPreviousTokenStart(node, skips) {
				return this.sourceCode.getTokenBefore(node, skips).range[0];
			}

			getNextTokenEnd(node, skips) {
				return this.sourceCode.getTokenAfter(node, skips).range[1];
			}

			getTokenBeforeValue(node) {
				return this.sourceCode.getTokenBefore(node).value;
			}

			getTokenAfterValue(node) {
				return this.sourceCode.getTokenAfter(node).value;
			}

			hasSingleElement(node) {
				return node.elements.filter(e => e !== null).length === 1;
			}

			hasImportOfCertainType(node, type) {
				return node.specifiers.some(e => e.type === type);
			}

			isDeclarationNotSafeToRemove(nextToken, prevToken) {
				return (
					nextToken.type === "String" ||
					(prevToken &&
						!astUtils.isSemicolonToken(prevToken) &&
						!astUtils.isOpeningBraceToken(prevToken))
				);
			}

			fixFunctionParameters(node) {
				const parentNode = node.parent;

				if (!astUtils.isFunction(parentNode)) {
					return null;
				}

				if (parentNode.params.length === 1) {
					return this.fixer.removeRange(node.range);
				}

				if (
					this.getTokenBeforeValue(node) === "(" &&
					this.getTokenAfterValue(node) === ","
				) {
					return this.fixer.removeRange([
						node.range[0],
						this.getNextTokenEnd(node),
					]);
				}

				return this.fixer.removeRange([
					this.getPreviousTokenStart(node),
					node.range[1],
				]);
			}

			fixVariableDeclarator() {
				const parentNode = this.parent.parent;

				if (astUtils.isLoop(parentNode.parent)) {
					return null;
				}

				if (parentNode.declarations.length === 1) {
					const nextToken = this.sourceCode.getTokenAfter(parentNode);
					const prevToken = this.sourceCode.getTokenBefore(parentNode);

					if (
						nextToken &&
						this.isDeclarationNotSafeToRemove(nextToken, prevToken)
					) {
						return null;
					}

					return this.fixer.removeRange(parentNode.range);
				}

				if (this.getTokenBeforeValue(this.parent) === ",") {
					return this.fixer.removeRange([
						this.getPreviousTokenStart(this.parent),
						this.parent.range[1],
					]);
				}

				return this.fixer.removeRange([
					this.parent.range[0],
					this.getNextTokenEnd(this.parent),
				]);
			}

			fixNestedObjectVariable(node) {
				const parentNode = node.parent;

				if (
					parentNode.parent.parent.parent.type === "ObjectPattern" &&
					parentNode.parent.properties.length === 1
				) {
					return this.fixNestedObjectVariable(parentNode.parent);
				}

				if (parentNode.parent.type === "ObjectPattern") {
					if (parentNode.parent.properties.length === 1) {
						return this.fixVariables(parentNode.parent);
					}

					if (this.getTokenBeforeValue(parentNode) === "{") {
						return this.fixer.removeRange([
							parentNode.range[0],
							this.getNextTokenEnd(parentNode),
						]);
					}

					return this.fixer.removeRange([
						this.getPreviousTokenStart(parentNode),
						parentNode.range[1],
					]);
				}

				return null;
			}

			fixNestedArrayVariable(node) {
				const parentNode = node.parent;

				if (
					parentNode.parent.type === "ArrayPattern" &&
					this.hasSingleElement(parentNode)
				) {
					return this.fixNestedArrayVariable(parentNode);
				}

				if (this.hasSingleElement(parentNode)) {
					if (this.getTokenBeforeValue(parentNode) === ":") {
						return this.fixVariables(parentNode);
					}

					if (parentNode.parent.type === "RestElement") {
						return this.fixRestInPattern(parentNode.parent);
					}

					return this.fixVariables(parentNode);
				}

				if (
					this.getTokenBeforeValue(node) === "," &&
					this.getTokenAfterValue(node) === "]"
				) {
					return this.fixer.removeRange([
						this.getPreviousTokenStart(node),
						node.range[1],
					]);
				}

				return this.fixer.removeRange(node.range);
			}

			fixObjectWithValueSeparator(node) {
				const parentNode = node.parent.parent;

				if (
					parentNode.parent.type === "ArrayPattern" &&
					parentNode.properties.length === 1
				) {
					return this.fixNestedArrayVariable(parentNode);
				}

				return this.fixNestedObjectVariable(node);
			}

			fixRestInPattern(node) {
				const parentNode = node.parent;

				if (astUtils.isFunction(parentNode)) {
					if (parentNode.params.length === 1) {
						return this.fixer.removeRange(node.range);
					}

					return this.fixer.removeRange([
						this.getPreviousTokenStart(node),
						node.range[1],
					]);
				}

				if (parentNode.type === "ArrayPattern") {
					if (this.hasSingleElement(parentNode)) {
						if (parentNode.parent.type === "ArrayPattern") {
							return this.fixNestedArrayVariable(parentNode);
						}

						return this.fixVariables(parentNode);
					}

					return this.fixer.removeRange([
						this.getPreviousTokenStart(node),
						node.range[1],
					]);
				}

				return null;
			}

			fixVariables(node) {
				const parentNode = node.parent;

				if (parentNode.type === "VariableDeclarator") {
					if (astUtils.isLoop(parentNode.parent.parent)) {
						return null;
					}

					if (parentNode.parent.declarations.length === 1) {
						const nextToken = this.sourceCode.getTokenAfter(
							parentNode.parent,
						);
						const prevToken = this.sourceCode.getTokenBefore(
							parentNode.parent,
						);

						if (
							nextToken &&
							this.isDeclarationNotSafeToRemove(nextToken, prevToken)
						) {
							return null;
						}

						return this.fixer.removeRange(parentNode.parent.range);
					}

					if (this.getTokenBeforeValue(parentNode) === ",") {
						return this.fixer.removeRange([
							this.getPreviousTokenStart(parentNode),
							parentNode.range[1],
						]);
					}

					return this.fixer.removeRange([
						parentNode.range[0],
						this.getNextTokenEnd(parentNode),
					]);
				}

				if (this.getTokenBeforeValue(node) === ":") {
					if (parentNode.parent.type === "ObjectPattern") {
						return this.fixObjectWithValueSeparator(node);
					}
				}

				return this.fixFunctionParameters(node);
			}

			fixImportSpecifier() {
				const specifierCount = this.parent.parent.specifiers.filter(
					e => e.type === "ImportSpecifier",
				).length;

				if (specifierCount === 1) {
					if (
						!this.hasImportOfCertainType(
							this.parent.parent,
							"ImportDefaultSpecifier",
						)
					) {
						return this.fixer.removeRange(this.parent.parent.range);
					}

					return this.fixer.removeRange([
						this.getPreviousTokenStart(this.parent, 1),
						this.tokenAfter.range[1],
					]);
				}

				if (this.getTokenBeforeValue(this.parent) === "{") {
					return this.fixer.removeRange([
						this.parent.range[0],
						this.getNextTokenEnd(this.parent),
					]);
				}

				return this.fixer.removeRange([
					this.getPreviousTokenStart(this.parent),
					this.parent.range[1],
				]);
			}

			fix() {
				if (this.parentType === "VariableDeclarator") {
					return this.fixVariableDeclarator();
				}

				if (this.parent.parent.type === "ObjectPattern") {
					if (this.parent.parent.properties.length === 1) {
						if (this.parent.parent.parent.type === "RestElement") {
							return this.fixRestInPattern(
								this.parent.parent.parent,
							);
						}

						if (this.parent.parent.parent.type === "ArrayPattern") {
							return this.fixNestedArrayVariable(
								this.parent.parent,
							);
						}

						return this.fixVariables(this.parent.parent);
					}

					if (this.tokenBefore.value === ":") {
						if (
							this.getTokenBeforeValue(this.parent) === "{" &&
							this.getTokenAfterValue(this.parent) === ","
						) {
							return this.fixer.removeRange([
								this.parent.range[0],
								this.getNextTokenEnd(this.parent),
							]);
						}

						return this.fixer.removeRange([
							this.getPreviousTokenStart(this.parent),
							this.id.range[1],
						]);
					}
				}

				if (this.parentType === "ArrayPattern") {
					if (this.hasSingleElement(this.parent)) {
						if (this.parent.parent.type === "RestElement") {
							return this.fixRestInPattern(this.parent.parent);
						}

						if (this.parent.parent.type === "ArrayPattern") {
							return this.fixNestedArrayVariable(this.parent);
						}

						return this.fixVariables(this.parent);
					}

					if (
						this.tokenBefore.value === "," &&
						this.tokenAfter.value === ","
					) {
						return this.fixer.removeRange(this.id.range);
					}
				}

				if (this.parentType === "RestElement") {
					if (this.parent.parent.type === "ArrayPattern") {
						if (this.hasSingleElement(this.parent.parent)) {
							if (
								this.parent.parent.parent.type === "ArrayPattern"
							) {
								return this.fixNestedArrayVariable(
									this.parent.parent,
								);
							}

							return this.fixVariables(this.parent.parent);
						}

						return this.fixer.removeRange([
							this.getPreviousTokenStart(this.id, 1),
							this.id.range[1],
						]);
					}

					if (this.parent.parent.type === "ObjectPattern") {
						if (this.parent.parent.properties.length === 1) {
							return this.fixVariables(this.parent.parent);
						}

						return this.fixer.removeRange([
							this.getPreviousTokenStart(this.id, 1),
							this.id.range[1],
						]);
					}

					if (astUtils.isFunction(this.parent.parent)) {
						if (this.parent.parent.params.length === 1) {
							return this.fixer.removeRange(this.parent.range);
						}

						return this.fixer.removeRange([
							this.getPreviousTokenStart(this.parent),
							this.parent.range[1],
						]);
					}
				}

				if (this.parentType === "AssignmentPattern") {
					if (this.parent.parent.type === "ArrayPattern") {
						return this.fixNestedArrayVariable(this.parent);
					}

					if (this.parent.parent.parent.type === "ObjectPattern") {
						if (
							this.parent.parent.parent.properties.length === 1
						) {
							if (
								this.parent.parent.parent.parent.type ===
								"ArrayPattern"
							) {
								return this.fixNestedArrayVariable(
									this.parent.parent.parent,
								);
							}

							return this.fixVariables(this.parent.parent.parent);
						}

						if (
							this.getTokenBeforeValue(this.parent.parent) ===
							"{" &&
							this.getTokenAfterValue(this.parent.parent) === ","
						) {
							return this.fixer.removeRange([
								this.parent.parent.range[0],
								this.getNextTokenEnd(this.parent.parent),
							]);
						}

						return this.fixer.removeRange([
							this.getPreviousTokenStart(this.parent.parent),
							this.parent.parent.range[1],
						]);
					}

					if (astUtils.isFunction(this.parent.parent)) {
						return this.fixFunctionParameters(this.parent);
					}
				}

				if (
					this.parentType === "FunctionDeclaration" &&
					this.parent.id === this.id
				) {
					return this.fixer.removeRange(this.parent.range);
				}

				if (this.parentType === "ImportDefaultSpecifier") {
					if (
						!this.hasImportOfCertainType(
							this.parent.parent,
							"ImportSpecifier",
						) &&
						!this.hasImportOfCertainType(
							this.parent.parent,
							"ImportNamespaceSpecifier",
						)
					) {
						return this.fixer.removeRange([
							this.parent.range[0],
							this.parent.parent.source.range[0],
						]);
					}

					return this.fixer.removeRange([
						this.id.range[0],
						this.tokenAfter.range[1],
					]);
				}

				if (this.parentType === "ImportSpecifier") {
					return this.fixImportSpecifier();
				}

				if (this.parentType === "ImportNamespaceSpecifier") {
					if (
						this.hasImportOfCertainType(
							this.parent.parent,
							"ImportDefaultSpecifier",
						)
					) {
						return this.fixer.removeRange([
							this.getPreviousTokenStart(this.parent),
							this.parent.range[1],
						]);
					}

					return this.fixer.removeRange([
						this.parent.range[0],
						this.parent.parent.source.range[0],
					]);
				}

				if (this.parentType === "CatchClause") {
					return null;
				}

				if (this.parentType === "ClassDeclaration") {
					return this.fixer.removeRange(this.parent.range);
				}

				if (this.tokenBefore?.value === ",") {
					return this.fixer.removeRange([
						this.tokenBefore.range[0],
						this.id.range[1],
					]);
				}

				if (this.tokenAfter.value === ",") {
					if (this.tokenBefore.value === "(") {
						return this.fixer.removeRange([
							this.id.range[0],
							this.tokenAfter.range[1],
						]);
					}

					if (this.tokenBefore.value === "{") {
						return this.fixer.removeRange([
							this.id.range[0],
							this.tokenAfter.range[1],
						]);
					}
				}

				if (
					this.parentType === "ArrowFunctionExpression" &&
					this.parent.params.length === 1 &&
					this.tokenAfter?.value !== ")"
				) {
					return this.fixer.replaceText(this.id, "()");
				}

				return this.fixer.removeRange(this.id.range);
			}
		}

		// ========== Main Report Handler ==========

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
										return createFixHandler(
											fixer,
											unusedVar,
											sourceCode,
										);
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
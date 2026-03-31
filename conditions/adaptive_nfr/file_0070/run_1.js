```javascript
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

		// ========== Configuration Helpers ==========

		function initializeConfig(firstOption) {
			const defaults = {
				vars: "all",
				args: "after-used",
				ignoreRestSiblings: false,
				caughtErrors: "all",
				ignoreClassWithStaticInitBlock: false,
				ignoreUsingDeclarations: false,
				reportUsedIgnorePattern: false,
			};

			if (!firstOption) return defaults;

			if (typeof firstOption === "string") {
				return { ...defaults, vars: firstOption };
			}

			return {
				...defaults,
				...firstOption,
				varsIgnorePattern: compilePattern(firstOption.varsIgnorePattern),
				argsIgnorePattern: compilePattern(firstOption.argsIgnorePattern),
				caughtErrorsIgnorePattern: compilePattern(
					firstOption.caughtErrorsIgnorePattern,
				),
				destructuredArrayIgnorePattern: compilePattern(
					firstOption.destructuredArrayIgnorePattern,
				),
			};
		}

		function compilePattern(pattern) {
			return pattern ? new RegExp(pattern, "u") : undefined;
		}

		// ========== Variable Type Helpers ==========

		function defToVariableType(def) {
			if (
				config.destructuredArrayIgnorePattern &&
				def.name.parent.type === "ArrayPattern"
			) {
				return "array-destructure";
			}

			const typeMap = {
				CatchClause: "catch-clause",
				Parameter: "parameter",
			};

			return typeMap[def.type] || "variable";
		}

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

			return [
				typeInfo.description,
				typeInfo.pattern ? typeInfo.pattern.toString() : undefined,
			];
		}

		function buildMessageData(unusedVar, action) {
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

		function isExported(variable) {
			const definition = variable.defs[0];
			if (!definition) return false;

			let node = definition.node;
			if (node.type === "VariableDeclarator") {
				node = node.parent;
			} else if (definition.type === "Parameter") {
				return false;
			}

			return node.parent.type.startsWith("Export");
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
			if (!config.ignoreRestSiblings) return false;

			return (
				variable.defs.some(def => hasRestSibling(def.name.parent)) ||
				variable.references.some(ref =>
					hasRestSibling(ref.identifier.parent),
				)
			);
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

		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] &&
				inner.range[1] <= outer.range[1]
			);
		}

		function isUnusedExpression(node) {
			const parent = node.parent;

			if (parent.type === "ExpressionStatement") return true;

			if (parent.type === "SequenceExpression") {
				const isLastExpression = parent.expressions.at(-1) === node;
				return !isLastExpression || isUnusedExpression(parent);
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

			target =
				target.body.type === "BlockStatement"
					? target.body.body[0]
					: target.body;

			return target?.type === "ReturnStatement";
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

		// ========== Variable Collection ==========

		function shouldSkipVariable(variable, scope, def) {
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
				return true;
			}

			if (scope.functionExpressionScope) return true;

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

		function checkIgnorePattern(variable, def, type) {
			const [description, pattern] = getVariableDescription(type);
			const patternToCheck = {
				"array-destructure": config.destructuredArrayIgnorePattern,
				"catch-clause": config.caughtErrorsIgnorePattern,
				parameter: config.argsIgnorePattern,
				variable: config.varsIgnorePattern,
			}[type];

			if (patternToCheck?.test(def.name.name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(variable, type),
					});
				}
				return true;
			}

			return false;
		}

		function checkVariableDefinition(variable, def) {
			const type = def.type;
			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

			// Array destructuring
			if (
				(def.name.parent.type === "ArrayPattern" ||
					refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern
			) {
				return checkIgnorePattern(variable, def, "array-destructure");
			}

			// Class name
			if (type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(
					node => node.type === "StaticBlock",
				);
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
					return true;
				}
			}

			// Catch clause
			if (type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
				return checkIgnorePattern(variable, def, "catch-clause");
			}

			// Parameter
			if (type === "Parameter") {
				if (
					(def.node.parent.type === "Property" ||
						def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set"
				) {
					return true;
				}

				if (config.args === "none") return true;

				if (checkIgnorePattern(variable, def, "parameter")) return true;

				if (
					config.args === "after-used" &&
					astUtils.isFunction(def.name.parent) &&
					!isAfterLastUsedArg(variable)
				) {
					return true;
				}
			} else {
				// Variable
				if (checkIgnorePattern(variable, def, "variable")) return true;
			}

			return false;
		}

		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (scope
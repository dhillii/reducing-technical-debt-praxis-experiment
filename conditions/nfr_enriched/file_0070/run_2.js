```javascript
"use strict";

const astUtils = require("./utils/ast-utils");

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

const DEFAULT_CONFIG = {
	vars: "all",
	args: "after-used",
	ignoreRestSiblings: false,
	caughtErrors: "all",
	ignoreClassWithStaticInitBlock: false,
	ignoreUsingDeclarations: false,
	reportUsedIgnorePattern: false,
};

const VARIABLE_TYPE_MAP = {
	"array-destructure": {
		configKey: "destructuredArrayIgnorePattern",
		description: "elements of array destructuring",
	},
	"catch-clause": {
		configKey: "caughtErrorsIgnorePattern",
		description: "caught errors",
	},
	parameter: {
		configKey: "argsIgnorePattern",
		description: "args",
	},
	variable: {
		configKey: "varsIgnorePattern",
		description: "vars",
	},
};

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
		const config = parseConfig(context.options[0]);

		function parseConfig(firstOption) {
			const result = { ...DEFAULT_CONFIG };

			if (!firstOption) return result;

			if (typeof firstOption === "string") {
				result.vars = firstOption;
				return result;
			}

			Object.assign(result, {
				vars: firstOption.vars || result.vars,
				args: firstOption.args || result.args,
				ignoreRestSiblings: firstOption.ignoreRestSiblings || result.ignoreRestSiblings,
				caughtErrors: firstOption.caughtErrors || result.caughtErrors,
				ignoreClassWithStaticInitBlock:
					firstOption.ignoreClassWithStaticInitBlock || result.ignoreClassWithStaticInitBlock,
				ignoreUsingDeclarations: firstOption.ignoreUsingDeclarations || result.ignoreUsingDeclarations,
				reportUsedIgnorePattern: firstOption.reportUsedIgnorePattern || result.reportUsedIgnorePattern,
			});

			const patternKeys = [
				"varsIgnorePattern",
				"argsIgnorePattern",
				"caughtErrorsIgnorePattern",
				"destructuredArrayIgnorePattern",
			];

			patternKeys.forEach(key => {
				if (firstOption[key]) {
					result[key] = new RegExp(firstOption[key], "u");
				}
			});

			return result;
		}

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
			const typeInfo = VARIABLE_TYPE_MAP[variableType];
			if (!typeInfo) {
				throw new Error(`Unexpected variable type: ${variableType}`);
			}

			const pattern = config[typeInfo.configKey];
			return [typeInfo.description, pattern ? pattern.toString() : undefined];
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

		function getDefinedMessageData(unusedVar) {
			return buildMessageData(unusedVar, "defined");
		}

		function getAssignedMessageData(unusedVar) {
			return buildMessageData(unusedVar, "assigned a value");
		}

		function getUsedIgnoredMessageData(variable, variableType) {
			const [variableDescription, pattern] = getVariableDescription(variableType);
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
				(definition.parent.kind === "using" || definition.parent.kind === "await using")
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
				variable.references.some(ref => hasRestSibling(ref.identifier.parent))
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
			return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
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
			const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

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
					(parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
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

			if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") {
				return false;
			}

			target = target.body.type === "BlockStatement" ? target.body.body[0] : target.body;

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
					!(isFunctionDefinition && isSelfReference(ref, functionNodes))
				);
			});
		}

		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const posteriorParams = params.slice(params.indexOf(variable) + 1);

			return !posteriorParams.some(v => v.references.length > 0 || v.eslintUsed);
		}

		function shouldSkipVariable(variable, scope) {
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
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

			return false;
		}

		function checkIgnorePattern(variable, def, variableType) {
			const typeInfo = VARIABLE_TYPE_MAP[variableType];
			const pattern = config[typeInfo.configKey];

			if (!pattern || !pattern.test(def.name.name)) return false;

			if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
				context.report({
					node: def.name,
					messageId: "usedIgnoredVar",
					data: getUsedIgnoredMessageData(variable, variableType),
				});
			}

			return true;
		}

		function checkArrayDestructure(variable, def) {
			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

			if (
				(def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern &&
				checkIgnorePattern(variable, def, "array-destructure")
			) {
				return true;
			}

			return false;
		}

		function checkClassName(def) {
			if (def.type !== "ClassName") return false;

			const hasStaticBlock = def.node.body.body.some(node => node.type === "StaticBlock");
			return config.ignoreClassWithStaticInitBlock && hasStaticBlock;
		}

		function checkCatchClause(variable, def) {
			if (def.type !== "CatchClause") return false;

			if (config.caughtErrors === "none") return true;

			return checkIgnorePattern(variable, def, "catch-clause");
		}

		function checkParameter(variable, def) {
			if (def.type !== "Parameter") return false;

			const parentNode = def.node.parent;
			if (
				(parentNode.type === "Property" || parentNode.type === "MethodDefinition") &&
				parentNode.kind === "set"
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

			return false;
		}

		function checkVariable(variable, def) {
			if (def.type !== "Variable") return
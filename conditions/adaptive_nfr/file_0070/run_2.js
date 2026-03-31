```javascript
/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

/**
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName
 * @property {'defined'|'assigned a value'} action
 * @property {string} additional
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName
 * @property {string} additional
 */

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

const VARIABLE_TYPE_CONFIG = {
	"array-destructure": {
		patternKey: "destructuredArrayIgnorePattern",
		description: "elements of array destructuring",
	},
	"catch-clause": {
		patternKey: "caughtErrorsIgnorePattern",
		description: "caught errors",
	},
	parameter: {
		patternKey: "argsIgnorePattern",
		description: "args",
	},
	variable: {
		patternKey: "varsIgnorePattern",
		description: "vars",
	},
};

const DEFAULT_CONFIG = {
	vars: "all",
	args: "after-used",
	ignoreRestSiblings: false,
	caughtErrors: "all",
	ignoreClassWithStaticInitBlock: false,
	ignoreUsingDeclarations: false,
	reportUsedIgnorePattern: false,
};

const PATTERN_OPTION_KEYS = [
	"varsIgnorePattern",
	"argsIgnorePattern",
	"caughtErrorsIgnorePattern",
	"destructuredArrayIgnorePattern",
];

const BOOLEAN_OPTION_KEYS = [
	"ignoreRestSiblings",
	"ignoreClassWithStaticInitBlock",
	"ignoreUsingDeclarations",
	"reportUsedIgnorePattern",
];

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
		const config = buildConfig(context.options[0]);

		//--------------------------------------------------------------------------
		// Config Helpers
		//--------------------------------------------------------------------------

		function buildConfig(firstOption) {
			const cfg = { ...DEFAULT_CONFIG };

			if (!firstOption) return cfg;

			if (typeof firstOption === "string") {
				cfg.vars = firstOption;
				return cfg;
			}

			cfg.vars = firstOption.vars || cfg.vars;
			cfg.args = firstOption.args || cfg.args;
			cfg.caughtErrors = firstOption.caughtErrors || cfg.caughtErrors;

			for (const key of BOOLEAN_OPTION_KEYS) {
				cfg[key] = firstOption[key] || cfg[key];
			}

			for (const key of PATTERN_OPTION_KEYS) {
				if (firstOption[key]) {
					cfg[key] = new RegExp(firstOption[key], "u");
				}
			}

			return cfg;
		}

		//--------------------------------------------------------------------------
		// Variable Type Helpers
		//--------------------------------------------------------------------------

		function defToVariableType(def) {
			if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
				return "array-destructure";
			}
			if (def.type === "CatchClause") return "catch-clause";
			if (def.type === "Parameter") return "parameter";
			return "variable";
		}

		function getVariableDescription(variableType) {
			const typeConfig = VARIABLE_TYPE_CONFIG[variableType];

			if (!typeConfig) {
				throw new Error(`Unexpected variable type: ${variableType}`);
			}

			const pattern = config[typeConfig.patternKey];
			return [typeConfig.description, pattern ? pattern.toString() : undefined];
		}

		function buildAdditionalMessage(variableDescription, pattern, verb) {
			if (pattern && variableDescription) {
				return `. ${verb} ${variableDescription} must ${verb === "Allowed unused" ? "match" : "not match"} ${pattern}`;
			}
			return "";
		}

		function getMessageDataForVar(unusedVar, action) {
			const def = unusedVar.defs?.[0];
			let additional = "";

			if (def) {
				const [variableDescription, pattern] = getVariableDescription(defToVariableType(def));
				additional = buildAdditionalMessage(variableDescription, pattern, "Allowed unused");
			}

			return { varName: unusedVar.name, action, additional };
		}

		function getDefinedMessageData(unusedVar) {
			return getMessageDataForVar(unusedVar, "defined");
		}

		function getAssignedMessageData(unusedVar) {
			return getMessageDataForVar(unusedVar, "assigned a value");
		}

		function getUsedIgnoredMessageData(variable, variableType) {
			const [variableDescription, pattern] = getVariableDescription(variableType);
			const additional = buildAdditionalMessage(variableDescription, pattern, "Used");
			return { varName: variable.name, additional };
		}

		//--------------------------------------------------------------------------
		// Variable Usage Helpers
		//--------------------------------------------------------------------------

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

			const hasRestSiblingDefinition = variable.defs.some(def => hasRestSibling(def.name.parent));
			const hasRestSiblingReference = variable.references.some(ref =>
				hasRestSibling(ref.identifier.parent),
			);

			return hasRestSiblingDefinition || hasRestSiblingReference;
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

			for (const def of variable.defs) {
				const { type, node } = def;

				if (type === "FunctionName") {
					functionDefinitions.push(node);
				}

				if (
					type === "Variable" &&
					node.init &&
					(node.init.type === "FunctionExpression" || node.init.type === "ArrowFunctionExpression")
				) {
					functionDefinitions.push(node.init);
				}
			}

			return functionDefinitions;
		}

		function isInside(inner, outer) {
			return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
		}

		function isUnusedExpression(node) {
			const parent = node.parent;

			if (parent.type === "ExpressionStatement") return true;

			if (parent.type === "SequenceExpression") {
				if (parent.expressions.at(-1) !== node) return true;
				return isUnusedExpression(parent);
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
			return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
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
					(rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)))
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

			return Boolean(target?.type === "ReturnStatement");
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

		//--------------------------------------------------------------------------
		// Unused Variable Collection
		//--------------------------------------------------------------------------

		function shouldSkipVariable(scope, variable) {
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) return true;
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

		function reportUsedIgnoredIfNeeded(variable, variableType, defName) {
			if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
				context.report({
					node: defName,
					messageId: "usedIgnoredVar",
					data: getUsedIgnoredMessageData(variable, variableType),
				});
			}
		}

		function checkIgnorePatternAndReport(variable, def) {
			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern",
			);

			if (
				(def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern?.test(def.name.name)
			) {
				reportUsedIgnoredIfNeeded(variable, "array-destructure", def.name);
				return true;
			}

			if (def.type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(node => node.type === "StaticBlock");
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
			}

			if (def.type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
				if (config.caughtErrorsIgnorePattern?.test(def.name.name)) {
					reportUsedIgnoredIfNeeded(variable, "catch-clause", def.name);
					return true;
				}
			} else if (def.type === "
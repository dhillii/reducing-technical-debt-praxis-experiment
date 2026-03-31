```javascript
"use strict";

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Constants & Helpers
//------------------------------------------------------------------------------

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

const VARIABLE_TYPE = {
	ARRAY_DESTRUCTURE: "array-destructure",
	CATCH_CLAUSE: "catch-clause",
	PARAMETER: "parameter",
	VARIABLE: "variable",
};

const VARIABLE_TYPE_META = {
	[VARIABLE_TYPE.ARRAY_DESTRUCTURE]: {
		description: "elements of array destructuring",
		configKey: "destructuredArrayIgnorePattern",
	},
	[VARIABLE_TYPE.CATCH_CLAUSE]: {
		description: "caught errors",
		configKey: "caughtErrorsIgnorePattern",
	},
	[VARIABLE_TYPE.PARAMETER]: {
		description: "args",
		configKey: "argsIgnorePattern",
	},
	[VARIABLE_TYPE.VARIABLE]: {
		description: "vars",
		configKey: "varsIgnorePattern",
	},
};

//------------------------------------------------------------------------------
// Config Parsing
//------------------------------------------------------------------------------

function parseConfig(options) {
	const config = {
		vars: "all",
		args: "after-used",
		ignoreRestSiblings: false,
		caughtErrors: "all",
		ignoreClassWithStaticInitBlock: false,
		ignoreUsingDeclarations: false,
		reportUsedIgnorePattern: false,
	};

	const firstOption = options[0];
	if (!firstOption) return config;

	if (typeof firstOption === "string") {
		config.vars = firstOption;
		return config;
	}

	const booleanKeys = [
		"ignoreRestSiblings",
		"ignoreClassWithStaticInitBlock",
		"ignoreUsingDeclarations",
		"reportUsedIgnorePattern",
	];
	const stringKeys = ["vars", "args", "caughtErrors"];
	const patternKeys = [
		"varsIgnorePattern",
		"argsIgnorePattern",
		"caughtErrorsIgnorePattern",
		"destructuredArrayIgnorePattern",
	];

	for (const key of stringKeys) {
		if (firstOption[key]) config[key] = firstOption[key];
	}
	for (const key of booleanKeys) {
		if (firstOption[key]) config[key] = firstOption[key];
	}
	for (const key of patternKeys) {
		if (firstOption[key]) {
			config[key] = new RegExp(firstOption[key], "u");
		}
	}

	return config;
}

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
		const config = parseConfig(context.options);

		//--------------------------------------------------------------------------
		// Variable Type Helpers
		//--------------------------------------------------------------------------

		function defToVariableType(def) {
			if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
				return VARIABLE_TYPE.ARRAY_DESTRUCTURE;
			}
			switch (def.type) {
				case "CatchClause": return VARIABLE_TYPE.CATCH_CLAUSE;
				case "Parameter": return VARIABLE_TYPE.PARAMETER;
				default: return VARIABLE_TYPE.VARIABLE;
			}
		}

		function getVariableDescription(variableType) {
			const meta = VARIABLE_TYPE_META[variableType];
			if (!meta) throw new Error(`Unexpected variable type: ${variableType}`);
			const pattern = config[meta.configKey];
			return [meta.description, pattern ? pattern.toString() : undefined];
		}

		function buildAdditionalMessage(variableDescription, pattern, verb) {
			if (pattern && variableDescription) {
				return `. ${verb} ${variableDescription} must ${verb === "Allowed unused" ? "match" : "not match"} ${pattern}`;
			}
			return "";
		}

		function getMessageData(unusedVar, action) {
			const def = unusedVar.defs?.[0];
			let additional = "";
			if (def) {
				const [desc, pattern] = getVariableDescription(defToVariableType(def));
				additional = buildAdditionalMessage(desc, pattern, "Allowed unused");
			}
			return { varName: unusedVar.name, action, additional };
		}

		const getDefinedMessageData = unusedVar => getMessageData(unusedVar, "defined");
		const getAssignedMessageData = unusedVar => getMessageData(unusedVar, "assigned a value");

		function getUsedIgnoredMessageData(variable, variableType) {
			const [desc, pattern] = getVariableDescription(variableType);
			const additional = buildAdditionalMessage(desc, pattern, "Used");
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
			const hasRestSiblingReference = variable.references.some(ref => hasRestSibling(ref.identifier.parent));
			return hasRestSiblingDefinition || hasRestSiblingReference;
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
			return variable.defs.flatMap(def => {
				if (def.type === "FunctionName") return [def.node];
				if (
					def.type === "Variable" &&
					def.node.init &&
					(def.node.init.type === "FunctionExpression" || def.node.init.type === "ArrowFunctionExpression")
				) {
					return [def.node.init];
				}
				return [];
			});
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
			const canBeUsedLater =
				ref.from.variableScope !== ref.resolved.scope.variableScope ||
				astUtils.isInLoop(id);

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
				(
					(parent.type === "AssignmentExpression" &&
						parent.left === id &&
						isUnusedExpression(parent) &&
						!astUtils.isLogicalAssignmentOperator(parent.operator)) ||
					(parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
					(rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode))
				)
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

			target = target.body.type === "BlockStatement"
				? target.body.body[0]
				: target.body;

			return !!target && target.type === "ReturnStatement";
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
				return ref.isRead() && !forItself && !(isFunctionDefinition && isSelfReference(ref, functionNodes));
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

		function shouldSkipVariable(scope, variable, config) {
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) return true;
			if (scope.functionExpressionScope) return true;
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;
			if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) return true;
			return false;
		}

		function reportUsedIgnoredIfNeeded(variable, variableType) {
			if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
				const def = variable.defs[0];
				context.report({
					node: def.name,
					messageId: "usedIgnoredVar",
					data: getUsedIgnoredMessageData(variable, variableType),
				});
			}
		}

		function checkIgnorePatternAndReport(variable, def) {
			const type = def.type;
			const refUsedInArrayPatterns = variable.references.some(
				ref => ref.identifier.parent.type === "ArrayPattern"
			);

			if (
				(def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
				config.destructuredArrayIgnorePattern?.test(def.name.name)
			) {
				reportUsedIgnoredIfNeeded(variable, VARIABLE_TYPE.ARRAY_DESTRUCTURE);
				return true;
			}

			if (type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
			}

			if (type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
				if (config.caughtErrorsIgnorePattern?.test(def.name.name)) {
					reportUsedIgnoredIfNeeded(variable, VARIABLE_TYPE.CATCH_CLAUSE);
					return true;
				}
			} else if (type === "Parameter") {
				const parentKind = def.node.parent?.kind;
				if (
					(def.node.parent?.type === "Property" || def.node.parent?.type === "MethodDefinition") &&
					parentKind === "set"
				) return true;
				if (config.args === "none") return true;
				if (config.argsIgnorePattern?.test(def.name.name)) {
					reportUsedIgnoredIfNeeded(variable, VARIABLE_TYPE.PARAMETER);
					return true;
				}
				if (
					config.args === "after-used" &&
					astUtils.isFunction(def.name.
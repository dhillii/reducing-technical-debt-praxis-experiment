/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

/**
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 */

/**
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName
 * @property {'defined'|'assigned a value'} action
 * @property {string} additional
 */

/**
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName
 * @property {string} additional
 */

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
		const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
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

		// ----------------------------------------------------------------------
		// Config parsing
		// ----------------------------------------------------------------------
		const firstOption = context.options[0];
		if (firstOption) {
			if (typeof firstOption === "string") {
				config.vars = firstOption;
			} else {
				Object.assign(config, {
					vars: firstOption.vars || config.vars,
					args: firstOption.args || config.args,
					ignoreRestSiblings:
						firstOption.ignoreRestSiblings ?? config.ignoreRestSiblings,
					caughtErrors:
						firstOption.caughtErrors || config.caughtErrors,
					ignoreClassWithStaticInitBlock:
						firstOption.ignoreClassWithStaticInitBlock ??
						config.ignoreClassWithStaticInitBlock,
					ignoreUsingDeclarations:
						firstOption.ignoreUsingDeclarations ??
						config.ignoreUsingDeclarations,
					reportUsedIgnorePattern:
						firstOption.reportUsedIgnorePattern ??
						config.reportUsedIgnorePattern,
				});

				["varsIgnorePattern", "argsIgnorePattern", "caughtErrorsIgnorePattern", "destructuredArrayIgnorePattern"].forEach(
					key => {
						if (firstOption[key]) {
							config[key] = new RegExp(firstOption[key], "u");
						}
					},
				);
			}
		}

		// ----------------------------------------------------------------------
		// Helper utilities
		// ----------------------------------------------------------------------
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
			switch (variableType) {
				case "array-destructure":
					return ["elements of array destructuring", config.destructuredArrayIgnorePattern];
				case "catch-clause":
					return ["caught errors", config.caughtErrorsIgnorePattern];
				case "parameter":
					return ["args", config.argsIgnorePattern];
				case "variable":
					return ["vars", config.varsIgnorePattern];
				default:
					throw new Error(`Unexpected variable type: ${variableType}`);
			}
		}

		function formatAdditional(variableDescription, pattern) {
			if (!pattern || !variableDescription) return "";
			return `. Allowed unused ${variableDescription} must match ${pattern}`;
		}

		function getDefinedMessageData(unusedVar) {
			const def = unusedVar.defs?.[0];
			const [desc, pat] = def ? getVariableDescription(defToVariableType(def)) : [];
			return {
				varName: unusedVar.name,
				action: "defined",
				additional: formatAdditional(desc, pat?.toString()),
			};
		}

		function getAssignedMessageData(unusedVar) {
			const def = unusedVar.defs?.[0];
			const [desc, pat] = def ? getVariableDescription(defToVariableType(def)) : [];
			return {
				varName: unusedVar.name,
				action: "assigned a value",
				additional: formatAdditional(desc, pat?.toString()),
			};
		}

		function getUsedIgnoredMessageData(variable, variableType) {
			const [desc, pat] = getVariableDescription(variableType);
			return {
				varName: variable.name,
				additional: formatAdditional(desc, pat?.toString()),
			};
		}

		function isExported(variable) {
			const def = variable.defs?.[0];
			if (!def) return false;
			let node = def.node;
			if (node.type === "VariableDeclarator") node = node.parent;
			if (def.type === "Parameter") return false;
			return node.parent.type.startsWith("Export");
		}

		function usesExplicitResourceManagement(variable) {
			const def = variable.defs?.[0];
			return (
				def?.type === "Variable" &&
				(def.parent.kind === "using" || def.parent.kind === "await using")
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
			const hasDef = variable.defs.some(d => hasRestSibling(d.name.parent));
			const hasRef = variable.references.some(r => hasRestSibling(r.identifier.parent));
			return hasDef || hasRef;
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
			const defs = variable.defs || [];
			const functions = [];
			defs.forEach(def => {
				if (def.type === "FunctionName") {
					functions.push(def.node);
				} else if (
					def.type === "Variable" &&
					def.node.init &&
					["FunctionExpression", "ArrowFunctionExpression"].includes(def.node.init.type)
				) {
					functions.push(def.node.init);
				}
			});
			return functions;
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

		function getRhsNode(ref, prev) {
			const id = ref.identifier;
			const parent = id.parent;
			const canBeUsedLater =
				ref.from.variableScope !== ref.resolved.scope.variableScope ||
				astUtils.isInLoop(id);
			if (prev && isInside(id, prev)) return prev;
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

		function isInsideOfStorableFunction(id, rhsNode) {
			const funcNode = astUtils.getUpperFunction(id);
			return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
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

		function isForInOfRef(ref) {
			let target = ref.identifier.parent;
			if (target.type === "VariableDeclarator") target = target.parent.parent;
			if (!["ForInStatement", "ForOfStatement"].includes(target.type)) return false;
			if (target.body.type === "BlockStatement") target = target.body.body[0];
			else target = target.body;
			if (!target) return false;
			return target.type === "ReturnStatement";
		}

		function isUsedVariable(variable) {
			if (variable.eslintUsed) return true;
			const functionDefs = getFunctionDefinitions(variable);
			const isFuncDef = functionDefs.length > 0;
			let rhsNode = null;
			return variable.references.some(ref => {
				if (isForInOfRef(ref)) return true;
				const selfRead = isReadForItself(ref, rhsNode);
				rhsNode = getRhsNode(ref, rhsNode);
				return (
					isReadRef(ref) &&
					!selfRead &&
					!(isFuncDef && isSelfReference(ref, functionDefs))
				);
			});
		}

		function isAfterLastUsedArg(variable) {
			const def = variable.defs?.[0];
			if (!def) return true;
			const params = sourceCode.getDeclaredVariables(def.node);
			const later = params.slice(params.indexOf(variable) + 1);
			return !later.some(v => v.references.length > 0 || v.eslintUsed);
		}

		function shouldSkipVariable(variable) {
			// class name
			if (variable.scope.type === "class" && variable.scope.block.id === variable.identifiers[0]) return true;
			// function expression name
			if (variable.scope.functionExpressionScope) return true;
			// eslintUsed flag
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;
			// implicit arguments
			if (
				variable.scope.type === "function" &&
				variable.name === "arguments" &&
				variable.identifiers.length === 0
			) {
				return true;
			}
			const def = variable.defs?.[0];
			if (!def) return false;

			// destructured array ignore pattern
			if (
				(def.name.parent.type === "ArrayPattern" ||
					variable.references.some(r => r.identifier.parent.type === "ArrayPattern")) &&
				config.destructuredArrayIgnorePattern?.test(def.name.name)
			) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(variable, "array-destructure"),
					});
				}
				return true;
			}

			// class with static block
			if (def.type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
			}

			// catch clause
			if (def.type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
				if (config.caughtErrorsIgnorePattern?.test(def.name.name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(variable, "catch-clause"),
						});
					}
					return true;
				}
				return false;
			}

			// parameters
			if (def.type === "Parameter") {
				if (
					(def.node.parent.type === "Property" ||
						def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set"
				) {
					return true;
				}
				if (config.args === "none") return true;
				if (config.argsIgnorePattern?.test(def.name.name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(variable, "parameter"),
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

			// generic vars ignore pattern
			if (config.varsIgnorePattern?.test(def.name.name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(variable, "variable"),
					});
				}
				return true;
			}
			return false;
		}

		function collectUnusedVariables(scope, result) {
			if (scope.type !== "global" || config.vars === "all") {
				scope.variables.forEach(variable => {
					if (shouldSkipVariable(variable)) return;
					if (
						!isUsedVariable(variable) &&
						!isExported(variable) &&
						!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
						!hasRestSpreadSibling(variable)
					) {
						result.push(variable);
					}
				});
			}
			scope.childScopes.forEach(child => collectUnusedVariables(child, result));
			return result;
		}

		// ----------------------------------------------------------------------
		// Fix handling (split into small helpers)
		// ----------------------------------------------------------------------
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

			// guard: multiple write refs
			if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

			// helper to get token values
			const tokenBeforeVal = () => sourceCode.getTokenBefore(id).value;
			const tokenAfterVal = () => sourceCode.getTokenAfter(id).value;

			// ------------------------------------------------------------------
			// Simple cases
			// ------------------------------------------------------------------
			if (parent.type === "VariableDeclarator") {
				return fixVariableDeclarator(parent, fixer);
			}
			if (parent.parent.type === "ObjectPattern") {
				return fixObjectPattern(parent, tokenBefore, tokenAfter, fixer);
			}
			if (parent.type === "ArrayPattern") {
				return fixArrayPattern(parent, tokenBefore, tokenAfter, fixer);
			}
			if (parent.type === "RestElement") {
				return fixRestElement(parent, tokenBefore, tokenAfter, fixer);
			}
			if (parent.type === "AssignmentPattern") {
				return fixAssignmentPattern(parent, tokenBefore, tokenAfter, fixer);
			}
			if (parent.type === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}
			if (parent.type === "ImportDefaultSpecifier") {
				return fixImportDefaultSpecifier(parent, tokenAfter, fixer);
			}
			if (parent.type === "ImportSpecifier") {
				return fixImportSpecifier(parent, tokenBefore, tokenAfter, fixer);
			}
			if (parent.type === "ImportNamespaceSpecifier") {
				return fixImportNamespaceSpecifier(parent, tokenAfter, fixer);
			}
			if (parent.type === "CatchClause") return null;
			if (parent.type === "ClassDeclaration") return fixer.removeRange(parent.range);
			if (tokenBefore?.value === ",") return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
			if (tokenAfter?.value === ",") {
				if (tokenBefore?.value === "(") {
					return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
				}
				if (tokenBefore?.value === "{") {
					return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
				}
			}
			if (parent.type === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfter?.value !== ")") {
				return fixer.replaceText(id, "()");
			}
			return fixer.removeRange(id.range);
		}

		// ----------------------------------------------------------------------
		// Individual fix helpers
		// ----------------------------------------------------------------------
		function fixVariableDeclarator(node, fixer) {
			const parent = node.parent;
			if (parent.declarations.length === 1) {
				if (astUtils.isLoop(parent.parent.parent) && parent.parent.parent.body !== parent.parent) return null;
				if (
					["IfStatement", "WithStatement"].includes(parent.parent.parent.type) ||
					astUtils.isLoop(parent.parent.parent)
				) {
					return fixer.replaceText(parent, ";");
				}
				const next = sourceCode.getTokenAfter(parent);
				const prev = sourceCode.getTokenBefore(parent);
				if (next && (next.type === "String" || (!astUtils.isSemicolonToken(prev) && !astUtils.isOpeningBraceToken(prev)))) {
					return null;
				}
				return fixer.removeRange(parent.range);
			}
			if (sourceCode.getTokenBefore(node).value === ",") {
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
		}

		function fixObjectPattern(node, tokenBefore, tokenAfter, fixer) {
			if (node.parent.properties.length === 1) {
				if (node.parent.parent.type === "RestElement") {
					return fixRestInPattern(node.parent.parent, fixer);
				}
				if (node.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(node.parent);
				}
				return fixVariables(node.parent);
			}
			if (tokenBefore.value === ":") {
				if (sourceCode.getTokenBefore(node).value === "{" && sourceCode.getTokenAfter(node).value === ",") {
					return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}

		function fixArrayPattern(node, tokenBefore, tokenAfter, fixer) {
			if (hasSingleElement(node)) {
				if (node.parent.type === "RestElement") {
					return fixRestInPattern(node.parent, fixer);
				}
				if (node.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(node);
				}
				return fixVariables(node);
			}
			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(node.parent.elements.find(e => e === node).range);
			}
			return null;
		}

		function fixRestElement(node, tokenBefore, tokenAfter, fixer) {
			if (node.parent.type === "ArrayPattern") {
				if (hasSingleElement(node.parent)) {
					if (node.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(node.parent);
					}
					return fixVariables(node.parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
			}
			if (node.parent.type === "ObjectPattern") {
				if (node.parent.properties.length === 1) {
					return fixVariables(node.parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
			}
			if (astUtils.isFunction(node.parent)) {
				if (node.parent.params.length === 1) {
					return fixer.removeRange(node.range);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}

		function fixAssignmentPattern(node, tokenBefore, tokenAfter, fixer) {
			if (node.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(node);
			}
			if (node.parent.parent.type === "ObjectPattern") {
				if (node.parent.parent.properties.length === 1) {
					if (node.parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(node.parent.parent);
					}
					return fixVariables(node.parent.parent);
				}
				if (sourceCode.getTokenBefore(node.parent).value === "{" && sourceCode.getTokenAfter(node.parent).value === ",") {
					return fixer.removeRange([node.parent.range[0], sourceCode.getTokenAfter(node.parent).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node.parent).range[0], node.parent.range[1]]);
			}
			if (astUtils.isFunction(node.parent)) {
				return fixFunctionParameters(node);
			}
			return null;
		}

		function fixImportDefaultSpecifier(node, tokenAfter, fixer) {
			const hasOther = node.parent.specifiers.some(s => s.type !== "ImportDefaultSpecifier");
			if (!hasOther) {
				return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
			}
			return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
		}

		function fixImportSpecifier(node, tokenBefore, tokenAfter, fixer) {
			const specifiers = node.parent.specifiers.filter(s => s.type === "ImportSpecifier");
			if (specifiers.length === 1) {
				if (!node.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
					return fixer.removeRange(node.parent.range);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node, 1).range[0], tokenAfter.range[1]]);
			}
			if (sourceCode.getTokenBefore(node).value === "{") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
		}

		function fixImportNamespaceSpecifier(node, tokenAfter, fixer) {
			if (node.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
		}

		// ----------------------------------------------------------------------
		// Additional nested fix helpers (used by above)
		// ----------------------------------------------------------------------
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		function fixNestedArrayVariable(node) {
			const parent = node.parent;
			if (parent.parent.type === "ArrayPattern" && hasSingleElement(parent)) {
				return fixNestedArrayVariable(parent);
			}
			if (hasSingleElement(parent)) {
				if (sourceCode.getTokenBefore(parent).value === ":") {
					return fixVariables(parent);
				}
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(parent.parent, fixer);
				}
				return fixVariables(parent);
			}
			if (sourceCode.getTokenBefore(node).value === "," && sourceCode.getTokenAfter(node).value === "]") {
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return fixer.removeRange(node.range);
		}

		function fixNestedObjectVariable(node) {
			const parent = node.parent;
			if (parent.parent.parent.parent.type === "ObjectPattern" && parent.parent.properties.length === 1) {
				return fixNestedObjectVariable(parent.parent);
			}
			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(parent.parent);
				}
				if (sourceCode.getTokenBefore(parent).value === "{") {
					return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
			}
			return null;
		}

		function fixVariables(node) {
			const parent = node.parent;
			if (parent.type === "VariableDeclarator") {
				return fixVariableDeclarator(parent, fixer);
			}
			if (sourceCode.getTokenBefore(node).value === ":") {
				if (parent.parent.type === "ObjectPattern") {
					return fixObjectWithValueSeparator(node);
				}
			}
			return fixFunctionParameters(node);
		}

		function fixFunctionParameters(node) {
			const fn = node.parent;
			if (!astUtils.isFunction(fn)) return null;
			if (fn.params.length === 1) {
				return fixer.removeRange(node.range);
			}
			if (sourceCode.getTokenBefore(node).value === "(" && sourceCode.getTokenAfter(node).value === ",") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
		}

		function fixObjectWithValueSeparator(node) {
			const parent = node.parent.parent;
			if (parent.parent.type === "ArrayPattern" && parent.properties.length === 1) {
				return fixNestedArrayVariable(parent);
			}
			return fixNestedObjectVariable(node);
		}

		function fixRestInPattern(node, fixer) {
			const parent = node.parent;
			if (astUtils.isFunction(parent)) {
				if (parent.params.length === 1) return fixer.removeRange(node.range);
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			if (parent.type === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent);
					}
					return fixVariables(parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}

		// ----------------------------------------------------------------------
		// Public visitor
		// ----------------------------------------------------------------------
		return {
			"Program:exit"(programNode) {
				const unused = collectUnusedVariables(sourceCode.getScope(programNode), []);
				unused.forEach(unusedVar => {
					if (unusedVar.defs.length) {
						const writeRefs = unusedVar.references.filter(
							ref => ref.isWrite() && ref.from.variableScope === unusedVar.scope.variableScope,
						);
						const lastWrite = writeRefs.length ? writeRefs.at(-1) : null;
						context.report({
							node: lastWrite ? lastWrite.identifier : unusedVar.identifiers[0],
							messageId: "unusedVar",
							data: unusedVar.references.some(r => r.isWrite())
								? getAssignedMessageData(unusedVar)
								: getDefinedMessageData(unusedVar),
							suggest: [
								{
									messageId: "removeVar",
									data: { varName: unusedVar.name },
									fix(fixer) {
										return handleFixes(fixer, unusedVar);
									},
								},
							],
						});
					} else if (unusedVar.eslintExplicitGlobalComments) {
						const comment = unusedVar.eslintExplicitGlobalComments[0];
						context.report({
							node: programNode,
							loc: astUtils.getNameLocationInGlobalDirectiveComment(sourceCode, comment, unusedVar.name),
							messageId: "unusedVar",
							data: getDefinedMessageData(unusedVar),
						});
					}
				});
			},
		};
	},
};
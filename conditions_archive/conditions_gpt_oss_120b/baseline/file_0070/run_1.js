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
		(() => {
			const first = context.options[0];
			if (!first) return;

			if (typeof first === "string") {
				config.vars = first;
				return;
			}

			Object.assign(config, {
				vars: first.vars || config.vars,
				args: first.args || config.args,
				ignoreRestSiblings:
					first.ignoreRestSiblings ?? config.ignoreRestSiblings,
				caughtErrors: first.caughtErrors || config.caughtErrors,
				ignoreClassWithStaticInitBlock:
					first.ignoreClassWithStaticInitBlock ??
					config.ignoreClassWithStaticInitBlock,
				ignoreUsingDeclarations:
					first.ignoreUsingDeclarations ?? config.ignoreUsingDeclarations,
				reportUsedIgnorePattern:
					first.reportUsedIgnorePattern ?? config.reportUsedIgnorePattern,
			});

			["varsIgnorePattern", "argsIgnorePattern", "caughtErrorsIgnorePattern", "destructuredArrayIgnorePattern"]
				.forEach(key => {
					if (first[key]) {
						config[key] = new RegExp(first[key], "u");
					}
				});
		})();

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

		function getVariableDescription(type) {
			switch (type) {
				case "array-destructure":
					return ["elements of array destructuring", config.destructuredArrayIgnorePattern];
				case "catch-clause":
					return ["caught errors", config.caughtErrorsIgnorePattern];
				case "parameter":
					return ["args", config.argsIgnorePattern];
				case "variable":
					return ["vars", config.varsIgnorePattern];
				default:
					throw new Error(`Unexpected variable type: ${type}`);
			}
		}

		function formatAdditional(type) {
			const [desc, pattern] = getVariableDescription(type);
			if (pattern && desc) {
				return `. Allowed unused ${desc} must match ${pattern}`;
			}
			return "";
		}

		function getDefinedMessageData(v) {
			const def = v.defs?.[0];
			return {
				varName: v.name,
				action: "defined",
				additional: def ? formatAdditional(defToVariableType(def)) : "",
			};
		}

		function getAssignedMessageData(v) {
			const def = v.defs?.[0];
			return {
				varName: v.name,
				action: "assigned a value",
				additional: def ? formatAdditional(defToVariableType(def)) : "",
			};
		}

		function getUsedIgnoredMessageData(v, type) {
			const [desc, pattern] = getVariableDescription(type);
			return {
				varName: v.name,
				additional:
					pattern && desc
						? `. Used ${desc} must not match ${pattern}`
						: "",
			};
		}

		function isExported(v) {
			const def = v.defs?.[0];
			if (!def) return false;
			let node = def.node;
			if (node.type === "VariableDeclarator") node = node.parent;
			if (def.type === "Parameter") return false;
			return node.parent.type.startsWith("Export");
		}

		function usesExplicitResourceManagement(v) {
			const d = v.defs?.[0];
			return (
				d?.type === "Variable" &&
				(d.parent.kind === "using" || d.parent.kind === "await using")
			);
		}

		function hasRestSibling(node) {
			return (
				node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
			);
		}

		function hasRestSpreadSibling(v) {
			if (!config.ignoreRestSiblings) return false;
			const siblingDef = v.defs.some(d => hasRestSibling(d.name.parent));
			const siblingRef = v.references.some(r => hasRestSibling(r.identifier.parent));
			return siblingDef || siblingRef;
		}

		function isReadRef(r) {
			return r.isRead();
		}

		function isSelfReference(r, fnNodes) {
			let scope = r.from;
			while (scope) {
				if (fnNodes.includes(scope.block)) return true;
				scope = scope.upper;
			}
			return false;
		}

		function getFunctionDefinitions(v) {
			const defs = [];
			v.defs.forEach(d => {
				if (d.type === "FunctionName") defs.push(d.node);
				if (
					d.type === "Variable" &&
					d.node.init &&
					(d.node.init.type === "FunctionExpression" ||
						d.node.init.type === "ArrowFunctionExpression")
				) {
					defs.push(d.node.init);
				}
			});
			return defs;
		}

		function isInside(inner, outer) {
			return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
		}

		function isUnusedExpression(node) {
			const p = node.parent;
			if (p.type === "ExpressionStatement") return true;
			if (p.type === "SequenceExpression") {
				if (p.expressions.at(-1) !== node) return true;
				return isUnusedExpression(p);
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

		function isReadForItself(ref, rhs) {
			const id = ref.identifier;
			const parent = id.parent;
			return (
				ref.isRead() &&
				((parent.type === "AssignmentExpression" &&
					parent.left === id &&
					isUnusedExpression(parent) &&
					!astUtils.isLogicalAssignmentOperator(parent.operator)) ||
					(parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
					(rhs && isInside(id, rhs) && !isInsideOfStorableFunction(id, rhs)))
			);
		}

		function isInsideOfStorableFunction(id, rhs) {
			const fn = astUtils.getUpperFunction(id);
			return fn && isInside(fn, rhs) && isStorableFunction(fn, rhs);
		}

		function isStorableFunction(fnNode, rhs) {
			let node = fnNode;
			let parent = fnNode.parent;
			while (parent && isInside(parent, rhs)) {
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
			if (target.type !== "ForInStatement" && target.type !== "ForOfStatement")
				return false;
			if (target.body.type === "BlockStatement") target = target.body.body[0];
			else target = target.body;
			return target?.type === "ReturnStatement";
		}

		function isUsedVariable(v) {
			if (v.eslintUsed) return true;
			const fnDefs = getFunctionDefinitions(v);
			const isFnDef = fnDefs.length > 0;
			let rhs = null;
			return v.references.some(ref => {
				if (isForInOfRef(ref)) return true;
				const self = isReadForItself(ref, rhs);
				rhs = getRhsNode(ref, rhs);
				return (
					isReadRef(ref) &&
					!self &&
					!(isFnDef && isSelfReference(ref, fnDefs))
				);
			});
		}

		function isAfterLastUsedArg(v) {
			const def = v.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const later = params.slice(params.indexOf(v) + 1);
			return !later.some(p => p.references.length > 0 || p.eslintUsed);
		}

		function shouldIgnoreVariable(v, def) {
			const type = def.type;
			const name = def.name.name;

			// class name in class scope
			if (def.type === "ClassName") {
				if (
					config.ignoreClassWithStaticInitBlock &&
					def.node.body.body.some(n => n.type === "StaticBlock")
				) {
					return true;
				}
				return false;
			}

			// catch clause
			if (type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
				if (
					config.caughtErrorsIgnorePattern?.test(name) &&
					(!config.reportUsedIgnorePattern || !isUsedVariable(v))
				) {
					if (config.reportUsedIgnorePattern && isUsedVariable(v)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(v, "catch-clause"),
						});
					}
					return true;
				}
				return false;
			}

			// parameters
			if (type === "Parameter") {
				if (
					(def.node.parent.type === "Property" ||
						def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set"
				) {
					return true;
				}
				if (config.args === "none") return true;
				if (config.argsIgnorePattern?.test(name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(v)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(v, "parameter"),
						});
					}
					return true;
				}
				if (
					config.args === "after-used" &&
					astUtils.isFunction(def.name.parent) &&
					!isAfterLastUsedArg(v)
				) {
					return true;
				}
				return false;
			}

			// generic variables
			if (config.varsIgnorePattern?.test(name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(v)) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(v, "variable"),
					});
				}
				return true;
			}
			return false;
		}

		function collectUnusedVariables(scope, result) {
			if (scope.type !== "global" && config.vars !== "all") {
				// skip non‑global when vars option is "local"
			} else {
				scope.variables.forEach(v => {
					if (
						scope.type === "class" &&
						scope.block.id === v.identifiers[0]
					) {
						return;
					}
					if (scope.functionExpressionScope) return;
					if (!config.reportUsedIgnorePattern && v.eslintUsed) return;
					if (
						scope.type === "function" &&
						v.name === "arguments" &&
						v.identifiers.length === 0
					) {
						return;
					}
					const def = v.defs?.[0];
					if (def) {
						if (
							(def.name.parent.type === "ArrayPattern" ||
								v.references.some(r => r.identifier.parent.type === "ArrayPattern")) &&
							config.destructuredArrayIgnorePattern?.test(def.name.name)
						) {
							if (config.reportUsedIgnorePattern && isUsedVariable(v)) {
								context.report({
									node: def.name,
									messageId: "usedIgnoredVar",
									data: getUsedIgnoredMessageData(v, "array-destructure"),
								});
							}
							return;
						}
						if (shouldIgnoreVariable(v, def)) return;
					}
					if (
						!isUsedVariable(v) &&
						!isExported(v) &&
						!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(v)) &&
						!hasRestSpreadSibling(v)
					) {
						result.push(v);
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

			if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

			// Helper to get token values
			const tokenValue = node => sourceCode.getTokenBefore(node).value;
			const nextTokenValue = node => sourceCode.getTokenAfter(node).value;

			// ------------------------------------------------------------------
			// Variable / Parameter fixes
			// ------------------------------------------------------------------
			if (parent.type === "VariableDeclarator") {
				return fixVariableDeclarator(fixer, parent, tokenBefore, tokenAfter);
			}
			if (parent.parent.type === "ObjectPattern") {
				return fixObjectPattern(fixer, parent, tokenBefore, tokenAfter);
			}
			if (parent.type === "ArrayPattern") {
				return fixArrayPattern(fixer, parent, tokenBefore, tokenAfter);
			}
			if (parent.type === "RestElement") {
				return fixRestElement(fixer, parent, tokenBefore, tokenAfter);
			}
			if (parent.type === "AssignmentPattern") {
				return fixAssignmentPattern(fixer, parent, tokenBefore, tokenAfter);
			}
			if (parent.type === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}
			if (parent.type === "ImportDefaultSpecifier") {
				return fixImportDefault(fixer, parent, tokenAfter);
			}
			if (parent.type === "ImportSpecifier") {
				return fixImportSpecifier(fixer, parent, tokenBefore, tokenAfter);
			}
			if (parent.type === "ImportNamespaceSpecifier") {
				return fixImportNamespace(fixer, parent);
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

		function fixVariableDeclarator(fixer, node, tokenBefore, tokenAfter) {
			if (node.parent.declarations.length === 1) {
				if (isLoop(node.parent.parent.parent) && node.parent.parent.body !== node.parent) return null;
				if (
					node.parent.parent.type === "IfStatement" ||
					isLoop(node.parent.parent) ||
					(node.parent.parent.type === "WithStatement" && node.parent.parent.body === node.parent)
				) {
					return fixer.replaceText(node.parent, ";");
				}
				const next = sourceCode.getTokenAfter(node.parent);
				const prev = sourceCode.getTokenBefore(node.parent);
				if (next && !astUtils.isSemicolonToken(prev) && !astUtils.isOpeningBraceToken(prev)) return null;
				return fixer.removeRange(node.parent.range);
			}
			if (tokenBefore?.value === ",") {
				return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
			}
			return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
		}

		function fixObjectPattern(fixer, node, tokenBefore, tokenAfter) {
			if (node.parent.properties.length === 1) {
				if (node.parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, node.parent.parent);
				}
				if (node.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, node.parent);
				}
				return fixVariables(fixer, node.parent);
			}
			if (tokenBefore?.value === ":") {
				if (sourceCode.getTokenBefore(node).value === "{" && sourceCode.getTokenAfter(node).value === ",") {
					return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}

		function fixArrayPattern(fixer, node, tokenBefore, tokenAfter) {
			if (hasSingleElement(node)) {
				if (node.parent.type === "RestElement") {
					return fixRestInPattern(fixer, node.parent);
				}
				if (node.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, node);
				}
				return fixVariables(fixer, node);
			}
			if (tokenBefore?.value === "," && tokenAfter?.value === ",") {
				return fixer.removeRange(node.parent.elements.find(e => e === node).range);
			}
			return null;
		}

		function fixRestElement(fixer, node, tokenBefore, tokenAfter) {
			if (node.parent.type === "ArrayPattern") {
				if (hasSingleElement(node.parent)) {
					if (node.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, node.parent);
					}
					return fixVariables(fixer, node.parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
			}
			if (node.parent.type === "ObjectPattern") {
				if (node.parent.properties.length === 1) {
					return fixVariables(fixer, node.parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
			}
			if (isFunction(node.parent)) {
				if (node.parent.params.length === 1) {
					return fixer.removeRange(node.range);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}

		function fixAssignmentPattern(fixer, node, tokenBefore, tokenAfter) {
			if (node.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, node);
			}
			if (node.parent.parent.type === "ObjectPattern") {
				if (node.parent.parent.properties.length === 1) {
					if (node.parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, node.parent.parent);
					}
					return fixVariables(fixer, node.parent.parent);
				}
				if (sourceCode.getTokenBefore(node.parent).value === "{" && sourceCode.getTokenAfter(node.parent).value === ",") {
					return fixer.removeRange([node.parent.range[0], sourceCode.getTokenAfter(node.parent).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node.parent).range[0], node.parent.range[1]]);
			}
			if (isFunction(node.parent)) {
				return fixFunctionParameters(fixer, node);
			}
			return null;
		}

		function fixImportDefault(fixer, node, tokenAfter) {
			const hasOtherSpecifiers = node.parent.specifiers.some(
				s => s.type !== "ImportDefaultSpecifier"
			);
			if (!hasOtherSpecifiers) {
				return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
			}
			return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
		}

		function fixImportSpecifier(fixer, node, tokenBefore, tokenAfter) {
			const specifiers = node.parent.specifiers.filter(s => s.type === "ImportSpecifier");
			if (specifiers.length === 1) {
				if (!node.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
					return fixer.removeRange(node.parent.range);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(node, 1).range[0],
					tokenAfter.range[1],
				]);
			}
			if (sourceCode.getTokenBefore(node).value === "{") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
		}

		function fixImportNamespace(fixer, node) {
			if (node.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
		}

		// ----------------------------------------------------------------------
		// Misc small helpers used by fixers
		// ----------------------------------------------------------------------
		function hasSingleElement(p) {
			return p.elements.filter(e => e !== null).length === 1;
		}
		function isLoop(node) {
			return astUtils.isLoop(node);
		}
		function isFunction(node) {
			return astUtils.isFunction(node);
		}
		function fixVariables(fixer, node) {
			// reuse existing logic for variable fixes inside patterns
			if (node.parent.type === "ObjectPattern") return fixObjectPattern(fixer, node, null, null);
			if (node.parent.type === "ArrayPattern") return fixArrayPattern(fixer, node, null, null);
			return null;
		}
		function fixNestedArrayVariable(fixer, node) {
			if (hasSingleElement(node.parent)) {
				if (sourceCode.getTokenBefore(node).value === ":") {
					return fixVariables(fixer, node.parent);
				}
				if (node.parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, node.parent.parent);
				}
				return fixVariables(fixer, node.parent);
			}
			if (sourceCode.getTokenBefore(node).value === "," && sourceCode.getTokenAfter(node).value === "]") {
				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}
			return fixer.removeRange(node.range);
		}
		function fixNestedObjectVariable(fixer, node) {
			const parent = node.parent;
			if (parent.parent.parent.parent.type === "ObjectPattern" && parent.parent.properties.length === 1) {
				return fixNestedObjectVariable(fixer, parent.parent);
			}
			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(fixer, parent.parent);
				}
				if (sourceCode.getTokenBefore(node).value === "{") {
					return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}
			return null;
		}
		function fixRestInPattern(fixer, node) {
			const parent = node.parent;
			if (isFunction(parent)) {
				if (parent.params.length === 1) return fixer.removeRange(node.range);
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			if (parent.type === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent);
					}
					return fixVariables(fixer, parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}
		function fixFunctionParameters(fixer, node) {
			const fn = node.parent;
			if (fn.params.length === 1) return fixer.removeRange(node.range);
			if (sourceCode.getTokenBefore(node).value === "(" && sourceCode.getTokenAfter(node).value === ",") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
		}

		// ----------------------------------------------------------------------
		// Public listeners
		// ----------------------------------------------------------------------
		return {
			"Program:exit"(programNode) {
				const unused = collectUnusedVariables(sourceCode.getScope(programNode), []);
				unused.forEach(v => {
					if (v.defs.length) {
						const writes = v.references.filter(
							r => r.isWrite() && r.from.variableScope === v.scope.variableScope
						);
						const lastWrite = writes.length ? writes.at(-1) : null;
						context.report({
							node: lastWrite ? lastWrite.identifier : v.identifiers[0],
							messageId: "unusedVar",
							data: v.references.some(r => r.isWrite())
								? getAssignedMessageData(v)
								: getDefinedMessageData(v),
							suggest: [
								{
									messageId: "removeVar",
									data: { varName: v.name },
									fix(fixer) {
										return handleFixes(fixer, v);
									},
								},
							],
						});
					} else if (v.eslintExplicitGlobalComments) {
						const comment = v.eslintExplicitGlobalComments[0];
						context.report({
							node: programNode,
							loc: astUtils.getNameLocationInGlobalDirectiveComment(
								sourceCode,
								comment,
								v.name
							),
							messageId: "unusedVar",
							data: getDefinedMessageData(v),
						});
					}
				});
			},
		};
	},
};
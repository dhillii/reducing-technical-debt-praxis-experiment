/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

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

		const config = {
			vars: "all",
			args: "after-used",
			ignoreRestSiblings: false,
			caughtErrors: "all",
			ignoreClassWithStaticInitBlock: false,
			ignoreUsingDeclarations: false,
			reportUsedIgnorePattern: false,
		};

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
		}

		// ----------------------------------------------------------------------
		// Helper: variable type
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

		// ----------------------------------------------------------------------
		// Helper: description & pattern
		// ----------------------------------------------------------------------
		function getVariableDescription(variableType) {
			let pattern;
			let description;
			switch (variableType) {
				case "array-destructure":
					pattern = config.destructuredArrayIgnorePattern;
					description = "elements of array destructuring";
					break;
				case "catch-clause":
					pattern = config.caughtErrorsIgnorePattern;
					description = "caught errors";
					break;
				case "parameter":
					pattern = config.argsIgnorePattern;
					description = "args";
					break;
				case "variable":
					pattern = config.varsIgnorePattern;
					description = "vars";
					break;
				default:
					throw new Error(`Unexpected variable type: ${variableType}`);
			}
			if (pattern) pattern = pattern.toString();
			return [description, pattern];
		}

		// ----------------------------------------------------------------------
		// Message data generators
		// ----------------------------------------------------------------------
		function getDefinedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			let additional = "";
			if (def) {
				const [desc, pat] = getVariableDescription(
					defToVariableType(def),
				);
				if (pat && desc) {
					additional = `. Allowed unused ${desc} must match ${pat}`;
				}
			}
			return { varName: unusedVar.name, action: "defined", additional };
		}

		function getAssignedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			let additional = "";
			if (def) {
				const [desc, pat] = getVariableDescription(
					defToVariableType(def),
				);
				if (pat && desc) {
					additional = `. Allowed unused ${desc} must match ${pat}`;
				}
			}
			return { varName: unusedVar.name, action: "assigned a value", additional };
		}

		function getUsedIgnoredMessageData(variable, variableType) {
			const [desc, pat] = getVariableDescription(variableType);
			let additional = "";
			if (pat && desc) {
				additional = `. Used ${desc} must not match ${pat}`;
			}
			return { varName: variable.name, additional };
		}

		// ----------------------------------------------------------------------
		// Misc helpers
		// ----------------------------------------------------------------------
		const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

		function isExported(variable) {
			const def = variable.defs[0];
			if (!def) return false;
			let node = def.node;
			if (node.type === "VariableDeclarator") node = node.parent;
			else if (def.type === "Parameter") return false;
			return node.parent.type.indexOf("Export") === 0;
		}

		function usesExplicitResourceManagement(variable) {
			const [def] = variable.defs;
			return (
				def?.type === "Variable" &&
				(def.parent.kind === "using" ||
					def.parent.kind === "await using")
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
			const hasDef = variable.defs.some(def => hasRestSibling(def.name.parent));
			const hasRef = variable.references.some(ref =>
				hasRestSibling(ref.identifier.parent),
			);
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
			const defs = [];
			variable.defs.forEach(def => {
				if (def.type === "FunctionName") defs.push(def.node);
				if (
					def.type === "Variable" &&
					def.node.init &&
					(def.node.init.type === "FunctionExpression" ||
						def.node.init.type === "ArrowFunctionExpression")
				) {
					defs.push(def.node.init);
				}
			});
			return defs;
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
				if (parent.expressions.at(-1) !== node) return true;
				return isUnusedExpression(parent);
			}
			return false;
		}

		function getRhsNode(ref, prevRhs) {
			const id = ref.identifier;
			const parent = id.parent;
			const refScope = ref.from.variableScope;
			const varScope = ref.resolved.scope.variableScope;
			const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

			if (prevRhs && isInside(id, prevRhs)) return prevRhs;

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
					(rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)))
			);
		}

		function isForInOfRef(ref) {
			let target = ref.identifier.parent;
			if (target.type === "VariableDeclarator") {
				target = target.parent.parent;
			}
			if (target.type !== "ForInStatement" && target.type !== "ForOfStatement")
				return false;
			if (target.body.type === "BlockStatement") target = target.body.body[0];
			else target = target.body;
			if (!target) return false;
			return target.type === "ReturnStatement";
		}

		function isUsedVariable(variable) {
			if (variable.eslintUsed) return true;
			const funcDefs = getFunctionDefinitions(variable);
			const isFuncDef = funcDefs.length > 0;
			let rhsNode = null;
			return variable.references.some(ref => {
				if (isForInOfRef(ref)) return true;
				const self = isReadForItself(ref, rhsNode);
				rhsNode = getRhsNode(ref, rhsNode);
				return (
					isReadRef(ref) &&
					!self &&
					!(isFuncDef && isSelfReference(ref, funcDefs))
				);
			});
		}

		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const later = params.slice(params.indexOf(variable) + 1);
			return !later.some(v => v.references.length > 0 || v.eslintUsed);
		}

		// ----------------------------------------------------------------------
		// Variable processing
		// ----------------------------------------------------------------------
		function shouldSkipVariable(variable) {
			const def = variable.defs[0];
			if (!def) return false;

			// array destructuring ignore
			const isArrayDestructure =
				(def.name.parent.type === "ArrayPattern" ||
					variable.references.some(r => r.identifier.parent.type === "ArrayPattern")) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name);
			if (isArrayDestructure) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: getUsedIgnoredMessageData(variable, "array-destructure"),
					});
				}
				return true;
			}

			// class static block
			if (def.type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(
					n => n.type === "StaticBlock",
				);
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
					return true;
				}
			}

			// catch clause
			if (def.type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
				if (
					config.caughtErrorsIgnorePattern &&
					config.caughtErrorsIgnorePattern.test(def.name.name)
				) {
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
				if (
					config.argsIgnorePattern &&
					config.argsIgnorePattern.test(def.name.name)
				) {
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

			// generic variable ignore
			if (
				config.varsIgnorePattern &&
				config.varsIgnorePattern.test(def.name.name)
			) {
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

		function processVariable(variable, unusedVars) {
			if (shouldSkipVariable(variable)) return;

			if (
				!isUsedVariable(variable) &&
				!isExported(variable) &&
				!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
				!hasRestSpreadSibling(variable)
			) {
				unusedVars.push(variable);
			}
		}

		function collectUnusedVariables(scope, unusedVars) {
			if (scope.type !== "global" || config.vars === "all") {
				scope.variables.forEach(v => processVariable(v, unusedVars));
			}
			scope.childScopes.forEach(child => collectUnusedVariables(child, unusedVars));
			return unusedVars;
		}

		// ----------------------------------------------------------------------
		// Fix handling – dispatcher
		// ----------------------------------------------------------------------
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

			if (
				allWriteRefs.some(ref => ref.identifier.range[0] !== id.range[0])
			) {
				return null;
			}

			const handlers = {
				VariableDeclarator: fixVariableDeclarator,
				ObjectPattern: fixObjectPattern,
				ArrayPattern: fixArrayPattern,
				RestElement: fixRestElement,
				ImportDefaultSpecifier: fixImportDefaultSpecifier,
				ImportSpecifier: fixImportSpecifier,
				ImportNamespaceSpecifier: fixImportNamespaceSpecifier,
				CatchClause: () => null,
				ClassDeclaration: fixClassDeclaration,
				ArrowFunctionExpression: fixArrowFunctionExpression,
			};

			const handler = handlers[parent.type];
			if (handler) {
				return handler({ id, parent, fixer, sourceCode, astUtils, config });
			}
			// fallback
			return fixer.removeRange(id.range);
		}

		// ----------------------------------------------------------------------
		// Individual fixers (each low complexity)
		// ----------------------------------------------------------------------
		function fixVariableDeclarator({ id, parent, fixer, sourceCode }) {
			const decl = parent.parent;
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);

			// single declaration
			if (decl.declarations.length === 1) {
				if (astUtils.isLoop(decl.parent.parent) && decl.parent.parent.body !== decl.parent) {
					return null;
				}
				if (
					decl.parent.parent.type === "IfStatement" ||
					astUtils.isLoop(decl.parent.parent) ||
					(decl.parent.parent.type === "WithStatement" &&
						decl.parent.parent.body === decl.parent)
				) {
					return fixer.replaceText(decl.parent, ";");
				}
				const next = sourceCode.getTokenAfter(decl.parent);
				const prev = sourceCode.getTokenBefore(decl.parent);
				if (next && !isSafeToRemove(next, prev)) return null;
				return fixer.removeRange(decl.parent.range);
			}

			// multiple declarations – not first
			if (tokenBefore.value === ",") {
				return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
			}
			// first in multiple
			return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
		}

		function isSafeToRemove(nextToken, prevToken) {
			return (
				nextToken.type === "String" ||
				(prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken))
			);
		}

		function fixObjectPattern({ id, parent, fixer, sourceCode }) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			const prop = parent.parent;

			if (prop.type !== "Property") return null;

			if (parent.parent.properties.length === 1) {
				if (parent.parent.parent.type === "RestElement") {
					return fixRestElement({ id, parent: parent.parent, fixer, sourceCode, astUtils, config });
				}
				if (parent.parent.parent.type === "ArrayPattern") {
					return fixArrayPattern({ id, parent: parent.parent, fixer, sourceCode, astUtils, config });
				}
				return fixVariables({ node: parent.parent, fixer, sourceCode, astUtils, config });
			}

			if (tokenBefore.value === ":") {
				if (sourceCode.getTokenBeforeValue(parent) === "{" && sourceCode.getTokenAfterValue(parent) === ",") {
					return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(parent).range[0],
					id.range[1],
				]);
			}
			return null;
		}

		function fixArrayPattern({ id, parent, fixer, sourceCode }) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			const pattern = parent.parent;

			if (hasSingleElement(parent)) {
				if (pattern.type === "RestElement") {
					return fixRestElement({ id, parent: pattern, fixer, sourceCode, astUtils, config });
				}
				if (pattern.parent.type === "ArrayPattern") {
					return fixArrayPattern({ id, parent: pattern, fixer, sourceCode, astUtils, config });
				}
				return fixVariables({ node: pattern, fixer, sourceCode, astUtils, config });
			}

			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(id.range);
			}
			if (tokenBefore.value === "," && tokenAfter.value === "]") {
				return fixer.removeRange([
					sourceCode.getTokenBefore(id).range[0],
					id.range[1],
				]);
			}
			return fixer.removeRange(id.range);
		}

		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		function fixRestElement({ id, parent, fixer, sourceCode }) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			const patternParent = parent.parent;

			if (patternParent.type === "ArrayPattern") {
				if (hasSingleElement(patternParent)) {
					if (patternParent.parent.type === "ArrayPattern") {
						return fixArrayPattern({ id, parent: patternParent, fixer, sourceCode, astUtils, config });
					}
					return fixVariables({ node: patternParent, fixer, sourceCode, astUtils, config });
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(id, 1).range[0],
					id.range[1],
				]);
			}
			if (patternParent.type === "ObjectPattern") {
				if (patternParent.properties.length === 1) {
					return fixVariables({ node: patternParent, fixer, sourceCode, astUtils, config });
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(id, 1).range[0],
					id.range[1],
				]);
			}
			if (astUtils.isFunction(patternParent)) {
				if (patternParent.params.length === 1) {
					return fixer.removeRange(parent.range);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(parent).range[0],
					parent.range[1],
				]);
			}
			return null;
		}

		function fixImportDefaultSpecifier({ id, parent, fixer, sourceCode }) {
			const hasOtherSpecifiers = parent.parent.specifiers.some(
				s => s.type !== "ImportDefaultSpecifier",
			);
			if (!hasOtherSpecifiers) {
				return fixer.removeRange([
					parent.range[0],
					parent.parent.source.range[0],
				]);
			}
			const tokenAfter = sourceCode.getTokenAfter(id);
			return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
		}

		function fixImportSpecifier({ id, parent, fixer, sourceCode }) {
			const specifiers = parent.parent.specifiers.filter(
				s => s.type === "ImportSpecifier",
			);
			if (specifiers.length === 1) {
				if (!parent.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
					return fixer.removeRange(parent.parent.range);
				}
				const tokenAfter = sourceCode.getTokenAfter(id);
				return fixer.removeRange([
					sourceCode.getTokenBefore(parent, 1).range[0],
					tokenAfter.range[1],
				]);
			}
			if (sourceCode.getTokenBeforeValue(parent) === "{") {
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

		function fixImportNamespaceSpecifier({ id, parent, fixer, sourceCode }) {
			if (
				parent.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")
			) {
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

		function fixClassDeclaration({ parent, fixer }) {
			return fixer.removeRange(parent.range);
		}

		function fixArrowFunctionExpression({ id, parent, tokenAfter, fixer, sourceCode }) {
			if (parent.params.length === 1 && tokenAfter && tokenAfter.value !== ")") {
				return fixer.replaceText(id, "()");
			}
			return null;
		}

		// ----------------------------------------------------------------------
		// Generic variable fixer used by several handlers
		// ----------------------------------------------------------------------
		function fixVariables({ node, fixer, sourceCode, astUtils, config }) {
			const parent = node.parent;
			if (parent.type === "VariableDeclarator") {
				// reuse existing logic via fixVariableDeclarator
				return fixVariableDeclarator({ id: node.id, parent, fixer, sourceCode });
			}
			if (parent.type === "ObjectPattern") {
				return fixObjectPattern({ id: node.id, parent: node, fixer, sourceCode });
			}
			if (parent.type === "ArrayPattern") {
				return fixArrayPattern({ id: node.id, parent: node, fixer, sourceCode });
			}
			return null;
		}

		// ----------------------------------------------------------------------
		// Public
		// ----------------------------------------------------------------------
		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(
					sourceCode.getScope(programNode),
					[],
				);
				for (let i = 0; i < unusedVars.length; ++i) {
					const unusedVar = unusedVars[i];
					if (unusedVar.defs.length > 0) {
						const writeRefs = unusedVar.references.filter(
							ref =>
								ref.isWrite() &&
								ref.from.variableScope === unusedVar.scope.variableScope,
						);
						const reportNode =
							writeRefs.length > 0
								? writeRefs.at(-1).identifier
								: unusedVar.identifiers[0];
						context.report({
							node: reportNode,
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
							loc: astUtils.getNameLocationInGlobalDirectiveComment(
								sourceCode,
								comment,
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
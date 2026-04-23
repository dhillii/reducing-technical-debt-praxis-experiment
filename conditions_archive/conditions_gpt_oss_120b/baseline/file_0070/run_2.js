/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

/**
 * A simple name for the types of variables that this rule supports
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 */

/**
 * Bag of data used for formatting the `unusedVar` lint message.
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName The name of the unused var.
 * @property {'defined'|'assigned a value'} action Description of the vars state.
 * @property {string} additional Any additional info to be appended at the end.
 */

/**
 * Bag of data used for formatting the `usedIgnoredVar` lint message.
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName The name of the unused var.
 * @property {string} additional Any additional info to be appended at the end.
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
		const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
		const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

		// ----------------------------------------------------------------------
		// Config
		// ----------------------------------------------------------------------
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
						firstOption.ignoreRestSiblings ||
						config.ignoreRestSiblings,
					caughtErrors:
						firstOption.caughtErrors || config.caughtErrors,
					ignoreClassWithStaticInitBlock:
						firstOption.ignoreClassWithStaticInitBlock ||
						config.ignoreClassWithStaticInitBlock,
					ignoreUsingDeclarations:
						firstOption.ignoreUsingDeclarations ||
						config.ignoreUsingDeclarations,
					reportUsedIgnorePattern:
						firstOption.reportUsedIgnorePattern ||
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

		function buildMessageData(unusedVar, action) {
			const def = unusedVar.defs && unusedVar.defs[0];
			let additional = "";
			if (def) {
				const [desc, pat] = getVariableDescription(
					defToVariableType(def),
				);
				if (desc && pat) {
					additional = `. Allowed unused ${desc} must match ${pat}`;
				}
			}
			return {
				varName: unusedVar.name,
				action,
				additional,
			};
		}

		function getDefinedMessageData(unusedVar) {
			return buildMessageData(unusedVar, "defined");
		}
		function getAssignedMessageData(unusedVar) {
			return buildMessageData(unusedVar, "assigned a value");
		}
		function getUsedIgnoredMessageData(variable, variableType) {
			const [desc, pat] = getVariableDescription(variableType);
			const additional = desc && pat ? `. Used ${desc} must not match ${pat}` : "";
			return { varName: variable.name, additional };
		}

		function isExported(variable) {
			const def = variable.defs[0];
			if (!def) return false;
			let node = def.node;
			if (node.type === "VariableDeclarator") node = node.parent;
			if (def.type === "Parameter") return false;
			return node.parent.type.indexOf("Export") === 0;
		}

		function usesExplicitResourceManagement(variable) {
			const [def] = variable.defs;
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
			const hasDef = variable.defs.some(def => hasRestSibling(def.name.parent));
			const hasRef = variable.references.some(ref => hasRestSibling(ref.identifier.parent));
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
				if (def.type === "FunctionName") {
					defs.push(def.node);
				} else if (
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
			if (target.type === "VariableDeclarator") target = target.parent.parent;
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
		function collectUnusedVariables(scope, unused) {
			if (scope.type !== "global" || config.vars === "all") {
				for (const variable of scope.variables) {
					if (
						scope.type === "class" &&
						scope.block.id === variable.identifiers[0]
					) {
						continue;
					}
					if (scope.functionExpressionScope) continue;
					if (!config.reportUsedIgnorePattern && variable.eslintUsed) continue;
					if (
						scope.type === "function" &&
						variable.name === "arguments" &&
						variable.identifiers.length === 0
					) {
						continue;
					}
					const def = variable.defs[0];
					if (def) {
						const type = def.type;
						const usedInArrayPattern = variable.references.some(
							ref => ref.identifier.parent.type === "ArrayPattern",
						);
						if (
							(def.name.parent.type === "ArrayPattern" ||
								usedInArrayPattern) &&
							config.destructuredArrayIgnorePattern &&
							config.destructuredArrayIgnorePattern.test(def.name.name)
						) {
							if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
								context.report({
									node: def.name,
									messageId: "usedIgnoredVar",
									data: getUsedIgnoredMessageData(variable, "array-destructure"),
								});
							}
							continue;
						}
						if (type === "ClassName") {
							const hasStaticBlock = def.node.body.body.some(
								n => n.type === "StaticBlock",
							);
							if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) continue;
						}
						if (type === "CatchClause") {
							if (config.caughtErrors === "none") continue;
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
								continue;
							}
						} else if (type === "Parameter") {
							if (
								(def.node.parent.type === "Property" ||
									def.node.parent.type === "MethodDefinition") &&
								def.node.parent.kind === "set"
							) {
								continue;
							}
							if (config.args === "none") continue;
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
								continue;
							}
							if (
								config.args === "after-used" &&
								astUtils.isFunction(def.name.parent) &&
								!isAfterLastUsedArg(variable)
							) {
								continue;
							}
						} else {
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
								continue;
							}
						}
					}
					if (
						!isUsedVariable(variable) &&
						!isExported(variable) &&
						!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
						!hasRestSpreadSibling(variable)
					) {
						unused.push(variable);
					}
				}
			}
			for (const child of scope.childScopes) {
				collectUnusedVariables(child, unused);
			}
			return unused;
		}

		// ----------------------------------------------------------------------
		// Token helpers (used by fixers)
		// ----------------------------------------------------------------------
		function tokenBefore(node) {
			return sourceCode.getTokenBefore(node);
		}
		function tokenAfter(node) {
			return sourceCode.getTokenAfter(node);
		}
		function tokenBeforeValue(node) {
			return tokenBefore(node).value;
		}
		function tokenAfterValue(node) {
			return tokenAfter(node).value;
		}
		function previousTokenStart(node, skips = 0) {
			return sourceCode.getTokenBefore(node, skips).range[0];
		}
		function nextTokenEnd(node, skips = 0) {
			return sourceCode.getTokenAfter(node, skips).range[1];
		}
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}
		function hasImportOfType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}
		function isDeclarationUnsafe(next, prev) {
			return (
				next.type === "String" ||
				(prev && !astUtils.isSemicolonToken(prev) && !astUtils.isOpeningBraceToken(prev))
			);
		}

		// ----------------------------------------------------------------------
		// Fixer delegations
		// ----------------------------------------------------------------------
		function fixVariableDeclarator(node, fixer) {
			const parent = node.parent;
			if (parent.type !== "VariableDeclarator") return null;
			if (isLoop(parent.parent.parent)) return null;

			if (parent.parent.declarations.length === 1) {
				const next = sourceCode.getTokenAfter(parent.parent);
				const prev = sourceCode.getTokenBefore(parent.parent);
				if (next && isDeclarationUnsafe(next, prev)) return null;
				return fixer.removeRange(parent.parent.range);
			}
			if (tokenBeforeValue(parent) === ",") {
				return fixer.removeRange([
					previousTokenStart(parent),
					parent.range[1],
				]);
			}
			return fixer.removeRange([parent.range[0], nextTokenEnd(parent)]);
		}

		function fixObjectPattern(node, fixer) {
			const parent = node.parent;
			if (parent.parent.type !== "ObjectPattern") return null;
			if (parent.parent.properties.length === 1) {
				if (parent.parent.parent.type === "RestElement") {
					return fixRestInPattern(parent.parent.parent, fixer);
				}
				if (parent.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(parent.parent, fixer);
				}
				return fixVariables(parent.parent, fixer);
			}
			if (tokenBeforeValue(node) === ":") {
				if (tokenBeforeValue(parent) === "{" && tokenAfterValue(parent) === ",") {
					return fixer.removeRange([parent.range[0], nextTokenEnd(parent)]);
				}
				return fixer.removeRange([
					previousTokenStart(parent),
					node.range[1],
				]);
			}
			return null;
		}

		function fixArrayPattern(node, fixer) {
			const parent = node.parent;
			if (hasSingleElement(parent)) {
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(parent.parent, fixer);
				}
				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(parent, fixer);
				}
				return fixVariables(parent, fixer);
			}
			if (tokenBeforeValue(node) === "," && tokenAfterValue(node) === "]") {
				return fixer.removeRange([
					previousTokenStart(node),
					node.range[1],
				]);
			}
			return fixer.removeRange(node.range);
		}

		function fixRestInPattern(node, fixer) {
			const parent = node.parent;
			if (astUtils.isFunction(parent)) {
				if (parent.params.length === 1) {
					return fixer.removeRange(node.range);
				}
				return fixer.removeRange([
					previousTokenStart(node),
					node.range[1],
				]);
			}
			if (parent.type === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent, fixer);
					}
					return fixVariables(parent, fixer);
				}
				return fixer.removeRange([
					previousTokenStart(node),
					node.range[1],
				]);
			}
			return null;
		}

		function fixNestedObjectVariable(node, fixer) {
			const parent = node.parent;
			if (
				parent.parent.parent.parent.type === "ObjectPattern" &&
				parent.parent.properties.length === 1
			) {
				return fixNestedObjectVariable(parent.parent, fixer);
			}
			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(parent.parent, fixer);
				}
				if (tokenBeforeValue(parent) === "{") {
					return fixer.removeRange([parent.range[0], nextTokenEnd(parent)]);
				}
				return fixer.removeRange([
					previousTokenStart(parent),
					parent.range[1],
				]);
			}
			return null;
		}

		function fixNestedArrayVariable(node, fixer) {
			const parent = node.parent;
			if (
				parent.parent.type === "ArrayPattern" &&
				hasSingleElement(parent)
			) {
				return fixNestedArrayVariable(parent, fixer);
			}
			if (hasSingleElement(parent)) {
				if (tokenBeforeValue(parent) === ":") {
					return fixVariables(parent, fixer);
				}
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(parent.parent, fixer);
				}
				return fixVariables(parent, fixer);
			}
			if (tokenBeforeValue(node) === "," && tokenAfterValue(node) === "]") {
				return fixer.removeRange([
					previousTokenStart(node),
					node.range[1],
				]);
			}
			return fixer.removeRange(node.range);
		}

		function fixObjectWithValueSeparator(node, fixer) {
			const parent = node.parent.parent;
			if (parent.parent.type === "ArrayPattern" && parent.properties.length === 1) {
				return fixNestedArrayVariable(parent, fixer);
			}
			return fixNestedObjectVariable(node, fixer);
		}

		function fixFunctionParameters(node, fixer) {
			const parent = node.parent;
			if (!astUtils.isFunction(parent)) return null;
			if (parent.params.length === 1) {
				return fixer.removeRange(node.range);
			}
			if (tokenBeforeValue(node) === "(" && tokenAfterValue(node) === ",") {
				return fixer.removeRange([node.range[0], nextTokenEnd(node)]);
			}
			return fixer.removeRange([
				previousTokenStart(node),
				node.range[1],
			]);
		}

		function fixImport(node, fixer) {
			const parent = node.parent;
			const tokenAfterNode = tokenAfter(node);
			if (node.type === "ImportDefaultSpecifier") {
				if (
					!hasImportOfType(parent, "ImportSpecifier") &&
					!hasImportOfType(parent, "ImportNamespaceSpecifier")
				) {
					return fixer.removeRange([node.range[0], parent.source.range[0]]);
				}
				return fixer.removeRange([node.range[0], tokenAfterNode.range[1]]);
			}
			if (node.type === "ImportSpecifier") {
				const specifiers = parent.specifiers.filter(e => e.type === "ImportSpecifier");
				if (specifiers.length === 1) {
					if (!hasImportOfType(parent, "ImportDefaultSpecifier")) {
						return fixer.removeRange(parent.range);
					}
					return fixer.removeRange([
						previousTokenStart(node, 1),
						tokenAfterNode.range[1],
					]);
				}
				if (tokenBeforeValue(node) === "{") {
					return fixer.removeRange([node.range[0], nextTokenEnd(node)]);
				}
				return fixer.removeRange([
					previousTokenStart(node),
					node.range[1],
				]);
			}
			if (node.type === "ImportNamespaceSpecifier") {
				if (hasImportOfType(parent, "ImportDefaultSpecifier")) {
					return fixer.removeRange([
						previousTokenStart(node),
						node.range[1],
					]);
				}
				return fixer.removeRange([node.range[0], parent.source.range[0]]);
			}
			return null;
		}

		function fixClassDeclaration(node, fixer) {
			return fixer.removeRange(node.parent.range);
		}

		function fixSequence(node, fixer) {
			const tokenBeforeNode = tokenBefore(node);
			if (tokenBeforeNode?.value === ",") {
				return fixer.removeRange([tokenBeforeNode.range[0], node.range[1]]);
			}
			return null;
		}

		function fixArrowFunction(node, fixer) {
			const parent = node.parent;
			if (parent.type === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfterValue(node) !== ")") {
				return fixer.replaceText(node, "()");
			}
			return null;
		}

		function fixVariables(node, fixer) {
			const parent = node.parent;
			if (parent.type === "VariableDeclarator") return fixVariableDeclarator(node, fixer);
			if (parent.parent.type === "ObjectPattern") return fixObjectPattern(node, fixer);
			if (parent.type === "ArrayPattern") return fixArrayPattern(node, fixer);
			if (parent.type === "RestElement") return fixRestInPattern(parent, fixer);
			if (parent.type === "AssignmentPattern") {
				if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent, fixer);
				if (parent.parent.parent.type === "ObjectPattern") {
					if (parent.parent.parent.properties.length === 1) {
						if (parent.parent.parent.parent.type === "ArrayPattern") {
							return fixNestedArrayVariable(parent.parent.parent, fixer);
						}
						return fixVariables(parent.parent.parent, fixer);
					}
					if (tokenBeforeValue(parent.parent) === "{" && tokenAfterValue(parent.parent) === ",") {
						return fixer.removeRange([
							parent.parent.range[0],
							nextTokenEnd(parent.parent),
						]);
					}
					return fixer.removeRange([
						previousTokenStart(parent.parent),
						parent.parent.range[1],
					]);
				}
				if (astUtils.isFunction(parent.parent)) {
					return fixFunctionParameters(parent, fixer);
				}
			}
			if (parent.type === "FunctionDeclaration" && parent.id === node) {
				return fixer.removeRange(parent.range);
			}
			if (parent.type === "ImportDefaultSpecifier" || parent.type === "ImportSpecifier" || parent.type === "ImportNamespaceSpecifier") {
				return fixImport(parent, fixer);
			}
			if (parent.type === "ClassDeclaration") {
				return fixClassDeclaration(node, fixer);
			}
			if (parent.type === "CatchClause") return null;
			if (parent.type === "ArrowFunctionExpression") return fixArrowFunction(node, fixer);
			return fixer.removeRange(node.range);
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
				for (const unusedVar of unusedVars) {
					if (unusedVar.defs.length > 0) {
						const writeRefs = unusedVar.references.filter(
							ref =>
								ref.isWrite() &&
								ref.from.variableScope === unusedVar.scope.variableScope,
						);
						const refToReport = writeRefs.length ? writeRefs.at(-1) : null;
						context.report({
							node: refToReport ? refToReport.identifier : unusedVar.identifiers[0],
							messageId: "unusedVar",
							data: unusedVar.references.some(r => r.isWrite())
								? getAssignedMessageData(unusedVar)
								: getDefinedMessageData(unusedVar),
							suggest: [
								{
									messageId: "removeVar",
									data: { varName: unusedVar.name },
									fix(fixer) {
										return fixVariables(unusedVar.identifiers[0], fixer);
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
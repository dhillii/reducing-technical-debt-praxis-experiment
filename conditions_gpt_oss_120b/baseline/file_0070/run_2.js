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

		const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

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
			if (pattern && variableDescription) {
				return `. Allowed unused ${variableDescription} must match ${pattern}`;
			}
			return "";
		}

		function getDefinedMessageData(unusedVar) {
			const def = unusedVar.defs?.[0];
			if (!def) {
				return { varName: unusedVar.name, action: "defined", additional: "" };
			}
			const [desc, pat] = getVariableDescription(defToVariableType(def));
			return {
				varName: unusedVar.name,
				action: "defined",
				additional: formatAdditional(desc, pat?.toString()),
			};
		}

		function getAssignedMessageData(unusedVar) {
			const def = unusedVar.defs?.[0];
			if (!def) {
				return { varName: unusedVar.name, action: "assigned a value", additional: "" };
			}
			const [desc, pat] = getVariableDescription(defToVariableType(def));
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
				additional: desc && pat ? `. Used ${desc} must not match ${pat}` : "",
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
			const defs = variable.defs;
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
			if (target.type === "VariableDeclarator") target = target.parent.parent;
			if (!["ForInStatement", "ForOfStatement"].includes(target.type)) return false;
			if (target.body.type === "BlockStatement") target = target.body.body[0];
			else target = target.body;
			if (!target) return false;
			return target.type === "ReturnStatement";
		}

		function isAfterLastUsedArg(variable) {
			const def = variable.defs?.[0];
			if (!def) return true;
			const params = sourceCode.getDeclaredVariables(def.node);
			const later = params.slice(params.indexOf(variable) + 1);
			return !later.some(v => v.references.length > 0 || v.eslintUsed);
		}

		function shouldSkipVariable(variable) {
			const def = variable.defs?.[0];
			if (!def) return false;

			const type = def.type;
			const name = def.name?.name ?? "";

			// class name in class scope
			if (variable.scope.type === "class" && variable.scope.block.id === variable.identifiers[0]) {
				return true;
			}
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
			// array destructuring ignore pattern
			if (
				(def.name.parent.type === "ArrayPattern" ||
					variable.references.some(r => r.identifier.parent.type === "ArrayPattern")) &&
				config.destructuredArrayIgnorePattern?.test(name)
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
			// class static block
			if (type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
			}
			// catch clause
			if (type === "CatchClause") {
				if (config.caughtErrors === "none") return true;
				if (config.caughtErrorsIgnorePattern?.test(name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: getUsedIgnoredMessageData(variable, "catch-clause"),
						});
					}
					return true;
				}
			}
			// parameters
			if (type === "Parameter") {
				if (
					(def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set"
				) {
					return true;
				}
				if (config.args === "none") return true;
				if (config.argsIgnorePattern?.test(name)) {
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
			}
			// generic vars ignore pattern
			if (config.varsIgnorePattern?.test(name)) {
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

		function collectUnusedVariables(scope, result) {
			if (scope.type !== "global" && config.vars !== "all") {
				// skip non-global scopes when vars option is not "all"
			}
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
			scope.childScopes.forEach(child => collectUnusedVariables(child, result));
			return result;
		}

		// ----------------------------------------------------------------------
		// Fix handling (split into small helpers)
		// ----------------------------------------------------------------------

		function getTokenInfo(node) {
			return {
				before: sourceCode.getTokenBefore(node),
				after: sourceCode.getTokenAfter(node),
				beforeValue: sourceCode.getTokenBefore(node)?.value,
				afterValue: sourceCode.getTokenAfter(node)?.value,
			};
		}

		function isDeclarationNotSafe(nextToken, prevToken) {
			return (
				nextToken.type === "String" ||
				(prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken))
			);
		}

		function fixFunctionParameter(node, fixer) {
			const parent = node.parent;
			if (!astUtils.isFunction(parent)) return null;
			if (parent.params.length === 1) {
				return fixer.removeRange(node.range);
			}
			if (sourceCode.getTokenBefore(node).value === "(" && sourceCode.getTokenAfter(node).value === ",") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
		}

		function fixVariableDeclarator(node, fixer) {
			const parent = node.parent;
			if (astUtils.isLoop(parent.parent.parent)) return null;
			if (parent.parent.declarations.length === 1) {
				const next = sourceCode.getTokenAfter(parent.parent);
				const prev = sourceCode.getTokenBefore(parent.parent);
				if (next && isDeclarationNotSafe(next, prev)) return null;
				return fixer.removeRange(parent.parent.range);
			}
			if (sourceCode.getTokenBefore(parent).value === ",") {
				return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
			}
			return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
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
			if (sourceCode.getTokenBefore(node).value === ":") {
				if (sourceCode.getTokenBefore(parent).value === "{" && sourceCode.getTokenAfter(parent).value === ",") {
					return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], node.range[1]]);
			}
			return null;
		}

		function fixRestInPattern(node, fixer) {
			const parent = node.parent;
			if (astUtils.isFunction(parent)) {
				if (parent.params.length === 1) return fixer.removeRange(node.range);
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			if (parent.type === "ArrayPattern") {
				if (parent.elements.filter(e => e !== null).length === 1) {
					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent, fixer);
					}
					return fixVariables(parent, fixer);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node, 1).range[0], node.range[1]]);
			}
			return null;
		}

		function fixNestedArrayVariable(node, fixer) {
			const parent = node.parent;
			if (parent.type === "ArrayPattern" && node.elements.filter(e => e !== null).length === 1) {
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(parent.parent, fixer);
				}
				return fixVariables(parent, fixer);
			}
			if (sourceCode.getTokenBefore(node).value === "," && sourceCode.getTokenAfter(node).value === "]") {
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return fixer.removeRange(node.range);
		}

		function fixVariables(node, fixer) {
			const parent = node.parent;
			if (parent.type === "VariableDeclarator") return fixVariableDeclarator(node, fixer);
			if (sourceCode.getTokenBefore(node).value === ":") {
				if (parent.parent.type === "ObjectPattern") return fixObjectWithValueSeparator(node, fixer);
			}
			return fixFunctionParameter(node, fixer);
		}

		function fixObjectWithValueSeparator(node, fixer) {
			const parent = node.parent.parent;
			if (parent.parent.type === "ArrayPattern" && parent.properties.length === 1) {
				return fixNestedArrayVariable(parent, fixer);
			}
			return fixNestedObjectVariable(node, fixer);
		}

		function fixNestedObjectVariable(node, fixer) {
			const parent = node.parent;
			if (parent.parent.parent.parent.type === "ObjectPattern" && parent.parent.properties.length === 1) {
				return fixNestedObjectVariable(parent.parent, fixer);
			}
			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(parent.parent, fixer);
				}
				if (sourceCode.getTokenBefore(node).value === "{") {
					return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}

		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

			if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

			switch (parent.type) {
				case "VariableDeclarator":
					return fixVariableDeclarator(id, fixer);
				case "ObjectPattern":
					return fixObjectPattern(id, fixer);
				case "ArrayPattern":
					return fixNestedArrayVariable(parent, fixer);
				case "RestElement":
					return fixRestInPattern(parent, fixer);
				case "AssignmentPattern":
					if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent, fixer);
					if (parent.parent.parent.type === "ObjectPattern") {
						if (parent.parent.parent.properties.length === 1) {
							if (parent.parent.parent.parent.type === "ArrayPattern") {
								return fixNestedArrayVariable(parent.parent.parent, fixer);
							}
							return fixVariables(parent.parent.parent, fixer);
						}
						if (sourceCode.getTokenBefore(parent.parent).value === "{" && sourceCode.getTokenAfter(parent.parent).value === ",") {
							return fixer.removeRange([parent.parent.range[0], sourceCode.getTokenAfter(parent.parent).range[1]]);
						}
						return fixer.removeRange([sourceCode.getTokenBefore(parent.parent).range[0], parent.parent.range[1]]);
					}
					if (astUtils.isFunction(parent.parent)) return fixFunctionParameter(parent, fixer);
					break;
				case "FunctionDeclaration":
					if (parent.id === id) return fixer.removeRange(parent.range);
					break;
				case "ImportDefaultSpecifier":
					if (!hasImportOfCertainType(parent.parent, "ImportSpecifier") && !hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")) {
						return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
					}
					return fixer.removeRange([id.range[0], sourceCode.getTokenAfter(id).range[1]]);
				case "ImportSpecifier":
					if (parent.parent.specifiers.filter(e => e.type === "ImportSpecifier").length === 1) {
						if (!hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
							return fixer.removeRange(parent.parent.range);
						}
						return fixer.removeRange([sourceCode.getTokenBefore(parent, 1).range[0], sourceCode.getTokenAfter(parent).range[1]]);
					}
					if (sourceCode.getTokenBefore(parent).value === "{") {
						return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
					}
					return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
				case "ImportNamespaceSpecifier":
					if (hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
						return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
					}
					return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
				case "CatchClause":
					return null;
				case "ClassDeclaration":
					return fixer.removeRange(parent.range);
				default:
					if (sourceCode.getTokenBefore(id)?.value === ",") {
						return fixer.removeRange([sourceCode.getTokenBefore(id).range[0], id.range[1]]);
					}
					if (sourceCode.getTokenAfter(id).value === ",") {
						if (sourceCode.getTokenBefore(id).value === "(") {
							return fixer.removeRange([id.range[0], sourceCode.getTokenAfter(id).range[1]]);
						}
						if (sourceCode.getTokenBefore(id).value === "{") {
							return fixer.removeRange([id.range[0], sourceCode.getTokenAfter(id).range[1]]);
						}
					}
					if (parent.type === "ArrowFunctionExpression" && parent.params.length === 1 && sourceCode.getTokenAfter(id)?.value !== ")") {
						return fixer.replaceText(id, "()");
					}
					return fixer.removeRange(id.range);
			}
			return null;
		}

		// ----------------------------------------------------------------------
		// Public
		// ----------------------------------------------------------------------

		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(sourceCode.getScope(programNode), []);
				unusedVars.forEach(unusedVar => {
					if (unusedVar.defs.length > 0) {
						const writeRefs = unusedVar.references.filter(
							ref => ref.isWrite() && ref.from.variableScope === unusedVar.scope.variableScope,
						);
						const reportNode = writeRefs.length ? writeRefs.at(-1).identifier : unusedVar.identifiers[0];
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
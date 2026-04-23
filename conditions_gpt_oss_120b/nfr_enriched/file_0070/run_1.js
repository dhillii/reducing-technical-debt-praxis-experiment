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
						firstOption.ignoreRestSiblings || config.ignoreRestSiblings,
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
				const [desc, pat] = getVariableDescription(defToVariableType(def));
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
			const refScope = ref.from.variableScope;
			const varScope = ref.resolved.scope.variableScope;
			const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);
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
			if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") return false;
			if (target.body.type === "BlockStatement") target = target.body.body[0];
			else target = target.body;
			if (!target) return false;
			return target.type === "ReturnStatement";
		}
		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const later = params.slice(params.indexOf(variable) + 1);
			return !later.some(v => v.references.length > 0 || v.eslintUsed);
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
		function shouldSkipVariable(variable) {
			const def = variable.defs[0];
			if (!def) return false;
			const type = def.type;
			if (type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
			}
			if (type === "CatchClause") {
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
			} else if (type === "Parameter") {
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
			} else {
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
				if (
					def.name.parent.type === "ArrayPattern" ||
					variable.references.some(r => r.identifier.parent.type === "ArrayPattern")
				) {
					if (
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
				}
			}
			return false;
		}
		function collectUnusedVariables(scope, unused) {
			if (scope.type !== "global" || config.vars === "all") {
				scope.variables.forEach(variable => {
					if (
						scope.type === "class" &&
						scope.block.id === variable.identifiers[0]
					) {
						return;
					}
					if (scope.functionExpressionScope) return;
					if (!config.reportUsedIgnorePattern && variable.eslintUsed) return;
					if (
						scope.type === "function" &&
						variable.name === "arguments" &&
						variable.identifiers.length === 0
					) {
						return;
					}
					if (shouldSkipVariable(variable)) return;
					if (
						!isUsedVariable(variable) &&
						!isExported(variable) &&
						!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
						!hasRestSpreadSibling(variable)
					) {
						unused.push(variable);
					}
				});
			}
			scope.childScopes.forEach(child => collectUnusedVariables(child, unused));
			return unused;
		}

		// ----------------------------------------------------------------------
		// Token helpers (used by fixers)
		// ----------------------------------------------------------------------
		function tokenBefore(node, skips = 0) {
			return sourceCode.getTokenBefore(node, skips);
		}
		function tokenAfter(node, skips = 0) {
			return sourceCode.getTokenAfter(node, skips);
		}
		function tokenBeforeValue(node) {
			return tokenBefore(node).value;
		}
		function tokenAfterValue(node) {
			return tokenAfter(node).value;
		}
		function previousTokenStart(node, skips = 0) {
			return tokenBefore(node, skips).range[0];
		}
		function nextTokenEnd(node, skips = 0) {
			return tokenAfter(node, skips).range[1];
		}
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}
		function hasImportOfType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}
		function isDeclarationUnsafe(nextToken, prevToken) {
			return (
				nextToken.type === "String" ||
				(prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken))
			);
		}

		// ----------------------------------------------------------------------
		// Fixer functions (each small and focused)
		// ----------------------------------------------------------------------
		function fixFunctionParameters(node, fixer) {
			const parent = node.parent;
			if (!astUtils.isFunction(parent)) return null;
			if (parent.params.length === 1) {
				return fixer.removeRange(node.range);
			}
			if (tokenBeforeValue(node) === "(" && tokenAfterValue(node) === ",") {
				return fixer.removeRange([node.range[0], nextTokenEnd(node)]);
			}
			return fixer.removeRange([previousTokenStart(node), node.range[1]]);
		}

		function fixVariableDeclarator(node, fixer) {
			const parent = node.parent;
			if (astUtils.isLoop(parent.parent.parent)) return null;
			if (parent.parent.declarations.length === 1) {
				const next = tokenAfter(parent.parent);
				const prev = tokenBefore(parent.parent);
				if (next && isDeclarationUnsafe(next, prev)) return null;
				return fixer.removeRange(parent.parent.range);
			}
			if (tokenBeforeValue(parent) === ",") {
				return fixer.removeRange([previousTokenStart(parent), parent.range[1]]);
			}
			return fixer.removeRange([parent.range[0], nextTokenEnd(parent)]);
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
				if (tokenBeforeValue(parent) === "{") {
					return fixer.removeRange([parent.range[0], nextTokenEnd(parent)]);
				}
				return fixer.removeRange([previousTokenStart(parent), parent.range[1]]);
			}
			return null;
		}

		function fixNestedArrayVariable(node, fixer) {
			const parent = node.parent;
			if (parent.parent.type === "ArrayPattern" && hasSingleElement(parent)) {
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
				return fixer.removeRange([previousTokenStart(node), node.range[1]]);
			}
			return fixer.removeRange(node.range);
		}

		function fixRestInPattern(node, fixer) {
			const parent = node.parent;
			if (astUtils.isFunction(parent)) {
				if (parent.params.length === 1) return fixer.removeRange(node.range);
				return fixer.removeRange([previousTokenStart(node), node.range[1]]);
			}
			if (parent.type === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent, fixer);
					}
					return fixVariables(parent, fixer);
				}
				return fixer.removeRange([previousTokenStart(node), node.range[1]]);
			}
			return null;
		}

		function fixVariables(node, fixer) {
			const parent = node.parent;
			if (parent.type === "VariableDeclarator") {
				return fixVariableDeclarator(node, fixer);
			}
			if (tokenBeforeValue(node) === ":") {
				if (parent.parent.type === "ObjectPattern") {
					return fixObjectWithValueSeparator(node, fixer);
				}
			}
			return fixFunctionParameters(node, fixer);
		}

		// ----------------------------------------------------------------------
		// Main fixer dispatcher
		// ----------------------------------------------------------------------
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;
			const tokenBeforeNode = tokenBefore(id);
			const tokenAfterNode = tokenAfter(id);
			const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

			if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

			// VariableDeclarator
			if (parentType === "VariableDeclarator") {
				return fixVariableDeclarator(id, fixer);
			}

			// ObjectPattern
			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					if (parent.parent.parent.type === "RestElement") {
						return fixRestInPattern(parent.parent.parent, fixer);
					}
					if (parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent.parent, fixer);
					}
					return fixVariables(parent.parent, fixer);
				}
				if (tokenBeforeNode.value === ":") {
					if (tokenBeforeValue(parent) === "{" && tokenAfterValue(parent) === ",") {
						return fixer.removeRange([parent.range[0], nextTokenEnd(parent)]);
					}
					return fixer.removeRange([previousTokenStart(parent), id.range[1]]);
				}
			}

			// ArrayPattern
			if (parentType === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "RestElement") {
						return fixRestInPattern(parent.parent, fixer);
					}
					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent, fixer);
					}
					return fixVariables(parent, fixer);
				}
				if (tokenBeforeNode.value === "," && tokenAfterNode.value === ",") {
					return fixer.removeRange(id.range);
				}
			}

			// RestElement
			if (parentType === "RestElement") {
				if (parent.parent.type === "ArrayPattern") {
					if (hasSingleElement(parent.parent)) {
						if (parent.parent.parent.type === "ArrayPattern") {
							return fixNestedArrayVariable(parent.parent, fixer);
						}
						return fixVariables(parent.parent, fixer);
					}
					return fixer.removeRange([previousTokenStart(id, 1), id.range[1]]);
				}
				if (parent.parent.type === "ObjectPattern") {
					if (parent.parent.properties.length === 1) {
						return fixVariables(parent.parent, fixer);
					}
					return fixer.removeRange([previousTokenStart(id, 1), id.range[1]]);
				}
				if (astUtils.isFunction(parent.parent)) {
					if (parent.parent.params.length === 1) {
						return fixer.removeRange(parent.range);
					}
					return fixer.removeRange([previousTokenStart(parent), parent.range[1]]);
				}
			}

			// AssignmentPattern
			if (parentType === "AssignmentPattern") {
				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(parent, fixer);
				}
				if (parent.parent.parent.type === "ObjectPattern") {
					if (parent.parent.parent.properties.length === 1) {
						if (parent.parent.parent.parent.type === "ArrayPattern") {
							return fixNestedArrayVariable(parent.parent.parent, fixer);
						}
						return fixVariables(parent.parent.parent, fixer);
					}
					if (tokenBeforeValue(parent.parent) === "{" && tokenAfterValue(parent.parent) === ",") {
						return fixer.removeRange([parent.parent.range[0], nextTokenEnd(parent.parent)]);
					}
					return fixer.removeRange([previousTokenStart(parent.parent), parent.parent.range[1]]);
				}
				if (astUtils.isFunction(parent.parent)) {
					return fixFunctionParameters(parent, fixer);
				}
			}

			// FunctionDeclaration
			if (parentType === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}

			// Imports
			if (parentType === "ImportDefaultSpecifier") {
				if (
					!hasImportOfType(parent.parent, "ImportSpecifier") &&
					!hasImportOfType(parent.parent, "ImportNamespaceSpecifier")
				) {
					return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
				}
				return fixer.removeRange([id.range[0], tokenAfterNode.range[1]]);
			}
			if (parentType === "ImportSpecifier") {
				const specifiers = parent.parent.specifiers.filter(e => e.type === "ImportSpecifier");
				if (specifiers.length === 1) {
					if (!hasImportOfType(parent.parent, "ImportDefaultSpecifier")) {
						return fixer.removeRange(parent.parent.range);
					}
					return fixer.removeRange([previousTokenStart(parent, 1), tokenAfterNode.range[1]]);
				}
				if (tokenBeforeValue(parent) === "{") {
					return fixer.removeRange([parent.range[0], nextTokenEnd(parent)]);
				}
				return fixer.removeRange([previousTokenStart(parent), parent.range[1]]);
			}
			if (parentType === "ImportNamespaceSpecifier") {
				if (hasImportOfType(parent.parent, "ImportDefaultSpecifier")) {
					return fixer.removeRange([previousTokenStart(parent), parent.range[1]]);
				}
				return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
			}

			// CatchClause
			if (parentType === "CatchClause") return null;

			// ClassDeclaration
			if (parentType === "ClassDeclaration") return fixer.removeRange(parent.range);

			// Sequence commas
			if (tokenBeforeNode?.value === ",") {
				return fixer.removeRange([tokenBeforeNode.range[0], id.range[1]]);
			}
			if (tokenAfterNode.value === ",") {
				if (tokenBeforeValue(id) === "(") {
					return fixer.removeRange([id.range[0], tokenAfterNode.range[1]]);
				}
				if (tokenBeforeValue(id) === "{") {
					return fixer.removeRange([id.range[0], tokenAfterNode.range[1]]);
				}
			}
			if (parentType === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfterNode?.value !== ")") {
				return fixer.replaceText(id, "()");
			}
			return fixer.removeRange(id.range);
		}

		// ----------------------------------------------------------------------
		// Public listeners
		// ----------------------------------------------------------------------
		return {
			"Program:exit"(programNode) {
				const unused = collectUnusedVariables(sourceCode.getScope(programNode), []);
				unused.forEach(unusedVar => {
					if (unusedVar.defs.length > 0) {
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
							loc: astUtils.getNameLocationInGlobalDirectiveComment(
								sourceCode,
								comment,
								unusedVar.name,
							),
							messageId: "unusedVar",
							data: getDefinedMessageData(unusedVar),
						});
					}
				});
			},
		};
	},
};
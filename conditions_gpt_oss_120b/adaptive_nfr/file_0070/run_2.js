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

		// ----------------------------------------------------------------------
		// Configuration parsing
		// ----------------------------------------------------------------------
		const firstOption = context.options[0];
		if (firstOption) {
			if (typeof firstOption === "string") {
				config.vars = firstOption;
			} else {
				config.vars = firstOption.vars || config.vars;
				config.args = firstOption.args || config.args;
				config.ignoreRestSiblings =
					firstOption.ignoreRestSiblings || config.ignoreRestSiblings;
				config.caughtErrors =
					firstOption.caughtErrors || config.caughtErrors;
				config.ignoreClassWithStaticInitBlock =
					firstOption.ignoreClassWithStaticInitBlock ||
					config.ignoreClassWithStaticInitBlock;
				config.ignoreUsingDeclarations =
					firstOption.ignoreUsingDeclarations ||
					config.ignoreUsingDeclarations;
				config.reportUsedIgnorePattern =
					firstOption.reportUsedIgnorePattern ||
					config.reportUsedIgnorePattern;

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
		// Utility predicates
		// ----------------------------------------------------------------------
		/** @returns {VariableType} */
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

		/** @returns {[string|undefined,string|undefined]} */
		function getVariableDescription(variableType) {
			switch (variableType) {
				case "array-destructure":
					return ["elements of array destructuring", config.destructuredArrayIgnorePattern?.toString()];
				case "catch-clause":
					return ["caught errors", config.caughtErrorsIgnorePattern?.toString()];
				case "parameter":
					return ["args", config.argsIgnorePattern?.toString()];
				case "variable":
					return ["vars", config.varsIgnorePattern?.toString()];
				default:
					throw new Error(`Unexpected variable type: ${variableType}`);
			}
		}

		/** @returns {UnusedVarMessageData} */
		function getDefinedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			if (!def) {
				return { varName: unusedVar.name, action: "defined", additional: "" };
			}
			const [desc, pattern] = getVariableDescription(defToVariableType(def));
			const additional = pattern && desc ? `. Allowed unused ${desc} must match ${pattern}` : "";
			return { varName: unusedVar.name, action: "defined", additional };
		}

		/** @returns {UnusedVarMessageData} */
		function getAssignedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			if (!def) {
				return { varName: unusedVar.name, action: "assigned a value", additional: "" };
			}
			const [desc, pattern] = getVariableDescription(defToVariableType(def));
			const additional = pattern && desc ? `. Allowed unused ${desc} must match ${pattern}` : "";
			return { varName: unusedVar.name, action: "assigned a value", additional };
		}

		/** @returns {UsedIgnoredVarMessageData} */
		function getUsedIgnoredMessageData(variable, variableType) {
			const [desc, pattern] = getVariableDescription(variableType);
			const additional = pattern && desc ? `. Used ${desc} must not match ${pattern}` : "";
			return { varName: variable.name, additional };
		}

		/** @returns {boolean} */
		function isExported(variable) {
			const definition = variable.defs[0];
			if (!definition) return false;
			let node = definition.node;
			if (node.type === "VariableDeclarator") node = node.parent;
			else if (definition.type === "Parameter") return false;
			return node.parent.type.indexOf("Export") === 0;
		}

		/** @returns {boolean} */
		function usesExplicitResourceManagement(variable) {
			const [definition] = variable.defs;
			return (
				definition?.type === "Variable" &&
				(definition.parent.kind === "using" ||
					definition.parent.kind === "await using")
			);
		}

		/** @returns {boolean} */
		function hasRestSibling(node) {
			return (
				node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
			);
		}

		/** @returns {boolean} */
		function hasRestSpreadSibling(variable) {
			if (!config.ignoreRestSiblings) return false;
			const hasDef = variable.defs.some(def => hasRestSibling(def.name.parent));
			const hasRef = variable.references.some(ref => hasRestSibling(ref.identifier.parent));
			return hasDef || hasRef;
		}

		/** @returns {boolean} */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/** @returns {boolean} */
		function isSelfReference(ref, nodes) {
			let scope = ref.from;
			while (scope) {
				if (nodes.includes(scope.block)) return true;
				scope = scope.upper;
			}
			return false;
		}

		/** @returns {ASTNode[]} */
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

		/** @returns {boolean} */
		function isInside(inner, outer) {
			return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
		}

		/** @returns {boolean} */
		function isUnusedExpression(node) {
			const parent = node.parent;
			if (parent.type === "ExpressionStatement") return true;
			if (parent.type === "SequenceExpression") {
				const isLast = parent.expressions.at(-1) === node;
				return isLast ? isUnusedExpression(parent) : true;
			}
			return false;
		}

		/** @returns {ASTNode|null} */
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

		/** @returns {boolean} */
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
						if (/Statement|Declaration$/u.test(parent.type)) return true;
				}
				node = parent;
				parent = parent.parent;
			}
			return false;
		}

		/** @returns {boolean} */
		function isInsideOfStorableFunction(id, rhsNode) {
			const funcNode = astUtils.getUpperFunction(id);
			return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
		}

		/** @returns {boolean} */
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

		/** @returns {boolean} */
		function isForInOfRef(ref) {
			let target = ref.identifier.parent;
			if (target.type === "VariableDeclarator") target = target.parent.parent;
			if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") return false;
			if (target.body.type === "BlockStatement") target = target.body.body[0];
			else target = target.body;
			if (!target) return false;
			return target.type === "ReturnStatement";
		}

		/** @returns {boolean} */
		function isUsedVariable(variable) {
			if (variable.eslintUsed) return true;
			const functionDefs = getFunctionDefinitions(variable);
			const isFuncDef = functionDefs.length > 0;
			let rhsNode = null;
			return variable.references.some(ref => {
				if (isForInOfRef(ref)) return true;
				const self = isReadForItself(ref, rhsNode);
				rhsNode = getRhsNode(ref, rhsNode);
				return (
					isReadRef(ref) &&
					!self &&
					!(isFuncDef && isSelfReference(ref, functionDefs))
				);
			});
		}

		/** @returns {boolean} */
		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const later = params.slice(params.indexOf(variable) + 1);
			return !later.some(v => v.references.length > 0 || v.eslintUsed);
		}

		/** @returns {boolean} */
		function shouldSkipClassName(def) {
			if (def.type !== "ClassName") return false;
			const hasStatic = def.node.body.body.some(node => node.type === "StaticBlock");
			return config.ignoreClassWithStaticInitBlock && hasStatic;
		}

		/** @returns {boolean} */
		function shouldSkipCatchClause(variable, def) {
			if (def.type !== "CatchClause") return false;
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

		/** @returns {boolean} */
		function shouldSkipParameter(variable, def) {
			if (def.type !== "Parameter") return false;
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

		/** @returns {boolean} */
		function shouldSkipVariableIgnore(variable, def) {
			if (!def) return false;
			const type = def.type;
			if (type === "ClassName") return false;
			if (type === "CatchClause") return false;
			if (type === "Parameter") return false;
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

		/** @returns {boolean} */
		function shouldAddUnusedVariable(variable) {
			// class name self reference
			if (
				variable.scope.type === "class" &&
				variable.scope.block.id === variable.identifiers[0]
			) {
				return false;
			}
			// function expression name
			if (variable.scope.functionExpressionScope) return false;
			// eslintUsed flag
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) return false;
			// implicit arguments
			if (
				variable.scope.type === "function" &&
				variable.name === "arguments" &&
				variable.identifiers.length === 0
			) {
				return false;
			}
			const def = variable.defs[0];
			if (def) {
				if (shouldSkipClassName(def)) return false;
				if (shouldSkipCatchClause(variable, def)) return false;
				if (shouldSkipParameter(variable, def)) return false;
				if (shouldSkipVariableIgnore(variable, def)) return false;
			}
			if (isUsedVariable(variable)) return false;
			if (isExported(variable)) return false;
			if (config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable))
				return false;
			if (hasRestSpreadSibling(variable)) return false;
			return true;
		}

		/** @returns {Variable[]} */
		function collectUnusedVariables(scope, unusedVars) {
			if (!(scope.type === "global" && config.vars !== "all")) {
				for (const variable of scope.variables) {
					if (shouldAddUnusedVariable(variable)) {
						unusedVars.push(variable);
					}
				}
			}
			for (const child of scope.childScopes) {
				collectUnusedVariables(child, unusedVars);
			}
			return unusedVars;
		}

		// ----------------------------------------------------------------------
		// Fix helpers (each small, guard‑clause style)
		// ----------------------------------------------------------------------
		/** @returns {boolean} */
		function isDeclarationNotSafeToRemove(nextToken, prevToken) {
			return (
				nextToken.type === "String" ||
				(prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken))
			);
		}

		/** @returns {boolean} */
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		/** @returns {boolean} */
		function hasImportOfCertainType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}

		/** @returns {Object|null} */
		function fixFunctionParameters(node) {
			const parent = node.parent;
			if (!astUtils.isFunction(parent)) return null;
			if (parent.params.length === 1) return fixer.removeRange(node.range);
			if (sourceCode.getTokenBefore(node).value === "(" && sourceCode.getTokenAfter(node).value === ",") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
		}

		/** @returns {Object|null} */
		function fixVariableDeclarator(node) {
			const parent = node.parent;
			if (parent.type !== "VariableDeclarator") return null;
			if (isLoop(parent.parent.parent)) return null;
			if (parent.parent.declarations.length === 1) {
				const next = sourceCode.getTokenAfter(parent.parent);
				const prev = sourceCode.getTokenBefore(parent.parent);
				if (next && isDeclarationNotSafeToRemove(next, prev)) return null;
				return fixer.removeRange(parent.parent.range);
			}
			if (sourceCode.getTokenBefore(parent).value === ",") {
				return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
			}
			return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
		}

		/** @returns {Object|null} */
		function fixObjectPattern(node) {
			const parent = node.parent;
			if (parent.type !== "ObjectPattern") return null;
			if (parent.properties.length === 1) {
				if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent);
				if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
				return fixVariables(parent);
			}
			if (sourceCode.getTokenBefore(node).value === ":") {
				if (sourceCode.getTokenBefore(parent).value === "{" && sourceCode.getTokenAfter(parent).value === ",") {
					return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}

		/** @returns {Object|null} */
		function fixArrayPattern(node) {
			const parent = node.parent;
			if (parent.type !== "ArrayPattern") return null;
			if (hasSingleElement(parent)) {
				if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent);
				if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
				return fixVariables(parent);
			}
			if (sourceCode.getTokenBefore(node).value === "," && sourceCode.getTokenAfter(node).value === "]") {
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return fixer.removeRange(node.range);
		}

		/** @returns {Object|null} */
		function fixRestInPattern(node) {
			const parent = node.parent;
			if (astUtils.isFunction(parent)) {
				if (parent.params.length === 1) return fixer.removeRange(node.range);
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			if (parent.type === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
					return fixVariables(parent);
				}
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return null;
		}

		/** @returns {Object|null} */
		function fixImportSpecifier(node) {
			const parent = node.parent;
			if (parent.type !== "ImportSpecifier") return null;
			if (sourceCode.getTokenBefore(node).value === "{") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
		}

		/** @returns {Object|null} */
		function fixImportDefault(node) {
			const parent = node.parent;
			if (parent.type !== "ImportDefaultSpecifier") return null;
			if (!hasImportOfCertainType(parent.parent, "ImportSpecifier") && !hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")) {
				return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
			}
			return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
		}

		/** @returns {Object|null} */
		function fixImportNamespace(node) {
			const parent = node.parent;
			if (parent.type !== "ImportNamespaceSpecifier") return null;
			if (hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
				return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
			}
			return fixer.removeRange([node.range[0], parent.parent.source.range[0]]);
		}

		/** @returns {Object|null} */
		function fixClassDeclaration(node) {
			const parent = node.parent;
			if (parent.type === "ClassDeclaration") return fixer.removeRange(parent.range);
			return null;
		}

		/** @returns {Object|null} */
		function fixCatchClause(node) {
			if (node.parent.type === "CatchClause") return null;
			return null;
		}

		/** @returns {Object|null} */
		function fixArrowFunction(node) {
			const parent = node.parent;
			if (parent.type === "ArrowFunctionExpression" && parent.params.length === 1 && sourceCode.getTokenAfter(node).value !== ")") {
				return fixer.replaceText(node, "()");
			}
			return null;
		}

		/** @returns {Object|null} */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;
			const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

			// Guard: if other write refs exist, abort
			if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

			// VariableDeclarator
			if (parentType === "VariableDeclarator") return fixVariableDeclarator(id);
			// ObjectPattern
			if (parent.parent.type === "ObjectPattern") return fixObjectPattern(id);
			// ArrayPattern
			if (parentType === "ArrayPattern") return fixArrayPattern(id);
			// RestElement
			if (parentType === "RestElement") return fixRestInPattern(parent);
			// AssignmentPattern
			if (parentType === "AssignmentPattern") {
				if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
				if (parent.parent.parent.type === "ObjectPattern") {
					if (parent.parent.parent.properties.length === 1) {
						if (parent.parent.parent.parent.type === "ArrayPattern") {
							return fixNestedArrayVariable(parent.parent.parent);
						}
						return fixVariables(parent.parent.parent);
					}
					if (sourceCode.getTokenBefore(parent.parent) === "{" && sourceCode.getTokenAfter(parent.parent) === ",") {
						return fixer.removeRange([parent.parent.range[0], sourceCode.getTokenAfter(parent.parent).range[1]]);
					}
					return fixer.removeRange([sourceCode.getTokenBefore(parent.parent).range[0], parent.parent.range[1]]);
				}
				if (astUtils.isFunction(parent.parent)) return fixFunctionParameters(parent);
			}
			// FunctionDeclaration
			if (parentType === "FunctionDeclaration" && parent.id === id) return fixer.removeRange(parent.range);
			// ImportDefaultSpecifier
			if (parentType === "ImportDefaultSpecifier") return fixImportDefault(id);
			// ImportSpecifier
			if (parentType === "ImportSpecifier") return fixImportSpecifier(id);
			// ImportNamespaceSpecifier
			if (parentType === "ImportNamespaceSpecifier") return fixImportNamespace(id);
			// ClassDeclaration
			if (parentType === "ClassDeclaration") return fixClassDeclaration(id);
			// CatchClause
			if (parentType === "CatchClause") return fixCatchClause(id);
			// ArrowFunctionExpression
			if (parentType === "ArrowFunctionExpression") return fixArrowFunction(id);
			// Fallback: simple removal
			return fixer.removeRange(id.range);
		}

		// ----------------------------------------------------------------------
		// Public listeners
		// ----------------------------------------------------------------------
		return {
			"Program:exit"(programNode) {
				const unused = collectUnusedVariables(sourceCode.getScope(programNode), []);
				for (let i = 0; i < unused.length; ++i) {
					const variable = unused[i];
					if (variable.defs.length > 0) {
						const writeRefs = variable.references.filter(
							ref => ref.isWrite() && ref.from.variableScope === variable.scope.variableScope,
						);
						const lastWrite = writeRefs.length ? writeRefs.at(-1) : null;
						context.report({
							node: lastWrite ? lastWrite.identifier : variable.identifiers[0],
							messageId: "unusedVar",
							data: variable.references.some(r => r.isWrite())
								? getAssignedMessageData(variable)
								: getDefinedMessageData(variable),
							suggest: [
								{
									messageId: "removeVar",
									data: { varName: variable.name },
									fix(fixer) {
										return handleFixes(fixer, variable);
									},
								},
							],
						});
					} else if (variable.eslintExplicitGlobalComments) {
						const comment = variable.eslintExplicitGlobalComments[0];
						context.report({
							node: programNode,
							loc: astUtils.getNameLocationInGlobalDirectiveComment(
								sourceCode,
								comment,
								variable.name,
							),
							messageId: "unusedVar",
							data: getDefinedMessageData(variable),
						});
					}
				}
			},
		};
	},
};
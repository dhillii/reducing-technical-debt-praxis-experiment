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

		/** @type {Object} */
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
		// Simple helpers
		// ----------------------------------------------------------------------
		/**
		 * Determines what variable type a def is.
		 * @param {Object} def the declaration to check
		 * @returns {VariableType}
		 */
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

		/**
		 * Returns description and ignore pattern for a variable type.
		 * @param {VariableType} variableType
		 * @returns {[string|undefined, string|undefined]}
		 */
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
			if (pattern) {
				pattern = pattern.toString();
			}
			return [description, pattern];
		}

		/**
		 * Builds message data for a defined but unused variable.
		 * @param {Variable} unusedVar
		 * @returns {UnusedVarMessageData}
		 */
		function getDefinedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			if (!def) {
				return {
					varName: unusedVar.name,
					action: "defined",
					additional: "",
				};
			}
			const [desc, pat] = getVariableDescription(defToVariableType(def));
			const additional = pat && desc ? `. Allowed unused ${desc} must match ${pat}` : "";
			return {
				varName: unusedVar.name,
				action: "defined",
				additional,
			};
		}

		/**
		 * Builds message data for an assigned but unused variable.
		 * @param {Variable} unusedVar
		 * @returns {UnusedVarMessageData}
		 */
		function getAssignedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			if (!def) {
				return {
					varName: unusedVar.name,
					action: "assigned a value",
					additional: "",
				};
			}
			const [desc, pat] = getVariableDescription(defToVariableType(def));
			const additional = pat && desc ? `. Allowed unused ${desc} must match ${pat}` : "";
			return {
				varName: unusedVar.name,
				action: "assigned a value",
				additional,
			};
		}

		/**
		 * Builds message data for a used ignored variable.
		 * @param {Variable} variable
		 * @param {VariableType} variableType
		 * @returns {UsedIgnoredVarMessageData}
		 */
		function getUsedIgnoredMessageData(variable, variableType) {
			const [desc, pat] = getVariableDescription(variableType);
			const additional = pat && desc ? `. Used ${desc} must not match ${pat}` : "";
			return {
				varName: variable.name,
				additional,
			};
		}

		// ----------------------------------------------------------------------
		// Predicate helpers (guard‑clause style)
		// ----------------------------------------------------------------------
		/**
		 * Checks whether a variable is exported.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function isExported(variable) {
			const def = variable.defs[0];
			if (!def) return false;
			let node = def.node;
			if (node.type === "VariableDeclarator") {
				node = node.parent;
			} else if (def.type === "Parameter") {
				return false;
			}
			return node.parent.type.indexOf("Export") === 0;
		}

		/**
		 * Checks whether a variable uses explicit resource management.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function usesExplicitResourceManagement(variable) {
			const [def] = variable.defs;
			return (
				def?.type === "Variable" &&
				(def.parent.kind === "using" || def.parent.kind === "await using")
			);
		}

		/**
		 * Checks whether a node is a sibling of a rest property.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function hasRestSibling(node) {
			return (
				node.type === "Property" &&
				node.parent.type === "ObjectPattern" &&
				REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
			);
		}

		/**
		 * Determines if a variable has a sibling rest property.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function hasRestSpreadSibling(variable) {
			if (!config.ignoreRestSiblings) return false;
			const hasDef = variable.defs.some(def => hasRestSibling(def.name.parent));
			const hasRef = variable.references.some(ref => hasRestSibling(ref.identifier.parent));
			return hasDef || hasRef;
		}

		/**
		 * Checks whether a reference is a read operation.
		 * @param {Reference} ref
		 * @returns {boolean}
		 */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/**
		 * Determines if a reference is a self‑reference.
		 * @param {Reference} ref
		 * @param {ASTNode[]} nodes
		 * @returns {boolean}
		 */
		function isSelfReference(ref, nodes) {
			let scope = ref.from;
			while (scope) {
				if (nodes.includes(scope.block)) return true;
				scope = scope.upper;
			}
			return false;
		}

		/**
		 * Returns function definition nodes for a variable.
		 * @param {Variable} variable
		 * @returns {ASTNode[]}
		 */
		function getFunctionDefinitions(variable) {
			const defs = [];
			variable.defs.forEach(def => {
				if (def.type === "FunctionName") {
					defs.push(def.node);
				}
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

		/**
		 * Checks whether `inner` node is inside `outer` node.
		 * @param {ASTNode} inner
		 * @param {ASTNode} outer
		 * @returns {boolean}
		 */
		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1]
			);
		}

		/**
		 * Checks whether a node is an unused expression.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function isUnusedExpression(node) {
			const parent = node.parent;
			if (parent.type === "ExpressionStatement") return true;
			if (parent.type === "SequenceExpression") {
				const isLast = parent.expressions.at(-1) === node;
				return isLast ? isUnusedExpression(parent) : true;
			}
			return false;
		}

		/**
		 * Returns the RHS node of an assignment if the reference is the LHS.
		 * @param {Reference} ref
		 * @param {ASTNode|null} prevRhsNode
		 * @returns {ASTNode|null}
		 */
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

		/**
		 * Determines if a function node is stored somewhere.
		 * @param {ASTNode} funcNode
		 * @param {ASTNode} rhsNode
		 * @returns {boolean}
		 */
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
						if (/(?:Statement|Declaration)$/u.test(parent.type)) return true;
				}
				node = parent;
				parent = parent.parent;
			}
			return false;
		}

		/**
		 * Checks whether an identifier is inside a storable function.
		 * @param {ASTNode} id
		 * @param {ASTNode} rhsNode
		 * @returns {boolean}
		 */
		function isInsideOfStorableFunction(id, rhsNode) {
			const funcNode = astUtils.getUpperFunction(id);
			return (
				funcNode &&
				isInside(funcNode, rhsNode) &&
				isStorableFunction(funcNode, rhsNode)
			);
		}

		/**
		 * Checks whether a reference reads its own value.
		 * @param {Reference} ref
		 * @param {ASTNode|null} rhsNode
		 * @returns {boolean}
		 */
		function isReadForItself(ref, rhsNode) {
			const id = ref.identifier;
			const parent = id.parent;
			const selfUpdate =
				(parent.type === "AssignmentExpression" &&
					parent.left === id &&
					isUnusedExpression(parent) &&
					!astUtils.isLogicalAssignmentOperator(parent.operator)) ||
				(parent.type === "UpdateExpression" && isUnusedExpression(parent));
			const rhsRead = rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode);
			return ref.isRead() && (selfUpdate || rhsRead);
		}

		/**
		 * Determines if a reference is used in a for‑in/of loop.
		 * @param {Reference} ref
		 * @returns {boolean}
		 */
		function isForInOfRef(ref) {
			let target = ref.identifier.parent;
			if (target.type === "VariableDeclarator") {
				target = target.parent.parent;
			}
			if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") {
				return false;
			}
			if (target.body.type === "BlockStatement") {
				target = target.body.body[0];
			} else {
				target = target.body;
			}
			if (!target) return false;
			return target.type === "ReturnStatement";
		}

		/**
		 * Determines if a variable is used.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function isUsedVariable(variable) {
			if (variable.eslintUsed) return true;
			const functionDefs = getFunctionDefinitions(variable);
			const isFuncDef = functionDefs.length > 0;
			let rhsNode = null;

			return variable.references.some(ref => {
				if (isForInOfRef(ref)) return true;
				const selfRead = isReadForItself(ref, rhsNode);
				rhsNode = getRhsNode(ref, rhsNode);
				const read = isReadRef(ref);
				const selfFunc = isFuncDef && isSelfReference(ref, functionDefs);
				return read && !selfRead && !selfFunc;
			});
		}

		/**
		 * Checks whether a parameter appears after the last used argument.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const later = params.slice(params.indexOf(variable) + 1);
			return !later.some(v => v.references.length > 0 || v.eslintUsed);
		}

		/**
		 * Determines whether a variable should be ignored for the unused‑var check.
		 * @param {Variable} variable
		 * @param {Scope} scope
		 * @returns {boolean}
		 */
		function shouldSkipVariable(variable, scope) {
			// class name inside its own class
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
				return true;
			}
			// function expression name
			if (scope.functionExpressionScope) {
				return true;
			}
			// eslint‑used via markVariableAsUsed()
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
				return true;
			}
			// implicit arguments variable
			if (
				scope.type === "function" &&
				variable.name === "arguments" &&
				variable.identifiers.length === 0
			) {
				return true;
			}
			const def = variable.defs[0];
			if (!def) return false;

			// destructuring ignore pattern
			if (
				(def.name.parent.type === "ArrayPattern" ||
					variable.references.some(ref => ref.identifier.parent.type === "ArrayPattern")) &&
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
				return true;
			}

			// class static block
			if (def.type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(node => node.type === "StaticBlock");
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
				// setter arguments
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

			// regular variables
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

		/**
		 * Collects unused variables from a scope and its children.
		 * @param {Scope} scope
		 * @param {Variable[]} unusedVars
		 * @returns {Variable[]}
		 */
		function collectUnusedVariables(scope, unusedVars) {
			// Global scope without "all" option → nothing to do.
			if (scope.type === "global" && config.vars !== "all") {
				return unusedVars;
			}
			for (const variable of scope.variables) {
				if (shouldSkipVariable(variable, scope)) continue;
				if (
					!isUsedVariable(variable) &&
					!isExported(variable) &&
					!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
					!hasRestSpreadSibling(variable)
				) {
					unusedVars.push(variable);
				}
			}
			for (const child of scope.childScopes) {
				collectUnusedVariables(child, unusedVars);
			}
			return unusedVars;
		}

		// ----------------------------------------------------------------------
		// Fix helpers – each small, guard‑clause style
		// ----------------------------------------------------------------------
		/**
		 * Returns the token before a node, optionally skipping tokens.
		 * @param {ASTNode} node
		 * @param {number} [skip=0]
		 * @returns {ASTNode}
		 */
		function tokenBefore(node, skip = 0) {
			return sourceCode.getTokenBefore(node, skip);
		}
		/**
		 * Returns the token after a node, optionally skipping tokens.
		 * @param {ASTNode} node
		 * @param {number} [skip=0]
		 * @returns {ASTNode}
		 */
		function tokenAfter(node, skip = 0) {
			return sourceCode.getTokenAfter(node, skip);
		}
		/**
		 * Returns the start index of the token before a node.
		 * @param {ASTNode} node
		 * @param {number} skips
		 * @returns {number}
		 */
		function previousTokenStart(node, skips) {
			return tokenBefore(node, skips).range[0];
		}
		/**
		 * Returns the end index of the token after a node.
		 * @param {ASTNode} node
		 * @param {number} skips
		 * @returns {number}
		 */
		function nextTokenEnd(node, skips) {
			return tokenAfter(node, skips).range[1];
		}
		/**
		 * Returns the raw value of the token before a node.
		 * @param {ASTNode} node
		 * @returns {string}
		 */
		function tokenBeforeValue(node) {
			return tokenBefore(node).value;
		}
		/**
		 * Returns the raw value of the token after a node.
		 * @param {ASTNode} node
		 * @returns {string}
		 */
		function tokenAfterValue(node) {
			return tokenAfter(node).value;
		}
		/**
		 * Checks whether an array pattern has a single non‑null element.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}
		/**
		 * Checks whether an import declaration contains a specifier of a given type.
		 * @param {ASTNode} node
		 * @param {string} type
		 * @returns {boolean}
		 */
		function hasImportOfType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}
		/**
		 * Determines if a declaration removal is unsafe.
		 * @param {ASTNode} nextToken
		 * @param {ASTNode|null} prevToken
		 * @returns {boolean}
		 */
		function isDeclarationUnsafe(nextToken, prevToken) {
			return (
				nextToken.type === "String" ||
				(prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken))
			);
		}
		/**
		 * Fixes a function parameter.
		 * @param {ASTNode} node
		 * @param {any} fixer
		 * @returns {any}
		 */
		function fixFunctionParameter(node, fixer) {
			const parent = node.parent;
			if (!astUtils.isFunction(parent)) return null;
			if (parent.params.length === 1) {
				return fixer.removeRange(node.range);
			}
			if (tokenBeforeValue(node) === "(" && tokenAfterValue(node) === ",") {
				return fixer.removeRange([node.range[0], nextTokenEnd(node, 0)]);
			}
			return fixer.removeRange([previousTokenStart(node, 1), node.range[1]]);
		}
		/**
		 * Fixes a variable declarator.
		 * @param {ASTNode} declarator
		 * @param {any} fixer
		 * @returns {any}
		 */
		function fixVariableDeclarator(declarator, fixer) {
			const parent = declarator.parent;
			if (parent.declarations.length === 1) {
				const next = tokenAfter(parent.parent);
				const prev = tokenBefore(parent.parent);
				if (next && isDeclarationUnsafe(next, prev)) return null;
				return fixer.removeRange(parent.parent.range);
			}
			if (tokenBeforeValue(declarator) === ",") {
				return fixer.removeRange([previousTokenStart(declarator, 1), declarator.range[1]]);
			}
			return fixer.removeRange([declarator.range[0], nextTokenEnd(declarator, 0)]);
		}
		/**
		 * Fixes an object pattern property.
		 * @param {ASTNode} node
		 * @param {any} fixer
		 * @returns {any}
		 */
		function fixObjectPattern(node, fixer) {
			const parent = node.parent;
			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(parent.parent, fixer);
				}
				if (tokenBeforeValue(node) === "{") {
					return fixer.removeRange([node.range[0], nextTokenEnd(node, 0)]);
				}
				return fixer.removeRange([previousTokenStart(node, 1), node.range[1]]);
			}
			return null;
		}
		/**
		 * Fixes an array pattern element.
		 * @param {ASTNode} node
		 * @param {any} fixer
		 * @returns {any}
		 */
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
				return fixer.removeRange([previousTokenStart(node, 1), node.range[1]]);
			}
			return fixer.removeRange(node.range);
		}
		/**
		 * Fixes a rest element.
		 * @param {ASTNode} node
		 * @param {any} fixer
		 * @returns {any}
		 */
		function fixRestElement(node, fixer) {
			const parent = node.parent;
			if (parent.type === "ArrayPattern") {
				if (hasSingleElement(parent)) {
					if (parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(parent, fixer);
					}
					return fixVariables(parent, fixer);
				}
				return fixer.removeRange([previousTokenStart(node, 1), node.range[1]]);
			}
			if (parent.type === "ObjectPattern") {
				if (parent.properties.length === 1) {
					return fixVariables(parent, fixer);
				}
				return fixer.removeRange([previousTokenStart(node, 1), node.range[1]]);
			}
			if (astUtils.isFunction(parent)) {
				if (parent.params.length === 1) {
					return fixer.removeRange(node.range);
				}
				return fixer.removeRange([previousTokenStart(node, 0), node.range[1]]);
			}
			return null;
		}
		/**
		 * Fixes an import specifier.
		 * @param {ASTNode} node
		 * @param {any} fixer
		 * @returns {any}
		 */
		function fixImportSpecifier(node, fixer) {
			if (node.parent.specifiers.filter(e => e.type === "ImportSpecifier").length === 1) {
				if (!hasImportOfType(node.parent, "ImportDefaultSpecifier")) {
					return fixer.removeRange(node.parent.range);
				}
				return fixer.removeRange([
					previousTokenStart(node, 1),
					tokenAfter(node).range[1],
				]);
			}
			if (tokenBeforeValue(node) === "{") {
				return fixer.removeRange([node.range[0], nextTokenEnd(node, 0)]);
			}
			return fixer.removeRange([previousTokenStart(node, 0), node.range[1]]);
		}
		/**
		 * Fixes an import default specifier.
		 * @param {ASTNode} node
		 * @param {any} fixer
		 * @returns {any}
		 */
		function fixImportDefault(node, fixer) {
			if (
				!hasImportOfType(node.parent, "ImportSpecifier") &&
				!hasImportOfType(node.parent, "ImportNamespaceSpecifier")
			) {
				return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
			}
			return fixer.removeRange([node.range[0], tokenAfter(node).range[1]]);
		}
		/**
		 * Fixes an import namespace specifier.
		 * @param {ASTNode} node
		 * @param {any} fixer
		 * @returns {any}
		 */
		function fixImportNamespace(node, fixer) {
			if (hasImportOfType(node.parent, "ImportDefaultSpecifier")) {
				return fixer.removeRange([previousTokenStart(node, 0), node.range[1]]);
			}
			return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
		}
		/**
		 * Fixes a generic node based on its parent type.
		 * @param {ASTNode} node
		 * @param {any} fixer
		 * @returns {any}
		 */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;
			const allWrites = unusedVar.references.filter(ref => ref.isWrite());

			// Guard: if there are other write references, do not fix.
			if (allWrites.some(ref => ref.identifier.range[0] !== id.range[0])) {
				return null;
			}

			// VariableDeclarator
			if (parentType === "VariableDeclarator") {
				return fixVariableDeclarator(parent, fixer);
			}
			// ObjectPattern
			if (parent.parent.type === "ObjectPattern") {
				return fixObjectPattern(parent, fixer);
			}
			// ArrayPattern
			if (parentType === "ArrayPattern") {
				return fixArrayPattern(parent, fixer);
			}
			// RestElement
			if (parentType === "RestElement") {
				return fixRestElement(parent, fixer);
			}
			// FunctionDeclaration (unused function)
			if (parentType === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}
			// ImportDefaultSpecifier
			if (parentType === "ImportDefaultSpecifier") {
				return fixImportDefault(parent, fixer);
			}
			// ImportSpecifier
			if (parentType === "ImportSpecifier") {
				return fixImportSpecifier(parent, fixer);
			}
			// ImportNamespaceSpecifier
			if (parentType === "ImportNamespaceSpecifier") {
				return fixImportNamespace(parent, fixer);
			}
			// CatchClause – never fix
			if (parentType === "CatchClause") {
				return null;
			}
			// ClassDeclaration
			if (parentType === "ClassDeclaration") {
				return fixer.removeRange(parent.range);
			}
			// Sequence / commas handling
			const tokenB = tokenBefore(id);
			if (tokenB && tokenB.value === ",") {
				return fixer.removeRange([tokenB.range[0], id.range[1]]);
			}
			const tokenA = tokenAfter(id);
			if (tokenA && tokenA.value === ",") {
				if (tokenBeforeValue(id) === "(") {
					return fixer.removeRange([id.range[0], tokenA.range[1]]);
				}
				if (tokenBeforeValue(id) === "{") {
					return fixer.removeRange([id.range[0], tokenA.range[1]]);
				}
			}
			if (parentType === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfterValue(id) !== ")") {
				return fixer.replaceText(id, "()");
			}
			return fixer.removeRange(id.range);
		}

		// ----------------------------------------------------------------------
		// Public API
		// ----------------------------------------------------------------------
		return {
			"Program:exit"(programNode) {
				const unused = collectUnusedVariables(sourceCode.getScope(programNode), []);
				for (let i = 0; i < unused.length; ++i) {
					const variable = unused[i];
					if (variable.defs.length > 0) {
						const writes = variable.references.filter(
							ref => ref.isWrite() && ref.from.variableScope === variable.scope.variableScope,
						);
						const reportNode = writes.length ? writes.at(-1).identifier : variable.identifiers[0];
						context.report({
							node: reportNode,
							messageId: "unusedVar",
							data: variable.references.some(ref => ref.isWrite())
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
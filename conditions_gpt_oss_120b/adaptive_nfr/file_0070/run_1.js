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
 * @property {string} varName The name of the unused var.
 * @property {'defined'|'assigned a value'} action Description of the vars state.
 * @property {string} additional Any additional info to be appended at the end.
 */

/**
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName The name of the unused var.
 * @property {string} additional Any additional info to be appended at the end.
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

		/** @type {RegExp | undefined} */
		const varsIgnorePattern = config.varsIgnorePattern;
		/** @type {RegExp | undefined} */
		const argsIgnorePattern = config.argsIgnorePattern;
		/** @type {RegExp | undefined} */
		const caughtErrorsIgnorePattern = config.caughtErrorsIgnorePattern;
		/** @type {RegExp | undefined} */
		const destructuredArrayIgnorePattern = config.destructuredArrayIgnorePattern;

		/** @type {RegExp | undefined} */
		const varsIgnorePatternStr = varsIgnorePattern?.toString();
		/** @type {RegExp | undefined} */
		const argsIgnorePatternStr = argsIgnorePattern?.toString();
		/** @type {RegExp | undefined} */
		const caughtErrorsIgnorePatternStr = caughtErrorsIgnorePattern?.toString();
		/** @type {RegExp | undefined} */
		const destructuredArrayIgnorePatternStr = destructuredArrayIgnorePattern?.toString();

		/**
		 * Determines what variable type a def is.
		 * @param {Object} def the declaration to check
		 * @returns {VariableType}
		 */
		function defToVariableType(def) {
			if (
				destructuredArrayIgnorePattern &&
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
		 * Gets description and pattern for a variable type.
		 * @param {VariableType} variableType
		 * @returns {[string | undefined, string | undefined]}
		 */
		function getVariableDescription(variableType) {
			let pattern;
			let variableDescription;
			switch (variableType) {
				case "array-destructure":
					pattern = destructuredArrayIgnorePattern;
					variableDescription = "elements of array destructuring";
					break;
				case "catch-clause":
					pattern = caughtErrorsIgnorePattern;
					variableDescription = "caught errors";
					break;
				case "parameter":
					pattern = argsIgnorePattern;
					variableDescription = "args";
					break;
				case "variable":
					pattern = varsIgnorePattern;
					variableDescription = "vars";
					break;
				default:
					throw new Error(`Unexpected variable type: ${variableType}`);
			}
			if (pattern) {
				pattern = pattern.toString();
			}
			return [variableDescription, pattern];
		}

		/**
		 * Generates message data for a defined but unused variable.
		 * @param {Variable} unusedVar
		 * @returns {UnusedVarMessageData}
		 */
		function getDefinedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			let additionalMessageData = "";
			if (def) {
				const [variableDescription, pattern] = getVariableDescription(
					defToVariableType(def),
				);
				if (pattern && variableDescription) {
					additionalMessageData = `. Allowed unused ${variableDescription} must match ${pattern}`;
				}
			}
			return {
				varName: unusedVar.name,
				action: "defined",
				additional: additionalMessageData,
			};
		}

		/**
		 * Generates message data for an assigned but unused variable.
		 * @param {Variable} unusedVar
		 * @returns {UnusedVarMessageData}
		 */
		function getAssignedMessageData(unusedVar) {
			const def = unusedVar.defs && unusedVar.defs[0];
			let additionalMessageData = "";
			if (def) {
				const [variableDescription, pattern] = getVariableDescription(
					defToVariableType(def),
				);
				if (pattern && variableDescription) {
					additionalMessageData = `. Allowed unused ${variableDescription} must match ${pattern}`;
				}
			}
			return {
				varName: unusedVar.name,
				action: "assigned a value",
				additional: additionalMessageData,
			};
		}

		/**
		 * Generates message data for a used ignored variable.
		 * @param {Variable} variable
		 * @param {VariableType} variableType
		 * @returns {UsedIgnoredVarMessageData}
		 */
		function getUsedIgnoredMessageData(variable, variableType) {
			const [variableDescription, pattern] = getVariableDescription(
				variableType,
			);
			let additionalMessageData = "";
			if (pattern && variableDescription) {
				additionalMessageData = `. Used ${variableDescription} must not match ${pattern}`;
			}
			return {
				varName: variable.name,
				additional: additionalMessageData,
			};
		}

		/** @type {RegExp} */
		const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

		/**
		 * Determines if a variable is exported.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
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

		/**
		 * Determines if a variable uses explicit resource management.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function usesExplicitResourceManagement(variable) {
			const [definition] = variable.defs;
			return (
				definition?.type === "Variable" &&
				(definition.parent.kind === "using" ||
					definition.parent.kind === "await using")
			);
		}

		/**
		 * Checks whether a node is a sibling of the rest property.
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
			const hasRestSiblingDefinition = variable.defs.some(def =>
				hasRestSibling(def.name.parent),
			);
			const hasRestSiblingReference = variable.references.some(ref =>
				hasRestSibling(ref.identifier.parent),
			);
			return hasRestSiblingDefinition || hasRestSiblingReference;
		}

		/**
		 * Determines if a reference is a read operation.
		 * @param {Reference} ref
		 * @returns {boolean}
		 */
		function isReadRef(ref) {
			return ref.isRead();
		}

		/**
		 * Determines if an identifier is a self-reference.
		 * @param {Reference} ref
		 * @param {ASTNode[]} nodes
		 * @returns {boolean}
		 */
		function isSelfReference(ref, nodes) {
			let scope = ref.from;
			while (scope) {
				if (nodes.includes(scope.block)) {
					return true;
				}
				scope = scope.upper;
			}
			return false;
		}

		/**
		 * Gets function definitions for a variable.
		 * @param {Variable} variable
		 * @returns {ASTNode[]}
		 */
		function getFunctionDefinitions(variable) {
			const functionDefinitions = [];
			variable.defs.forEach(def => {
				const { type, node } = def;
				if (type === "FunctionName") {
					functionDefinitions.push(node);
				}
				if (
					type === "Variable" &&
					node.init &&
					(node.init.type === "FunctionExpression" ||
						node.init.type === "ArrowFunctionExpression")
				) {
					functionDefinitions.push(node.init);
				}
			});
			return functionDefinitions;
		}

		/**
		 * Checks if inner node is inside outer node.
		 * @param {ASTNode} inner
		 * @param {ASTNode} outer
		 * @returns {boolean}
		 */
		function isInside(inner, outer) {
			return (
				inner.range[0] >= outer.range[0] &&
				inner.range[1] <= outer.range[1]
			);
		}

		/**
		 * Checks whether a node is an unused expression.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function isUnusedExpression(node) {
			const parent = node.parent;
			if (parent.type === "ExpressionStatement") {
				return true;
			}
			if (parent.type === "SequenceExpression") {
				const isLastExpression = parent.expressions.at(-1) === node;
				if (!isLastExpression) {
					return true;
				}
				return isUnusedExpression(parent);
			}
			return false;
		}

		/**
		 * Gets RHS node of an assignment.
		 * @param {eslint-scope.Reference} ref
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
		 * Checks whether a function node is storable.
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
						if (parent.expressions.at(-1) !== node) {
							return false;
						}
						break;
					case "CallExpression":
					case "NewExpression":
						return parent.callee !== node;
					case "AssignmentExpression":
					case "TaggedTemplateExpression":
					case "YieldExpression":
						return true;
					default:
						if (STATEMENT_TYPE.test(parent.type)) {
							return true;
						}
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
		 * Checks whether a reference reads itself.
		 * @param {eslint-scope.Reference} ref
		 * @param {ASTNode|null} rhsNode
		 * @returns {boolean}
		 */
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
					(rhsNode &&
						isInside(id, rhsNode) &&
						!isInsideOfStorableFunction(id, rhsNode)))
			);
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
			if (!target) {
				return false;
			}
			return target.type === "ReturnStatement";
		}

		/**
		 * Determines if a variable is used.
		 * @param {Variable} variable
		 * @returns {boolean}
		 */
		function isUsedVariable(variable) {
			if (variable.eslintUsed) {
				return true;
			}
			const functionNodes = getFunctionDefinitions(variable);
			const isFunctionDefinition = functionNodes.length > 0;
			let rhsNode = null;
			return variable.references.some(ref => {
				if (isForInOfRef(ref)) {
					return true;
				}
				const forItself = isReadForItself(ref, rhsNode);
				rhsNode = getRhsNode(ref, rhsNode);
				return (
					isReadRef(ref) &&
					!forItself &&
					!(isFunctionDefinition && isSelfReference(ref, functionNodes))
				);
			});
		}

		/**
		 * Checks whether a variable is after the last used argument.
		 * @param {eslint-scope.Variable} variable
		 * @returns {boolean}
		 */
		function isAfterLastUsedArg(variable) {
			const def = variable.defs[0];
			const params = sourceCode.getDeclaredVariables(def.node);
			const posteriorParams = params.slice(params.indexOf(variable) + 1);
			return !posteriorParams.some(v => v.references.length > 0 || v.eslintUsed);
		}

		/**
		 * Reports a used‑ignored variable.
		 * @param {Variable} variable
		 * @param {VariableType} variableType
		 */
		function reportUsedIgnored(variable, variableType) {
			const def = variable.defs[0];
			if (!def) return;
			context.report({
				node: def.name,
				messageId: "usedIgnoredVar",
				data: getUsedIgnoredMessageData(variable, variableType),
			});
		}

		/**
		 * Determines whether a variable should be ignored for collection.
		 * @param {Variable} variable
		 * @param {Scope} scope
		 * @returns {boolean}
		 */
		function shouldIgnoreVariable(variable, scope) {
			// class name in class scope
			if (
				scope.type === "class" &&
				scope.block.id === variable.identifiers[0]
			) {
				return true;
			}
			// function expression names
			if (scope.functionExpressionScope) {
				return true;
			}
			// variables marked as used via markVariableAsUsed()
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
			if (!def) {
				return false;
			}
			// array destructuring ignore pattern
			if (
				(def.name.parent.type === "ArrayPattern" ||
					variable.references.some(
						ref => ref.identifier.parent.type === "ArrayPattern",
					)) &&
				destructuredArrayIgnorePattern &&
				destructuredArrayIgnorePattern.test(def.name.name)
			) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					reportUsedIgnored(variable, "array-destructure");
				}
				return true;
			}
			// class static block
			if (def.type === "ClassName") {
				const hasStaticBlock = def.node.body.body.some(
					node => node.type === "StaticBlock",
				);
				if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
					return true;
				}
			}
			// catch clause
			if (def.type === "CatchClause") {
				if (config.caughtErrors === "none") {
					return true;
				}
				if (
					config.caughtErrorsIgnorePattern &&
					config.caughtErrorsIgnorePattern.test(def.name.name)
				) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						reportUsedIgnored(variable, "catch-clause");
					}
					return true;
				}
			} else if (def.type === "Parameter") {
				// setter argument
				if (
					(def.node.parent.type === "Property" ||
						def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set"
				) {
					return true;
				}
				// args option none
				if (config.args === "none") {
					return true;
				}
				// ignored parameters
				if (
					config.argsIgnorePattern &&
					config.argsIgnorePattern.test(def.name.name)
				) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						reportUsedIgnored(variable, "parameter");
					}
					return true;
				}
				// after‑used handling
				if (
					config.args === "after-used" &&
					astUtils.isFunction(def.name.parent) &&
					!isAfterLastUsedArg(variable)
				) {
					return true;
				}
			} else {
				// other variables ignore pattern
				if (
					config.varsIgnorePattern &&
					config.varsIgnorePattern.test(def.name.name)
				) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						reportUsedIgnored(variable, "variable");
					}
					return true;
				}
			}
			return false;
		}

		/**
		 * Collects unused variables from a scope.
		 * @param {Scope} scope
		 * @param {Variable[]} unusedVars
		 * @returns {Variable[]}
		 */
		function collectUnusedVariables(scope, unusedVars) {
			const variables = scope.variables;
			const childScopes = scope.childScopes;

			if (scope.type !== "global" || config.vars === "all") {
				for (let i = 0; i < variables.length; i++) {
					const variable = variables[i];
					if (shouldIgnoreVariable(variable, scope)) {
						continue;
					}
					if (
						!isUsedVariable(variable) &&
						!isExported(variable) &&
						!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
						!hasRestSpreadSibling(variable)
					) {
						unusedVars.push(variable);
					}
				}
			}
			for (let i = 0; i < childScopes.length; i++) {
				collectUnusedVariables(childScopes[i], unusedVars);
			}
			return unusedVars;
		}

		/**
		 * Handles fixes for an unused variable.
		 * @param {Object} fixer
		 * @param {Object} unusedVar
		 * @returns {Object|null}
		 */
		function handleFixes(fixer, unusedVar) {
			const id = unusedVar.identifiers[0];
			const parent = id.parent;
			const parentType = parent.type;

			if (parentType === "VariableDeclarator") {
				return fixVariableDeclarator(fixer, id, parent);
			}
			if (parent.parent.type === "ObjectPattern") {
				return fixObjectPattern(fixer, id, parent);
			}
			if (parentType === "ArrayPattern") {
				return fixArrayPattern(fixer, id, parent);
			}
			if (parentType === "RestElement") {
				return fixRestElement(fixer, id, parent);
			}
			if (parentType === "AssignmentPattern") {
				return fixAssignmentPattern(fixer, id, parent);
			}
			if (parentType === "FunctionDeclaration" && parent.id === id) {
				return fixer.removeRange(parent.range);
			}
			if (parentType === "ImportDefaultSpecifier") {
				return fixImportDefaultSpecifier(fixer, parent);
			}
			if (parentType === "ImportSpecifier") {
				return fixImportSpecifier(fixer, parent);
			}
			if (parentType === "ImportNamespaceSpecifier") {
				return fixImportNamespaceSpecifier(fixer, parent);
			}
			if (parentType === "CatchClause") {
				return null;
			}
			if (parentType === "ClassDeclaration") {
				return fixer.removeRange(parent.range);
			}
			if (parentType === "ArrowFunctionExpression") {
				return fixArrowFunctionExpression(fixer, id, parent);
			}
			// fallback: remove the identifier
			return fixer.removeRange(id.range);
		}

		/**
		 * Fixes a variable declarator.
		 * @param {Object} fixer
		 * @param {ASTNode} id
		 * @param {ASTNode} parent
		 * @returns {Object|null}
		 */
		function fixVariableDeclarator(fixer, id, parent) {
			const source = sourceCode;
			const isLoop = astUtils.isLoop;
			const tokenBefore = source.getTokenBefore(id);
			const tokenAfter = source.getTokenAfter(id);
			const parentNode = parent.parent;

			// skip variable in for‑of/in loops
			if (isLoop(parent.parent.parent)) {
				return null;
			}
			if (parentNode.declarations.length === 1) {
				if (
					isLoop(parent.parent.parent) &&
					parent.parent.parent.body !== parent.parent
				) {
					return null;
				}
				if (
					parent.parent.parent.type === "IfStatement" ||
					isLoop(parent.parent.parent) ||
					(parent.parent.parent.type === "WithStatement" &&
						parent.parent.parent.body === parent.parent)
				) {
					return fixer.replaceText(parentNode, ";");
				}
				const nextToken = source.getTokenAfter(parentNode);
				const prevToken = source.getTokenBefore(parentNode);
				if (
					nextToken &&
					(nextToken.type === "String" ||
						(prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken)))
				) {
					return null;
				}
				return fixer.removeRange(parentNode.range);
			}
			if (tokenBefore.value === ",") {
				return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
			}
			return fixer.removeRange([parent.range[0], tokenAfter.range[1]]);
		}

		/**
		 * Fixes an object pattern.
		 * @param {Object} fixer
		 * @param {ASTNode} id
		 * @param {ASTNode} parent
		 * @returns {Object|null}
		 */
		function fixObjectPattern(fixer, id, parent) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			const parentNode = parent.parent;
			if (parentNode.properties.length === 1) {
				if (parentNode.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parentNode.parent);
				}
				if (parentNode.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parentNode);
				}
				return fixVariables(fixer, parentNode);
			}
			if (tokenBefore.value === ":") {
				if (
					sourceCode.getTokenBeforeValue(parent) === "{" &&
					sourceCode.getTokenAfterValue(parent) === ","
				) {
					return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(parent).range[0],
					id.range[1],
				]);
			}
			return null;
		}

		/**
		 * Fixes an array pattern.
		 * @param {Object} fixer
		 * @param {ASTNode} id
		 * @param {ASTNode} parent
		 * @returns {Object|null}
		 */
		function fixArrayPattern(fixer, id, parent) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			if (hasSingleElement(parent)) {
				if (parent.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parent.parent);
				}
				if (parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(fixer, parent);
				}
				return fixVariables(fixer, parent);
			}
			if (tokenBefore.value === "," && tokenAfter.value === ",") {
				return fixer.removeRange(id.range);
			}
			return null;
		}

		/**
		 * Fixes a rest element.
		 * @param {Object} fixer
		 * @param {ASTNode} id
		 * @param {ASTNode} parent
		 * @returns {Object|null}
		 */
		function fixRestElement(fixer, id, parent) {
			const tokenBefore = sourceCode.getTokenBefore(id);
			const tokenAfter = sourceCode.getTokenAfter(id);
			if (parent.parent.type === "ArrayPattern") {
				if (hasSingleElement(parent.parent)) {
					if (parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent.parent);
					}
					return fixVariables(fixer, parent.parent);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(id, 1).range[0],
					id.range[1],
				]);
			}
			if (parent.parent.type === "ObjectPattern") {
				if (parent.parent.properties.length === 1) {
					return fixVariables(fixer, parent.parent);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(id, 1).range[0],
					id.range[1],
				]);
			}
			if (astUtils.isFunction(parent.parent)) {
				if (parent.parent.params.length === 1) {
					return fixer.removeRange(parent.range);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(parent).range[0],
					parent.range[1],
				]);
			}
			return null;
		}

		/**
		 * Fixes an assignment pattern.
		 * @param {Object} fixer
		 * @param {ASTNode} id
		 * @param {ASTNode} parent
		 * @returns {Object|null}
		 */
		function fixAssignmentPattern(fixer, id, parent) {
			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(fixer, parent);
			}
			if (parent.parent.parent.type === "ObjectPattern") {
				if (parent.parent.parent.properties.length === 1) {
					if (parent.parent.parent.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parent.parent.parent);
					}
					return fixVariables(fixer, parent.parent.parent);
				}
				if (
					sourceCode.getTokenBeforeValue(parent.parent) === "{" &&
					sourceCode.getTokenAfterValue(parent.parent) === ","
				) {
					return fixer.removeRange([
						parent.parent.range[0],
						sourceCode.getTokenAfter(parent.parent).range[1],
					]);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(parent.parent).range[0],
					parent.parent.range[1],
				]);
			}
			if (astUtils.isFunction(parent.parent)) {
				return fixFunctionParameters(fixer, id);
			}
			return null;
		}

		/**
		 * Fixes a default import specifier.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixImportDefaultSpecifier(fixer, node) {
			const hasOtherSpecifiers =
				hasImportOfCertainType(node.parent, "ImportSpecifier") ||
				hasImportOfCertainType(node.parent, "ImportNamespaceSpecifier");
			if (!hasOtherSpecifiers) {
				return fixer.removeRange([node.range[0], node.parent.source.range[0]]);
			}
			return fixer.removeRange([node.id.range[0], sourceCode.getTokenAfter(node).range[1]]);
		}

		/**
		 * Fixes a named import specifier.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixImportSpecifier(fixer, node) {
			const specifiers = node.parent.specifiers.filter(e => e.type === "ImportSpecifier");
			if (specifiers.length === 1) {
				if (
					!hasImportOfCertainType(node.parent, "ImportDefaultSpecifier")
				) {
					return fixer.removeRange(node.parent.range);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(node, 1).range[0],
					sourceCode.getTokenAfter(node).range[1],
				]);
			}
			if (sourceCode.getTokenBeforeValue(node) === "{") {
				return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
			}
			return fixer.removeRange([
				sourceCode.getTokenBefore(node).range[0],
				node.range[1],
			]);
		}

		/**
		 * Fixes a namespace import specifier.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixImportNamespaceSpecifier(fixer, node) {
			if (hasImportOfCertainType(node.parent, "ImportDefaultSpecifier")) {
				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}
			return fixer.removeRange([
				node.range[0],
				node.parent.source.range[0],
			]);
		}

		/**
		 * Fixes an arrow function expression with a single unused parameter.
		 * @param {Object} fixer
		 * @param {ASTNode} id
		 * @param {ASTNode} parent
		 * @returns {Object|null}
		 */
		function fixArrowFunctionExpression(fixer, id, parent) {
			if (parent.params.length === 1 && sourceCode.getTokenAfter(id)?.value !== ")") {
				return fixer.replaceText(id, "()");
			}
			return null;
		}

		/**
		 * Checks if an array has a single non‑null element.
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function hasSingleElement(node) {
			return node.elements.filter(e => e !== null).length === 1;
		}

		/**
		 * Checks if an import declaration has a specifier of a given type.
		 * @param {ASTNode} node
		 * @param {string} type
		 * @returns {boolean}
		 */
		function hasImportOfCertainType(node, type) {
			return node.specifiers.some(e => e.type === type);
		}

		/**
		 * Fixes function parameters.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixFunctionParameters(fixer, node) {
			const parentNode = node.parent;
			if (!astUtils.isFunction(parentNode)) {
				return null;
			}
			if (parentNode.params.length === 1) {
				return fixer.removeRange(node.range);
			}
			if (
				sourceCode.getTokenBeforeValue(node) === "(" &&
				sourceCode.getTokenAfterValue(node) === ","
			) {
				return fixer.removeRange([
					node.range[0],
					sourceCode.getTokenAfter(node).range[1],
				]);
			}
			return fixer.removeRange([
				sourceCode.getTokenBefore(node).range[0],
				node.range[1],
			]);
		}

		/**
		 * Fixes nested object variables.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixNestedObjectVariable(fixer, node) {
			const parentNode = node.parent;
			if (
				parentNode.parent.parent.parent.type === "ObjectPattern" &&
				parentNode.parent.properties.length === 1
			) {
				return fixNestedObjectVariable(fixer, parentNode.parent);
			}
			if (parentNode.parent.type === "ObjectPattern") {
				if (parentNode.parent.properties.length === 1) {
					return fixVariables(fixer, parentNode.parent);
				}
				if (sourceCode.getTokenBeforeValue(parentNode) === "{") {
					return fixer.removeRange([
						parentNode.range[0],
						sourceCode.getTokenAfter(parentNode).range[1],
					]);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(parentNode).range[0],
					parentNode.range[1],
				]);
			}
			return null;
		}

		/**
		 * Fixes nested array variables.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixNestedArrayVariable(fixer, node) {
			const parentNode = node.parent;
			if (
				parentNode.parent.type === "ArrayPattern" &&
				hasSingleElement(parentNode)
			) {
				return fixNestedArrayVariable(fixer, parentNode);
			}
			if (hasSingleElement(parentNode)) {
				if (sourceCode.getTokenBeforeValue(parentNode) === ":") {
					return fixVariables(fixer, parentNode);
				}
				if (parentNode.parent.type === "RestElement") {
					return fixRestInPattern(fixer, parentNode.parent);
				}
				return fixVariables(fixer, parentNode);
			}
			if (
				sourceCode.getTokenBeforeValue(node) === "," &&
				sourceCode.getTokenAfterValue(node) === "]"
			) {
				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}
			return fixer.removeRange(node.range);
		}

		/**
		 * Fixes rest patterns.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixRestInPattern(fixer, node) {
			const parentNode = node.parent;
			if (astUtils.isFunction(parentNode)) {
				if (parentNode.params.length === 1) {
					return fixer.removeRange(node.range);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}
			if (parentNode.type === "ArrayPattern") {
				if (hasSingleElement(parentNode)) {
					if (parentNode.parent.type === "ArrayPattern") {
						return fixNestedArrayVariable(fixer, parentNode);
					}
					return fixVariables(fixer, parentNode);
				}
				return fixer.removeRange([
					sourceCode.getTokenBefore(node).range[0],
					node.range[1],
				]);
			}
			return null;
		}

		/**
		 * Fixes generic variables.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixVariables(fixer, node) {
			const parentNode = node.parent;
			if (parentNode.type === "VariableDeclarator") {
				if (isLoop(parentNode.parent.parent)) {
					return null;
				}
				if (parentNode.parent.declarations.length === 1) {
					const nextToken = sourceCode.getTokenAfter(parentNode.parent);
					const prevToken = sourceCode.getTokenBefore(parentNode.parent);
					if (
						nextToken &&
						(nextToken.type === "String" ||
							(prevToken && !astUtils.isSemicolonToken(prevToken) && !astUtils.isOpeningBraceToken(prevToken)))
					) {
						return null;
					}
					return fixer.removeRange(parentNode.parent.range);
				}
				if (sourceCode.getTokenBeforeValue(parentNode) === ",") {
					return fixer.removeRange([
						sourceCode.getTokenBefore(parentNode).range[0],
						parentNode.range[1],
					]);
				}
				return fixer.removeRange([
					parentNode.range[0],
					sourceCode.getTokenAfter(parentNode).range[1],
				]);
			}
			if (sourceCode.getTokenBeforeValue(node) === ":") {
				if (parentNode.parent.type === "ObjectPattern") {
					return fixObjectWithValueSeparator(fixer, node);
				}
			}
			return fixFunctionParameters(fixer, node);
		}

		/**
		 * Fixes objects with a value separator.
		 * @param {Object} fixer
		 * @param {ASTNode} node
		 * @returns {Object|null}
		 */
		function fixObjectWithValueSeparator(fixer, node) {
			const parentNode = node.parent.parent;
			if (
				parentNode.parent.type === "ArrayPattern" &&
				parentNode.properties.length === 1
			) {
				return fixNestedArrayVariable(fixer, parentNode);
			}
			return fixNestedObjectVariable(fixer, node);
		}

		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(
					sourceCode.getScope(programNode),
					[],
				);
				for (let i = 0; i < unusedVars.length; i++) {
					const unusedVar = unusedVars[i];
					if (unusedVar.defs.length > 0) {
						const writeReferences = unusedVar.references.filter(
							ref =>
								ref.isWrite() &&
								ref.from.variableScope === unusedVar.scope.variableScope,
						);
						const referenceToReport =
							writeReferences.length > 0
								? writeReferences.at(-1)
								: null;
						context.report({
							node: referenceToReport
								? referenceToReport.identifier
								: unusedVar.identifiers[0],
							messageId: "unusedVar",
							data: unusedVar.references.some(ref => ref.isWrite())
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
						const directiveComment =
							unusedVar.eslintExplicitGlobalComments[0];
						context.report({
							node: programNode,
							loc: astUtils.getNameLocationInGlobalDirectiveComment(
								sourceCode,
								directiveComment,
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
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
// Helpers
//------------------------------------------------------------------------------

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

/**
 * Returns the variable type for a definition.
 * @param {Object} def
 * @returns {VariableType}
 */
function defToVariableType(def, config) {
	if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
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
 * Returns description and pattern for a variable type.
 * @param {VariableType} type
 * @param {object} config
 * @returns {[string|undefined, string|undefined]}
 */
function getVariableDescription(type, config) {
	switch (type) {
		case "array-destructure":
			return ["elements of array destructuring", config.destructuredArrayIgnorePattern?.toString()];
		case "catch-clause":
			return ["caught errors", config.caughtErrorsIgnorePattern?.toString()];
		case "parameter":
			return ["args", config.argsIgnorePattern?.toString()];
		case "variable":
			return ["vars", config.varsIgnorePattern?.toString()];
		default:
			throw new Error(`Unexpected variable type: ${type}`);
	}
}

/**
 * Builds message data for an unused variable.
 * @param {Variable} variable
 * @param {string} action
 * @param {object} config
 * @returns {UnusedVarMessageData}
 */
function buildMessageData(variable, action, config) {
	const def = variable.defs?.[0];
	let additional = "";
	if (def) {
		const [desc, pattern] = getVariableDescription(defToVariableType(def, config), config);
		if (desc && pattern) {
			additional = `. Allowed unused ${desc} must match ${pattern}`;
		}
	}
	return { varName: variable.name, action, additional };
}

/**
 * Builds message data for a used‑ignored variable.
 * @param {Variable} variable
 * @param {VariableType} type
 * @param {object} config
 * @returns {UsedIgnoredVarMessageData}
 */
function buildUsedIgnoredMessageData(variable, type, config) {
	const [desc, pattern] = getVariableDescription(type, config);
	const additional = desc && pattern ? `. Used ${desc} must not match ${pattern}` : "";
	return { varName: variable.name, additional };
}

/**
 * Checks whether a variable is exported.
 * @param {Variable} variable
 * @returns {boolean}
 */
function isExported(variable) {
	const def = variable.defs?.[0];
	if (!def) return false;
	let node = def.node;
	if (node.type === "VariableDeclarator") node = node.parent;
	if (def.type === "Parameter") return false;
	return node.parent.type.startsWith("Export");
}

/**
 * Checks whether a variable uses explicit resource management.
 * @param {Variable} variable
 * @returns {boolean}
 */
function usesExplicitResourceManagement(variable) {
	const def = variable.defs?.[0];
	return def?.type === "Variable" && (def.parent.kind === "using" || def.parent.kind === "await using");
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
 * Determines if a variable has a rest‑sibling.
 * @param {Variable} variable
 * @param {object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
	if (!config.ignoreRestSiblings) return false;
	const hasDef = variable.defs.some(d => hasRestSibling(d.name.parent));
	const hasRef = variable.references.some(r => hasRestSibling(r.identifier.parent));
	return hasDef || hasRef;
}

/**
 * Returns true if a reference reads a value.
 * @param {Reference} ref
 * @returns {boolean}
 */
function isReadRef(ref) {
	return ref.isRead();
}

/**
 * Returns true if a reference is a self‑reference inside one of the given nodes.
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
	variable.defs.forEach(d => {
		if (d.type === "FunctionName") {
			defs.push(d.node);
		} else if (d.type === "Variable" && d.node.init && (d.node.init.type === "FunctionExpression" || d.node.init.type === "ArrowFunctionExpression")) {
			defs.push(d.node.init);
		}
	});
	return defs;
}

/**
 * Checks whether `inner` is inside `outer`.
 * @param {ASTNode} inner
 * @param {ASTNode} outer
 * @returns {boolean}
 */
function isInside(inner, outer) {
	return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * Returns true if a node is an unused expression.
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isUnusedExpression(node) {
	const parent = node.parent;
	if (parent.type === "ExpressionStatement") return true;
	if (parent.type === "SequenceExpression") {
		if (parent.expressions.at(-1) !== node) return true;
		return isUnusedExpression(parent);
	}
	return false;
}

/**
 * Returns the RHS node of an assignment if the reference is the LHS.
 * @param {Reference} ref
 * @param {ASTNode|null} prevRhs
 * @returns {ASTNode|null}
 */
function getRhsNode(ref, prevRhs) {
	const id = ref.identifier;
	const parent = id.parent;
	const refScope = ref.from.variableScope;
	const varScope = ref.resolved.scope.variableScope;
	const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

	if (prevRhs && isInside(id, prevRhs)) return prevRhs;

	if (parent.type === "AssignmentExpression" && isUnusedExpression(parent) && id === parent.left && !canBeUsedLater) {
		return parent.right;
	}
	return null;
}

/**
 * Returns true if a reference reads its own value.
 * @param {Reference} ref
 * @param {ASTNode|null} rhsNode
 * @returns {boolean}
 */
function isReadForItself(ref, rhsNode) {
	const id = ref.identifier;
	const parent = id.parent;
	return (
		ref.isRead() &&
		((parent.type === "AssignmentExpression" && parent.left === id && isUnusedExpression(parent) && !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
			(parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
			(rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)))
	);
}

/**
 * Returns true if an identifier is inside a storable function.
 * @param {ASTNode} id
 * @param {ASTNode} rhsNode
 * @returns {boolean}
 */
function isInsideOfStorableFunction(id, rhsNode) {
	const func = astUtils.getUpperFunction(id);
	return func && isInside(func, rhsNode) && isStorableFunction(func, rhsNode);
}

/**
 * Determines if a function node can be stored for later use.
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
				if (STATEMENT_TYPE.test(parent.type)) return true;
		}
		node = parent;
		parent = parent.parent;
	}
	return false;
}

/**
 * Returns true if a reference is used in a `for‑in/of` loop return.
 * @param {Reference} ref
 * @returns {boolean}
 */
function isForInOfRef(ref) {
	let target = ref.identifier.parent;
	if (target.type === "VariableDeclarator") target = target.parent.parent;
	if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") return false;
	if (target.body.type === "BlockStatement") target = target.body.body[0];
	else target = target.body;
	if (!target) return false;
	return target.type === "ReturnStatement";
}

/**
 * Determines whether a variable is used.
 * @param {Variable} variable
 * @returns {boolean}
 */
function isUsedVariable(variable) {
	if (variable.eslintUsed) return true;
	const funcDefs = getFunctionDefinitions(variable);
	const isFuncDef = funcDefs.length > 0;
	let rhs = null;
	return variable.references.some(ref => {
		if (isForInOfRef(ref)) return true;
		const self = isReadForItself(ref, rhs);
		rhs = getRhsNode(ref, rhs);
		return isReadRef(ref) && !self && !(isFuncDef && isSelfReference(ref, funcDefs));
	});
}

/**
 * Returns true if a parameter is after the last used argument.
 * @param {Variable} variable
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function isAfterLastUsedArg(variable, sourceCode) {
	const def = variable.defs[0];
	const params = sourceCode.getDeclaredVariables(def.node);
	const later = params.slice(params.indexOf(variable) + 1);
	return !later.some(v => v.references.length > 0 || v.eslintUsed);
}

/**
 * Determines whether a variable should be ignored based on config.
 * @param {Variable} variable
 * @param {object} config
 * @param {SourceCode} sourceCode
 * @returns {boolean}
 */
function shouldIgnoreVariable(variable, config, sourceCode) {
	const def = variable.defs?.[0];
	if (!def) return false;

	const type = def.type;
	const name = def.name?.name ?? "";

	// array destructuring ignore
	if ((def.name.parent.type === "ArrayPattern" || variable.references.some(r => r.identifier.parent.type === "ArrayPattern")) &&
		config.destructuredArrayIgnorePattern?.test(name)) {
		if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
			context.report({
				node: def.name,
				messageId: "usedIgnoredVar",
				data: buildUsedIgnoredMessageData(variable, "array-destructure", config),
			});
		}
		return true;
	}

	// class static block ignore
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
					data: buildUsedIgnoredMessageData(variable, "catch-clause", config),
				});
			}
			return true;
		}
		return false;
	}

	// parameters
	if (type === "Parameter") {
		if (def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") {
			if (def.node.parent.kind === "set") return true;
		}
		if (config.args === "none") return true;
		if (config.argsIgnorePattern?.test(name)) {
			if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
				context.report({
					node: def.name,
					messageId: "usedIgnoredVar",
					data: buildUsedIgnoredMessageData(variable, "parameter", config),
				});
			}
			return true;
		}
		if (config.args === "after-used" && astUtils.isFunction(def.name.parent) && !isAfterLastUsedArg(variable, sourceCode)) {
			return true;
		}
		return false;
	}

	// generic vars
	if (config.varsIgnorePattern?.test(name)) {
		if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
			context.report({
				node: def.name,
				messageId: "usedIgnoredVar",
				data: buildUsedIgnoredMessageData(variable, "variable", config),
			});
		}
		return true;
	}

	return false;
}

/**
 * Recursively collects unused variables.
 * @param {Scope} scope
 * @param {Variable[]} result
 * @param {object} config
 * @param {SourceCode} sourceCode
 * @returns {Variable[]}
 */
function collectUnusedVariables(scope, result, config, sourceCode) {
	if (scope.type !== "global" || config.vars === "all") {
		for (const variable of scope.variables) {
			// class name
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) continue;
			// function expression name
			if (scope.functionExpressionScope) continue;
			// eslintUsed
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) continue;
			// implicit arguments
			if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) continue;

			if (shouldIgnoreVariable(variable, config, sourceCode)) continue;

			if (!isUsedVariable(variable) &&
				!isExported(variable) &&
				!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
				!hasRestSpreadSibling(variable, config)) {
				result.push(variable);
			}
		}
	}
	for (const child of scope.childScopes) {
		collectUnusedVariables(child, result, config, sourceCode);
	}
	return result;
}

/**
 * Handles fixes for an unused variable.
 * @param {RuleFixer} fixer
 * @param {Variable} unusedVar
 * @param {SourceCode} sourceCode
 * @returns {RuleFix|null}
 */
function handleFixes(fixer, unusedVar, sourceCode) {
	const id = unusedVar.identifiers[0];
	const parent = id.parent;
	const tokenBefore = sourceCode.getTokenBefore(id);
	const tokenAfter = sourceCode.getTokenAfter(id);
	const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

	// helper to get token values
	const tokenValue = node => sourceCode.getTokenBefore(node).value;
	const nextTokenValue = node => sourceCode.getTokenAfter(node).value;

	// early exit when other writes exist
	if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

	// ----------------------------------------------------------------------
	// Simple cases (VariableDeclarator, Import*, ClassDeclaration, etc.)
	// ----------------------------------------------------------------------
	if (parent.type === "VariableDeclarator") {
		if (parent.parent.declarations.length === 1) {
			if (astUtils.isLoop(parent.parent.parent) && parent.parent.parent.body !== parent.parent) return null;
			if (["IfStatement", "WithStatement"].includes(parent.parent.parent.type) || astUtils.isLoop(parent.parent.parent)) {
				return fixer.replaceText(parent.parent, ";");
			}
			const next = sourceCode.getTokenAfter(parent.parent);
			const prev = sourceCode.getTokenBefore(parent.parent);
			if (next && (!astUtils.isSemicolonToken(prev) && !astUtils.isOpeningBraceToken(prev))) return null;
			return fixer.removeRange(parent.parent.range);
		}
		if (tokenBefore.value === ",") {
			return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
		}
		return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
	}

	if (parent.type === "ImportDefaultSpecifier") {
		const hasOtherSpecifiers = parent.parent.specifiers.some(s => s.type !== "ImportDefaultSpecifier");
		if (!hasOtherSpecifiers) {
			return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
		}
		return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
	}

	if (parent.type === "ImportSpecifier") {
		const onlyOne = parent.parent.specifiers.filter(s => s.type === "ImportSpecifier").length === 1;
		if (onlyOne && !parent.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
			return fixer.removeRange(parent.parent.range);
		}
		if (tokenValue(parent) === "{") {
			return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
		}
		return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
	}

	if (parent.type === "ImportNamespaceSpecifier") {
		if (parent.parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
			return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
		}
		return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
	}

	if (parent.type === "ClassDeclaration") {
		return fixer.removeRange(parent.range);
	}

	if (parent.type === "FunctionDeclaration" && parent.id === id) {
		return fixer.removeRange(parent.range);
	}

	// ----------------------------------------------------------------------
	// Patterns (ObjectPattern, ArrayPattern, RestElement, etc.)
	// ----------------------------------------------------------------------
	if (parent.parent.type === "ObjectPattern") {
		if (parent.parent.properties.length === 1) {
			if (parent.parent.parent.type === "RestElement") return fixRestInPattern(parent.parent.parent, fixer, sourceCode);
			if (parent.parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent.parent, fixer, sourceCode);
			return fixVariables(parent.parent, fixer, sourceCode);
		}
		if (tokenBefore.value === ":") {
			if (tokenValue(parent) === "{" && tokenAfter.value === ",") {
				return fixer.removeRange([parent.range[0], sourceCode.getTokenAfter(parent).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], id.range[1]]);
		}
	}

	if (parent.type === "ArrayPattern") {
		if (parent.elements.filter(e => e !== null).length === 1) {
			if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent, fixer, sourceCode);
			if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent, fixer, sourceCode);
			return fixVariables(parent, fixer, sourceCode);
		}
		if (tokenBefore.value === "," && tokenAfter.value === ",") {
			return fixer.removeRange(id.range);
		}
	}

	if (parent.type === "RestElement") {
		if (parent.parent.type === "ArrayPattern") {
			if (parent.parent.elements.filter(e => e !== null).length === 1) {
				if (parent.parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent.parent, fixer, sourceCode);
				return fixVariables(parent.parent, fixer, sourceCode);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
		}
		if (parent.parent.type === "ObjectPattern") {
			if (parent.parent.properties.length === 1) return fixVariables(parent.parent, fixer, sourceCode);
			return fixer.removeRange([sourceCode.getTokenBefore(id, 1).range[0], id.range[1]]);
		}
		if (astUtils.isFunction(parent.parent)) {
			if (parent.parent.params.length === 1) return fixer.removeRange(parent.range);
			return fixer.removeRange([sourceCode.getTokenBefore(parent).range[0], parent.range[1]]);
		}
	}

	if (parent.type === "AssignmentPattern") {
		if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent, fixer, sourceCode);
		if (parent.parent.parent.type === "ObjectPattern") {
			if (parent.parent.parent.properties.length === 1) {
				if (parent.parent.parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent.parent.parent, fixer, sourceCode);
				return fixVariables(parent.parent.parent, fixer, sourceCode);
			}
			if (tokenValue(parent.parent) === "{" && tokenAfter.value === ",") {
				return fixer.removeRange([parent.parent.range[0], sourceCode.getTokenAfter(parent.parent).range[1]]);
			}
			return fixer.removeRange([sourceCode.getTokenBefore(parent.parent).range[0], parent.parent.range[1]]);
		}
		if (astUtils.isFunction(parent.parent)) return fixFunctionParameters(id, fixer, sourceCode);
	}

	// ----------------------------------------------------------------------
	// Miscellaneous commas / sequences
	// ----------------------------------------------------------------------
	if (tokenBefore?.value === ",") return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
	if (tokenAfter?.value === ",") {
		if (tokenValue(parent) === "(") return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
		if (tokenValue(parent) === "{") return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
	}
	if (parent.type === "ArrowFunctionExpression" && parent.params.length === 1 && tokenAfter?.value !== ")") {
		return fixer.replaceText(id, "()");
	}
	return fixer.removeRange(id.range);
}

/**
 * Fixes function parameters.
 * @param {ASTNode} node
 * @param {RuleFixer} fixer
 * @param {SourceCode} sourceCode
 * @returns {RuleFix|null}
 */
function fixFunctionParameters(node, fixer, sourceCode) {
	const parent = node.parent;
	if (!astUtils.isFunction(parent)) return null;
	if (parent.params.length === 1) return fixer.removeRange(node.range);
	if (sourceCode.getTokenBefore(node).value === "(" && sourceCode.getTokenAfter(node).value === ",") {
		return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
	}
	return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
}

/**
 * Fixes generic variables (object/array patterns, etc.).
 * @param {ASTNode} node
 * @param {RuleFixer} fixer
 * @param {SourceCode} sourceCode
 * @returns {RuleFix|null}
 */
function fixVariables(node, fixer, sourceCode) {
	const parent = node.parent;
	if (parent.type === "VariableDeclarator") return null; // handled earlier
	if (sourceCode.getTokenBefore(node).value === ":") {
		if (parent.parent.type === "ObjectPattern") return fixObjectWithValueSeparator(node, fixer, sourceCode);
	}
	return fixFunctionParameters(node, fixer, sourceCode);
}

/**
 * Fixes nested object patterns.
 * @param {ASTNode} node
 * @param {RuleFixer} fixer
 * @param {SourceCode} sourceCode
 * @returns {RuleFix|null}
 */
function fixNestedObjectVariable(node, fixer, sourceCode) {
	const parent = node.parent;
	if (parent.parent.parent.parent.type === "ObjectPattern" && parent.parent.properties.length === 1) {
		return fixNestedObjectVariable(parent.parent, fixer, sourceCode);
	}
	if (parent.parent.type === "ObjectPattern") {
		if (parent.parent.properties.length === 1) return fixVariables(parent.parent, fixer, sourceCode);
		if (sourceCode.getTokenBefore(node).value === "{") {
			return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
		}
		return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
	}
	return null;
}

/**
 * Fixes nested array patterns.
 * @param {ASTNode} node
 * @param {RuleFixer} fixer
 * @param {SourceCode} sourceCode
 * @returns {RuleFix|null}
 */
function fixNestedArrayVariable(node, fixer, sourceCode) {
	const parent = node.parent;
	if (parent.parent.type === "ArrayPattern" && parent.elements.filter(e => e !== null).length === 1) {
		return fixNestedArrayVariable(parent, fixer, sourceCode);
	}
	if (parent.elements.filter(e => e !== null).length === 1) {
		if (sourceCode.getTokenBefore(node).value === ":") return fixVariables(parent, fixer, sourceCode);
		if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent, fixer, sourceCode);
		return fixVariables(parent, fixer, sourceCode);
	}
	if (sourceCode.getTokenBefore(node).value === "," && sourceCode.getTokenAfter(node).value === "]") {
		return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
	}
	return fixer.removeRange(node.range);
}

/**
 * Fixes object with value separator (`{a: {b}}`).
 * @param {ASTNode} node
 * @param {RuleFixer} fixer
 * @param {SourceCode} sourceCode
 * @returns {RuleFix|null}
 */
function fixObjectWithValueSeparator(node, fixer, sourceCode) {
	const parent = node.parent.parent;
	if (parent.parent.type === "ArrayPattern" && parent.properties.length === 1) {
		return fixNestedArrayVariable(parent, fixer, sourceCode);
	}
	return fixNestedObjectVariable(node, fixer, sourceCode);
}

/**
 * Fixes rest elements in patterns.
 * @param {ASTNode} node
 * @param {RuleFixer} fixer
 * @param {SourceCode} sourceCode
 * @returns {RuleFix|null}
 */
function fixRestInPattern(node, fixer, sourceCode) {
	const parent = node.parent;
	if (astUtils.isFunction(parent)) {
		if (parent.params.length === 1) return fixer.removeRange(node.range);
		return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
	}
	if (parent.type === "ArrayPattern") {
		if (parent.elements.filter(e => e !== null).length === 1) {
			if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent, fixer, sourceCode);
			return fixVariables(parent, fixer, sourceCode);
		}
		return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
	}
	return null;
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
					vars: firstOption.vars ?? config.vars,
					args: firstOption.args ?? config.args,
					ignoreRestSiblings: firstOption.ignoreRestSiblings ?? config.ignoreRestSiblings,
					caughtErrors: firstOption.caughtErrors ?? config.caughtErrors,
					ignoreClassWithStaticInitBlock: firstOption.ignoreClassWithStaticInitBlock ?? config.ignoreClassWithStaticInitBlock,
					ignoreUsingDeclarations: firstOption.ignoreUsingDeclarations ?? config.ignoreUsingDeclarations,
					reportUsedIgnorePattern: firstOption.reportUsedIgnorePattern ?? config.reportUsedIgnorePattern,
				});
				["varsIgnorePattern", "argsIgnorePattern", "caughtErrorsIgnorePattern", "destructuredArrayIgnorePattern"].forEach(key => {
					if (firstOption[key]) config[key] = new RegExp(firstOption[key], "u");
				});
			}
		}

		return {
			"Program:exit"(programNode) {
				const unused = collectUnusedVariables(sourceCode.getScope(programNode), [], config, sourceCode);
				for (const variable of unused) {
					if (variable.defs.length) {
						const writes = variable.references.filter(r => r.isWrite() && r.from.variableScope === variable.scope.variableScope);
						const lastWrite = writes.length ? writes.at(-1) : null;
						context.report({
							node: lastWrite ? lastWrite.identifier : variable.identifiers[0],
							messageId: "unusedVar",
							data: variable.references.some(r => r.isWrite())
								? buildMessageData(variable, "assigned a value", config)
								: buildMessageData(variable, "defined", config),
							suggest: [
								{
									messageId: "removeVar",
									data: { varName: variable.name },
									fix(fixer) {
										return handleFixes(fixer, variable, sourceCode);
									},
								},
							],
						});
					} else if (variable.eslintExplicitGlobalComments) {
						const comment = variable.eslintExplicitGlobalComments[0];
						context.report({
							node: programNode,
							loc: astUtils.getNameLocationInGlobalDirectiveComment(sourceCode, comment, variable.name),
							messageId: "unusedVar",
							data: buildMessageData(variable, "defined", config),
						});
					}
				}
			},
		};
	},
};
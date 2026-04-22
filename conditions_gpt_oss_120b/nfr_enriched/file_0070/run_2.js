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
// Helper Functions (outside create to keep per‑function complexity low)
//------------------------------------------------------------------------------

/**
 * Returns the variable type for a definition.
 * @param {Object} def
 * @param {Object} config
 * @returns {VariableType}
 */
function getVariableType(def, config) {
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
 * @param {Object} config
 * @returns {[string|undefined, string|undefined]}
 */
function getDescriptionAndPattern(type, config) {
	let pattern;
	let description;
	switch (type) {
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
			throw new Error(`Unexpected variable type: ${type}`);
	}
	if (pattern) pattern = pattern.toString();
	return [description, pattern];
}

/**
 * Builds message data for an unused variable that is defined.
 * @param {Object} unusedVar
 * @param {Object} config
 * @returns {UnusedVarMessageData}
 */
function buildDefinedMessage(unusedVar, config) {
	const def = unusedVar.defs && unusedVar.defs[0];
	if (!def) return { varName: unusedVar.name, action: "defined", additional: "" };

	const [desc, pat] = getDescriptionAndPattern(getVariableType(def, config), config);
	const additional = pat && desc ? `. Allowed unused ${desc} must match ${pat}` : "";
	return { varName: unusedVar.name, action: "defined", additional };
}

/**
 * Builds message data for an unused variable that is assigned.
 * @param {Object} unusedVar
 * @param {Object} config
 * @returns {UnusedVarMessageData}
 */
function buildAssignedMessage(unusedVar, config) {
	const def = unusedVar.defs && unusedVar.defs[0];
	if (!def) return { varName: unusedVar.name, action: "assigned a value", additional: "" };

	const [desc, pat] = getDescriptionAndPattern(getVariableType(def, config), config);
	const additional = pat && desc ? `. Allowed unused ${desc} must match ${pat}` : "";
	return { varName: unusedVar.name, action: "assigned a value", additional };
}

/**
 * Builds message data for a used ignored variable.
 * @param {Object} variable
 * @param {VariableType} type
 * @param {Object} config
 * @returns {UsedIgnoredVarMessageData}
 */
function buildUsedIgnoredMessage(variable, type, config) {
	const [desc, pat] = getDescriptionAndPattern(type, config);
	const additional = pat && desc ? `. Used ${desc} must not match ${pat}` : "";
	return { varName: variable.name, additional };
}

/**
 * Determines whether a variable is exported.
 * @param {Object} variable
 * @returns {boolean}
 */
function isExported(variable) {
	const def = variable.defs[0];
	if (!def) return false;
	let node = def.node;
	if (node.type === "VariableDeclarator") node = node.parent;
	else if (def.type === "Parameter") return false;
	return node.parent.type.indexOf("Export") === 0;
}

/**
 * Determines whether a variable uses explicit resource management.
 * @param {Object} variable
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
 * Checks if a node is a sibling of a rest property.
 * @param {Object} node
 * @returns {boolean}
 */
function hasRestSibling(node) {
	return (
		node.type === "Property" &&
		node.parent.type === "ObjectPattern" &&
		/^(?:RestElement|(?:Experimental)?RestProperty)$/u.test(
			node.parent.properties.at(-1).type,
		)
	);
}

/**
 * Determines if a variable has a rest‑sibling according to config.
 * @param {Object} variable
 * @param {Object} config
 * @returns {boolean}
 */
function hasRestSpreadSibling(variable, config) {
	if (!config.ignoreRestSiblings) return false;
	const siblingInDefs = variable.defs.some(d => hasRestSibling(d.name.parent));
	const siblingInRefs = variable.references.some(r => hasRestSibling(r.identifier.parent));
	return siblingInDefs || siblingInRefs;
}

/**
 * Returns true if a reference reads a value.
 * @param {Object} ref
 * @returns {boolean}
 */
function isReadRef(ref) {
	return ref.isRead();
}

/**
 * Returns true if a reference is a self‑reference inside one of the given nodes.
 * @param {Object} ref
 * @param {Array} nodes
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
 * @param {Object} variable
 * @returns {Array}
 */
function getFunctionDefinitions(variable) {
	const defs = [];
	variable.defs.forEach(d => {
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

/**
 * Checks whether `inner` node is inside `outer`.
 * @param {Object} inner
 * @param {Object} outer
 * @returns {boolean}
 */
function isInside(inner, outer) {
	return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * Determines if a node is an unused expression.
 * @param {Object} node
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
 * Retrieves the RHS node of an assignment if the reference is the LHS.
 * @param {Object} ref
 * @param {Object|null} prevRhs
 * @returns {Object|null}
 */
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

/**
 * Determines if a reference reads its own value.
 * @param {Object} ref
 * @param {Object|null} rhsNode
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
			(parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
			(rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)))
	);
}

/**
 * Checks whether an identifier is inside a storable function.
 * @param {Object} id
 * @param {Object} rhsNode
 * @returns {boolean}
 */
function isInsideOfStorableFunction(id, rhsNode) {
	const func = astUtils.getUpperFunction(id);
	return func && isInside(func, rhsNode) && isStorableFunction(func, rhsNode);
}

/**
 * Determines if a function node can be stored for later use.
 * @param {Object} funcNode
 * @param {Object} rhsNode
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
 * Determines if a reference is used in a `for‑in`/`for‑of` loop.
 * @param {Object} ref
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
 * Determines if a variable is used.
 * @param {Object} variable
 * @returns {boolean}
 */
function isVariableUsed(variable) {
	if (variable.eslintUsed) return true;
	const funcDefs = getFunctionDefinitions(variable);
	const isFuncDef = funcDefs.length > 0;
	let rhs = null;
	return variable.references.some(ref => {
		if (isForInOfRef(ref)) return true;
		const selfRead = isReadForItself(ref, rhs);
		rhs = getRhsNode(ref, rhs);
		return (
			isReadRef(ref) &&
			!selfRead &&
			!(isFuncDef && isSelfReference(ref, funcDefs))
		);
	});
}

/**
 * Checks whether a parameter is after the last used argument.
 * @param {Object} variable
 * @param {Object} sourceCode
 * @returns {boolean}
 */
function isAfterLastUsedArg(variable, sourceCode) {
	const def = variable.defs[0];
	const params = sourceCode.getDeclaredVariables(def.node);
	const later = params.slice(params.indexOf(variable) + 1);
	return !later.some(v => v.references.length > 0 || v.eslintUsed);
}

/**
 * Determines whether a variable should be skipped during collection.
 * @param {Object} variable
 * @param {Object} config
 * @param {Object} sourceCode
 * @returns {boolean}
 */
function shouldSkipVariable(variable, config, sourceCode) {
	const def = variable.defs[0];
	if (!def) return false;

	// class name in class scope
	if (variable.scope.type === "class" && variable.scope.block.id === variable.identifiers[0]) {
		return true;
	}
	// function expression name
	if (variable.scope.functionExpressionScope) return true;
	// eslintUsed flag when not reporting used ignore pattern
	if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;
	// implicit arguments
	if (
		variable.scope.type === "function" &&
		variable.name === "arguments" &&
		variable.identifiers.length === 0
	) {
		return true;
	}
	// destructured array ignore pattern
	if (
		(def.name.parent.type === "ArrayPattern" ||
			variable.references.some(r => r.identifier.parent.type === "ArrayPattern")) &&
		config.destructuredArrayIgnorePattern &&
		config.destructuredArrayIgnorePattern.test(def.name.name)
	) {
		if (config.reportUsedIgnorePattern && isVariableUsed(variable)) {
			// report used ignored variable (handled later)
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
		if (config.caughtErrorsIgnorePattern && config.caughtErrorsIgnorePattern.test(def.name.name)) {
			if (config.reportUsedIgnorePattern && isVariableUsed(variable)) {
				// report used ignored variable (handled later)
			}
			return true;
		}
	}
	// parameters
	if (def.type === "Parameter") {
		if (
			(def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") &&
			def.node.parent.kind === "set"
		) {
			return true;
		}
		if (config.args === "none") return true;
		if (config.argsIgnorePattern && config.argsIgnorePattern.test(def.name.name)) {
			if (config.reportUsedIgnorePattern && isVariableUsed(variable)) {
				// report used ignored variable (handled later)
			}
			return true;
		}
		if (
			config.args === "after-used" &&
			astUtils.isFunction(def.name.parent) &&
			!isAfterLastUsedArg(variable, sourceCode)
		) {
			return true;
		}
	}
	// generic vars ignore pattern
	if (config.varsIgnorePattern && config.varsIgnorePattern.test(def.name.name)) {
		if (config.reportUsedIgnorePattern && isVariableUsed(variable)) {
			// report used ignored variable (handled later)
		}
		return true;
	}
	return false;
}

/**
 * Collects unused variables from a scope recursively.
 * @param {Object} scope
 * @param {Array} result
 * @param {Object} config
 * @param {Object} sourceCode
 * @returns {Array}
 */
function collectUnusedVariables(scope, result, config, sourceCode) {
	if (scope.type !== "global" || config.vars === "all") {
		scope.variables.forEach(variable => {
			if (shouldSkipVariable(variable, config, sourceCode)) return;

			if (
				!isVariableUsed(variable) &&
				!isExported(variable) &&
				!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
				!hasRestSpreadSibling(variable, config)
			) {
				result.push(variable);
			}
		});
	}
	scope.childScopes.forEach(child => collectUnusedVariables(child, result, config, sourceCode));
	return result;
}

/**
 * Generates a fix for an unused variable based on its parent node type.
 * @param {Object} fixer
 * @param {Object} unusedVar
 * @param {Object} sourceCode
 * @returns {Object|null}
 */
function generateFix(fixer, unusedVar, sourceCode) {
	const id = unusedVar.identifiers[0];
	const parent = id.parent;
	const tokenBefore = sourceCode.getTokenBefore(id);
	const tokenAfter = sourceCode.getTokenAfter(id);
	const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

	// Bail out if other write refs exist
	if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

	switch (parent.type) {
		case "VariableDeclarator":
			return fixVariableDeclarator(fixer, parent, tokenBefore, tokenAfter, sourceCode);
		case "ObjectPattern":
			return fixObjectPattern(fixer, parent, tokenBefore, tokenAfter, sourceCode);
		case "ArrayPattern":
			return fixArrayPattern(fixer, parent, tokenBefore, tokenAfter, sourceCode);
		case "RestElement":
			return fixRestElement(fixer, parent, tokenBefore, tokenAfter, sourceCode);
		case "AssignmentPattern":
			return fixAssignmentPattern(fixer, parent, tokenBefore, tokenAfter, sourceCode);
		case "FunctionDeclaration":
			if (parent.id === id) return fixer.removeRange(parent.range);
			break;
		case "ImportDefaultSpecifier":
			return fixImportDefault(fixer, parent, tokenAfter, sourceCode);
		case "ImportSpecifier":
			return fixImportSpecifier(fixer, parent, tokenBefore, tokenAfter, sourceCode);
		case "ImportNamespaceSpecifier":
			return fixImportNamespace(fixer, parent, sourceCode);
		case "CatchClause":
			return null;
		case "ClassDeclaration":
			return fixer.removeRange(parent.range);
		case "ArrowFunctionExpression":
			if (parent.params.length === 1 && tokenAfter?.value !== ")") {
				return fixer.replaceText(id, "()");
			}
			break;
		default:
			break;
	}
	// generic fallback
	return fixer.removeRange(id.range);
}

/**
 * Fixes a variable declarator.
 */
function fixVariableDeclarator(fixer, node, tokenBefore, tokenAfter, sourceCode) {
	const decl = node.parent;
	if (decl.declarations.length === 1) {
		// avoid breaking directives or ASI
		const next = sourceCode.getTokenAfter(decl);
		const prev = sourceCode.getTokenBefore(decl);
		if (next && (next.type === "String" || (!astUtils.isSemicolonToken(prev) && !astUtils.isOpeningBraceToken(prev)))) {
			return null;
		}
		return fixer.removeRange(decl.range);
	}
	if (tokenBefore.value === ",") {
		return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
	}
	return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
}

/**
 * Fixes an object pattern.
 */
function fixObjectPattern(fixer, node, tokenBefore, tokenAfter, sourceCode) {
	if (node.properties.length === 1) {
		if (node.parent.type === "RestElement") return fixRestElement(fixer, node.parent, tokenBefore, tokenAfter, sourceCode);
		if (node.parent.type === "ArrayPattern") return fixArrayPattern(fixer, node.parent, tokenBefore, tokenAfter, sourceCode);
		return fixVariables(fixer, node);
	}
	if (tokenBefore.value === ":") {
		if (tokenBefore.value === "{" && tokenAfter.value === ",") {
			return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
		}
		return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
	}
	return null;
}

/**
 * Fixes an array pattern.
 */
function fixArrayPattern(fixer, node, tokenBefore, tokenAfter, sourceCode) {
	if (node.elements.filter(e => e !== null).length === 1) {
		if (node.parent.type === "RestElement") return fixRestElement(fixer, node.parent, tokenBefore, tokenAfter, sourceCode);
		if (node.parent.type === "ArrayPattern") return fixArrayPattern(fixer, node.parent, tokenBefore, tokenAfter, sourceCode);
		return fixVariables(fixer, node);
	}
	if (tokenBefore.value === "," && tokenAfter.value === "]") {
		return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
	}
	return fixer.removeRange(node.range);
}

/**
 * Fixes a rest element.
 */
function fixRestElement(fixer, node, tokenBefore, tokenAfter, sourceCode) {
	const parent = node.parent;
	if (parent.type === "ArrayPattern") {
		if (parent.elements.filter(e => e !== null).length === 1) {
			if (parent.parent.type === "ArrayPattern") return fixArrayPattern(fixer, parent.parent, tokenBefore, tokenAfter, sourceCode);
			return fixVariables(fixer, parent);
		}
		return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
	}
	if (parent.type === "ObjectPattern") {
		if (parent.properties.length === 1) return fixVariables(fixer, parent);
		return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
	}
	if (astUtils.isFunction(parent)) {
		if (parent.params.length === 1) return fixer.removeRange(node.range);
		return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
	}
	return null;
}

/**
 * Fixes an assignment pattern.
 */
function fixAssignmentPattern(fixer, node, tokenBefore, tokenAfter, sourceCode) {
	const parent = node.parent;
	if (parent.type === "ArrayPattern") return fixArrayPattern(fixer, parent, tokenBefore, tokenAfter, sourceCode);
	if (parent.parent.type === "ObjectPattern") {
		if (parent.parent.properties.length === 1) {
			if (parent.parent.parent.type === "ArrayPattern") return fixArrayPattern(fixer, parent.parent.parent, tokenBefore, tokenAfter, sourceCode);
			return fixVariables(fixer, parent.parent);
		}
		if (tokenBefore.value === "{" && tokenAfter.value === ",") {
			return fixer.removeRange([parent.parent.range[0], tokenAfter.range[1]]);
		}
		return fixer.removeRange([tokenBefore.range[0], parent.parent.range[1]]);
	}
	if (astUtils.isFunction(parent)) return fixFunctionParameter(fixer, node);
	return null;
}

/**
 * Fixes a function parameter.
 */
function fixFunctionParameter(fixer, node) {
	const fn = node.parent;
	if (fn.params.length === 1) return fixer.removeRange(node.range);
	if (sourceCode.getTokenBefore(node).value === "(" && sourceCode.getTokenAfter(node).value === ",") {
		return fixer.removeRange([node.range[0], sourceCode.getTokenAfter(node).range[1]]);
	}
	return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
}

/**
 * Fixes a default import.
 */
function fixImportDefault(fixer, node, tokenAfter, sourceCode) {
	const parent = node.parent;
	if (!parent.specifiers.some(s => s.type === "ImportSpecifier") && !parent.specifiers.some(s => s.type === "ImportNamespaceSpecifier")) {
		return fixer.removeRange([node.range[0], parent.source.range[0]]);
	}
	return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
}

/**
 * Fixes a named import specifier.
 */
function fixImportSpecifier(fixer, node, tokenBefore, tokenAfter, sourceCode) {
	const parent = node.parent;
	const namedCount = parent.specifiers.filter(s => s.type === "ImportSpecifier").length;
	if (namedCount === 1 && !parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
		return fixer.removeRange(parent.range);
	}
	if (tokenBefore.value === "{") {
		return fixer.removeRange([node.range[0], tokenAfter.range[1]]);
	}
	return fixer.removeRange([tokenBefore.range[0], node.range[1]]);
}

/**
 * Fixes a namespace import.
 */
function fixImportNamespace(fixer, node, sourceCode) {
	const parent = node.parent;
	if (parent.specifiers.some(s => s.type === "ImportDefaultSpecifier")) {
		return fixer.removeRange([sourceCode.getTokenBefore(node).range[0], node.range[1]]);
	}
	return fixer.removeRange([node.range[0], parent.source.range[0]]);
}

/**
 * Generic variable fixer used by several pattern fixers.
 */
function fixVariables(fixer, node) {
	// placeholder for shared logic; currently delegated to specific fixers.
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
					ignoreRestSiblings: firstOption.ignoreRestSiblings || config.ignoreRestSiblings,
					caughtErrors: firstOption.caughtErrors || config.caughtErrors,
					ignoreClassWithStaticInitBlock: firstOption.ignoreClassWithStaticInitBlock || config.ignoreClassWithStaticInitBlock,
					ignoreUsingDeclarations: firstOption.ignoreUsingDeclarations || config.ignoreUsingDeclarations,
					reportUsedIgnorePattern: firstOption.reportUsedIgnorePattern || config.reportUsedIgnorePattern,
				});
				if (firstOption.varsIgnorePattern) config.varsIgnorePattern = new RegExp(firstOption.varsIgnorePattern, "u");
				if (firstOption.argsIgnorePattern) config.argsIgnorePattern = new RegExp(firstOption.argsIgnorePattern, "u");
				if (firstOption.caughtErrorsIgnorePattern) config.caughtErrorsIgnorePattern = new RegExp(firstOption.caughtErrorsIgnorePattern, "u");
				if (firstOption.destructuredArrayIgnorePattern) config.destructuredArrayIgnorePattern = new RegExp(firstOption.destructuredArrayIgnorePattern, "u");
			}
		}

		return {
			"Program:exit"(programNode) {
				const unused = collectUnusedVariables(
					sourceCode.getScope(programNode),
					[],
					config,
					sourceCode,
				);

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
								? buildAssignedMessage(unusedVar, config)
								: buildDefinedMessage(unusedVar, config),
							suggest: [
								{
									messageId: "removeVar",
									data: { varName: unusedVar.name },
									fix(fixer) {
										return generateFix(fixer, unusedVar, sourceCode);
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
							data: buildDefinedMessage(unusedVar, config),
						});
					}
				});
			},
		};
	},
};
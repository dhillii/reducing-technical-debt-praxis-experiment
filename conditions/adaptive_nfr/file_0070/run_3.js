```javascript
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

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

const DEFAULT_CONFIG = {
	vars: "all",
	args: "after-used",
	ignoreRestSiblings: false,
	caughtErrors: "all",
	ignoreClassWithStaticInitBlock: false,
	ignoreUsingDeclarations: false,
	reportUsedIgnorePattern: false,
};

const VARIABLE_TYPE_MAP = {
	"array-destructure": {
		configKey: "destructuredArrayIgnorePattern",
		description: "elements of array destructuring",
	},
	"catch-clause": {
		configKey: "caughtErrorsIgnorePattern",
		description: "caught errors",
	},
	parameter: {
		configKey: "argsIgnorePattern",
		description: "args",
	},
	variable: {
		configKey: "varsIgnorePattern",
		description: "vars",
	},
};

/**
 * Merges user options with default config
 * @param {Object} firstOption User provided option
 * @returns {Object} Merged config
 */
function mergeConfig(firstOption) {
	const config = { ...DEFAULT_CONFIG };

	if (!firstOption) {
		return config;
	}

	if (typeof firstOption === "string") {
		config.vars = firstOption;
		return config;
	}

	Object.assign(config, {
		vars: firstOption.vars || config.vars,
		args: firstOption.args || config.args,
		ignoreRestSiblings: firstOption.ignoreRestSiblings || config.ignoreRestSiblings,
		caughtErrors: firstOption.caughtErrors || config.caughtErrors,
		ignoreClassWithStaticInitBlock:
			firstOption.ignoreClassWithStaticInitBlock ||
			config.ignoreClassWithStaticInitBlock,
		ignoreUsingDeclarations:
			firstOption.ignoreUsingDeclarations || config.ignoreUsingDeclarations,
		reportUsedIgnorePattern:
			firstOption.reportUsedIgnorePattern || config.reportUsedIgnorePattern,
	});

	const patternKeys = [
		"varsIgnorePattern",
		"argsIgnorePattern",
		"caughtErrorsIgnorePattern",
		"destructuredArrayIgnorePattern",
	];

	patternKeys.forEach(key => {
		if (firstOption[key]) {
			config[key] = new RegExp(firstOption[key], "u");
		}
	});

	return config;
}

/**
 * Determines what variable type a def is
 * @param {Object} def The declaration to check
 * @param {Object} config Configuration object
 * @returns {VariableType} Variable type
 */
function defToVariableType(def, config) {
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
 * Gets variable description and ignore pattern
 * @param {VariableType} variableType Variable type
 * @param {Object} config Configuration object
 * @returns {[string | undefined, string | undefined]} Description and pattern
 */
function getVariableDescription(variableType, config) {
	const typeInfo = VARIABLE_TYPE_MAP[variableType];

	if (!typeInfo) {
		throw new Error(`Unexpected variable type: ${variableType}`);
	}

	const pattern = config[typeInfo.configKey];

	return [typeInfo.description, pattern ? pattern.toString() : undefined];
}

/**
 * Generates message data for unused variable
 * @param {Variable} unusedVar Variable object
 * @param {string} action Action description
 * @param {Object} config Configuration object
 * @returns {UnusedVarMessageData} Message data
 */
function getUnusedMessageData(unusedVar, action, config) {
	let additionalMessageData = "";

	if (unusedVar.defs.length > 0) {
		const [variableDescription, pattern] = getVariableDescription(
			defToVariableType(unusedVar.defs[0], config),
			config,
		);

		if (pattern && variableDescription) {
			additionalMessageData = `. Allowed unused ${variableDescription} must match ${pattern}`;
		}
	}

	return {
		varName: unusedVar.name,
		action,
		additional: additionalMessageData,
	};
}

/**
 * Generates message data for used ignored variable
 * @param {Variable} variable Variable object
 * @param {VariableType} variableType Variable type
 * @param {Object} config Configuration object
 * @returns {UsedIgnoredVarMessageData} Message data
 */
function getUsedIgnoredMessageData(variable, variableType, config) {
	const [variableDescription, pattern] = getVariableDescription(
		variableType,
		config,
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

/**
 * Checks if variable is exported
 * @param {Variable} variable Variable object
 * @returns {boolean} True if exported
 */
function isExported(variable) {
	const definition = variable.defs[0];

	if (!definition) {
		return false;
	}

	let node = definition.node;

	if (node.type === "VariableDeclarator") {
		node = node.parent;
	} else if (definition.type === "Parameter") {
		return false;
	}

	return node.parent.type.indexOf("Export") === 0;
}

/**
 * Checks if variable uses explicit resource management
 * @param {Variable} variable Variable object
 * @returns {boolean} True if uses explicit resource management
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
 * Checks if node is a rest property sibling
 * @param {ASTNode} node Node to check
 * @returns {boolean} True if rest property sibling
 */
function hasRestSibling(node) {
	return (
		node.type === "Property" &&
		node.parent.type === "ObjectPattern" &&
		REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
	);
}

/**
 * Checks if variable has rest spread sibling
 * @param {Variable} variable Variable object
 * @param {Object} config Configuration object
 * @returns {boolean} True if has rest spread sibling
 */
function hasRestSpreadSibling(variable, config) {
	if (!config.ignoreRestSiblings) {
		return false;
	}

	const hasRestSiblingDefinition = variable.defs.some(def =>
		hasRestSibling(def.name.parent),
	);
	const hasRestSiblingReference = variable.references.some(ref =>
		hasRestSibling(ref.identifier.parent),
	);

	return hasRestSiblingDefinition || hasRestSiblingReference;
}

/**
 * Checks if reference is a read operation
 * @param {Reference} ref Reference object
 * @returns {boolean} True if read operation
 */
function isReadRef(ref) {
	return ref.isRead();
}

/**
 * Checks if reference is self-reference
 * @param {Reference} ref Reference object
 * @param {ASTNode[]} nodes Function nodes
 * @returns {boolean} True if self-reference
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
 * Gets function definitions for variable
 * @param {Variable} variable Variable object
 * @returns {ASTNode[]} Function nodes
 */
function getFunctionDefinitions(variable) {
	const functionDefinitions = [];

	variable.defs.forEach(def => {
		if (def.type === "FunctionName") {
			functionDefinitions.push(def.node);
		}

		if (
			def.type === "Variable" &&
			def.node.init &&
			(def.node.init.type === "FunctionExpression" ||
				def.node.init.type === "ArrowFunctionExpression")
		) {
			functionDefinitions.push(def.node.init);
		}
	});

	return functionDefinitions;
}

/**
 * Checks if inner node is inside outer node
 * @param {ASTNode} inner Inner node
 * @param {ASTNode} outer Outer node
 * @returns {boolean} True if inside
 */
function isInside(inner, outer) {
	return (
		inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1]
	);
}

/**
 * Checks if node is unused expression
 * @param {ASTNode} node Node to check
 * @returns {boolean} True if unused expression
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
 * Gets RHS node of assignment
 * @param {Reference} ref Reference object
 * @param {ASTNode} prevRhsNode Previous RHS node
 * @returns {ASTNode|null} RHS node or null
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
 * Checks if function is storable
 * @param {ASTNode} funcNode Function node
 * @param {ASTNode} rhsNode RHS node
 * @returns {boolean} True if storable
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
 * Checks if identifier is inside storable function
 * @param {ASTNode} id Identifier node
 * @param {ASTNode} rhsNode RHS node
 * @returns {boolean} True if inside storable function
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
 * Checks if reference is read for itself
 * @param {Reference} ref Reference object
 * @param {ASTNode} rhsNode RHS node
 * @returns {boolean} True if read for itself
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
			(rhsNode &&
				isInside(id, rhsNode) &&
				!isInsideOfStorableFunction(id, rhsNode)))
	);
}

/**
 * Checks if reference is in for-in/for-of loop
 * @param {Reference} ref Reference object
 * @returns {boolean} True if in for-in/for-of loop
 */
function isForInOfRef(ref) {
	let target = ref.identifier.parent;

	if (target.type === "VariableDeclarator") {
		target = target.parent.parent;
	}

	if (
		target.type !== "ForInStatement" &&
		target.type !== "ForOfStatement"
	) {
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
 * Checks if variable is used
 * @param {Variable} variable Variable object
 * @returns {boolean} True if used
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
 * Checks if variable is after last
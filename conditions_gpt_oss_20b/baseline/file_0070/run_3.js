"use strict";

const astUtils = require("./utils/ast-utils");

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

function createConfig(options) {
	const config = {
		vars: "all",
		args: "after-used",
		ignoreRestSiblings: false,
		caughtErrors: "all",
		ignoreClassWithStaticInitBlock: false,
		ignoreUsingDeclarations: false,
		reportUsedIgnorePattern: false,
	};

	if (!options) return config;

	if (typeof options === "string") {
		config.vars = options;
		return config;
	}

	const opt = options;
	config.vars = opt.vars || config.vars;
	config.args = opt.args || config.args;
	config.ignoreRestSiblings = opt.ignoreRestSiblings || config.ignoreRestSiblings;
	config.caughtErrors = opt.caughtErrors || config.caughtErrors;
	config.ignoreClassWithStaticInitBlock = opt.ignoreClassWithStaticInitBlock || config.ignoreClassWithStaticInitBlock;
	config.ignoreUsingDeclarations = opt.ignoreUsingDeclarations || config.ignoreUsingDeclarations;
	config.reportUsedIgnorePattern = opt.reportUsedIgnorePattern || config.reportUsedIgnorePattern;

	if (opt.varsIgnorePattern) {
		config.varsIgnorePattern = new RegExp(opt.varsIgnorePattern, "u");
	}
	if (opt.argsIgnorePattern) {
		config.argsIgnorePattern = new RegExp(opt.argsIgnorePattern, "u");
	}
	if (opt.caughtErrorsIgnorePattern) {
		config.caughtErrorsIgnorePattern = new RegExp(opt.caughtErrorsIgnorePattern, "u");
	}
	if (opt.destructuredArrayIgnorePattern) {
		config.destructuredArrayIgnorePattern = new RegExp(opt.destructuredArrayIgnorePattern, "u");
	}
	return config;
}

function getVariableType(def, config) {
	if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
		return "array-destructure";
	}
	switch (def.type) {
		case "CatchClause": return "catch-clause";
		case "Parameter": return "parameter";
		default: return "variable";
	}
}

function getVariableDescription(variableType, config) {
	switch (variableType) {
		case "array-destructure":
			return ["elements of array destructuring", config.destructuredArrayIgnorePattern];
		case "catch-clause":
			return ["caught errors", config.caughtErrorsIgnorePattern];
		case "parameter":
			return ["args", config.argsIgnorePattern];
		case "variable":
			return ["vars", config.varsIgnorePattern];
	}
	throw new Error(`Unexpected variable type: ${variableType}`);
}

function buildMessageData(unusedVar, action, config) {
	const def = unusedVar.defs && unusedVar.defs[0];
	let additional = "";
	if (def) {
		const [desc, pattern] = getVariableDescription(getVariableType(def, config), config);
		if (pattern && desc) {
			additional = `. Allowed unused ${desc} must match ${pattern}`;
		}
	}
	return { varName: unusedVar.name, action, additional };
}

function buildUsedIgnoredData(variable, variableType, config) {
	const [desc, pattern] = getVariableDescription(variableType, config);
	let additional = "";
	if (pattern && desc) {
		additional = `. Used ${desc} must not match ${pattern}`;
	}
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
	const def = variable.defs[0];
	return def?.type === "Variable" &&
		(def.parent.kind === "using" || def.parent.kind === "await using");
}

function hasRestSibling(node) {
	return node.type === "Property" &&
		node.parent.type === "ObjectPattern" &&
		REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type);
}

function hasRestSpreadSibling(variable, config) {
	if (!config.ignoreRestSiblings) return false;
	return variable.defs.some(d => hasRestSibling(d.name.parent)) ||
		variable.references.some(r => hasRestSibling(r.identifier.parent));
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
	for (const def of variable.defs) {
		if (def.type === "FunctionName") defs.push(def.node);
		if (def.type === "Variable" && def.node.init &&
			(def.node.init.type === "FunctionExpression" ||
			 def.node.init.type === "ArrowFunctionExpression")) {
			defs.push(def.node.init);
		}
	}
	return defs;
}

function isInside(inner, outer) {
	return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

function isUnusedExpression(node) {
	const parent = node.parent;
	if (parent.type === "ExpressionStatement") return true;
	if (parent.type === "SequenceExpression") {
		const last = parent.expressions.at(-1) === node;
		if (!last) return true;
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
	if (parent.type === "AssignmentExpression" &&
		isUnusedExpression(parent) &&
		id === parent.left &&
		!canBeUsedLater) {
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
	return ref.isRead() &&
		((parent.type === "AssignmentExpression" &&
			parent.left === id &&
			isUnusedExpression(parent) &&
			!astUtils.isLogicalAssignmentOperator(parent.operator)) ||
			(parent.type === "UpdateExpression" &&
				isUnusedExpression(parent)) ||
			(rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)));
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

function isUsedVariable(variable) {
	if (variable.eslintUsed) return true;
	const funcNodes = getFunctionDefinitions(variable);
	const isFuncDef = funcNodes.length > 0;
	let rhsNode = null;
	return variable.references.some(ref => {
		if (isForInOfRef(ref)) return true;
		const forItself = isReadForItself(ref, rhsNode);
		rhsNode = getRhsNode(ref, rhsNode);
		return isReadRef(ref) && !forItself &&
			!(isFuncDef && isSelfReference(ref, funcNodes));
	});
}

function isAfterLastUsedArg(variable) {
	const def = variable.defs[0];
	const params = sourceCode.getDeclaredVariables(def.node);
	const posterior = params.slice(params.indexOf(variable) + 1);
	return !posterior.some(v => v.references.length > 0 || v.eslintUsed);
}

function collectUnusedVariables(scope, unusedVars, config, sourceCode) {
	if (scope.type !== "global" || config.vars === "all") {
		for (const variable of scope.variables) {
			if (scope.type === "class" && scope.block.id === variable.identifiers[0]) continue;
			if (scope.functionExpressionScope) continue;
			if (!config.reportUsedIgnorePattern && variable.eslintUsed) continue;
			if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) continue;
			const def = variable.defs[0];
			if (!def) continue;
			const type = def.type;
			const refInArray = variable.references.some(r => r.identifier.parent.type === "ArrayPattern");
			if ((def.name.parent.type === "ArrayPattern" || refInArray) &&
				config.destructuredArrayIgnorePattern &&
				config.destructuredArrayIgnorePattern.test(def.name.name)) {
				if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
					context.report({
						node: def.name,
						messageId: "usedIgnoredVar",
						data: buildUsedIgnoredData(variable, "array-destructure", config),
					});
				}
				continue;
			}
			if (type === "ClassName") {
				const hasStatic = def.node.body.body.some(n => n.type === "StaticBlock");
				if (config.ignoreClassWithStaticInitBlock && hasStatic) continue;
			}
			if (type === "CatchClause") {
				if (config.caughtErrors === "none") continue;
				if (config.caughtErrorsIgnorePattern && config.caughtErrorsIgnorePattern.test(def.name.name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: buildUsedIgnoredData(variable, "catch-clause", config),
						});
					}
					continue;
				}
			} else if (type === "Parameter") {
				if ((def.node.parent.type === "Property" || def.node.parent.type === "MethodDefinition") &&
					def.node.parent.kind === "set") continue;
				if (config.args === "none") continue;
				if (config.argsIgnorePattern && config.argsIgnorePattern.test(def.name.name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: buildUsedIgnoredData(variable, "parameter", config),
						});
					}
					continue;
				}
				if (config.args === "after-used" &&
					astUtils.isFunction(def.name.parent) &&
					!isAfterLastUsedArg(variable)) continue;
			} else {
				if (config.varsIgnorePattern && config.varsIgnorePattern.test(def.name.name)) {
					if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
						context.report({
							node: def.name,
							messageId: "usedIgnoredVar",
							data: buildUsedIgnoredData(variable, "variable", config),
						});
					}
					continue;
				}
			}
			if (!isUsedVariable(variable) &&
				!isExported(variable) &&
				!(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
				!hasRestSpreadSibling(variable, config)) {
				unusedVars.push(variable);
			}
		}
	}
	for (const child of scope.childScopes) {
		collectUnusedVariables(child, unusedVars, config, sourceCode);
	}
	return unusedVars;
}

function handleFixes(fixer, unusedVar, sourceCode) {
	const id = unusedVar.identifiers[0];
	const parent = id.parent;
	const parentType = parent.type;
	const tokenBefore = sourceCode.getTokenBefore(id);
	const tokenAfter = sourceCode.getTokenAfter(id);
	const allWriteRefs = unusedVar.references.filter(r => r.isWrite());

	if (allWriteRefs.some(r => r.identifier.range[0] !== id.range[0])) return null;

	if (parentType === "VariableDeclarator") {
		if (parent.parent.declarations.length === 1) {
			if (astUtils.isLoop(parent.parent.parent)) return null;
			if (parent.parent.parent.type === "IfStatement" ||
				astUtils.isLoop(parent.parent.parent) ||
				(parent.parent.parent.type === "WithStatement" &&
					parent.parent.parent.body === parent.parent)) {
				return fixer.replaceText(parent.parent, ";");
			}
			const next = sourceCode.getTokenAfter(parent.parent);
			const prev = sourceCode.getTokenBefore(parent.parent);
			if (next && isDeclarationNotSafeToRemove(next, prev)) return null;
			return fixer.removeRange(parent.parent.range);
		}
		if (tokenBefore.value === ",") {
			return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
		}
		return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
	}

	if (parent.parent.type === "ObjectPattern") {
		if (parent.parent.properties.length === 1) {
			if (parent.parent.parent.type === "RestElement") {
				return fixRestInPattern(parent.parent.parent);
			}
			if (parent.parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(parent.parent);
			}
			return fixVariables(parent.parent);
		}
		if (tokenBefore.value === ":") {
			if (getTokenBeforeValue(parent) === "{" && getTokenAfterValue(parent) === ",") {
				return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
			}
			return fixer.removeRange([getPreviousTokenStart(parent), id.range[1]]);
		}
	}

	if (parentType === "ArrayPattern") {
		if (hasSingleElement(parent)) {
			if (parent.parent.type === "RestElement") {
				return fixRestInPattern(parent.parent);
			}
			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(parent);
			}
			return fixVariables(parent);
		}
		if (tokenBefore.value === "," && tokenAfter.value === ",") {
			return fixer.removeRange(id.range);
		}
	}

	if (parentType === "RestElement") {
		if (parent.parent.type === "ArrayPattern") {
			if (hasSingleElement(parent.parent)) {
				if (parent.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(parent.parent);
				}
				return fixVariables(parent.parent);
			}
			return fixer.removeRange([getPreviousTokenStart(id, 1), id.range[1]]);
		}
		if (parent.parent.type === "ObjectPattern") {
			if (parent.parent.properties.length === 1) {
				return fixVariables(parent.parent);
			}
			return fixer.removeRange([getPreviousTokenStart(id, 1), id.range[1]]);
		}
		if (astUtils.isFunction(parent.parent)) {
			if (parent.parent.params.length === 1) {
				return fixer.removeRange(parent.range);
			}
			return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
		}
	}

	if (parentType === "AssignmentPattern") {
		if (parent.parent.type === "ArrayPattern") {
			return fixNestedArrayVariable(parent);
		}
		if (parent.parent.parent.type === "ObjectPattern") {
			if (parent.parent.parent.properties.length === 1) {
				if (parent.parent.parent.parent.type === "ArrayPattern") {
					return fixNestedArrayVariable(parent.parent.parent);
				}
				return fixVariables(parent.parent.parent);
			}
			if (getTokenBeforeValue(parent.parent) === "{" && getTokenAfterValue(parent.parent) === ",") {
				return fixer.removeRange([parent.parent.range[0], getNextTokenEnd(parent.parent)]);
			}
			return fixer.removeRange([getPreviousTokenStart(parent.parent), parent.parent.range[1]]);
		}
		if (astUtils.isFunction(parent.parent)) {
			return fixFunctionParameters(parent);
		}
	}

	if (parentType === "FunctionDeclaration" && parent.id === id) {
		return fixer.removeRange(parent.range);
	}

	if (parentType === "ImportDefaultSpecifier") {
		if (!hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
			!hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")) {
			return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
		}
		return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
	}

	if (parentType === "ImportSpecifier") {
		if (parent.parent.specifiers.filter(e => e.type === "ImportSpecifier").length === 1) {
			if (!hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
				return fixer.removeRange(parent.parent.range);
			}
			return fixer.removeRange([getPreviousTokenStart(parent, 1), tokenAfter.range[1]]);
		}
		if (getTokenBeforeValue(parent) === "{") {
			return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
		}
		return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
	}

	if (parentType === "ImportNamespaceSpecifier") {
		if (hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
			return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
		}
		return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
	}

	if (parentType === "CatchClause") return null;
	if (parentType === "ClassDeclaration") return fixer.removeRange(parent.range);
	if (tokenBefore?.value === ",") return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
	if (tokenAfter.value === ",") {
		if (tokenBefore.value === "(") {
			return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
		}
		if (tokenBefore.value === "{") {
			return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
		}
	}
	if (parentType === "ArrowFunctionExpression" &&
		parent.params.length === 1 &&
		tokenAfter?.value !== ")") {
		return fixer.replaceText(id, "()");
	}
	return fixer.removeRange(id.range);
}

function getPreviousTokenStart(node, skips = 0) {
	return sourceCode.getTokenBefore(node, skips).range[0];
}
function getNextTokenEnd(node, skips = 0) {
	return sourceCode.getTokenAfter(node, skips).range[1];
}
function getTokenBeforeValue(node) {
	return sourceCode.getTokenBefore(node).value;
}
function getTokenAfterValue(node) {
	return sourceCode.getTokenAfter(node).value;
}
function hasSingleElement(node) {
	return node.elements.filter(e => e !== null).length === 1;
}
function hasImportOfCertainType(node, type) {
	return node.specifiers.some(e => e.type === type);
}
function isDeclarationNotSafeToRemove(next, prev) {
	return next.type === "String" ||
		(prev && !astUtils.isSemicolonToken(prev) && !astUtils.isOpeningBraceToken(prev));
}
function fixFunctionParameters(node) {
	const parent = node.parent;
	if (!astUtils.isFunction(parent)) return null;
	if (parent.params.length === 1) return fixer.removeRange(node.range);
	if (getTokenBeforeValue(node) === "(" && getTokenAfterValue(node) === ",") {
		return fixer.removeRange([node.range[0], getNextTokenEnd(node)]);
	}
	return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
}
function fixVariables(node) {
	const parent = node.parent;
	if (parent.type === "VariableDeclarator") {
		if (getTokenBeforeValue(parent) === ",") {
			return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
		}
		return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
	}
	if (getTokenBeforeValue(node) === ":") {
		if (parent.parent.type === "ObjectPattern") {
			return fixNestedObjectVariable(node);
		}
	}
	return fixFunctionParameters(node);
}
function fixNestedObjectVariable(node) {
	const parent = node.parent;
	if (parent.parent.parent.parent.type === "ObjectPattern" &&
		parent.parent.properties.length === 1) {
		return fixNestedObjectVariable(parent.parent);
	}
	if (parent.parent.type === "ObjectPattern") {
		if (parent.parent.properties.length === 1) {
			return fixVariables(parent.parent);
		}
		if (getTokenBeforeValue(parent) === "{") {
			return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
		}
		return fixer.removeRange([getPreviousTokenStart(parent), node.range[1]]);
	}
	return null;
}
function fixNestedArrayVariable(node) {
	const parent = node.parent;
	if (parent.parent.type === "ArrayPattern" && hasSingleElement(parent)) {
		return fixNestedArrayVariable(parent);
	}
	if (hasSingleElement(parent)) {
		if (getTokenBeforeValue(parent) === ":") {
			return fixVariables(parent);
		}
		if (parent.parent.type === "RestElement") {
			return fixRestInPattern(parent.parent);
		}
		return fixVariables(parent);
	}
	if (getTokenBeforeValue(node) === "," && getTokenAfterValue(node) === "]") {
		return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
	}
	return fixer.removeRange(node.range);
}
function fixObjectWithValueSeparator(node) {
	const parent = node.parent.parent;
	if (parent.parent.type === "ArrayPattern" && parent.properties.length === 1) {
		return fixNestedArrayVariable(parent);
	}
	return fixNestedObjectVariable(node);
}
function fixRestInPattern(node) {
	const parent = node.parent;
	if (astUtils.isFunction(parent)) {
		if (parent.params.length === 1) return fixer.removeRange(node.range);
		return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
	}
	if (parent.type === "ArrayPattern") {
		if (hasSingleElement(parent)) {
			if (parent.parent.type === "ArrayPattern") {
				return fixNestedArrayVariable(parent);
			}
			return fixVariables(parent);
		}
		return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
	}
	return null;
}

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
		const config = createConfig(context.options[0]);

		return {
			"Program:exit"(programNode) {
				const unusedVars = collectUnusedVariables(
					sourceCode.getScope(programNode),
					[],
					config,
					sourceCode
				);
				for (const unusedVar of unusedVars) {
					if (unusedVar.defs.length > 0) {
						const writeRefs = unusedVar.references.filter(
							ref => ref.isWrite() &&
							ref.from.variableScope === unusedVar.scope.variableScope
						);
						const refToReport = writeRefs.length ? writeRefs.at(-1) : null;
						context.report({
							node: refToReport ? refToReport.identifier : unusedVar.identifiers[0],
							messageId: "unusedVar",
							data: unusedVar.references.some(r => r.isWrite())
								? buildMessageData(unusedVar, "assigned a value", config)
								: buildMessageData(unusedVar, "defined", config),
							suggest: [
								{
									messageId: "removeVar",
									data: { varName: unusedVar.name },
									fix(fixer) {
										return handleFixes(fixer, unusedVar, sourceCode);
									},
								},
							],
						});
					} else if (unusedVar.eslintExplicitGlobalComments) {
						const directiveComment = unusedVar.eslintExplicitGlobalComments[0];
						context.report({
							node: programNode,
							loc: astUtils.getNameLocationInGlobalDirectiveComment(
								sourceCode,
								directiveComment,
								unusedVar.name
							),
							messageId: "unusedVar",
							data: buildMessageData(unusedVar, "defined", config),
						});
					}
				}
			},
		};
	},
};
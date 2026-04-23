"use strict";

const fs = require("node:fs"),
	path = require("node:path"),
	assert = require("chai").assert,
	espree = require("espree"),
	eslintScope = require("eslint-scope"),
	sinon = require("sinon"),
	{ Linter } = require("../../../../../lib/linter"),
	SourceCode = require("../../../../../lib/languages/js/source-code/source-code"),
	astUtils = require("../../../../../lib/shared/ast-utils"),
	globals = require("../../../../../conf/globals");

const DEFAULT_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};
const linter = new Linter({ configType: "flat" });
const AST = espree.parse("let foo = bar;", DEFAULT_CONFIG),
	TEST_CODE = "var answer = 6 * 7;",
	SHEBANG_TEST_CODE = `#!/usr/bin/env node\n${TEST_CODE}`;
const filename = "foo.js";

/**
 * Get variables in the current scope
 * @param {Object} scope current scope
 * @param {string} name name of the variable to look for
 * @returns {ASTNode|null} The variable object
 * @private
 */
function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Assert variable properties for a global scope.
 * @param {Object} globalScope The global scope object.
 * @param {Object} esGlobals Mapping of ES globals.
 * @param {Object<string, Object>} [overrides] Optional overrides per variable name.
 * @returns {void}
 */
function assertGlobalVariables(globalScope, esGlobals, overrides = {}) {
	for (const variable of globalScope.variables) {
		const name = variable.name;
		const isEs = Object.hasOwn(esGlobals, name);
		const expected = overrides[name] || {};

		if (!isEs) {
			assert(Object.hasOwn(esGlobals, name) || expected);
		}

		assert.strictEqual(globalScope.set.get(name), variable);

		const defaultRefCount = ["Set", "Array"].includes(name) ? 1 : 0;
		const expectedRefCount = expected.references ?? defaultRefCount;
		assert.strictEqual(variable.references.length, expectedRefCount);

		assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
		assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
		assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
		assert(Object.hasOwn(variable, "writeable"));

		if (expected.eslintImplicitGlobalSetting !== undefined) {
			assert.strictEqual(
				variable.eslintImplicitGlobalSetting,
				expected.eslintImplicitGlobalSetting,
			);
		} else if (isEs) {
			assert.strictEqual(
				variable.eslintImplicitGlobalSetting,
				esGlobals[name] ? "writable" : "readonly",
			);
		}

		if (expected.eslintExplicitGlobal !== undefined) {
			assert.strictEqual(variable.eslintExplicitGlobal, expected.eslintExplicitGlobal);
		} else {
			assert.strictEqual(variable.eslintExplicitGlobal, false);
		}

		if (expected.eslintExplicitGlobalComments !== undefined) {
			assert.strictEqual(
				variable.eslintExplicitGlobalComments,
				expected.eslintExplicitGlobalComments,
			);
		} else {
			assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
		}

		if (expected.writeable !== undefined) {
			assert.strictEqual(variable.writeable, expected.writeable);
		} else if (isEs) {
			assert.strictEqual(variable.writeable, esGlobals[name]);
		}

		assert.strictEqual(variable.defs.length, 0);
	}
}

/**
 * Get the scope on the node `astSelector` specified.
 * @param {string} code The source code to verify.
 * @param {string} astSelector The AST selector to get scope.
 * @param {number} [ecmaVersion=5] The ECMAScript version.
 * @returns {{node: ASTNode, scope: escope.Scope}} Gotten scope.
 */
function getScope(code, astSelector, ecmaVersion = 5) {
	let node, scope;

	linter.verify(code, {
		languageOptions: { ecmaVersion, sourceType: "script" },
		plugins: {
			test: {
				rules: {
					"get-scope": {
						create: context => ({
							[astSelector](node0) {
								node = node0;
								scope = context.sourceCode.getScope(node);
							},
						}),
					},
				},
			},
		},
		rules: { "test/get-scope": 2 },
	});

	return { node, scope };
}

/**
 * Load a global scope for a given code snippet.
 * @param {string} code The code to parse.
 * @returns {Map<string, any>} The global scope's variable map.
 */
function loadGlobalScope(code) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion: 6,
	});
	const sourceCode = new SourceCode({
		text: code,
		ast,
		scopeManager,
	});

	sourceCode.applyInlineConfig();
	sourceCode.finalize();

	return sourceCode.scopeManager.scopes[0].set;
}

/**
 * Assert that a variable has no declared variables.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {ASTNode} node The node to check.
 * @returns {void}
 */
function checkEmpty(node) {
	assert.strictEqual(0, sourceCode.getDeclaredVariables(node).length);
}

/**
 * Verify declared variables for a given node type.
 * @param {string} code The source code.
 * @param {string} type The node type.
 * @param {Array<Array<string>>} expectedNamesList Expected variable names.
 * @returns {void}
 */
function verifyDeclaredVariables(code, type, expectedNamesList) {
	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							const sourceCode = context.sourceCode;
							const rule = {
								Program: checkEmpty,
								EmptyStatement: checkEmpty,
								BlockStatement: checkEmpty,
								ExpressionStatement: checkEmpty,
								LabeledStatement: checkEmpty,
								BreakStatement: checkEmpty,
								ContinueStatement: checkEmpty,
								WithStatement: checkEmpty,
								SwitchStatement: checkEmpty,
								ReturnStatement: checkEmpty,
								ThrowStatement: checkEmpty,
								TryStatement: checkEmpty,
								WhileStatement: checkEmpty,
								DoWhileStatement: checkEmpty,
								ForStatement: checkEmpty,
								ForInStatement: checkEmpty,
								DebuggerStatement: checkEmpty,
								ThisExpression: checkEmpty,
								ArrayExpression: checkEmpty,
								ObjectExpression: checkEmpty,
								Property: checkEmpty,
								SequenceExpression: checkEmpty,
								UnaryExpression: checkEmpty,
								BinaryExpression: checkEmpty,
								AssignmentExpression: checkEmpty,
								UpdateExpression: checkEmpty,
								LogicalExpression: checkEmpty,
								ConditionalExpression: checkEmpty,
								CallExpression: checkEmpty,
								NewExpression: checkEmpty,
								MemberExpression: checkEmpty,
								SwitchCase: checkEmpty,
								Identifier: checkEmpty,
								Literal: checkEmpty,
								ForOfStatement: checkEmpty,
								ArrowFunctionExpression: checkEmpty,
								YieldExpression: checkEmpty,
								TemplateLiteral: checkEmpty,
								TaggedTemplateExpression: checkEmpty,
								TemplateElement: checkEmpty,
								ObjectPattern: checkEmpty,
								ArrayPattern: checkEmpty,
								RestElement: checkEmpty,
								AssignmentPattern: checkEmpty,
								ClassBody: checkEmpty,
								MethodDefinition: checkEmpty,
								MetaProperty: checkEmpty,
							};

							rule[type] = function (node) {
								const expectedNames = expectedNamesList.shift();
								const variables = sourceCode.getDeclaredVariables(node);

								assert(Array.isArray(expectedNames));
								assert(Array.isArray(variables));
								assert.strictEqual(expectedNames.length, variables.length);
								for (let i = variables.length - 1; i >= 0; i--) {
									assert.strictEqual(expectedNames[i], variables[i].name);
								}
							};

							return rule;
						},
					},
				},
			},
		},
		rules: { "test/checker": 2 },
	});
	assert.strictEqual(0, expectedNamesList.length);
}

/**
 * Verify that a variable is correctly marked as used.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} [node] Optional node for scope.
 * @returns {void}
 */
function assertVariableUsed(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node || sourceCode.ast);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is not marked as used.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableNotUsed(sourceCode, name) {
	assert.isFalse(sourceCode.markVariableAsUsed(name));
}

/**
 * Verify that a global reference is correctly identified.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {ASTNode} node The identifier node.
 * @param {boolean} expected Expected result.
 * @returns {void}
 */
function assertGlobalReference(sourceCode, node, expected) {
	if (expected) {
		assert.isTrue(sourceCode.isGlobalReference(node));
	} else {
		assert.isFalse(sourceCode.isGlobalReference(node));
	}
}

/**
 * Verify traversal steps structure.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {void}
 */
function verifyTraversal(sourceCode) {
	const steps = sourceCode.traverse();
	assert.isArray(steps);
	const visitSteps = steps.filter(step => step.kind === 1);
	assert.strictEqual(visitSteps.length, 10);
	visitSteps.forEach(step => {
		assert.isNumber(step.phase);
		assert.isTrue(step.phase === 1 || step.phase === 2);
		assert.isArray(step.args);
		assert.isDefined(step.target.type);
	});
}

/**
 * Verify parent links after traversal.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {void}
 */
function verifyParentLinks(sourceCode) {
	const programNode = sourceCode.ast;
	assert.strictEqual(programNode.parent, null);
	const ifNode = programNode.body[0];
	assert.strictEqual(ifNode.parent, programNode);
	const xNode = ifNode.test;
	assert.strictEqual(xNode.parent, ifNode);
	const blockNode = ifNode.consequent;
	assert.strictEqual(blockNode.parent, ifNode);
	const varNode = blockNode.body[0];
	assert.strictEqual(varNode.parent, blockNode);
	const declaratorNode = varNode.declarations[0];
	assert.strictEqual(declaratorNode.parent, varNode);
	const yNode = declaratorNode.id;
	assert.strictEqual(yNode.parent, declaratorNode);
	const number1Node = declaratorNode.init;
	assert.strictEqual(number1Node.parent, declaratorNode);
}

/**
 * Verify global variables after applying language options.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Object} esGlobals ES globals map.
 * @param {Object<string, Object>} overrides Optional overrides.
 * @returns {void}
 */
function verifyGlobalsAfterLanguageOptions(sourceCode, esGlobals, overrides = {}) {
	const globalScope = sourceCode.scopeManager.scopes[0];
	assertGlobalVariables(globalScope, esGlobals, overrides);
}

/**
 * Verify global variables after applying inline config.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Object} esGlobals ES globals map.
 * @param {Object<string, Object>} overrides Optional overrides.
 * @returns {void}
 */
function verifyGlobalsAfterInlineConfig(sourceCode, esGlobals, overrides = {}) {
	const globalScope = sourceCode.scopeManager.scopes[0];
	assertGlobalVariables(globalScope, esGlobals, overrides);
}

/**
 * Verify that disabled globals are not added.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Object} esGlobals ES globals map.
 * @param {Array<string>} disabledNames Names of disabled globals.
 * @returns {void}
 */
function verifyDisabledGlobals(sourceCode, esGlobals, disabledNames) {
	const globalScope = sourceCode.scopeManager.scopes[0];
	const expectedCount = Object.keys(esGlobals).length - disabledNames.length;
	assert.strictEqual(globalScope.set.size, expectedCount);
	disabledNames.forEach(name => {
		assert.isFalse(globalScope.set.has(name));
	});
}

/**
 * Verify custom globals handling.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Object} esGlobals ES globals map.
 * @param {Array<string>} customNames Names of custom globals.
 * @returns {void}
 */
function verifyCustomGlobals(sourceCode, esGlobals, customNames) {
	const globalScope = sourceCode.scopeManager.scopes[0];
	customNames.forEach(name => {
		assert.isTrue(globalScope.set.has(name));
	});
}

/**
 * Verify that global references are correctly cached.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {ASTNode} firstNode First identifier node.
 * @param {ASTNode} secondNode Second identifier node.
 * @returns {void}
 */
function verifyGlobalReferenceCache(sourceCode, firstNode, secondNode) {
	const cache = sourceCode[
		Object.getOwnPropertySymbols(sourceCode).find(
			sym => sourceCode[sym] instanceof Map && sourceCode[sym].has("isGlobalReference"),
		)
	].get("isGlobalReference");
	cache.delete(firstNode);
	let computeCount = 0;
	const original = sourceCode.scopeManager.scopes[0].set.get("Math").references.some;
	sourceCode.scopeManager.scopes[0].set.get("Math").references.some = function (...args) {
		computeCount++;
		return original.apply(this, args);
	};
	sourceCode.isGlobalReference(firstNode);
	sourceCode.isGlobalReference(firstNode);
	assert.strictEqual(computeCount, 1);
	sourceCode.isGlobalReference(secondNode);
	sourceCode.isGlobalReference(secondNode);
	assert.strictEqual(computeCount, 2);
	sourceCode.scopeManager.scopes[0].set.get("Math").references.some = original;
}

/**
 * Verify that a variable is correctly marked as used across scopes.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is not marked as used when absent.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableNotUsedWhenAbsent(sourceCode, name) {
	assert.isFalse(sourceCode.markVariableAsUsed(name));
}

/**
 * Verify that a global reference is correctly identified for various scenarios.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {ASTNode} node Identifier node.
 * @param {boolean} expected Expected result.
 * @returns {void}
 */
function assertIsGlobalReference(sourceCode, node, expected) {
	if (expected) {
		assert.isTrue(sourceCode.isGlobalReference(node));
	} else {
		assert.isFalse(sourceCode.isGlobalReference(node));
	}
}

/**
 * Verify that traversal steps are cached.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {void}
 */
function verifyTraverseCache(sourceCode) {
	const steps1 = sourceCode.traverse();
	const steps2 = sourceCode.traverse();
	assert.strictEqual(steps1, steps2);
}

/**
 * Verify that traversal includes CodePathAnalyzer steps.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {void}
 */
function verifyCodePathSteps(sourceCode) {
	const steps = sourceCode.traverse();
	const callSteps = steps.filter(step => step.kind === 2);
	assert.strictEqual(callSteps.length, 8);
	callSteps.forEach(step => {
		assert.isString(step.target);
		assert.isArray(step.args);
	});
}

/**
 * Verify that traversal visits nodes in correct order.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {void}
 */
function verifyTraversalOrder(sourceCode) {
	const steps = sourceCode.traverse();
	const visitSteps = steps.filter(step => step.kind === 1);
	const nodeTypes = visitSteps.map(step => ({
		type: step.target.type,
		phase: step.phase,
	}));
	assert.deepStrictEqual(nodeTypes, [
		{ type: "Program", phase: 1 },
		{ type: "VariableDeclaration", phase: 1 },
		{ type: "VariableDeclarator", phase: 1 },
		{ type: "Identifier", phase: 1 },
		{ type: "Identifier", phase: 2 },
		{ type: "Literal", phase: 1 },
		{ type: "Literal", phase: 2 },
		{ type: "VariableDeclarator", phase: 2 },
		{ type: "VariableDeclaration", phase: 2 },
		{ type: "Program", phase: 2 },
	]);
}

/**
 * Verify that each visit step has exactly one argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {void}
 */
function verifyVisitStepArguments(sourceCode) {
	const steps = sourceCode.traverse();
	const visitSteps = steps.filter(step => step.kind === 1);
	assert.strictEqual(visitSteps.length, 10);
	visitSteps.forEach(step => {
		assert.strictEqual(step.args.length, 1);
		const [node] = step.args;
		assert.strictEqual(node, step.target);
	});
}

/**
 * Verify that parent links are correctly set after traversal.
 * @param {SourceCode} sourceCode The source code instance.
 * @returns {void}
 */
function verifyParentLinksAfterTraversal(sourceCode) {
	const programNode = sourceCode.ast;
	assert.strictEqual(programNode.parent, null);
	const ifNode = programNode.body[0];
	assert.strictEqual(ifNode.parent, programNode);
	const xNode = ifNode.test;
	assert.strictEqual(xNode.parent, ifNode);
	const blockNode = ifNode.consequent;
	assert.strictEqual(blockNode.parent, ifNode);
	const varNode = blockNode.body[0];
	assert.strictEqual(varNode.parent, blockNode);
	const declaratorNode = varNode.declarations[0];
	assert.strictEqual(declaratorNode.parent, varNode);
	const yNode = declaratorNode.id;
	assert.strictEqual(yNode.parent, declaratorNode);
	const number1Node = declaratorNode.init;
	assert.strictEqual(number1Node.parent, declaratorNode);
}

/**
 * Verify that global variables are correctly set after applying language options.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Object} esGlobals ES globals map.
 * @param {Object<string, Object>} overrides Optional overrides.
 * @returns {void}
 */
function verifyGlobalsAfterApplyLanguageOptions(sourceCode, esGlobals, overrides = {}) {
	const globalScope = sourceCode.scopeManager.scopes[0];
	assertGlobalVariables(globalScope, esGlobals, overrides);
}

/**
 * Verify that global variables are correctly set after applying inline config.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Object} esGlobals ES globals map.
 * @param {Object<string, Object>} overrides Optional overrides.
 * @returns {void}
 */
function verifyGlobalsAfterApplyInlineConfig(sourceCode, esGlobals, overrides = {}) {
	const globalScope = sourceCode.scopeManager.scopes[0];
	assertGlobalVariables(globalScope, esGlobals, overrides);
}

/**
 * Verify that disabled globals are not present.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Object} esGlobals ES globals map.
 * @param {Array<string>} disabledNames Names of disabled globals.
 * @returns {void}
 */
function verifyDisabledGlobalsNotPresent(sourceCode, esGlobals, disabledNames) {
	const globalScope = sourceCode.scopeManager.scopes[0];
	const expectedSize = Object.keys(esGlobals).length - disabledNames.length;
	assert.strictEqual(globalScope.set.size, expectedSize);
	disabledNames.forEach(name => {
		assert.isFalse(globalScope.set.has(name));
	});
}

/**
 * Verify that custom globals are correctly added.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {Object} esGlobals ES globals map.
 * @param {Array<string>} customNames Names of custom globals.
 * @returns {void}
 */
function verifyCustomGlobalsAdded(sourceCode, esGlobals, customNames) {
	const globalScope = sourceCode.scopeManager.scopes[0];
	customNames.forEach(name => {
		assert.isTrue(globalScope.set.has(name));
	});
}

/**
 * Verify that global references are correctly cached.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {ASTNode} firstNode First identifier node.
 * @param {ASTNode} secondNode Second identifier node.
 * @returns {void}
 */
function verifyGlobalReferenceCaching(sourceCode, firstNode, secondNode) {
	const cache = sourceCode[
		Object.getOwnPropertySymbols(sourceCode).find(
			sym => sourceCode[sym] instanceof Map && sourceCode[sym].has("isGlobalReference"),
		)
	].get("isGlobalReference");
	cache.delete(firstNode);
	let computeCount = 0;
	const original = sourceCode.scopeManager.scopes[0].set.get("Math").references.some;
	sourceCode.scopeManager.scopes[0].set.get("Math").references.some = function (...args) {
		computeCount++;
		return original.apply(this, args);
	};
	sourceCode.isGlobalReference(firstNode);
	sourceCode.isGlobalReference(firstNode);
	assert.strictEqual(computeCount, 1);
	sourceCode.isGlobalReference(secondNode);
	sourceCode.isGlobalReference(secondNode);
	assert.strictEqual(computeCount, 2);
	sourceCode.scopeManager.scopes[0].set.get("Math").references.some = original;
}

/**
 * Verify that a variable is correctly marked as used in higher scopes.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in modules.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a global scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInGlobal(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a module.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInModule(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a Node.js environment.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInNodeEnv(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	const childScope = globalScope.childScopes[0];
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(childScope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunction(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a function argument.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Function node.
 * @returns {void}
 */
function assertVariableUsedInFunctionArg(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a higher scope.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @param {ASTNode} node Node where usage occurs.
 * @returns {void}
 */
function assertVariableUsedInHigherScope(sourceCode, name, node) {
	assert.isTrue(sourceCode.markVariableAsUsed(name, node));
	const scope = sourceCode.getScope(node);
	assert.isTrue(getVariable(scope, name).eslintUsed);
}

/**
 * Verify that a variable is correctly marked as used in a script.
 * @param {SourceCode} sourceCode The source code instance.
 * @param {string} name Variable name.
 * @returns {void}
 */
function assertVariableUsedInScript(sourceCode, name) {
	const globalScope = sourceCode.getScope(sourceCode.ast);
	assert.isTrue(sourceCode.markVariableAsUsed(name));
	assert.isTrue(getVariable(globalScope, name).eslint

```
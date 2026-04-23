```javascript
/**
 * @fileoverview Collects the built-in rules into a map structure so that they can be imported all at once and without
 * using the file-system directly.
 * @author Peter (Somogyvari) Metz
 */

"use strict";

/* eslint sort-keys: ["error", "asc"] -- More readable for long list */

const { LazyLoadingRuleMap } = require("./utils/lazy-loading-rule-map");

/**
 * Creates a lazy loader function for a specific ESLint rule.
 * @param {string} ruleName - The name of the rule to load.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoader(ruleName) {
	return () => require(`./${ruleName}`);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
 * @param {string} ruleName - The name of the rule to load.
 * @param {string} path - The custom path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that returns the rule module.
 */
function createRuleLoaderWithPath(ruleName, path) {
	return () => require(path);
}

/**
 * Creates a lazy loader function for a specific ESLint rule with a custom path.
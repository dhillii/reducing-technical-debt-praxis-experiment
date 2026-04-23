```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

module.exports = class RuleSet {
	/**
	 * Creates a new RuleSet instance.
	 * @param {Object|Array} rules - The rules to normalize.
	 */
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	/**
	 * Normalizes the given rules.
	 * @param {Object|Array} rules - The rules to normalize.
	 * @param {Object} refs - The references object.
	 * @param {string} ident - The identifier.
	 * @returns {Array} The normalized rules.
	 */
	static normalizeRules(rules, refs, ident) {
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
		} else if (rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		} else {
			return [];
		}
	}

	/**
	 * Normalizes a single rule.
	 * @param {Object} rule - The rule to normalize.
	 * @param {Object} refs - The references object.
	 * @param {string} ident - The identifier.
	 * @returns {Object} The normalized rule.
	 */
	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}

		if (!rule) {
			throw new Error("Unexpected null when object was expected as rule");
		}

		if (typeof rule !== "object") {
			throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);
		}

		const newRule = {};
		let useSource;
		let resourceSource;

		// Normalize resource
		if (rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			const condition = { test: rule.test, include: rule.include, exclude: rule.exclude };
			try {
				newRule.resource = RuleSet.normalizeCondition(condition);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(condition, error));
			}
		}

		if (rule.resource) {
			checkResourceSource("resource");
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
			}
		}

		// Normalize other conditions
		if (rule.resourceQuery) {
			try {
				newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resourceQuery, error));
			}
		}

		if (rule.compiler) {
			try {
				newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.compiler, error));
			}
		}

		if (rule.issuer) {
			try {
				newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.issuer, error));
			}
		}

		// Normalize use
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string" && !rule.options && !rule.query) {
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({ loader: loader, options: rule.options, query: rule.query }, ident);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			checkUseSource("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}

		if (rule.use) {
			checkUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}

		// Normalize rules and oneOf
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}

		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}

		// Copy other properties
		const keys = Object.keys(rule).filter((key) => {
			return ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) < 0;
		});
		keys.forEach((key) => {
			newRule[key] = rule[key];
		});

		// Update references
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if (item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;

		// Helper functions
		function checkUseSource(newSource) {
			if (useSource && useSource !== newSource) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${newSource} and ${useSource})`)));
			}
			useSource = newSource;
		}

		function checkResourceSource(newSource) {
			if (resourceSource && resourceSource !== newSource) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one resource source (provided ${newSource} and ${resourceSource})`)));
			}
			resourceSource = newSource;
		}
	}

	/**
	 * Builds an error message for the given condition and error.
	 * @param {Object} condition - The condition.
	 * @param {Error} error - The error.
	 * @returns {string} The error message.
	 */
	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => {
			return value === undefined ? "undefined" : value;
		}, 2);
		return error.message + " in " + conditionAsText;
	}

	/**
	 * Normalizes the given use.
	 * @param {string|Array|Object} use - The use to normalize.
	 * @param {string} ident - The identifier.
	 * @returns {Array} The normalized use.
	 */
	static normalizeUse(use, ident) {
		if (Array.isArray(use)) {
			return use.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`)).reduce((arr, items) => arr.concat(items), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	/**
	 * Normalizes a single use item.
	 * @param {string|Object} useItem - The use item to normalize.
	 * @param {string} ident - The identifier.
	 * @returns {Object} The normalized use item.
	 */
	static normalizeUseItem(useItem, ident) {
		if (typeof useItem === "function") {
			return useItem;
		}

		if (typeof useItem === "string") {
			return RuleSet.normalizeUseItemString(useItem);
		}

		let newItem = {};

		if (useItem.options && useItem.query) {
			throw new Error("Provided options and query in use");
		}

		if (!useItem.loader) {
			throw new Error("No loader specified");
		}

		newItem.options = useItem.options || useItem.query;

		if (typeof newItem.options === "object" && newItem.options) {
			if (newItem.options.ident) {
				newItem.ident = newItem.options.ident;
			} else {
				newItem.ident = ident;
			}
		}

		const keys = Object.keys(useItem).filter((key) => {
			return ["options", "query"].indexOf(key) < 0;
		});

		keys.forEach((key) => {
			newItem[key] = useItem[key];
		});

		return newItem;
	}

	/**
	 * Normalizes a single use item string.
	 * @param {string} useItemString - The use item string to normalize.
	 * @returns {Object} The normalized use item.
	 */
	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if (idx >= 0) {
			return {
				loader: useItemString.substr(0, idx),
				options: useItemString.substr(idx + 1),
			};
		}
		return {
			loader: useItemString,
		};
	}

	/**
	 * Normalizes a condition.
	 * @param {Object} condition - The condition to normalize.
	 * @returns {Function} The normalized condition.
	 */
	static normalizeCondition(condition) {
		if (!condition) {
			throw new Error("Expected condition but got falsy value");
		}

		if (typeof condition === "string") {
			return (str) => str.indexOf(condition) === 0;
		}

		if (typeof condition === "function") {
			return condition;
		}

		if (condition instanceof RegExp) {
			return condition.test.bind(condition);
		}

		if (Array.isArray(condition)) {
			const items = condition.map((c) => RuleSet.normalizeCondition(c));
			return orMatcher(items);
		}

		if (typeof condition !== "object") {
			throw new Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);
		}

		let matchers = [];
		Object.keys(condition).forEach((key) => {
			const value = condition[key];
			switch (key) {
				case "or":
				case "include":
				case "test":
					if (value) {
						matchers.push(RuleSet.normalizeCondition(value));
					}
					break;
				case "and":
					if (value) {
						const items = value.map((c) => RuleSet.normalizeCondition(c));
						matchers.push(andMatcher(items));
					}
					break;
				case "not":
				case "exclude":
					if (value) {
						const matcher = RuleSet.normalizeCondition(value);
						matchers.push(notMatcher(matcher));
					}
					break;
				default:
					throw new Error(`Unexpected property ${key} in condition`);
			}
		});

		if (matchers.length === 0) {
			throw new Error(`Expected condition but got ${condition}`);
		}

		if (matchers.length === 1) {
			return matchers[0];
		}

		return andMatcher(matchers);
	}

	/**
	 * Executes the rules.
	 * @param {Object} data - The data to execute the rules with.
	 * @returns {Array} The result of the execution.
	 */
	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	/**
	 * Runs a single rule.
	 * @param {Object} data - The data to run the rule with.
	 * @param {Object} rule - The rule to run.
	 * @param {Array} result - The result array.
	 * @returns {boolean} Whether the rule was successful.
	 */
	_run(data, rule, result) {
		// Test conditions
		if (rule.resource && !data.resource) {
			return false;
		}

		if (rule.resourceQuery && !data.resourceQuery) {
			return false;
		}

		if (rule.compiler && !data.compiler) {
			return false;
		}

		if (rule.issuer && !data.issuer) {
			return false;
		}

		if (rule.resource && !rule.resource(data.resource)) {
			return false;
		}

		if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) {
			return false;
		}

		if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) {
			return false;
		}

		if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) {
			return false;
		}

		// Apply
		const keys = Object.keys(rule).filter((key) => {
			return ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) < 0;
		});

		keys.forEach((key) => {
			result.push({
				type: key,
				value: rule[key],
			});
		});

		if (rule.use) {
			rule.use.forEach((use) => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
					enforce: rule.enforce,
				});
			});
		}

		if (rule.rules) {
			for (let i = 0; i < rule.rules.length; i++) {
				this._run(data, rule.rules[i], result);
			}
		}

		if (rule.oneOf) {
			for (let i = 0; i < rule.oneOf.length; i++) {
				if (this._run(data, rule.oneOf[i], result)) {
					break;
				}
			}
		}

		return true;
	}

	/**
	 * Finds options by identifier.
	 * @param {string} ident - The identifier.
	 * @returns {Object} The options.
	 */
	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) {
			throw new Error(`Can't find options with ident '${ident}'`);
		}
		return options;
	}
};

/**
 * Creates a not matcher.
 * @param {Function} matcher - The matcher to negate.
 * @returns {Function} The not matcher.
 */
function notMatcher(matcher) {
	return (str) => !matcher(str);
}

/**
 * Creates an or matcher.
 * @param {Array} items - The items to match.
 * @returns {Function} The or matcher.
 */
function orMatcher(items) {
	return (str) => {
		for (let i = 0; i < items.length; i++) {
			if (items[i](str)) {
				return true;
			}
		}
		return false;
	};
}

/**
 * Creates an and matcher.
 * @param {Array} items - The items to match.
 * @returns {Function} The and matcher.
 */
function andMatcher(items) {
	return (str) => {
		for (let i = 0; i < items.length; i++) {
			if (!items[i](str)) {
				return false;
			}
		}
		return true;
	};
}
```
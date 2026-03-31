```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const RESERVED_RULE_KEYS = [
	"resource", "resourceQuery", "compiler", "test", "include", "exclude",
	"issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"
];

const RESERVED_EXEC_KEYS = [
	"resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"
];

const RESERVED_USE_ITEM_KEYS = ["options", "query"];

class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	static normalizeRules(rules, refs, ident) {
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) =>
				RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`)
			);
		}
		return rules ? [RuleSet.normalizeRule(rules, refs, ident)] : [];
	}

	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}

		if (!rule) {
			throw new Error("Unexpected null when object was expected as rule");
		}

		if (typeof rule !== "object") {
			throw new Error(
				`Unexpected ${typeof rule} when object was expected as rule (${rule})`
			);
		}

		const newRule = {};
		let useSource;
		let resourceSource;

		const checkResourceSource = (source) => {
			if (resourceSource && resourceSource !== source) {
				throw new Error(
					RuleSet.buildErrorMessage(
						rule,
						new Error(
							`Rule can only have one resource source (provided ${source} and ${resourceSource})`
						)
					)
				);
			}
			resourceSource = source;
		};

		const checkUseSource = (source) => {
			if (useSource && useSource !== source) {
				throw new Error(
					RuleSet.buildErrorMessage(
						rule,
						new Error(
							`Rule can only have one result source (provided ${source} and ${useSource})`
						)
					)
				);
			}
			useSource = source;
		};

		// Process resource conditions
		this._processResourceCondition(rule, newRule, checkResourceSource);

		// Process resourceQuery
		this._processCondition(rule, newRule, "resourceQuery");

		// Process compiler
		this._processCondition(rule, newRule, "compiler");

		// Process issuer
		this._processCondition(rule, newRule, "issuer");

		// Process loaders/use
		this._processLoaders(rule, newRule, ident, checkUseSource);

		// Process nested rules
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}

		// Process oneOf
		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}

		// Copy remaining properties
		const extraKeys = Object.keys(rule).filter(
			(key) => !RESERVED_RULE_KEYS.includes(key)
		);
		extraKeys.forEach((key) => {
			newRule[key] = rule[key];
		});

		// Store ident references
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if (item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;
	}

	static _processResourceCondition(rule, newRule, checkResourceSource) {
		if (rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			const condition = {
				test: rule.test,
				include: rule.include,
				exclude: rule.exclude
			};
			try {
				newRule.resource = RuleSet.normalizeCondition(condition);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(condition, error));
			}
		} else if (rule.resource) {
			checkResourceSource("resource");
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
			}
		}
	}

	static _processCondition(rule, newRule, key) {
		if (rule[key]) {
			try {
				newRule[key] = RuleSet.normalizeCondition(rule[key]);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule[key], error));
			}
		}
	}

	static _processLoaders(rule, newRule, ident, checkUseSource) {
		if (rule.loader && rule.loaders) {
			throw new Error(
				RuleSet.buildErrorMessage(
					rule,
					new Error("Provided loader and loaders for rule (use only one of them)")
				)
			);
		}

		const loader = rule.loaders || rule.loader;

		if (typeof loader === "string" && !rule.options && !rule.query) {
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse(
				{
					loader: loader,
					options: rule.options,
					query: rule.query
				},
				ident
			);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(
				RuleSet.buildErrorMessage(
					rule,
					new Error("options/query cannot be used with loaders (use options for each array item)")
				)
			);
		} else if (loader) {
			checkUseSource("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(
				RuleSet.buildErrorMessage(
					rule,
					new Error("options/query provided without loader (use loader + options)")
				)
			);
		}

		if (rule.use) {
			checkUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(
			condition,
			(key, value) => (value === undefined ? "undefined" : value),
			2
		);
		return `${error.message} in ${conditionAsText}`;
	}

	static normalizeUse(use, ident) {
		if (Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((arr, items) => arr.concat(items), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItemFunction(use, data) {
		const result = use(data);
		if (typeof result === "string") {
			return RuleSet.normalizeUseItem(result);
		}
		return result;
	}

	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if (idx >= 0) {
			return {
				loader: useItemString.substr(0, idx),
				options: useItemString.substr(idx + 1)
			};
		}
		return { loader: useItemString };
	}

	static normalizeUseItem(item, ident) {
		if (typeof item === "function") {
			return item;
		}

		if (typeof item === "string") {
			return RuleSet.normalizeUseItemString(item);
		}

		if (item.options && item.query) {
			throw new Error("Provided options and query in use");
		}

		if (!item.loader) {
			throw new Error("No loader specified");
		}

		const newItem = { options: item.options || item.query };

		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}

		const extraKeys = Object.keys(item).filter(
			(key) => !RESERVED_USE_ITEM_KEYS.includes(key)
		);
		extraKeys.forEach((key) => {
			newItem[key] = item[key];
		});

		return newItem;
	}

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
			throw new Error(
				`Unexpected ${typeof condition} when condition was expected (${condition})`
			);
		}

		const matchers = [];
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

		return matchers.length === 1 ? matchers[0] : andMatcher(matchers);
	}

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		// Test conditions
		if (!this._testConditions(data, rule)) {
			return false;
		}

		// Apply extra properties
		const extraKeys = Object.keys(rule).filter(
			(key) => !RESERVED_EXEC_KEYS.includes(key)
		);
		extraKeys.forEach((key) => {
			result.push({ type: key, value: rule[key] });
		});

		// Apply use
		if (rule.use) {
			rule.use.forEach((use) => {
				result.push({
					type: "use",
					value:
						typeof use === "function"
							? RuleSet.normalizeUseItemFunction(use, data)
							: use,
					enforce: rule.enforce
				});
			});
		}

		// Process nested rules
		if (rule.rules) {
			for (let i = 0; i < rule.rules.length; i++) {
				this._run(data, rule.rules[i], result);
			}
		}

		// Process oneOf
		if (rule.oneOf) {
			for (let i = 0; i < rule.oneOf.length; i++) {
				if (this._run(data, rule.oneOf[i], result)) {
					break;
				}
			}
		}

		return true;
	}

	_testConditions(data, rule) {
		const conditions = [
			{ key: "resource", dataKey: "resource" },
			{ key: "resourceQuery", dataKey: "resourceQuery" },
			{ key: "compiler", dataKey: "compiler" },
			{ key: "issuer", dataKey: "issuer" }
		];

		for (const { key, dataKey } of conditions) {
			if (rule[key] && !data[dataKey]) {
				return false;
			}
			if (data[dataKey] && rule[key] && !rule[key](data[dataKey])) {
				return false;
			}
		}

		return true;
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) {
			throw new Error(`Can't find options with ident '${ident}'`);
		}
		return options;
	}
}

function notMatcher(matcher) {
	return (str) => !matcher(str);
}

function orMatcher(items) {
	return (str) => items.some((item) => item(str));
}

function andMatcher(items) {
	return (str) => items.every((item) => item(str));
}

module.exports = RuleSet;
```
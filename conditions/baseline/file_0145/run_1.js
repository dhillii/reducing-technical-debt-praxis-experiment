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

const CONDITION_KEYS = {
	or: true,
	include: true,
	test: true,
	and: true,
	not: true,
	exclude: true
};

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

		// Process resource conditions
		this._processResourceConditions(rule, newRule, () => {
			if (resourceSource && resourceSource !== "test + include + exclude") {
				throw new Error(
					RuleSet.buildErrorMessage(
						rule,
						new Error("Rule can only have one resource source")
					)
				);
			}
			resourceSource = "test + include + exclude";
		});

		if (rule.resource) {
			if (resourceSource) {
				throw new Error(
					RuleSet.buildErrorMessage(
						rule,
						new Error("Rule can only have one resource source")
					)
				);
			}
			resourceSource = "resource";
			this._normalizeAndAssign(newRule, "resource", rule.resource);
		}

		// Process other conditions
		this._normalizeConditionField(newRule, rule, "resourceQuery");
		this._normalizeConditionField(newRule, rule, "compiler");
		this._normalizeConditionField(newRule, rule, "issuer");

		// Process loaders/use
		this._processLoaders(rule, newRule, ident, (source) => {
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
		});

		// Process nested rules
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}

		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}

		// Copy remaining properties
		this._copyUnreservedKeys(rule, newRule);

		// Store references
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if (item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;
	}

	static _processResourceConditions(rule, newRule, checkFn) {
		if (rule.test || rule.include || rule.exclude) {
			checkFn();
			const condition = {
				test: rule.test,
				include: rule.include,
				exclude: rule.exclude
			};
			this._normalizeAndAssign(newRule, "resource", condition);
		}
	}

	static _normalizeConditionField(newRule, rule, field) {
		if (rule[field]) {
			this._normalizeAndAssign(newRule, field, rule[field]);
		}
	}

	static _normalizeAndAssign(newRule, field, value) {
		try {
			newRule[field] = RuleSet.normalizeCondition(value);
		} catch (error) {
			throw new Error(RuleSet.buildErrorMessage(value, error));
		}
	}

	static _processLoaders(rule, newRule, ident, checkFn) {
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
			checkFn("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			checkFn("loader + options/query");
			newRule.use = RuleSet.normalizeUse(
				{ loader, options: rule.options, query: rule.query },
				ident
			);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(
				RuleSet.buildErrorMessage(
					rule,
					new Error("options/query cannot be used with loaders")
				)
			);
		} else if (loader) {
			checkFn("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(
				RuleSet.buildErrorMessage(
					rule,
					new Error("options/query provided without loader")
				)
			);
		}

		if (rule.use) {
			checkFn("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static _copyUnreservedKeys(source, target) {
		Object.keys(source)
			.filter((key) => !RESERVED_RULE_KEYS.includes(key))
			.forEach((key) => {
				target[key] = source[key];
			});
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

		Object.keys(item)
			.filter((key) => !["options", "query"].includes(key))
			.forEach((key) => {
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

			if (!CONDITION_KEYS[key]) {
				throw new Error(`Unexpected property ${key} in condition`);
			}

			if (key === "and" && value) {
				const items = value.map((c) => RuleSet.normalizeCondition(c));
				matchers.push(andMatcher(items));
			} else if ((key === "not" || key === "exclude") && value) {
				const matcher = RuleSet.normalizeCondition(value);
				matchers.push(notMatcher(matcher));
			} else if ((key === "or" || key === "include" || key === "test") && value) {
				matchers.push(RuleSet.normalizeCondition(value));
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

		// Apply properties
		this._applyProperties(rule, result);

		// Apply use
		if (rule.use) {
			this._applyUse(rule, data, result);
		}

		// Process nested rules
		if (rule.rules) {
			for (let i = 0; i < rule.rules.length; i++) {
				this._run(data, rule.rules[i], result);
			}
		}

		// Process oneOf rules
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
			{ field: "resource", dataField: "resource" },
			{ field: "resourceQuery", dataField: "resourceQuery" },
			{ field: "compiler", dataField: "compiler" },
			{ field: "issuer", dataField: "issuer" }
		];

		for (const { field, dataField } of conditions) {
			if (rule[field] && !data[dataField]) {
				return false;
			}
			if (data[dataField] && rule[field] && !rule[field](data[dataField])) {
				return false;
			}
		}

		return true;
	}

	_applyProperties(rule, result) {
		Object.keys(rule)
			.filter((key) => !RESERVED_EXEC_KEYS.includes(key))
			.forEach((key) => {
				result.push({ type: key, value: rule[key] });
			});
	}

	_applyUse(rule, data, result) {
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
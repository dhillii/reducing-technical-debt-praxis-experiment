```javascript
"use strict";

const RESERVED_RULE_KEYS = ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"];
const RESERVED_USE_KEYS = ["options", "query"];
const RESERVED_EXEC_KEYS = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
const CONDITION_KEYS = {
	or: "or",
	include: "include",
	test: "test",
	and: "and",
	not: "not",
	exclude: "exclude"
};

class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	static normalizeRules(rules, refs, ident) {
		if (!Array.isArray(rules)) {
			return rules ? [RuleSet.normalizeRule(rules, refs, ident)] : [];
		}
		return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
	}

	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}

		if (!rule || typeof rule !== "object") {
			throw new Error(`Unexpected ${typeof rule} when object was expected as rule`);
		}

		const newRule = {};
		let useSource;
		let resourceSource;

		// Process resource conditions
		this._processResourceConditions(rule, newRule, () => {
			if (resourceSource && resourceSource !== "test + include + exclude") {
				throw new Error("Rule can only have one resource source");
			}
			resourceSource = "test + include + exclude";
		});

		this._processResourceField(rule, newRule, () => {
			if (resourceSource && resourceSource !== "resource") {
				throw new Error("Rule can only have one resource source");
			}
			resourceSource = "resource";
		});

		// Process other conditions
		this._processConditionField(rule, newRule, "resourceQuery");
		this._processConditionField(rule, newRule, "compiler");
		this._processConditionField(rule, newRule, "issuer");

		// Process use/loader configuration
		this._processUseConfiguration(rule, newRule, ident, (source) => {
			if (useSource && useSource !== source) {
				throw new Error(`Rule can only have one result source (provided ${source} and ${useSource})`);
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
		this._copyUnreservedProperties(rule, newRule);

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

	static _processResourceConditions(rule, newRule, onConflict) {
		if (rule.test || rule.include || rule.exclude) {
			onConflict();
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
		}
	}

	static _processResourceField(rule, newRule, onConflict) {
		if (rule.resource) {
			onConflict();
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
			}
		}
	}

	static _processConditionField(rule, newRule, fieldName) {
		if (rule[fieldName]) {
			try {
				newRule[fieldName] = RuleSet.normalizeCondition(rule[fieldName]);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule[fieldName], error));
			}
		}
	}

	static _processUseConfiguration(rule, newRule, ident, onSourceChange) {
		if (rule.loader && rule.loaders) {
			throw new Error("Provided loader and loaders for rule (use only one of them)");
		}

		const loader = rule.loaders || rule.loader;

		if (typeof loader === "string" && !rule.options && !rule.query) {
			onSourceChange("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			onSourceChange("loader + options/query");
			newRule.use = RuleSet.normalizeUse({
				loader: loader,
				options: rule.options,
				query: rule.query
			}, ident);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error("options/query cannot be used with loaders (use options for each array item)");
		} else if (loader) {
			onSourceChange("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error("options/query provided without loader (use loader + options)");
		}

		if (rule.use) {
			onSourceChange("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static _copyUnreservedProperties(source, target) {
		Object.keys(source)
			.filter(key => !RESERVED_RULE_KEYS.includes(key))
			.forEach(key => {
				target[key] = source[key];
			});
	}

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => {
			return value === undefined ? "undefined" : value;
		}, 2);
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
			.filter(key => !RESERVED_USE_KEYS.includes(key))
			.forEach(key => {
				newItem[key] = item[key];
			});

		return newItem;
	}

	static normalizeCondition(condition) {
		if (!condition) {
			throw new Error("Expected condition but got falsy value");
		}

		if (typeof condition === "string") {
			return str => str.indexOf(condition) === 0;
		}

		if (typeof condition === "function") {
			return condition;
		}

		if (condition instanceof RegExp) {
			return condition.test.bind(condition);
		}

		if (Array.isArray(condition)) {
			const items = condition.map(c => RuleSet.normalizeCondition(c));
			return orMatcher(items);
		}

		if (typeof condition !== "object") {
			throw new Error(`Unexpected ${typeof condition} when condition was expected`);
		}

		const matchers = [];
		Object.keys(condition).forEach(key => {
			const value = condition[key];
			switch (key) {
				case CONDITION_KEYS.or:
				case CONDITION_KEYS.include:
				case CONDITION_KEYS.test:
					if (value) matchers.push(RuleSet.normalizeCondition(value));
					break;
				case CONDITION_KEYS.and:
					if (value) {
						const items = value.map(c => RuleSet.normalizeCondition(c));
						matchers.push(andMatcher(items));
					}
					break;
				case CONDITION_KEYS.not:
				case CONDITION_KEYS.exclude:
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

		// Apply properties
		this._applyProperties(rule, result);

		// Apply use items
		if (rule.use) {
			rule.use.forEach((use) => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
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
			.filter(key => !RESERVED_EXEC_KEYS.includes(key))
			.forEach(key => {
				result.push({
					type: key,
					value: rule[key]
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
	return str => !matcher(str);
}

function orMatcher(items) {
	return str => items.some(item => item(str));
}

function andMatcher(items) {
	return str => items.every(item => item(str));
}

module.exports = RuleSet;
```
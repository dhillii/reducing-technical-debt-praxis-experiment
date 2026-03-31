```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const RESERVED_RULE_KEYS = ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"];
const RESERVED_USE_KEYS = ["options", "query"];
const RESERVED_EXEC_KEYS = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];

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

		if (!rule) {
			throw new Error("Unexpected null when object was expected as rule");
		}

		if (typeof rule !== "object") {
			throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);
		}

		const newRule = {};
		let useSource;
		let resourceSource;

		const checkResourceSource = (source) => {
			if (resourceSource && resourceSource !== source) {
				throw new Error(
					RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one resource source (provided ${source} and ${resourceSource})`))
				);
			}
			resourceSource = source;
		};

		const checkUseSource = (source) => {
			if (useSource && useSource !== source) {
				throw new Error(
					RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${source} and ${useSource})`))
				);
			}
			useSource = source;
		};

		// Process resource conditions
		this._processResourceCondition(rule, newRule, checkResourceSource);

		// Process resourceQuery
		if (rule.resourceQuery) {
			newRule.resourceQuery = this._normalizeConditionSafely(rule.resourceQuery, rule);
		}

		// Process compiler
		if (rule.compiler) {
			newRule.compiler = this._normalizeConditionSafely(rule.compiler, rule);
		}

		// Process issuer
		if (rule.issuer) {
			newRule.issuer = this._normalizeConditionSafely(rule.issuer, rule);
		}

		// Process loaders/use
		this._processLoaderConfig(rule, newRule, checkUseSource, ident);

		// Process nested rules
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}

		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}

		// Copy remaining properties
		Object.keys(rule)
			.filter(key => !RESERVED_RULE_KEYS.includes(key))
			.forEach(key => {
				newRule[key] = rule[key];
			});

		// Store references
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
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
			newRule.resource = this._normalizeConditionSafely(condition, rule);
		} else if (rule.resource) {
			checkResourceSource("resource");
			newRule.resource = this._normalizeConditionSafely(rule.resource, rule);
		}
	}

	static _normalizeConditionSafely(condition, rule) {
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (error) {
			throw new Error(RuleSet.buildErrorMessage(condition, error));
		}
	}

	static _processLoaderConfig(rule, newRule, checkUseSource, ident) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}

		const loader = rule.loaders || rule.loader;

		if (typeof loader === "string" && !rule.options && !rule.query) {
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
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
	}

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => value === undefined ? "undefined" : value, 2);
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
		return typeof result === "string" ? RuleSet.normalizeUseItem(result) : result;
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
			throw new Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);
		}

		const matchers = [];
		Object.keys(condition).forEach(key => {
			const value = condition[key];
			switch (key) {
				case "or":
				case "include":
				case "test":
					if (value) matchers.push(RuleSet.normalizeCondition(value));
					break;
				case "and":
					if (value) {
						const items = value.map(c => RuleSet.normalizeCondition(c));
						matchers.push(andMatcher(items));
					}
					break;
				case "not":
				case "exclude":
					if (value) {
						matchers.push(notMatcher(RuleSet.normalizeCondition(value)));
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

		// Apply non-condition properties
		Object.keys(rule)
			.filter(key => !RESERVED_EXEC_KEYS.includes(key))
			.forEach(key => {
				result.push({ type: key, value: rule[key] });
			});

		// Apply use
		if (rule.use) {
			rule.use.forEach(use => {
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
			{ rule: rule.resource, data: data.resource },
			{ rule: rule.resourceQuery, data: data.resourceQuery },
			{ rule: rule.compiler, data: data.compiler },
			{ rule: rule.issuer, data: data.issuer }
		];

		for (const { rule: ruleCondition, data: dataValue } of conditions) {
			if (ruleCondition && !dataValue) {
				return false;
			}
			if (dataValue && ruleCondition && !ruleCondition(dataValue)) {
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
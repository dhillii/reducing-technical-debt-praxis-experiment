```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const RESOURCE_KEYS = ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer"];
const USE_KEYS = ["loader", "options", "query", "loaders", "use"];
const RULE_KEYS = ["rules", "oneOf"];
const IGNORED_KEYS = [...RESOURCE_KEYS, ...USE_KEYS, ...RULE_KEYS];

const CONDITION_KEYS = {
	or: "or",
	include: "include",
	test: "test",
	and: "and",
	not: "not",
	exclude: "exclude"
};

class ConditionMatcher {
	static notMatcher(matcher) {
		return (str) => !matcher(str);
	}

	static orMatcher(items) {
		return (str) => items.some(item => item(str));
	}

	static andMatcher(items) {
		return (str) => items.every(item => item(str));
	}

	static fromString(condition) {
		return (str) => str.indexOf(condition) === 0;
	}

	static fromRegExp(condition) {
		return condition.test.bind(condition);
	}

	static fromArray(condition) {
		const items = condition.map(c => RuleSet.normalizeCondition(c));
		return ConditionMatcher.orMatcher(items);
	}
}

class UseItemNormalizer {
	static normalizeString(useItemString) {
		const idx = useItemString.indexOf("?");
		if (idx >= 0) {
			return {
				loader: useItemString.substr(0, idx),
				options: useItemString.substr(idx + 1)
			};
		}
		return { loader: useItemString };
	}

	static normalizeObject(item, ident) {
		if (item.options && item.query) {
			throw new Error("Provided options and query in use");
		}

		if (!item.loader) {
			throw new Error("No loader specified");
		}

		const newItem = { ...item };
		newItem.options = item.options || item.query;

		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}

		delete newItem.query;
		return newItem;
	}

	static normalize(item, ident) {
		if (typeof item === "function") {
			return item;
		}

		if (typeof item === "string") {
			return UseItemNormalizer.normalizeString(item);
		}

		return UseItemNormalizer.normalizeObject(item, ident);
	}
}

class ResourceNormalizer {
	static normalizeTestIncludeExclude(rule) {
		if (rule.test || rule.include || rule.exclude) {
			return {
				test: rule.test,
				include: rule.include,
				exclude: rule.exclude
			};
		}
		return null;
	}

	static normalizeConditionField(rule, field) {
		if (rule[field]) {
			try {
				return RuleSet.normalizeCondition(rule[field]);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule[field], error));
			}
		}
		return null;
	}
}

class UseNormalizer {
	static normalizeLoaderConfig(rule) {
		const { loader, loaders } = rule;

		if (loader && loaders) {
			throw new Error(
				RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)"))
			);
		}

		const loaderValue = loaders || loader;

		if (typeof loaderValue === "string" && !rule.options && !rule.query) {
			return { source: "loader", use: loaderValue.split("!") };
		}

		if (typeof loaderValue === "string" && (rule.options || rule.query)) {
			return {
				source: "loader + options/query",
				use: { loader: loaderValue, options: rule.options, query: rule.query }
			};
		}

		if (loaderValue && (rule.options || rule.query)) {
			throw new Error(
				RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)"))
			);
		}

		if (loaderValue) {
			return { source: "loaders", use: loaderValue };
		}

		if (rule.options || rule.query) {
			throw new Error(
				RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)"))
			);
		}

		return null;
	}
}

class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	static normalizeRules(rules, refs, ident) {
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
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
			throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);
		}

		const newRule = {};
		let useSource;
		let resourceSource;

		const checkResourceSource = (newSource) => {
			if (resourceSource && resourceSource !== newSource) {
				throw new Error(
					RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one resource source (provided ${newSource} and ${resourceSource})`))
				);
			}
			resourceSource = newSource;
		};

		const checkUseSource = (newSource) => {
			if (useSource && useSource !== newSource) {
				throw new Error(
					RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${newSource} and ${useSource})`))
				);
			}
			useSource = newSource;
		};

		// Normalize resource conditions
		const testIncludeExclude = ResourceNormalizer.normalizeTestIncludeExclude(rule);
		if (testIncludeExclude) {
			checkResourceSource("test + include + exclude");
			try {
				newRule.resource = RuleSet.normalizeCondition(testIncludeExclude);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(testIncludeExclude, error));
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

		// Normalize other condition fields
		["resourceQuery", "compiler", "issuer"].forEach(field => {
			const normalized = ResourceNormalizer.normalizeConditionField(rule, field);
			if (normalized) {
				newRule[field] = normalized;
			}
		});

		// Normalize use/loader configuration
		const loaderConfig = UseNormalizer.normalizeLoaderConfig(rule);
		if (loaderConfig) {
			checkUseSource(loaderConfig.source);
			newRule.use = RuleSet.normalizeUse(loaderConfig.use, ident);
		}

		if (rule.use) {
			checkUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}

		// Normalize nested rules
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}

		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}

		// Copy remaining properties
		Object.keys(rule)
			.filter(key => !IGNORED_KEYS.includes(key))
			.forEach(key => {
				newRule[key] = rule[key];
			});

		// Store references for use items with ident
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if (item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;
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

	static normalizeUseItem(item, ident) {
		return UseItemNormalizer.normalize(item, ident);
	}

	static normalizeUseItemFunction(use, data) {
		const result = use(data);
		if (typeof result === "string") {
			return RuleSet.normalizeUseItem(result);
		}
		return result;
	}

	static normalizeCondition(condition) {
		if (!condition) {
			throw new Error("Expected condition but got falsy value");
		}

		if (typeof condition === "string") {
			return ConditionMatcher.fromString(condition);
		}

		if (typeof condition === "function") {
			return condition;
		}

		if (condition instanceof RegExp) {
			return ConditionMatcher.fromRegExp(condition);
		}

		if (Array.isArray(condition)) {
			return ConditionMatcher.fromArray(condition);
		}

		if (typeof condition !== "object") {
			throw new Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);
		}

		const matchers = [];

		Object.keys(condition).forEach(key => {
			const value = condition[key];

			switch (key) {
				case CONDITION_KEYS.or:
				case CONDITION_KEYS.include:
				case CONDITION_KEYS.test:
					if (value) {
						matchers.push(RuleSet.normalizeCondition(value));
					}
					break;

				case CONDITION_KEYS.and:
					if (value) {
						const items = value.map(c => RuleSet.normalizeCondition(c));
						matchers.push(ConditionMatcher.andMatcher(items));
					}
					break;

				case CONDITION_KEYS.not:
				case CONDITION_KEYS.exclude:
					if (value) {
						const matcher = RuleSet.normalizeCondition(value);
						matchers.push(ConditionMatcher.notMatcher(matcher));
					}
					break;

				default:
					throw new Error(`Unexpected property ${key} in condition`);
			}
		});

		if (matchers.length === 0) {
			throw new Error(`Expected condition but got ${condition}`);
		}

		return matchers.length === 1 ? matchers[0] : ConditionMatcher.andMatcher(matchers);
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

		// Apply rule properties
		this._applyRuleProperties(rule, result);

		// Apply use items
		if (rule.use) {
			this._applyUseItems(rule, data, result);
		}

		// Process nested rules
		if (rule.rules) {
			this._processNestedRules(data, rule.rules, result);
		}

		// Process oneOf rules
		if (rule.oneOf) {
			this._processOneOfRules(data, rule.oneOf, result);
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

		return conditions.every(({ rule: ruleCondition, data: dataValue }) => {
			if (ruleCondition && !dataValue) {
				return false;
			}
			if (dataValue && ruleCondition && !ruleCondition(dataValue)) {
				return false;
			}
			return true;
		});
	}

	_applyRuleProperties(rule, result) {
		Object.keys(rule)
			.filter(key => !["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].includes(key))
			.forEach(key => {
				result.push({ type: key, value: rule[key] });
			});
	}

	_applyUseItems(rule, data, result) {
		rule.use.forEach(use => {
			result.push({
				type: "use",
				value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
				enforce: rule.enforce
			});
		});
	}

	_processNestedRules(data, rules, result) {
		rules.forEach(nestedRule => {
			this._run(data, nestedRule, result);
		});
	}

	_processOneOfRules(data, rules, result) {
		for (let i = 0; i < rules.length; i++) {
			if (this._run(data, rules[i], result)) {
				break;
			}
		}
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) {
			throw new Error(`Can't find options with ident '${ident}'`);
		}
		return options;
	}
}

module.exports = RuleSet;
```
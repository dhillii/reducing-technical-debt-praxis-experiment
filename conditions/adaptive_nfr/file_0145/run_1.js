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

		this._normalizeResource(rule, newRule, resourceSource);
		this._normalizeConditions(rule, newRule);
		this._normalizeUse(rule, newRule, useSource, ident);
		this._normalizeNestedRules(rule, newRule, ident);
		this._copyUnreservedKeys(rule, newRule);
		this._storeReferences(newRule, refs);

		return newRule;

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

	static _normalizeResource(rule, newRule, resourceSource) {
		const hasResourceProps = rule.test || rule.include || rule.exclude;

		if (hasResourceProps && rule.resource) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Cannot use both resource and test/include/exclude")));
		}

		if (hasResourceProps) {
			this._normalizeConditionField(rule, newRule, { test: rule.test, include: rule.include, exclude: rule.exclude });
		} else if (rule.resource) {
			this._normalizeConditionField(rule, newRule, rule.resource, "resource");
		}
	}

	static _normalizeConditionField(rule, newRule, condition, fieldName = "resource") {
		try {
			newRule[fieldName] = RuleSet.normalizeCondition(condition);
		} catch (error) {
			throw new Error(RuleSet.buildErrorMessage(condition, error));
		}
	}

	static _normalizeConditions(rule, newRule) {
		const conditionFields = ["resourceQuery", "compiler", "issuer"];
		conditionFields.forEach(field => {
			if (rule[field]) {
				this._normalizeConditionField(rule, newRule, rule[field], field);
			}
		});
	}

	static _normalizeUse(rule, newRule, useSource, ident) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}

		const loader = rule.loaders || rule.loader;
		const hasOptions = rule.options || rule.query;

		if (typeof loader === "string" && !hasOptions) {
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && hasOptions) {
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
		} else if (loader && hasOptions) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (hasOptions) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}

		if (rule.use) {
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static _normalizeNestedRules(rule, newRule, ident) {
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, {}, `${ident}-rules`);
		}
		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, {}, `${ident}-oneOf`);
		}
	}

	static _copyUnreservedKeys(rule, newRule) {
		Object.keys(rule)
			.filter(key => !RESERVED_RULE_KEYS.includes(key))
			.forEach(key => {
				newRule[key] = rule[key];
			});
	}

	static _storeReferences(newRule, refs) {
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if (item.ident) {
					refs[item.ident] = item.options;
				}
			});
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

		const newItem = { loader: item.loader };
		const options = item.options || item.query;

		if (options) {
			newItem.options = options;
			newItem.ident = (typeof options === "object" && options.ident) ? options.ident : ident;
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
		const conditionHandlers = {
			or: (value) => value && matchers.push(RuleSet.normalizeCondition(value)),
			include: (value) => value && matchers.push(RuleSet.normalizeCondition(value)),
			test: (value) => value && matchers.push(RuleSet.normalizeCondition(value)),
			and: (value) => value && matchers.push(andMatcher(value.map(c => RuleSet.normalizeCondition(c)))),
			not: (value) => value && matchers.push(notMatcher(RuleSet.normalizeCondition(value))),
			exclude: (value) => value && matchers.push(notMatcher(RuleSet.normalizeCondition(value)))
		};

		Object.keys(condition).forEach(key => {
			const handler = conditionHandlers[key];
			if (handler) {
				handler(condition[key]);
			} else {
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
		if (!this._testConditions(data, rule)) {
			return false;
		}

		this._applyRule(data, rule, result);
		this._processNestedRules(data, rule, result);

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

	_applyRule(data, rule, result) {
		Object.keys(rule)
			.filter(key => !RESERVED_EXEC_KEYS.includes(key))
			.forEach(key => {
				result.push({ type: key, value: rule[key] });
			});

		if (rule.use) {
			rule.use.forEach(use => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
					enforce: rule.enforce
				});
			});
		}
	}

	_processNestedRules(data, rule, result) {
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
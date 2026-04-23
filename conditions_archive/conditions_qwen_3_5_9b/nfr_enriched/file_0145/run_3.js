```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

module.exports = class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	static normalizeRules(rules, refs, ident) {
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) =>
				RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`)
			);
		} else if (rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		} else {
			return [];
		}
	}

	static normalizeRule(rule, refs, ident) {
		const newRule = RuleSet.validateAndInitializeRule(rule);
		RuleSet.validateResourceConditions(newRule, rule);
		RuleSet.validateLoaderOptions(newRule, rule);
		RuleSet.validateUseArray(newRule, rule, ident);
		RuleSet.validateNestedRules(newRule, rule, refs, ident);
		RuleSet.copyUnknownProperties(newRule, rule);
		RuleSet.registerReferences(newRule, refs);
		return newRule;
	}

	static validateAndInitializeRule(rule) {
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
		return {};
	}

	static validateResourceConditions(newRule, rule) {
		const resourceKeys = ["test", "include", "exclude", "resource", "resourceQuery", "compiler", "issuer"];
		const usedSources = [];

		resourceKeys.forEach((key) => {
			if (rule[key]) {
				const sourceName = key === "test" || key === "include" || key === "exclude" ? "resource" : key;
				if (usedSources.includes(sourceName)) {
					throw new Error(
						RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one ${sourceName} source (provided ${usedSources[0]} and ${sourceName})`))
					);
				}
				usedSources.push(sourceName);
				try {
					newRule[key] = RuleSet.normalizeCondition(rule[key]);
				} catch (error) {
					throw new Error(RuleSet.buildErrorMessage(rule, error));
				}
			}
		});
	}

	static validateLoaderOptions(newRule, rule) {
		const loader = rule.loaders || rule.loader;
		const hasOptions = rule.options || rule.query;

		if (rule.loader && rule.loaders) {
			throw new Error(
				RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)"))
			);
		}

		if (typeof loader === "string" && !hasOptions) {
			newRule.use = RuleSet.normalizeUse(loader.split("!"), "loader");
		} else if (typeof loader === "string" && hasOptions) {
			newRule.use = RuleSet.normalizeUse({
				loader: loader,
				options: rule.options,
				query: rule.query
			}, "loader");
		} else if (loader && hasOptions) {
			throw new Error(
				RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)"))
			);
		} else if (loader) {
			newRule.use = RuleSet.normalizeUse(loader, "loaders");
		} else if (hasOptions) {
			throw new Error(
				RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)"))
			);
		}
	}

	static validateUseArray(newRule, rule, ident) {
		if (rule.use) {
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static validateNestedRules(newRule, rule, refs, ident) {
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}
		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}
	}

	static copyUnknownProperties(newRule, rule) {
		const allowedKeys = [
			"resource",
			"resourceQuery",
			"compiler",
			"test",
			"include",
			"exclude",
			"issuer",
			"loader",
			"options",
			"query",
			"loaders",
			"use",
			"rules",
			"oneOf"
		];
		const unknownKeys = Object.keys(rule).filter((key) => allowedKeys.indexOf(key) < 0);
		unknownKeys.forEach((key) => {
			newRule[key] = rule[key];
		});
	}

	static registerReferences(newRule, refs) {
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if (item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}
	}

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => {
			return value === undefined ? "undefined" : value;
		}, 2);
		return error.message + " in " + conditionAsText;
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
		return {
			loader: useItemString
		};
	}

	static normalizeUseItem(item, ident) {
		if (typeof item === "function") {
			return item;
		}
		if (typeof item === "string") {
			return RuleSet.normalizeUseItemString(item);
		}
		if (!item.loader) {
			throw new Error("No loader specified");
		}
		if (item.options && item.query) {
			throw new Error("Provided options and query in use");
		}
		const newItem = {
			loader: item.loader,
			options: item.options || item.query
		};
		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = item.options.ident || ident;
		}
		const extraKeys = Object.keys(item).filter((key) => key !== "options" && key !== "query");
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
			return RuleSet.createOrMatcher(items);
		}
		if (typeof condition !== "object") {
			throw new Error(
				`Unexpected ${typeof condition} when condition was expected (${condition})`
			);
		}
		const matchers = [];
		Object.keys(condition).forEach((key) => {
			const value = condition[key];
			if (!value) return;
			switch (key) {
				case "or":
				case "include":
				case "test":
					matchers.push(RuleSet.normalizeCondition(value));
					break;
				case "and":
					const items = value.map((c) => RuleSet.normalizeCondition(c));
					matchers.push(RuleSet.createAndMatcher(items));
					break;
				case "not":
				case "exclude":
					const matcher = RuleSet.normalizeCondition(value);
					matchers.push(RuleSet.createNotMatcher(matcher));
					break;
				default:
					throw new Error(`Unexpected property ${key} in condition`);
			}
		});
		if (matchers.length === 0) {
			throw new Error("Expected condition but got " + condition);
		}
		if (matchers.length === 1) {
			return matchers[0];
		}
		return RuleSet.createAndMatcher(matchers);
	}

	static createOrMatcher(items) {
		return (str) => {
			for (let i = 0; i < items.length; i++) {
				if (items[i](str)) return true;
			}
			return false;
		};
	}

	static createAndMatcher(items) {
		return (str) => {
			for (let i = 0; i < items.length; i++) {
				if (!items[i](str)) return false;
			}
			return true;
		};
	}

	static createNotMatcher(matcher) {
		return (str) => !matcher(str);
	}

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (rule.resource && !data.resource) return false;
		if (rule.resourceQuery && !data.resourceQuery) return false;
		if (rule.compiler && !data.compiler) return false;
		if (rule.issuer && !data.issuer) return false;
		if (rule.resource && !rule.resource(data.resource)) return false;
		if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) return false;
		if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) return false;
		if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) return false;

		const keys = Object.keys(rule).filter((key) => {
			return [
				"resource",
				"resourceQuery",
				"compiler",
				"issuer",
				"rules",
				"oneOf",
				"use",
				"enforce"
			].indexOf(key) < 0;
		});
		keys.forEach((key) => {
			result.push({ type: key, value: rule[key] });
		});

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

		if (rule.rules) {
			for (let i = 0; i < rule.rules.length; i++) {
				this._run(data, rule.rules[i], result);
			}
		}

		if (rule.oneOf) {
			for (let i = 0; i < rule.oneOf.length; i++) {
				if (this._run(data, rule.oneOf[i], result)) break;
			}
		}

		return true;
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) {
			throw new Error("Can't find options with ident '" + ident + "'");
		}
		return options;
	}
};

function notMatcher(matcher) {
	return function (str) {
		return !matcher(str);
	};
}

function orMatcher(items) {
	return function (str) {
		for (let i = 0; i < items.length; i++) {
			if (items[i](str)) return true;
		}
		return false;
	};
}

function andMatcher(items) {
	return function (str) {
		for (let i = 0; i < items.length; i++) {
			if (!items[i](str)) return false;
		}
		return true;
	};
}
```
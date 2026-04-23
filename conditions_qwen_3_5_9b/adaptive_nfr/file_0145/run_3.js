"use strict";

module.exports = class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	static normalizeRules(rules, refs, ident) {
		if(Array.isArray(rules)) {
			return rules.map((rule, idx) => {
				return RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`);
			});
		} else if(rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		} else {
			return [];
		}
	}

	static normalizeRule(rule, refs, ident) {
		if(typeof rule === "string")
			return {
				use: [{
					loader: rule
				}]
			};
		if(!rule)
			throw new Error("Unexcepted null when object was expected as rule");
		if(typeof rule !== "object")
			throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");

		let newRule = {};
		let useSource;
		let resourceSource;
		let condition;

		RuleSet.processResourceConditions(rule, newRule, refs, ident);
		RuleSet.processLoaderConditions(rule, newRule, refs, ident);
		RuleSet.processExtraProperties(rule, newRule);

		return newRule;
	}

	static processResourceConditions(rule, newRule, refs, ident) {
		const resourceKeys = ["test", "include", "exclude", "resource", "resourceQuery", "compiler", "issuer"];
		const resourceValues = {};
		let resourceSource;

		for(let key of resourceKeys) {
			if(rule[key]) {
				if(resourceSource) {
					throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided " + resourceSource + " and " + key + ")")));
				}
				resourceSource = key;
				resourceValues[key] = rule[key];
			}
		}

		if(resourceSource) {
			try {
				newRule.resource = RuleSet.normalizeCondition(resourceValues);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(resourceValues, error));
			}
		}
	}

	static processLoaderConditions(rule, newRule, refs, ident) {
		const loaderKeys = ["loader", "loaders", "options", "query", "use"];
		let useSource;

		for(let key of loaderKeys) {
			if(rule[key]) {
				if(useSource) {
					throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided " + useSource + " and " + key + ")")));
				}
				useSource = key;
			}
		}

		if(useSource === "loader") {
			const loader = rule.loader;
			if(typeof loader === "string" && !rule.options && !rule.query) {
				newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
			} else if(typeof loader === "string" && (rule.options || rule.query)) {
				newRule.use = RuleSet.normalizeUse({
					loader: loader,
					options: rule.options,
					query: rule.query
				}, ident);
			}
		} else if(useSource === "loaders") {
			const loader = rule.loaders;
			if(loader) {
				newRule.use = RuleSet.normalizeUse(loader, ident);
			}
		} else if(useSource === "use") {
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		} else if(useSource === "options" || useSource === "query") {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	static processExtraProperties(rule, newRule) {
		const loaderKeys = ["loader", "loaders", "options", "query", "use"];
		const resourceKeys = ["test", "include", "exclude", "resource", "resourceQuery", "compiler", "issuer"];
		const reservedKeys = new Set([...loaderKeys, ...resourceKeys, "rules", "oneOf", "enforce"]);

		const keys = Object.keys(rule).filter((key) => {
			return !reservedKeys.has(key);
		});

		keys.forEach((key) => {
			newRule[key] = rule[key];
		});
	}

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => {
			return value === undefined ? "undefined" : value;
		}, 2);
		return error.message + " in " + conditionAsText;
	}

	static normalizeUse(use, ident) {
		if(Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((arr, items) => arr.concat(items), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItemFunction(use, data) {
		const result = use(data);
		if(typeof result === "string") {
			return RuleSet.normalizeUseItem(result);
		}
		return result;
	}

	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if(idx >= 0) {
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
		if(typeof item === "function")
			return item;

		if(typeof item === "string") {
			return RuleSet.normalizeUseItemString(item);
		}

		let newItem = {};

		if(item.options && item.query)
			throw new Error("Provided options and query in use");

		if(!item.loader)
			throw new Error("No loader specified");

		newItem.options = item.options || item.query;

		if(typeof newItem.options === "object" && newItem.options) {
			if(newItem.options.ident)
				newItem.ident = newItem.options.ident;
			else
				newItem.ident = ident;
		}

		const keys = Object.keys(item).filter(function(key) {
			return ["options", "query"].indexOf(key) < 0;
		});

		keys.forEach(function(key) {
			newItem[key] = item[key];
		});

		return newItem;
	}

	static normalizeCondition(condition) {
		if(!condition)
			throw new Error("Expected condition but got falsy value");
		if(typeof condition === "string") {
			return str => str.indexOf(condition) === 0;
		}
		if(typeof condition === "function") {
			return condition;
		}
		if(condition instanceof RegExp) {
			return condition.test.bind(condition);
		}
		if(Array.isArray(condition)) {
			const items = condition.map(c => RuleSet.normalizeCondition(c));
			return orMatcher(items);
		}
		if(typeof condition !== "object")
			throw Error("Unexcepted " + typeof condition + " when condition was expected (" + condition + ")");

		let matchers = [];
		const conditionKeys = Object.keys(condition);
		for(let key of conditionKeys) {
			const value = condition[key];
			RuleSet.processConditionKey(key, value, matchers);
		}
		if(matchers.length === 0)
			throw new Error("Excepted condition but got " + condition);
		if(matchers.length === 1)
			return matchers[0];
		return andMatcher(matchers);
	}

	static processConditionKey(key, value, matchers) {
		if(!value) return;

		switch(key) {
			case "or":
			case "include":
			case "test":
				matchers.push(RuleSet.normalizeCondition(value));
				break;
			case "and":
				const andItems = value.map(c => RuleSet.normalizeCondition(c));
				matchers.push(andMatcher(andItems));
				break;
			case "not":
			case "exclude":
				const notMatcher = RuleSet.normalizeCondition(value);
				matchers.push(notMatcher(notMatcher));
				break;
			default:
				throw new Error("Unexcepted property " + key + " in condition");
		}
	}

	exec(data) {
		const result = [];
		this._run(data, {
			rules: this.rules
		}, result);
		return result;
	}

	_run(data, rule, result) {
		// test conditions
		if(rule.resource && !data.resource)
			return false;
		if(rule.resourceQuery && !data.resourceQuery)
			return false;
		if(rule.compiler && !data.compiler)
			return false;
		if(rule.issuer && !data.issuer)
			return false;
		if(rule.resource && !rule.resource(data.resource))
			return false;
		if(data.issuer && rule.issuer && !rule.issuer(data.issuer))
			return false;
		if(data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery))
			return false;
		if(data.compiler && rule.compiler && !rule.compiler(data.compiler))
			return false;

		// apply
		const keys = Object.keys(rule).filter((key) => {
			return ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) < 0;
		});
		keys.forEach((key) => {
			result.push({
				type: key,
				value: rule[key]
			});
		});

		if(rule.use) {
			rule.use.forEach((use) => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
					enforce: rule.enforce
				});
			});
		}

		if(rule.rules) {
			for(let i = 0; i < rule.rules.length; i++) {
				this._run(data, rule.rules[i], result);
			}
		}

		if(rule.oneOf) {
			for(let i = 0; i < rule.oneOf.length; i++) {
				if(this._run(data, rule.oneOf[i], result))
					break;
			}
		}

		return true;
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if(!options) throw new Error("Can't find options with ident '" + ident + "'");
		return options;
	}
};

function notMatcher(matcher) {
	return function(str) {
		return !matcher(str);
	};
}

function orMatcher(items) {
	return function(str) {
		for(let i = 0; i < items.length; i++) {
			if(items[i](str))
				return true;
		}
		return false;
	};
}

function andMatcher(items) {
	return function(str) {
		for(let i = 0; i < items.length; i++) {
			if(!items[i](str))
				return false;
		}
		return true;
	};
}
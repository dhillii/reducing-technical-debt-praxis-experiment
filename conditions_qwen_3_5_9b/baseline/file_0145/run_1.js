```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*
<rules>: <rule>
<rules>: [<rule>]
<rule>: {
	resource: {
		test: <condition>,
		include: <condition>,
		exclude: <condition>,
	},
	resource: <condition>, -> resource.test
	test: <condition>, -> resource.test
	include: <condition>, -> resource.include
	exclude: <condition>, -> resource.exclude
	resourceQuery: <condition>,
	compiler: <condition>,
	issuer: <condition>,
	use: "loader", -> use[0].loader
	loader: <>, -> use[0].loader
	loaders: <>, -> use
	options: {}, -> use[0].options,
	query: {}, -> options
	parser: {},
	use: [
		"loader" -> use[x].loader
	],
	use: [
		{
			loader: "loader",
			options: {}
		}
	],
	rules: [
		<rule>
	],
	oneOf: [
		<rule>
	]
}

<condition>: /regExp/
<condition>: function(arg) {}
<condition>: "starting"
<condition>: [<condition>] // or
<condition>: { and: [<condition>] }
<condition>: { or: [<condition>] }
<condition>: { not: [<condition>] }
<condition>: { test: <condition>, include: <condition>, exclude: <condition> }


normalized:

{
	resource: function(),
	resourceQuery: function(),
	compiler: function(),
	issuer: function(),
	use: [
		{
			loader: string,
			options: string,
			<any>: <any>
		}
	],
	rules: [<rule>],
	oneOf: [<rule>],
	<any>: <any>,
}

*/

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
		if(typeof rule === "string") {
			return {
				use: [{
					loader: rule
				}]
			};
		}
		
		if(!rule) {
			throw new Error("Unexpected null when object was expected as rule");
		}
		
		if(typeof rule !== "object") {
			throw new Error("Unexpected " + typeof rule + " when object was expected as rule (" + rule + ")");
		}

		let newRule = {};
		let useSource;
		let resourceSource;

		RuleSet.normalizeResourceConditions(rule, newRule, refs, ident, resourceSource, useSource);
		RuleSet.normalizeLoaderConditions(rule, newRule, refs, ident, resourceSource, useSource);
		RuleSet.normalizeNestedRules(rule, newRule, refs, ident);
		RuleSet.copyRemainingProperties(rule, newRule);

		return newRule;
	}

	static normalizeResourceConditions(rule, newRule, refs, ident, resourceSource, useSource) {
		const hasTest = rule.test || rule.include || rule.exclude;
		const hasResource = rule.resource;
		const hasResourceQuery = rule.resourceQuery;
		const hasCompiler = rule.compiler;
		const hasIssuer = rule.issuer;

		if(hasTest || hasResource || hasResourceQuery || hasCompiler || hasIssuer) {
			if(hasTest || hasResource || hasResourceQuery) {
				const resourceCondition = RuleSet.buildResourceCondition(rule);
				if(resourceCondition) {
					newRule.resource = resourceCondition;
				}
			}
			
			if(hasCompiler) {
				newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
			}
			
			if(hasIssuer) {
				newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
			}
		}
	}

	static buildResourceCondition(rule) {
		const condition = {
			test: rule.test,
			include: rule.include,
			exclude: rule.exclude
		};
		
		try {
			return RuleSet.normalizeCondition(condition);
		} catch(error) {
			throw new Error(RuleSet.buildErrorMessage(condition, error));
		}
	}

	static normalizeLoaderConditions(rule, newRule, refs, ident, resourceSource, useSource) {
		const loader = rule.loaders || rule.loader;
		
		if(loader) {
			if(typeof loader === "string" && !rule.options && !rule.query) {
				newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
			} else if(typeof loader === "string" && (rule.options || rule.query)) {
				newRule.use = RuleSet.normalizeUse({
					loader: loader,
					options: rule.options,
					query: rule.query
				}, ident);
			} else if(loader && (rule.options || rule.query)) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
			} else if(loader) {
				newRule.use = RuleSet.normalizeUse(loader, ident);
			} else if(rule.options || rule.query) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
			}
		}

		if(rule.use) {
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static normalizeNestedRules(rule, newRule, refs, ident) {
		if(rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}

		if(rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}
	}

	static copyRemainingProperties(rule, newRule) {
		const allowedKeys = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		const keys = Object.keys(rule).filter((key) => {
			return allowedKeys.indexOf(key) < 0;
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
		if(typeof item === "function") {
			return item;
		}

		if(typeof item === "string") {
			return RuleSet.normalizeUseItemString(item);
		}

		let newItem = {};

		if(item.options && item.query) {
			throw new Error("Provided options and query in use");
		}

		if(!item.loader) {
			throw new Error("No loader specified");
		}

		newItem.options = item.options || item.query;

		if(typeof newItem.options === "object" && newItem.options) {
			if(newItem.options.ident) {
				newItem.ident = newItem.options.ident;
			} else {
				newItem.ident = ident;
			}
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
		if(!condition) {
			throw new Error("Expected condition but got falsy value");
		}
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
		if(typeof condition !== "object") {
			throw Error("Unexpected " + typeof condition + " when condition was expected (" + condition + ")");
		}

		let matchers = [];
		Object.keys(condition).forEach(key => {
			const value = condition[key];
			switch(key) {
				case "or":
				case "include":
				case "test":
					if(value) {
						matchers.push(RuleSet.normalizeCondition(value));
					}
					break;
				case "and":
					if(value) {
						const items = value.map(c => RuleSet.normalizeCondition(c));
						matchers.push(andMatcher(items));
					}
					break;
				case "not":
				case "exclude":
					if(value) {
						const matcher = RuleSet.normalizeCondition(value);
						matchers.push(notMatcher(matcher));
					}
					break;
				default:
					throw new Error("Unexpected property " + key + " in condition");
			}
		});
		if(matchers.length === 0) {
			throw new Error("Expected condition but got " + condition);
		}
		if(matchers.length === 1) {
			return matchers[0];
		}
		return andMatcher(matchers);
	}

	exec(data) {
		const result = [];
		this._run(data, {
			rules: this.rules
		}, result);
		return result;
	}

	_run(data, rule, result) {
		if(rule.resource && !data.resource) {
			return false;
		}
		if(rule.resourceQuery && !data.resourceQuery) {
			return false;
		}
		if(rule.compiler && !data.compiler) {
			return false;
		}
		if(rule.issuer && !data.issuer) {
			return false;
		}
		if(rule.resource && !rule.resource(data.resource)) {
			return false;
		}
		if(data.issuer && rule.issuer && !rule.issuer(data.issuer)) {
			return false;
		}
		if(data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) {
			return false;
		}
		if(data.compiler && rule.compiler && !rule.compiler(data.compiler)) {
			return false;
		}

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
				if(this._run(data, rule.oneOf[i], result)) {
					break;
				}
			}
		}

		return true;
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if(!options) {
			throw new Error("Can't find options with ident '" + ident + "'");
		}
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
			if(items[i](str)) {
				return true;
			}
		}
		return false;
	};
}

function andMatcher(items) {
	return function(str) {
		for(let i = 0; i < items.length; i++) {
			if(!items[i](str)) {
				return false;
			}
		}
		return true;
	};
}
```
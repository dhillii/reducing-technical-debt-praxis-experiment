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

		const checkResourceSource = (newSource) => {
			if(resourceSource && resourceSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided " + newSource + " and " + resourceSource + ")")));
			resourceSource = newSource;
		};

		const checkUseSource = (newSource) => {
			if(useSource && useSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided " + newSource + " and " + useSource + ")")));
			useSource = newSource;
		};

		RuleSet._normalizeResourceConditions(rule, newRule, checkResourceSource);
		RuleSet._normalizeQueryAndCompilerConditions(rule, newRule);
		RuleSet._normalizeLoaderAndUse(rule, newRule, checkUseSource, ident);
		RuleSet._normalizeNestedRules(rule, newRule, refs, ident);
		RuleSet._copyUnknownProperties(rule, newRule);

		if(Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if(item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;
	}

	/**
	 * Normalize resource, test, include, and exclude conditions
	 */
	static _normalizeResourceConditions(rule, newRule, checkResourceSource) {
		if(rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			const condition = {
				test: rule.test,
				include: rule.include,
				exclude: rule.exclude
			};
			try {
				newRule.resource = RuleSet.normalizeCondition(condition);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(condition, error));
			}
		}

		if(rule.resource) {
			checkResourceSource("resource");
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
			}
		}
	}

	/**
	 * Normalize resourceQuery, compiler, and issuer conditions
	 */
	static _normalizeQueryAndCompilerConditions(rule, newRule) {
		const conditionFields = ["resourceQuery", "compiler", "issuer"];
		conditionFields.forEach(field => {
			if(rule[field]) {
				try {
					newRule[field] = RuleSet.normalizeCondition(rule[field]);
				} catch(error) {
					throw new Error(RuleSet.buildErrorMessage(rule[field], error));
				}
			}
		});
	}

	/**
	 * Normalize loader, loaders, options, query, and use properties
	 */
	static _normalizeLoaderAndUse(rule, newRule, checkUseSource, ident) {
		if(rule.loader && rule.loaders)
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));

		const loader = rule.loaders || rule.loader;
		const hasOptions = rule.options || rule.query;

		if(typeof loader === "string" && !hasOptions) {
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if(typeof loader === "string" && hasOptions) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({
				loader: loader,
				options: rule.options,
				query: rule.query
			}, ident);
		} else if(loader && hasOptions) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if(loader) {
			checkUseSource("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if(hasOptions) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}

		if(rule.use) {
			checkUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	/**
	 * Normalize nested rules and oneOf properties
	 */
	static _normalizeNestedRules(rule, newRule, refs, ident) {
		if(rule.rules)
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);

		if(rule.oneOf)
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
	}

	/**
	 * Copy unknown properties from rule to newRule
	 */
	static _copyUnknownProperties(rule, newRule) {
		const knownKeys = ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"];
		const keys = Object.keys(rule).filter((key) => knownKeys.indexOf(key) < 0);
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

		const matchers = RuleSet._buildConditionMatchers(condition);
		
		if(matchers.length === 0)
			throw new Error("Excepted condition but got " + condition);
		if(matchers.length === 1)
			return matchers[0];
		return andMatcher(matchers);
	}

	/**
	 * Build matchers from condition object properties
	 */
	static _buildConditionMatchers(condition) {
		const matchers = [];
		const conditionHandlers = {
			or: (value) => {
				if(value)
					matchers.push(RuleSet.normalizeCondition(value));
			},
			include: (value) => {
				if(value)
					matchers.push(RuleSet.normalizeCondition(value));
			},
			test: (value) => {
				if(value)
					matchers.push(RuleSet.normalizeCondition(value));
			},
			and: (value) => {
				if(value) {
					const items = value.map(c => RuleSet.normalizeCondition(c));
					matchers.push(andMatcher(items));
				}
			},
			not: (value) => {
				if(value) {
					const matcher = RuleSet.normalizeCondition(value);
					matchers.push(notMatcher(matcher));
				}
			},
			exclude: (value) => {
				if(value) {
					const matcher = RuleSet.normalizeCondition(value);
					matchers.push(notMatcher(matcher));
				}
			}
		};

		Object.keys(condition).forEach(key => {
			const handler = conditionHandlers[key];
			if(handler) {
				handler(condition[key]);
			} else {
				throw new Error("Unexcepted property " + key + " in condition");
			}
		});

		return matchers;
	}

	exec(data) {
		const result = [];
		this._run(data, {
			rules: this.rules
		}, result);
		return result;
	}

	_run(data, rule, result) {
		if(!this._testConditions(data, rule))
			return false;

		this._applyProperties(rule, result);
		this._applyUse(rule, data, result);
		this._applyNestedRules(data, rule, result);

		return true;
	}

	/**
	 * Test all conditions against data
	 */
	_testConditions(data, rule) {
		const conditions = [
			{ matcher: rule.resource, dataField: "resource" },
			{ matcher: rule.resourceQuery, dataField: "resourceQuery" },
			{ matcher: rule.compiler, dataField: "compiler" },
			{ matcher: rule.issuer, dataField: "issuer" }
		];

		for(const condition of conditions) {
			if(condition.matcher && !data[condition.dataField])
				return false;
			if(data[condition.dataField] && condition.matcher && !condition.matcher(data[condition.dataField]))
				return false;
		}

		return true;
	}

	/**
	 * Apply non-standard properties to result
	 */
	_applyProperties(rule, result) {
		const excludedKeys = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		const keys = Object.keys(rule).filter((key) => excludedKeys.indexOf(key) < 0);
		keys.forEach((key) => {
			result.push({
				type: key,
				value: rule[key]
			});
		});
	}

	/**
	 * Apply use loaders to result
	 */
	_applyUse(rule, data, result) {
		if(rule.use) {
			rule.use.forEach((use) => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
					enforce: rule.enforce
				});
			});
		}
	}

	/**
	 * Apply nested rules and oneOf rules
	 */
	_applyNestedRules(data, rule, result) {
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
```
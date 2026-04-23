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
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) => {
				return RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`);
			});
		} else if (rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		} else {
			return [];
		}
	}

	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return RuleSet.normalizeStringRule(rule);
		}
		if (!rule) {
			throw new Error("Unexcepted null when object was expected as rule");
		}
		if (typeof rule !== "object") {
			throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");
		}

		const newRule = RuleSet.createEmptyRule();
		let useSource;
		let resourceSource;

		RuleSet.processResourceConditions(rule, newRule, refs, ident, resourceSource);
		RuleSet.processResourceQuery(rule, newRule);
		RuleSet.processCompiler(rule, newRule);
		RuleSet.processIssuer(rule, newRule);
		RuleSet.processLoader(rule, newRule, refs, ident, useSource);
		RuleSet.processRules(rule, newRule, refs, ident);
		RuleSet.processOneOf(rule, newRule);
		RuleSet.processExtraProperties(rule, newRule);

		return newRule;
	}

	static normalizeStringRule(loader) {
		return {
			use: [{
				loader: loader
			}]
		};
	}

	static createEmptyRule() {
		return {};
	}

	static processResourceConditions(rule, newRule, refs, ident, resourceSource) {
		if (rule.test || rule.include || rule.exclude) {
			RuleSet.checkResourceSource(resourceSource, "test + include + exclude");
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

		if (rule.resource) {
			RuleSet.checkResourceSource(resourceSource, "resource");
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
			}
		}
	}

	static processResourceQuery(rule, newRule) {
		if (rule.resourceQuery) {
			try {
				newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resourceQuery, error));
			}
		}
	}

	static processCompiler(rule, newRule) {
		if (rule.compiler) {
			try {
				newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.compiler, error));
			}
		}
	}

	static processIssuer(rule, newRule) {
		if (rule.issuer) {
			try {
				newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.issuer, error));
			}
		}
	}

	static processLoader(rule, newRule, refs, ident, useSource) {
		const loader = rule.loaders || rule.loader;
		const hasOptionsOrQuery = rule.options || rule.query;

		if (typeof loader === "string" && !hasOptionsOrQuery) {
			RuleSet.checkUseSource(useSource, "loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && hasOptionsOrQuery) {
			RuleSet.checkUseSource(useSource, "loader + options/query");
			newRule.use = RuleSet.normalizeUse({
				loader: loader,
				options: rule.options,
				query: rule.query
			}, ident);
		} else if (loader && hasOptionsOrQuery) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			RuleSet.checkUseSource(useSource, "loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (hasOptionsOrQuery) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	static processRules(rule, newRule, refs, ident) {
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}
	}

	static processOneOf(rule, newRule) {
		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}
	}

	static processExtraProperties(rule, newRule) {
		const allowedKeys = ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"];
		const keys = Object.keys(rule).filter((key) => {
			return allowedKeys.indexOf(key) < 0;
		});
		keys.forEach((key) => {
			newRule[key] = rule[key];
		});
	}

	static checkUseSource(currentSource, newSource) {
		if (currentSource && currentSource !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided " + newSource + " and " + currentSource + ")")));
		}
	}

	static checkResourceSource(currentSource, newSource) {
		if (currentSource && currentSource !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided " + newSource + " and " + currentSource + ")")));
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

		let newItem = {};

		if (item.options && item.query) {
			throw new Error("Provided options and query in use");
		}

		if (!item.loader) {
			throw new Error("No loader specified");
		}

		newItem.options = item.options || item.query;

		if (typeof newItem.options === "object" && newItem.options) {
			if (newItem.options.ident) {
				newItem.ident = newItem.options.ident;
			} else {
				newItem.ident = ident;
			}
		}

		const allowedKeys = ["options", "query"];
		const keys = Object.keys(item).filter(function (key) {
			return allowedKeys.indexOf(key) < 0;
		});

		keys.forEach(function (key) {
			newItem[key] = item[key];
		});

		return newItem;
	}

	static normalizeCondition(condition) {
		if (!condition) {
			throw new Error("Expected condition but got falsy value");
		}
		if (typeof condition === "string") {
			return RuleSet.createStringMatcher(condition);
		}
		if (typeof condition === "function") {
			return condition;
		}
		if (condition instanceof RegExp) {
			return condition.test.bind(condition);
		}
		if (Array.isArray(condition)) {
			const items = condition.map(c => RuleSet.normalizeCondition(c));
			return RuleSet.createOrMatcher(items);
		}
		if (typeof condition !== "object") {
			throw Error("Unexcepted " + typeof condition + " when condition was expected (" + condition + ")");
		}

		const matchers = RuleSet.createConditionMatchers(condition);
		if (matchers.length === 0) {
			throw new Error("Excepted condition but got " + condition);
		}
		if (matchers.length === 1) {
			return matchers[0];
		}
		return RuleSet.createAndMatcher(matchers);
	}

	static createStringMatcher(condition) {
		return str => str.indexOf(condition) === 0;
	}

	static createOrMatcher(items) {
		return function (str) {
			for (let i = 0; i < items.length; i++) {
				if (items[i](str)) {
					return true;
				}
			}
			return false;
		};
	}

	static createAndMatcher(items) {
		return function (str) {
			for (let i = 0; i < items.length; i++) {
				if (!items[i](str)) {
					return false;
				}
			}
			return true;
		};
	}

	static createConditionMatchers(condition) {
		const matchers = [];
		const conditionKeys = Object.keys(condition);

		for (let i = 0; i < conditionKeys.length; i++) {
			const key = conditionKeys[i];
			const value = condition[key];
			const matcher = RuleSet.getConditionMatcher(key, value);
			if (matcher) {
				matchers.push(matcher);
			}
		}
		return matchers;
	}

	static getConditionMatcher(key, value) {
		switch (key) {
			case "or":
			case "include":
			case "test":
				if (value) {
					return RuleSet.normalizeCondition(value);
				}
				break;
			case "and":
				if (value) {
					const items = value.map(c => RuleSet.normalizeCondition(c));
					return RuleSet.createAndMatcher(items);
				}
				break;
			case "not":
			case "exclude":
				if (value) {
					const matcher = RuleSet.normalizeCondition(value);
					return RuleSet.createNotMatcher(matcher);
				}
				break;
			default:
				throw new Error("Unexcepted property " + key + " in condition");
		}
		return null;
	}

	static createNotMatcher(matcher) {
		return function (str) {
			return !matcher(str);
		};
	}

	exec(data) {
		const result = [];
		this._run(data, {
			rules: this.rules
		}, result);
		return result;
	}

	_run(data, rule, result) {
		if (!RuleSet.checkResourceCondition(rule.resource, data.resource)) {
			return false;
		}
		if (!RuleSet.checkResourceQueryCondition(rule.resourceQuery, data.resourceQuery)) {
			return false;
		}
		if (!RuleSet.checkCompilerCondition(rule.compiler, data.compiler)) {
			return false;
		}
		if (!RuleSet.checkIssuerCondition(rule.issuer, data.issuer)) {
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

		if (rule.use) {
			rule.use.forEach((use) => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
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
				if (this._run(data, rule.oneOf[i], result)) {
					break;
				}
			}
		}

		return true;
	}

	static checkResourceCondition(matcher, resource) {
		if (!matcher) {
			return true;
		}
		if (!resource) {
			return false;
		}
		return matcher(resource);
	}

	static checkResourceQueryCondition(matcher, resourceQuery) {
		if (!matcher) {
			return true;
		}
		if (!resourceQuery) {
			return false;
		}
		return matcher(resourceQuery);
	}

	static checkCompilerCondition(matcher, compiler) {
		if (!matcher) {
			return true;
		}
		if (!compiler) {
			return false;
		}
		return matcher(compiler);
	}

	static checkIssuerCondition(matcher, issuer) {
		if (!matcher) {
			return true;
		}
		if (!issuer) {
			return false;
		}
		return matcher(issuer);
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
			if (items[i](str)) {
				return true;
			}
		}
		return false;
	};
}

function andMatcher(items) {
	return function (str) {
		for (let i = 0; i < items.length; i++) {
			if (!items[i](str)) {
				return false;
			}
		}
		return true;
	};
}
```
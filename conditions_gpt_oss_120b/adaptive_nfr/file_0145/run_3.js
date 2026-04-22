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

	/* ---------- Normalization ---------- */

	static normalizeRules(rules, refs, ident) {
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
		}
		if (rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		}
		return [];
	}

	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}
		if (!rule) throw new Error("Unexcepted null when object was expected as rule");
		if (typeof rule !== "object") throw new Error(`Unexcepted ${typeof rule} when object was expected as rule (${rule})`);

		let newRule = {};
		let useSource, resourceSource;

		/*** resource handling ***/
		if (rule.test || rule.include || rule.exclude) {
			RuleSet._assertSingleSource("test + include + exclude", resourceSource, (src) => (resourceSource = src));
			newRule.resource = RuleSet._wrapCondition(rule, ["test", "include", "exclude"]);
		}
		if (rule.resource) {
			RuleSet._assertSingleSource("resource", resourceSource, (src) => (resourceSource = src));
			newRule.resource = RuleSet._wrapCondition(rule.resource);
		}
		if (rule.resourceQuery) newRule.resourceQuery = RuleSet._wrapCondition(rule.resourceQuery);
		if (rule.compiler) newRule.compiler = RuleSet._wrapCondition(rule.compiler);
		if (rule.issuer) newRule.issuer = RuleSet._wrapCondition(rule.issuer);

		/*** loader / use handling ***/
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string" && !rule.options && !rule.query) {
			RuleSet._assertSingleSource("loader", useSource, (src) => (useSource = src));
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			RuleSet._assertSingleSource("loader + options/query", useSource, (src) => (useSource = src));
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			RuleSet._assertSingleSource("loaders", useSource, (src) => (useSource = src));
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
		if (rule.use) {
			RuleSet._assertSingleSource("use", useSource, (src) => (useSource = src));
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}

		/*** nested rules ***/
		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		/*** copy unknown properties ***/
		Object.keys(rule)
			.filter((k) => !["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].includes(k))
			.forEach((k) => (newRule[k] = rule[k]));

		/*** collect references ***/
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
		return newRule;
	}

	/*** helpers for normalization ***/
	static _assertSingleSource(newSource, currentSource, setter) {
		if (currentSource && currentSource !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(currentSource, new Error(`Rule can only have one result source (provided ${newSource} and ${currentSource})`)));
		}
		setter(newSource);
	}

	static _wrapCondition(source, keys = null) {
		const condition = keys ? { test: source.test, include: source.include, exclude: source.exclude } : source;
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (e) {
			throw new Error(RuleSet.buildErrorMessage(condition, e));
		}
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
		if (typeof result === "string") return RuleSet.normalizeUseItem(result);
		return result;
	}

	static normalizeUseItemString(str) {
		const idx = str.indexOf("?");
		if (idx >= 0) {
			return { loader: str.substr(0, idx), options: str.substr(idx + 1) };
		}
		return { loader: str };
	}

	static normalizeUseItem(item, ident) {
		if (typeof item === "function") return item;
		if (typeof item === "string") return RuleSet.normalizeUseItemString(item);

		if (item.options && item.query) throw new Error("Provided options and query in use");
		if (!item.loader) throw new Error("No loader specified");

		const newItem = { options: item.options || item.query };
		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}
		Object.keys(item)
			.filter((k) => !["options", "query"].includes(k))
			.forEach((k) => (newItem[k] = item[k]));
		return newItem;
	}

	/*** condition normalization ***/
	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return (str) => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return orMatcher(condition.map(RuleSet.normalizeCondition));

		if (typeof condition !== "object") throw Error(`Unexcepted ${typeof condition} when condition was expected (${condition})`);

		const matchers = [];
		Object.keys(condition).forEach((key) => {
			const value = condition[key];
			switch (key) {
				case "or":
				case "include":
				case "test":
					if (value) matchers.push(RuleSet.normalizeCondition(value));
					break;
				case "and":
					if (value) matchers.push(andMatcher(value.map(RuleSet.normalizeCondition)));
					break;
				case "not":
				case "exclude":
					if (value) matchers.push(notMatcher(RuleSet.normalizeCondition(value)));
					break;
				default:
					throw new Error(`Unexcepted property ${key} in condition`);
			}
		});
		if (matchers.length === 0) throw new Error(`Excepted condition but got ${condition}`);
		if (matchers.length === 1) return matchers[0];
		return andMatcher(matchers);
	}

	/* ---------- Execution ---------- */

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!RuleSet._checkConditions(data, rule)) return false;
		RuleSet._applyProperties(rule, result);
		if (rule.use) RuleSet._applyUse(rule.use, data, result, rule.enforce);
		if (rule.rules) RuleSet._runNestedRules(data, rule.rules, result);
		if (rule.oneOf) RuleSet._runOneOf(data, rule.oneOf, result);
		return true;
	}

	/*** condition checks ***/
	static _checkConditions(data, rule) {
		if (rule.resource && !data.resource) return false;
		if (rule.resourceQuery && !data.resourceQuery) return false;
		if (rule.compiler && !data.compiler) return false;
		if (rule.issuer && !data.issuer) return false;
		if (rule.resource && !rule.resource(data.resource)) return false;
		if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) return false;
		if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) return false;
		if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) return false;
		return true;
	}

	/*** property application ***/
	static _applyProperties(rule, result) {
		Object.keys(rule)
			.filter((k) => !["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].includes(k))
			.forEach((k) => result.push({ type: k, value: rule[k] }));
	}

	/*** use handling ***/
	static _applyUse(useArray, data, result, enforce) {
		useArray.forEach((use) => {
			const value = typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use;
			result.push({ type: "use", value, enforce });
		});
	}

	/*** nested rule handling ***/
	static _runNestedRules(data, rules, result) {
		for (let i = 0; i < rules.length; i++) {
			this.prototype._run(data, rules[i], result);
		}
	}

	static _runOneOf(data, oneOf, result) {
		for (let i = 0; i < oneOf.length; i++) {
			if (this.prototype._run(data, oneOf[i], result)) break;
		}
	}

	/* ---------- Helpers ---------- */

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

/** @private */
function notMatcher(matcher) {
	return (str) => !matcher(str);
}

/** @private */
function orMatcher(items) {
	return (str) => {
		for (let i = 0; i < items.length; i++) {
			if (items[i](str)) return true;
		}
		return false;
	};
}

/** @private */
function andMatcher(items) {
	return (str) => {
		for (let i = 0; i < items.length; i++) {
			if (!items[i](str)) return false;
		}
		return true;
	};
}
```
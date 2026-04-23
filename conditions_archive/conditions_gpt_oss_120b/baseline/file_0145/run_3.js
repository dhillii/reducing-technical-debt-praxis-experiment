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
		if (!rule) throw new Error("Unexpected null when object was expected as rule");
		if (typeof rule !== "object") throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);

		const newRule = {};
		let useSource, resourceSource;

		RuleSet._processResource(rule, newRule, () => {
			if (resourceSource) throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one resource source (provided ${resourceSource})`)));
			resourceSource = "resource";
		});

		RuleSet._processLoader(rule, newRule, ident, () => {
			if (useSource) throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${useSource})`)));
			useSource = "loader";
		});

		if (rule.use) {
			RuleSet._ensureSingleSource(useSource, "use", rule);
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
			useSource = "use";
		}

		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		RuleSet._copyExtraProperties(rule, newRule);

		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
		return newRule;
	}

	static _processResource(rule, newRule, setSource) {
		if (rule.test || rule.include || rule.exclude) {
			setSource();
			const condition = { test: rule.test, include: rule.include, exclude: rule.exclude };
			newRule.resource = RuleSet._wrapCondition(condition);
		}
		if (rule.resource) {
			setSource();
			newRule.resource = RuleSet._wrapCondition(rule.resource);
		}
		if (rule.resourceQuery) newRule.resourceQuery = RuleSet._wrapCondition(rule.resourceQuery);
		if (rule.compiler) newRule.compiler = RuleSet._wrapCondition(rule.compiler);
		if (rule.issuer) newRule.issuer = RuleSet._wrapCondition(rule.issuer);
	}

	static _processLoader(rule, newRule, ident, setSource) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string") {
			if (!rule.options && !rule.query) {
				setSource();
				newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
			} else {
				setSource();
				newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
			}
		} else if (loader) {
			if (rule.options || rule.query) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
			}
			setSource();
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	static _ensureSingleSource(current, newSource, rule) {
		if (current && current !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${newSource} and ${current})`)));
		}
	}

	static _copyExtraProperties(source, target) {
		const ignored = [
			"resource", "resourceQuery", "compiler", "test", "include", "exclude",
			"issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"
		];
		Object.keys(source)
			.filter(key => ignored.indexOf(key) < 0)
			.forEach(key => {
				target[key] = source[key];
			});
	}

	static _wrapCondition(condition) {
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (e) {
			throw new Error(RuleSet.buildErrorMessage(condition, e));
		}
	}

	static buildErrorMessage(condition, error) {
		const txt = JSON.stringify(condition, (k, v) => (v === undefined ? "undefined" : v), 2);
		return `${error.message} in ${txt}`;
	}

	/* ---------- Use Normalization ---------- */
	static normalizeUse(use, ident) {
		if (Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((a, b) => a.concat(b), []);
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

		const newItem = { ...item };
		newItem.options = item.options || item.query;

		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}
		delete newItem.options;
		delete newItem.query;
		return newItem;
	}

	/* ---------- Condition Normalization ---------- */
	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return str => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
		if (typeof condition !== "object") throw new Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);

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
					if (value) matchers.push(andMatcher(value.map(c => RuleSet.normalizeCondition(c))));
					break;
				case "not":
				case "exclude":
					if (value) matchers.push(notMatcher(RuleSet.normalizeCondition(value)));
					break;
				default:
					throw new Error(`Unexpected property ${key} in condition`);
			}
		});
		if (matchers.length === 0) throw new Error(`Expected condition but got ${condition}`);
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
		if (!RuleSet._matches(rule, data)) return false;

		RuleSet._collectProperties(rule, result);
		RuleSet._processUse(rule, data, result);
		RuleSet._processNestedRules(rule, data, result);
		RuleSet._processOneOf(rule, data, result);

		return true;
	}

	static _matches(rule, data) {
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

	static _collectProperties(rule, result) {
		const ignored = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		Object.keys(rule)
			.filter(k => ignored.indexOf(k) < 0)
			.forEach(k => result.push({ type: k, value: rule[k] }));
	}

	static _processUse(rule, data, result) {
		if (!rule.use) return;
		rule.use.forEach(use => {
			const value = typeof use === "function"
				? RuleSet.normalizeUseItemFunction(use, data)
				: use;
			result.push({ type: "use", value, enforce: rule.enforce });
		});
	}

	static _processNestedRules(rule, data, result) {
		if (!rule.rules) return;
		rule.rules.forEach(r => this._run(data, r, result));
	}

	static _processOneOf(rule, data, result) {
		if (!rule.oneOf) return;
		for (let i = 0; i < rule.oneOf.length; i++) {
			if (this._run(data, rule.oneOf[i], result)) break;
		}
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

/* ---------- Matcher Helpers ---------- */
function notMatcher(matcher) {
	return str => !matcher(str);
}
function orMatcher(items) {
	return str => items.some(m => m(str));
}
function andMatcher(items) {
	return str => items.every(m => m(str));
}
```
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
			return rules.map((r, i) => RuleSet.normalizeRule(r, refs, `${ident}-${i}`));
		}
		if (rules) return [RuleSet.normalizeRule(rules, refs, ident)];
		return [];
	}

	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}
		if (!rule) throw new Error("Unexpected null when object was expected as rule");
		if (typeof rule !== "object") throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);

		const newRule = {};
		const state = { useSource: null, resourceSource: null };

		RuleSet._processResource(rule, newRule, state);
		RuleSet._processLoader(rule, newRule, ident, refs, state);
		RuleSet._processUse(rule, newRule, ident, state);
		RuleSet._processSubRules(rule, newRule, refs, ident);
		RuleSet._copyExtraProperties(rule, newRule);

		RuleSet._collectRefs(newRule, refs);
		return newRule;
	}

	static _processResource(rule, newRule, state) {
		if (rule.test || rule.include || rule.exclude) {
			RuleSet._ensureSingleSource(state, "resource", "test + include + exclude");
			newRule.resource = RuleSet._wrapCondition({ test: rule.test, include: rule.include, exclude: rule.exclude });
		}
		if (rule.resource) {
			RuleSet._ensureSingleSource(state, "resource", "resource");
			newRule.resource = RuleSet._wrapCondition(rule.resource);
		}
		if (rule.resourceQuery) newRule.resourceQuery = RuleSet._wrapCondition(rule.resourceQuery);
		if (rule.compiler) newRule.compiler = RuleSet._wrapCondition(rule.compiler);
		if (rule.issuer) newRule.issuer = RuleSet._wrapCondition(rule.issuer);
	}

	static _processLoader(rule, newRule, ident, refs, state) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string") {
			if (!rule.options && !rule.query) {
				RuleSet._ensureSingleSource(state, "use", "loader");
				newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
			} else {
				RuleSet._ensureSingleSource(state, "use", "loader + options/query");
				newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
			}
		} else if (loader) {
			if (rule.options || rule.query) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
			}
			RuleSet._ensureSingleSource(state, "use", "loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	static _processUse(rule, newRule, ident, state) {
		if (!rule.use) return;
		RuleSet._ensureSingleSource(state, "use", "use");
		newRule.use = RuleSet.normalizeUse(rule.use, ident);
	}

	static _processSubRules(rule, newRule, refs, ident) {
		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
	}

	static _copyExtraProperties(source, target) {
		const ignored = [
			"resource", "resourceQuery", "compiler", "test", "include", "exclude",
			"issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"
		];
		Object.keys(source)
			.filter(k => !ignored.includes(k))
			.forEach(k => (target[k] = source[k]));
	}

	static _collectRefs(rule, refs) {
		if (Array.isArray(rule.use)) {
			rule.use.forEach(item => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
	}

	static _ensureSingleSource(state, type, source) {
		const key = type === "use" ? "useSource" : "resourceSource";
		if (state[key] && state[key] !== source) {
			throw new Error(RuleSet.buildErrorMessage(state, new Error(`Rule can only have one ${type} source (provided ${source} and ${state[key]})`)));
		}
		state[key] = source;
	}

	static _wrapCondition(condition) {
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (e) {
			throw new Error(RuleSet.buildErrorMessage(condition, e));
		}
	}

	/* ---------- Execution ---------- */
	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!RuleSet._matchConditions(data, rule)) return false;
		RuleSet._applyRule(rule, result, data);
		RuleSet._runSubRules(data, rule, result);
		return true;
	}

	static _matchConditions(data, rule) {
		if (rule.resource && !data.resource) return false;
		if (rule.resourceQuery && !data.resourceQuery) return false;
		if (rule.compiler && !data.compiler) return false;
		if (rule.issuer && !data.issuer) return false;
		if (rule.resource && !rule.resource(data.resource)) return false;
		if (rule.issuer && data.issuer && !rule.issuer(data.issuer)) return false;
		if (rule.resourceQuery && data.resourceQuery && !rule.resourceQuery(data.resourceQuery)) return false;
		if (rule.compiler && data.compiler && !rule.compiler(data.compiler)) return false;
		return true;
	}

	static _applyRule(rule, result, data) {
		const ignored = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		Object.keys(rule)
			.filter(k => !ignored.includes(k))
			.forEach(k => result.push({ type: k, value: rule[k] }));

		if (rule.use) {
			rule.use.forEach(use => {
				const value = typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use;
				result.push({ type: "use", value, enforce: rule.enforce });
			});
		}
	}

	static _runSubRules(data, rule, result) {
		if (rule.rules) {
			rule.rules.forEach(r => this.prototype._run(data, r, result));
		}
		if (rule.oneOf) {
			for (const r of rule.oneOf) {
				if (this.prototype._run(data, r, result)) break;
			}
		}
	}

	/* ---------- Helpers ---------- */
	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}

	static buildErrorMessage(condition, error) {
		const txt = JSON.stringify(condition, (k, v) => (v === undefined ? "undefined" : v), 2);
		return `${error.message} in ${txt}`;
	}

	static normalizeUse(use, ident) {
		if (Array.isArray(use)) {
			return use
				.map((item, i) => RuleSet.normalizeUse(item, `${ident}-${i}`))
				.reduce((a, b) => a.concat(b), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItemFunction(use, data) {
		const res = use(data);
		return typeof res === "string" ? RuleSet.normalizeUseItemString(res) : res;
	}

	static normalizeUseItemString(str) {
		const idx = str.indexOf("?");
		if (idx >= 0) {
			return { loader: str.slice(0, idx), options: str.slice(idx + 1) };
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

	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return s => s.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
		if (typeof condition !== "object") throw new Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);

		const matchers = [];
		for (const key of Object.keys(condition)) {
			const value = condition[key];
			if (!value) continue;
			switch (key) {
				case "or":
				case "include":
				case "test":
					matchers.push(RuleSet.normalizeCondition(value));
					break;
				case "and":
					matchers.push(andMatcher(value.map(c => RuleSet.normalizeCondition(c))));
					break;
				case "not":
				case "exclude":
					matchers.push(notMatcher(RuleSet.normalizeCondition(value)));
					break;
				default:
					throw new Error(`Unexpected property ${key} in condition`);
			}
		}
		if (matchers.length === 0) throw new Error(`Expected condition but got ${condition}`);
		return matchers.length === 1 ? matchers[0] : andMatcher(matchers);
	}
};

/* ---------- Matcher utilities ---------- */
function notMatcher(matcher) {
	return s => !matcher(s);
}
function orMatcher(items) {
	return s => items.some(m => m(s));
}
function andMatcher(items) {
	return s => items.every(m => m(s));
}
```
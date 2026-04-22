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

	/* ---------- Normalization entry points ---------- */
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
		RuleSet._assertRuleObject(rule);
		const newRule = {};

		RuleSet._processResource(rule, newRule);
		RuleSet._processLoader(rule, newRule, ident);
		RuleSet._processUse(rule, newRule, ident);
		RuleSet._processNested(rule, newRule, refs, ident);
		RuleSet._copyExtraProperties(rule, newRule);

		RuleSet._collectReferences(newRule, refs);
		return newRule;
	}

	/* ---------- Validation helpers ---------- */
	static _assertRuleObject(rule) {
		if (typeof rule === "string") {
			throw new Error("String rules must be handled before calling normalizeRule");
		}
		if (!rule) {
			throw new Error("Unexpected null when object was expected as rule");
		}
		if (typeof rule !== "object") {
			throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);
		}
	}

	/* ---------- Resource handling ---------- */
	static _processResource(rule, newRule) {
		const resourceSources = [
			{ keys: ["test", "include", "exclude"], source: "test + include + exclude" },
			{ keys: ["resource"], source: "resource" }
		];
		for (const src of resourceSources) {
			if (src.keys.some(k => k in rule)) {
				RuleSet._ensureSingleResourceSource(src.source);
				const condition = RuleSet._buildConditionObject(rule, src.keys);
				newRule.resource = RuleSet._normalizeConditionWrapper(condition);
				break;
			}
		}
		["resourceQuery", "compiler", "issuer"].forEach(key => {
			if (rule[key]) {
				newRule[key] = RuleSet._normalizeConditionWrapper(rule[key]);
			}
		});
	}

	static _ensureSingleResourceSource(newSource) {
		if (RuleSet._resourceSource && RuleSet._resourceSource !== newSource) {
			throw new Error(`Rule can only have one resource source (provided ${newSource} and ${RuleSet._resourceSource})`);
		}
		RuleSet._resourceSource = newSource;
	}

	static _buildConditionObject(rule, keys) {
		const condition = {};
		keys.forEach(k => {
			if (k in rule) condition[k] = rule[k];
		});
		return condition;
	}

	static _normalizeConditionWrapper(condition) {
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (e) {
			throw new Error(RuleSet.buildErrorMessage(condition, e));
		}
	}

	/* ---------- Loader / Use handling ---------- */
	static _processLoader(rule, newRule, ident) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string") {
			RuleSet._handleStringLoader(rule, loader, newRule, ident);
		} else if (loader) {
			RuleSet._handleObjectLoader(rule, loader, newRule, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	static _handleStringLoader(rule, loader, newRule, ident) {
		if (!rule.options && !rule.query) {
			RuleSet._ensureSingleUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else {
			RuleSet._ensureSingleUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
		}
	}

	static _handleObjectLoader(rule, loader, newRule, ident) {
		if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		}
		RuleSet._ensureSingleUseSource("loaders");
		newRule.use = RuleSet.normalizeUse(loader, ident);
	}

	static _ensureSingleUseSource(newSource) {
		if (RuleSet._useSource && RuleSet._useSource !== newSource) {
			throw new Error(`Rule can only have one result source (provided ${newSource} and ${RuleSet._useSource})`);
		}
		RuleSet._useSource = newSource;
	}

	static _processUse(rule, newRule, ident) {
		if (rule.use) {
			RuleSet._ensureSingleUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	/* ---------- Nested rules handling ---------- */
	static _processNested(rule, newRule, refs, ident) {
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}
		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}
	}

	/* ---------- Extra properties copying ---------- */
	static _copyExtraProperties(source, target) {
		const ignored = [
			"resource", "resourceQuery", "compiler", "test", "include", "exclude",
			"issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"
		];
		Object.keys(source)
			.filter(k => ignored.indexOf(k) < 0)
			.forEach(k => {
				target[k] = source[k];
			});
	}

	/* ---------- Reference collection ---------- */
	static _collectReferences(rule, refs) {
		if (Array.isArray(rule.use)) {
			rule.use.forEach(item => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
	}

	/* ---------- Error handling ---------- */
	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => (value === undefined ? "undefined" : value), 2);
		return `${error.message} in ${conditionAsText}`;
	}

	/* ---------- Use normalization ---------- */
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
			.filter(k => ["options", "query"].indexOf(k) < 0)
			.forEach(k => {
				newItem[k] = item[k];
			});
		return newItem;
	}

	/* ---------- Condition normalization ---------- */
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
		if (!RuleSet._checkConditions(data, rule)) return false;
		RuleSet._applyRule(rule, data, result);
		RuleSet._runNestedRules(data, rule, result);
		return true;
	}

	/* ---------- Condition checks ---------- */
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

	/* ---------- Rule application ---------- */
	static _applyRule(rule, data, result) {
		const ignored = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		Object.keys(rule)
			.filter(k => ignored.indexOf(k) < 0)
			.forEach(k => {
				result.push({ type: k, value: rule[k] });
			});

		if (rule.use) {
			rule.use.forEach(use => {
				const value = typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use;
				result.push({ type: "use", value, enforce: rule.enforce });
			});
		}
	}

	/* ---------- Nested rule execution ---------- */
	static _runNestedRules(data, rule, result) {
		if (rule.rules) {
			rule.rules.forEach(r => RuleSet.prototype._run(data, r, result));
		}
		if (rule.oneOf) {
			for (let i = 0; i < rule.oneOf.length; i++) {
				if (RuleSet.prototype._run(data, rule.oneOf[i], result)) break;
			}
		}
	}

	/* ---------- Option lookup ---------- */
	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

/* ---------- Matcher utilities ---------- */
function notMatcher(matcher) {
	return str => !matcher(str);
}
function orMatcher(items) {
	return str => {
		for (let i = 0; i < items.length; i++) {
			if (items[i](str)) return true;
		}
		return false;
	};
}
function andMatcher(items) {
	return str => {
		for (let i = 0; i < items.length; i++) {
			if (!items[i](str)) return false;
		}
		return true;
	};
}
```
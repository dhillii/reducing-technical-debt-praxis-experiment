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
		let useSource;
		let resourceSource;

		/*** resource handling ***/
		if (rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			newRule.resource = RuleSet._wrapCondition({ test: rule.test, include: rule.include, exclude: rule.exclude });
		}
		if (rule.resource) {
			checkResourceSource("resource");
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
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			checkUseSource("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
		if (rule.use) {
			checkUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}

		/*** nested rules ***/
		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		/*** copy unknown keys ***/
		Object.keys(rule)
			.filter(k => !["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].includes(k))
			.forEach(k => (newRule[k] = rule[k]));

		/*** reference collection ***/
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
		return newRule;

		/*** helpers ***/
		function checkUseSource(src) {
			if (useSource && useSource !== src) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${src} and ${useSource})`)));
			}
			useSource = src;
		}
		function checkResourceSource(src) {
			if (resourceSource && resourceSource !== src) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one resource source (provided ${src} and ${resourceSource})`)));
			}
			resourceSource = src;
		}
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

	/* ---------- use normalization ---------- */

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
			return { loader: str.substring(0, idx), options: str.substring(idx + 1) };
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
			.filter(k => !["options", "query"].includes(k))
			.forEach(k => (newItem[k] = item[k]));
		return newItem;
	}

	/* ---------- condition normalization ---------- */

	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return str => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
		if (typeof condition !== "object") throw Error(`Unexcepted ${typeof condition} when condition was expected (${condition})`);

		const handlers = {
			or: (v) => v && matchers.push(RuleSet.normalizeCondition(v)),
			include: (v) => v && matchers.push(RuleSet.normalizeCondition(v)),
			test: (v) => v && matchers.push(RuleSet.normalizeCondition(v)),
			and: (v) => v && matchers.push(andMatcher(v.map(c => RuleSet.normalizeCondition(c)))),
			not: (v) => v && matchers.push(notMatcher(RuleSet.normalizeCondition(v))),
			exclude: (v) => v && matchers.push(notMatcher(RuleSet.normalizeCondition(v)))
		};

		const matchers = [];
		Object.keys(condition).forEach(key => {
			const handler = handlers[key];
			if (!handler) throw new Error(`Unexcepted property ${key} in condition`);
			handler(condition[key]);
		});

		if (matchers.length === 0) throw new Error(`Excepted condition but got ${condition}`);
		if (matchers.length === 1) return matchers[0];
		return andMatcher(matchers);
	}

	/* ---------- execution ---------- */

	/**
	 * Execute the rule set against a data object.
	 * @param {Object} data
	 * @returns {Array}
	 */
	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	/**
	 * Internal recursive runner.
	 * @private
	 */
	_run(data, rule, result) {
		if (!this._checkConditions(data, rule)) return false;
		this._applyRule(rule, result, data);
		this._runNestedRules(data, rule, result);
		this._runOneOf(data, rule, result);
		return true;
	}

	/**
	 * Verify all condition predicates.
	 * @private
	 */
	_checkConditions(data, rule) {
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

	/**
	 * Push rule properties (excluding known keys) to result.
	 * @private
	 */
	_applyRule(rule, result, data) {
		const excluded = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		Object.keys(rule)
			.filter(k => !excluded.includes(k))
			.forEach(k => result.push({ type: k, value: rule[k] }));

		if (rule.use) {
			rule.use.forEach(use => {
				const value = typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use;
				result.push({ type: "use", value, enforce: rule.enforce });
			});
		}
	}

	/**
	 * Recursively process `rules` array.
	 * @private
	 */
	_runNestedRules(data, rule, result) {
		if (!rule.rules) return;
		for (const sub of rule.rules) {
			this._run(data, sub, result);
		}
	}

	/**
	 * Process `oneOf` array – stop after first match.
	 * @private
	 */
	_runOneOf(data, rule, result) {
		if (!rule.oneOf) return;
		for (const sub of rule.oneOf) {
			if (this._run(data, sub, result)) break;
		}
	}

	/* ---------- lookup helpers ---------- */

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

/* ---------- matcher utilities ---------- */

/**
 * Negates a matcher.
 * @param {Function} matcher
 * @returns {Function}
 */
function notMatcher(matcher) {
	return str => !matcher(str);
}

/**
 * Returns true if any matcher returns true.
 * @param {Function[]} items
 * @returns {Function}
 */
function orMatcher(items) {
	return str => {
		for (let i = 0; i < items.length; i++) {
			if (items[i](str)) return true;
		}
		return false;
	};
}

/**
 * Returns true only if all matchers return true.
 * @param {Function[]} items
 * @returns {Function}
 */
function andMatcher(items) {
	return str => {
		for (let i = 0; i < items.length; i++) {
			if (!items[i](str)) return false;
		}
		return true;
	};
}
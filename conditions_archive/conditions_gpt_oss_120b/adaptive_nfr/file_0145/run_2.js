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
		if (typeof rule === "string")
			return { use: [{ loader: rule }] };
		if (!rule) throw new Error("Unexcepted null when object was expected as rule");
		if (typeof rule !== "object")
			throw new Error(`Unexcepted ${typeof rule} when object was expected as rule (${rule})`);

		const newRule = {};
		let useSource;
		let resourceSource;

		// ----- resource handling -----
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

		// ----- loader / use handling -----
		if (rule.loader && rule.loaders)
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));

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

		// ----- nested rules -----
		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		// ----- copy unknown keys -----
		Object.keys(rule)
			.filter(k => !["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].includes(k))
			.forEach(k => (newRule[k] = rule[k]));

		// ----- reference collection -----
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
		return newRule;

		/*** helpers ***/
		function checkUseSource(newSource) {
			if (useSource && useSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${newSource} and ${useSource})`)));
			useSource = newSource;
		}
		function checkResourceSource(newSource) {
			if (resourceSource && resourceSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one resource source (provided ${newSource} and ${resourceSource})`)));
			resourceSource = newSource;
		}
	}

	static _wrapCondition(condition) {
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (error) {
			throw new Error(RuleSet.buildErrorMessage(condition, error));
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

	/* ---------- use normalization ---------- */

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

		return RuleSet._processObjectCondition(condition);
	}

	/*** object condition processing ***/
	static _processObjectCondition(condition) {
		const matchers = [];
		Object.keys(condition).forEach(key => {
			const handler = conditionHandlerMap[key];
			if (!handler) throw new Error(`Unexcepted property ${key} in condition`);
			const matcher = handler(condition[key]);
			if (matcher) matchers.push(matcher);
		});
		if (matchers.length === 0) throw new Error(`Excepted condition but got ${condition}`);
		if (matchers.length === 1) return matchers[0];
		return andMatcher(matchers);
	}

	/* ---------- execution ---------- */

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!RuleSet._checkConditions(rule, data)) return false;
		RuleSet._applyRule(rule, data, result);
		RuleSet._runSubRules(this, data, rule, result);
		RuleSet._runOneOf(this, data, rule, result);
		return true;
	}

	/* ---------- helper methods (static) ---------- */

	/*** condition checks ***/
	static _checkConditions(rule, data) {
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

	/*** rule application ***/
	static _applyRule(rule, data, result) {
		const ignored = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		Object.keys(rule)
			.filter(k => !ignored.includes(k))
			.forEach(k => result.push({ type: k, value: rule[k] }));

		if (rule.use) {
			rule.use.forEach(use => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
					enforce: rule.enforce
				});
			});
		}
	}

	/*** sub‑rule handling ***/
	static _runSubRules(self, data, rule, result) {
		if (!rule.rules) return;
		for (let i = 0; i < rule.rules.length; i++) {
			self._run(data, rule.rules[i], result);
		}
	}

	/*** oneOf handling ***/
	static _runOneOf(self, data, rule, result) {
		if (!rule.oneOf) return;
		for (let i = 0; i < rule.oneOf.length; i++) {
			if (self._run(data, rule.oneOf[i], result)) break;
		}
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

/* ---------- matcher utilities ---------- */

/**
 * Returns a matcher that negates the result of the given matcher.
 * @param {Function} matcher
 * @returns {Function}
 */
function notMatcher(matcher) {
	return str => !matcher(str);
}

/**
 * Returns a matcher that succeeds when any of the provided matchers succeed.
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
 * Returns a matcher that succeeds only when all of the provided matchers succeed.
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

/* ---------- condition handler map ---------- */

const conditionHandlerMap = {
	or: value => (value ? orMatcher(value.map(c => RuleSet.normalizeCondition(c))) : null),
	include: value => (value ? RuleSet.normalizeCondition(value) : null),
	test: value => (value ? RuleSet.normalizeCondition(value) : null),
	and: value => (value ? andMatcher(value.map(c => RuleSet.normalizeCondition(c))) : null),
	not: value => (value ? notMatcher(RuleSet.normalizeCondition(value)) : null),
	exclude: value => (value ? notMatcher(RuleSet.normalizeCondition(value)) : null)
};
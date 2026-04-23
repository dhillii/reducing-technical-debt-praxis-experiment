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

	/* --------------------------------------------------------------------- */
	/* Normalization entry points                                            */
	/* --------------------------------------------------------------------- */

	static normalizeRules(rules, refs, ident) {
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
		}
		if (rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		}
		return [];
	}

	/* --------------------------------------------------------------------- */
	/* Rule normalization                                                    */
	/* --------------------------------------------------------------------- */

	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}
		if (!rule) throw new Error("Unexcepted null when object was expected as rule");
		if (typeof rule !== "object") throw new Error(`Unexcepted ${typeof rule} when object was expected as rule (${rule})`);

		const newRule = {};
		let useSource = null;
		let resourceSource = null;

		RuleSet._processResourceConditions(rule, newRule, () => {
			RuleSet._ensureSingleSource("resource", resourceSource, "test + include + exclude");
			resourceSource = "test + include + exclude";
		});

		RuleSet._processLoader(rule, newRule, ident, () => {
			RuleSet._ensureSingleSource("use", useSource, "loader");
			useSource = "loader";
		});

		RuleSet._processUse(rule, newRule, ident, () => {
			RuleSet._ensureSingleSource("use", useSource, "use");
			useSource = "use";
		});

		RuleSet._processNestedRules(rule, newRule, refs, ident);
		RuleSet._copyExtraProperties(rule, newRule);

		RuleSet._collectReferenceOptions(newRule, refs);
		return newRule;
	}

	/* --------------------------------------------------------------------- */
	/* Helper: ensure only one source for a given type                        */
	/* --------------------------------------------------------------------- */

	static _ensureSingleSource(type, currentSource, newSource) {
		if (currentSource && currentSource !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error(`${type} can only have one result source (provided ${newSource} and ${currentSource})`)));
		}
	}

	/* --------------------------------------------------------------------- */
	/* Helper: process resource related fields                                 */
	/* --------------------------------------------------------------------- */

	static _processResourceConditions(rule, newRule, setSource) {
		if (rule.test || rule.include || rule.exclude) {
			setSource();
			const condition = { test: rule.test, include: rule.include, exclude: rule.exclude };
			try {
				newRule.resource = RuleSet.normalizeCondition(condition);
			} catch (e) {
				throw new Error(RuleSet.buildErrorMessage(condition, e));
			}
		}
		if (rule.resource) {
			setSource();
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch (e) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, e));
			}
		}
		if (rule.resourceQuery) {
			try {
				newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
			} catch (e) {
				throw new Error(RuleSet.buildErrorMessage(rule.resourceQuery, e));
			}
		}
		if (rule.compiler) {
			try {
				newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
			} catch (e) {
				throw new Error(RuleSet.buildErrorMessage(rule.compiler, e));
			}
		}
		if (rule.issuer) {
			try {
				newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
			} catch (e) {
				throw new Error(RuleSet.buildErrorMessage(rule.issuer, e));
			}
		}
	}

	/* --------------------------------------------------------------------- */
	/* Helper: process loader / loaders fields                                 */
	/* --------------------------------------------------------------------- */

	static _processLoader(rule, newRule, ident, setSource) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string" && !rule.options && !rule.query) {
			setSource();
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			setSource();
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			setSource();
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	/* --------------------------------------------------------------------- */
	/* Helper: process explicit use field                                      */
	/* --------------------------------------------------------------------- */

	static _processUse(rule, newRule, ident, setSource) {
		if (rule.use) {
			setSource();
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	/* --------------------------------------------------------------------- */
	/* Helper: process nested rules / oneOf                                    */
	/* --------------------------------------------------------------------- */

	static _processNestedRules(rule, newRule, refs, ident) {
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}
		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}
	}

	/* --------------------------------------------------------------------- */
	/* Helper: copy unknown properties                                        */
	/* --------------------------------------------------------------------- */

	static _copyExtraProperties(source, target) {
		const allowed = [
			"resource", "resourceQuery", "compiler", "test", "include", "exclude",
			"issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"
		];
		Object.keys(source)
			.filter(k => allowed.indexOf(k) < 0)
			.forEach(k => { target[k] = source[k]; });
	}

	/* --------------------------------------------------------------------- */
	/* Helper: collect reference options from use items                         */
	/* --------------------------------------------------------------------- */

	static _collectReferenceOptions(rule, refs) {
		if (Array.isArray(rule.use)) {
			rule.use.forEach(item => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
	}

	/* --------------------------------------------------------------------- */
	/* Error message builder                                                  */
	/* --------------------------------------------------------------------- */

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => (value === undefined ? "undefined" : value), 2);
		return `${error.message} in ${conditionAsText}`;
	}

	/* --------------------------------------------------------------------- */
	/* Use normalization                                                     */
	/* --------------------------------------------------------------------- */

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

		const newItem = {};
		newItem.options = item.options || item.query;

		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}

		Object.keys(item)
			.filter(k => ["options", "query"].indexOf(k) < 0)
			.forEach(k => { newItem[k] = item[k]; });

		return newItem;
	}

	/* --------------------------------------------------------------------- */
	/* Condition normalization                                               */
	/* --------------------------------------------------------------------- */

	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return str => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
		if (typeof condition !== "object") throw Error(`Unexcepted ${typeof condition} when condition was expected (${condition})`);

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
					throw new Error(`Unexcepted property ${key} in condition`);
			}
		});
		if (matchers.length === 0) throw new Error(`Excepted condition but got ${condition}`);
		if (matchers.length === 1) return matchers[0];
		return andMatcher(matchers);
	}

	/* --------------------------------------------------------------------- */
	/* Execution API                                                         */
	/* --------------------------------------------------------------------- */

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!RuleSet._checkConditions(data, rule)) return false;

		RuleSet._collectResultProperties(rule, result);
		RuleSet._processUseItems(rule, data, result);
		RuleSet._processNestedRulesExecution(data, rule, result);
		RuleSet._processOneOfExecution(data, rule, result);

		return true;
	}

	/* --------------------------------------------------------------------- */
	/* Helper: condition checks                                               */
	/* --------------------------------------------------------------------- */

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

	/* --------------------------------------------------------------------- */
	/* Helper: collect non‑rule properties into result                         */
	/* --------------------------------------------------------------------- */

	static _collectResultProperties(rule, result) {
		const keys = Object.keys(rule).filter(k => ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(k) < 0);
		keys.forEach(k => {
			result.push({ type: k, value: rule[k] });
		});
	}

	/* --------------------------------------------------------------------- */
	/* Helper: process use items                                               */
	/* --------------------------------------------------------------------- */

	static _processUseItems(rule, data, result) {
		if (!rule.use) return;
		rule.use.forEach(use => {
			result.push({
				type: "use",
				value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
				enforce: rule.enforce
			});
		});
	}

	/* --------------------------------------------------------------------- */
	/* Helper: process nested rules                                            */
	/* --------------------------------------------------------------------- */

	static _processNestedRulesExecution(data, rule, result) {
		if (!rule.rules) return;
		for (let i = 0; i < rule.rules.length; i++) {
			this.prototype._run(data, rule.rules[i], result);
		}
	}

	/* --------------------------------------------------------------------- */
	/* Helper: process oneOf rules                                             */
	/* --------------------------------------------------------------------- */

	static _processOneOfExecution(data, rule, result) {
		if (!rule.oneOf) return;
		for (let i = 0; i < rule.oneOf.length; i++) {
			if (this.prototype._run(data, rule.oneOf[i], result)) break;
		}
	}

	/* --------------------------------------------------------------------- */
	/* API: find options by ident                                            */
	/* --------------------------------------------------------------------- */

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

/* ------------------------------------------------------------------------- */
/* Matcher utilities                                                         */
/* ------------------------------------------------------------------------- */

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
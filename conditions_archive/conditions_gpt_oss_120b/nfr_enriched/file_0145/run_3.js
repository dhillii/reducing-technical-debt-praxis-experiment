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

	static normalizeRule(rule, refs, ident) {
		RuleSet._assertRuleObject(rule);
		const newRule = {};

		RuleSet._processResourceConditions(rule, newRule);
		RuleSet._processLoader(rule, newRule, ident);
		RuleSet._processUse(rule, newRule, ident);
		RuleSet._processNested(rule, newRule, refs, ident);
		RuleSet._copyExtraProperties(rule, newRule);

		RuleSet._collectReferenceOptions(newRule, refs);
		return newRule;
	}

	/* --------------------------------------------------------------------- */
	/* Helper methods for normalizeRule                                      */
	/* --------------------------------------------------------------------- */

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

	static _processResourceConditions(rule, newRule) {
		if (rule.test || rule.include || rule.exclude) {
			RuleSet._ensureSingleResourceSource("test + include + exclude");
			newRule.resource = RuleSet._wrapCondition(
				{ test: rule.test, include: rule.include, exclude: rule.exclude },
				"resource"
			);
		}
		if (rule.resource) {
			RuleSet._ensureSingleResourceSource("resource");
			newRule.resource = RuleSet._wrapCondition(rule.resource, "resource");
		}
		if (rule.resourceQuery) {
			newRule.resourceQuery = RuleSet._wrapCondition(rule.resourceQuery, "resourceQuery");
		}
		if (rule.compiler) {
			newRule.compiler = RuleSet._wrapCondition(rule.compiler, "compiler");
		}
		if (rule.issuer) {
			newRule.issuer = RuleSet._wrapCondition(rule.issuer, "issuer");
		}
	}

	static _wrapCondition(condition, source) {
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (error) {
			throw new Error(RuleSet.buildErrorMessage(condition, error));
		}
	}

	static _ensureSingleResourceSource(source) {
		if (RuleSet._currentResourceSource && RuleSet._currentResourceSource !== source) {
			throw new Error(
				RuleSet.buildErrorMessage(
					{},
					new Error(`Rule can only have one resource source (provided ${source} and ${RuleSet._currentResourceSource})`)
				)
			);
		}
		RuleSet._currentResourceSource = source;
	}

	static _processLoader(rule, newRule, ident) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string") {
			if (!rule.options && !rule.query) {
				RuleSet._ensureSingleUseSource("loader");
				newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
			} else {
				RuleSet._ensureSingleUseSource("loader + options/query");
				newRule.use = RuleSet.normalizeUse(
					{ loader, options: rule.options, query: rule.query },
					ident
				);
			}
		} else if (loader) {
			RuleSet._ensureSingleUseSource("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	static _processUse(rule, newRule, ident) {
		if (rule.use) {
			RuleSet._ensureSingleUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static _ensureSingleUseSource(source) {
		if (RuleSet._currentUseSource && RuleSet._currentUseSource !== source) {
			throw new Error(
				RuleSet.buildErrorMessage(
					{},
					new Error(`Rule can only have one result source (provided ${source} and ${RuleSet._currentUseSource})`)
				)
			);
		}
		RuleSet._currentUseSource = source;
	}

	static _processNested(rule, newRule, refs, ident) {
		if (rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}
		if (rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}
	}

	static _copyExtraProperties(rule, newRule) {
		const ignored = [
			"resource",
			"resourceQuery",
			"compiler",
			"test",
			"include",
			"exclude",
			"issuer",
			"loader",
			"options",
			"query",
			"loaders",
			"use",
			"rules",
			"oneOf"
		];
		Object.keys(rule)
			.filter(key => ignored.indexOf(key) < 0)
			.forEach(key => {
				newRule[key] = rule[key];
			});
	}

	static _collectReferenceOptions(newRule, refs) {
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if (item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}
	}

	/* --------------------------------------------------------------------- */
	/* Error handling                                                       */
	/* --------------------------------------------------------------------- */

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(
			condition,
			(key, value) => (value === undefined ? "undefined" : value),
			2
		);
		return `${error.message} in ${conditionAsText}`;
	}

	/* --------------------------------------------------------------------- */
	/* Use normalization helpers                                            */
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

	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if (idx >= 0) {
			return {
				loader: useItemString.substr(0, idx),
				options: useItemString.substr(idx + 1)
			};
		}
		return { loader: useItemString };
	}

	static normalizeUseItem(item, ident) {
		if (typeof item === "function") return item;
		if (typeof item === "string") return RuleSet.normalizeUseItemString(item);

		if (item.options && item.query) {
			throw new Error("Provided options and query in use");
		}
		if (!item.loader) {
			throw new Error("No loader specified");
		}

		const newItem = {
			options: item.options || item.query
		};

		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}

		Object.keys(item)
			.filter(key => ["options", "query"].indexOf(key) < 0)
			.forEach(key => {
				newItem[key] = item[key];
			});

		return newItem;
	}

	/* --------------------------------------------------------------------- */
	/* Condition normalization                                              */
	/* --------------------------------------------------------------------- */

	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return str => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return RuleSet._orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
		if (typeof condition !== "object") throw Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);

		const matchers = RuleSet._buildObjectMatchers(condition);
		if (matchers.length === 0) throw new Error(`Expected condition but got ${condition}`);
		if (matchers.length === 1) return matchers[0];
		return RuleSet._andMatcher(matchers);
	}

	static _buildObjectMatchers(obj) {
		const matchers = [];
		Object.keys(obj).forEach(key => {
			const value = obj[key];
			switch (key) {
				case "or":
				case "include":
				case "test":
					if (value) matchers.push(RuleSet.normalizeCondition(value));
					break;
				case "and":
					if (value) matchers.push(RuleSet._andMatcher(value.map(c => RuleSet.normalizeCondition(c))));
					break;
				case "not":
				case "exclude":
					if (value) matchers.push(RuleSet._notMatcher(RuleSet.normalizeCondition(value)));
					break;
				default:
					throw new Error(`Unexpected property ${key} in condition`);
			}
		});
		return matchers;
	}

	static _notMatcher(matcher) {
		return str => !matcher(str);
	}
	static _orMatcher(items) {
		return str => {
			for (let i = 0; i < items.length; i++) {
				if (items[i](str)) return true;
			}
			return false;
		};
	}
	static _andMatcher(items) {
		return str => {
			for (let i = 0; i < items.length; i++) {
				if (!items[i](str)) return false;
			}
			return true;
		};
	}

	/* --------------------------------------------------------------------- */
	/* Execution                                                            */
	/* --------------------------------------------------------------------- */

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!RuleSet._passesConditions(data, rule)) return false;

		RuleSet._applyRuleProperties(rule, result);
		RuleSet._applyUseItems(rule, data, result);
		RuleSet._runNestedRules(data, rule, result);
		RuleSet._runOneOf(data, rule, result);

		return true;
	}

	/* --------------------------------------------------------------------- */
	/* Helper methods for execution                                          */
	/* --------------------------------------------------------------------- */

	static _passesConditions(data, rule) {
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

	static _applyRuleProperties(rule, result) {
		Object.keys(rule)
			.filter(key => ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) < 0)
			.forEach(key => {
				result.push({ type: key, value: rule[key] });
			});
	}

	static _applyUseItems(rule, data, result) {
		if (!rule.use) return;
		rule.use.forEach(use => {
			result.push({
				type: "use",
				value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
				enforce: rule.enforce
			});
		});
	}

	static _runNestedRules(data, rule, result) {
		if (!rule.rules) return;
		for (let i = 0; i < rule.rules.length; i++) {
			this._run(data, rule.rules[i], result);
		}
	}

	static _runOneOf(data, rule, result) {
		if (!rule.oneOf) return;
		for (let i = 0; i < rule.oneOf.length; i++) {
			if (this._run(data, rule.oneOf[i], result)) break;
		}
	}

	/* --------------------------------------------------------------------- */
	/* Option lookup                                                        */
	/* --------------------------------------------------------------------- */

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

/* ------------------------------------------------------------------------- */
/* Stand‑alone matcher helpers (kept outside the class for clarity)          */
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
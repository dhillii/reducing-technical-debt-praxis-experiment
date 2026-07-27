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
			return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
		}
		if (rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		}
		return [];
	}

	/* ---------- public entry point ---------- */
	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}
		if (!rule) throw new Error("Unexcepted null when object was expected as rule");
		if (typeof rule !== "object") throw new Error(`Unexcepted ${typeof rule} when object was expected as rule (${rule})`);

		const newRule = {};
		const sourceState = { use: null, resource: null };

		RuleSet._processResourceConditions(rule, newRule, sourceState);
		RuleSet._processResource(rule, newRule, sourceState);
		RuleSet._processSimpleCondition(rule, newRule, "resourceQuery");
		RuleSet._processSimpleCondition(rule, newRule, "compiler");
		RuleSet._processSimpleCondition(rule, newRule, "issuer");

		RuleSet._processLoader(rule, newRule, sourceState, refs, ident);
		RuleSet._processUse(rule, newRule, sourceState, refs, ident);

		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		RuleSet._copyExtraProperties(rule, newRule);

		RuleSet._collectReferences(newRule, refs);
		return newRule;
	}

	/* ---------- helpers for normalizeRule ---------- */
	static _processResourceConditions(rule, newRule, sourceState) {
		if (rule.test || rule.include || rule.exclude) {
			RuleSet._ensureSingleSource(sourceState, "resource", "test + include + exclude", rule);
			const condition = { test: rule.test, include: rule.include, exclude: rule.exclude };
			try {
				newRule.resource = RuleSet.normalizeCondition(condition);
			} catch (e) {
				throw new Error(RuleSet.buildErrorMessage(condition, e));
			}
		}
	}

	static _processResource(rule, newRule, sourceState) {
		if (!rule.resource) return;
		RuleSet._ensureSingleSource(sourceState, "resource", "resource", rule);
		try {
			newRule.resource = RuleSet.normalizeCondition(rule.resource);
		} catch (e) {
			throw new Error(RuleSet.buildErrorMessage(rule.resource, e));
		}
	}

	static _processSimpleCondition(rule, newRule, key) {
		if (!rule[key]) return;
		try {
			newRule[key] = RuleSet.normalizeCondition(rule[key]);
		} catch (e) {
			throw new Error(RuleSet.buildErrorMessage(rule[key], e));
		}
	}

	static _processLoader(rule, newRule, sourceState, refs, ident) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string") {
			if (!rule.options && !rule.query) {
				RuleSet._ensureSingleSource(sourceState, "use", "loader", rule);
				newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
			} else {
				RuleSet._ensureSingleSource(sourceState, "use", "loader + options/query", rule);
				newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
			}
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			RuleSet._ensureSingleSource(sourceState, "use", "loaders", rule);
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	static _processUse(rule, newRule, sourceState, refs, ident) {
		if (!rule.use) return;
		RuleSet._ensureSingleSource(sourceState, "use", "use", rule);
		newRule.use = RuleSet.normalizeUse(rule.use, ident);
	}

	static _ensureSingleSource(state, type, newSource, rule) {
		if (state[type] && state[type] !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one ${type} source (provided ${newSource} and ${state[type]})`)));
		}
		state[type] = newSource;
	}

	static _copyExtraProperties(source, target) {
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
		Object.keys(source)
			.filter(key => ignored.indexOf(key) < 0)
			.forEach(key => {
				target[key] = source[key];
			});
	}

	static _collectReferences(rule, refs) {
		if (!Array.isArray(rule.use)) return;
		rule.use.forEach(item => {
			if (item.ident) refs[item.ident] = item.options;
		});
	}

	/* ---------- error handling ---------- */
	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => (value === undefined ? "undefined" : value), 2);
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

		if (item.options && item.query) throw new Error("Provided options and query in use");
		if (!item.loader) throw new Error("No loader specified");

		const newItem = {};
		newItem.options = item.options || item.query;

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

	/* ---------- condition normalization ---------- */
	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return str => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) {
			const items = condition.map(c => RuleSet.normalizeCondition(c));
			return orMatcher(items);
		}
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
					if (value) {
						const items = value.map(c => RuleSet.normalizeCondition(c));
						matchers.push(andMatcher(items));
					}
					break;
				case "not":
				case "exclude":
					if (value) {
						const matcher = RuleSet.normalizeCondition(value);
						matchers.push(notMatcher(matcher));
					}
					break;
				default:
					throw new Error(`Unexcepted property ${key} in condition`);
			}
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
		// test conditions
		if (rule.resource && !data.resource) return false;
		if (rule.resourceQuery && !data.resourceQuery) return false;
		if (rule.compiler && !data.compiler) return false;
		if (rule.issuer && !data.issuer) return false;
		if (rule.resource && !rule.resource(data.resource)) return false;
		if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) return false;
		if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) return false;
		if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) return false;

		// apply
		Object.keys(rule)
			.filter(key => ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) < 0)
			.forEach(key => {
				result.push({ type: key, value: rule[key] });
			});

		if (rule.use) {
			rule.use.forEach(use => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
					enforce: rule.enforce
				});
			});
		}

		if (rule.rules) {
			for (let i = 0; i < rule.rules.length; i++) this._run(data, rule.rules[i], result);
		}

		if (rule.oneOf) {
			for (let i = 0; i < rule.oneOf.length; i++) {
				if (this._run(data, rule.oneOf[i], result)) break;
			}
		}

		return true;
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

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
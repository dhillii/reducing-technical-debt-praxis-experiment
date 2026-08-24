static normalizeRule(rule, refs, ident) {
		if(typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}
		if(!rule) {
			throw new Error("Unexcepted null when object was expected as rule");
		}
		if(typeof rule !== "object") {
			throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");
		}

		const newRule = {};
		let sourceCheck = {
			use: null,
			resource: null
		};

		RuleSet.applyConditionProps(rule, newRule);
		RuleSet.applyLoaderProps(rule, newRule, refs, ident, sourceCheck);
		RuleSet.applyNestedRules(rule, newRule, refs, ident);
		RuleSet.applyRemainingKeys(rule, newRule);

		RuleSet.validateUseSources(sourceCheck.use, rule, "Rule can only have one result source (provided %s and %s)");
		RuleSet.validateResourceSources(sourceCheck.resource, rule, "Rule can only have one resource source (provided %s and %s)");

		RuleSet.processUseIdents(newRule.use, refs);

		return newRule;
	}

	static applyConditionProps(rule, newRule) {
		if(rule.test || rule.include || rule.exclude) {
			RuleSet.checkResourceSource(rule, "test + include + exclude");
			const condition = { test: rule.test, include: rule.include, exclude: rule.exclude };
			newRule.resource = RuleSet.normalizeCondition(condition);
		}

		if(rule.resource) {
			RuleSet.checkResourceSource(rule, "resource");
			newRule.resource = RuleSet.normalizeCondition(rule.resource);
		}

		if(rule.resourceQuery) {
			newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
		}

		if(rule.compiler) {
			newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
		}

		if(rule.issuer) {
			newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
		}
	}

	static applyLoaderProps(rule, newRule, refs, ident, sourceCheck) {
		if(rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}

		const loader = rule.loaders || rule.loader;
		if(typeof loader === "string" && !rule.options && !rule.query) {
			RuleSet.checkUseSource(sourceCheck, "loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if(typeof loader === "string" && (rule.options || rule.query)) {
			RuleSet.checkUseSource(sourceCheck, "loader + options/query");
			newRule.use = RuleSet.normalizeUse({
				loader,
				options: rule.options,
				query: rule.query
			}, ident);
		} else if(loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if(loader) {
			RuleSet.checkUseSource(sourceCheck, "loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if(rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}

		if(rule.use) {
			RuleSet.checkUseSource(sourceCheck, "use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static applyNestedRules(rule, newRule, refs, ident) {
		if(rule.rules) {
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		}
		if(rule.oneOf) {
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
		}
	}

	static applyRemainingKeys(rule, newRule) {
		const filterKeys = ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"];
		Object.keys(rule)
			.filter(key => filterKeys.indexOf(key) < 0)
			.forEach(key => {
				newRule[key] = rule[key];
			});
	}

	static normalizeUse(use, ident) {
		if(Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((arr, items) => arr.concat(items), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItem(item, ident) {
		if(typeof item === "function") return item;

		if(typeof item === "string") {
			return RuleSet.normalizeUseItemString(item);
		}

		const newItem = {};
		if(item.options && item.query) {
			throw new Error("Provided options and query in use");
		}
		if(!item.loader) {
			throw new Error("No loader specified");
		}

		newItem.options = item.options || item.query;

		if(typeof newItem.options === "object" && newItem.options) {
			if(newItem.options.ident) {
				newItem.ident = newItem.options.ident;
			} else {
				newItem.ident = ident;
			}
		}

		Object.keys(item)
			.filter(key => ["options", "query"].indexOf(key) < 0)
			.forEach(key => {
				newItem[key] = item[key];
			});

		return newItem;
	}

	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if(idx >= 0) {
			return {
				loader: useItemString.substr(0, idx),
				options: useItemString.substr(idx + 1)
			};
		}
		return { loader: useItemString };
	}

	static processUseIdents(useArray, refs) {
		if(!Array.isArray(useArray)) return;

		useArray.forEach(item => {
			if(item && item.ident) {
				refs[item.ident] = item.options;
			}
		});
	}

	static checkUseSource(sourceCheck, newSource) {
		RuleSet.validateUseSources(sourceCheck, newSource);
		sourceCheck.use = newSource;
	}

	static checkResourceSource(rule, newSource) {
		RuleSet.validateResourceSources(rule, newSource);
	}

	static validateUseSources(current, newSource, format = "Rule can only have one result source (provided %s and %s)") {
		if(current && current !== newSource) {
			throw new Error(RuleSet.buildErrorMessage({ use: true }, new Error(format.replace("%s", newSource).replace("%s", current))));
		}
	}

	static validateResourceSources(current, newSource, format = "Rule can only have one resource source (provided %s and %s)") {
		if(current && current !== newSource) {
			throw new Error(RuleSet.buildErrorMessage({ resource: true }, new Error(format.replace("%s", newSource).replace("%s", current))));
		}
	}
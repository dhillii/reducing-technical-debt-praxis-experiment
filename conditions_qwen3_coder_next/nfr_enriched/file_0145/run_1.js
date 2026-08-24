static normalizeRule(rule, refs, ident) {
	if(typeof rule === "string")
		return {
			use: [{
				loader: rule
			}]
		};
	if(!rule)
		throw new Error("Unexcepted null when object was expected as rule");
	if(typeof rule !== "object")
		throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");

	const newRule = {};
	const sources = {
		use: null,
		resource: null
	};

	RuleSet.applyConditionRules(rule, newRule, sources, ident, refs);
	RuleSet.applyLoaderRules(rule, newRule, sources, ident);
	RuleSet.applyAdditionalRuleProperties(rule, newRule, ident);
	RuleSet.applyLoaderUsageValidation(rule, sources);
	RuleSet.normalizeUseReferences(newRule, refs);

	return newRule;
}

static applyConditionRules(rule, newRule, sources, ident, refs) {
	if(rule.test || rule.include || rule.exclude) {
		RuleSet.checkSourceConflict(sources, "resource", "test + include + exclude");
		try {
			newRule.resource = RuleSet.normalizeCondition({
				test: rule.test,
				include: rule.include,
				exclude: rule.exclude
			});
		} catch(error) {
			throw new Error(RuleSet.buildErrorMessage({
				test: rule.test,
				include: rule.include,
				exclude: rule.exclude
			}, error));
		}
	}

	if(rule.resource) {
		RuleSet.checkSourceConflict(sources, "resource", "resource");
		try {
			newRule.resource = RuleSet.normalizeCondition(rule.resource);
		} catch(error) {
			throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
		}
	}

	if(rule.resourceQuery) {
		try {
			newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
		} catch(error) {
			throw new Error(RuleSet.buildErrorMessage(rule.resourceQuery, error));
		}
	}

	if(rule.compiler) {
		try {
			newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
		} catch(error) {
			throw new Error(RuleSet.buildErrorMessage(rule.compiler, error));
		}
	}

	if(rule.issuer) {
		try {
			newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
		} catch(error) {
			throw new Error(RuleSet.buildErrorMessage(rule.issuer, error));
		}
	}
}

static applyLoaderRules(rule, newRule, sources, ident) {
	if(rule.loader && rule.loaders)
		throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));

	const loader = rule.loaders || rule.loader;
	if(typeof loader === "string" && !rule.options && !rule.query) {
		RuleSet.checkSourceConflict(sources, "use", "loader");
		newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
	} else if(typeof loader === "string" && (rule.options || rule.query)) {
		RuleSet.checkSourceConflict(sources, "use", "loader + options/query");
		newRule.use = RuleSet.normalizeUse({
			loader: loader,
			options: rule.options,
			query: rule.query
		}, ident);
	} else if(loader && (rule.options || rule.query)) {
		throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
	} else if(loader) {
		RuleSet.checkSourceConflict(sources, "use", "loaders");
		newRule.use = RuleSet.normalizeUse(loader, ident);
	} else if(rule.options || rule.query) {
		throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
	}

	if(rule.use) {
		RuleSet.checkSourceConflict(sources, "use", "use");
		newRule.use = RuleSet.normalizeUse(rule.use, ident);
	}
}

static applyAdditionalRuleProperties(rule, newRule, ident) {
	if(rule.rules)
		newRule.rules = RuleSet.normalizeRules(rule.rules, this.references, `${ident}-rules`);

	if(rule.oneOf)
		newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, this.references, `${ident}-oneOf`);

	const keys = Object.keys(rule).filter((key) => {
		return ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) < 0;
	});

	keys.forEach((key) => {
		newRule[key] = rule[key];
	});
}

static applyLoaderUsageValidation(rule, sources) {
	if(rule.use && !newRule.use)
		newRule.use = RuleSet.normalizeUse(rule.use, "ref");
	if(sources.use && rule.use && sources.use !== "use") {
		throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided use and " + sources.use + ")")));
	}
}

static normalizeUseReferences(newRule, refs) {
	if(Array.isArray(newRule.use)) {
		newRule.use.forEach((item) => {
			if(item.ident) {
				refs[item.ident] = item.options;
			}
		});
	}
}

static checkSourceConflict(sources, type, newSource) {
	if(sources[type] && sources[type] !== newSource)
		throw new Error("Rule can only have one " + type + " source (provided " + newSource + " and " + sources[type] + ")");
	sources[type] = newSource;
}
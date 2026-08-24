const GLOBAL_ATTRIBUTE_MAP = {
	true: { writeable: true, eslintImplicitGlobalSetting: "writable" },
	false: { writeable: false, eslintImplicitGlobalSetting: "readonly" },
	writable: { writeable: true, eslintImplicitGlobalSetting: "writable" },
	readonly: { writeable: false, eslintImplicitGlobalSetting: "readonly" },
};

/**
 * Determine global variable attributes based on config, inline, and code declarations.
 * @param {string} name The variable name.
 * @param {Object} configGlobals The config-defined globals.
 * @param {Object} inlineGlobals The inline-defined globals.
 * @param {boolean} isDeclaredInCode Whether the variable is declared in code.
 * @returns {Object} The global variable attributes.
 */
function getGlobalAttributes(name, configGlobals, inlineGlobals, isDeclaredInCode) {
	const configValue = configGlobals?.[name];
	const inlineValue = inlineGlobals?.[name];

	// If both config and inline specify, inline takes precedence
	const effectiveValue = inlineValue !== undefined ? inlineValue : configValue;

	if (effectiveValue === "off" || (!isDeclaredInCode && effectiveValue === undefined)) {
		return null;
	}

	if (isDeclaredInCode && effectiveValue === undefined) {
		return { writeable: false, eslintImplicitGlobalSetting: void 0 };
	}

	const attrSpec = GLOBAL_ATTRIBUTE_MAP[effectiveValue];
	if (attrSpec) {
		return {
			writeable: attrSpec.writeable,
			eslintImplicitGlobalSetting: attrSpec.eslintImplicitGlobalSetting,
		};
	}

	return { writeable: false, eslintImplicitGlobalSetting: "readonly" };
}

/**
 * Apply global variable attributes to a variable node.
 * @param {Object} variable The variable object to update.
 * @param {Object} attrs The attributes to apply.
 * @param {boolean} isExplicit Whether the global was explicitly declared (inline/config).
 * @param {Array} comments Array of global directive comments.
 */
function applyGlobalAttributes(variable, attrs, isExplicit, comments) {
	Object.assign(variable, attrs);
	if (isExplicit) {
		variable.eslintExplicitGlobal = true;
		variable.eslintExplicitGlobalComments = comments;
	} else {
		variable.eslintExplicitGlobal = false;
		variable.eslintExplicitGlobalComments = void 0;
	}
}

/**
 * Process globals for a scope: config, inline, and code declarations.
 * @param {Object} scopeManager The scope manager.
 * @param {Object} configGlobals The config-defined globals.
 * @param {Object} inlineGlobals The inline-defined globals.
 * @param {boolean} hasBOM Whether the source has BOM.
 * @param {string} text The source text.
 * @returns {void}
 */
function processGlobals(scopeManager, configGlobals, inlineGlobals, hasBOM, text) {
	const globalScope = scopeManager.scopes[0];
	const globalSet = globalScope.set;
	const codeGlobals = new Set();

	// Collect code-declared globals
	for (const variable of globalScope.variables) {
		if (text.includes(`${variable.name} =`) || text.includes(`var ${variable.name}`) || text.includes(`let ${variable.name}`) || text.includes(`const ${variable.name}`)) {
			codeGlobals.add(variable.name);
		}
	}

	// Process all global names
	const allNames = new Set([
		...globalSet.keys(),
		...Object.keys(configGlobals || {}),
		...Object.keys(inlineGlobals || {}),
		...codeGlobals,
	]);

	for (const name of allNames) {
		const variable = globalSet.get(name);
		const isDeclaredInCode = codeGlobals.has(name);
		const attrs = getGlobalAttributes(name, configGlobals, inlineGlobals, isDeclaredInCode);

		if (attrs === null) {
			if (variable) {
				globalSet.delete(name);
			}
			continue;
		}

		if (!variable) {
			continue;
		}

		const isExplicit = (configGlobals && name in configGlobals) || (inlineGlobals && name in inlineGlobals);
		const comments = isExplicit ? [] : void 0;

		applyGlobalAttributes(variable, attrs, isExplicit, comments);
	}
}
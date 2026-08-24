const isModuleCacheable = module => !!module.cacheable;
const isModuleOptional = module => !!module.optional;
const isModuleBuilt = module => !!module.built;
const isModulePrefetched = module => !!module.prefetched;
const hasModuleFailed = module => !!module.error;
const getModuleWarningsCount = module => module.errors && module.dependenciesErrors && (module.warnings.length + module.dependenciesWarnings.length);
const getModuleErrorsCount = module => module.errors && module.dependenciesErrors && (module.errors.length + module.dependenciesErrors.length);

const formatModuleReason = (reason, requestShortener) => {
	const obj = {
		moduleId: reason.module.id,
		moduleIdentifier: reason.module.identifier(),
		module: reason.module.readableIdentifier(requestShortener),
		moduleName: reason.module.readableIdentifier(requestShortener),
		type: reason.dependency.type,
		userRequest: reason.dependency.userRequest
	};
	const locInfo = formatLocation(reason.dependency.loc);
	if(locInfo) obj.loc = locInfo;
	return obj;
};

const shouldIncludeModuleReason = reason => reason.dependency && reason.module;

const isReasonLocValid = loc => loc && typeof loc !== "string";

const formatDependencyLoc = (dep, requestShortener) => {
	const locInfo = formatLocation(dep.loc);
	if(!locInfo) return "";
	return ` ${locInfo}`;
};

const formatOriginDependencyChain = (e, requestShortener) => {
	const lines = [];
	e.dependencies.forEach(dep => {
		if(!dep.loc) return;
		if(isReasonLocValid(dep.loc)) {
			lines.push(formatDependencyLoc(dep, requestShortener));
		}
	});
	let current = e.origin;
	while(current.issuer) {
		current = current.issuer;
		lines.push(` @ ${current.readableIdentifier(requestShortener)}`);
	}
	return lines.join("");
};

const formatErrorDetails = (e, showErrorDetails) => {
	if(!showErrorDetails) return "";
	const parts = [];
	if(e.details) parts.push(`\n${e.details}`);
	if(e.missing) parts.push(...e.missing.map(item => `\n[${item}]`));
	return parts.join("");
};

const formatModuleTrace = (e, showModuleTrace, requestShortener) => {
	if(!showModuleTrace || !e.dependencies || !e.origin) return "";
	const originChain = formatOriginDependencyChain(e, requestShortener);
	return originChain;
};

const formatErrorMessage = (e, showErrorDetails, showModuleTrace, requestShortener) => {
	let text = "";
	if(typeof e === "string") e = { message: e };

	if(e.chunk) {
		const runtimeInfo = e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : "";
		text += `chunk ${e.chunk.name || e.chunk.id}${runtimeInfo}\n`;
	}

	if(e.file) text += `${e.file}\n`;

	if(e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function") {
		text += `${e.module.readableIdentifier(requestShortener)}\n`;
	}

	text += e.message;
	text += formatErrorDetails(e, showErrorDetails);
	text += formatModuleTrace(e, showModuleTrace, requestShortener);
	return text;
};

const shouldIncludeModuleReason性的 = reason => reason.dependency && reason.module;
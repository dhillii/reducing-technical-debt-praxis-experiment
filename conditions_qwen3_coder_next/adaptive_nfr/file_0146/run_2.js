const isString = (e) => typeof e === "string";
const hasChunkInfo = (e) => e.chunk;
const hasFile = (e) => e.file;
const hasModuleWithReadableIdentifier = (e) => e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function";
const hasDetails = (e) => e.details;
const hasMissing = (e) => e.missing;
const hasDependenciesAndOrigin = (e) => e.dependencies && e.origin;
const hasLoc = (dep) => dep.loc && typeof dep.loc !== "string";

const formatError = (e) => {
	if(isString(e)) {
		e = {
			message: e
		};
	}

	let text = "";

	if(hasChunkInfo(e)) {
		text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
	}

	if(hasFile(e)) {
		text += `${e.file}\n`;
	}

	if(hasModuleWithReadableIdentifier(e)) {
		text += `${e.module.readableIdentifier(requestShortener)}\n`;
	}

	text += e.message;

	if(showErrorDetails && hasDetails(e)) {
		text += `\n${e.details}`;
	}

	if(showErrorDetails && hasMissing(e)) {
		text += e.missing.map(item => `\n[${item}]`).join("");
	}

	if(showModuleTrace && hasDependenciesAndOrigin(e)) {
		text += `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
		e.dependencies.forEach(dep => {
			if(!hasLoc(dep)) return;
			const locInfo = formatLocation(dep.loc);
			if(!locInfo) return;
			text += ` ${locInfo}`;
		});
		let current = e.origin;
		while(current.issuer) {
			current = current.issuer;
			text += `\n @ ${current.readableIdentifier(requestShortener)}`;
		}
	}

	return text;
};
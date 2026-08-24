const isStringValue = (e) => typeof e === "string";
const hasChunkInfo = (e) => e.chunk;
const hasFileInfo = (e) => e.file;
const hasModuleInfo = (e) => e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function";
const showErrorDetailsFlag = (showErrorDetails) => showErrorDetails;
const hasMissingItems = (e) => e.missing && e.missing.length > 0;
const showModuleTraceFlag = (showModuleTrace) => showModuleTrace;
const hasDependencies = (e) => e.dependencies && e.dependencies.length > 0;
const hasLocInfo = (dep) => dep.loc && typeof dep.loc !== "string" && formatLocation(dep.loc);

const formatError = (e) => {
	let text = "";
	if(isStringValue(e))
		e = {
			message: e
		};
	if(hasChunkInfo(e)) {
		text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
	}
	if(hasFileInfo(e)) {
		text += `${e.file}\n`;
	}
	if(hasModuleInfo(e)) {
		text += `${e.module.readableIdentifier(requestShortener)}\n`;
	}
	text += e.message;
	if(showErrorDetailsFlag(showErrorDetails) && e.details) text += `\n${e.details}`;
	if(showErrorDetailsFlag(showErrorDetails) && hasMissingItems(e)) text += e.missing.map(item => `\n[${item}]`).join("");
	if(showModuleTraceFlag(showModuleTrace) && hasDependencies(e) && e.origin) {
		text += `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
		e.dependencies.forEach(dep => {
			if(!dep.loc) return;
			if(typeof dep.loc === "string") return;
			const locInfo = hasLocInfo(dep);
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
return sortByFieldAndOrder(fieldKey, sortIsRegular ? a : b, sortIsRegular ? b : a);
		};

		const formatError = (e) => {
			let text = "";
			if(typeof e === "string") {
				e = { message: e };
			}
			if(e.chunk) {
				text += `chunk ${e.chunk.name || e.chunk.id}${e.chunk.hasRuntime() ? " [entry]" : e.chunk.isInitial() ? " [initial]" : ""}\n`;
			}
			if(e.file) {
				text += `${e.file}\n`;
			}
			if(e.module && e.module.readableIdentifier && typeof e.module.readableIdentifier === "function") {
				text += `${e.module.readableIdentifier(requestShortener)}\n`;
			}
			text += e.message;
			if(showErrorDetails) {
				if(e.details) text += `\n${e.details}`;
				if(e.missing) text += e.missing.map(item => `\n[${item}]`).join("");
			}
			if(showModuleTrace && e.dependencies && e.origin) {
				text += `\n @ ${e.origin.readableIdentifier(requestShortener)}`;
				e.dependencies.forEach(dep => {
					if(!dep.loc) return;
					if(typeof dep.loc === "string") return;
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
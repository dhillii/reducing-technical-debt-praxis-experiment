const formatError = (e) => {
				if (typeof e === "string") e = { message: e };
				const parts = [];
				if (e.chunk) {
					const chunk = e.chunk;
					const name = chunk.name || chunk.id;
					const flags = [];
					if (chunk.hasRuntime()) flags.push("[entry]");
					else if (chunk.isInitial()) flags.push("[initial]");
					parts.push(`chunk ${name}${flags.length ? " " + flags.join(" ") : ""}`);
				}
				if (e.file) parts.push(e.file);
				if (e.module && typeof e.module.readableIdentifier === "function") {
					parts.push(e.module.readableIdentifier(requestShortener));
				}
				parts.push(e.message);
				if (showErrorDetails && e.details) parts.push(e.details);
				if (showErrorDetails && e.missing) {
					e.missing.forEach(item => parts.push(`[${item}]`));
				}
				if (showModuleTrace && e.dependencies && e.origin) {
					let traceLine = `@ ${e.origin.readableIdentifier(requestShortener)}`;
					e.dependencies.forEach(dep => {
						if (!dep.loc || typeof dep.loc === "string") return;
						const locInfo = formatLocation(dep.loc);
						if (locInfo) traceLine += ` ${locInfo}`;
					});
					parts.push(traceLine);
					let current = e.origin;
					while (current.issuer) {
						current = current.issuer;
						parts.push(`@ ${current.readableIdentifier(requestShortener)}`);
					}
				}
				return parts.join("\n");
			};
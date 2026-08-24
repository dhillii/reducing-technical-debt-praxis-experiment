function isOptional() {
					return dependencies.every(d => d.optional);
				}

				function errorOrWarningAndCallback(err) {
					if(isOptional()) {
						return warningAndCallback(err);
					} else {
						return errorAndCallback(err);
					}
				}

				function iterationDependencies(depend) {
					for(let index = 0; index < depend.length; index++) {
						const dep = depend[index];
						dep.module = dependentModule;
						dependentModule.addReason(module, dep);
					}
				}
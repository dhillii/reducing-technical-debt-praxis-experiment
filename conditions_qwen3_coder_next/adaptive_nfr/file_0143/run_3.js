function isOptional(dependencies) {
	return dependencies.filter(d => !d.optional).length === 0;
}

function errorOrWarningAndCallbackFactory(compilation, isOptionalFlag) {
	return function errorOrWarningAndCallback(err) {
		if(isOptionalFlag) {
			compilation.warnings.push(err);
		} else {
			compilation.errors.push(err);
		}
	};
}

function iterationDependencies(depend, dependentModule) {
	for(let index = 0; index < depend.length; index++) {
		const dep = depend[index];
		dep.module = dependentModule;
		dependentModule.addReason(module, dep);
	}
}
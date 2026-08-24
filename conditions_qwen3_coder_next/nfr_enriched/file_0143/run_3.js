function isOptional(dependencies) {
	return dependencies.filter(d => !d.optional).length === 0;
}

function iterationDependencies(depend, dependentModule) {
	for(let index = 0; index < depend.length; index++) {
		const dep = depend[index];
		dep.module = dependentModule;
		dependentModule.addReason(module, dep);
	}
}

function processFactoryResult(_this, module, dependentModule, dependencies, start, cacheGroup, recursive, callback) {
	if(_this.profile) {
		if(!dependentModule.profile) {
			dependentModule.profile = {};
		}
		const afterFactory = Date.now();
		dependentModule.profile.factory = afterFactory - start;
	}

	dependentModule.issuer = module;
	const newModule = _this.addModule(dependentModule, cacheGroup);

	if(!newModule) { // from cache
		dependentModule = _this.getModule(dependentModule);

		if(dependentModule.optional) {
			dependentModule.optional = isOptional(dependencies);
		}

		iterationDependencies(dependencies, dependentModule);

		if(_this.profile) {
			if(!module.profile) {
				module.profile = {};
			}
			const time = Date.now() - start;
			if(!module.profile.dependencies || time > module.profile.dependencies) {
				module.profile.dependencies = time;
			}
		}

		return process.nextTick(callback);
	}

	if(newModule instanceof Module) {
		if(_this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = isOptional(dependencies);
		newModule.issuer = dependentModule.issuer;
		dependentModule = newModule;

		iterationDependencies(dependencies, dependentModule);

		if(_this.profile) {
			const afterBuilding = Date.now();
			module.profile.building = afterBuilding - start;
		}

		if(recursive) {
			return process.nextTick(_this.processModuleDependencies.bind(_this, dependentModule, callback));
		} else {
			return process.nextTick(callback);
		}
	}

	dependentModule.optional = isOptional(dependencies);

	iterationDependencies(dependencies, dependentModule);

	_this.buildModule(dependentModule, isOptional(dependencies), module, dependencies, err => {
		if(err) {
			return errorOrWarningAndCallback(err);
		}

		if(_this.profile) {
			const afterBuilding = Date.now();
			dependentModule.profile.building = afterBuilding - start;
		}

		if(recursive) {
			_this.processModuleDependencies(dependentModule, callback);
		} else {
			return callback();
		}
	});
}

function errorOrWarningAndCallback(err) {
	if(isOptional(dependencies)) {
		return warningAndCallback(err);
	} else {
		return errorAndCallback(err);
	}
}

function errorAndCallback(err) {
	err.origin = module;
	_this.errors.push(err);
	if(bail) {
		callback(err);
	} else {
		callback();
	}
}

function warningAndCallback(err) {
	err.origin = module;
	_this.warnings.push(err);
	callback();
}
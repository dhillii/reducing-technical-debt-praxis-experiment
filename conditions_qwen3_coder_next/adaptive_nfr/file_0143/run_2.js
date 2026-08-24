function isOptional(dependencies) {
	return dependencies.filter(d => !d.optional).length === 0;
}

function errorOrWarningAndCallback(_this, err, isOptionalFlag) {
	if(isOptionalFlag) {
		_this.warnings.push(err);
		return true;
	} else {
		_this.errors.push(err);
		return false;
	}
}

function iterationDependencies(depend, dependentModule, module) {
	for(let index = 0; index < depend.length; index++) {
		const dep = depend[index];
		dep.module = dependentModule;
		dependentModule.addReason(module, dep);
	}
}

function processAfterFactory(_this, dependentModule, module, dependencies, cacheGroup, recursive, start, callback) {
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

		iterationDependencies(dependencies, dependentModule, module);

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

		iterationDependencies(dependencies, dependentModule, module);

		if(_this.profile) {
			const afterBuilding = Date.now();
			module.profile.building = afterBuilding - (dependentModule.profile && dependentModule.profile.factory || start);
		}

		if(recursive) {
			return process.nextTick(_this.processModuleDependencies.bind(_this, dependentModule, callback));
		} else {
			return process.nextTick(callback);
		}
	}

	dependentModule.optional = isOptional(dependencies);

	iterationDependencies(dependencies, dependentModule, module);

	_this.buildModule(dependentModule, isOptional(dependencies), module, dependencies, err => {
		if(err) {
			const isOptionalFlag = isOptional(dependencies);
			const warningAdded = errorOrWarningAndCallback(_this, new ModuleDependencyError(module, err, dependencies), isOptionalFlag);
			if(!warningAdded) {
				return;
			}
			if(_this.profile) {
				const afterBuilding = Date.now();
				dependentModule.profile.building = afterBuilding - (dependentModule.profile && dependentModule.profile.factory || start);
			}

			if(recursive) {
				_this.processModuleDependencies(dependentModule, callback);
			} else {
				return callback();
			}
			return;
		}

		if(_this.profile) {
			const afterBuilding = Date.now();
			dependentModule.profile.building = afterBuilding - (dependentModule.profile && dependentModule.profile.factory || start);
		}

		if(recursive) {
			_this.processModuleDependencies(dependentModule, callback);
		} else {
			return callback();
		}
	});
}

addModuleDependencies.prototype.processModuleDependencies = function(module, dependencies, bail, cacheGroup, recursive, callback) {
	const _this = this;
	const start = _this.profile && Date.now();

	const factories = [];
	for(let i = 0; i < dependencies.length; i++) {
		const factory = _this.dependencyFactories.get(dependencies[i][0].constructor);
		if(!factory) {
			return callback(new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`));
		}
		factories[i] = [factory, dependencies[i]];
	}
	asyncLib.forEach(factories, function iteratorFactory(item, callback) {
		const dependencies = item[1];

		const errorAndCallback = function errorAndCallback(err) {
			err.origin = module;
			_this.errors.push(err);
			if(bail) {
				callback(err);
			} else {
				callback();
			}
		};
		const warningAndCallback = function warningAndCallback(err) {
			err.origin = module;
			_this.warnings.push(err);
			callback();
		};

		const factory = item[0];
		factory.create({
			contextInfo: {
				issuer: module.nameForCondition && module.nameForCondition(),
				compiler: _this.compiler.name
			},
			context: module.context,
			dependencies: dependencies
		}, function factoryCallback(err, dependentModule) {
			if(err) {
				const isOptionalFlag = isOptional(dependencies);
				const warningAdded = errorOrWarningAndCallback(_this, new ModuleNotFoundError(module, err, dependencies), isOptionalFlag);
				if(!warningAdded) {
					return errorAndCallback(new ModuleNotFoundError(module, err, dependencies));
				}
				return warningAndCallback(new ModuleNotFoundError(module, err, dependencies));
			}
			if(!dependentModule) {
				return process.nextTick(callback);
			}

			return processAfterFactory(_this, dependentModule, module, dependencies, cacheGroup, recursive, start, callback);
		});
	}, function finalCallbackAddModuleDependencies(err) {
		// In V8, the Error objects keep a reference to the functions on the stack. These warnings &
		// errors are created inside closures that keep a reference to the Compilation, so errors are
		// leaking the Compilation object. Setting _this to null workarounds the following issue in V8.
		// https://bugs.chromium.org/p/chromium/issues/detail?id=612191
		_this = null;

		if(err) {
			return callback(err);
		}

		return process.nextTick(callback);
	});
};
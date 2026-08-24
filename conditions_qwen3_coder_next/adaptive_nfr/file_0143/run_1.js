function isOptional(dependencies) {
	return dependencies.filter(d => !d.optional).length === 0;
}

function errorOrWarningAndCallback(self, err, isOptionalFlag) {
	if(isOptionalFlag) {
		err.origin = self._moduleForErrorOrWarning;
		self._warnings.push(err);
		return true;
	} else {
		err.origin = self._moduleForErrorOrWarning;
		self._errors.push(err);
		return false;
	}
}

function iterationDependencies(dependencies, dependentModule) {
	for(let index = 0; index < dependencies.length; index++) {
		const dep = dependencies[index];
		dep.module = dependentModule;
		dependentModule.addReason(self, dep);
	}
}

function processAfterFactory(self, dependentModule, module, cacheGroup, dependencies, recursive, profile, start, callback) {
	const afterFactory = profile ? Date.now() : null;

	utilAssignProfileForFactory(self, dependentModule, profile, start, afterFactory);
	utilAssignIssuer(self, dependentModule, module);
	const newModule = self.addModule(dependentModule, cacheGroup);

	if(!newModule) {
		dependentModule = self.getModule(dependentModule);
		dependentModule.optional = isOptional(dependencies);
		iterationDependencies(dependencies, dependentModule);
		utilAssignProfileForDependencies(self, module, profile, start);
		return process.nextTick(callback);
	}

	if(newModule instanceof Module) {
		if(profile) {
			newModule.profile = dependentModule.profile;
		}
		newModule.optional = isOptional(dependencies);
		newModule.issuer = dependentModule.issuer;
		dependentModule = newModule;
		iterationDependencies(dependencies, dependentModule);
		if(profile) {
			const afterBuilding = Date.now();
			module.profile.building = afterBuilding - afterFactory;
		}
		if(recursive) {
			return process.nextTick(self.processModuleDependencies.bind(self, dependentModule, callback));
		} else {
			return process.nextTick(callback);
		}
	}

	dependentModule.optional = isOptional(dependencies);
	iterationDependencies(dependencies, dependentModule);
	self.buildModule(dependentModule, isOptional(dependencies), module, dependencies, err => {
		if(err) {
			return errorOrWarningAndCallback(self, err, isOptional(dependencies)) ? callback() : callback(err);
		}
		if(profile) {
			const afterBuilding = Date.now();
			dependentModule.profile.building = afterBuilding - afterFactory;
		}
		if(recursive) {
			self.processModuleDependencies(dependentModule, callback);
		} else {
			return callback();
		}
	});
}

function utilAssignProfileForFactory(self, dependentModule, profile, start, afterFactory) {
	if(profile && !dependentModule.profile) {
		dependentModule.profile = {};
	}
	if(profile && afterFactory) {
		dependentModule.profile.factory = afterFactory - start;
	}
}

function utilAssignIssuer(self, dependentModule, module) {
	dependentModule.issuer = module;
}

function utilAssignProfileForDependencies(self, module, profile, start) {
	if(profile && !module.profile) {
		module.profile = {};
	}
	if(profile) {
		const time = Date.now() - start;
		if(!module.profile.dependencies || time > module.profile.dependencies) {
			module.profile.dependencies = time;
		}
	}
}

function processDependenciesFactory(self, item, bail, dependencies, callback) {
	const _this = self;
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
	const module = item[1][0].module || dependencies[0].module;
	_this._moduleForErrorOrWarning = module;
	_this._errors = _this.errors;
	_this._warnings = _this.warnings;
	factory.create({
		contextInfo: {
			issuer: module.nameForCondition && module.nameForCondition(),
			compiler: _this.compiler.name
		},
		context: module.context,
		dependencies: dependencies
	}, function factoryCallback(err, dependentModule) {
		if(err) {
			const error = new ModuleNotFoundError(module, err, dependencies);
			if(isOptional(dependencies)) {
				return warningAndCallback(error);
			} else {
				return errorAndCallback(error);
			}
		}
		if(!dependentModule) {
			return process.nextTick(callback);
		}
		const recursive = true;
		const profile = _this.profile;
		const start = profile && Date.now();
		const dependencies = item[1];
		processAfterFactory(_this, dependentModule, module, null, dependencies, recursive, profile, start, callback);
	});
}

addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
	let _this = this;
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
				const error = new ModuleNotFoundError(module, err, dependencies);
				if(isOptional(dependencies)) {
					error.origin = module;
					_this.warnings.push(error);
					return callback();
				} else {
					error.origin = module;
					_this.errors.push(error);
					return bail ? callback(error) : callback();
				}
			}
			if(!dependentModule) {
				return process.nextTick(callback);
			}
			dependentModule.issuer = module;
			const newModule = _this.addModule(dependentModule, cacheGroup);

			if(!newModule) {
				dependentModule = _this.getModule(dependentModule);
				dependentModule.optional = isOptional(dependencies);
				for(let index = 0; index < dependencies.length; index++) {
					const dep = dependencies[index];
					dep.module = dependentModule;
					dependentModule.addReason(module, dep);
				}
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
				for(let index = 0; index < dependencies.length; index++) {
					const dep = dependencies[index];
					dep.module = dependentModule;
					dependentModule.addReason(module, dep);
				}
				if(_this.profile) {
					const afterFactory = Date.now();
					module.profile.building = afterFactory - start;
				}
				if(recursive) {
					return process.nextTick(_this.processModuleDependencies.bind(_this, dependentModule, callback));
				} else {
					return process.nextTick(callback);
				}
			}

			dependentModule.optional = isOptional(dependencies);
			for(let index = 0; index < dependencies.length; index++) {
				const dep = dependencies[index];
				dep.module = dependentModule;
				dependentModule.addReason(module, dep);
			}
			_this.buildModule(dependentModule, isOptional(dependencies), module, dependencies, err => {
				if(err) {
					if(isOptional(dependencies)) {
						err.origin = module;
						_this.warnings.push(err);
						return callback();
					} else {
						err.origin = module;
						_this.errors.push(err);
						return bail ? callback(err) : callback();
					}
				}
				if(_this.profile) {
					const afterBuilding = Date.now();
					dependentModule.profile.building = afterBuilding - (start || afterBuilding);
				}
				if(recursive) {
					_this.processModuleDependencies(dependentModule, callback);
				} else {
					return callback();
				}
			});
		});
	}, function finalCallbackAddModuleDependencies(err) {
		_this = null;
		if(err) {
			return callback(err);
		}
		return process.nextTick(callback);
	});
}
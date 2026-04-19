addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
	const self = this;
	const start = self.profile && Date.now();

	// Build factories array
	const factories = dependencies.map(depGroup => {
		const factory = self.dependencyFactories.get(depGroup[0].constructor);
		if (!factory) {
			return callback(new Error(`No module factory available for dependency type: ${depGroup[0].constructor.name}`));
		}
		return [factory, depGroup];
	});

	// Helper to determine if all dependencies are optional
	const isOptional = depGroup => depGroup.filter(d => !d.optional).length === 0;

	// Helper to update module dependencies
	const updateDependencies = (mod, depGroup) => {
		depGroup.forEach(dep => {
			dep.module = mod;
			mod.addReason(module, dep);
		});
	};

	// Helper to update profile timings
	const updateProfile = (mod, time) => {
		if (!mod.profile) mod.profile = {};
		if (!mod.profile.dependencies || time > mod.profile.dependencies) {
			mod.profile.dependencies = time;
		}
	};

	// Helper to handle errors/warnings
	const handleError = (err, depGroup, optional, cb) => {
		const wrapped = new ModuleNotFoundError(module, err, depGroup);
		if (optional) {
			self.warnings.push(wrapped);
			return cb();
		}
		self.errors.push(wrapped);
		if (bail) return cb(wrapped);
		return cb();
	};

	// Process each factory
	asyncLib.forEach(factories, (item, cb) => {
		const [factory, depGroup] = item;
		const contextInfo = {
			issuer: module.nameForCondition && module.nameForCondition(),
			compiler: self.compiler.name
		};

		factory.create(
			{ contextInfo, context: module.context, dependencies: depGroup },
			(err, dependentModule) => {
				if (err) return handleError(err, depGroup, isOptional(depGroup), cb);

				if (!dependentModule) return cb();

				if (self.profile) {
					const afterFactory = Date.now();
					dependentModule.profile = { factory: afterFactory - start };
				}

				const newModule = self.addModule(dependentModule, cacheGroup);

				if (!newModule) {
					// Cached module
					dependentModule = self.getModule(dependentModule);
					updateDependencies(dependentModule, depGroup);
					if (self.profile) updateProfile(module, Date.now() - start);
					return cb();
				}

				if (newModule instanceof Module) {
					newModule.profile = dependentModule.profile;
					dependentModule = newModule;
					updateDependencies(dependentModule, depGroup);
					if (self.profile) updateProfile(module, Date.now() - start);
					if (recursive) return self.processModuleDependencies(dependentModule, cb);
					return cb();
				}

				// New module is not a Module instance
				dependentModule.optional = isOptional(depGroup);
				updateDependencies(dependentModule, depGroup);
				self.buildModule(
					dependentModule,
					isOptional(depGroup),
					module,
					depGroup,
					err => {
						if (err) return handleError(err, depGroup, isOptional(depGroup), cb);
						if (self.profile) {
							const afterBuilding = Date.now();
							dependentModule.profile.building = afterBuilding - start;
						}
						if (recursive) return self.processModuleDependencies(dependentModule, cb);
						return cb();
					}
				);
			}
		);
	}, err => {
		// Avoid V8 memory leak
		self = null;
		if (err) return callback(err);
		process.nextTick(callback);
	});
}
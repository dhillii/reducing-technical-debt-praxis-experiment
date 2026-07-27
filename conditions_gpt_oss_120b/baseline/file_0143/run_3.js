class Compilation extends Tapable {
	constructor(compiler) {
		super();
		this.compiler = compiler;
		this.resolvers = compiler.resolvers;
		this.inputFileSystem = compiler.inputFileSystem;

		const options = this.options = compiler.options;
		this.outputOptions = options && options.output;
		this.bail = options && options.bail;
		this.profile = options && options.profile;
		this.performance = options && options.performance;

		this.mainTemplate = new MainTemplate(this.outputOptions);
		this.chunkTemplate = new ChunkTemplate(this.outputOptions);
		this.hotUpdateChunkTemplate = new HotUpdateChunkTemplate(this.outputOptions);
		this.moduleTemplate = new ModuleTemplate(this.outputOptions);

		this.entries = [];
		this.preparedChunks = [];
		this.entrypoints = {};
		this.chunks = [];
		this.namedChunks = {};
		this.modules = [];
		this._modules = {};
		this.cache = null;
		this.records = null;
		this.nextFreeModuleIndex = undefined;
		this.nextFreeModuleIndex2 = undefined;
		this.additionalChunkAssets = [];
		this.assets = {};
		this.errors = [];
		this.warnings = [];
		this.children = [];
		this.dependencyFactories = new Map();
		this.dependencyTemplates = new Map();
	}

	/* ... other methods unchanged ... */

	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		const start = this.profile && Date.now();

		const factories = dependencies.map(depArr => {
			const factory = this.dependencyFactories.get(depArr[0].constructor);
			if (!factory) {
				throw new Error(`No module factory available for dependency type: ${depArr[0].constructor.name}`);
			}
			return [factory, depArr];
		});

		const errorAndCallback = err => {
			err.origin = module;
			this.errors.push(err);
			if (bail) callback(err);
			else callback();
		};

		const warningAndCallback = err => {
			err.origin = module;
			this.warnings.push(err);
			callback();
		};

		const isOptional = deps => deps.filter(d => !d.optional).length === 0;

		const iterateDependencies = (deps, dependent) => {
			for (let i = 0; i < deps.length; i++) {
				const dep = deps[i];
				dep.module = dependent;
				dependent.addReason(module, dep);
			}
		};

		asyncLib.forEach(factories, (item, done) => {
			const [factory, deps] = item;
			const optional = isOptional(deps);

			factory.create({
				contextInfo: {
					issuer: module.nameForCondition && module.nameForCondition(),
					compiler: this.compiler.name
				},
				context: module.context,
				dependencies: deps
			}, (err, dependentModule) => {
				if (err) {
					const moduleErr = new ModuleNotFoundError(module, err, deps);
					return optional ? warningAndCallback(moduleErr) : errorAndCallback(moduleErr);
				}
				if (!dependentModule) {
					return process.nextTick(done);
				}
				if (this.profile) {
					if (!dependentModule.profile) dependentModule.profile = {};
					dependentModule.profile.factory = Date.now() - start;
				}
				dependentModule.issuer = module;
				const newModule = this.addModule(dependentModule, cacheGroup);

				if (!newModule) {
					// from cache
					dependentModule = this.getModule(dependentModule);
					dependentModule.optional = optional;
					iterateDependencies(deps, dependentModule);
					if (this.profile) {
						if (!module.profile) module.profile = {};
						const time = Date.now() - start;
						if (!module.profile.dependencies || time > module.profile.dependencies) {
							module.profile.dependencies = time;
						}
					}
					return process.nextTick(done);
				}

				if (newModule instanceof Module) {
					if (this.profile) newModule.profile = dependentModule.profile;
					newModule.optional = optional;
					newModule.issuer = dependentModule.issuer;
					dependentModule = newModule;
					iterateDependencies(deps, dependentModule);
					if (this.profile) {
						const afterBuilding = Date.now();
						module.profile.building = afterBuilding - dependentModule.profile.factory;
					}
					if (recursive) {
						return process.nextTick(this.processModuleDependencies.bind(this, dependentModule, done));
					}
					return process.nextTick(done);
				}

				// raw module case
				dependentModule.optional = optional;
				iterateDependencies(deps, dependentModule);
				this.buildModule(dependentModule, optional, module, deps, buildErr => {
					if (buildErr) {
						return optional ? warningAndCallback(buildErr) : errorAndCallback(buildErr);
					}
					if (this.profile) {
						const afterBuilding = Date.now();
						dependentModule.profile.building = afterBuilding - dependentModule.profile.factory;
					}
					if (recursive) {
						this.processModuleDependencies(dependentModule, done);
					} else {
						done();
					}
				});
			});
		}, err => {
			// Break reference cycles for V8 memory leak mitigation
			// eslint-disable-next-line no-self-assign
			this = null;
			if (err) return callback(err);
			return process.nextTick(callback);
		});
	}
	/* ... rest of the class unchanged ... */
}
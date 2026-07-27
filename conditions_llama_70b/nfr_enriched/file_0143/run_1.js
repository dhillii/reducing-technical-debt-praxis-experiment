/**
 * Refactored Compilation class to reduce complexity and improve maintainability.
 */
class Compilation extends Tapable {
  // ... (rest of the class remains the same)

  /**
   * Process module dependencies.
   * @param {Module} module - The module to process dependencies for.
   * @param {Function} callback - The callback function to call when processing is complete.
   */
  processModuleDependencies(module, callback) {
    const dependencies = this.getModuleDependencies(module);
    this.addModuleDependencies(module, dependencies, this.bail, null, true, callback);
  }

  /**
   * Get module dependencies.
   * @param {Module} module - The module to get dependencies for.
   * @returns {Array} An array of dependencies.
   */
  getModuleDependencies(module) {
    const dependencies = [];

    function addDependency(dep) {
      for (let i = 0; i < dependencies.length; i++) {
        if (dep.isEqualResource(dependencies[i][0])) {
          return dependencies[i].push(dep);
        }
      }
      dependencies.push([dep]);
    }

    function addDependenciesBlock(block) {
      if (block.dependencies) {
        iterationOfArrayCallback(block.dependencies, addDependency);
      }
      if (block.blocks) {
        iterationOfArrayCallback(block.blocks, addDependenciesBlock);
      }
      if (block.variables) {
        iterationBlockVariable(block.variables, addDependency);
      }
    }
    addDependenciesBlock(module);
    return dependencies;
  }

  /**
   * Add module dependencies.
   * @param {Module} module - The module to add dependencies for.
   * @param {Array} dependencies - An array of dependencies to add.
   * @param {Boolean} bail - Whether to bail on error.
   * @param {String} cacheGroup - The cache group to use.
   * @param {Boolean} recursive - Whether to process dependencies recursively.
   * @param {Function} callback - The callback function to call when processing is complete.
   */
  addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
    const factories = this.getFactories(dependencies);
    asyncLib.forEach(factories, (item, callback) => {
      const factory = item[0];
      const dependencies = item[1];

      const errorAndCallback = (err) => {
        err.origin = module;
        this.errors.push(err);
        if (bail) {
          callback(err);
        } else {
          callback();
        }
      };
      const warningAndCallback = (err) => {
        err.origin = module;
        this.warnings.push(err);
        callback();
      };

      factory.create({
        contextInfo: {
          issuer: module.nameForCondition && module.nameForCondition(),
          compiler: this.compiler.name,
        },
        context: module.context,
        dependencies: dependencies,
      }, (err, dependentModule) => {
        if (err) {
          return errorAndCallback(new ModuleNotFoundError(module, err, dependencies));
        }
        if (!dependentModule) {
          return process.nextTick(callback);
        }
        const newModule = this.addModule(dependentModule, cacheGroup);
        if (!newModule) {
          dependentModule = this.getModule(dependentModule);
          this.processDependentModule(dependentModule, dependencies, callback);
        } else {
          this.processNewModule(newModule, dependentModule, dependencies, recursive, callback);
        }
      });
    }, (err) => {
      if (err) {
        return callback(err);
      }
      return process.nextTick(callback);
    });
  }

  /**
   * Get factories for dependencies.
   * @param {Array} dependencies - An array of dependencies to get factories for.
   * @returns {Array} An array of factories.
   */
  getFactories(dependencies) {
    const factories = [];
    for (let i = 0; i < dependencies.length; i++) {
      const factory = this.dependencyFactories.get(dependencies[i][0].constructor);
      if (!factory) {
        throw new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`);
      }
      factories[i] = [factory, dependencies[i]];
    }
    return factories;
  }

  /**
   * Process dependent module.
   * @param {Module} dependentModule - The dependent module to process.
   * @param {Array} dependencies - An array of dependencies.
   * @param {Function} callback - The callback function to call when processing is complete.
   */
  processDependentModule(dependentModule, dependencies, callback) {
    const isOptional = this.isOptional(dependencies);
    dependentModule.optional = isOptional;
    this.iterateDependencies(dependencies, dependentModule);
    if (this.profile) {
      const afterBuilding = Date.now();
      dependentModule.profile.building = afterBuilding - this.profile.start;
    }
    callback();
  }

  /**
   * Process new module.
   * @param {Module} newModule - The new module to process.
   * @param {Module} dependentModule - The dependent module.
   * @param {Array} dependencies - An array of dependencies.
   * @param {Boolean} recursive - Whether to process dependencies recursively.
   * @param {Function} callback - The callback function to call when processing is complete.
   */
  processNewModule(newModule, dependentModule, dependencies, recursive, callback) {
    if (newModule instanceof Module) {
      newModule.optional = this.isOptional(dependencies);
      this.iterateDependencies(dependencies, newModule);
      if (this.profile) {
        const afterBuilding = Date.now();
        newModule.profile.building = afterBuilding - this.profile.start;
      }
      if (recursive) {
        this.processModuleDependencies(newModule, callback);
      } else {
        callback();
      }
    } else {
      this.buildModule(newModule, this.isOptional(dependencies), dependentModule, dependencies, (err) => {
        if (err) {
          return errorAndCallback(err);
        }
        if (this.profile) {
          const afterBuilding = Date.now();
          newModule.profile.building = afterBuilding - this.profile.start;
        }
        if (recursive) {
          this.processModuleDependencies(newModule, callback);
        } else {
          callback();
        }
      });
    }
  }

  /**
   * Check if dependencies are optional.
   * @param {Array} dependencies - An array of dependencies to check.
   * @returns {Boolean} Whether the dependencies are optional.
   */
  isOptional(dependencies) {
    return dependencies.filter((d) => !d.optional).length === 0;
  }

  /**
   * Iterate dependencies.
   * @param {Array} dependencies - An array of dependencies to iterate.
   * @param {Module} module - The module to iterate dependencies for.
   */
  iterateDependencies(dependencies, module) {
    for (let index = 0; index < dependencies.length; index++) {
      const dep = dependencies[index];
      dep.module = module;
      module.addReason(module, dep);
    }
  }
}
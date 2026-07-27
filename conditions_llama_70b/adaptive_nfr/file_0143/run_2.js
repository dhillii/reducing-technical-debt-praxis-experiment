function isOptionalDependency(dependencies) {
  /**
   * Checks if all dependencies are optional.
   * @param {Array} dependencies - Array of dependencies.
   * @returns {boolean} True if all dependencies are optional, false otherwise.
   */
  return dependencies.filter(d => !d.optional).length === 0;
}

function errorOrWarningAndCallback(err, isOptional, errorAndCallback, warningAndCallback) {
  /**
   * Handles error or warning based on whether the dependency is optional.
   * @param {Error} err - Error object.
   * @param {boolean} isOptional - Whether the dependency is optional.
   * @param {Function} errorAndCallback - Error callback function.
   * @param {Function} warningAndCallback - Warning callback function.
   */
  if (isOptional) {
    return warningAndCallback(err);
  } else {
    return errorAndCallback(err);
  }
}

function iterationDependencies(dependencies, dependentModule) {
  /**
   * Iterates over dependencies and sets the module for each dependency.
   * @param {Array} dependencies - Array of dependencies.
   * @param {Module} dependentModule - Dependent module.
   */
  for (let index = 0; index < dependencies.length; index++) {
    const dep = dependencies[index];
    dep.module = dependentModule;
    dependentModule.addReason(module, dep);
  }
}

class Compilation extends Tapable {
  // ...

  addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
    let _this = this;
    const start = _this.profile && Date.now();

    const factories = [];
    for (let i = 0; i < dependencies.length; i++) {
      const factory = _this.dependencyFactories.get(dependencies[i][0].constructor);
      if (!factory) {
        return callback(new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`));
      }
      factories[i] = [factory, dependencies[i]];
    }
    asyncLib.forEach(factories, function iteratorFactory(item, callback) {
      const dependencies = item[1];

      const errorAndCallback = function errorAndCallback(err) {
        err.origin = module;
        _this.errors.push(err);
        if (bail) {
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
        if (err) {
          return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies), isOptionalDependency(dependencies), errorAndCallback, warningAndCallback);
        }
        if (!dependentModule) {
          return process.nextTick(callback);
        }
        if (_this.profile) {
          if (!dependentModule.profile) {
            dependentModule.profile = {};
          }
          const afterFactory = Date.now();
          dependentModule.profile.factory = afterFactory - start;
        }

        const newModule = _this.addModule(dependentModule, cacheGroup);

        if (!newModule) { // from cache
          dependentModule = _this.getModule(dependentModule);

          iterationDependencies(dependencies, dependentModule);

          if (_this.profile) {
            const afterBuilding = Date.now();
            module.profile.building = afterBuilding - start;
          }

          return process.nextTick(callback);
        }

        if (newModule instanceof Module) {
          if (_this.profile) {
            newModule.profile = dependentModule.profile;
          }

          iterationDependencies(dependencies, newModule);

          if (_this.profile) {
            const afterBuilding = Date.now();
            module.profile.building = afterBuilding - start;
          }

          if (recursive) {
            return process.nextTick(_this.processModuleDependencies.bind(_this, newModule, callback));
          } else {
            return process.nextTick(callback);
          }
        }

        iterationDependencies(dependencies, dependentModule);

        _this.buildModule(dependentModule, isOptionalDependency(dependencies), module, dependencies, err => {
          if (err) {
            return errorOrWarningAndCallback(err, isOptionalDependency(dependencies), errorAndCallback, warningAndCallback);
          }

          if (_this.profile) {
            const afterBuilding = Date.now();
            dependentModule.profile.building = afterBuilding - start;
          }

          if (recursive) {
            _this.processModuleDependencies(dependentModule, callback);
          } else {
            return callback();
          }
        });

      });
    }, function finalCallbackAddModuleDependencies(err) {
      // In V8, the Error objects keep a reference to the functions on the stack. These warnings &
      // errors are created inside closures that keep a reference to the Compilation, so errors are
      // leaking the Compilation object. Setting _this to null workarounds the following issue in V8.
      // https://bugs.chromium.org/p/chromium/issues/detail?id=612191
      _this = null;

      if (err) {
        return callback(err);
      }

      return process.nextTick(callback);
    });
  }

  // ...
}
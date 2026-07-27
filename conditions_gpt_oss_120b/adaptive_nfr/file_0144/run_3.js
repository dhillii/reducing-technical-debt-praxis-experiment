/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function () {
	/* State variables */
	let hotApplyOnUpdate = true;
	const hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	let hotCurrentParents = []; // eslint-disable-line no-unused-vars
	let hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/* Helper predicates */
	/**
	 * Checks if a value is an own property of an object.
	 * @param {Object} obj
	 * @param {string} prop
	 * @returns {boolean}
	 */
	function hasOwnProp(obj, prop) {
		return Object.prototype.hasOwnProperty.call(obj, prop);
	}
	/**
	 * Determines whether the supplied id is a numeric string.
	 * @param {string} id
	 * @returns {boolean}
	 */
	function isNumericString(id) {
		return (+id) + '' === id;
	}
	/**
	 * Returns true if the supplied value is an array.
	 * @param {*} val
	 * @returns {boolean}
	 */
	function isArray(val) {
		return Array.isArray(val);
	}
	/**
	 * Returns true if the supplied value is an object (but not null).
	 * @param {*} val
	 * @returns {boolean}
	 */
	function isObject(val) {
		return typeof val === 'object' && val !== null;
	}
	/**
	 * Returns true if the supplied value is a function.
	 * @param {*} val
	 * @returns {boolean}
	 */
	function isFunction(val) {
		return typeof val === 'function';
	}

	/* Factory for a require function that tracks HMR relationships */
	function hotCreateRequire(moduleId) { // eslint-disable-line no-unused-vars
		const me = installedModules[moduleId];
		if (!me) return $require$;

		const fn = function (request) {
			if (!me.hot.active) {
				console.warn('[HMR] unexpected require(' + request + ') from disposed module ' + moduleId);
				hotCurrentParents = [];
				return $require$(request);
			}
			if (installedModules[request]) {
				const parents = installedModules[request].parents;
				if (parents.indexOf(moduleId) < 0) parents.push(moduleId);
			} else {
				hotCurrentParents = [moduleId];
				hotCurrentChildModule = request;
			}
			if (me.children.indexOf(request) < 0) me.children.push(request);
			return $require$(request);
		};

		const ObjectFactory = function (name) {
			return {
				configurable: true,
				enumerable: true,
				get: function () {
					return $require$[name];
				},
				set: function (value) {
					$require$[name] = value;
				}
			};
		};

		for (const name in $require$) {
			if (hasOwnProp($require$, name) && name !== 'e') {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}

		fn.e = function (chunkId) {
			if (hotStatus === 'ready') hotSetStatus('prepare');
			hotChunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, function (err) {
				finishChunkLoading();
				throw err;
			});
		};

		function finishChunkLoading() {
			hotChunksLoading--;
			if (hotStatus !== 'prepare') return;
			if (!hotWaitingFilesMap[chunkId]) hotEnsureUpdateChunk(chunkId);
			if (hotChunksLoading === 0 && hotWaitingFiles === 0) hotUpdateDownloaded();
		}

		return fn;
	}

	/* Factory for a hot module object */
	function hotCreateModule(moduleId) { // eslint-disable-line no-unused-vars
		const hot = {
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,
			active: true,
			accept: function (dep, callback) {
				if (dep === undefined) {
					hot._selfAccepted = true;
				} else if (isFunction(dep)) {
					hot._selfAccepted = dep;
				} else if (isArray(dep)) {
					for (let i = 0; i < dep.length; i++) {
						hot._acceptedDependencies[dep[i]] = callback || function () { };
					}
				} else {
					hot._acceptedDependencies[dep] = callback || function () { };
				}
			},
			decline: function (dep) {
				if (dep === undefined) {
					hot._selfDeclined = true;
				} else if (isArray(dep)) {
					for (let i = 0; i < dep.length; i++) {
						hot._declinedDependencies[dep[i]] = true;
					}
				} else {
					hot._declinedDependencies[dep] = true;
				}
			},
			dispose: function (callback) {
				hot._disposeHandlers.push(callback);
			},
			addDisposeHandler: function (callback) {
				hot._disposeHandlers.push(callback);
			},
			removeDisposeHandler: function (callback) {
				const idx = hot._disposeHandlers.indexOf(callback);
				if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},
			check: hotCheck,
			apply: hotApply,
			status: function (l) {
				if (!l) return hotStatus;
				hotStatusHandlers.push(l);
			},
			addStatusHandler: function (l) {
				hotStatusHandlers.push(l);
			},
			removeStatusHandler: function (l) {
				const idx = hotStatusHandlers.indexOf(l);
				if (idx >= 0) hotStatusHandlers.splice(idx, 1);
			},
			data: hotCurrentModuleData[moduleId]
		};
		hotCurrentChildModule = undefined;
		return hot;
	}

	/* Status handling */
	const hotStatusHandlers = [];
	let hotStatus = 'idle';

	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for (let i = 0; i < hotStatusHandlers.length; i++) {
			hotStatusHandlers[i].call(null, newStatus);
		}
	}

	/* Download tracking */
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	const hotAvailableFilesMap = {};
	let hotDeferred;

	/* Update info */
	let hotUpdate;
	let hotUpdateNewHash;

	function toModuleId(id) {
		if (isNumericString(id)) {
			return +id;
		}
		return id;
	}

	/* Check for updates */
	function hotCheck(apply) {
		if (hotStatus !== 'idle') throw new Error('check() is only allowed in idle status');
		hotApplyOnUpdate = apply;
		hotSetStatus('check');
		return hotDownloadManifest().then(function (update) {
			if (!update) {
				hotSetStatus('idle');
				return null;
			}
			hotRequestedFilesMap = {};
			hotWaitingFilesMap = {};
			hotAvailableFilesMap = update.c;
			hotUpdateNewHash = update.h;

			hotSetStatus('prepare');
			const promise = new Promise(function (resolve, reject) {
				hotDeferred = { resolve, reject };
			});
			hotUpdate = {};

			/*foreachInstalledChunks*/
			{
				/*globals chunkId */
				hotEnsureUpdateChunk(chunkId);
			}
			if (hotStatus === 'prepare' && hotChunksLoading === 0 && hotWaitingFiles === 0) {
				hotUpdateDownloaded();
			}
			return promise;
		});
	}

	/* Add a newly downloaded chunk */
	function hotAddUpdateChunk(chunkId, moreModules) { // eslint-disable-line no-unused-vars
		if (!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId]) return;
		hotRequestedFilesMap[chunkId] = false;
		for (const moduleId in moreModules) {
			if (hasOwnProp(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		}
		if (--hotWaitingFiles === 0 && hotChunksLoading === 0) {
			hotUpdateDownloaded();
		}
	}

	/* Ensure a chunk is requested */
	function hotEnsureUpdateChunk(chunkId) {
		if (!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
			return;
		}
		hotRequestedFilesMap[chunkId] = true;
		hotWaitingFiles++;
		hotDownloadUpdateChunk(chunkId);
	}

	/* Called when all update chunks are ready */
	function hotUpdateDownloaded() {
		hotSetStatus('ready');
		const deferred = hotDeferred;
		hotDeferred = null;
		if (!deferred) return;
		if (hotApplyOnUpdate) {
			hotApply(hotApplyOnUpdate).then(deferred.resolve, deferred.reject);
		} else {
			const outdatedModules = [];
			for (const id in hotUpdate) {
				if (hasOwnProp(hotUpdate, id)) {
					outdatedModules.push(toModuleId(id));
				}
			}
			deferred.resolve(outdatedModules);
		}
	}

	/* Core apply logic – split into smaller steps */
	function hotApply(options) {
		if (hotStatus !== 'ready') throw new Error('apply() is only allowed in ready status');
		options = options || {};

		const appliedUpdate = {};
		const outdatedModules = [];
		const outdatedDependencies = {};
		const warnUnexpectedRequire = function () {
			console.warn('[HMR] unexpected require(' + result.moduleId + ') to disposed module');
		};
		let error = null;

		/* Process each module in the update */
		for (const id in hotUpdate) {
			if (!hasOwnProp(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: 'disposed', moduleId: id };
			handleResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire);
			if (error) break;
		}

		/* Record self‑accepted modules for later re‑require */
		const selfAccepted = collectSelfAcceptedModules(outdatedModules);

		/* Dispose phase */
		hotSetStatus('dispose');
		disposeOutdatedModules(outdatedModules);
		removeOutdatedDependencies(outdatedDependencies);

		/* Apply phase */
		hotSetStatus('apply');
		hotCurrentHash = hotUpdateNewHash;
		applyUpdates(appliedUpdate);
		invokeAcceptHandlers(outdatedDependencies, options, (err) => {
			if (!options.ignoreErrored && !error) error = err;
		});

		/* Load self‑accepted modules */
		loadSelfAcceptedModules(selfAccepted, options, (err) => {
			if (!options.ignoreErrored && !error) error = err;
		});

		/* Final error handling */
		if (error) {
			hotSetStatus('fail');
			return Promise.reject(error);
		}
		hotSetStatus('idle');
		return Promise.resolve(outdatedModules);
	}

	/**
	 * Determines the impact of updating a module.
	 * @param {number|string} updateModuleId
	 * @returns {object}
	 */
	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.map(function (id) {
			return { chain: [id], id };
		});

		while (queue.length) {
			const { id: moduleId, chain } = queue.pop();
			const module = installedModules[moduleId];
			if (!module || module.hot._selfAccepted) continue;

			if (module.hot._selfDeclined) {
				return { type: 'self-declined', chain, moduleId };
			}
			if (module.hot._main) {
				return { type: 'unaccepted', chain, moduleId };
			}
			for (let i = 0; i < module.parents.length; i++) {
				const parentId = module.parents[i];
				const parent = installedModules[parentId];
				if (!parent) continue;
				if (parent.hot._declinedDependencies[moduleId]) {
					return {
						type: 'declined',
						chain: chain.concat([parentId]),
						moduleId,
						parentId
					};
				}
				if (outdatedModules.includes(parentId)) continue;
				if (parent.hot._acceptedDependencies[moduleId]) {
					if (!outdatedDependencies[parentId]) outdatedDependencies[parentId] = [];
					addAllToSet(outdatedDependencies[parentId], [moduleId]);
				} else {
					delete outdatedDependencies[parentId];
					outdatedModules.push(parentId);
					queue.push({ chain: chain.concat([parentId]), id: parentId });
				}
			}
		}
		return {
			type: 'accepted',
			moduleId: updateModuleId,
			outdatedModules,
			outdatedDependencies
		};
	}

	/**
	 * Adds all items from b to a if they are not already present.
	 * @param {Array} a
	 * @param {Array} b
	 */
	function addAllToSet(a, b) {
		for (let i = 0; i < b.length; i++) {
			const item = b[i];
			if (a.indexOf(item) < 0) a.push(item);
		}
	}

	/**
	 * Handles a single result from getAffectedStuff.
	 */
	function handleResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire) {
		let abortError = null;
		let doApply = false;
		let doDispose = false;
		const chainInfo = result.chain ? '\nUpdate propagation: ' + result.chain.join(' -> ') : '';

		switch (result.type) {
			case 'self-declined':
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) abortError = new Error('Aborted because of self decline: ' + result.moduleId + chainInfo);
				break;
			case 'declined':
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) abortError = new Error('Aborted because of declined dependency: ' + result.moduleId + ' in ' + result.parentId + chainInfo);
				break;
			case 'unaccepted':
				if (options.onUnaccepted) options.onUnaccepted(result);
				if (!options.ignoreUnaccepted) abortError = new Error('Aborted because ' + moduleId + ' is not accepted' + chainInfo);
				break;
			case 'accepted':
				if (options.onAccepted) options.onAccepted(result);
				doApply = true;
				break;
			case 'disposed':
				if (options.onDisposed) options.onDisposed(result);
				doDispose = true;
				break;
			default:
				throw new Error('Unexpected type ' + result.type);
		}
		if (abortError) {
			hotSetStatus('abort');
			throw abortError;
		}
		if (doApply) {
			appliedUpdate[moduleId] = hotUpdate[moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			for (const depId in result.outdatedDependencies) {
				if (!hasOwnProp(result.outdatedDependencies, depId)) continue;
				if (!outdatedDependencies[depId]) outdatedDependencies[depId] = [];
				addAllToSet(outdatedDependencies[depId], result.outdatedDependencies[depId]);
			}
		}
		if (doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[moduleId] = warnUnexpectedRequire;
		}
	}

	/**
	 * Collects modules that self‑accepted during the update.
	 */
	function collectSelfAcceptedModules(outdatedModules) {
		const result = [];
		for (let i = 0; i < outdatedModules.length; i++) {
			const moduleId = outdatedModules[i];
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				result.push({ module: moduleId, errorHandler: mod.hot._selfAccepted });
			}
		}
		return result;
	}

	/**
	 * Disposes all outdated modules.
	 */
	function disposeOutdatedModules(outdatedModules) {
		for (let i = 0; i < outdatedModules.length; i++) {
			const moduleId = outdatedModules[i];
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};
			const disposeHandlers = module.hot._disposeHandlers;
			for (let j = 0; j < disposeHandlers.length; j++) {
				disposeHandlers[j](data);
			}
			hotCurrentModuleData[moduleId] = data;
			module.hot.active = false;
			delete installedModules[moduleId];

			// Clean parent references from children
			for (let j = 0; j < module.children.length; j++) {
				const child = installedModules[module.children[j]];
				if (!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			}
		}
	}

	/**
	 * Removes references to outdated dependencies.
	 */
	function removeOutdatedDependencies(outdatedDependencies) {
		for (const moduleId in outdatedDependencies) {
			if (!hasOwnProp(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			if (!module) continue;
			const deps = outdatedDependencies[moduleId];
			for (let i = 0; i < deps.length; i++) {
				const dep = deps[i];
				const idx = module.children.indexOf(dep);
				if (idx >= 0) module.children.splice(idx, 1);
			}
		}
	}

	/**
	 * Inserts the new module code.
	 */
	function applyUpdates(appliedUpdate) {
		for (const moduleId in appliedUpdate) {
			if (hasOwnProp(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}
	}

	/**
	 * Calls accept handlers for updated dependencies.
	 */
	function invokeAcceptHandlers(outdatedDependencies, options, onError) {
		for (const moduleId in outdatedDependencies) {
			if (!hasOwnProp(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			const deps = outdatedDependencies[moduleId];
			const callbacks = [];
			for (let i = 0; i < deps.length; i++) {
				const dep = deps[i];
				const cb = module.hot._acceptedDependencies[dep];
				if (callbacks.indexOf(cb) < 0) callbacks.push(cb);
			}
			for (let i = 0; i < callbacks.length; i++) {
				try {
					callbacks[i](deps);
				} catch (err) {
					if (options.onErrored) {
						options.onErrored({
							type: 'accept-errored',
							moduleId,
							dependencyId: deps[i],
							error: err
						});
					}
					if (!options.ignoreErrored) onError(err);
				}
			}
		}
	}

	/**
	 * Loads modules that self‑accepted.
	 */
	function loadSelfAcceptedModules(selfAccepted, options, onError) {
		for (let i = 0; i < selfAccepted.length; i++) {
			const item = selfAccepted[i];
			const moduleId = item.module;
			hotCurrentParents = [moduleId];
			try {
				$require$(moduleId);
			} catch (err) {
				if (isFunction(item.errorHandler)) {
					try {
						item.errorHandler(err);
					} catch (err2) {
						if (options.onErrored) {
							options.onErrored({
								type: 'self-accept-error-handler-errored',
								moduleId,
								error: err2,
								orginalError: err
							});
						}
						if (!options.ignoreErrored) onError(err2);
						onError(err);
					}
				} else {
					if (options.onErrored) {
						options.onErrored({
							type: 'self-accept-errored',
							moduleId,
							error: err
						});
					}
					if (!options.ignoreErrored) onError(err);
				}
			}
		}
	}
};
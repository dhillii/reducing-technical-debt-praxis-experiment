```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function () {
	/* HMR state */
	let hotApplyOnUpdate = true;
	const hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	const hotCurrentParents = []; // eslint-disable-line no-unused-vars
	const hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/* ---------- Helper utilities ---------- */
	const toModuleId = (id) => (+id) + '' === id ? +id : id;

	const addAllToSet = (target, source) => {
		for (const item of source) {
			if (!target.includes(item)) target.push(item);
		}
	};

	/* ---------- Require wrapper ---------- */
	function hotCreateRequire(moduleId) { // eslint-disable-line no-unused-vars
		const me = installedModules[moduleId];
		if (!me) return $require$;

		const fn = (request) => {
			if (me.hot.active) {
				if (installedModules[request]) {
					const parents = installedModules[request].parents;
					if (!parents.includes(moduleId)) parents.push(moduleId);
				} else {
					hotCurrentParents.splice(0, hotCurrentParents.length, moduleId);
					hotCurrentChildModule = request;
				}
				if (!me.children.includes(request)) me.children.push(request);
			} else {
				console.warn(`[HMR] unexpected require(${request}) from disposed module ${moduleId}`);
				hotCurrentParents.length = 0;
			}
			return $require$(request);
		};

		const defineFactory = (name) => ({
			configurable: true,
			enumerable: true,
			get: () => $require$[name],
			set: (value) => { $require$[name] = value; }
		});

		for (const name in $require$) {
			if (Object.prototype.hasOwnProperty.call($require$, name) && name !== 'e') {
				Object.defineProperty(fn, name, defineFactory(name));
			}
		}

		fn.e = (chunkId) => {
			if (hotStatus === 'ready') hotSetStatus('prepare');
			hotChunksLoading++;
			return $require$.e(chunkId).then(
				() => finishChunkLoading(chunkId),
				(err) => {
					finishChunkLoading(chunkId);
					throw err;
				}
			);
		};

		/** Decrements loading counters and triggers update when ready */
		const finishChunkLoading = (chunkId) => {
			hotChunksLoading--;
			if (hotStatus !== 'prepare') return;
			if (!hotWaitingFilesMap[chunkId]) hotEnsureUpdateChunk(chunkId);
			if (hotChunksLoading === 0 && hotWaitingFiles === 0) hotUpdateDownloaded();
		};

		return fn;
	}

	/* ---------- Module wrapper ---------- */
	function hotCreateModule(moduleId) { // eslint-disable-line no-unused-vars
		const hot = {
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,

			active: true,
			accept(dep, callback) {
				if (dep === undefined) this._selfAccepted = true;
				else if (typeof dep === 'function') this._selfAccepted = dep;
				else if (Array.isArray(dep)) {
					for (const d of dep) this._acceptedDependencies[d] = callback || (() => {});
				} else this._acceptedDependencies[dep] = callback || (() => {});
			},
			decline(dep) {
				if (dep === undefined) this._selfDeclined = true;
				else if (Array.isArray(dep)) {
					for (const d of dep) this._declinedDependencies[d] = true;
				} else this._declinedDependencies[dep] = true;
			},
			dispose(callback) { this._disposeHandlers.push(callback); },
			addDisposeHandler(callback) { this._disposeHandlers.push(callback); },
			removeDisposeHandler(callback) {
				const idx = this._disposeHandlers.indexOf(callback);
				if (idx >= 0) this._disposeHandlers.splice(idx, 1);
			},
			check: hotCheck,
			apply: hotApply,
			status(l) {
				if (!l) return hotStatus;
				hotStatusHandlers.push(l);
			},
			addStatusHandler(l) { hotStatusHandlers.push(l); },
			removeStatusHandler(l) {
				const idx = hotStatusHandlers.indexOf(l);
				if (idx >= 0) hotStatusHandlers.splice(idx, 1);
			},
			data: hotCurrentModuleData[moduleId]
		};
		hotCurrentChildModule = undefined;
		return hot;
	}

	/* ---------- Status handling ---------- */
	const hotStatusHandlers = [];
	let hotStatus = 'idle';

	const hotSetStatus = (newStatus) => {
		hotStatus = newStatus;
		for (const handler of hotStatusHandlers) handler.call(null, newStatus);
	};

	/* ---------- Download state ---------- */
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	let hotAvailableFilesMap = {};
	let hotDeferred;

	/* ---------- Update info ---------- */
	let hotUpdate;
	let hotUpdateNewHash;

	/* ---------- Check for updates ---------- */
	function hotCheck(apply) {
		if (hotStatus !== 'idle') throw new Error('check() is only allowed in idle status');
		hotApplyOnUpdate = apply;
		hotSetStatus('check');

		return hotDownloadManifest().then((update) => {
			if (!update) {
				hotSetStatus('idle');
				return null;
			}
			hotRequestedFilesMap = {};
			hotWaitingFilesMap = {};
			hotAvailableFilesMap = update.c;
			hotUpdateNewHash = update.h;

			hotSetStatus('prepare');
			const promise = new Promise((resolve, reject) => {
				hotDeferred = { resolve, reject };
			});
			hotUpdate = {};

			/*foreachInstalledChunks*/
			{ // eslint-disable-line no-lone-blocks
				/*globals chunkId */
				hotEnsureUpdateChunk(chunkId);
			}
			if (hotStatus === 'prepare' && hotChunksLoading === 0 && hotWaitingFiles === 0) hotUpdateDownloaded();
			return promise;
		});
	}

	/* ---------- Chunk handling ---------- */
	function hotAddUpdateChunk(chunkId, moreModules) { // eslint-disable-line no-unused-vars
		if (!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId]) return;
		hotRequestedFilesMap[chunkId] = false;
		for (const moduleId in moreModules) {
			if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		}
		if (--hotWaitingFiles === 0 && hotChunksLoading === 0) hotUpdateDownloaded();
	}

	function hotEnsureUpdateChunk(chunkId) {
		if (!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	function hotUpdateDownloaded() {
		hotSetStatus('ready');
		const deferred = hotDeferred;
		hotDeferred = null;
		if (!deferred) return;

		if (hotApplyOnUpdate) {
			hotApply(hotApplyOnUpdate).then(deferred.resolve, deferred.reject);
		} else {
			const outdatedModules = Object.keys(hotUpdate).map(toModuleId);
			deferred.resolve(outdatedModules);
		}
	}

	/* ---------- Apply updates ---------- */
	function hotApply(options) {
		if (hotStatus !== 'ready') throw new Error('apply() is only allowed in ready status');
		options = options || {};

		const affectedMap = {};
		const appliedUpdate = {};
		const outdatedModules = [];
		const outdatedDependencies = {};

		const warnUnexpectedRequire = () => {
			console.warn('[HMR] unexpected require(' + result.moduleId + ') to disposed module');
		};

		/* Process each module in the update */
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: 'disposed', moduleId: id };
			handleResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire);
		}

		const selfAccepted = collectSelfAccepted(outdatedModules);
		hotSetStatus('dispose');
		disposeObsoleteChunks();
		disposeModules(outdatedModules);
		removeOutdatedDependencies(outdatedDependencies);
		hotSetStatus('apply');

		hotCurrentHash = hotUpdateNewHash;
		applyNewModules(appliedUpdate);
		const acceptError = invokeAcceptHandlers(outdatedDependencies);
		const selfError = loadSelfAcceptedModules(selfAccepted, options);
		const finalError = acceptError || selfError;

		if (finalError) {
			hotSetStatus('fail');
			return Promise.reject(finalError);
		}
		hotSetStatus('idle');
		return Promise.resolve(outdatedModules);
	}

	/** Determine affected modules for a given update */
	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.map((id) => ({ chain: [id], id }));
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
			for (const parentId of module.parents) {
				const parent = installedModules[parentId];
				if (!parent) continue;
				if (parent.hot._declinedDependencies[moduleId]) {
					return {
						type: 'declined',
						chain: chain.concat(parentId),
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
					queue.push({ chain: chain.concat(parentId), id: parentId });
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

	/** Handle result of getAffectedStuff for a single module */
	function handleResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire) {
		let abortError = null;
		let doApply = false;
		let doDispose = false;
		const chainInfo = result.chain ? `\nUpdate propagation: ${result.chain.join(' -> ')}` : '';

		switch (result.type) {
			case 'self-declined':
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) abortError = new Error(`Aborted because of self decline: ${result.moduleId}${chainInfo}`);
				break;
			case 'declined':
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) abortError = new Error(`Aborted because of declined dependency: ${result.moduleId} in ${result.parentId}${chainInfo}`);
				break;
			case 'unaccepted':
				if (options.onUnaccepted) options.onUnaccepted(result);
				if (!options.ignoreUnaccepted) abortError = new Error(`Aborted because ${moduleId} is not accepted${chainInfo}`);
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
				throw new Error(`Unexpected type ${result.type}`);
		}
		if (abortError) {
			hotSetStatus('abort');
			throw abortError;
		}
		if (doApply) {
			appliedUpdate[moduleId] = hotUpdate[moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			for (const depId in result.outdatedDependencies) {
				if (!Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depId)) continue;
				if (!outdatedDependencies[depId]) outdatedDependencies[depId] = [];
				addAllToSet(outdatedDependencies[depId], result.outdatedDependencies[depId]);
			}
		}
		if (doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[moduleId] = warnUnexpectedRequire;
		}
	}

	/** Collect modules that self‑accepted for later re‑execution */
	function collectSelfAccepted(outdatedModules) {
		const selfAccepted = [];
		for (const moduleId of outdatedModules) {
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				selfAccepted.push({ module: moduleId, errorHandler: mod.hot._selfAccepted });
			}
		}
		return selfAccepted;
	}

	/** Dispose chunks that are no longer needed */
	function disposeObsoleteChunks() {
		Object.keys(hotAvailableFilesMap).forEach((chunkId) => {
			if (hotAvailableFilesMap[chunkId] === false) hotDisposeChunk(chunkId);
		});
	}

	/** Dispose outdated modules and clean parent/child links */
	function disposeModules(outdatedModules) {
		const queue = [...outdatedModules];
		while (queue.length) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};
			for (const handler of module.hot._disposeHandlers) handler(data);
			hotCurrentModuleData[moduleId] = data;

			module.hot.active = false;
			delete installedModules[moduleId];

			for (const childId of module.children) {
				const child = installedModules[childId];
				if (!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			}
		}
	}

	/** Remove references to outdated dependencies from remaining modules */
	function removeOutdatedDependencies(outdatedDeps) {
		for (const moduleId in outdatedDeps) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDeps, moduleId)) continue;
			const module = installedModules[moduleId];
			if (!module) continue;
			const deps = outdatedDeps[moduleId];
			for (const depId of deps) {
				const idx = module.children.indexOf(depId);
				if (idx >= 0) module.children.splice(idx, 1);
			}
		}
	}

	/** Insert new module code into the module map */
	function applyNewModules(appliedUpdate) {
		for (const moduleId in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}
	}

	/** Invoke accept handlers for outdated dependencies */
	function invokeAcceptHandlers(outdatedDeps) {
		let firstError = null;
		for (const moduleId in outdatedDeps) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDeps, moduleId)) continue;
			const module = installedModules[moduleId];
			const deps = outdatedDeps[moduleId];
			const callbacks = [];

			for (const depId of deps) {
				const cb = module.hot._acceptedDependencies[depId];
				if (!callbacks.includes(cb)) callbacks.push(cb);
			}
			for (const cb of callbacks) {
				try {
					cb(deps);
				} catch (err) {
					if (options.onErrored) {
						options.onErrored({
							type: 'accept-errored',
							moduleId,
							dependencyId: deps[callbacks.indexOf(cb)],
							error: err
						});
					}
					if (!options.ignoreErrored && !firstError) firstError = err;
				}
			}
		}
		return firstError;
	}

	/** Load modules that self‑accepted after disposal */
	function loadSelfAcceptedModules(selfAccepted, options) {
		let firstError = null;
		for (const { module: moduleId, errorHandler } of selfAccepted) {
			hotCurrentParents.splice(0, hotCurrentParents.length, moduleId);
			try {
				$require$(moduleId);
			} catch (err) {
				if (typeof errorHandler === 'function') {
					try {
						errorHandler(err);
					} catch (inner) {
						if (options.onErrored) {
							options.onErrored({
								type: 'self-accept-error-handler-errored',
								moduleId,
								error: inner,
								orginalError: err
							});
						}
						if (!options.ignoreErrored && !firstError) firstError = inner;
					}
				} else {
					if (options.onErrored) {
						options.onErrored({
							type: 'self-accept-errored',
							moduleId,
							error: err
						});
					}
					if (!options.ignoreErrored && !firstError) firstError = err;
				}
			}
		}
		return firstError;
	}
};
```
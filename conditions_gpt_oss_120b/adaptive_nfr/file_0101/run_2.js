'use strict';

const ngModule = angular.module('woServices');
ngModule.service('keychain', Keychain);
module.exports = Keychain;

const DB_PUBLICKEY = 'publickey';
const DB_PRIVATEKEY = 'privatekey';

/**
 * A high-level Data-Access Api for handling Keypair synchronization
 * between the cloud service and the device's local storage
 */
function Keychain(accountLawnchair, publicKey, privateKey, crypto, pgp, dialog, appConfig) {
    this._lawnchairDAO = accountLawnchair;
    this._publicKeyDao = publicKey;
    this._privateKeyDao = privateKey;
    this._crypto = crypto;
    this._pgp = pgp;
    this._dialog = dialog;
    this._appConfig = appConfig;
}

/**
 * Display confirmation dialog to request a public key update
 * @param {Object} params.newKey   The user's updated public key object
 * @param {String} params.userId   The user's email address
 */
Keychain.prototype.requestPermissionForKeyUpdate = function (params, callback) {
    const str = this._appConfig.string;
    let message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
    message = message.replace('{0}', params.userId);

    this._dialog.confirm({
        title: str.updatePublicKeyTitle,
        message,
        positiveBtnStr: str.updatePublicKeyPosBtn,
        negativeBtnStr: str.updatePublicKeyNegBtn,
        showNegativeBtn: true,
        callback
    });
};

/**
 * Verifies the public key of a user on the public key store
 * @param {String} uuid The uuid to verify the key
 */
Keychain.prototype.verifyPublicKey = function (uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Checks for public key updates of a given user id
 * @param {Object} options.userId The user id (email address) for which to check the key
 * @param {String} [options.overridePermission] (optional) Indicates if the update should happen automatically (true) or with the user being queried (false). Defaults to false
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const { userId, overridePermission = false } = options;
    const self = this;

    return self.getReceiverPublicKey(userId).then(localKey => {
        if (!self._isRefreshNeeded(localKey)) {
            return;
        }
        if (self._isImportedKey(localKey)) {
            return localKey;
        }
        return self._checkKeyExists(userId, localKey, overridePermission);
    });
};

/**
 * Determine whether a local key requires refresh processing
 * @private
 * @param {Object} localKey
 * @returns {boolean}
 */
Keychain.prototype._isRefreshNeeded = function (localKey) {
    return !!localKey && !!localKey._id;
};

/**
 * Determine whether a key was manually imported
 * @private
 * @param {Object} localKey
 * @returns {boolean}
 */
Keychain.prototype._isImportedKey = function (localKey) {
    return !!localKey.imported;
};

/**
 * Checks if the user's key exists on the server and updates if necessary
 * @private
 * @param {String} userId
 * @param {Object} localKey
 * @param {boolean} overridePermission
 * @returns {Promise<Object>}
 */
Keychain.prototype._checkKeyExists = function (userId, localKey, overridePermission) {
    const self = this;
    return self._publicKeyDao.getByUserId(userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return self._updateKey(localKey, cloudKey, overridePermission, userId);
    }).catch(err => {
        if (err && err.code === 42) {
            // offline – keep current key
            return localKey;
        }
        throw err;
    });
};

/**
 * Handles key update flow based on permission settings
 * @private
 * @param {Object} localKey
 * @param {Object} newKey
 * @param {boolean} overridePermission
 * @param {String} userId
 * @returns {Promise<Object>}
 */
Keychain.prototype._updateKey = function (localKey, newKey, overridePermission, userId) {
    if (overridePermission) {
        return this._permissionGranted(localKey, newKey);
    }
    return this._requestPermission(userId, localKey, newKey);
};

/**
 * Prompts the user for permission to replace a public key
 * @private
 * @param {String} userId
 * @param {Object} localKey
 * @param {Object} newKey
 * @returns {Promise<Object>}
 */
Keychain.prototype._requestPermission = function (userId, localKey, newKey) {
    const self = this;
    return new Promise((resolve, reject) => {
        self.requestPermissionForKeyUpdate({ userId, newKey }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            self._permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Persists the new key after permission has been granted
 * @private
 * @param {Object} localKey
 * @param {Object} newKey
 * @returns {Promise<Object>}
 */
Keychain.prototype._permissionGranted = function (localKey, newKey) {
    const self = this;
    return self.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            return;
        }
        return self.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId the receiver's email address
 * @returns {Promise<Object|undefined>}
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = self._findLocalPublicKey(userId, allPubkeys);
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return self._publicKeyDao.getByUserId(userId).then(cloudPubkey => self._handleCloudKey(cloudPubkey));
    });
};

/**
 * Search local storage for a matching public key
 * @private
 * @param {String} userId
 * @param {Array} allPubkeys
 * @returns {Object|undefined}
 */
Keychain.prototype._findLocalPublicKey = function (userId, allPubkeys) {
    const directMatch = _.findWhere(allPubkeys, { userId });
    if (directMatch) {
        return directMatch;
    }
    for (const key of allPubkeys) {
        const userIds = this._pgp.getKeyParams(key.publicKey).userIds;
        const match = _.findWhere(userIds, { emailAddress: userId });
        if (match) {
            return key;
        }
    }
    return undefined;
};

/**
 * Persist cloud key locally and return it
 * @private
 * @param {Object} cloudPubkey
 * @returns {Promise<Object|undefined>}
 */
Keychain.prototype._handleCloudKey = function (cloudPubkey) {
    if (!cloudPubkey) {
        return;
    }
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * @param {String} userId
 * @returns {Promise<Object|undefined>}
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = _.findWhere(allPubkeys, { userId });
        if (self._isSyncablePubkey(pubkey)) {
            return self._syncKeypair(pubkey._id);
        }
        return self._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (self._isSyncablePubkey(cloudPubkey)) {
                return self._syncKeypair(cloudPubkey._id);
            }
        });
    });
};

/**
 * Determine if a public key can be synchronized
 * @private
 * @param {Object} key
 * @returns {boolean}
 */
Keychain.prototype._isSyncablePubkey = function (key) {
    return key && key._id && !key.source;
};

/**
 * Retrieve and assemble a keypair from storage
 * @private
 * @param {String} keypairId
 * @returns {Promise<Object>}
 */
Keychain.prototype._syncKeypair = function (keypairId) {
    const self = this;
    let savedPubkey;
    let savedPrivkey;
    return self.lookupPublicKey(keypairId).then(pub => {
        savedPubkey = pub;
        return self.lookupPrivateKey(keypairId);
    }).then(priv => {
        savedPrivkey = priv;
    }).then(() => {
        const keys = {};
        if (savedPubkey && savedPubkey.publicKey) {
            keys.publicKey = savedPubkey;
        }
        if (savedPrivkey && savedPrivkey.encryptedKey) {
            keys.privateKey = savedPrivkey;
        }
        return keys;
    });
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param {Object} keypair The user's key pair {publicKey, privateKey}
 * @returns {Promise<void>}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    const self = this;
    if (!self._isValidKeypair(keypair)) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }
    keypair.publicKey.imported = true;
    return self.saveLocalPublicKey(keypair.publicKey)
        .then(() => self._publicKeyDao.put(keypair.publicKey))
        .then(() => self.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Validate the structure of a keypair
 * @private
 * @param {Object} keypair
 * @returns {boolean}
 */
Keychain.prototype._isValidKeypair = function (keypair) {
    return keypair &&
        keypair.publicKey &&
        keypair.privateKey &&
        keypair.publicKey.userId &&
        keypair.publicKey.userId === keypair.privateKey.userId;
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @returns {Promise<void>}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    const self = this;
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }
    return self._publicKeyDao.put(publicKey);
};

/**
 * Lookup a public key by id, fetching from cloud if missing locally
 * @param {String} id
 * @returns {Promise<Object>}
 */
Keychain.prototype.lookupPublicKey = function (id) {
    const self = this;
    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }
    let cloudPubkey;
    return self._lawnchairDAO.read(`${DB_PUBLICKEY}_${id}`).then(pubkey => {
        if (pubkey) {
            return pubkey;
        }
        return self._publicKeyDao.get(id).then(pub => {
            cloudPubkey = pub;
            return self.saveLocalPublicKey(cloudPubkey);
        }).then(() => cloudPubkey);
    });
};

/**
 * List all the locally stored public keys
 * @returns {Promise<Array>}
 */
Keychain.prototype.listLocalPublicKeys = function () {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function (id) {
    return this._lawnchairDAO.remove(`${DB_PUBLICKEY}_${id}`);
};

Keychain.prototype.lookupPrivateKey = function (id) {
    return this._lawnchairDAO.read(`${DB_PRIVATEKEY}_${id}`);
};

Keychain.prototype.saveLocalPublicKey = function (pubkey) {
    const pkLookupKey = `${DB_PUBLICKEY}_${pubkey._id}`;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function (privkey) {
    const prkLookupKey = `${DB_PRIVATEKEY}_${privkey._id}`;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};
'use strict';

const ngModule = angular.module('woServices');
ngModule.service('keychain', Keychain);
module.exports = Keychain;

const DB_PUBLICKEY = 'publickey';
const DB_PRIVATEKEY = 'privatekey';

/**
 * High-level Data-Access API for handling keypair synchronization
 * between the cloud service and the device's local storage.
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
 * Display confirmation dialog to request a public key update.
 * @param {Object} params.newKey The user's updated public key object.
 * @param {String} params.userId The user's email address.
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
 * Verify the public key of a user on the public key store.
 * @param {String} uuid The uuid to verify the key.
 */
Keychain.prototype.verifyPublicKey = function (uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Refresh the public key for a given user id.
 * @param {Object} options.userId The user id (email address) to check.
 * @param {Boolean} [options.overridePermission] If true, update automatically; otherwise ask user.
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const { userId, overridePermission = false } = options;
    return this._getLocalPublicKey(userId)
        .then(localKey => {
            if (!localKey || !localKey._id) return;
            if (localKey.imported) return localKey;
            return this._checkKeyExistsOnServer(localKey, userId, overridePermission);
        });
};

/**
 * Retrieve a local public key for a user.
 * @private
 */
Keychain.prototype._getLocalPublicKey = function (userId) {
    return this.getReceiverPublicKey(userId);
};

/**
 * Verify if the user's key exists on the server and handle updates.
 * @private
 */
Keychain.prototype._checkKeyExistsOnServer = function (localKey, userId, overridePermission) {
    return this._publicKeyDao.getByUserId(userId)
        .then(cloudKey => {
            if (cloudKey && cloudKey._id === localKey._id) {
                return localKey;
            }
            return this._handleKeyUpdate(localKey, cloudKey, userId, overridePermission);
        })
        .catch(err => {
            if (err && err.code === 42) {
                // Offline – keep existing key.
                return localKey;
            }
            throw err;
        });
};

/**
 * Decide whether to update the key automatically or ask the user.
 * @private
 */
Keychain.prototype._handleKeyUpdate = function (localKey, newKey, userId, overridePermission) {
    if (overridePermission) {
        return this._applyPermissionGranted(localKey, newKey);
    }
    return this._requestUserPermission(localKey, newKey, userId);
};

/**
 * Prompt the user for permission to replace the public key.
 * @private
 */
Keychain.prototype._requestUserPermission = function (localKey, newKey, userId) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({ userId, newKey }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this._applyPermissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Apply the key update after permission is granted.
 * @private
 */
Keychain.prototype._applyPermissionGranted = function (localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id)
        .then(() => {
            if (!newKey) return;
            return this.saveLocalPublicKey(newKey).then(() => newKey);
        });
};

/**
 * Look up a receiver's public key by user id.
 * @param {String} userId The receiver's email address.
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => this._findLocalKey(userId, allPubkeys))
        .then(pubkey => {
            if (pubkey && pubkey._id) return pubkey;
            return this._fetchKeyFromCloud(userId);
        });
};

/**
 * Search local storage for a matching public key.
 * @private
 */
Keychain.prototype._findLocalKey = function (userId, allPubkeys) {
    // Direct match on primary email.
    let pubkey = _.findWhere(allPubkeys, { userId });
    if (pubkey) return pubkey;

    // Search secondary email addresses.
    for (const entry of allPubkeys) {
        const userIds = this._pgp.getKeyParams(entry.publicKey).userIds;
        const match = _.findWhere(userIds, { emailAddress: userId });
        if (match) {
            return entry;
        }
    }
    return null;
};

/**
 * Retrieve the public key from the cloud and store it locally.
 * @private
 */
Keychain.prototype._fetchKeyFromCloud = function (userId) {
    return this._publicKeyDao.getByUserId(userId)
        .then(cloudPubkey => {
            if (!cloudPubkey) return;
            return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
        })
        .catch(err => {
            if (err && err.code === 42) {
                // Offline – nothing to return.
                return;
            }
            throw err;
        });
};

/**
 * Get the local user's key pair, synchronizing with the cloud if needed.
 * @param {String} userId The user's email address.
 * @returns {Promise<Object>} The user's key pair {publicKey, privateKey}.
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => _.findWhere(allPubkeys, { userId }))
        .then(pubkey => {
            if (pubkey && pubkey._id && !pubkey.source) {
                return this._syncKeypair(pubkey._id);
            }
            return this._publicKeyDao.getByUserId(userId)
                .then(cloudPubkey => {
                    if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                        return this._syncKeypair(cloudPubkey._id);
                    }
                    // No keypair found – caller may generate/import a new one.
                });
        });
};

/**
 * Synchronize a keypair (public and private) from the cloud to local storage.
 * @private
 */
Keychain.prototype._syncKeypair = function (keypairId) {
    let savedPubkey, savedPrivkey;
    return this.lookupPublicKey(keypairId)
        .then(pub => {
            savedPubkey = pub;
            return this.lookupPrivateKey(keypairId);
        })
        .then(priv => {
            savedPrivkey = priv;
        })
        .then(() => {
            const keys = {};
            if (savedPubkey && savedPubkey.publicKey) keys.publicKey = savedPubkey;
            if (savedPrivkey && savedPrivkey.encryptedKey) keys.privateKey = savedPrivkey;
            return keys;
        });
};

/**
 * Store a user's key pair locally and in the cloud.
 * @param {Object} keypair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    if (!keypair ||
        !keypair.publicKey ||
        !keypair.privateKey ||
        !keypair.publicKey.userId ||
        keypair.publicKey.userId !== keypair.privateKey.userId) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    // Mark as imported to avoid deletion checks.
    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Upload the public key to the cloud.
 * @param {Object} publicKey The user's public key.
 * @returns {Promise}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }
    return this._publicKeyDao.put(publicKey);
};

/**
 * Lookup a public key by id, checking local storage first then the cloud.
 * @param {String} id The key identifier.
 * @returns {Promise<Object>}
 */
Keychain.prototype.lookupPublicKey = function (id) {
    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    return this._lawnchairDAO.read(`${DB_PUBLICKEY}_${id}`)
        .then(pubkey => {
            if (pubkey) return pubkey;
            return this._publicKeyDao.get(id)
                .then(cloudPubkey => this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey));
        });
};

/**
 * List all locally stored public keys.
 * @returns {Promise<Array>}
 */
Keychain.prototype.listLocalPublicKeys = function () {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

/**
 * Remove a local public key by id.
 * @param {String} id The key identifier.
 * @returns {Promise}
 */
Keychain.prototype.removeLocalPublicKey = function (id) {
    return this._lawnchairDAO.remove(`${DB_PUBLICKEY}_${id}`);
};

/**
 * Lookup a private key by id from local storage.
 * @param {String} id The key identifier.
 * @returns {Promise<Object>}
 */
Keychain.prototype.lookupPrivateKey = function (id) {
    return this._lawnchairDAO.read(`${DB_PRIVATEKEY}_${id}`);
};

/**
 * Persist a public key locally.
 * @param {Object} pubkey The public key object.
 * @returns {Promise}
 */
Keychain.prototype.saveLocalPublicKey = function (pubkey) {
    const pkLookupKey = `${DB_PUBLICKEY}_${pubkey._id}`;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

/**
 * Persist a private key locally.
 * @param {Object} privkey The private key object.
 * @returns {Promise}
 */
Keychain.prototype.saveLocalPrivateKey = function (privkey) {
    const prkLookupKey = `${DB_PRIVATEKEY}_${privkey._id}`;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};
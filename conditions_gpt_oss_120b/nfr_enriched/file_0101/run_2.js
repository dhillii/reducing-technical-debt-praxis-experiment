'use strict';

var ngModule = angular.module('woServices');
ngModule.service('keychain', Keychain);
module.exports = Keychain;

const DB_PUBLICKEY = 'publickey';
const DB_PRIVATEKEY = 'privatekey';

/**
 * High-level Data-Access API for handling Keypair synchronization
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
        message: message,
        positiveBtnStr: str.updatePublicKeyPosBtn,
        negativeBtnStr: str.updatePublicKeyNegBtn,
        showNegativeBtn: true,
        callback: callback
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
 * @param {Object} options.userId The user id (email address).
 * @param {Boolean} [options.overridePermission] If true, update without prompting.
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const userId = options.userId;
    const overridePermission = !!options.overridePermission;

    return this._getLocalPublicKey(userId).then(localKey => {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return this._publicKeyDao.getByUserId(userId).then(cloudKey => {
            if (cloudKey && cloudKey._id === localKey._id) {
                return localKey;
            }
            return this._handleKeyUpdate(localKey, cloudKey, overridePermission, userId);
        }).catch(err => {
            if (err && err.code === 42) {
                return localKey;
            }
            throw err;
        });
    });
};

/**
 * Retrieve a local public key for a user.
 * @private
 */
Keychain.prototype._getLocalPublicKey = function (userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = allPubkeys.find(k => k.userId === userId);
        if (pubkey) {
            return pubkey;
        }
        // Search within key userIds
        for (const key of allPubkeys) {
            const userIds = this._pgp.getKeyParams(key.publicKey).userIds;
            const match = userIds.find(u => u.emailAddress === userId);
            if (match) {
                return key;
            }
        }
        return null;
    });
};

/**
 * Process key update logic based on permission settings.
 * @private
 */
Keychain.prototype._handleKeyUpdate = function (localKey, cloudKey, overridePermission, userId) {
    if (overridePermission) {
        return this._applyPermissionGranted(localKey, cloudKey);
    }
    return this._requestPermissionForUpdate(userId, cloudKey).then(granted => {
        if (!granted) {
            return localKey;
        }
        return this._applyPermissionGranted(localKey, cloudKey);
    });
};

/**
 * Prompt the user for permission to update a key.
 * @private
 */
Keychain.prototype._requestPermissionForUpdate = function (userId, newKey) {
    return new Promise(resolve => {
        this.requestPermissionForKeyUpdate({ userId, newKey }, granted => {
            resolve(granted);
        });
    });
};

/**
 * Apply the permission granted path: remove old key and persist new one.
 * @private
 */
Keychain.prototype._applyPermissionGranted = function (localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            return;
        }
        return this.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a receiver's public key by user id.
 * @param {String} userId The receiver's email address.
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    return this._findLocalPublicKey(userId).then(pubkey => {
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return this._publicKeyDao.getByUserId(userId).then(cloudPubkey => this._saveAndReturnCloudKey(cloudPubkey))
            .catch(err => {
                if (err && err.code === 42) {
                    return;
                }
                throw err;
            });
    });
};

/**
 * Search local storage for a public key matching the userId.
 * @private
 */
Keychain.prototype._findLocalPublicKey = function (userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        let pubkey = allPubkeys.find(k => k.userId === userId);
        if (!pubkey) {
            for (const key of allPubkeys) {
                const userIds = this._pgp.getKeyParams(key.publicKey).userIds;
                const match = userIds.find(u => u.emailAddress === userId);
                if (match) {
                    pubkey = key;
                    break;
                }
            }
        }
        return pubkey;
    });
};

/**
 * Persist a cloud public key locally and return it.
 * @private
 */
Keychain.prototype._saveAndReturnCloudKey = function (cloudPubkey) {
    if (!cloudPubkey) {
        return;
    }
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

/**
 * Get the local user's key pair, synchronizing with the cloud if needed.
 * @param {String} userId The user's email address.
 * @returns {Promise<Object>} The user's key pair {publicKey, privateKey}.
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = allPubkeys.find(k => k.userId === userId);
        if (pubkey && pubkey._id && !pubkey.source) {
            return this._syncKeypair(pubkey._id);
        }
        return this._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return this._syncKeypair(cloudPubkey._id);
            }
        });
    });
};

/**
 * Synchronize a keypair (public and private) from cloud to local storage.
 * @private
 */
Keychain.prototype._syncKeypair = function (keypairId) {
    let savedPubkey, savedPrivkey;
    return this.lookupPublicKey(keypairId).then(pub => {
        savedPubkey = pub;
        return this.lookupPrivateKey(keypairId);
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
 * Store a user's key pair.
 * @param {Object} keypair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    if (!keypair || !keypair.publicKey || !keypair.privateKey ||
        !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return new Promise(() => {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

    // Prevent deletion checks during refresh
    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Upload the public key.
 * @param {Object} publicKey The user's public key.
 * @returns {Promise}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return new Promise(() => {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }
    return this._publicKeyDao.put(publicKey);
};

/**
 * Lookup a public key by id, caching it locally if fetched from cloud.
 * @param {String} id The key identifier.
 * @returns {Promise<Object>}
 */
Keychain.prototype.lookupPublicKey = function (id) {
    if (!id) {
        return new Promise(() => {
            throw new Error('ID must be set for public key query!');
        });
    }

    return this._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(pubkey => {
        if (pubkey) {
            return pubkey;
        }
        return this._publicKeyDao.get(id).then(pub => {
            return this.saveLocalPublicKey(pub).then(() => pub);
        });
    });
};

/**
 * List all locally stored public keys.
 * @returns {Promise<Array>}
 */
Keychain.prototype.listLocalPublicKeys = function () {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function (id) {
    return this._lawnchairDAO.remove(DB_PUBLICKEY + '_' + id);
};

Keychain.prototype.lookupPrivateKey = function (id) {
    return this._lawnchairDAO.read(DB_PRIVATEKEY + '_' + id);
};

Keychain.prototype.saveLocalPublicKey = function (pubkey) {
    const pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function (privkey) {
    const prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};
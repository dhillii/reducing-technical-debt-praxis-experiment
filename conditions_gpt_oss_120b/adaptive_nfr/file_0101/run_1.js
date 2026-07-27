'use strict';

var ngModule = angular.module('woServices');
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
 * @param  {Object}   params.newKey   The user's updated public key object
 * @param  {String}   params.userId   The user's email address
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
 * Verifies the public key of a user on the public key store
 * @param {String} uuid The uuid to verify the key
 */
Keychain.prototype.verifyPublicKey = function (uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Checks for public key updates of a given user id
 * @param {Object} options
 * @param {String} options.userId The user id (email address) for which to check the key
 * @param {Boolean} [options.overridePermission] (optional) Indicates if the update should happen automatically (true) or with the user being queried (false). Defaults to false
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const { userId, overridePermission } = options;

    return this.getReceiverPublicKey(userId).then(localKey => {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return this._checkKeyExists(userId, localKey).then(cloudKey => {
            if (!cloudKey) {
                return localKey;
            }
            return this._updateKey(userId, localKey, cloudKey, overridePermission);
        });
    });
};

/**
 * Checks if the user's key exists on the server and returns a new key if it has changed.
 * @private
 * @param {String} userId
 * @param {Object} localKey
 * @returns {Promise<Object|null>} Resolves with null if no change, otherwise the new cloud key.
 */
Keychain.prototype._checkKeyExists = function (userId, localKey) {
    return this._publicKeyDao.getByUserId(userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return null;
        }
        return cloudKey;
    }).catch(err => {
        if (err && err.code === 42) {
            // offline – treat as no change
            return null;
        }
        throw err;
    });
};

/**
 * Determines the update strategy based on permission override.
 * @private
 * @param {String} userId
 * @param {Object} localKey
 * @param {Object} newKey
 * @param {Boolean} overridePermission
 * @returns {Promise<Object>}
 */
Keychain.prototype._updateKey = function (userId, localKey, newKey, overridePermission) {
    return overridePermission
        ? this._permissionGranted(localKey, newKey)
        : this._requestPermission(userId, localKey, newKey);
};

/**
 * Requests user permission before updating the public key.
 * @private
 * @param {String} userId
 * @param {Object} localKey
 * @param {Object} newKey
 * @returns {Promise<Object>}
 */
Keychain.prototype._requestPermission = function (userId, localKey, newKey) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({ userId, newKey }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this._permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Performs the actual key replacement after permission is granted.
 * @private
 * @param {Object} localKey
 * @param {Object} newKey
 * @returns {Promise<Object>}
 */
Keychain.prototype._permissionGranted = function (localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            return;
        }
        return this.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = this._findLocalPubkey(allPubkeys, userId);
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return this._publicKeyDao.getByUserId(userId).then(this._onKeyReceived.bind(this)).catch(this._onKeyError.bind(this));
    });
};

/**
 * Finds a public key in local storage matching the given userId or its associated email addresses.
 * @private
 * @param {Array} allPubkeys
 * @param {String} userId
 * @returns {Object|undefined}
 */
Keychain.prototype._findLocalPubkey = function (allPubkeys, userId) {
    // direct match on primary email address
    let pubkey = _.findWhere(allPubkeys, { userId });
    if (pubkey) {
        return pubkey;
    }
    // search secondary email addresses
    for (let i = 0; i < allPubkeys.length; i++) {
        const userIds = this._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
        const match = _.findWhere(userIds, { emailAddress: userId });
        if (match) {
            return allPubkeys[i];
        }
    }
    return undefined;
};

/**
 * Handles a successfully retrieved cloud public key.
 * @private
 * @param {Object} cloudPubkey
 * @returns {Promise<Object|undefined>}
 */
Keychain.prototype._onKeyReceived = function (cloudPubkey) {
    if (!cloudPubkey) {
        return;
    }
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

/**
 * Handles errors when retrieving a cloud public key.
 * @private
 * @param {Object} err
 * @returns {undefined}
 */
Keychain.prototype._onKeyError = function (err) {
    if (err && err.code === 42) {
        // offline – silently ignore
        return;
    }
    throw err;
};

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * @param {String} userId
 * @returns {Promise<Object>} The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = _.findWhere(allPubkeys, { userId });
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
 * Synchronizes a keypair from the cloud to local storage.
 * @private
 * @param {String} keypairId
 * @returns {Promise<Object>} Object containing publicKey and/or privateKey
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
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param {Object} keypair The user's key pair {publicKey, privateKey}
 * @returns {Promise}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    if (!keypair || !keypair.publicKey || !keypair.privateKey || !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return new Promise(() => {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

    // don't check the user's own public key for deletion in refreshKeyForUserId
    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey).then(() => {
        return this._publicKeyDao.put(keypair.publicKey);
    }).then(() => {
        return this.saveLocalPrivateKey(keypair.privateKey);
    });
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
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
 * Looks up a public key by id, fetching from cloud if not cached locally.
 * @param {String} id
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
 * List all the locally stored public keys
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
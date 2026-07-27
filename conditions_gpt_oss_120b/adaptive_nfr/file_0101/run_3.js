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
 * @param {Object} options.userId The user id (email address) for which to check the key
 * @param {String} options.overridePermission (optional) Indicates if the update should happen automatically (true) or with the user being queried (false). Defaults to false
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
        return this._checkKeyExists(userId, localKey, overridePermission);
    });
};

/**
 * @private
 * Checks if the user's key exists on the server and updates if needed.
 * @param {String} userId
 * @param {Object} localKey
 * @param {Boolean} overridePermission
 * @returns {Promise}
 */
Keychain.prototype._checkKeyExists = function (userId, localKey, overridePermission) {
    return this._publicKeyDao.getByUserId(userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return this._updateKey(localKey, cloudKey, userId, overridePermission);
    }).catch(err => {
        if (err && err.code === 42) {
            return localKey;
        }
        throw err;
    });
};

/**
 * @private
 * Handles key update flow based on permission settings.
 */
Keychain.prototype._updateKey = function (localKey, newKey, userId, overridePermission) {
    if (overridePermission) {
        return this._permissionGranted(localKey, newKey);
    }
    return this._requestPermission(userId, localKey, newKey);
};

/**
 * @private
 * Requests user permission before updating a key.
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
 * @private
 * Persists the new key after permission is granted.
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
        let pubkey = _.findWhere(allPubkeys, { userId });

        if (!pubkey) {
            for (const storedKey of allPubkeys) {
                const userIds = this._pgp.getKeyParams(storedKey.publicKey).userIds;
                const match = _.findWhere(userIds, { emailAddress: userId });
                if (match) {
                    pubkey = storedKey;
                    break;
                }
            }
        }

        if (pubkey && pubkey._id) {
            return pubkey;
        }

        return this._publicKeyDao.getByUserId(userId).then(this._onKeyReceived.bind(this)).catch(this._onKeyError.bind(this));
    });
};

/**
 * @private
 * Handles a cloud key that was received.
 */
Keychain.prototype._onKeyReceived = function (cloudPubkey) {
    if (!cloudPubkey) {
        return;
    }
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

/**
 * @private
 * Handles errors when fetching a key.
 */
Keychain.prototype._onKeyError = function (err) {
    if (err && err.code === 42) {
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
 * @private
 * Synchronizes a keypair from cloud to local storage.
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
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    if (!this._isValidKeypair(keypair)) {
        return new Promise(() => {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * @private
 * Validates a keypair object.
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
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    if (!this._isValidPublicKey(publicKey)) {
        return new Promise(() => {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }
    return this._publicKeyDao.put(publicKey);
};

/**
 * @private
 * Validates a public key object.
 */
Keychain.prototype._isValidPublicKey = function (publicKey) {
    return publicKey && publicKey.userId && publicKey.publicKey;
};

/**
 * Lookup a public key by id, fetching from cloud if missing.
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
        let cloudPubkey;
        return this._publicKeyDao.get(id).then(pub => {
            cloudPubkey = pub;
            return this.saveLocalPublicKey(cloudPubkey);
        }).then(() => cloudPubkey);
    });
};

/**
 * List all the locally stored public keys
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
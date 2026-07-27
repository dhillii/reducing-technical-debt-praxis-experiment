'use strict';

const ngModule = angular.module('woServices');
ngModule.service('keychain', Keychain);
module.exports = Keychain;

const DB_PUBLICKEY = 'publickey',
    DB_PRIVATEKEY = 'privatekey';

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

//
// Public key functions
//

/**
 * Display confirmation dialog to request a public key update
 * @param  {Object}   params.newKey   The user's updated public key object
 * @param  {String}   params.userId   The user's email address
 */
Keychain.prototype.requestPermissionForKeyUpdate = function(params, callback) {
    const str = this._appConfig.string;
    const message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
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
Keychain.prototype.verifyPublicKey = function(uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Checks for public key updates of a given user id
 * @param {String} options.userId The user id (email address) for which to check the key
 * @param {String} options.overridePermission (optional) Indicates if the update should happen automatically (true) or with the user being queried (false). Defaults to false
 */
Keychain.prototype.refreshKeyForUserId = function(options) {
    const self = this;
    const userId = options.userId;
    const overridePermission = options.overridePermission;

    return self.getReceiverPublicKey(userId)
        .then(localKey => self.checkKeyExists(localKey, overridePermission));
};

/**
 * Checks if the user's key has been revoked by looking up the key id
 * @param {Object} localKey The local public key
 * @param {Boolean} overridePermission Indicates if the update should happen automatically
 */
Keychain.prototype.checkKeyExists = function(localKey, overridePermission) {
    if (!localKey || !localKey._id) {
        // there is no key available, no need to refresh
        return;
    }
    // no need to refresh manually imported public keys
    if (localKey.imported) {
        return localKey;
    }
    return this._publicKeyDao.getByUserId(localKey.userId)
        .then(cloudKey => this.updateKey(localKey, cloudKey, overridePermission))
        .catch(err => {
            if (err && err.code === 42) {
                // we're offline, we're done checking the key
                return localKey;
            }
            throw err;
        });
};

/**
 * Updates the public key
 * @param {Object} localKey The local public key
 * @param {Object} newKey The new public key
 * @param {Boolean} overridePermission Indicates if the update should happen automatically
 */
Keychain.prototype.updateKey = function(localKey, newKey, overridePermission) {
    // the public key has changed, we need to ask for permission to update the key
    if (overridePermission) {
        // don't query the user, update the public key right away
        return this.permissionGranted(localKey, newKey);
    } else {
        return this.requestPermission(localKey, newKey);
    }
};

/**
 * Requests permission to update the public key
 * @param {Object} localKey The local public key
 * @param {Object} newKey The new public key
 */
Keychain.prototype.requestPermission = function(localKey, newKey) {
    return new Promise((resolve, reject) => {
        // query the user if the public key should be updated
        this.requestPermissionForKeyUpdate({
            userId: localKey.userId,
            newKey: newKey
        }, granted => {
            if (!granted) {
                // permission was not given to update the key, so don't overwrite the old one!
                resolve(localKey);
                return;
            }
            // permission was granted by the user
            this.permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Grants permission to update the public key
 * @param {Object} localKey The local public key
 * @param {Object} newKey The new public key
 */
Keychain.prototype.permissionGranted = function(localKey, newKey) {
    // permission to update the key was given, so delete the old one and persist the new one
    return this.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            // error or no new key to save
            return;
        }
        // persist the new key and return it
        return this.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId The receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    const self = this;

    // search local keyring for public key
    return self._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => self.findLocalPublicKey(allPubkeys, userId))
        .then(pubkey => {
            if (pubkey && pubkey._id) {
                // that user's public key is already in local storage
                return pubkey;
            }
            // no public key by that user id in storage
            // find from cloud by email address
            return self._publicKeyDao.getByUserId(userId).then(onKeyReceived).catch(onError);
        });

    function onKeyReceived(cloudPubkey) {
        if (!cloudPubkey) {
            // public key has been deleted without replacement
            return;
        }
        // persist and return cloud key
        return self.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
    }

    function onError(err) {
        if (err && err.code === 42) {
            // offline
            return;
        }
        throw err;
    }
};

/**
 * Finds the local public key
 * @param {Array} allPubkeys All public keys
 * @param {String} userId The user id
 */
Keychain.prototype.findLocalPublicKey = function(allPubkeys, userId) {
    const pubkey = _.findWhere(allPubkeys, {
        userId: userId
    });
    if (pubkey) {
        return pubkey;
    }
    for (const key of allPubkeys) {
        const userIds = this._pgp.getKeyParams(key.publicKey).userIds;
        const match = _.findWhere(userIds, {
            emailAddress: userId
        });
        if (match) {
            return key;
        }
    }
    return null;
};

//
// Keypair functions
//

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * return [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function(userId) {
    const self = this;

    // search for user's public key locally
    return self._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => self.findLocalPublicKey(allPubkeys, userId))
        .then(pubkey => {
            if (pubkey && pubkey._id && !pubkey.source) {
                // that user's public key is already in local storage...
                // sync keypair to the cloud
                return self.syncKeypair(pubkey._id);
            }

            // no public key by that user id in storage
            // find from cloud by email address
            return self._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
                if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                    // there is a public key for that user already in the cloud...
                    // sync keypair to local storage
                    return self.syncKeypair(cloudPubkey._id);
                }

                // continue without keypair... generate or import new keypair
            });
        });
};

/**
 * Syncs the keypair
 * @param {String} keypairId The keypair id
 */
Keychain.prototype.syncKeypair = function(keypairId) {
    return this.lookupPublicKey(keypairId)
        .then(pub => {
            const savedPubkey = pub;
            return this.lookupPrivateKey(keypairId);
        })
        .then(priv => {
            const savedPrivkey = priv;
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
 * @param [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    const self = this;

    // validate input
    if (!keypair || !keypair.publicKey || !keypair.privateKey || !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return new Promise((resolve, reject) => {
            reject(new Error('Cannot put user key pair: Incorrect input!'));
        });
    }

    // don't check the user's own public key for deletion in refreshKeyForUserId
    keypair.publicKey.imported = true;

    // store public key locally
    return self.saveLocalPublicKey(keypair.publicKey)
        .then(() => self._publicKeyDao.put(keypair.publicKey))
        .then(() => self.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    const self = this;

    // validate input
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return new Promise((resolve, reject) => {
            reject(new Error('Cannot upload user key pair: Incorrect input!'));
        });
    }

    return self._publicKeyDao.put(publicKey);
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function(id) {
    const self = this;

    if (!id) {
        return new Promise((resolve, reject) => {
            reject(new Error('ID must be set for public key query!'));
        });
    }

    // lookup in local storage
    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id)
        .then(pubkey => {
            if (pubkey) {
                return pubkey;
            }

            // fetch from cloud storage
            return self._publicKeyDao.get(id)
                .then(pub => {
                    const cloudPubkey = pub;
                    // cache public key in cache
                    return self.saveLocalPublicKey(cloudPubkey);
                })
                .then(() => cloudPubkey);
        });
};

/**
 * List all the locally stored public keys
 */
Keychain.prototype.listLocalPublicKeys = function() {
    // search local keyring for public key
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function(id) {
    return this._lawnchairDAO.remove(DB_PUBLICKEY + '_' + id);
};

Keychain.prototype.lookupPrivateKey = function(id) {
    // lookup in local storage
    return this._lawnchairDAO.read(DB_PRIVATEKEY + '_' + id);
};

Keychain.prototype.saveLocalPublicKey = function(pubkey) {
    // persist public key (email, _id)
    const pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    // persist private key (email, _id)
    const prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};
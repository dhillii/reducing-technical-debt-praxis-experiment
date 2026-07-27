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
        return;
    }

    if (localKey.imported) {
        return localKey;
    }

    return this._publicKeyDao.getByUserId(localKey.userId)
        .then(cloudKey => self.updateKey(localKey, cloudKey, overridePermission))
        .catch(err => {
            if (err && err.code === 42) {
                return localKey;
            }
            throw err;
        });
};

/**
 * Updates the public key
 * @param {Object} localKey The local public key
 * @param {Object} cloudKey The cloud public key
 * @param {Boolean} overridePermission Indicates if the update should happen automatically
 */
Keychain.prototype.updateKey = function(localKey, cloudKey, overridePermission) {
    if (overridePermission) {
        return this.permissionGranted(localKey, cloudKey);
    } else {
        return this.requestPermission(localKey, cloudKey);
    }
};

/**
 * Requests permission to update the public key
 * @param {Object} localKey The local public key
 * @param {Object} cloudKey The cloud public key
 */
Keychain.prototype.requestPermission = function(localKey, cloudKey) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({
            userId: localKey.userId,
            newKey: cloudKey
        }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this.permissionGranted(localKey, cloudKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Grants permission to update the public key
 * @param {Object} localKey The local public key
 * @param {Object} cloudKey The cloud public key
 */
Keychain.prototype.permissionGranted = function(localKey, cloudKey) {
    return this.removeLocalPublicKey(localKey._id)
        .then(() => {
            if (!cloudKey) {
                return;
            }
            return this.saveLocalPublicKey(cloudKey).then(() => cloudKey);
        });
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId The receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => self.findLocalPublicKey(allPubkeys, userId))
        .then(pubkey => {
            if (pubkey && pubkey._id) {
                return pubkey;
            }
            return self._publicKeyDao.getByUserId(userId)
                .then(cloudPubkey => self.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey))
                .catch(err => {
                    if (err && err.code === 42) {
                        return;
                    }
                    throw err;
                });
        });
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

    for (const pubkey of allPubkeys) {
        const userIds = this._pgp.getKeyParams(pubkey.publicKey).userIds;
        const match = _.findWhere(userIds, {
            emailAddress: userId
        });
        if (match) {
            return pubkey;
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

    return self._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => self.findUserPublicKey(allPubkeys, userId))
        .then(pubkey => {
            if (pubkey && pubkey._id && !pubkey.source) {
                return self.syncKeypair(pubkey._id);
            }

            return self._publicKeyDao.getByUserId(userId)
                .then(cloudPubkey => {
                    if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                        return self.syncKeypair(cloudPubkey._id);
                    }
                });
        });
};

/**
 * Finds the user public key
 * @param {Array} allPubkeys All public keys
 * @param {String} userId The user id
 */
Keychain.prototype.findUserPublicKey = function(allPubkeys, userId) {
    return _.findWhere(allPubkeys, {
        userId: userId
    });
};

/**
 * Syncs the key pair
 * @param {String} keypairId The key pair id
 */
Keychain.prototype.syncKeypair = function(keypairId) {
    return this.lookupPublicKey(keypairId)
        .then(pubkey => this.lookupPrivateKey(keypairId)
            .then(privkey => {
                const keys = {};

                if (pubkey && pubkey.publicKey) {
                    keys.publicKey = pubkey;
                }
                if (privkey && privkey.encryptedKey) {
                    keys.privateKey = privkey;
                }

                return keys;
            }));
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    const self = this;

    if (!keypair || !keypair.publicKey || !keypair.privateKey || !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

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

    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }

    return self._publicKeyDao.put(publicKey);
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function(id) {
    const self = this;

    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id)
        .then(pubkey => {
            if (pubkey) {
                return pubkey;
            }

            return self._publicKeyDao.get(id)
                .then(cloudPubkey => self.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey));
        });
};

/**
 * List all the locally stored public keys
 */
Keychain.prototype.listLocalPublicKeys = function() {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function(id) {
    return this._lawnchairDAO.remove(DB_PUBLICKEY + '_' + id);
};

Keychain.prototype.lookupPrivateKey = function(id) {
    return this._lawnchairDAO.read(DB_PRIVATEKEY + '_' + id);
};

Keychain.prototype.saveLocalPublicKey = function(pubkey) {
    const pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    const prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};